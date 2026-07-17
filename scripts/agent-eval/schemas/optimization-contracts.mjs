import { HOST_SKILL_IDENTITY_SCHEMA, TARGET_SCHEMA } from './contracts.mjs';
import { assertShareableEvidence } from './evidence-policy.mjs';
import { schema as s, validateStrict } from './strict-schema.mjs';

export const OPTIMIZATION_SCHEMAS = Object.freeze({
  plan: 'neko.agent-eval.optimization-plan.v1',
  candidate: 'neko.agent-eval.optimization-candidate.v1',
  handoff: 'neko.agent-eval.optimization-handoff.v1',
  approval: 'neko.agent-eval.optimization-approval.v1',
  decision: 'neko.agent-eval.optimization-decision.v1',
  history: 'neko.agent-eval.skill-development-history.v1',
  checkpoint: 'neko.agent-eval.skill-development-checkpoint.v1',
  renameLineage: 'neko.agent-eval.skill-rename-lineage.v1',
  intake: 'neko.agent-eval.optimization-intake.v1',
  holdoutSelection: 'neko.agent-eval.optimizer-holdout-selection.v1',
});

const OPTIMIZABLE_OWNERS = Object.freeze(['skill-content', 'prompt', 'routing']);
const HANDOFF_OWNERS = Object.freeze([
  'capability-tool',
  'runtime-session',
  'provider-infrastructure',
  'artifact-authoring',
  'evaluation-infrastructure',
]);

const ID = s.string({ minLength: 1, maxLength: 160, pattern: /^[a-z0-9][a-z0-9._-]*$/u });
const TEXT = s.string({ minLength: 1, maxLength: 20_000 });
const SHORT_TEXT = s.string({ minLength: 1, maxLength: 1_000 });
const HASH = s.string({ pattern: /^sha256:[a-f0-9]{64}$/u });
const PATH = s.string({ minLength: 1, maxLength: 500, format: 'relative-path' });
const TIMESTAMP = s.string({ format: 'timestamp' });
const ID_LIST = s.array(ID, { minLength: 1, maxLength: 200 });
const TEXT_LIST = s.array(TEXT, { maxLength: 100 });
const NON_EMPTY_TEXT_LIST = s.array(TEXT, { minLength: 1, maxLength: 100 });
const OWNER = s.enum([...OPTIMIZABLE_OWNERS, ...HANDOFF_OWNERS]);

const ITERATION_BUDGET_SCHEMA = s.object({
  maxCandidates: s.integer({ min: 1, max: 10 }),
  maxIterations: s.integer({ min: 1, max: 20 }),
  timeoutMs: s.integer({ min: 1, max: 86_400_000 }),
  targetTokenLimit: s.integer({ min: 1, max: 10_000_000 }),
  controllerTokenLimit: s.integer({ min: 1, max: 10_000_000 }),
  judgeTokenLimit: s.integer({ min: 1, max: 10_000_000 }),
  costUsdLimit: s.number({ min: 0.01, max: 100_000 }),
  noImprovementLimit: s.integer({ min: 1, max: 10 }),
});

const REQUIRED_MATRIX_SCHEMA = s.object({
  suiteId: ID,
  developmentCaseIds: ID_LIST,
  holdoutPolicy: s.object({
    id: ID,
    selectionDigest: HASH,
    minimumCases: s.integer({ min: 1, max: 100 }),
  }),
  protectedRegressionCaseIds: ID_LIST,
  runtimeProfileId: ID,
  modelProfileId: ID,
  repetitions: s.integer({ min: 2, max: 100 }),
  judgeProfileId: ID,
  rubricRef: PATH,
});

const OWNERSHIP_FINDING_SCHEMA = s.object({
  observedFailure: TEXT,
  suspectedOwner: OWNER,
  confidence: s.number({ min: 0, max: 1 }),
  evidenceRefs: ID_LIST,
  missingEvidence: TEXT_LIST,
});

const OPTIMIZATION_INTAKE_SCHEMA = s.object(
  {
    schema: s.literal(OPTIMIZATION_SCHEMAS.intake),
    reportId: ID,
    suiteId: ID,
    caseId: ID,
    outcome: s.enum([
      'pass',
      'case-fail',
      'infrastructure-fail',
      'configuration-invalid',
      'non-comparable',
    ]),
    target: TARGET_SCHEMA,
    modelIdentity: s.object({ providerId: ID, modelId: SHORT_TEXT }),
    evidenceProjection: s.array(
      s.object(
        {
          ref: s.string({ minLength: 1, maxLength: 300, pattern: /^\S+$/u }),
          kind: ID,
          source: ID,
          summary: TEXT,
          complete: s.boolean(),
        },
        { digest: HASH, droppedCount: s.integer({ min: 0 }) },
      ),
      { minLength: 1, maxLength: 5_000 },
    ),
    observedFailures: s.array(
      s.object({ id: ID, kind: ID, summary: TEXT, evidenceRefs: ID_LIST }),
      { minLength: 1, maxLength: 200 },
    ),
    hypotheses: s.array(
      s.object({
        observedFailureId: ID,
        suspectedOwner: OWNER,
        confidence: s.number({ min: 0, max: 1 }),
        evidenceRefs: ID_LIST,
        missingEvidence: TEXT_LIST,
        handoffRecommendation: TEXT,
      }),
      { minLength: 1, maxLength: 200 },
    ),
    rubricDimensions: s.array(
      s.object({
        id: ID,
        score: s.number({ min: 0, max: 5 }),
        evidenceRefs: ID_LIST,
        uncertainty: s.number({ min: 0, max: 1 }),
      }),
      { maxLength: 100 },
    ),
    hardGateFailures: s.array(
      s.object({ id: ID, status: s.enum(['fail', 'blocked']), evidenceRefs: ID_LIST }),
      { maxLength: 200 },
    ),
    incompleteEvidenceRefs: s.array(s.string({ minLength: 1, maxLength: 300 }), {
      maxLength: 200,
    }),
    residualRisk: TEXT_LIST,
  },
  { effectiveConfigurationDigest: HASH },
);

const OPTIMIZATION_TARGET_SCHEMA = s.union([
  s.object({
    kind: s.enum(['skill-content', 'skill-description']),
    identity: HOST_SKILL_IDENTITY_SCHEMA,
    targetFile: PATH,
  }),
  s.object({
    kind: s.enum(['prompt-guidance', 'prompt-routing']),
    promptId: ID,
    contractHash: HASH,
    targetFile: PATH,
  }),
]);

const OPTIMIZATION_PLAN_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.plan),
  id: ID,
  status: s.literal('proposed'),
  target: OPTIMIZATION_TARGET_SCHEMA,
  baseFingerprint: HASH,
  reportIds: ID_LIST,
  failedCases: s.array(
    s.object({
      suiteId: ID,
      caseId: ID,
      reportId: ID,
      outcome: s.enum(['case-fail', 'non-comparable']),
    }),
    { minLength: 1, maxLength: 200 },
  ),
  rubricDimensions: s.array(
    s.object({ id: ID, score: s.number({ min: 0, max: 5 }), evidenceRefs: ID_LIST }),
    { minLength: 1, maxLength: 100 },
  ),
  ownership: OWNERSHIP_FINDING_SCHEMA,
  expectedImprovement: TEXT,
  risks: NON_EMPTY_TEXT_LIST,
  budget: ITERATION_BUDGET_SCHEMA,
  requiredMatrix: REQUIRED_MATRIX_SCHEMA,
  acceptanceThreshold: s.object({
    minimumQualityDelta: s.number({ min: 0 }),
    maximumJudgeUncertainty: s.number({ min: 0, max: 1 }),
  }),
  createdBy: SHORT_TEXT,
  createdAt: TIMESTAMP,
});

const OPTIMIZATION_CANDIDATE_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.candidate),
  id: ID,
  planId: ID,
  target: OPTIMIZATION_TARGET_SCHEMA,
  baseFingerprint: HASH,
  candidateFingerprint: HASH,
  patchPath: PATH,
  patchFingerprint: HASH,
  changeSummary: TEXT,
  evidenceRefs: ID_LIST,
  expectedImprovement: TEXT,
  risks: NON_EMPTY_TEXT_LIST,
  holdoutAccess: s.literal('not-provided'),
  canonicalMutation: s.literal(false),
  commitRequested: s.literal(false),
  createdBy: SHORT_TEXT,
  createdAt: TIMESTAMP,
});

const OPTIMIZATION_HANDOFF_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.handoff),
  id: ID,
  reportIds: ID_LIST,
  disposition: s.enum(['handoff', 'blocked']),
  canonicalOwner: s.enum(HANDOFF_OWNERS),
  observedFailure: TEXT,
  suspectedOwner: OWNER,
  confidence: s.number({ min: 0, max: 1 }),
  evidenceRefs: ID_LIST,
  missingEvidence: TEXT_LIST,
  suggestedOpenSpecTitle: SHORT_TEXT,
  reason: TEXT,
  createdAt: TIMESTAMP,
});

const APPROVAL_SCOPE_SCHEMA = s.object({
  targetFiles: s.array(PATH, { minLength: 1, maxLength: 20 }),
  allowedSections: s.array(SHORT_TEXT, { minLength: 1, maxLength: 50 }),
});

const OPTIMIZATION_APPROVAL_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.approval),
  id: ID,
  decision: s.enum(['approve', 'reject']),
  planId: ID,
  candidateId: ID,
  target: OPTIMIZATION_TARGET_SCHEMA,
  baseFingerprint: HASH,
  candidateFingerprint: HASH,
  approver: SHORT_TEXT,
  scope: APPROVAL_SCOPE_SCHEMA,
  budget: ITERATION_BUDGET_SCHEMA,
  requiredMatrix: REQUIRED_MATRIX_SCHEMA,
  decidedAt: TIMESTAMP,
  reason: TEXT,
});

const CHECK_RESULT_SCHEMA = s.object({
  status: s.enum(['pass', 'fail', 'blocked']),
  reportIds: s.array(ID, { maxLength: 200 }),
});

const COST_USAGE_SCHEMA = s.union([
  s.object({ status: s.literal('available'), totalUsd: s.number({ min: 0 }) }),
  s.object({ status: s.literal('unavailable') }),
]);

const OPTIMIZATION_DECISION_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.decision),
  id: ID,
  planId: ID,
  candidateId: ID,
  approvalId: ID,
  outcome: s.enum(['accepted', 'rejected', 'non-comparable', 'blocked']),
  target: OPTIMIZATION_TARGET_SCHEMA,
  baseFingerprint: HASH,
  candidateFingerprint: HASH,
  reportIds: ID_LIST,
  checks: s.object({
    hardGates: CHECK_RESULT_SCHEMA,
    holdout: CHECK_RESULT_SCHEMA,
    protectedRegression: CHECK_RESULT_SCHEMA,
  }),
  blindComparison: s.union([
    s.object({
      id: ID,
      outcome: s.enum(['candidate-preferred', 'baseline-preferred', 'tie']),
      orderDigest: HASH,
      mappingRefs: s.array(PATH, { minLength: 1, maxLength: 1_000 }),
      reportIds: ID_LIST,
    }),
    s.object({
      id: ID,
      outcome: s.literal('non-comparable'),
      orderDigest: HASH,
      mappingRefs: s.array(PATH, { maxLength: 1_000 }),
      reportIds: s.array(ID, { maxLength: 1_000 }),
      reason: TEXT,
    }),
  ]),
  quality: s.union([
    s.object({
      status: s.literal('available'),
      baselineMean: s.number({ min: 0, max: 5 }),
      candidateMean: s.number({ min: 0, max: 5 }),
      delta: s.number({ min: -5, max: 5 }),
      samples: s.integer({ min: 2, max: 10_000 }),
      maximumUncertainty: s.number({ min: 0, max: 1 }),
    }),
    s.object({ status: s.literal('unavailable'), reason: TEXT }),
  ]),
  budgetUsage: s.object({
    candidates: s.integer({ min: 1 }),
    iterations: s.integer({ min: 1 }),
    wallTimeMs: s.integer({ min: 0 }),
    targetTokens: s.integer({ min: 0 }),
    controllerTokens: s.integer({ min: 0 }),
    judgeTokens: s.integer({ min: 0 }),
    cost: COST_USAGE_SCHEMA,
    noImprovementIterations: s.integer({ min: 0 }),
  }),
  decidedBy: SHORT_TEXT,
  decidedAt: TIMESTAMP,
  residualRisk: TEXT_LIST,
});

const CHECKPOINT_PARENT_SCHEMA = s.object({ entryId: ID, fingerprint: HASH });
const DEVELOPMENT_CHECKPOINT_SCHEMA = s.object(
  {
    schema: s.literal(OPTIMIZATION_SCHEMAS.checkpoint),
    id: ID,
    state: s.enum(['baseline', 'candidate', 'evaluated', 'accepted', 'rejected', 'superseded']),
    identity: HOST_SKILL_IDENTITY_SCHEMA,
    fingerprint: HASH,
    origin: s.object({
      kind: s.enum([
        'evaluation-baseline',
        'optimizer-candidate',
        'evaluation-result',
        'human-decision',
        'superseded',
      ]),
      ref: ID,
    }),
    reportIds: ID_LIST,
    attribution: OWNERSHIP_FINDING_SCHEMA,
    decision: s.enum(['none', 'approved', 'accepted', 'rejected', 'superseded']),
    actor: SHORT_TEXT,
    recordedAt: TIMESTAMP,
    residualRisk: TEXT_LIST,
  },
  {
    parent: CHECKPOINT_PARENT_SCHEMA,
    planId: ID,
    candidateId: ID,
    approvalId: ID,
    decisionId: ID,
  },
);

const RENAME_LINEAGE_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.renameLineage),
  id: ID,
  kind: s.enum(['rename', 'move']),
  fromIdentity: HOST_SKILL_IDENTITY_SCHEMA,
  toIdentity: HOST_SKILL_IDENTITY_SCHEMA,
  reason: TEXT,
  actor: SHORT_TEXT,
  recordedAt: TIMESTAMP,
});

const DEVELOPMENT_HISTORY_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.history),
  entries: s.array(DEVELOPMENT_CHECKPOINT_SCHEMA, { maxLength: 10_000 }),
  renameLineage: s.array(RENAME_LINEAGE_SCHEMA, { maxLength: 1_000 }),
});

const HOLDOUT_SELECTION_SCHEMA = s.object({
  schema: s.literal(OPTIMIZATION_SCHEMAS.holdoutSelection),
  policyId: ID,
  suiteId: ID,
  caseIds: ID_LIST,
  selectionDigest: HASH,
  visibility: s.literal('optimizer-hidden'),
  createdAt: TIMESTAMP,
});

export function validateOptimizationPlan(input) {
  validateStrict(input, OPTIMIZATION_PLAN_SCHEMA, 'optimizationPlan');
  validateTarget(input.target, 'optimizationPlan.target');
  validateMatrix(input.requiredMatrix, 'optimizationPlan.requiredMatrix');
  assertUnique(input.reportIds, 'optimizationPlan report ids');
  assertUnique(
    input.failedCases.map((item) => item.reportId),
    'optimizationPlan failed report ids',
  );
  assertRefsContained(
    input.failedCases.map((item) => item.reportId),
    input.reportIds,
    'optimizationPlan failed report ids',
  );
  validateOwnerTarget(input.ownership, input.target);
  assertOptimizationArtifactSafe(input, 'optimizationPlan');
  return input;
}

export function validateOptimizationIntake(input) {
  validateStrict(input, OPTIMIZATION_INTAKE_SCHEMA, 'optimizationIntake');
  assertOptimizationArtifactSafe(input, 'optimizationIntake');
  return input;
}

export function validateOptimizationCandidate(input, plan) {
  validateStrict(input, OPTIMIZATION_CANDIDATE_SCHEMA, 'optimizationCandidate');
  validateTarget(input.target, 'optimizationCandidate.target');
  if (input.baseFingerprint === input.candidateFingerprint) {
    throw new Error('optimizationCandidate candidate fingerprint must differ from base');
  }
  if (plan) {
    validateOptimizationPlan(plan);
    if (input.planId !== plan.id) throw new Error('optimizationCandidate plan id is stale');
    if (input.baseFingerprint !== plan.baseFingerprint) {
      throw new Error('optimizationCandidate base fingerprint is stale');
    }
    if (!same(input.target, plan.target)) throw new Error('optimizationCandidate target changed');
    assertRefsContained(input.evidenceRefs, plan.ownership.evidenceRefs, 'candidate evidence refs');
  }
  assertOptimizationArtifactSafe(input, 'optimizationCandidate');
  return input;
}

export function validateOptimizationHandoff(input) {
  validateStrict(input, OPTIMIZATION_HANDOFF_SCHEMA, 'optimizationHandoff');
  assertOptimizationArtifactSafe(input, 'optimizationHandoff');
  return input;
}

export function validateOptimizationApproval(input, plan, candidate) {
  validateStrict(input, OPTIMIZATION_APPROVAL_SCHEMA, 'optimizationApproval');
  validateTarget(input.target, 'optimizationApproval.target');
  validateMatrix(input.requiredMatrix, 'optimizationApproval.requiredMatrix');
  assertOptimizationArtifactSafe(input, 'optimizationApproval');
  if (plan && candidate) {
    const validity = checkApprovalValidity(input, plan, candidate);
    if (!validity.valid)
      throw new Error(`optimizationApproval is invalid: ${validity.reasons.join('; ')}`);
  }
  return input;
}

export function checkApprovalValidity(approval, plan, candidate) {
  validateStrict(approval, OPTIMIZATION_APPROVAL_SCHEMA, 'optimizationApproval');
  validateOptimizationPlan(plan);
  validateOptimizationCandidate(candidate, plan);
  const reasons = [];
  if (approval.decision !== 'approve') reasons.push('candidate was not approved');
  if (approval.planId !== plan.id) reasons.push('plan id changed');
  if (approval.candidateId !== candidate.id) reasons.push('candidate id changed');
  if (!same(approval.target, candidate.target)) reasons.push('target identity or scope changed');
  if (approval.baseFingerprint !== candidate.baseFingerprint)
    reasons.push('base fingerprint changed');
  if (approval.candidateFingerprint !== candidate.candidateFingerprint) {
    reasons.push('candidate fingerprint changed');
  }
  if (!approval.scope.targetFiles.includes(candidate.target.targetFile)) {
    reasons.push('candidate target file is outside approved scope');
  }
  if (!same(approval.budget, plan.budget)) reasons.push('iteration budget changed');
  if (!same(approval.requiredMatrix, plan.requiredMatrix)) reasons.push('required matrix changed');
  return { valid: reasons.length === 0, reasons };
}

export function validateOptimizationDecision(input, context = {}) {
  validateStrict(input, OPTIMIZATION_DECISION_SCHEMA, 'optimizationDecision');
  validateTarget(input.target, 'optimizationDecision.target');
  assertOptimizationArtifactSafe(input, 'optimizationDecision');
  if (context.plan) {
    if (input.planId !== context.plan.id) {
      throw new Error('optimizationDecision plan id is stale');
    }
    if (
      input.baseFingerprint !== context.plan.baseFingerprint ||
      !same(input.target, context.plan.target)
    ) {
      throw new Error('optimizationDecision base target is stale');
    }
  }
  if (context.candidate) {
    if (
      input.candidateId !== context.candidate.id ||
      input.candidateFingerprint !== context.candidate.candidateFingerprint ||
      !same(input.target, context.candidate.target)
    ) {
      throw new Error('optimizationDecision candidate is stale');
    }
  }
  if (context.approval && input.approvalId !== context.approval.id) {
    throw new Error('optimizationDecision approval is stale');
  }
  if (
    input.quality.status === 'available' &&
    Math.abs(input.quality.candidateMean - input.quality.baselineMean - input.quality.delta) > 1e-9
  ) {
    throw new Error('optimizationDecision quality delta does not match content-quality means');
  }
  for (const [name, check] of Object.entries(input.checks)) {
    assertUnique(check.reportIds, `optimizationDecision ${name} report ids`);
    if (check.status !== 'blocked' && check.reportIds.length === 0) {
      throw new Error(`optimizationDecision ${name} requires report evidence`);
    }
    assertRefsContained(
      check.reportIds,
      input.reportIds,
      `optimizationDecision ${name} report ids`,
    );
  }
  if (input.blindComparison.outcome !== 'non-comparable') {
    assertRefsContained(
      input.blindComparison.reportIds,
      input.reportIds,
      'optimizationDecision blind report ids',
    );
  }
  if (input.outcome === 'accepted') {
    if (context.plan) validateBudgetUsage(input.budgetUsage, context.plan.budget);
    if (Object.values(input.checks).some((check) => check.status !== 'pass')) {
      throw new Error('accepted optimizationDecision requires every protected check to pass');
    }
    if (input.blindComparison.outcome !== 'candidate-preferred') {
      throw new Error('accepted optimizationDecision requires blind candidate preference');
    }
    if (input.quality.status !== 'available') {
      throw new Error('accepted optimizationDecision requires output-content quality evidence');
    }
    if (context.plan) {
      if (input.quality.delta < context.plan.acceptanceThreshold.minimumQualityDelta) {
        throw new Error('accepted optimizationDecision does not meet content-quality delta');
      }
      if (
        input.quality.maximumUncertainty > context.plan.acceptanceThreshold.maximumJudgeUncertainty
      ) {
        throw new Error('accepted optimizationDecision exceeds Judge uncertainty');
      }
    }
  }
  return input;
}

export function validateDevelopmentCheckpoint(input) {
  validateStrict(input, DEVELOPMENT_CHECKPOINT_SCHEMA, 'developmentCheckpoint');
  validateHostIdentity(input.identity, 'developmentCheckpoint.identity');
  if (input.fingerprint !== input.identity.fingerprint) {
    throw new Error('developmentCheckpoint fingerprint must reuse Host identity fingerprint');
  }
  validateCheckpointSemantics(input);
  assertOptimizationArtifactSafe(input, 'developmentCheckpoint');
  return input;
}

export function validateRenameLineage(input) {
  validateStrict(input, RENAME_LINEAGE_SCHEMA, 'renameLineage');
  validateHostIdentity(input.fromIdentity, 'renameLineage.fromIdentity');
  validateHostIdentity(input.toIdentity, 'renameLineage.toIdentity');
  if (hostIdentityKey(input.fromIdentity) === hostIdentityKey(input.toIdentity)) {
    throw new Error('renameLineage requires a changed Host identity');
  }
  assertOptimizationArtifactSafe(input, 'renameLineage');
  return input;
}

export function validateDevelopmentHistory(input) {
  validateStrict(input, DEVELOPMENT_HISTORY_SCHEMA, 'developmentHistory');
  input.entries.forEach(validateDevelopmentCheckpoint);
  input.renameLineage.forEach(validateRenameLineage);
  assertUnique(
    input.entries.map((entry) => entry.id),
    'development history entry ids',
  );
  assertUnique(
    input.renameLineage.map((entry) => entry.id),
    'rename lineage ids',
  );
  assertOptimizationArtifactSafe(input, 'developmentHistory');
  return input;
}

export function validateHoldoutSelection(input) {
  validateStrict(input, HOLDOUT_SELECTION_SCHEMA, 'holdoutSelection');
  assertUnique(input.caseIds, 'holdoutSelection case ids');
  assertOptimizationArtifactSafe(input, 'holdoutSelection');
  return input;
}

function validateBudgetUsage(usage, budget) {
  const limits = [
    ['candidates', 'maxCandidates'],
    ['iterations', 'maxIterations'],
    ['wallTimeMs', 'timeoutMs'],
    ['targetTokens', 'targetTokenLimit'],
    ['controllerTokens', 'controllerTokenLimit'],
    ['judgeTokens', 'judgeTokenLimit'],
    ['noImprovementIterations', 'noImprovementLimit'],
  ];
  for (const [used, limit] of limits) {
    if (usage[used] > budget[limit]) {
      throw new Error(`optimization budget exceeded: ${used} ${usage[used]} > ${budget[limit]}`);
    }
  }
  if (usage.cost.status !== 'available') {
    throw new Error('optimization budget unavailable: provider cost evidence is unavailable');
  }
  if (usage.cost.totalUsd > budget.costUsdLimit) {
    throw new Error(
      `optimization budget exceeded: cost ${usage.cost.totalUsd} > ${budget.costUsdLimit}`,
    );
  }
}

export function hostIdentityKey(identity) {
  validateHostIdentity(identity, 'hostIdentity');
  return [
    identity.name,
    identity.source,
    identity.provenance,
    identity.rootId,
    identity.relativePath,
  ]
    .map(encodeURIComponent)
    .join(':');
}

export function assertOptimizationArtifactSafe(
  value,
  label = 'optimizationArtifact',
  options = {},
) {
  assertShareableEvidence(value, label);
  visit(value, label);
  const serialized = JSON.stringify(value);
  for (const forbidden of options.forbiddenTexts ?? []) {
    if (forbidden && serialized.includes(forbidden)) {
      throw new Error(`${label} contains optimizer-hidden or unauthorized content`);
    }
  }
  return value;

  function visit(current, path) {
    if (typeof current === 'string') {
      if (/\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/u.test(current)) {
        throw new Error(`${path} contains a credential-like value`);
      }
      if (/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}\b/iu.test(current)) {
        throw new Error(`${path} contains an authorization value`);
      }
      if (/(?:BEGIN[_ -]?HIDDEN[_ -]?PROMPT|<system>|"role"\s*:\s*"system")/iu.test(current)) {
        throw new Error(`${path} contains hidden prompt material`);
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
      if (
        ['packageid', 'semver', 'publication', 'installation', 'distribution'].includes(normalized)
      ) {
        throw new Error(`${path}.${key} is owned by Market and is forbidden`);
      }
      visit(item, `${path}.${key}`);
    }
  }
}

function validateTarget(target, label) {
  if (target.kind === 'skill-content' || target.kind === 'skill-description') {
    validateHostIdentity(target.identity, `${label}.identity`);
    if (target.identity.source === 'market') {
      throw new Error(`${label} cannot mutate a Marketplace Skill; fork it to an editable source`);
    }
  }
}

function validateHostIdentity(identity, label) {
  validateStrict(identity, HOST_SKILL_IDENTITY_SCHEMA, label);
  const directoryName = identity.relativePath.split('/').at(-1);
  if (directoryName !== identity.name) throw new Error(`${label}.name must match relativePath`);
  const expected = {
    project: 'workspace',
    personal: 'user',
    builtin: 'builtin',
    market: 'marketplace',
    plugin: 'plugin',
  }[identity.source];
  if (identity.provenance !== expected) throw new Error(`${label}.provenance is not Host-owned`);
}

function validateOwnerTarget(ownership, target) {
  const allowed = {
    'skill-content': ['skill-content', 'skill-description'],
    prompt: ['prompt-guidance'],
    routing: ['prompt-routing'],
  }[ownership.suspectedOwner];
  if (!allowed?.includes(target.kind)) {
    throw new Error(
      `optimizationPlan owner ${ownership.suspectedOwner} cannot target ${target.kind}`,
    );
  }
  if (ownership.confidence < 0.75) {
    throw new Error('optimizationPlan ownership confidence is insufficient for a candidate');
  }
  if (target.kind === 'prompt-routing' && ownership.confidence < 0.9) {
    throw new Error('prompt-routing optimization requires independently confirmed ownership');
  }
}

function validateMatrix(matrix, label) {
  for (const [key, values] of Object.entries({
    developmentCaseIds: matrix.developmentCaseIds,
    protectedRegressionCaseIds: matrix.protectedRegressionCaseIds,
  })) {
    assertUnique(values, `${label}.${key}`);
  }
  const groups = [matrix.developmentCaseIds, matrix.protectedRegressionCaseIds];
  const all = groups.flat();
  if (new Set(all).size !== all.length) {
    throw new Error(`${label} case groups must not overlap`);
  }
}

function validateCheckpointSemantics(checkpoint) {
  const expectedOrigin = {
    baseline: 'evaluation-baseline',
    candidate: 'optimizer-candidate',
    evaluated: 'evaluation-result',
    accepted: 'human-decision',
    rejected: 'human-decision',
    superseded: 'superseded',
  }[checkpoint.state];
  if (checkpoint.origin.kind !== expectedOrigin) {
    throw new Error(`developmentCheckpoint ${checkpoint.state} has invalid origin`);
  }
  if (checkpoint.state !== 'baseline' && !checkpoint.parent) {
    throw new Error(`developmentCheckpoint ${checkpoint.state} requires a parent`);
  }
  const expectedDecision = {
    baseline: 'none',
    candidate: 'approved',
    evaluated: 'none',
    accepted: 'accepted',
    rejected: 'rejected',
    superseded: 'superseded',
  }[checkpoint.state];
  if (checkpoint.decision !== expectedDecision) {
    throw new Error(`developmentCheckpoint ${checkpoint.state} has invalid decision`);
  }
}

function assertRefsContained(values, allowedValues, label) {
  const allowed = new Set(allowedValues);
  const missing = values.filter((value) => !allowed.has(value));
  if (missing.length > 0) throw new Error(`${label} are not authorized: ${missing.join(', ')}`);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique`);
}

function same(left, right) {
  return stableStringify(left) === stableStringify(right);
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
