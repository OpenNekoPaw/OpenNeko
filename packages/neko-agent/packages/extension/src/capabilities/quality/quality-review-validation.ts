import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  QUALITY_EVALUATOR_CLASSES,
  QUALITY_TARGET_KINDS,
  isResourceRef,
  validateQualityGateResult,
  type AgentToolResultFeedbackAdapter as AgentToolResultValidationAdapter,
  type AgentToolResultFeedbackAdapterInput as AgentToolResultValidationAdapterInput,
  type AgentToolReviewFeedbackSignal as AgentToolReviewValidationSignal,
  type PerceptionEvidence,
  type QualityDiagnostic,
  type QualityGateResult,
  type QualityGateVerdict,
} from '@neko/shared';

export interface QualityReviewEvidenceInput {
  readonly gateResult: QualityGateResult;
  readonly toolCallId: string;
  readonly observedAt: number;
  readonly locale?: string;
  readonly runId?: string;
  readonly observationId?: string;
  readonly contractDiagnostics?: readonly QualityDiagnostic[];
}

export interface QualityReviewEvidenceSummary {
  readonly verdict: QualityGateVerdict;
  readonly effectiveVerdict: QualityGateVerdict;
  readonly targetId: string;
  readonly targetKind: QualityGateResult['target']['kind'];
  readonly evidenceCount: number;
  readonly staleEvidenceCount: number;
  readonly missingEvaluatorClasses: QualityGateResult['missingEvaluatorClasses'];
  readonly diagnosticCount: number;
  readonly repairActionCount: number;
  readonly contractValid: boolean;
}

export interface QualityReviewEvidenceResult {
  readonly evidence: PerceptionEvidence;
  readonly summary: QualityReviewEvidenceSummary;
}

export function createQualityReviewValidationAdapter(): AgentToolResultValidationAdapter {
  return {
    id: 'quality-review-validation',
    createSignal: createQualityReviewValidationSignal,
  };
}

export function createQualityReviewValidationSignal(
  input: AgentToolResultValidationAdapterInput,
): AgentToolReviewValidationSignal | null {
  if (
    input.toolName !== 'QualityCheck' ||
    !input.result.success ||
    !isCanonicalQualityGateResult(input.result.data)
  ) {
    return null;
  }

  const validation = validateQualityGateResult(input.result.data);
  const review = createQualityReviewEvidence({
    gateResult: input.result.data,
    toolCallId: input.toolCallId,
    observedAt: input.observedAt,
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(validation.diagnostics.length > 0 ? { contractDiagnostics: validation.diagnostics } : {}),
  });

  return createToolReviewSignal(input, review);
}

export function createQualityReviewEvidence(
  input: QualityReviewEvidenceInput,
): QualityReviewEvidenceResult {
  const contractDiagnostics = input.contractDiagnostics ?? [];
  const contractValid = !contractDiagnostics.some((item) => item.severity === 'error');
  const effectiveVerdict = contractValid ? input.gateResult.verdict : 'fail';
  const summary: QualityReviewEvidenceSummary = {
    verdict: input.gateResult.verdict,
    effectiveVerdict,
    targetId: input.gateResult.target.targetId,
    targetKind: input.gateResult.target.kind,
    evidenceCount: input.gateResult.evidenceIds.length,
    staleEvidenceCount: input.gateResult.staleEvidenceIds.length,
    missingEvaluatorClasses: input.gateResult.missingEvaluatorClasses,
    diagnosticCount: input.gateResult.diagnostics.length + contractDiagnostics.length,
    repairActionCount: input.gateResult.repairPlan?.actions.length ?? 0,
    contractValid,
  };

  const evidence: PerceptionEvidence = {
    id: `quality-gate:${input.runId ?? 'runless'}:${input.toolCallId}`,
    source: 'tool',
    summary: formatQualityGateSummary(summary, input.locale),
    confidence: qualityGateConfidence(summary),
    toolName: 'QualityCheck',
    ...(input.observationId ? { observationId: input.observationId } : {}),
    data: {
      kind: 'quality-gate',
      toolCallId: input.toolCallId,
      ...(input.runId ? { runId: input.runId } : {}),
      qualityGateResult: input.gateResult,
      ...(contractDiagnostics.length > 0 ? { contractDiagnostics } : {}),
    },
    createdAt: input.observedAt,
    status: 'active',
  };

  return { evidence, summary };
}

function createToolReviewSignal(
  input: AgentToolResultValidationAdapterInput,
  review: QualityReviewEvidenceResult,
): AgentToolReviewValidationSignal {
  const status = review.summary.effectiveVerdict === 'pass' ? 'passed' : 'failed';
  const locale = normalizeQualityReviewLocale(input.locale);
  const gateResult = review.evidence.data;

  return {
    kind: 'tool-review',
    observedAt: input.observedAt,
    toolCallId: input.toolCallId,
    toolName: 'QualityCheck',
    status,
    summary: review.evidence.summary,
    ...(status === 'failed'
      ? {
          repairGuidance: createQualityGateGuidance(review.summary, gateResult, locale),
          escalationMessage: createQualityGateEscalation(review.summary, input.runId, locale),
          repeatKey: `quality-gate:${input.runId ?? 'runless'}:${review.summary.targetId}`,
        }
      : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    evidence: review.evidence,
    metadata: {
      verdict: review.summary.verdict,
      effectiveVerdict: review.summary.effectiveVerdict,
      targetId: review.summary.targetId,
      targetKind: review.summary.targetKind,
      evidenceCount: review.summary.evidenceCount,
      staleEvidenceCount: review.summary.staleEvidenceCount,
      missingEvaluatorClasses: [...review.summary.missingEvaluatorClasses],
      diagnosticCount: review.summary.diagnosticCount,
      repairActionCount: review.summary.repairActionCount,
      contractValid: review.summary.contractValid,
    },
  };
}

function createQualityGateGuidance(
  summary: QualityReviewEvidenceSummary,
  evidenceData: unknown,
  locale: QualityReviewLocale,
): string {
  const gateResult = readGateResultFromEvidenceData(evidenceData);
  if (!summary.contractValid) {
    return locale === 'zh'
      ? '拒绝此无效的质量 Gate 结果；修复 QualityGateResult 契约后重新运行 QualityCheck。'
      : 'Reject this invalid quality Gate result; repair the QualityGateResult contract and rerun QualityCheck.';
  }

  if (summary.effectiveVerdict === 'manual-review') {
    const missing = formatMissingEvaluators(summary.missingEvaluatorClasses, locale);
    return locale === 'zh'
      ? `完成策略要求的人工审查${missing}，在获得明确批准前不得将 Gate 视为通过。`
      : `Complete the policy-required manual review${missing}; do not treat the Gate as passed without explicit approval.`;
  }

  const actions = gateResult?.repairPlan?.actions ?? [];
  if (actions.length > 0) {
    const instructions = actions.map((action) => action.instruction).join(' ');
    return locale === 'zh'
      ? `由所属能力按修复计划处理目标 ${summary.targetId}，创建新 revision，使旧证据失效，然后重新运行 QualityCheck。计划：${instructions}`
      : `Use the owning capability to repair target ${summary.targetId}, create a new revision, invalidate prior evidence, and rerun QualityCheck. Plan: ${instructions}`;
  }

  const diagnostics = gateResult?.diagnostics.map((item) => item.message).join(' ') ?? '';
  return locale === 'zh'
    ? `解决目标 ${summary.targetId} 的阻断诊断，然后重新运行 QualityCheck。${diagnostics}`
    : `Resolve the blocking diagnostics for target ${summary.targetId}, then rerun QualityCheck. ${diagnostics}`;
}

function createQualityGateEscalation(
  summary: QualityReviewEvidenceSummary,
  runId: string | undefined,
  locale: QualityReviewLocale,
): string {
  if (summary.effectiveVerdict === 'manual-review') {
    return locale === 'zh'
      ? `运行 ${runId ?? 'unknown-run'} 需要人工质量判定；请请求明确批准或补齐缺失评估证据。`
      : `Run ${runId ?? 'unknown-run'} requires a human quality decision; request explicit approval or obtain the missing evaluator evidence.`;
  }
  return locale === 'zh'
    ? `运行 ${runId ?? 'unknown-run'} 的质量 Gate 未通过；不要绕过 Gate 或复用旧 revision 的证据。`
    : `The quality Gate failed for run ${runId ?? 'unknown-run'}; do not bypass the Gate or reuse evidence from the prior revision.`;
}

function formatQualityGateSummary(
  summary: QualityReviewEvidenceSummary,
  locale: string | undefined,
): string {
  const normalizedLocale = normalizeQualityReviewLocale(locale);
  if (!summary.contractValid) {
    return normalizedLocale === 'zh'
      ? `目标 ${summary.targetId} 的 QualityGateResult 契约无效，不能判定为通过。`
      : `QualityGateResult for target ${summary.targetId} is invalid and cannot pass.`;
  }

  if (summary.effectiveVerdict === 'pass') {
    return normalizedLocale === 'zh'
      ? `目标 ${summary.targetId} 的质量 Gate 已通过，使用 ${summary.evidenceCount} 条当前证据。`
      : `Quality Gate passed for target ${summary.targetId} with ${summary.evidenceCount} current evidence item(s).`;
  }

  if (summary.effectiveVerdict === 'manual-review') {
    const missing = formatMissingEvaluators(summary.missingEvaluatorClasses, normalizedLocale);
    return normalizedLocale === 'zh'
      ? `目标 ${summary.targetId} 的质量 Gate 需要人工审查${missing}。`
      : `Quality Gate requires manual review for target ${summary.targetId}${missing}.`;
  }

  return normalizedLocale === 'zh'
    ? `目标 ${summary.targetId} 的质量 Gate 未通过：${summary.staleEvidenceCount} 条过期证据，${summary.diagnosticCount} 条诊断，${summary.repairActionCount} 个修复动作。`
    : `Quality Gate failed for target ${summary.targetId}: ${summary.staleEvidenceCount} stale evidence item(s), ${summary.diagnosticCount} diagnostic(s), and ${summary.repairActionCount} repair action(s).`;
}

function formatMissingEvaluators(
  missingEvaluatorClasses: QualityGateResult['missingEvaluatorClasses'],
  locale: QualityReviewLocale,
): string {
  if (missingEvaluatorClasses.length === 0) return '';
  const names = missingEvaluatorClasses.join(', ');
  return locale === 'zh' ? `（缺少评估器：${names}）` : ` (missing evaluator classes: ${names})`;
}

function qualityGateConfidence(summary: QualityReviewEvidenceSummary): number {
  if (!summary.contractValid || summary.effectiveVerdict === 'fail') return 0;
  if (summary.effectiveVerdict === 'manual-review') return 0.5;
  return 1;
}

type QualityReviewLocale = 'en' | 'zh';

function normalizeQualityReviewLocale(locale: string | undefined): QualityReviewLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function readGateResultFromEvidenceData(value: unknown): QualityGateResult | null {
  if (!isRecord(value)) return null;
  const gateResult = value['qualityGateResult'];
  return isCanonicalQualityGateResult(gateResult) ? gateResult : null;
}

function isCanonicalQualityGateResult(value: unknown): value is QualityGateResult {
  if (!isRecord(value) || !isRecord(value['target']) || !isRecord(value['policy'])) return false;
  const target = value['target'];
  const policy = value['policy'];
  const repairPlan = value['repairPlan'];

  return (
    value['version'] === MEDIA_QUALITY_CONTRACT_VERSION &&
    typeof value['gateResultId'] === 'string' &&
    isQualityGateVerdict(value['verdict']) &&
    Array.isArray(value['evidenceIds']) &&
    value['evidenceIds'].every((item) => typeof item === 'string') &&
    Array.isArray(value['staleEvidenceIds']) &&
    value['staleEvidenceIds'].every((item) => typeof item === 'string') &&
    Array.isArray(value['missingEvaluatorClasses']) &&
    value['missingEvaluatorClasses'].every(isQualityEvaluatorClass) &&
    Array.isArray(value['diagnostics']) &&
    value['diagnostics'].every(isQualityDiagnostic) &&
    typeof value['createdAt'] === 'string' &&
    isQualityTargetLike(target) &&
    typeof policy['policyId'] === 'string' &&
    typeof policy['policyVersion'] === 'string' &&
    Array.isArray(policy['requiredProfiles']) &&
    policy['requiredProfiles'].every((item) => typeof item === 'string') &&
    (repairPlan === undefined || isQualityRepairPlanLike(repairPlan))
  );
}

function isQualityTargetLike(value: Record<string, unknown>): boolean {
  const hasResourceRef = value['resourceRef'] !== undefined;
  const hasProjectRef = value['projectRef'] !== undefined;
  return (
    value['version'] === MEDIA_QUALITY_CONTRACT_VERSION &&
    typeof value['targetId'] === 'string' &&
    typeof value['kind'] === 'string' &&
    QUALITY_TARGET_KINDS.some((kind) => kind === value['kind']) &&
    hasResourceRef !== hasProjectRef &&
    (!hasResourceRef || isResourceRef(value['resourceRef'])) &&
    (!hasProjectRef || isQualityProjectRefLike(value['projectRef'])) &&
    (value['revision'] === undefined || typeof value['revision'] === 'string') &&
    (value['contentDigest'] === undefined || typeof value['contentDigest'] === 'string') &&
    (value['mediaRange'] === undefined || isMediaRangeLike(value['mediaRange'])) &&
    (value['expectedIntent'] === undefined || isRecord(value['expectedIntent'])) &&
    (value['lineage'] === undefined ||
      (Array.isArray(value['lineage']) && value['lineage'].every(isQualityLineageRefLike)))
  );
}

function isQualityProjectRefLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    isQualityProjectDomain(value['domain']) &&
    typeof value['documentUri'] === 'string' &&
    typeof value['projectRevision'] === 'string' &&
    (value['contentDigest'] === undefined || typeof value['contentDigest'] === 'string')
  );
}

function isQualityLineageRefLike(value: unknown): boolean {
  if (!isRecord(value) || typeof value['relation'] !== 'string') return false;
  const hasResourceRef = value['resourceRef'] !== undefined;
  const hasProjectRef = value['projectRef'] !== undefined;
  return (
    hasResourceRef !== hasProjectRef &&
    (!hasResourceRef || isResourceRef(value['resourceRef'])) &&
    (!hasProjectRef || isQualityProjectRefLike(value['projectRef'])) &&
    (value['revision'] === undefined || typeof value['revision'] === 'string')
  );
}

function isMediaRangeLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['startSeconds'] === 'number' &&
    typeof value['endSeconds'] === 'number'
  );
}

function isQualityProjectDomain(value: unknown): boolean {
  return (
    value === 'sketch' ||
    value === 'canvas' ||
    value === 'cut' ||
    value === 'audio' ||
    value === 'model' ||
    value === 'puppet' ||
    value === 'story'
  );
}

function isQualityRepairPlanLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['planId'] === 'string' &&
    typeof value['requiresNewRevision'] === 'boolean' &&
    Array.isArray(value['actions']) &&
    value['actions'].every(
      (action) =>
        isRecord(action) &&
        typeof action['owner'] === 'string' &&
        typeof action['targetId'] === 'string' &&
        Array.isArray(action['issueIds']) &&
        action['issueIds'].every((item) => typeof item === 'string') &&
        typeof action['instruction'] === 'string',
    )
  );
}

function isQualityDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    typeof value['message'] === 'string'
  );
}

function isQualityGateVerdict(value: unknown): value is QualityGateVerdict {
  return value === 'pass' || value === 'fail' || value === 'manual-review';
}

function isQualityEvaluatorClass(
  value: unknown,
): value is QualityGateResult['missingEvaluatorClasses'][number] {
  return QUALITY_EVALUATOR_CLASSES.some((evaluatorClass) => evaluatorClass === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
