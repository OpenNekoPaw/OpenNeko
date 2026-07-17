import { schema as s, validateStrict } from './strict-schema.mjs';

export const ABLATION_SCHEMAS = Object.freeze({
  plan: 'neko.agent-eval.ablation-plan.v1',
  delta: 'neko.agent-eval.ablation-delta.v1',
});

export const ABLATION_METRICS = Object.freeze([
  'pass-rate',
  'hard-gates',
  'tokens',
  'cost',
  'latency-p50',
  'latency-p95',
  'iterations',
  'tool-calls',
  'tool-success',
  'retries',
  'task-count',
  'task-success',
]);

const CONFIGURATION_DIMENSIONS = Object.freeze([
  'runtime.temperature',
  'runtime.max-tokens',
  'runtime.thinking-budget',
  'runtime.output-format',
  'runtime.execution-mode',
  'model-profile',
]);
const IMPLEMENTATION_DIMENSIONS = Object.freeze([
  'skill-content',
  'prompt-fragment',
  'routing-implementation',
  'runtime-hook',
]);

const ID = s.string({ minLength: 1, maxLength: 160, pattern: /^[a-z0-9][a-z0-9._-]*$/u });
const TEXT = s.string({ minLength: 1, maxLength: 20_000 });
const SHORT_TEXT = s.string({ minLength: 1, maxLength: 1_000 });
const HASH = s.string({ pattern: /^sha256:[a-f0-9]{64}$/u });
const PATH = s.string({ minLength: 1, maxLength: 500, format: 'relative-path' });
const STRING_LIST = s.array(SHORT_TEXT, { minLength: 1, maxLength: 100 });
const METRIC_LIST = s.array(s.enum(ABLATION_METRICS), {
  minLength: ABLATION_METRICS.length,
  maxLength: ABLATION_METRICS.length,
});

const QUALITY_POLICY_SCHEMA = s.union([
  s.object({ kind: s.literal('hard-gates-only'), reason: TEXT }),
  s.object({ kind: s.literal('scenario-rubric'), rubricRef: PATH }),
]);

const COMPARISON_POLICY_SCHEMA = s.object({
  retainEverySample: s.literal(true),
  correctnessDominates: s.literal(true),
  metrics: METRIC_LIST,
  quality: QUALITY_POLICY_SCHEMA,
});

const VARIANT_COMMON = {
  id: ID,
  role: s.enum(['baseline', 'variant']),
  description: TEXT,
  expectedPath: STRING_LIST,
  forbiddenFallback: STRING_LIST,
};

const CONFIGURATION_VARIANT_SCHEMA = s.object(
  {
    ...VARIANT_COMMON,
    kind: s.literal('configuration'),
    changes: s.array(s.enum(CONFIGURATION_DIMENSIONS), { maxLength: 2 }),
    runtimeProfileId: ID,
    modelProfileId: ID,
    expectedConfiguration: s.object({
      runtimeProfileId: ID,
      runtimeConfigurationHash: HASH,
      modelProfileId: ID,
      modelConfigurationHash: HASH,
    }),
  },
  { interactionEvidence: TEXT },
);

const HOST_SKILL_IDENTITY_SCHEMA = s.object({
  name: ID,
  source: s.enum(['project', 'personal', 'builtin', 'plugin']),
  provenance: s.enum(['workspace', 'user', 'builtin', 'plugin']),
  rootId: ID,
  relativePath: PATH,
  fingerprint: HASH,
});

const BUILD_TARGET_SCHEMA = s.object(
  {
    sourceRevision: SHORT_TEXT,
    sourceFingerprint: HASH,
    buildRecipeFingerprint: HASH,
    buildCommands: s.array(
      s.object({
        command: SHORT_TEXT,
        args: s.array(SHORT_TEXT, { maxLength: 100 }),
        timeoutMs: s.integer({ min: 1, max: 3_600_000 }),
      }),
      { minLength: 1, maxLength: 20 },
    ),
    executablePath: PATH,
    launchCommand: s.object({
      command: SHORT_TEXT,
      args: s.array(SHORT_TEXT, { minLength: 1, maxLength: 20 }),
    }),
  },
  { patchFile: PATH, patchFingerprint: HASH },
);

const IMPLEMENTATION_VARIANT_SCHEMA = s.object(
  {
    ...VARIANT_COMMON,
    kind: s.literal('implementation'),
    changes: s.array(s.enum(IMPLEMENTATION_DIMENSIONS), { maxLength: 2 }),
    skillIdentity: HOST_SKILL_IDENTITY_SCHEMA,
    developmentCheckpoint: s.object({
      kind: s.enum(['git-revision', 'working-tree-patch']),
      ref: SHORT_TEXT,
      fingerprint: HASH,
    }),
    buildTarget: BUILD_TARGET_SCHEMA,
  },
  { interactionEvidence: TEXT },
);

const CONFIGURATION_PLAN_SCHEMA = s.object({
  schema: s.literal(ABLATION_SCHEMAS.plan),
  id: ID,
  mode: s.literal('configuration'),
  suiteId: ID,
  caseId: ID,
  baselineVariantId: ID,
  matrix: s.object({ strategy: s.literal('focused'), maxVariants: s.integer({ min: 2, max: 20 }) }),
  repetitions: s.integer({ min: 2, max: 100 }),
  comparisonPolicy: COMPARISON_POLICY_SCHEMA,
  variants: s.array(CONFIGURATION_VARIANT_SCHEMA, { minLength: 2, maxLength: 20 }),
});

const IMPLEMENTATION_PLAN_SCHEMA = s.object({
  schema: s.literal(ABLATION_SCHEMAS.plan),
  id: ID,
  mode: s.literal('implementation'),
  suiteId: ID,
  caseId: ID,
  baselineVariantId: ID,
  matrix: s.object({ strategy: s.literal('focused'), maxVariants: s.integer({ min: 2, max: 20 }) }),
  repetitions: s.integer({ min: 2, max: 100 }),
  comparisonPolicy: COMPARISON_POLICY_SCHEMA,
  variants: s.array(IMPLEMENTATION_VARIANT_SCHEMA, { minLength: 2, maxLength: 20 }),
});

export const ABLATION_PLAN_SCHEMA = s.union([
  CONFIGURATION_PLAN_SCHEMA,
  IMPLEMENTATION_PLAN_SCHEMA,
]);

const OUTCOME_SCHEMA = s.enum([
  'pass',
  'case-fail',
  'infrastructure-fail',
  'configuration-invalid',
  'non-comparable',
]);
const COST_SCHEMA = s.union([
  s.object({ status: s.literal('unavailable') }),
  s.object({ status: s.literal('available'), totalUsd: s.number({ min: 0 }) }),
]);
const VARIANT_METRICS_SCHEMA = s.object({
  passRate: s.number({ min: 0, max: 1 }),
  hardGates: s.object({
    passed: s.integer({ min: 0 }),
    failed: s.integer({ min: 0 }),
    blocked: s.integer({ min: 0 }),
  }),
  tokens: s.object({ input: s.integer({ min: 0 }), output: s.integer({ min: 0 }) }),
  cost: COST_SCHEMA,
  latency: s.object({
    meanMs: s.number({ min: 0 }),
    p50Ms: s.number({ min: 0 }),
    p95Ms: s.number({ min: 0 }),
  }),
  iterations: s.object({ total: s.integer({ min: 0 }), mean: s.number({ min: 0 }) }),
  tools: s.object({
    calls: s.integer({ min: 0 }),
    successes: s.integer({ min: 0 }),
    failures: s.integer({ min: 0 }),
    successRate: s.number({ min: 0, max: 1 }),
  }),
  retries: s.object({ count: s.integer({ min: 0 }) }),
  tasks: s.object({
    total: s.integer({ min: 0 }),
    completed: s.integer({ min: 0 }),
    failed: s.integer({ min: 0 }),
    cancelled: s.integer({ min: 0 }),
    successRate: s.number({ min: 0, max: 1 }),
  }),
  quality: s.union([
    s.object({ status: s.literal('not-evaluated'), reason: s.literal('hard-gates-only') }),
    s.object({
      status: s.literal('unavailable'),
      rubricRef: PATH,
      reason: s.literal('judge-not-completed'),
    }),
    s.object({
      status: s.literal('available'),
      rubricRef: PATH,
      samples: s.integer({ min: 1 }),
      mean: s.number({ min: 0, max: 5 }),
      variance: s.number({ min: 0 }),
    }),
  ]),
});
const CONFIGURATION_EXECUTION_IDENTITY_SCHEMA = s.union([
  s.object({
    kind: s.literal('configuration'),
    runtimeProfileId: ID,
    runtimeConfigurationHash: HASH,
    modelProfileId: ID,
    modelConfigurationHash: HASH,
    status: s.literal('observed'),
    effectiveDigests: s.array(HASH, { minLength: 1, maxLength: 100 }),
  }),
  s.object({
    kind: s.literal('configuration'),
    runtimeProfileId: ID,
    runtimeConfigurationHash: HASH,
    modelProfileId: ID,
    modelConfigurationHash: HASH,
    status: s.literal('missing'),
    diagnostics: s.array(TEXT, { minLength: 1, maxLength: 100 }),
  }),
]);
const IMPLEMENTATION_EXECUTION_IDENTITY_SCHEMA = s.object({
  kind: s.literal('implementation'),
  sourceRevision: SHORT_TEXT,
  sourceFingerprint: HASH,
  buildRecipeFingerprint: HASH,
  executableFingerprint: HASH,
  skillIdentity: HOST_SKILL_IDENTITY_SCHEMA,
});
const BASELINE_DELTA_SCHEMA = s.object(
  {
    passRate: s.number(),
    inputTokens: s.number(),
    outputTokens: s.number(),
    latencyP50Ms: s.number(),
    latencyP95Ms: s.number(),
    iterations: s.number(),
    toolCalls: s.number(),
    retries: s.number(),
    completedTasks: s.number(),
  },
  { costUsd: s.number(), qualityMean: s.number() },
);
const ABLATION_DELTA_VARIANT_SCHEMA = s.object(
  {
    id: ID,
    role: s.enum(['baseline', 'variant']),
    outcome: OUTCOME_SCHEMA,
    comparable: s.boolean(),
    comparabilityDiagnostics: s.array(TEXT, { maxLength: 100 }),
    reportIds: s.array(ID, { minLength: 2, maxLength: 100 }),
    executionIdentity: s.union([
      CONFIGURATION_EXECUTION_IDENTITY_SCHEMA,
      IMPLEMENTATION_EXECUTION_IDENTITY_SCHEMA,
    ]),
    metrics: VARIANT_METRICS_SCHEMA,
  },
  { deltaFromBaseline: BASELINE_DELTA_SCHEMA },
);

export const ABLATION_DELTA_SCHEMA = s.object({
  schema: s.literal(ABLATION_SCHEMAS.delta),
  id: ID,
  planId: ID,
  runId: ID,
  mode: s.enum(['configuration', 'implementation']),
  suiteId: ID,
  caseId: ID,
  baselineVariantId: ID,
  outcome: OUTCOME_SCHEMA,
  variants: s.array(ABLATION_DELTA_VARIANT_SCHEMA, { minLength: 2, maxLength: 20 }),
  residualRisk: s.array(TEXT, { maxLength: 100 }),
});

export function validateAblationPlan(input) {
  validateStrict(input, ABLATION_PLAN_SCHEMA, 'ablationPlan');
  assertUnique(
    input.variants.map((variant) => variant.id),
    'ablation variant ids',
  );
  assertExactMetrics(input.comparisonPolicy.metrics);
  if (input.variants.length > input.matrix.maxVariants) {
    throw new Error(
      `ablationPlan variants exceed focused matrix maxVariants=${input.matrix.maxVariants}`,
    );
  }
  const baselines = input.variants.filter((variant) => variant.role === 'baseline');
  if (baselines.length !== 1 || baselines[0]?.id !== input.baselineVariantId) {
    throw new Error('ablationPlan must declare exactly one matching baseline variant');
  }
  for (const variant of input.variants) validateFocusedVariant(variant);
  if (input.mode === 'implementation') validateSkillImplementationIdentity(input.variants);
  return input;
}

export function validateAblationQualityContract(planInput, selection) {
  const plan = validateAblationPlan(planInput);
  if (selection?.suite?.id !== plan.suiteId || selection?.scenario?.id !== plan.caseId) {
    throw new Error('ablationPlan quality validation requires the selected suite and scenario');
  }
  const policy = plan.comparisonPolicy.quality;
  const scenarioRubric = selection.scenario.rubric;
  if (policy.kind === 'hard-gates-only') {
    if (scenarioRubric) {
      throw new Error(
        `ablationPlan hard-gates-only quality cannot select scenario rubric ${scenarioRubric.ref}`,
      );
    }
    return plan;
  }
  if (!scenarioRubric) {
    throw new Error(
      `ablationPlan scenario-rubric ${policy.rubricRef} is not enabled by scenario ${plan.caseId}`,
    );
  }
  if (scenarioRubric.ref !== policy.rubricRef) {
    throw new Error(
      `ablationPlan rubric ${policy.rubricRef} does not match scenario rubric ${scenarioRubric.ref}`,
    );
  }
  if (!selection.rubrics?.[policy.rubricRef]) {
    throw new Error(`ablationPlan rubric was not loaded from its owning suite: ${policy.rubricRef}`);
  }
  if (!selection.suite.judgeProfiles.some((profile) => profile.id === scenarioRubric.judgeProfileId)) {
    throw new Error(
      `ablationPlan scenario Judge profile is not declared by the suite: ${scenarioRubric.judgeProfileId}`,
    );
  }
  return plan;
}

export function validateIsolatedBuildTarget(input) {
  validateStrict(input, BUILD_TARGET_SCHEMA, 'isolatedBuildTarget');
  if ((input.patchFile === undefined) !== (input.patchFingerprint === undefined)) {
    throw new Error('isolatedBuildTarget patch file and fingerprint must be declared together');
  }
  if (input.launchCommand.args.filter((arg) => arg === '{executable}').length !== 1) {
    throw new Error('isolatedBuildTarget launchCommand requires exactly one {executable} argument');
  }
  return input;
}

export function validateAblationDelta(input) {
  validateStrict(input, ABLATION_DELTA_SCHEMA, 'ablationDelta');
  assertUnique(
    input.variants.map((variant) => variant.id),
    'ablation delta variant ids',
  );
  const baselines = input.variants.filter((variant) => variant.role === 'baseline');
  if (baselines.length !== 1 || baselines[0]?.id !== input.baselineVariantId) {
    throw new Error('ablationDelta must contain exactly one matching baseline variant');
  }
  for (const variant of input.variants) {
    if (variant.executionIdentity.kind !== input.mode) {
      throw new Error(
        `ablationDelta variant ${variant.id} execution identity does not match mode ${input.mode}`,
      );
    }
    if (variant.role === 'baseline' && variant.deltaFromBaseline !== undefined) {
      throw new Error('ablationDelta baseline must not declare deltaFromBaseline');
    }
    if (variant.role === 'variant' && variant.deltaFromBaseline === undefined) {
      throw new Error(`ablationDelta variant ${variant.id} requires deltaFromBaseline`);
    }
  }
  if (input.mode === 'implementation') {
    validateSkillImplementationIdentity(
      input.variants.map((variant) => ({ skillIdentity: variant.executionIdentity.skillIdentity })),
    );
  }
  return input;
}

function validateFocusedVariant(variant) {
  if (variant.role === 'baseline' && variant.changes.length !== 0) {
    throw new Error(`baseline variant ${variant.id} must not declare changes`);
  }
  if (variant.role === 'variant' && variant.changes.length === 0) {
    throw new Error(`variant ${variant.id} must declare one attributable change`);
  }
  if (variant.changes.length > 1 && !variant.interactionEvidence) {
    throw new Error(
      `variant ${variant.id} changes multiple dimensions without interactionEvidence`,
    );
  }
  if (variant.kind === 'configuration') {
    const expected = variant.expectedConfiguration;
    if (
      expected.runtimeProfileId !== variant.runtimeProfileId ||
      expected.modelProfileId !== variant.modelProfileId
    ) {
      throw new Error(
        `variant ${variant.id} expected configuration identity does not match profiles`,
      );
    }
  }
  if (variant.kind === 'implementation') {
    const { buildTarget } = variant;
    if ((buildTarget.patchFile === undefined) !== (buildTarget.patchFingerprint === undefined)) {
      throw new Error(`variant ${variant.id} patch file and fingerprint must be declared together`);
    }
    validateIsolatedBuildTarget(buildTarget);
    validateHostSkillIdentity(variant.skillIdentity, variant.id);
  }
}

function validateSkillImplementationIdentity(variants) {
  const [baseline, ...rest] = variants;
  const identity = hostIdentityWithoutFingerprint(baseline.skillIdentity);
  assertUnique(
    variants.map((variant) => variant.skillIdentity.fingerprint),
    'implementation Skill package fingerprints',
  );
  for (const variant of rest) {
    if (
      stableStringify(hostIdentityWithoutFingerprint(variant.skillIdentity)) !==
      stableStringify(identity)
    ) {
      throw new Error('implementation variants must preserve the same Host Skill identity');
    }
    if (variant.skillIdentity.fingerprint === baseline.skillIdentity.fingerprint) {
      throw new Error('implementation variants must use distinct Skill package fingerprints');
    }
  }
}

function validateHostSkillIdentity(identity, variantId) {
  const expectedProvenance = {
    project: 'workspace',
    personal: 'user',
    builtin: 'builtin',
    plugin: 'plugin',
  }[identity.source];
  if (identity.provenance !== expectedProvenance) {
    throw new Error(`variant ${variantId} Skill provenance does not match Host source`);
  }
  if (identity.relativePath.split('/').at(-1) !== identity.name) {
    throw new Error(`variant ${variantId} Skill name must match relativePath directory`);
  }
}

function hostIdentityWithoutFingerprint(identity) {
  const { fingerprint: _fingerprint, ...stable } = identity;
  return stable;
}

function assertExactMetrics(metrics) {
  assertUnique(metrics, 'ablation comparison metrics');
  const missing = ABLATION_METRICS.filter((metric) => !metrics.includes(metric));
  if (missing.length > 0) {
    throw new Error(`ablation comparison metrics missing: ${missing.join(', ')}`);
  }
}

function assertUnique(values, label) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) throw new Error(`${label} must be unique; duplicate=${duplicate}`);
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
