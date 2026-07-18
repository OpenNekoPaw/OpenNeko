import type { ResourceRef } from './resource-cache';
import {
  isRuntimeOnlyResourceIdentityValue,
  validateDurableResourceRef,
  type DurableResourceRefDiagnostic,
} from './durable-resource-ref';

export const MEDIA_QUALITY_CONTRACT_VERSION = 1 as const;

export const QUALITY_TARGET_KINDS = [
  'image',
  'video-clip',
  'audio',
  'storyboard',
  'cross-shot-consistency',
  'timeline-final-cut',
  'project-artifact',
  'exported-deliverable',
] as const;

export const QUALITY_EVALUATOR_CLASSES = [
  'structural',
  'technical',
  'perception',
  'policy',
] as const;

export type QualityTargetKind = (typeof QUALITY_TARGET_KINDS)[number];
export type QualityEvaluatorClass = (typeof QUALITY_EVALUATOR_CLASSES)[number];
export type QualityIssueSeverity = 'info' | 'warning' | 'error' | 'critical';
export type QualityGateVerdict = 'pass' | 'fail' | 'manual-review';
export type QualityEvidenceState = 'current' | 'stale';

export interface MediaTimeRange {
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface QualityProjectRef {
  readonly domain: 'canvas' | 'cut' | 'audio';
  readonly documentUri: string;
  readonly projectRevision: string;
  readonly contentDigest?: string;
}

export interface QualityLineageRef {
  readonly relation:
    'source' | 'generated-from' | 'derived-from' | 'projected-from' | 'exported-from' | 'reference';
  readonly resourceRef?: ResourceRef;
  readonly projectRef?: QualityProjectRef;
  readonly revision?: string;
}

export interface QualityTarget {
  readonly version: typeof MEDIA_QUALITY_CONTRACT_VERSION;
  readonly targetId: string;
  readonly kind: QualityTargetKind;
  readonly resourceRef?: ResourceRef;
  readonly projectRef?: QualityProjectRef;
  readonly revision?: string;
  readonly contentDigest?: string;
  readonly mediaRange?: MediaTimeRange;
  readonly expectedIntent?: Readonly<Record<string, unknown>>;
  readonly lineage?: readonly QualityLineageRef[];
}

export interface QualityEvidenceLocation {
  readonly mediaRange?: MediaTimeRange;
  readonly frameIndex?: number;
  readonly region?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly sceneId?: string;
  readonly shotId?: string;
  readonly trackId?: string;
  readonly fieldPath?: readonly (string | number)[];
}

export interface QualityIssue {
  readonly id: string;
  readonly category: string;
  readonly severity: QualityIssueSeverity;
  readonly message: string;
  readonly location?: QualityEvidenceLocation;
  readonly confidence?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type QualityGateIssue = QualityIssue;

export interface QualityCoverage {
  readonly mode: 'complete' | 'sampled' | 'bounded-range' | 'structural-only';
  readonly mediaRange?: MediaTimeRange;
  readonly sampledFrames?: readonly number[];
  readonly sampleCount?: number;
  readonly totalCandidateCount?: number;
  readonly description?: string;
}

export interface QualityMetric {
  readonly id: string;
  readonly value: number | string | boolean;
  readonly unit?: string;
  readonly threshold?: number | string | boolean;
  readonly passed?: boolean;
}

export interface QualityEvaluatorIdentity {
  readonly id: string;
  readonly version: string;
  readonly evaluatorClass: QualityEvaluatorClass;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface QualityEvidenceLineage {
  readonly relation: 'content-identical-promotion';
  readonly sourceEvidenceId: string;
  readonly promotionId: string;
}

export interface QualityEvidence {
  readonly version: typeof MEDIA_QUALITY_CONTRACT_VERSION;
  readonly evidenceId: string;
  readonly evaluator: QualityEvaluatorIdentity;
  readonly target: QualityTarget;
  readonly state: QualityEvidenceState;
  readonly metrics: readonly QualityMetric[];
  readonly issues: readonly QualityIssue[];
  readonly coverage: QualityCoverage;
  readonly confidence?: number;
  readonly createdAt: string;
  readonly sourceEvidenceRefs: readonly ResourceRef[];
  readonly evidenceLineage?: QualityEvidenceLineage;
}

export interface QualityGatePolicy {
  readonly version: typeof MEDIA_QUALITY_CONTRACT_VERSION;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly requiredProfiles: readonly string[];
  readonly requiredEvaluatorClasses: readonly QualityEvaluatorClass[];
  readonly blockingSeverities: readonly QualityIssueSeverity[];
  readonly minimumConfidence?: number;
  readonly allowManualReview: boolean;
  readonly allowManualOverride?: boolean;
  readonly requireCurrentEvidence: boolean;
}

export interface QualityRepairAction {
  readonly owner:
    'storyboard' | 'image' | 'video' | 'audio' | 'canvas' | 'cut' | 'project' | 'export';
  readonly targetId: string;
  readonly issueIds: readonly string[];
  readonly instruction: string;
}

export interface QualityRepairPlan {
  readonly planId: string;
  readonly actions: readonly QualityRepairAction[];
  readonly requiresNewRevision: boolean;
}

export interface QualityGateResult {
  readonly version: typeof MEDIA_QUALITY_CONTRACT_VERSION;
  readonly gateResultId: string;
  readonly target: QualityTarget;
  readonly policy: Pick<QualityGatePolicy, 'policyId' | 'policyVersion' | 'requiredProfiles'>;
  readonly verdict: QualityGateVerdict;
  readonly evidenceIds: readonly string[];
  readonly staleEvidenceIds: readonly string[];
  readonly missingEvaluatorClasses: readonly QualityEvaluatorClass[];
  readonly diagnostics: readonly QualityDiagnostic[];
  readonly repairPlan?: QualityRepairPlan;
  readonly createdAt: string;
}

export interface QualityDiagnostic {
  readonly code:
    | 'invalid-quality-target'
    | 'legacy-path-target-rejected'
    | 'invalid-quality-evidence'
    | 'stale-quality-evidence'
    | 'invalid-quality-gate-result'
    | 'missing-required-evaluator'
    | 'quality-evaluator-failed'
    | 'partial-quality-coverage'
    | 'quality-policy-manual-review'
    | 'quality-repair-not-approved'
    | 'quality-repair-limit-exceeded'
    | 'quality-repair-lineage-invalid'
    | DurableResourceRefDiagnostic['code'];
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export interface QualityValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export function validateQualityTarget(target: QualityTarget): QualityValidationResult {
  const diagnostics: QualityDiagnostic[] = [];
  if (
    target.version !== MEDIA_QUALITY_CONTRACT_VERSION ||
    !target.targetId.trim() ||
    !QUALITY_TARGET_KINDS.some((kind) => kind === target.kind)
  ) {
    diagnostics.push({
      code: 'invalid-quality-target',
      severity: 'error',
      message: 'QualityTarget has an unsupported version, kind, or empty target id.',
    });
  }
  if ((target.resourceRef ? 1 : 0) + (target.projectRef ? 1 : 0) !== 1) {
    diagnostics.push({
      code: 'invalid-quality-target',
      severity: 'error',
      message: 'QualityTarget requires exactly one stable resourceRef or projectRef.',
      path: ['resourceRef'],
    });
  }
  if (!target.revision && !target.contentDigest && !target.projectRef?.projectRevision) {
    diagnostics.push({
      code: 'invalid-quality-target',
      severity: 'error',
      message: 'QualityTarget requires a revision or content digest.',
      path: ['revision'],
    });
  }
  if (target.resourceRef) {
    diagnostics.push(
      ...validateDurableResourceRef(target.resourceRef, ['resourceRef']).diagnostics,
    );
  }
  if (target.projectRef) validateProjectRef(target.projectRef, diagnostics, ['projectRef']);
  validateMediaRange(target.mediaRange, diagnostics, ['mediaRange']);
  target.lineage?.forEach((lineage, index) => {
    if ((lineage.resourceRef ? 1 : 0) + (lineage.projectRef ? 1 : 0) !== 1) {
      diagnostics.push({
        code: 'invalid-quality-target',
        severity: 'error',
        message: 'Each lineage entry requires exactly one resourceRef or projectRef.',
        path: ['lineage', index],
      });
    }
    if (lineage.resourceRef) {
      diagnostics.push(
        ...validateDurableResourceRef(lineage.resourceRef, ['lineage', index, 'resourceRef'])
          .diagnostics,
      );
    }
    if (lineage.projectRef)
      validateProjectRef(lineage.projectRef, diagnostics, ['lineage', index, 'projectRef']);
  });
  return { ok: !diagnostics.some((item) => item.severity === 'error'), diagnostics };
}

export function validateQualityEvidence(
  evidence: QualityEvidence,
  currentTarget?: QualityTarget,
): QualityValidationResult {
  const diagnostics: QualityDiagnostic[] = [...validateQualityTarget(evidence.target).diagnostics];
  if (
    evidence.version !== MEDIA_QUALITY_CONTRACT_VERSION ||
    !evidence.evidenceId.trim() ||
    !evidence.evaluator.id.trim() ||
    !evidence.evaluator.version.trim() ||
    !QUALITY_EVALUATOR_CLASSES.some((kind) => kind === evidence.evaluator.evaluatorClass) ||
    !isIsoTimestamp(evidence.createdAt)
  ) {
    diagnostics.push({
      code: 'invalid-quality-evidence',
      severity: 'error',
      message: 'QualityEvidence has invalid identity, evaluator, version, or creation time.',
    });
  }
  if (evidence.confidence !== undefined && !isProbability(evidence.confidence)) {
    diagnostics.push({
      code: 'invalid-quality-evidence',
      severity: 'error',
      message: 'Evidence confidence must be between 0 and 1.',
      path: ['confidence'],
    });
  }
  evidence.issues.forEach((issue, index) => {
    if (!issue.id.trim() || !issue.category.trim() || !issue.message.trim()) {
      diagnostics.push({
        code: 'invalid-quality-evidence',
        severity: 'error',
        message: 'Quality issues require id, category, and message.',
        path: ['issues', index],
      });
    }
    if (issue.confidence !== undefined && !isProbability(issue.confidence)) {
      diagnostics.push({
        code: 'invalid-quality-evidence',
        severity: 'error',
        message: 'Issue confidence must be between 0 and 1.',
        path: ['issues', index, 'confidence'],
      });
    }
    validateMediaRange(issue.location?.mediaRange, diagnostics, [
      'issues',
      index,
      'location',
      'mediaRange',
    ]);
  });
  if (
    evidence.evidenceLineage &&
    (!evidence.evidenceLineage.sourceEvidenceId.trim() ||
      !evidence.evidenceLineage.promotionId.trim())
  ) {
    diagnostics.push({
      code: 'invalid-quality-evidence',
      severity: 'error',
      message: 'Transferred QualityEvidence requires source evidence and promotion identity.',
      path: ['evidenceLineage'],
    });
  }
  evidence.sourceEvidenceRefs.forEach((ref, index) => {
    diagnostics.push(...validateDurableResourceRef(ref, ['sourceEvidenceRefs', index]).diagnostics);
  });
  const stale = currentTarget
    ? !qualityTargetsMatch(evidence.target, currentTarget)
    : evidence.state === 'stale';
  if (stale) {
    diagnostics.push({
      code: 'stale-quality-evidence',
      severity: 'error',
      message: 'QualityEvidence is stale for the current target revision or digest.',
      path: ['target'],
    });
  }
  return { ok: !diagnostics.some((item) => item.severity === 'error'), diagnostics };
}

export function validateQualityGateResult(result: QualityGateResult): QualityValidationResult {
  const diagnostics: QualityDiagnostic[] = [...validateQualityTarget(result.target).diagnostics];
  if (
    result.version !== MEDIA_QUALITY_CONTRACT_VERSION ||
    !result.gateResultId.trim() ||
    !result.policy.policyId.trim() ||
    !result.policy.policyVersion.trim() ||
    !isIsoTimestamp(result.createdAt)
  ) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'QualityGateResult has invalid identity, policy, version, or creation time.',
    });
  }
  if (
    result.verdict === 'pass' &&
    (result.staleEvidenceIds.length > 0 || result.missingEvaluatorClasses.length > 0)
  ) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'A passing Gate cannot contain stale evidence or missing required evaluators.',
    });
  }
  if (result.verdict === 'fail' && !result.repairPlan && result.diagnostics.length === 0) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'A failed Gate requires diagnostics or a repair plan.',
    });
  }
  return { ok: !diagnostics.some((item) => item.severity === 'error'), diagnostics };
}

export function qualityTargetsMatch(left: QualityTarget, right: QualityTarget): boolean {
  return (
    left.targetId === right.targetId &&
    left.kind === right.kind &&
    (left.revision ?? left.projectRef?.projectRevision) ===
      (right.revision ?? right.projectRef?.projectRevision) &&
    left.contentDigest === right.contentDigest &&
    left.resourceRef?.id === right.resourceRef?.id &&
    left.projectRef?.documentUri === right.projectRef?.documentUri
  );
}

function validateProjectRef(
  ref: QualityProjectRef,
  diagnostics: QualityDiagnostic[],
  path: readonly (string | number)[],
): void {
  if (!ref.documentUri.trim() || !ref.projectRevision.trim()) {
    diagnostics.push({
      code: 'invalid-quality-target',
      severity: 'error',
      message: 'Project quality references require documentUri and projectRevision.',
      path,
    });
  }
  if (isRuntimeOnlyResourceIdentityValue(ref.documentUri)) {
    diagnostics.push({
      code: 'runtime-resource-identity',
      severity: 'error',
      message: 'Project quality reference cannot use a cache, render, Webview, or session URI.',
      path: [...path, 'documentUri'],
    });
  }
}

function validateMediaRange(
  range: MediaTimeRange | undefined,
  diagnostics: QualityDiagnostic[],
  path: readonly (string | number)[],
): void {
  if (
    range &&
    (!Number.isFinite(range.startSeconds) ||
      !Number.isFinite(range.endSeconds) ||
      range.startSeconds < 0 ||
      range.endSeconds <= range.startSeconds)
  ) {
    diagnostics.push({
      code: 'invalid-quality-target',
      severity: 'error',
      message: 'Media ranges require finite non-negative start and end greater than start.',
      path,
    });
  }
}

function isProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isIsoTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
