import { schema as s, validateStrict } from './strict-schema.mjs';
import { assertSupportedArtifactValidators } from './artifact-validator-policy.mjs';

export const SCHEMAS = Object.freeze({
  authoringDecision: 'neko.agent-eval.authoring-decision.v2',
  coverageDelta: 'neko.agent-eval.coverage-delta.v2',
  suite: 'neko.agent-eval.suite.v2',
  scenario: 'neko.agent-eval.scenario.v2',
  result: 'neko.agent-eval.result.v2',
  evidence: 'neko.agent-eval.evidence.v2',
  artifactManifest: 'neko.agent-eval.artifact-manifest.v2',
  baseline: 'neko.agent-eval.baseline.v2',
  comparison: 'neko.agent-eval.comparison.v2',
  rubric: 'neko.agent-eval.rubric.v2',
  judge: 'neko.agent-eval.judge.v2',
  repeatedRun: 'neko.agent-eval.repeated-run.v2',
  failureAttribution: 'neko.agent-eval.failure-attribution.v2',
  suiteIndex: 'neko.agent-eval.suite-index.v2',
});

const TARGET_KINDS = Object.freeze([
  'skill',
  'prompt',
  'capability',
  'tool',
  'model',
  'runtime',
  'workflow',
]);
export const CASE_GROUPS = Object.freeze([
  'canonical',
  'paraphrase',
  'boundary',
  'failure',
  'workflow',
  'artifact',
  'quality',
  'regression',
  'holdout',
]);
const OUTCOMES = Object.freeze([
  'pass',
  'case-fail',
  'infrastructure-fail',
  'configuration-invalid',
  'non-comparable',
]);

const ID = s.string({ minLength: 1, maxLength: 160, pattern: /^[a-z0-9][a-z0-9._-]*$/u });
const TEXT = s.string({ minLength: 1, maxLength: 20_000 });
const SHORT_TEXT = s.string({ minLength: 1, maxLength: 1_000 });
const HASH = s.string({ pattern: /^sha256:[a-f0-9]{64}$/u });
const PATH = s.string({ minLength: 1, maxLength: 500, format: 'relative-path' });
const TIMESTAMP = s.string({ format: 'timestamp' });
const EXTERNAL_ID = s.string({ minLength: 1, maxLength: 300, pattern: /^\S+$/u });
const STRING_LIST = s.array(SHORT_TEXT, { minLength: 1, maxLength: 100 });
const ID_LIST = s.array(ID, { minLength: 1, maxLength: 100 });
const EXTERNAL_ID_LIST = s.array(EXTERNAL_ID, { minLength: 1, maxLength: 100 });
const ENV_NAME = s.string({ pattern: /^[A-Z][A-Z0-9_]*$/u });

export const HOST_SKILL_IDENTITY_SCHEMA = s.object({
  name: ID,
  source: s.enum(['project', 'personal', 'builtin', 'market', 'plugin']),
  provenance: s.enum(['workspace', 'user', 'builtin', 'marketplace', 'plugin']),
  rootId: ID,
  relativePath: PATH,
  fingerprint: HASH,
});

const HASHED_TARGET_SCHEMA = s.object({
  kind: s.enum(['prompt', 'capability', 'tool', 'model', 'runtime', 'workflow']),
  id: ID,
  contractHash: HASH,
});
export const TARGET_SCHEMA = s.union([
  s.object({ kind: s.literal('skill'), identity: HOST_SKILL_IDENTITY_SCHEMA }),
  HASHED_TARGET_SCHEMA,
]);

const EVIDENCE_CONTRACT_SCHEMA = s.object({
  userBehavior: TEXT,
  canonicalPath: STRING_LIST,
  forbiddenFallback: STRING_LIST,
  observables: s.array(
    s.object({
      ref: ID,
      kind: s.enum([
        'runtime-fact',
        'post-check',
        'artifact-validator',
        'output-contract',
        'judge-evidence',
      ]),
      description: SHORT_TEXT,
      required: s.boolean(),
    }),
    { minLength: 1, maxLength: 100 },
  ),
  expectedResult: TEXT,
  expectedFailure: TEXT,
});

const COVERAGE_ENTRY_SCHEMA = s.union([
  s.object({ group: s.enum(CASE_GROUPS), disposition: s.literal('required') }),
  s.object({
    group: s.enum(CASE_GROUPS),
    disposition: s.literal('not-applicable'),
    reason: SHORT_TEXT,
  }),
]);
const COVERAGE_DELTA_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.coverageDelta),
  behaviorId: ID,
  groups: s.array(COVERAGE_ENTRY_SCHEMA, {
    minLength: CASE_GROUPS.length,
    maxLength: CASE_GROUPS.length,
  }),
});

const AUTHORING_BASE = {
  schema: s.literal(SCHEMAS.authoringDecision),
  behaviorId: ID,
  target: TARGET_SCHEMA,
  userBehavior: TEXT,
  evidenceContract: EVIDENCE_CONTRACT_SCHEMA,
  coverageDelta: COVERAGE_DELTA_SCHEMA,
};
const AUTHORING_DECISION_SCHEMA = s.union([
  s.object({ ...AUTHORING_BASE, decision: s.literal('reuse'), suiteId: ID }),
  s.object({ ...AUTHORING_BASE, decision: s.literal('update'), suiteId: ID }),
  s.object({ ...AUTHORING_BASE, decision: s.literal('create'), proposedSuiteId: ID }),
  s.object({
    ...AUTHORING_BASE,
    decision: s.literal('excluded'),
    deterministicValidation: s.object({ command: SHORT_TEXT, reason: TEXT }),
  }),
]);

const RUNTIME_SETTINGS_SCHEMA = s.object(
  {},
  {
    executionMode: s.enum(['auto', 'ask', 'plan']),
    temperature: s.number({ min: 0, max: 2 }),
    maxTokens: s.integer({ min: 1 }),
    thinkingBudget: s.integer({ min: 0 }),
    outputFormat: s.enum(['text', 'json', 'markdown']),
  },
);
const RUNTIME_PROFILE_SCHEMA = s.object({
  id: ID,
  settings: RUNTIME_SETTINGS_SCHEMA,
  configurationHash: HASH,
});

const MODEL_BINDING_SCHEMA = s.object(
  { providerId: ID, modelId: EXTERNAL_ID },
  { providerExpressionProfileId: ID },
);
const MODEL_PURPOSES_SCHEMA = s.object(
  {},
  {
    'image.generate': MODEL_BINDING_SCHEMA,
    'image.edit': MODEL_BINDING_SCHEMA,
    'image.understand': MODEL_BINDING_SCHEMA,
    'video.generate': MODEL_BINDING_SCHEMA,
    'video.understand': MODEL_BINDING_SCHEMA,
    'audio.generate': MODEL_BINDING_SCHEMA,
    'audio.tts': MODEL_BINDING_SCHEMA,
    'audio.understand': MODEL_BINDING_SCHEMA,
    'audio.music.generate': MODEL_BINDING_SCHEMA,
  },
);
const MODEL_PROFILE_SCHEMA = s.union([
  s.object(
    {
      id: ID,
      selection: s.literal('explicit'),
      chat: MODEL_BINDING_SCHEMA,
      configurationHash: HASH,
    },
    { purposes: MODEL_PURPOSES_SCHEMA },
  ),
  s.object({
    id: ID,
    selection: s.literal('configured-default'),
    configurationHash: HASH,
  }),
]);

const FIXTURE_SCHEMA = s.object({
  id: ID,
  root: PATH,
  source: s.enum(['repository', 'generated']),
  digest: HASH,
  mutable: s.boolean(),
});

const REPORT_POLICY_SCHEMA = s.object({
  rawRetentionDays: s.integer({ min: 1, max: 30 }),
  trustedCiRetentionDays: s.integer({ min: 1, max: 30 }),
  committedSummary: s.boolean(),
  includeHistory: s.literal(false),
});
const BASELINE_POLICY_SCHEMA = s.union([
  s.object({ mode: s.literal('none') }),
  s.object({ mode: s.literal('approved'), baselineId: ID }),
]);
const SUITE_CASE_INDEX_SCHEMA = s.object({
  id: ID,
  file: PATH,
  group: s.enum(CASE_GROUPS),
  visibility: s.enum(['public', 'holdout']),
});

const SUITE_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.suite),
  id: ID,
  owner: s.object({ kind: s.enum(['skill', 'agent-runtime']), id: ID }),
  target: TARGET_SCHEMA,
  repositoryRevision: SHORT_TEXT,
  runtimeProfiles: s.array(RUNTIME_PROFILE_SCHEMA, { minLength: 1, maxLength: 50 }),
  modelProfiles: s.array(MODEL_PROFILE_SCHEMA, { minLength: 1, maxLength: 50 }),
  judgeProfiles: s.array(
    s.object(
      {
        id: ID,
        adapter: s.literal('openai-chat-completions-v1'),
        providerId: ID,
        modelId: EXTERNAL_ID,
        endpointEnv: ENV_NAME,
        apiKeyEnv: ENV_NAME,
        temperature: s.number({ min: 0, max: 2 }),
        maxTokens: s.integer({ min: 1 }),
        timeoutMs: s.integer({ min: 1, max: 600_000 }),
      },
      { organizationEnv: ENV_NAME },
    ),
    { maxLength: 20 },
  ),
  fixtures: s.array(FIXTURE_SCHEMA, { maxLength: 100 }),
  cases: s.array(SUITE_CASE_INDEX_SCHEMA, { minLength: 1, maxLength: 1_000 }),
  rubricRefs: s.array(PATH, { maxLength: 100 }),
  baselinePolicy: BASELINE_POLICY_SCHEMA,
  reportPolicy: REPORT_POLICY_SCHEMA,
});

const SUITE_INDEX_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.suiteIndex),
  ownerKind: s.enum(['skill', 'agent-runtime']),
  entries: s.array(
    s.object({
      suiteId: ID,
      path: PATH,
      ownerId: ID,
      targetKind: s.enum(TARGET_KINDS),
    }),
    { minLength: 1, maxLength: 1_000 },
  ),
});

const STEP_SCHEMA = s.union([
  s.object(
    { id: ID, kind: s.literal('submit'), prompt: TEXT },
    { delayMs: s.integer({ min: 0, max: 600_000 }) },
  ),
  s.object({ id: ID, kind: s.literal('queue'), prompt: TEXT, afterStepId: ID }),
  s.object({ id: ID, kind: s.literal('wait-for-idle'), timeoutMs: s.integer({ min: 1 }) }),
  s.object({ id: ID, kind: s.literal('cancel'), afterStepId: ID }),
  s.object({ id: ID, kind: s.literal('resume'), conversationRef: s.literal('current') }),
  s.object({ id: ID, kind: s.literal('feedback'), prompt: TEXT, afterStepId: ID }),
  s.object({
    id: ID,
    kind: s.literal('resize'),
    columns: s.integer({ min: 1, max: 1_000 }),
    rows: s.integer({ min: 1, max: 1_000 }),
  }),
]);

const ASSERTION_COMMON = { id: ID, evidenceRef: ID };
const PROMPT_FRAGMENT_SELECTOR_SCHEMA = s.object(
  { id: EXTERNAL_ID, source: EXTERNAL_ID },
  { version: ID, hash: HASH },
);
const PROCESS_EVENT_SELECTOR_SCHEMA = s.union([
  s.object(
    { kind: s.literal('workflow-step'), stepId: ID },
    {
      method: s.enum([
        'message.submit',
        'message.cancel',
        'session.waitForIdle',
        'session.resume',
        'terminal.resize',
      ]),
    },
  ),
  s.object(
    { kind: s.literal('turn'), role: s.enum(['user', 'assistant', 'system', 'tool']) },
    { source: ID },
  ),
  s.object(
    { kind: s.literal('timeline'), eventKind: ID },
    { status: ID, toolName: EXTERNAL_ID, contentContains: SHORT_TEXT },
  ),
  s.object({ kind: s.literal('tool'), name: EXTERNAL_ID }, { status: ID }),
  s.object({ kind: s.literal('task'), taskType: ID }, { status: ID }),
  s.object({ kind: s.literal('continuation'), source: ID }, { status: ID }),
]);
const ASSERTION_SCHEMA = s.union([
  s.object({ ...ASSERTION_COMMON, kind: s.literal('runtime-errors-empty') }),
  s.object({ ...ASSERTION_COMMON, kind: s.literal('fully-idle') }),
  s.object({ ...ASSERTION_COMMON, kind: s.literal('canonical-turn') }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('pi-runtime'),
      implementation: s.literal('pi-agent-core'),
      transcriptAuthority: s.literal('pi-session'),
      productMetadataAuthority: s.literal('sqlite'),
      purpose: s.literal('agent.main'),
      workspaceLocatorKind: s.literal('virtual'),
      turnDurability: s.enum(['durable', 'persistence-delayed']),
    },
    { modelProfileId: ID },
  ),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('final-answer'),
      mode: s.enum(['non-empty', 'contains', 'not-contains']),
    },
    { text: STRING_LIST },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('skill'),
    identity: HOST_SKILL_IDENTITY_SCHEMA,
    status: s.enum(['triggered', 'injected']),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('prompt-composition'),
      requiredFragments: s.array(PROMPT_FRAGMENT_SELECTOR_SCHEMA, {
        minLength: 1,
        maxLength: 100,
      }),
    },
    { forbiddenFragmentIds: EXTERNAL_ID_LIST },
  ),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('markdown-path'),
      requiredEvents: ID_LIST,
    },
    {
      forbiddenEvents: ID_LIST,
      viewportWidths: s.array(s.integer({ min: 1, max: 1_000 }), {
        minLength: 1,
        maxLength: 20,
      }),
      sameRevisionForViewportWidths: s.boolean(),
    },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('model'),
    profileId: ID,
    noFallback: s.boolean(),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('tool-call'),
      name: EXTERNAL_ID,
      status: s.enum(['success', 'error', 'absent']),
    },
    { expectedArguments: s.anyJson(), resultIncludes: s.anyJson() },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('task-terminal'),
    taskType: ID,
    status: s.enum(['completed', 'failed', 'cancelled']),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('todo-projection'),
      maxItems: s.integer({ min: 1, max: 20 }),
      atMostOneInProgress: s.boolean(),
    },
    {
      requiredStatuses: s.array(s.enum(['pending', 'in_progress', 'completed', 'blocked']), {
        minLength: 1,
        maxLength: 4,
      }),
    },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('process-order'),
    events: s.array(PROCESS_EVENT_SELECTOR_SCHEMA, { minLength: 2, maxLength: 100 }),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('queue-state'),
      stepId: ID,
      status: s.enum(['queued', 'drained', 'paused-after-cancel']),
    },
    { minPending: s.integer({ min: 0 }) },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('cancellation'),
    stepId: ID,
    accepted: s.boolean(),
  }),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('recovery'),
    resumeStepId: ID,
    submitStepId: ID,
    idleStepId: ID,
  }),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('conversation-persistence'),
    authority: s.literal('pi-session'),
    catalog: s.literal('sqlite'),
    databaseScope: s.literal('user-global'),
    resumeStatus: s.literal('restored'),
    recordSource: s.literal('pi-session'),
    minRestoredMessages: s.integer({ min: 1 }),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('retries'),
      min: s.integer({ min: 0 }),
    },
    { max: s.integer({ min: 0 }), taskType: ID },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('terminal-idle'),
    concerns: s.array(
      s.enum([
        'turnIdle',
        'backgroundTasksIdle',
        'mediaDeliveryIdle',
        'taskResultObservationIdle',
        'continuationQueueIdle',
      ]),
      { minLength: 1, maxLength: 5 },
    ),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('structured-output'),
      format: s.enum(['json', 'table', 'markdown', 'text']),
    },
    {
      schemaRef: PATH,
      requiredFields: STRING_LIST,
      forbiddenFields: STRING_LIST,
      requiredReferences: STRING_LIST,
      locale: s.enum(['en', 'en-us', 'zh', 'zh-cn', 'ja', 'ja-jp']),
    },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('artifact'),
    artifactRef: EXTERNAL_ID,
    validatorStatus: s.literal('valid'),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('artifact'),
      artifactKind: s.enum([
        'file',
        'resource-ref',
        'generated-asset',
        'project-revision',
        'composite-artifact',
      ]),
      validatorStatus: s.literal('valid'),
    },
    { provenanceSource: EXTERNAL_ID },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('no-fallback'),
    forbiddenRefs: EXTERNAL_ID_LIST,
  }),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('workspace-board-projection'),
    status: s.enum(['projected', 'noop']),
    targetKind: s.literal('workspace'),
    minNodeIds: s.integer({ min: 1 }),
    revisionRequired: s.boolean(),
    diagnosticsEmpty: s.boolean(),
  }),
]);

const ARTIFACT_CHECK_SCHEMA = s.union([
  s.object({
    id: ID,
    kind: s.literal('file-absent'),
    evidenceRef: ID,
    path: PATH,
  }),
  s.object({
    id: ID,
    kind: s.literal('directory-files'),
    evidenceRef: ID,
    path: PATH,
    minFiles: s.integer({ min: 1 }),
  }),
  s.object({
    id: ID,
    kind: s.literal('file'),
    evidenceRef: ID,
    path: PATH,
    digest: HASH,
    validatorId: ID,
  }),
  s.object({
    id: ID,
    kind: s.literal('resource-ref'),
    evidenceRef: ID,
    ref: ID,
    digest: HASH,
    validatorId: ID,
  }),
  s.object({
    id: ID,
    kind: s.literal('generated-asset'),
    evidenceRef: ID,
    ref: ID,
    digest: HASH,
    validatorId: ID,
  }),
  s.object({
    id: ID,
    kind: s.literal('project-revision'),
    evidenceRef: ID,
    ref: ID,
    revision: ID,
    validatorId: ID,
  }),
]);

const RUBRIC_CRITERION_SCHEMA = s.object({
  id: ID,
  description: TEXT,
  weight: s.number({ min: 0.01, max: 1 }),
  evidenceRefs: ID_LIST,
});
const RUBRIC_DEFINITION_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.rubric),
  id: ID,
  domain: ID,
  version: ID,
  minimumScore: s.number({ min: 0, max: 5 }),
  maximumUncertainty: s.number({ min: 0, max: 1 }),
  criteria: s.array(RUBRIC_CRITERION_SCHEMA, { minLength: 1, maxLength: 50 }),
});
const RUBRIC_SCHEMA = s.object({
  kind: s.literal('domain-rubric'),
  ref: PATH,
  judgeProfileId: ID,
});

const BUDGET_SCHEMA = s.object(
  { timeoutMs: s.integer({ min: 1 }), repetitions: s.integer({ min: 1, max: 100 }) },
  { maxTokens: s.integer({ min: 1 }), maxCostUsd: s.number({ min: 0 }) },
);

const SCENARIO_SCHEMA = s.object(
  {
    schema: s.literal(SCHEMAS.scenario),
    id: ID,
    suiteId: ID,
    caseGroup: s.enum(CASE_GROUPS),
    visibility: s.enum(['public', 'holdout']),
    evidenceContract: EVIDENCE_CONTRACT_SCHEMA,
    fixtureRefs: s.array(ID, { maxLength: 100 }),
    runtimeProfileId: ID,
    modelProfileIds: ID_LIST,
    steps: s.array(STEP_SCHEMA, { minLength: 1, maxLength: 100 }),
    assertions: s.array(ASSERTION_SCHEMA, { minLength: 1, maxLength: 200 }),
    artifactChecks: s.array(ARTIFACT_CHECK_SCHEMA, { maxLength: 100 }),
    budget: BUDGET_SCHEMA,
  },
  { rubric: RUBRIC_SCHEMA },
);

const ASSERTION_RESULT_SCHEMA = s.object(
  { id: ID, status: s.enum(['pass', 'fail', 'blocked']), evidenceRefs: ID_LIST },
  { message: TEXT },
);
const USAGE_SCHEMA = s.object(
  { latencyMs: s.integer({ min: 0 }), retries: s.integer({ min: 0 }) },
  {
    inputTokens: s.integer({ min: 0 }),
    outputTokens: s.integer({ min: 0 }),
    contextTokens: s.integer({ min: 0 }),
    costUsd: s.number({ min: 0 }),
  },
);
const CONFIG_IDENTITY_SCHEMA = s.union([
  s.object({ runtimeProfileId: ID, modelProfileId: ID, digest: HASH }),
  s.object({
    runtimeProfileId: ID,
    modelProfileId: ID,
    status: s.literal('missing'),
    diagnostic: TEXT,
  }),
]);
const REPORT_LOCATIONS_SCHEMA = s.object(
  { result: PATH, evidence: PATH, artifactManifest: PATH, qualityReport: PATH },
  { judge: PATH, baselineDiff: PATH },
);

const RESULT_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.result),
  reportId: ID,
  suiteId: ID,
  caseId: ID,
  runId: ID,
  outcome: s.enum(OUTCOMES),
  target: TARGET_SCHEMA,
  repositoryRevision: SHORT_TEXT,
  modelIdentity: MODEL_BINDING_SCHEMA,
  effectiveConfiguration: CONFIG_IDENTITY_SCHEMA,
  fixtureDigest: HASH,
  command: SHORT_TEXT,
  assertions: s.array(ASSERTION_RESULT_SCHEMA, { minLength: 1, maxLength: 200 }),
  artifactRefs: s.array(EXTERNAL_ID, { maxLength: 100 }),
  usage: USAGE_SCHEMA,
  reportLocations: REPORT_LOCATIONS_SCHEMA,
  skippedStages: s.array(ID, { maxLength: 50 }),
  residualRisk: s.array(TEXT, { maxLength: 50 }),
});

const EVIDENCE_ITEM_SCHEMA = s.object(
  {
    ref: EXTERNAL_ID,
    kind: s.enum([
      'runtime-fact',
      'output',
      'artifact',
      'validator',
      'hard-gate',
      'judge',
      'attribution',
    ]),
    source: ID,
    summary: TEXT,
    complete: s.boolean(),
  },
  { digest: HASH, droppedCount: s.integer({ min: 0 }), data: s.anyJson() },
);
const EVIDENCE_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.evidence),
  reportId: ID,
  items: s.array(EVIDENCE_ITEM_SCHEMA, { minLength: 1, maxLength: 5_000 }),
  redactions: s.array(s.object({ kind: ID, count: s.integer({ min: 1 }) }), { maxLength: 100 }),
});

const ARTIFACT_MANIFEST_ENTRY_SCHEMA = s.union([
  s.object({
    ref: EXTERNAL_ID,
    kind: s.literal('file'),
    path: PATH,
    digest: HASH,
    provenance: ID,
    deliveryStatus: s.enum(['delivered', 'failed', 'unknown']),
    validatorId: ID,
    validatorStatus: s.enum(['valid', 'invalid', 'unavailable']),
  }),
  s.object({
    ref: EXTERNAL_ID,
    kind: s.enum(['resource-ref', 'generated-asset', 'project-revision', 'composite-artifact']),
    stableRef: EXTERNAL_ID,
    digest: HASH,
    provenance: ID,
    deliveryStatus: s.enum(['delivered', 'failed', 'unknown']),
    validatorId: ID,
    validatorStatus: s.enum(['valid', 'invalid', 'unavailable']),
  }),
]);
const ARTIFACT_MANIFEST_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.artifactManifest),
  reportId: ID,
  artifacts: s.array(ARTIFACT_MANIFEST_ENTRY_SCHEMA, { maxLength: 1_000 }),
});

const POLICY_IDENTITY_SCHEMA = s.object({ id: ID, version: ID, digest: HASH });
const DISTRIBUTION_SCHEMA = s.object({
  samples: s.integer({ min: 1 }),
  passRate: s.number({ min: 0, max: 1 }),
  mean: s.number(),
  variance: s.number({ min: 0 }),
});
const BASELINE_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.baseline),
  id: ID,
  target: TARGET_SCHEMA,
  repositoryRevision: SHORT_TEXT,
  fixtureDigest: HASH,
  runtimeProfileId: ID,
  modelProfileIds: ID_LIST,
  samplingPolicy: POLICY_IDENTITY_SCHEMA,
  budget: BUDGET_SCHEMA,
  validatorPolicy: POLICY_IDENTITY_SCHEMA,
  judgePolicy: POLICY_IDENTITY_SCHEMA,
  hardGateIds: ID_LIST,
  scoreDistribution: DISTRIBUTION_SCHEMA,
  reportId: ID,
  approver: SHORT_TEXT,
  approvedAt: TIMESTAMP,
});

const COMPARISON_SCHEMA = s.object(
  {
    schema: s.literal(SCHEMAS.comparison),
    id: ID,
    baselineId: ID,
    currentReportIds: ID_LIST,
    outcome: s.enum(['improved', 'regressed', 'unchanged', 'non-comparable']),
    comparable: s.boolean(),
    dimensions: s.array(
      s.object({ id: ID, comparable: s.boolean(), baseline: SHORT_TEXT, current: SHORT_TEXT }),
      { minLength: 1, maxLength: 100 },
    ),
    evidenceRefs: ID_LIST,
  },
  { improvementPercent: s.number(), reason: TEXT },
);

const JUDGE_CRITERION_RESULT_SCHEMA = s.object({
  criterionId: ID,
  score: s.number({ min: 0, max: 5 }),
  evidenceRefs: ID_LIST,
  reason: TEXT,
  uncertainty: s.number({ min: 0, max: 1 }),
});
const JUDGE_RESULT_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.judge),
  reportId: ID,
  suiteId: ID,
  caseId: ID,
  runId: ID,
  providerId: ID,
  modelId: EXTERNAL_ID,
  profileId: ID,
  rubricId: ID,
  rubricVersion: ID,
  promptHash: HASH,
  sampling: s.object({
    temperature: s.number({ min: 0, max: 2 }),
    maxTokens: s.integer({ min: 1 }),
  }),
  criteria: s.array(JUDGE_CRITERION_RESULT_SCHEMA, { minLength: 1, maxLength: 50 }),
  overallScore: s.number({ min: 0, max: 5 }),
  uncertainty: s.number({ min: 0, max: 1 }),
  summary: TEXT,
  disposition: s.enum(['eligible', 'supplemental']),
  usage: s.object({ inputTokens: s.integer({ min: 0 }), outputTokens: s.integer({ min: 0 }) }),
});

const REPEATED_RUN_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.repeatedRun),
  suiteId: ID,
  caseId: ID,
  runId: ID,
  outcome: s.enum(OUTCOMES),
  samples: s.array(
    s.object(
      {
        runId: ID,
        reportId: ID,
        outcome: s.enum(OUTCOMES),
        result: PATH,
        evidence: PATH,
      },
      { judge: PATH },
    ),
    { minLength: 2, maxLength: 100 },
  ),
  passRate: s.number({ min: 0, max: 1 }),
  scoreDistribution: s.object(
    { samples: s.integer({ min: 0 }), passRate: s.number({ min: 0, max: 1 }) },
    { mean: s.number({ min: 0, max: 5 }), variance: s.number({ min: 0 }) },
  ),
  hardGates: s.object({
    passed: s.integer({ min: 0 }),
    failed: s.integer({ min: 0 }),
    blocked: s.integer({ min: 0 }),
  }),
  latency: s.object({
    totalMs: s.integer({ min: 0 }),
    meanMs: s.number({ min: 0 }),
    p50Ms: s.number({ min: 0 }),
    p95Ms: s.number({ min: 0 }),
  }),
  tokens: s.object({ input: s.integer({ min: 0 }), output: s.integer({ min: 0 }) }),
  cost: s.union([
    s.object({ status: s.literal('unavailable') }),
    s.object({ status: s.literal('available'), totalUsd: s.number({ min: 0 }) }),
  ]),
  iterations: s.object({ total: s.integer({ min: 0 }), mean: s.number({ min: 0 }) }),
  tools: s.object({
    calls: s.integer({ min: 0 }),
    successes: s.integer({ min: 0 }),
    failures: s.integer({ min: 0 }),
  }),
  retries: s.object({ count: s.integer({ min: 0 }) }),
  tasks: s.object({
    total: s.integer({ min: 0 }),
    completed: s.integer({ min: 0 }),
    failed: s.integer({ min: 0 }),
    cancelled: s.integer({ min: 0 }),
  }),
});

const FAILURE_ATTRIBUTION_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.failureAttribution),
  reportId: ID,
  observedFailures: s.array(s.object({ id: ID, kind: ID, summary: TEXT, evidenceRefs: ID_LIST }), {
    minLength: 1,
    maxLength: 200,
  }),
  hypotheses: s.array(
    s.object({
      observedFailureId: ID,
      suspectedOwner: s.enum([
        'skill-content',
        'prompt',
        'routing',
        'capability-tool',
        'runtime-session',
        'provider-infrastructure',
        'artifact-authoring',
        'evaluation-infrastructure',
      ]),
      confidence: s.number({ min: 0, max: 1 }),
      evidenceRefs: ID_LIST,
      missingEvidence: s.array(TEXT, { minLength: 1, maxLength: 20 }),
      handoffRecommendation: TEXT,
    }),
    { maxLength: 200 },
  ),
});

const DEFAULT_EXECUTION_SUPPORT = Object.freeze({
  stepKinds: new Set([
    'submit',
    'queue',
    'wait-for-idle',
    'cancel',
    'resume',
    'feedback',
    'resize',
  ]),
  assertionKinds: new Set([
    'runtime-errors-empty',
    'fully-idle',
    'canonical-turn',
    'pi-runtime',
    'final-answer',
    'skill',
    'prompt-composition',
    'model',
    'tool-call',
    'task-terminal',
    'todo-projection',
    'process-order',
    'queue-state',
    'cancellation',
    'recovery',
    'conversation-persistence',
    'retries',
    'terminal-idle',
    'structured-output',
    'markdown-path',
    'artifact',
    'workspace-board-projection',
    'no-fallback',
  ]),
  artifactCheckKinds: new Set([
    'file',
    'file-absent',
    'directory-files',
    'resource-ref',
    'generated-asset',
    'project-revision',
  ]),
  judgeKinds: new Set(['domain-rubric']),
});

export function validateAuthoringDecision(input) {
  validateStrict(input, AUTHORING_DECISION_SCHEMA, 'authoringDecision');
  validateCoverageDelta(input.coverageDelta);
  if (input.coverageDelta.behaviorId !== input.behaviorId) {
    throw new Error('authoringDecision coverageDelta.behaviorId must equal behaviorId');
  }
  validateTargetSemantics(input.target, 'authoringDecision.target');
  validateEvidenceContract(input.evidenceContract, 'authoringDecision.evidenceContract');
  return input;
}

function validateCoverageDelta(input) {
  validateStrict(input, COVERAGE_DELTA_SCHEMA, 'coverageDelta');
  const observed = input.groups.map((entry) => entry.group);
  const duplicates = observed.filter((group, index) => observed.indexOf(group) !== index);
  const missing = CASE_GROUPS.filter((group) => !observed.includes(group));
  if (duplicates.length > 0 || missing.length > 0) {
    throw new Error(
      `coverageDelta.groups must contain every case group exactly once; duplicate=${[...new Set(duplicates)].join(',') || 'none'} missing=${missing.join(',') || 'none'}`,
    );
  }
  return input;
}

export function validateSuite(input) {
  validateStrict(input, SUITE_SCHEMA, 'suite');
  validateTargetSemantics(input.target, 'suite.target');
  assertUnique(
    input.runtimeProfiles.map((item) => item.id),
    'suite.runtimeProfiles ids',
  );
  assertUnique(
    input.modelProfiles.map((item) => item.id),
    'suite.modelProfiles ids',
  );
  assertUnique(
    input.judgeProfiles.map((item) => item.id),
    'suite.judgeProfiles ids',
  );
  assertUnique(
    input.fixtures.map((item) => item.id),
    'suite.fixtures ids',
  );
  assertUnique(
    input.cases.map((item) => item.id),
    'suite.cases ids',
  );
  for (const item of input.cases) {
    if ((item.group === 'holdout') !== (item.visibility === 'holdout')) {
      throw new Error(`suite case ${item.id} holdout group and visibility must agree`);
    }
  }
  return input;
}

export function validateSuiteIndex(input) {
  validateStrict(input, SUITE_INDEX_SCHEMA, 'suiteIndex');
  assertUnique(
    input.entries.map((item) => item.suiteId),
    'suite index ids',
  );
  assertUnique(
    input.entries.map((item) => item.path),
    'suite index paths',
  );
  return input;
}

export function validateScenario(input) {
  validateStrict(input, SCENARIO_SCHEMA, 'scenario');
  validateEvidenceContract(input.evidenceContract, 'scenario.evidenceContract');
  assertUnique(
    input.steps.map((item) => item.id),
    'scenario.steps ids',
  );
  assertUnique(
    input.assertions.map((item) => item.id),
    'scenario.assertions ids',
  );
  assertUnique(
    input.artifactChecks.map((item) => item.id),
    'scenario.artifactChecks ids',
  );
  validateWorkflowSteps(input.steps);
  const evidenceRefs = new Set(input.evidenceContract.observables.map((item) => item.ref));
  for (const item of [...input.assertions, ...input.artifactChecks]) {
    if (!evidenceRefs.has(item.evidenceRef)) {
      throw new Error(`${item.kind} ${item.id} references undeclared evidence ${item.evidenceRef}`);
    }
  }
  if ((input.caseGroup === 'holdout') !== (input.visibility === 'holdout')) {
    throw new Error('scenario holdout group and visibility must agree');
  }
  return input;
}

export function validateRubricDefinition(input) {
  validateStrict(input, RUBRIC_DEFINITION_SCHEMA, 'rubric');
  assertUnique(
    input.criteria.map((item) => item.id),
    'rubric criteria ids',
  );
  const weight = input.criteria.reduce((total, item) => total + item.weight, 0);
  if (Math.abs(weight - 1) > 1e-9) {
    throw new Error(`rubric criteria weights must sum to 1; observed ${weight}`);
  }
  return input;
}

export function validateJudgeResult(input) {
  validateStrict(input, JUDGE_RESULT_SCHEMA, 'judgeResult');
  assertUnique(
    input.criteria.map((item) => item.criterionId),
    'Judge criterion ids',
  );
  return input;
}

export function validateRepeatedRun(input) {
  return validateStrict(input, REPEATED_RUN_SCHEMA, 'repeatedRun');
}

export function validateFailureAttribution(input) {
  validateStrict(input, FAILURE_ATTRIBUTION_SCHEMA, 'failureAttribution');
  assertUnique(
    input.observedFailures.map((item) => item.id),
    'observed failure ids',
  );
  const observed = new Set(input.observedFailures.map((item) => item.id));
  for (const hypothesis of input.hypotheses) {
    if (!observed.has(hypothesis.observedFailureId)) {
      throw new Error(
        `failure hypothesis references unknown observation ${hypothesis.observedFailureId}`,
      );
    }
  }
  return input;
}

function validateWorkflowSteps(steps) {
  const prior = new Map();
  let state = 'idle';
  let hasSessionTurn = false;
  let previous;
  for (const step of steps) {
    if ('afterStepId' in step) {
      const referenced = prior.get(step.afterStepId);
      if (!referenced) {
        throw new Error(`${step.kind} ${step.id} afterStepId must reference an earlier step`);
      }
      if (step.kind === 'queue' && !['submit', 'queue'].includes(referenced.kind)) {
        throw new Error(`queue ${step.id} must reference a submit or queue step`);
      }
      if (step.kind === 'cancel' && !['submit', 'queue', 'feedback'].includes(referenced.kind)) {
        throw new Error(`cancel ${step.id} must reference an active message submission step`);
      }
      if (step.kind === 'feedback' && referenced.kind !== 'wait-for-idle') {
        throw new Error(`feedback ${step.id} must reference a wait-for-idle step`);
      }
      if (step.afterStepId !== previous?.id) {
        throw new Error(`${step.kind} ${step.id} afterStepId must reference the previous step`);
      }
    }
    if (step.kind === 'feedback' && !step.prompt.includes('${lastAssistant}')) {
      throw new Error(`feedback ${step.id} prompt must include \${lastAssistant}`);
    }
    if (step.kind === 'submit') {
      if (state !== 'idle') {
        throw new Error(`submit ${step.id} requires idle state; use queue while a turn is active`);
      }
      state = 'active';
      hasSessionTurn = true;
    } else if (step.kind === 'queue') {
      if (state !== 'active') throw new Error(`queue ${step.id} requires an active turn`);
    } else if (step.kind === 'cancel') {
      if (state !== 'active') throw new Error(`cancel ${step.id} requires an active turn`);
      state = 'cancelling';
    } else if (step.kind === 'wait-for-idle') {
      state = 'idle';
    } else if (step.kind === 'feedback') {
      if (state !== 'idle') throw new Error(`feedback ${step.id} requires idle state`);
      state = 'active';
      hasSessionTurn = true;
    } else if (step.kind === 'resume') {
      if (!hasSessionTurn) {
        throw new Error(`resume ${step.id} cannot reference current before a session turn`);
      }
      if (state !== 'idle') throw new Error(`resume ${step.id} requires idle state`);
    } else if (step.kind === 'resize') {
      if (state !== 'idle') throw new Error(`resize ${step.id} requires idle state`);
    }
    prior.set(step.id, step);
    previous = step;
  }
  if (!hasSessionTurn) throw new Error('workflow must submit at least one Agent turn');
  if (steps.at(-1)?.kind !== 'wait-for-idle') {
    throw new Error('workflow must end with wait-for-idle');
  }
}

export function validateScenarioForExecution(input, support = DEFAULT_EXECUTION_SUPPORT) {
  validateScenario(input);
  assertSupportedKinds(input.steps, support.stepKinds, 'step');
  assertSupportedKinds(input.assertions, support.assertionKinds, 'assertion evaluator');
  assertSupportedKinds(input.artifactChecks, support.artifactCheckKinds, 'artifact evaluator');
  assertSupportedArtifactValidators(input.artifactChecks);
  if (input.rubric && !support.judgeKinds.has(input.rubric.kind)) {
    throw new Error(`unsupported Judge evaluator: ${input.rubric.kind}`);
  }
  return input;
}

export function validateResult(input) {
  return validateStrict(input, RESULT_SCHEMA, 'result');
}

export function validateEvidence(input) {
  validateStrict(input, EVIDENCE_SCHEMA, 'evidence');
  assertUnique(
    input.items.map((item) => item.ref),
    'evidence item refs',
  );
  return input;
}

export function validateArtifactManifest(input) {
  validateStrict(input, ARTIFACT_MANIFEST_SCHEMA, 'artifactManifest');
  assertUnique(
    input.artifacts.map((item) => item.ref),
    'artifact refs',
  );
  return input;
}

export function validateBaseline(input) {
  validateStrict(input, BASELINE_SCHEMA, 'baseline');
  validateTargetSemantics(input.target, 'baseline.target');
  return input;
}

export function validateComparison(input) {
  validateStrict(input, COMPARISON_SCHEMA, 'comparison');
  if (!input.comparable && input.outcome !== 'non-comparable') {
    throw new Error('comparison outcome must be non-comparable when comparable is false');
  }
  if (input.outcome === 'non-comparable' && input.improvementPercent !== undefined) {
    throw new Error('non-comparable comparison must not include improvementPercent');
  }
  return input;
}

function validateTargetSemantics(target, label) {
  if (target.kind !== 'skill') return;
  const { identity } = target;
  const directoryName = identity.relativePath.split('/').at(-1);
  if (directoryName !== identity.name) {
    throw new Error(`${label}.identity.name must equal the relativePath directory name`);
  }
  const expectedProvenance = {
    project: 'workspace',
    personal: 'user',
    builtin: 'builtin',
    market: 'marketplace',
    plugin: 'plugin',
  }[identity.source];
  if (identity.provenance !== expectedProvenance) {
    throw new Error(`${label}.identity.provenance does not match Host source ${identity.source}`);
  }
}

function validateEvidenceContract(contract, label) {
  assertUnique(
    contract.observables.map((item) => item.ref),
    `${label} observable refs`,
  );
  if (!contract.observables.some((item) => item.required)) {
    throw new Error(`${label} must declare at least one required observable`);
  }
}

function assertUnique(values, label) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) throw new Error(`${label} must be unique; duplicate=${duplicate}`);
}

function assertSupportedKinds(items, supported, label) {
  for (const item of items) {
    if (!supported.has(item.kind)) throw new Error(`unsupported ${label}: ${item.kind}`);
  }
}
