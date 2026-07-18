import { describe, expect, it } from 'vitest';
import { classifyEvaluation, evaluateHardGates } from './hard-gates.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const SKILL_IDENTITY = {
  name: 'storyboard',
  source: 'project',
  provenance: 'workspace',
  rootId: 'project-agent-skills',
  relativePath: 'storyboard',
  fingerprint: HASH,
};

const ASSERTIONS = [
  { id: 'runtime', kind: 'runtime-errors-empty', evidenceRef: 'turn-facts' },
  { id: 'idle', kind: 'fully-idle', evidenceRef: 'turn-facts' },
  { id: 'turn', kind: 'canonical-turn', evidenceRef: 'turn-facts' },
  { id: 'answer', kind: 'final-answer', mode: 'non-empty', evidenceRef: 'turn-facts' },
];

function passingFacts() {
  return {
    runtimeErrors: [],
    idle: { fullyIdle: true },
    turns: [
      { id: 'u1', role: 'user', source: 'user', content: 'hello' },
      { id: 'a1', role: 'assistant', content: 'done' },
    ],
    evidenceCompleteness: {
      runtimeErrors: { limit: 256, droppedCount: 0 },
      turns: { limit: 512, droppedCount: 0 },
    },
  };
}

describe('M1 deterministic hard gates', () => {
  it('passes runtime, idle, canonical turn, and final answer evidence', () => {
    const results = evaluateHardGates(ASSERTIONS, passingFacts());
    expect(results).toHaveLength(4);
    expect(results.every((item) => item.status === 'pass')).toBe(true);
    expect(classifyEvaluation({ hardGates: results })).toEqual({ outcome: 'pass' });
  });

  it('validates bounded derived TODO facts without treating them as completion evidence', () => {
    const facts = passingFacts();
    facts.turns[1].todos = [
      { content: 'Read source', status: 'completed' },
      { content: 'Render shot', status: 'in_progress' },
      { content: 'Review output', status: 'pending' },
    ];
    const assertion = {
      id: 'todo',
      kind: 'todo-projection',
      maxItems: 6,
      atMostOneInProgress: true,
      requiredStatuses: ['completed', 'in_progress', 'pending'],
      evidenceRef: 'turn-facts',
    };
    expect(evaluateHardGates([assertion], facts)[0]).toMatchObject({ status: 'pass' });
    facts.turns[1].todos.push({ content: 'Second active item', status: 'in_progress' });
    expect(evaluateHardGates([assertion], facts)[0]).toMatchObject({ status: 'fail' });
  });

  it.each([
    [
      'runtime errors',
      (facts) => facts.runtimeErrors.push({ code: 'provider-error', message: 'failed' }),
    ],
    [
      'error turns',
      (facts) =>
        facts.turns.push({ id: 'a2', role: 'assistant', content: 'failed', isError: true }),
    ],
    [
      'non-idle state',
      (facts) => (facts.idle = { fullyIdle: false, backgroundTasksIdle: { idle: false } }),
    ],
    ['missing canonical user turn', (facts) => (facts.turns = facts.turns.slice(1))],
    ['empty final answer', (facts) => (facts.turns[1].content = '  ')],
  ])('fails on %s without allowing result-only success', (_label, mutate) => {
    const facts = passingFacts();
    mutate(facts);
    const results = evaluateHardGates(ASSERTIONS, facts);
    expect(results.some((item) => item.status === 'fail')).toBe(true);
    expect(classifyEvaluation({ hardGates: results })).toEqual({ outcome: 'case-fail' });
  });

  it('keeps configuration, infrastructure, and behavior failures distinct', () => {
    expect(
      classifyEvaluation({ phase: 'configuration', error: new Error('unknown field') }),
    ).toMatchObject({ outcome: 'configuration-invalid' });
    expect(
      classifyEvaluation({
        phase: 'execution',
        error: Object.assign(new Error('timeout'), { code: 'session-timeout' }),
      }),
    ).toMatchObject({ outcome: 'infrastructure-fail', diagnostic: { code: 'session-timeout' } });
    expect(
      classifyEvaluation({ phase: 'assertion', error: new Error('wrong path') }),
    ).toMatchObject({
      outcome: 'case-fail',
    });
  });

  it('fails process assertions when controller trace is unavailable', () => {
    const [result] = evaluateHardGates(
      [
        {
          id: 'order',
          kind: 'process-order',
          evidenceRef: 'turn-facts',
          events: [
            { kind: 'workflow-step', stepId: 'submit' },
            { kind: 'turn', role: 'assistant' },
          ],
        },
      ],
      passingFacts(),
    );
    expect(result).toMatchObject({
      status: 'fail',
      message: 'workflow controller trace is unavailable',
    });
  });

  it('fails dependent assertions when bounded evidence is missing or incomplete', () => {
    const missing = passingFacts();
    delete missing.evidenceCompleteness.turns;
    expect(evaluateHardGates(ASSERTIONS, missing)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'fail',
          message: expect.stringContaining('unavailable for turns'),
        }),
      ]),
    );
    const dropped = passingFacts();
    dropped.evidenceCompleteness.turns.droppedCount = 2;
    expect(evaluateHardGates(ASSERTIONS, dropped)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'fail', message: expect.stringContaining('dropped 2') }),
      ]),
    );
  });
});

function m2Facts() {
  const facts = passingFacts();
  facts.model = {
    providerId: 'openai',
    modelId: 'gpt-5',
    providerExpressionProfileId: 'creative-review',
  };
  facts.configuration = {
    digest: HASH,
    chat: { ...facts.model },
  };
  facts.skillActivations = [
    {
      id: 'skill-record-1',
      skillName: 'storyboard',
      status: 'active',
      triggerSource: 'explicit-agent',
      hostIdentity: {
        portableName: SKILL_IDENTITY.name,
        source: SKILL_IDENTITY.source,
        provenance: SKILL_IDENTITY.provenance,
        rootId: SKILL_IDENTITY.rootId,
        relativePath: SKILL_IDENTITY.relativePath,
        fingerprint: SKILL_IDENTITY.fingerprint,
      },
      injectedFragments: [
        {
          id: 'skill:storyboard',
          source: 'skill-lifecycle',
          order: 0,
          version: HASH,
          hash: HASH_B,
        },
      ],
      toolPolicyIds: ['skill-tool-policy:storyboard'],
    },
  ];
  facts.promptComposition = [
    {
      id: 'skill:storyboard',
      source: 'skill-lifecycle',
      order: 0,
      version: HASH,
      hash: HASH_B,
    },
  ];
  facts.turns[1].toolCalls = [
    {
      id: 'tool-1',
      name: 'canvas.create',
      status: 'success',
      arguments: { title: 'Scene 1' },
      resultObservation: 'available',
      diagnostics: [],
    },
  ];
  facts.tasks = [
    {
      id: 'task-1',
      type: 'image-generation',
      status: 'completed',
      providerId: 'fal',
      modelId: 'flux-pro',
      resultObservation: { status: 'observed', observationIds: ['observation-1'] },
      diagnostics: [],
    },
  ];
  facts.continuations = [];
  facts.artifacts = [
    {
      ref: 'asset:scene-1',
      kind: 'generated-asset',
      digest: HASH_B,
      provenance: { source: 'generated-asset', toolCallId: 'tool-1', taskId: 'task-1' },
      deliveryStatus: 'delivered',
      validator: { id: 'durable-resource-ref', status: 'valid' },
      diagnostics: [],
    },
  ];
  facts.workspaceBoardProjections = [
    {
      status: 'projected',
      targetKind: 'workspace',
      revision: HASH,
      nodeIds: ['workspace-content-source-1', 'workspace-content-generated-output-1'],
      connectionIds: ['workspace-relation-1'],
      diagnosticCodes: [],
    },
  ];
  facts.workspaceBoardDelivery = {
    canonicalSubmissionCount: 1,
    resumeScanCount: 1,
    legacyFallbackCounts: {
      activeCanvas: 0,
      recentCanvas: 0,
      directWriter: 0,
      genericSendToCanvas: 0,
    },
  };
  Object.assign(facts.evidenceCompleteness, {
    turnToolCalls: { limit: 256, droppedCount: 0 },
    skillActivations: { limit: 128, droppedCount: 0 },
    tasks: { limit: 512, droppedCount: 0 },
    continuations: { limit: 512, droppedCount: 0 },
    promptComposition: { limit: 256, droppedCount: 0 },
    artifacts: { limit: 512, droppedCount: 0 },
    workspaceBoardProjections: { limit: 128, droppedCount: 0 },
  });
  return facts;
}

const M2_ASSERTIONS = [
  {
    id: 'skill',
    kind: 'skill',
    identity: SKILL_IDENTITY,
    status: 'injected',
    evidenceRef: 'skill-facts',
  },
  {
    id: 'model',
    kind: 'model',
    profileId: 'explicit-profile',
    noFallback: true,
    evidenceRef: 'model-facts',
  },
  {
    id: 'tool',
    kind: 'tool-call',
    name: 'canvas.create',
    status: 'success',
    expectedArguments: { title: 'Scene 1' },
    evidenceRef: 'tool-facts',
  },
  {
    id: 'task',
    kind: 'task-terminal',
    taskType: 'image-generation',
    status: 'completed',
    evidenceRef: 'task-facts',
  },
  {
    id: 'artifact',
    kind: 'artifact',
    artifactRef: 'asset:scene-1',
    validatorStatus: 'valid',
    evidenceRef: 'artifact-facts',
  },
  {
    id: 'fallback',
    kind: 'no-fallback',
    forbiddenRefs: ['legacy-skill', 'legacy-tool'],
    evidenceRef: 'path-facts',
  },
];

const M2_CONTEXT = {
  modelProfiles: [
    {
      id: 'explicit-profile',
      selection: 'explicit',
      chat: {
        providerId: 'openai',
        modelId: 'gpt-5',
        providerExpressionProfileId: 'creative-review',
      },
    },
  ],
};

describe('M2 typed path hard gates', () => {
  it('passes Skill injection, actual model, Tool, task, artifact, and no-fallback facts', () => {
    const results = evaluateHardGates(M2_ASSERTIONS, m2Facts(), M2_CONTEXT);
    expect(results.every((result) => result.status === 'pass')).toBe(true);
  });

  it('matches an allowlisted subset of a Tool result diagnostic', () => {
    const facts = m2Facts();
    facts.turns[1].toolCalls[0] = {
      id: 'tool-1',
      name: 'CreateSkill',
      status: 'error',
      result: { code: 'skill-already-exists', message: 'target exists' },
      resultObservation: 'error',
      diagnostics: [],
    };
    const [result] = evaluateHardGates(
      [
        {
          id: 'tool-result',
          kind: 'tool-call',
          name: 'CreateSkill',
          status: 'error',
          resultIncludes: { code: 'skill-already-exists' },
          evidenceRef: 'tool-facts',
        },
      ],
      facts,
    );
    expect(result.status).toBe('pass');
  });

  it('supports trigger evidence without claiming prompt injection', () => {
    const [result] = evaluateHardGates(
      [{ ...M2_ASSERTIONS[0], status: 'triggered' }],
      m2Facts(),
      M2_CONTEXT,
    );
    expect(result).toMatchObject({ status: 'pass', details: { triggerSource: 'explicit-agent' } });
  });

  it('selects a dynamic generated artifact by kind and provenance', () => {
    const [result] = evaluateHardGates(
      [
        {
          id: 'generated-output',
          kind: 'artifact',
          artifactKind: 'generated-asset',
          provenanceSource: 'generated-asset',
          validatorStatus: 'valid',
          evidenceRef: 'artifact-facts',
        },
      ],
      m2Facts(),
    );

    expect(result).toMatchObject({
      status: 'pass',
      details: {
        ref: 'asset:scene-1',
        kind: 'generated-asset',
        validatorStatus: 'valid',
      },
    });
  });

  it('fails a dynamic artifact selector when provenance does not match', () => {
    const [result] = evaluateHardGates(
      [
        {
          id: 'generated-output',
          kind: 'artifact',
          artifactKind: 'generated-asset',
          provenanceSource: 'asset-library',
          validatorStatus: 'valid',
          evidenceRef: 'artifact-facts',
        },
      ],
      m2Facts(),
    );

    expect(result).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('artifact selector was not observed'),
    });
  });

  it('proves prompt fragments by public identity without reading prompt bodies', () => {
    const [result] = evaluateHardGates(
      [
        {
          id: 'prompt',
          kind: 'prompt-composition',
          requiredFragments: [
            { id: 'skill:storyboard', source: 'skill-lifecycle', version: HASH, hash: HASH_B },
          ],
          forbiddenFragmentIds: ['legacy:storyboard'],
          evidenceRef: 'prompt-facts',
        },
      ],
      m2Facts(),
    );
    expect(result).toMatchObject({ status: 'pass' });
  });

  it('proves a generated output reached the canonical Workspace Board projection', () => {
    const assertion = {
      id: 'workspace-board',
      kind: 'workspace-board-projection',
      status: 'projected',
      targetKind: 'workspace',
      minNodeIds: 2,
      minConnectionIds: 1,
      revisionRequired: true,
      diagnosticsEmpty: true,
      evidenceRef: 'workspace-board-facts',
    };

    expect(evaluateHardGates([assertion], m2Facts())[0]).toMatchObject({ status: 'pass' });

    const legacyGroup = m2Facts();
    legacyGroup.workspaceBoardProjections[0].nodeIds = ['workspace-inbox', 'generated-output-1'];
    expect(evaluateHardGates([assertion], legacyGroup)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('legacy visual Group'),
    });

    const incomplete = m2Facts();
    incomplete.evidenceCompleteness.workspaceBoardProjections.droppedCount = 1;
    expect(evaluateHardGates([assertion], incomplete)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('evidence for workspaceBoardProjections is incomplete'),
    });

    const missingRevision = m2Facts();
    delete missingRevision.workspaceBoardProjections[0].revision;
    expect(evaluateHardGates([assertion], missingRevision)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('no revision evidence'),
    });
  });

  it.each([
    ['Skill composition mismatch', 0, (facts) => (facts.promptComposition[0].hash = HASH)],
    [
      'model fallback',
      1,
      (facts) => {
        facts.model.modelId = 'fallback-model';
        facts.configuration.chat.modelId = 'fallback-model';
      },
    ],
    [
      'Tool result not observed',
      2,
      (facts) => (facts.turns[1].toolCalls[0].resultObservation = 'missing'),
    ],
    ['task result missing', 3, (facts) => (facts.tasks[0].resultObservation.status = 'missing')],
    ['artifact not delivered', 4, (facts) => (facts.artifacts[0].deliveryStatus = 'failed')],
    [
      'forbidden fallback participated',
      5,
      (facts) => facts.turns[1].toolCalls.push({ id: 'legacy-call', name: 'legacy-tool' }),
    ],
  ])('fails a correct-looking answer when %s', (_label, assertionIndex, mutate) => {
    const facts = m2Facts();
    mutate(facts);
    const [result] = evaluateHardGates([M2_ASSERTIONS[assertionIndex]], facts, M2_CONTEXT);
    expect(result.status).toBe('fail');
    expect(classifyEvaluation({ hardGates: [result] }).outcome).toBe('case-fail');
    expect(facts.turns.at(-1).content).toBe('done');
  });

  it('fails absence assertions when any required no-fallback collection is incomplete', () => {
    const facts = m2Facts();
    facts.evidenceCompleteness.promptComposition.droppedCount = 1;
    const [result] = evaluateHardGates([M2_ASSERTIONS[5]], facts, M2_CONTEXT);
    expect(result).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('evidence for promptComposition is incomplete'),
    });
  });

  it('uses explicit Workspace Board legacy fallback counters', () => {
    const assertion = {
      id: 'board-fallback',
      kind: 'no-fallback',
      forbiddenRefs: [
        'active-canvas',
        'recentCanvas',
        'NodeWorkspaceBoardProjector',
        'generic-send-to-canvas',
      ],
      evidenceRef: 'board-facts',
    };
    expect(evaluateHardGates([assertion], m2Facts())[0]).toMatchObject({ status: 'pass' });

    const observed = m2Facts();
    observed.workspaceBoardDelivery.legacyFallbackCounts.directWriter = 1;
    expect(evaluateHardGates([assertion], observed)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('NodeWorkspaceBoardProjector'),
    });

    const missing = m2Facts();
    delete missing.workspaceBoardDelivery;
    expect(evaluateHardGates([assertion], missing)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('legacy fallback counters are unavailable'),
    });
  });
});

function m3Facts() {
  const facts = m2Facts();
  facts.conversationId = 'conversation-1';
  facts.piRuntime = {
    implementation: 'pi-agent-core',
    transcriptAuthority: 'pi-session',
    productMetadataAuthority: 'sqlite',
    conversationId: 'conversation-1',
    branchId: 'main',
    piSessionId: 'pi-session-1',
    writerEpoch: 3,
    workspaceLocator: { kind: 'virtual', value: '/__neko_workspaces/workspace-1' },
    lastTurn: {
      turnId: 'turn-1',
      runId: 'run-1',
      purpose: 'agent.main',
      providerId: 'openai',
      modelId: 'gpt-5',
      parametersDigest: HASH,
      snapshotDigest: HASH_B,
      protocol: 'openai-completions',
      authMechanism: 'bearer',
      credentialSource: 'environment',
      durability: 'durable',
    },
  };
  facts.conversationPersistence = {
    authority: 'pi-session',
    catalog: 'sqlite',
    databaseScope: 'user-global',
    resume: {
      status: 'restored',
      requestedConversationId: 'conversation-1',
      restoredConversationId: 'conversation-1',
      recordSource: 'pi-session',
      restoredMessageCount: 2,
    },
  };
  facts.idle = {
    fullyIdle: true,
    turnIdle: { idle: true, terminal: true },
    backgroundTasksIdle: { idle: true, terminal: true },
    mediaDeliveryIdle: { idle: true, terminal: true },
    taskResultObservationIdle: { idle: true, terminal: true },
    continuationQueueIdle: { idle: true, terminal: true },
  };
  facts.tasks[0].retryCount = 1;
  facts.tasks[0].createdAt = 20;
  facts.tasks[0].updatedAt = 30;
  facts.continuations = [
    {
      id: 'continuation-1',
      source: 'task-result-continuation',
      status: 'completed',
      timestamp: 40,
    },
  ];
  facts.automation = {
    schema: 'neko.agent-eval.workflow-trace.v1',
    sessions: [],
    steps: [
      {
        id: 'submit',
        kind: 'submit',
        method: 'message.submit',
        queued: false,
        snapshot: snapshot({ turns: [facts.turns[0]] }),
      },
      {
        id: 'queue',
        kind: 'queue',
        method: 'message.submit',
        queued: true,
        snapshot: snapshot({
          pendingCount: 1,
          turns: [facts.turns[0], facts.turns[1]],
        }),
      },
      {
        id: 'idle',
        kind: 'wait-for-idle',
        method: 'session.waitForIdle',
        fullyIdle: true,
        snapshot: snapshot({
          pendingCount: 0,
          turns: facts.turns,
          tasks: facts.tasks,
          continuations: facts.continuations,
        }),
      },
      {
        id: 'cancel',
        kind: 'cancel',
        method: 'message.cancel',
        accepted: true,
        snapshot: snapshot({ pausedAfterCancel: true, turns: facts.turns }),
      },
      {
        id: 'resume',
        kind: 'resume',
        method: 'session.resume',
        conversationId: 'conversation-1',
      },
      {
        id: 'recover',
        kind: 'submit',
        method: 'message.submit',
        snapshot: snapshot({ conversationId: 'conversation-1', turns: facts.turns }),
      },
      {
        id: 'recovered-idle',
        kind: 'wait-for-idle',
        method: 'session.waitForIdle',
        fullyIdle: true,
        snapshot: snapshot({ conversationId: 'conversation-1', turns: facts.turns }),
      },
    ],
  };
  Object.assign(facts.evidenceCompleteness, {
    timelineRows: { limit: 2048, droppedCount: 0 },
  });
  return facts;
}

function snapshot(options = {}) {
  return {
    conversationId: options.conversationId ?? 'conversation-1',
    idle: { fullyIdle: options.pendingCount !== 1 },
    messageQueue: {
      version: 1,
      pendingCount: options.pendingCount ?? 0,
      pausedAfterCancel: options.pausedAfterCancel ?? false,
      items: [],
    },
    turns: options.turns ?? [],
    tasks: options.tasks ?? [],
    continuations: options.continuations ?? [],
    evidenceCompleteness: {},
  };
}

const M3_ASSERTIONS = [
  {
    id: 'pi-runtime',
    kind: 'pi-runtime',
    implementation: 'pi-agent-core',
    transcriptAuthority: 'pi-session',
    productMetadataAuthority: 'sqlite',
    purpose: 'agent.main',
    workspaceLocatorKind: 'virtual',
    turnDurability: 'durable',
    evidenceRef: 'runtime-facts',
  },
  {
    id: 'order',
    kind: 'process-order',
    evidenceRef: 'process-facts',
    events: [
      { kind: 'workflow-step', stepId: 'submit', method: 'message.submit' },
      { kind: 'turn', role: 'user', source: 'user' },
      { kind: 'workflow-step', stepId: 'queue', method: 'message.submit' },
      { kind: 'tool', name: 'canvas.create', status: 'success' },
      { kind: 'task', taskType: 'image-generation', status: 'completed' },
      {
        kind: 'continuation',
        source: 'task-result-continuation',
        status: 'completed',
      },
    ],
  },
  {
    id: 'queued',
    kind: 'queue-state',
    stepId: 'queue',
    status: 'queued',
    minPending: 1,
    evidenceRef: 'queue-facts',
  },
  {
    id: 'drained',
    kind: 'queue-state',
    stepId: 'idle',
    status: 'drained',
    evidenceRef: 'queue-facts',
  },
  {
    id: 'cancelled',
    kind: 'cancellation',
    stepId: 'cancel',
    accepted: true,
    evidenceRef: 'cancel-facts',
  },
  {
    id: 'recovered',
    kind: 'recovery',
    resumeStepId: 'resume',
    submitStepId: 'recover',
    idleStepId: 'recovered-idle',
    evidenceRef: 'recovery-facts',
  },
  {
    id: 'persistence',
    kind: 'conversation-persistence',
    authority: 'pi-session',
    catalog: 'sqlite',
    databaseScope: 'user-global',
    resumeStatus: 'restored',
    recordSource: 'pi-session',
    minRestoredMessages: 2,
    evidenceRef: 'recovery-facts',
  },
  {
    id: 'retries',
    kind: 'retries',
    taskType: 'image-generation',
    min: 1,
    max: 1,
    evidenceRef: 'task-facts',
  },
  {
    id: 'terminal',
    kind: 'terminal-idle',
    concerns: [
      'turnIdle',
      'backgroundTasksIdle',
      'taskResultObservationIdle',
      'continuationQueueIdle',
    ],
    evidenceRef: 'idle-facts',
  },
];

describe('M3 process hard gates', () => {
  it('passes ordered workflow, queue, cancellation, persistence, retry, and idle evidence', () => {
    const results = evaluateHardGates(M3_ASSERTIONS, m3Facts());
    expect(results.every((result) => result.status === 'pass')).toBe(true);
  });

  it('requires exact configured and wire identities for every flat purpose in the model profile', () => {
    const facts = m3Facts();
    facts.piRuntime.lastTurn.modelPurposes = [
      {
        purpose: 'image.understand',
        execution: 'pi',
        providerId: 'vision-provider',
        configuredModelId: 'vision-config',
        apiModelId: 'vision-wire',
        parametersDigest: HASH,
      },
    ];
    const assertion = { ...M3_ASSERTIONS[0], modelProfileId: 'flat-purpose' };
    const context = {
      modelProfiles: [
        {
          id: 'flat-purpose',
          purposes: {
            'image.understand': {
              providerId: 'vision-provider',
              modelId: 'vision-config',
            },
          },
        },
      ],
    };

    expect(evaluateHardGates([assertion], facts, context)[0].status).toBe('pass');
    facts.piRuntime.lastTurn.modelPurposes[0].configuredModelId = 'fallback-model';
    expect(evaluateHardGates([assertion], facts, context)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('image.understand mismatch'),
    });
  });

  it.each([
    [
      'runtime implementation mismatch',
      0,
      (facts) => (facts.piRuntime.implementation = 'AgentSession'),
    ],
    ['out-of-order event', 1, (facts) => facts.automation.steps.splice(1, 1)],
    ['queue not accepted', 2, (facts) => (facts.automation.steps[1].queued = false)],
    [
      'queue not drained',
      3,
      (facts) => (facts.automation.steps[2].snapshot.messageQueue.pendingCount = 1),
    ],
    ['cancel rejected', 4, (facts) => (facts.automation.steps[3].accepted = false)],
    [
      'resume changed conversation',
      5,
      (facts) => (facts.automation.steps[5].snapshot.conversationId = 'other'),
    ],
    [
      'persistence source mismatch',
      6,
      (facts) => (facts.conversationPersistence.catalog = 'memory'),
    ],
    ['retry outside range', 7, (facts) => (facts.tasks[0].retryCount = 2)],
    ['idle concern non-terminal', 8, (facts) => (facts.idle.backgroundTasksIdle.terminal = false)],
  ])('fails when %s', (_label, assertionIndex, mutate) => {
    const facts = m3Facts();
    mutate(facts);
    const [result] = evaluateHardGates([M3_ASSERTIONS[assertionIndex]], facts);
    expect(result.status).toBe('fail');
  });

  it('fails ordering when dependent evidence was dropped', () => {
    const facts = m3Facts();
    facts.evidenceCompleteness.turnToolCalls.droppedCount = 1;
    const [result] = evaluateHardGates([M3_ASSERTIONS[1]], facts);
    expect(result).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('turnToolCalls is incomplete'),
    });
  });

  it('validates bounded Markdown path events and viewport revision reuse', () => {
    const facts = m3Facts();
    facts.markdown = {
      pathEvents: [
        { type: 'session-created', key: 'assistant-1' },
        { type: 'source-updated', key: 'assistant-1', sourceLength: 10 },
        { type: 'document-projected', key: 'assistant-1', revision: 2 },
        { type: 'layout-created', key: 'assistant-1', revision: 2, viewportWidth: 96 },
        { type: 'layout-created', key: 'assistant-1', revision: 2, viewportWidth: 48 },
        { type: 'session-finalized', key: 'assistant-1', revision: 2 },
      ],
      droppedPathEventCount: 0,
    };
    facts.evidenceCompleteness.markdownPathEvents = { limit: 2048, droppedCount: 0 };
    const assertion = {
      id: 'markdown',
      kind: 'markdown-path',
      requiredEvents: [
        'session-created',
        'source-updated',
        'document-projected',
        'layout-created',
        'session-finalized',
      ],
      viewportWidths: [96, 48],
      sameRevisionForViewportWidths: true,
      evidenceRef: 'markdown-facts',
    };
    expect(evaluateHardGates([assertion], facts)[0].status).toBe('pass');
    facts.markdown.pathEvents[4].revision = 3;
    expect(evaluateHardGates([assertion], facts)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('did not reuse one Markdown revision'),
    });
    facts.evidenceCompleteness.markdownPathEvents.droppedCount = 1;
    expect(evaluateHardGates([assertion], facts)[0]).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('incomplete'),
    });
  });
});
