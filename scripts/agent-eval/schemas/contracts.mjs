import { schema as s, validateStrict } from './strict-schema.mjs';
import { assertSupportedArtifactValidators } from './artifact-validator-policy.mjs';

export const SCHEMAS = Object.freeze({
  authoringDecision: 'neko.agent-eval.authoring-decision',
  coverageDelta: 'neko.agent-eval.coverage-delta',
  suite: 'neko.agent-eval.suite',
  scenario: 'neko.agent-eval.scenario',
  result: 'neko.agent-eval.result',
  evidence: 'neko.agent-eval.evidence',
  artifactManifest: 'neko.agent-eval.artifact-manifest',
  baseline: 'neko.agent-eval.baseline',
  comparison: 'neko.agent-eval.comparison',
  rubric: 'neko.agent-eval.rubric',
  judge: 'neko.agent-eval.judge',
  aggregate: 'neko.agent-eval.aggregate',
  failureAttribution: 'neko.agent-eval.failure-attribution',
  suiteIndex: 'neko.agent-eval.suite-index',
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

const AGENT_CONTEXT_PAYLOAD_SCHEMA = s.object(
  {
    type: s.enum([
      'canvas-node',
      'cut-clip',
      'story-selection',
      'character',
      'scene',
      'asset',
      'media',
      'entity',
      'sketch-layer',
      '3d-reference',
      'audio-clip',
      'file',
      'image',
      'document-selection',
      'canvas-storyboard-action-intent',
    ]),
    id: EXTERNAL_ID,
    label: SHORT_TEXT,
    summary: SHORT_TEXT,
    data: s.anyJson(),
  },
  { intent: SHORT_TEXT },
);

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

const FIXTURE_SCHEMA = s.object(
  {
    id: ID,
    root: PATH,
    source: s.enum(['repository', 'generated']),
    digest: HASH,
    mutable: s.boolean(),
  },
  {
    links: s.array(s.object({ path: PATH, target: PATH }), { minLength: 1, maxLength: 100 }),
    mediaLibrary: s.object({ libraryName: ID, source: PATH, contentLabel: SHORT_TEXT }),
  },
);

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
  runtimeProfiles: s.array(RUNTIME_PROFILE_SCHEMA, { minLength: 1, maxLength: 50 }),
  modelProfiles: s.array(MODEL_PROFILE_SCHEMA, { minLength: 1, maxLength: 50 }),
  judgeProfiles: s.array(
    s.object(
      {
        id: ID,
        adapter: s.literal('openai-chat-completions'),
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
  s.object({ id: ID, kind: s.literal('draft-bind'), target: s.literal('assistant') }),
  s.object({
    id: ID,
    kind: s.literal('draft-submit'),
    catalogRef: ID,
    input: s.union([
      s.object({ kind: s.literal('message'), text: TEXT }),
      s.object({ kind: s.enum(['command', 'skill']), name: ID }, { args: SHORT_TEXT }),
    ]),
    expectedStatus: s.literal('rejected'),
  }),
  s.object(
    { id: ID, kind: s.literal('submit'), prompt: TEXT },
    {
      delayMs: s.integer({ min: 0, max: 600_000 }),
      contextPayloads: s.array(AGENT_CONTEXT_PAYLOAD_SCHEMA, { minLength: 1, maxLength: 20 }),
      modelProfileId: ID,
    },
  ),
  s.object(
    { id: ID, kind: s.literal('queue'), prompt: TEXT, afterStepId: ID },
    { modelProfileId: ID },
  ),
  s.object({ id: ID, kind: s.literal('send-queued-now'), queueStepId: ID }),
  s.object({ id: ID, kind: s.literal('wait-for-idle'), timeoutMs: s.integer({ min: 1 }) }),
  s.object({ id: ID, kind: s.literal('cancel'), afterStepId: ID }),
  s.object({
    id: ID,
    kind: s.literal('confirm'),
    afterStepId: ID,
    toolName: EXTERNAL_ID,
    approved: s.boolean(),
    timeoutMs: s.integer({ min: 1, max: 600_000 }),
  }),
  s.object({ id: ID, kind: s.literal('resume'), conversationRef: s.literal('current') }),
  s.object({ id: ID, kind: s.literal('restart'), conversationRef: s.literal('current') }),
  s.object({ id: ID, kind: s.literal('feedback'), prompt: TEXT, afterStepId: ID }),
  s.object(
    {
      id: ID,
      kind: s.literal('update-configuration'),
      providerId: ID,
      modelId: EXTERNAL_ID,
      expectedStatus: s.enum(['applied', 'rejected']),
      turnState: s.enum(['running', 'idle']),
      timeoutMs: s.integer({ min: 1, max: 600_000 }),
    },
    { modelProfileId: ID, afterStepId: ID },
  ),
  s.object(
    {
      id: ID,
      kind: s.literal('invoke-input'),
      trigger: s.enum(['command', 'skill']),
      name: ID,
      timeoutMs: s.integer({ min: 1, max: 600_000 }),
    },
    {
      args: SHORT_TEXT,
      resultEvent: s.enum(['compressionResult', 'historyCleared']),
    },
  ),
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
  { hash: HASH },
);
const PROCESS_EVENT_SELECTOR_SCHEMA = s.union([
  s.object(
    { kind: s.literal('workflow-step'), stepId: ID },
    {
      method: s.enum([
        'draft.binding.update',
        'draft.input.submit',
        'message.submit',
        'message.cancel',
        'message.queue.send-now',
        'tool.confirm',
        'session.waitForIdle',
        'session.resume',
        'agent-input.invoke',
        'conversation.configuration.update',
        'terminal.resize',
      ]),
    },
  ),
  s.object(
    { kind: s.literal('turn'), role: s.enum(['user', 'assistant', 'system', 'tool']) },
    { source: ID, contentContains: SHORT_TEXT },
  ),
  s.object(
    { kind: s.literal('timeline'), eventKind: ID },
    { status: ID, toolName: EXTERNAL_ID, contentContains: SHORT_TEXT },
  ),
  s.object({ kind: s.literal('tool'), name: EXTERNAL_ID }, { status: ID }),
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
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('prompt-composition'),
    requiredFragments: s.array(PROMPT_FRAGMENT_SELECTOR_SCHEMA, {
      minLength: 1,
      maxLength: 100,
    }),
  }),
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
    },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('model'),
    profileId: ID,
  }),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('model-sequence'),
    turns: s.array(s.object({ idleStepId: ID, profileId: ID }), { minLength: 2, maxLength: 100 }),
  }),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('interaction-binding'),
    initialPhase: s.literal('draft'),
    initialBindingKind: s.enum(['unbound', 'assistant', 'workspace']),
    finalPhase: s.literal('session'),
    finalBindingKind: s.enum(['assistant', 'workspace']),
    conversationCreated: s.literal(true),
  }),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('input-invocation'),
    stepId: ID,
    trigger: s.enum(['command', 'skill']),
    name: ID,
    status: s.literal('completed'),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('draft-rejection'),
      stepId: ID,
      catalogRef: ID,
      initialBindingKind: s.enum(['unbound', 'assistant', 'workspace']),
      currentBindingKind: s.enum(['unbound', 'assistant', 'workspace']),
      surfaceBindingKind: s.enum(['unbound', 'assistant', 'workspace']),
      conversationCreated: s.literal(false),
      messageIncludes: SHORT_TEXT,
    },
    { availabilityCode: ID },
  ),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('configuration-update'),
      stepId: ID,
      providerId: ID,
      modelId: EXTERNAL_ID,
      status: s.enum(['applied', 'rejected']),
      turnState: s.enum(['running', 'idle']),
      turnCreated: s.literal(false),
    },
    { modelProfileId: ID },
  ),
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
    kind: s.literal('automation-tool-result'),
    name: EXTERNAL_ID,
    profileId: ID,
    targetLabel: SHORT_TEXT,
    mode: s.enum(['observe', 'browse-read', 'interact']),
    sessionStatus: s.literal('active'),
    remainingSteps: s.integer({ min: 0, max: 99 }),
    requiredEvidenceKinds: s.array(s.enum(['text', 'structured', 'transient-image', 'mutation']), {
      minLength: 1,
      maxLength: 4,
    }),
    observationTransport: s.enum(['transient-receipt', 'none']),
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
  s.union([
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
      kind: s.literal('queue-state'),
      stepId: ID,
      status: s.literal('resumed-by-send-now'),
      queueStepId: ID,
    }),
  ]),
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
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('terminal-idle'),
    concerns: s.array(s.enum(['turnIdle', 'continuationQueueIdle']), {
      minLength: 1,
      maxLength: 2,
    }),
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('timeline-projection'),
      terminalStatus: s.enum(['completed', 'cancelled', 'failed']),
    },
    { toolName: EXTERNAL_ID },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('resource-display-projection'),
    projectionKind: s.enum(['attachment', 'tool-result', 'perception', 'timeline', 'artifact']),
    status: s.enum(['authorized', 'denied']),
    locatorKind: s.enum([
      'workspace-file',
      'document-entry',
      'generated-output',
      'package-resource',
      'content-representation',
    ]),
    transport: s.enum(['openneko-resource', 'none']),
    renderTarget: s.literal('agent-webview'),
    diagnosticsEmpty: s.boolean(),
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
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('artifact'),
      artifactRef: EXTERNAL_ID,
      validatorStatus: s.literal('valid'),
    },
    { validatorId: ID },
  ),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('artifact'),
      artifactKind: s.enum([
        'file',
        'content-locator',
        'resource-ref',
        'generated-asset',
        'project-revision',
        'composite-artifact',
      ]),
      validatorStatus: s.literal('valid'),
    },
    {
      provenanceSource: EXTERNAL_ID,
      validatorId: ID,
      contentLocatorKind: s.enum([
        'workspace-file',
        'document-entry',
        'generated-output',
        'package-resource',
      ]),
    },
  ),
  s.object({
    ...ASSERTION_COMMON,
    kind: s.literal('content-locator-handoff'),
    producerToolName: EXTERNAL_ID,
    consumerToolName: EXTERNAL_ID,
    locatorKind: s.enum([
      'workspace-file',
      'document-entry',
      'generated-output',
      'package-resource',
    ]),
    artifactKind: s.enum(['content-locator', 'generated-asset']),
    provenanceSource: EXTERNAL_ID,
    validatorId: ID,
  }),
  s.object(
    {
      ...ASSERTION_COMMON,
      kind: s.literal('workspace-board-projection'),
      status: s.enum(['projected', 'noop']),
      targetKind: s.literal('workspace'),
      minNodeIds: s.integer({ min: 1 }),
      sourceFingerprintRequired: s.boolean(),
      diagnosticsEmpty: s.boolean(),
    },
    {
      minConnectionIds: s.integer({ min: 0 }),
    },
  ),
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

const DESKTOP_EXECUTION_SCHEMA = s.object(
  {
    evidenceLevel: s.enum(['key-free', 'hidden-desktop', 'visible-desktop']),
    resourceClass: s.enum(['text', 'external-tool', 'media', 'visible-ui']),
    protected: s.boolean(),
  },
  {
    lifecycleChecks: s.array(s.enum(['renderer-reload', 'composer-focus', 'graceful-close']), {
      minLength: 1,
      maxLength: 3,
    }),
    startSurface: s.enum(['entry', 'workspace']),
  },
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
  { rubric: RUBRIC_SCHEMA, execution: DESKTOP_EXECUTION_SCHEMA },
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
    kind: s.enum([
      'content-locator',
      'resource-ref',
      'generated-asset',
      'project-revision',
      'composite-artifact',
    ]),
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

const POLICY_IDENTITY_SCHEMA = s.object({ id: ID, digest: HASH });
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

const AGGREGATE_SAMPLE_SCHEMA = s.object(
  {
    repetition: s.integer({ min: 1 }),
    result: RESULT_SCHEMA,
    artifactChecks: s.array(
      s.object(
        {
          id: ID,
          kind: ID,
          status: s.enum(['pass', 'fail']),
          evidenceRefs: ID_LIST,
        },
        { message: TEXT, details: s.anyJson() },
      ),
      { maxLength: 100 },
    ),
    artifacts: s.array(ARTIFACT_MANIFEST_ENTRY_SCHEMA, { maxLength: 1_000 }),
    desktopReport: PATH,
  },
  {
    judge: JUDGE_RESULT_SCHEMA,
    baselineDiff: COMPARISON_SCHEMA,
  },
);
const AGGREGATE_SCHEMA = s.object({
  schema: s.literal(SCHEMAS.aggregate),
  reportId: ID,
  suiteId: ID,
  caseId: ID,
  outcome: s.enum(OUTCOMES),
  repetitions: s.integer({ min: 1, max: 100 }),
  samples: s.array(AGGREGATE_SAMPLE_SCHEMA, { minLength: 1, maxLength: 100 }),
  statistics: s.object(
    {
      samples: s.integer({ min: 1 }),
      passRate: s.number({ min: 0, max: 1 }),
      outcomeCounts: s.object({
        pass: s.integer({ min: 0 }),
        caseFail: s.integer({ min: 0 }),
        infrastructureFail: s.integer({ min: 0 }),
        configurationInvalid: s.integer({ min: 0 }),
        nonComparable: s.integer({ min: 0 }),
      }),
      usageAvailability: s.object({
        inputTokens: s.integer({ min: 0 }),
        outputTokens: s.integer({ min: 0 }),
        costUsd: s.integer({ min: 0 }),
      }),
      usageTotals: s.object(
        { latencyMs: s.integer({ min: 0 }) },
        {
          inputTokens: s.integer({ min: 0 }),
          outputTokens: s.integer({ min: 0 }),
          costUsd: s.number({ min: 0 }),
        },
      ),
    },
    { scoreDistribution: DISTRIBUTION_SCHEMA },
  ),
  residualRisk: s.array(TEXT, { maxLength: 200 }),
  aggregateLocation: PATH,
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
    'draft-bind',
    'draft-submit',
    'submit',
    'queue',
    'send-queued-now',
    'wait-for-idle',
    'cancel',
    'confirm',
    'resume',
    'restart',
    'feedback',
    'update-configuration',
    'invoke-input',
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
    'model-sequence',
    'interaction-binding',
    'input-invocation',
    'draft-rejection',
    'configuration-update',
    'tool-call',
    'automation-tool-result',
    'todo-projection',
    'process-order',
    'queue-state',
    'cancellation',
    'recovery',
    'conversation-persistence',
    'terminal-idle',
    'timeline-projection',
    'resource-display-projection',
    'structured-output',
    'markdown-path',
    'artifact',
    'content-locator-handoff',
    'workspace-board-projection',
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
  for (const assertion of input.assertions) {
    if (assertion.kind !== 'automation-tool-result') continue;
    assertUnique(assertion.requiredEvidenceKinds, `${assertion.id} required evidence kinds`);
    const expectsTransient = assertion.requiredEvidenceKinds.includes('transient-image');
    if (expectsTransient !== (assertion.observationTransport === 'transient-receipt')) {
      throw new Error(
        `${assertion.id} observation transport must match transient-image evidence requirements`,
      );
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
  const draftCatalogRefs = new Set(['initial']);
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
      if (
        step.kind === 'update-configuration' &&
        (step.turnState !== 'running' || !['submit', 'queue', 'feedback'].includes(referenced.kind))
      ) {
        throw new Error(
          `update-configuration ${step.id} running state must reference an active submission`,
        );
      }
      if (step.afterStepId !== previous?.id) {
        throw new Error(`${step.kind} ${step.id} afterStepId must reference the previous step`);
      }
    }
    if (step.kind === 'send-queued-now') {
      const queued = prior.get(step.queueStepId);
      if (queued?.kind !== 'queue') {
        throw new Error(
          `send-queued-now ${step.id} queueStepId must reference an earlier queue step`,
        );
      }
    }
    if (step.kind === 'feedback' && !step.prompt.includes('${lastAssistant}')) {
      throw new Error(`feedback ${step.id} prompt must include \${lastAssistant}`);
    }
    if (step.kind === 'draft-bind') {
      if (state !== 'idle' || hasSessionTurn) {
        throw new Error(`draft-bind ${step.id} requires the initial Draft state`);
      }
      draftCatalogRefs.add(step.id);
    } else if (step.kind === 'draft-submit') {
      if (state !== 'idle' || hasSessionTurn) {
        throw new Error(`draft-submit ${step.id} requires the initial Draft state`);
      }
      if (!draftCatalogRefs.has(step.catalogRef)) {
        throw new Error(
          `draft-submit ${step.id} references unknown Draft catalog ${step.catalogRef}`,
        );
      }
    } else if (step.kind === 'submit') {
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
    } else if (step.kind === 'send-queued-now') {
      if (state !== 'idle') {
        throw new Error(`send-queued-now ${step.id} requires a cancelled idle state`);
      }
      state = 'active';
    } else if (step.kind === 'wait-for-idle') {
      state = 'idle';
    } else if (step.kind === 'feedback') {
      if (state !== 'idle') throw new Error(`feedback ${step.id} requires idle state`);
      state = 'active';
      hasSessionTurn = true;
    } else if (step.kind === 'resume' || step.kind === 'restart') {
      if (!hasSessionTurn) {
        throw new Error(`${step.kind} ${step.id} cannot reference current before a session turn`);
      }
      if (state !== 'idle') throw new Error(`${step.kind} ${step.id} requires idle state`);
    } else if (step.kind === 'update-configuration') {
      if (!hasSessionTurn) {
        throw new Error(`update-configuration ${step.id} requires an established Session`);
      }
      if (step.turnState === 'running' && state !== 'active') {
        throw new Error(`update-configuration ${step.id} requires an active Turn`);
      }
      if (step.turnState === 'idle' && state !== 'idle') {
        throw new Error(`update-configuration ${step.id} requires idle state`);
      }
      if (step.turnState === 'running' && step.afterStepId === undefined) {
        throw new Error(`update-configuration ${step.id} requires an active submission reference`);
      }
      if (step.turnState === 'idle' && step.afterStepId !== undefined) {
        throw new Error(`update-configuration ${step.id} idle state cannot reference a submission`);
      }
    } else if (step.kind === 'invoke-input') {
      if (!hasSessionTurn) {
        throw new Error(`invoke-input ${step.id} requires an established Session`);
      }
      if (state !== 'idle') throw new Error(`invoke-input ${step.id} requires idle state`);
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

export function validateAggregate(input) {
  validateStrict(input, AGGREGATE_SCHEMA, 'aggregate');
  if (
    input.samples.length !== input.repetitions ||
    input.statistics.samples !== input.repetitions
  ) {
    throw new Error('aggregate sample count must equal repetitions');
  }
  const repetitions = input.samples.map((sample) => sample.repetition);
  assertUnique(repetitions, 'aggregate sample repetitions');
  for (const sample of input.samples) {
    if (sample.result.suiteId !== input.suiteId || sample.result.caseId !== input.caseId) {
      throw new Error('aggregate sample suite/case identity does not match the aggregate');
    }
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
