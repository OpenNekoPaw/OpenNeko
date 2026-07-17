import {
  validateEvidence,
  validateFailureAttribution,
  validateJudgeResult,
  validateResult,
} from '../schemas/contracts.mjs';
import {
  OPTIMIZATION_SCHEMAS,
  assertOptimizationArtifactSafe,
  validateOptimizationHandoff,
  validateOptimizationIntake,
} from '../schemas/optimization-contracts.mjs';

const MIN_OWNER_CONFIDENCE = 0.75;
const MIN_ROUTING_CONFIDENCE = 0.9;

export function createOptimizationIntake(input) {
  const result = validateResult(input.result);
  const evidence = validateEvidence(input.evidence);
  const attribution = validateFailureAttribution(input.failureAttribution);
  const judge = input.judge ? validateJudgeResult(input.judge) : undefined;
  assertSameReportId(result.reportId, evidence.reportId, 'evidence');
  assertSameReportId(result.reportId, attribution.reportId, 'failure attribution');
  if (judge) assertSameReportId(result.reportId, judge.reportId, 'Judge result');
  if (result.outcome === 'pass') {
    throw intakeError(
      'optimization-report-not-failed',
      'Optimization intake requires a failed, regressed, or non-comparable report',
    );
  }
  const authorizedRefs = new Set([
    ...evidence.items.map((item) => item.ref),
    ...result.assertions.flatMap((assertion) => assertion.evidenceRefs),
    ...result.artifactRefs,
  ]);
  const referenced = [
    ...attribution.observedFailures.flatMap((failure) => failure.evidenceRefs),
    ...attribution.hypotheses.flatMap((hypothesis) => hypothesis.evidenceRefs),
  ];
  const unauthorized = referenced.filter((ref) => !authorizedRefs.has(ref));
  if (unauthorized.length > 0) {
    throw intakeError(
      'optimization-evidence-missing',
      `Optimization attribution references unavailable evidence: ${[...new Set(unauthorized)].join(', ')}`,
    );
  }
  const incompleteEvidenceRefs = evidence.items
    .filter((item) => item.complete !== true || (item.droppedCount ?? 0) > 0)
    .map((item) => item.ref);
  const intake = {
    schema: OPTIMIZATION_SCHEMAS.intake,
    reportId: result.reportId,
    suiteId: result.suiteId,
    caseId: result.caseId,
    outcome: result.outcome,
    target: result.target,
    modelIdentity: {
      providerId: result.modelIdentity.providerId,
      modelId: result.modelIdentity.modelId,
    },
    ...(typeof result.effectiveConfiguration.digest === 'string'
      ? { effectiveConfigurationDigest: result.effectiveConfiguration.digest }
      : {}),
    evidenceProjection: evidence.items.map((item) => ({
      ref: item.ref,
      kind: item.kind,
      source: item.source,
      summary: item.summary,
      complete: item.complete,
      ...(item.digest ? { digest: item.digest } : {}),
      ...(item.droppedCount !== undefined ? { droppedCount: item.droppedCount } : {}),
    })),
    observedFailures: attribution.observedFailures,
    hypotheses: attribution.hypotheses,
    rubricDimensions:
      judge?.criteria.map((criterion) => ({
        id: criterion.criterionId,
        score: criterion.score,
        evidenceRefs: criterion.evidenceRefs,
        uncertainty: criterion.uncertainty,
      })) ?? [],
    hardGateFailures: result.assertions
      .filter((assertion) => assertion.status !== 'pass')
      .map((assertion) => ({
        id: assertion.id,
        status: assertion.status,
        evidenceRefs: assertion.evidenceRefs,
      })),
    incompleteEvidenceRefs,
    residualRisk: result.residualRisk,
  };
  return validateOptimizationIntake(intake);
}

export function routeOptimizationOwnership(intakeInput, proposedTarget, options = {}) {
  const intake = validateOptimizationIntake(intakeInput);
  assertOptimizationArtifactSafe(proposedTarget, 'proposedOptimizationTarget');
  const ranked = [...intake.hypotheses].sort((left, right) => right.confidence - left.confidence);
  const primary = ranked[0];
  if (!primary) {
    return createHandoff(
      intake,
      undefined,
      'blocked',
      'evaluation-infrastructure',
      'No ownership hypothesis is available.',
    );
  }
  const competing = ranked.find(
    (item) =>
      item !== primary &&
      item.suspectedOwner !== primary.suspectedOwner &&
      Math.abs(item.confidence - primary.confidence) < 0.1,
  );
  if (competing) {
    return createHandoff(
      intake,
      primary,
      'blocked',
      canonicalHandoffOwner(primary.suspectedOwner),
      `Ownership is ambiguous between ${primary.suspectedOwner} and ${competing.suspectedOwner}.`,
    );
  }
  if (intake.incompleteEvidenceRefs.length > 0) {
    return createHandoff(
      intake,
      primary,
      'blocked',
      'evaluation-infrastructure',
      `Required evidence is incomplete: ${intake.incompleteEvidenceRefs.join(', ')}.`,
    );
  }
  if (['infrastructure-fail', 'configuration-invalid'].includes(intake.outcome)) {
    return createHandoff(
      intake,
      primary,
      'blocked',
      canonicalHandoffOwner(primary.suspectedOwner),
      `Report outcome ${intake.outcome} cannot authorize a content candidate.`,
    );
  }
  if (!['skill-content', 'prompt', 'routing'].includes(primary.suspectedOwner)) {
    return createHandoff(
      intake,
      primary,
      'handoff',
      canonicalHandoffOwner(primary.suspectedOwner),
      'The confirmed owner is outside Prompt/Skill content.',
    );
  }
  if (primary.confidence < MIN_OWNER_CONFIDENCE) {
    return createHandoff(
      intake,
      primary,
      'blocked',
      'runtime-session',
      `Ownership confidence ${primary.confidence.toFixed(2)} is below ${MIN_OWNER_CONFIDENCE.toFixed(2)}.`,
    );
  }
  const expectedKinds = {
    'skill-content': new Set(['skill-content', 'skill-description']),
    prompt: new Set(['prompt-guidance']),
    routing: new Set(['prompt-routing']),
  }[primary.suspectedOwner];
  if (!expectedKinds.has(proposedTarget.kind)) {
    return createHandoff(
      intake,
      primary,
      'handoff',
      primary.suspectedOwner === 'routing' ? 'runtime-session' : 'evaluation-infrastructure',
      `Owner ${primary.suspectedOwner} cannot authorize target ${String(proposedTarget.kind)}.`,
    );
  }
  assertTargetMatchesReport(intake, proposedTarget);
  if (primary.suspectedOwner === 'routing') {
    const confirmations = options.routingConfirmationEvidenceRefs ?? [];
    const available = new Set([
      ...intake.evidenceProjection.map((item) => item.ref),
      ...intake.hypotheses.flatMap((hypothesis) => hypothesis.evidenceRefs),
    ]);
    if (
      primary.confidence < MIN_ROUTING_CONFIDENCE ||
      confirmations.length === 0 ||
      confirmations.some((ref) => !available.has(ref))
    ) {
      return createHandoff(
        intake,
        primary,
        'blocked',
        'runtime-session',
        'Prompt routing ownership lacks independent evidence confirmation.',
      );
    }
  }
  return {
    disposition: 'candidate-eligible',
    reportIds: [intake.reportId],
    target: proposedTarget,
    ownership: {
      observedFailure: readObservedFailure(intake, primary.observedFailureId),
      suspectedOwner: primary.suspectedOwner,
      confidence: primary.confidence,
      evidenceRefs: primary.evidenceRefs,
      missingEvidence: primary.missingEvidence,
    },
    rubricDimensions: intake.rubricDimensions,
  };
}

function assertTargetMatchesReport(intake, target) {
  if (target.kind === 'skill-content' || target.kind === 'skill-description') {
    if (intake.target.kind !== 'skill') {
      throw intakeError(
        'optimization-target-mismatch',
        'Skill candidate requires a Skill-owned report',
      );
    }
    if (stableStringify(target.identity) !== stableStringify(intake.target.identity)) {
      throw intakeError(
        'optimization-target-mismatch',
        'Proposed Host Skill identity differs from the report target',
      );
    }
    return;
  }
  if (intake.target.kind !== 'prompt' || intake.target.id !== target.promptId) {
    throw intakeError(
      'optimization-target-mismatch',
      'Proposed Prompt target differs from the report target',
    );
  }
  if (intake.target.contractHash !== target.contractHash) {
    throw intakeError('optimization-target-mismatch', 'Proposed Prompt contract hash is stale');
  }
}

function createHandoff(intake, hypothesis, disposition, canonicalOwner, reason) {
  const suspectedOwner = hypothesis?.suspectedOwner ?? 'evaluation-infrastructure';
  const observedFailure = hypothesis
    ? readObservedFailure(intake, hypothesis.observedFailureId)
    : (intake.observedFailures[0]?.summary ?? 'Optimization attribution is unavailable.');
  return validateOptimizationHandoff({
    schema: OPTIMIZATION_SCHEMAS.handoff,
    id: `handoff-${intake.reportId}`,
    reportIds: [intake.reportId],
    disposition,
    canonicalOwner,
    observedFailure,
    suspectedOwner,
    confidence: hypothesis?.confidence ?? 0,
    evidenceRefs: hypothesis?.evidenceRefs ??
      intake.observedFailures[0]?.evidenceRefs ?? ['turn-facts'],
    missingEvidence: hypothesis?.missingEvidence ?? [
      'A validated ownership hypothesis is required.',
    ],
    suggestedOpenSpecTitle: `fix-${canonicalOwner}-${intake.caseId}`,
    reason,
    createdAt: new Date().toISOString(),
  });
}

function canonicalHandoffOwner(owner) {
  return [
    'capability-tool',
    'runtime-session',
    'provider-infrastructure',
    'artifact-authoring',
    'evaluation-infrastructure',
  ].includes(owner)
    ? owner
    : owner === 'routing'
      ? 'runtime-session'
      : 'evaluation-infrastructure';
}

function readObservedFailure(intake, id) {
  const failure = intake.observedFailures.find((item) => item.id === id);
  if (!failure)
    throw intakeError('optimization-attribution-invalid', `Observed failure is missing: ${id}`);
  return failure.summary;
}

function assertSameReportId(expected, actual, label) {
  if (expected !== actual) {
    throw intakeError(
      'optimization-report-mismatch',
      `${label} report id ${actual} does not match ${expected}`,
    );
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function intakeError(code, message) {
  return Object.assign(new Error(message), { code });
}
