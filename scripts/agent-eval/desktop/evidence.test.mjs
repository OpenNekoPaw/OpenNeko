import { describe, expect, it } from 'vitest';
import { assertDesktopEvidenceSupport, createDesktopEvaluationFacts } from './evidence.mjs';
import { evaluateHardGates } from '../runner/hard-gates.mjs';

describe('Desktop Agent assertion-driven evidence', () => {
  it('evaluates an ordinary declarative case without case-id dispatch', () => {
    const input = evidenceInput([
      { id: 'errors', kind: 'runtime-errors-empty', evidenceRef: 'facts' },
      {
        id: 'answer',
        kind: 'final-answer',
        mode: 'contains',
        text: ['CASE_OK'],
        evidenceRef: 'facts',
      },
    ]);

    const facts = createDesktopEvaluationFacts({
      facts: input.facts,
      identity: input.identity,
      workflow: input.workflow,
      projection: input.projection,
      snapshot: input.snapshot,
    });
    expect(
      evaluateHardGates(input.executionCase.assertions, facts, {
        executionCase: input.executionCase,
        authorization: input.authorization,
      }),
    ).toEqual([
      expect.objectContaining({ id: 'errors', status: 'pass', evidenceRefs: ['facts'] }),
      expect.objectContaining({ id: 'answer', status: 'pass', evidenceRefs: ['facts'] }),
    ]);
  });

  it('accepts workflow evidence and rejects unsupported continuation ordering before launch', () => {
    expect(() =>
      assertDesktopEvidenceSupport([
        {
          id: 'process',
          kind: 'process-order',
          evidenceRef: 'facts',
          events: [
            { kind: 'workflow-step', stepId: 'submit' },
            { kind: 'turn', role: 'assistant' },
          ],
        },
      ]),
    ).not.toThrow();
    expect(() =>
      assertDesktopEvidenceSupport([
        {
          id: 'process',
          kind: 'process-order',
          evidenceRef: 'facts',
          events: [
            { kind: 'workflow-step', stepId: 'submit' },
            { kind: 'continuation', source: 'subagent-result-continuation' },
          ],
        },
      ]),
    ).toThrow("process-order event 'continuation' is not supported");
  });

  it('proves the final native TODO projection without reading assistant prose', () => {
    const assertion = {
      id: 'todo',
      kind: 'todo-projection',
      maxItems: 6,
      atMostOneInProgress: true,
      requiredStatuses: ['completed'],
      evidenceRef: 'facts',
    };
    const input = dshEvidenceInput([assertion]);
    input.projection.todos = [
      { content: 'Review source evidence', status: 'completed' },
      { content: 'Define the storyboard gate', status: 'completed' },
    ];

    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'pass',
        details: { itemCount: 2, statuses: ['completed'] },
      }),
    );

    input.projection.todos.push({ content: 'Duplicate active item', status: 'in_progress' });
    input.projection.todos.push({ content: 'Second active item', status: 'in_progress' });
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('multiple') }),
    );
  });

  it('requires one complete runtime-hashed Skill receipt', () => {
    const fingerprint = `sha256:${'a'.repeat(64)}`;
    const assertion = {
      id: 'skill',
      kind: 'skill',
      identity: {
        name: 'media-production',
        source: 'builtin',
        provenance: 'builtin',
        rootId: 'builtin-skills',
        relativePath: 'media-production',
        fingerprint,
      },
      status: 'injected',
      evidenceRef: 'facts',
    };
    const input = dshEvidenceInput([assertion]);
    input.facts.receipts.skills.items = [
      {
        name: 'media-production',
        source: 'builtin',
        fingerprint,
        status: 'injected',
        toolCallId: 'skill-call-1',
      },
    ];

    expect(run(input)[0]).toMatchObject({ status: 'pass' });
    input.facts.receipts.skills.droppedCount = 1;
    expect(run(input)[0]).toMatchObject({
      status: 'fail',
      message: 'Desktop Agent Skill receipt collection is incomplete.',
    });
  });

  it('proves stream and Tool order from canonical DSH projection events', () => {
    const assertion = {
      id: 'order',
      kind: 'process-order',
      events: [
        {
          kind: 'timeline',
          eventKind: 'assistant_text',
          contentContains: 'STREAM_OPENING_MARKER',
        },
        { kind: 'timeline', eventKind: 'tool', toolName: 'ListDirectory', status: 'success' },
        {
          kind: 'timeline',
          eventKind: 'assistant_text',
          contentContains: 'STREAM_FINAL_MARKER',
        },
      ],
      evidenceRef: 'facts',
    };
    const input = dshEvidenceInput([assertion]);
    input.workflow.steps = [
      {
        id: 'idle',
        kind: 'wait-for-idle',
        method: 'session.waitForIdle',
        snapshot: {
          conversationId: input.identity.conversationId,
          dshSessionId: input.identity.dshSessionId,
          events: [
            {
              kind: 'message',
              role: 'assistant',
              turn: 1,
              step: 0,
              messageId: 'message-opening',
              state: 'final',
              text: 'STREAM_OPENING_MARKER',
            },
            dshToolEvent({
              toolCallId: 'tool-call-1',
              title: 'ListDirectory',
              status: 'completed',
              rawInput: {},
              result: { entries: [] },
            }),
            {
              kind: 'message',
              role: 'assistant',
              turn: 1,
              step: 1,
              messageId: 'message-closing',
              state: 'final',
              text: 'STREAM_FINAL_MARKER',
            },
          ],
        },
      },
    ];

    expect(run(input)[0]).toEqual(expect.objectContaining({ status: 'pass' }));

    input.workflow.steps[0].snapshot.events.reverse();
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('not observed') }),
    );
    input.workflow.steps[0].snapshot.events.reverse();
    input.workflow.steps[0].snapshot.events[1].toolCallId = '';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('identity') }),
    );
  });

  it('proves one exact Automation session result and transient observation receipt', () => {
    const assertion = {
      id: 'automation-result',
      kind: 'automation-tool-result',
      name: 'automation_browser-use_browser_screenshot',
      profileId: 'browser-use.observe',
      targetLabel: 'OpenNeko Evaluation Browser',
      mode: 'observe',
      sessionStatus: 'active',
      remainingSteps: 0,
      requiredEvidenceKinds: ['text', 'structured', 'transient-image'],
      observationTransport: 'transient-receipt',
      evidenceRef: 'facts',
    };
    const input = dshEvidenceInput([assertion]);
    const result = {
      actionId: 'action-1',
      session: {
        sessionId: 'session-1',
        profileId: 'browser-use.observe',
        targetKey: 'browser-target:opaque-1',
        targetLabel: 'OpenNeko Evaluation Browser',
        mode: 'observe',
        status: 'active',
        remainingSteps: 0,
      },
      evidence: [
        { kind: 'text', text: 'viewport observed' },
        { kind: 'structured', data: { source: 'browser-use' } },
        {
          kind: 'transient-image',
          receiptId: 'receipt-1',
          mimeType: 'image/png',
          width: 800,
          height: 600,
        },
      ],
    };
    input.projection.events.push(
      dshToolEvent({
        toolCallId: 'automation-call-1',
        title: assertion.name,
        status: 'completed',
        rawInput: { full_page: false },
        result,
      }),
    );

    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'pass',
        details: expect.objectContaining({
          sessionId: 'session-1',
          targetKey: 'browser-target:opaque-1',
          evidenceKinds: ['text', 'structured', 'transient-image'],
        }),
      }),
    );

    result.session.processId = 42;
    input.projection.events[0] = dshToolEvent({
      toolCallId: 'automation-call-1',
      title: assertion.name,
      status: 'completed',
      rawInput: { full_page: false },
      result,
    });
    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('session fields'),
      }),
    );
  });

  it('proves Tool results only from canonical DSH Tool events', () => {
    const assertion = {
      id: 'tool',
      kind: 'tool-call',
      name: 'openneko_canvas',
      status: 'success',
      expectedArguments: { operation: 'query' },
      resultIncludes: { documentPath: 'boards/story.nkc' },
      evidenceRef: 'facts',
    };
    const input = dshEvidenceInput([assertion]);
    input.projection.events.push(
      dshToolEvent({
        toolCallId: 'tool-call-1',
        title: assertion.name,
        status: 'completed',
        rawInput: { operation: 'query', input: { documentPath: 'boards/story.nkc' } },
        result: { documentPath: 'boards/story.nkc', nodeCount: 2 },
      }),
    );

    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'pass',
        details: {
          toolCallId: 'tool-call-1',
          turn: 1,
          name: 'openneko_canvas',
          status: 'success',
        },
      }),
    );

    input.projection.events[0].toolCallId = '';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('identity') }),
    );
  });

  it('matches separate assertions to same-name Tool calls by their exact arguments', () => {
    const assertions = [
      {
        id: 'overview',
        kind: 'tool-call',
        name: 'openneko_read_image',
        status: 'success',
        expectedArguments: { detail: 'overview' },
        evidenceRef: 'facts',
      },
      {
        id: 'original',
        kind: 'tool-call',
        name: 'openneko_read_image',
        status: 'success',
        expectedArguments: { detail: 'original' },
        evidenceRef: 'facts',
      },
    ];
    const input = dshEvidenceInput(assertions);
    input.projection.events.push(
      dshToolEvent({
        toolCallId: 'overview-call',
        title: 'openneko_read_image',
        status: 'completed',
        rawInput: {
          source: { file: { authority: 'workspace', path: 'story.epub' } },
          detail: 'overview',
        },
        result: { detail: 'overview' },
      }),
      dshToolEvent({
        toolCallId: 'original-call',
        title: 'openneko_read_image',
        status: 'completed',
        rawInput: {
          source: { file: { authority: 'workspace', path: 'story.epub' } },
          detail: 'original',
        },
        result: { detail: 'original' },
      }),
    );

    expect(run(input)).toEqual([
      expect.objectContaining({
        status: 'pass',
        details: expect.objectContaining({ toolCallId: 'overview-call' }),
      }),
      expect.objectContaining({
        status: 'pass',
        details: expect.objectContaining({ toolCallId: 'original-call' }),
      }),
    ]);
  });

  it('rejects retired Pi Tool projection as a successful Tool assertion path', () => {
    const assertion = {
      id: 'tool',
      kind: 'tool-call',
      name: 'Read',
      status: 'success',
      evidenceRef: 'facts',
    };
    const input = evidenceInput([assertion]);
    input.facts.runtimePath = {
      controller: 'sender-bound-desktop-agent-controller',
      runtime: 'pi-conversation-runtime',
      transcript: 'pi-session',
      metadata: 'sqlite',
      projection: 'conversation-projection-store',
    };
    input.facts.identity = {
      conversationId: input.identity.conversationId,
      turnId: 'turn-1',
      runId: 'run-1',
      piSessionId: 'pi-session-1',
    };
    input.projection.events.push({
      kind: 'tool_call',
      payload: {
        toolCall: { id: 'pi-call-1', name: 'Read', result: { success: true, data: {} } },
      },
    });
    input.facts.receipts.tools.items.push({ callId: 'pi-call-1', name: 'Read', status: 'success' });

    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('canonical DSH runtime path'),
      }),
    );
  });

  it('requires a real resumed DSH Session snapshot for persistence evidence', () => {
    const assertion = {
      id: 'persistence',
      kind: 'conversation-persistence',
      authority: 'dsh-session',
      catalog: 'openneko-conversation-catalog',
      databaseScope: 'user-global',
      resumeStatus: 'restored',
      recordSource: 'dsh-session',
      minRestoredMessages: 2,
      evidenceRef: 'facts',
    };
    const input = dshEvidenceInput([assertion]);
    input.workflow.receipts.resume = {
      accepted: true,
      snapshot: {
        messages: [
          { id: 'user-1', role: 'user', content: 'hello' },
          { id: 'assistant-1', role: 'assistant', content: 'world' },
        ],
      },
    };

    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'pass',
        details: expect.objectContaining({ restoredMessageCount: 2 }),
      }),
    );

    input.workflow.receipts.resume.snapshot.messages.length = 1;
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('at least 2') }),
    );
  });

  it('proves Timeline state from the exact DSH Session turn and Tool identity', () => {
    const assertion = {
      id: 'timeline',
      kind: 'timeline-projection',
      turnEndReason: 'completed',
      toolName: 'ListDirectory',
      evidenceRef: 'facts',
    };
    const input = dshTimelineInput(assertion);

    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'pass',
        details: {
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          turn: 1,
          turnEndReason: 'completed',
          toolCallIds: ['tool-call-1'],
        },
      }),
    );

    input.projection.dshSessionId = 'dsh-session-stale';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('identity') }),
    );
    input.projection.dshSessionId = 'dsh-session-1';
    input.projection.events.at(-1).reason = 'error';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('end reason') }),
    );
    input.projection.events.at(-1).reason = 'completed';
    input.projection.events[1].turn = 2;
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('missing Tool') }),
    );
  });

  it('proves exact Draft handoff, per-Turn model sequence, and typed compaction receipt', () => {
    const assertions = [
      {
        id: 'binding',
        kind: 'interaction-binding',
        initialPhase: 'draft',
        initialBindingKind: 'workspace',
        finalPhase: 'session',
        finalBindingKind: 'workspace',
        conversationCreated: true,
        evidenceRef: 'facts',
      },
      {
        id: 'models',
        kind: 'model-sequence',
        turns: [
          { idleStepId: 'first-idle', profileId: 'model-a' },
          { idleStepId: 'second-idle', profileId: 'model-b' },
        ],
        evidenceRef: 'facts',
      },
      {
        id: 'compact',
        kind: 'input-invocation',
        stepId: 'compact',
        trigger: 'command',
        name: 'compact',
        status: 'completed',
        evidenceRef: 'facts',
      },
    ];
    const input = evidenceInput(assertions);
    input.executionCase.modelProfiles = [
      {
        id: 'model-a',
        selection: 'explicit',
        chat: { providerId: 'provider-1', modelId: 'model-a' },
      },
      {
        id: 'model-b',
        selection: 'explicit',
        chat: { providerId: 'provider-1', modelId: 'model-1' },
      },
    ];
    input.interaction = {
      initial: {
        phase: 'draft',
        bindingKind: 'workspace',
        draftId: 'draft-1',
        workspaceId: 'workspace-1',
      },
      final: {
        phase: 'session',
        bindingKind: 'workspace',
        draftId: 'draft-1',
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
      },
    };
    const firstFacts = structuredClone(input.facts);
    firstFacts.identity.turn = 1;
    firstFacts.configuration.effective.values.modelBinding = {
      providerId: 'provider-1',
      modelId: 'model-a',
    };
    input.workflow.receipts = {
      'first-idle': {
        identity: { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 1 },
        facts: firstFacts,
      },
      'second-idle': { identity: input.identity, facts: structuredClone(input.facts) },
      compact: {
        accepted: true,
        trigger: 'command',
        name: 'compact',
        result: { type: 'compressionResult', conversationId: 'conversation-1' },
      },
    };

    expect(run(input)).toEqual([
      expect.objectContaining({ id: 'binding', status: 'pass' }),
      expect.objectContaining({
        id: 'models',
        status: 'pass',
        details: expect.objectContaining({
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          turns: [
            expect.objectContaining({ turn: 1, modelId: 'model-a' }),
            expect.objectContaining({ turn: 2, modelId: 'model-1' }),
          ],
        }),
      }),
      expect.objectContaining({ id: 'compact', status: 'pass' }),
    ]);

    input.interaction.final.draftId = 'draft-2';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('binding') }),
    );
    input.interaction.final.draftId = 'draft-1';
    input.workflow.receipts['first-idle'].identity.dshSessionId = 'dsh-session-stale';
    expect(run(input)[1]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('stale') }),
    );
    input.workflow.receipts['first-idle'].identity.dshSessionId = 'dsh-session-1';
    input.workflow.receipts['first-idle'].identity.turn = 2;
    input.workflow.receipts['first-idle'].facts.identity.turn = 2;
    expect(run(input)[1]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('distinct DSH turn identities'),
      }),
    );
  });

  it('proves configuration updates create no Turn', () => {
    const assertions = [
      {
        id: 'model-update',
        kind: 'configuration-update',
        stepId: 'configure-next',
        providerId: 'provider-1',
        modelId: 'model-1',
        status: 'applied',
        turnState: 'idle',
        turnCreated: false,
        evidenceRef: 'facts',
      },
    ];
    const input = evidenceInput(assertions);
    input.workflow.receipts = {
      'configure-next': {
        accepted: true,
        status: 'applied',
        conversationId: 'conversation-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        turnStateAtUpdate: 'idle',
        turnCountBefore: 1,
        turnCountAfter: 1,
        projection: {
          request: { providerId: 'provider-1', modelId: 'model-1' },
          fields: {
            model: {
              effectiveValue: { providerId: 'provider-1', modelId: 'model-1' },
            },
          },
        },
      },
    };

    expect(run(input)).toEqual([
      expect.objectContaining({
        id: 'model-update',
        status: 'pass',
        details: expect.objectContaining({ turnCreated: false }),
      }),
    ]);

    input.workflow.receipts['configure-next'].turnCountAfter = 2;
    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('configuration update evidence'),
      }),
    );
  });

  it('proves exact renderer reload, composer focus, and graceful close lifecycle evidence', () => {
    const assertion = {
      id: 'lifecycle',
      kind: 'desktop-lifecycle',
      checks: ['renderer-reload', 'composer-focus', 'graceful-close'],
      evidenceRef: 'facts',
    };
    const input = evidenceInput([assertion]);
    input.lifecycle = {
      rendererReload: {
        status: 'restored',
        connection: { scope: { conversationId: input.identity.conversationId } },
      },
      composerFocus: { status: 'focused' },
      gracefulClose: { status: 'disposed' },
    };
    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'pass',
        details: { checks: assertion.checks },
      }),
    );

    input.lifecycle.rendererReload.connection.scope.conversationId = 'conversation-stale';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('exact') }),
    );
  });
});

function run(input) {
  const facts = createDesktopEvaluationFacts({
    facts: input.facts,
    identity: input.identity,
    workflow: input.workflow,
    projection: input.projection,
    snapshot: input.snapshot,
    interaction: input.interaction,
    lifecycle: input.lifecycle,
  });
  return evaluateHardGates(input.executionCase.assertions, facts, {
    executionCase: input.executionCase,
    authorization: input.authorization,
  });
}

function evidenceInput(assertions) {
  const identity = { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 2 };
  const bounded = (items = []) => ({ limit: 100, items, droppedCount: 0 });
  return {
    executionCase: {
      caseId: 'ordinary-new-case',
      assertions,
      modelProfiles: [],
    },
    identity,
    authorization: { providerId: 'provider-1', modelId: 'model-1' },
    workflow: { terminalIdle: { identity }, receipts: {} },
    projection: { events: [] },
    snapshot: {
      messages: [{ id: 'assistant-1', role: 'assistant', content: 'done\nCASE_OK' }],
    },
    facts: {
      identity: {
        ...identity,
        connection: {
          applicationInstanceId: 'app-1',
          connectionId: 'connection-1',
          windowId: 'window-1',
          workbenchInstanceId: 'workbench-1',
          agentSurfaceId: 'surface-1',
          workspaceId: 'workspace-1',
          viewId: 'view-1',
          projectId: 'project-1',
        },
      },
      runtimePath: {
        controller: 'dsh-desktop-session-host',
        runtime: 'dsh-agent',
        transcript: 'dsh-session',
        metadata: 'openneko-conversation-catalog',
        projection: 'dsh-acp-projection',
      },
      configuration: {
        effective: {
          values: { modelBinding: { providerId: 'provider-1', modelId: 'model-1' } },
        },
      },
      receipts: {
        prompts: bounded(),
        skills: bounded(),
        tools: bounded(),
        permissions: bounded(),
      },
      projection: {
        conversationId: identity.conversationId,
        dshSessionId: identity.dshSessionId,
      },
      persistence: { durability: 'dsh-session', checkpoint: 'observed' },
      diagnostics: bounded(),
      disposal: { status: 'disposed' },
    },
  };
}

function dshTimelineInput(assertion) {
  const input = dshEvidenceInput([assertion]);
  input.projection.events.push(
    { kind: 'turn', turn: 1, phase: 'start', startedAt: 1 },
    {
      kind: 'tool',
      turn: 1,
      toolCallId: 'tool-call-1',
      status: 'completed',
      title: 'ListDirectory',
    },
    {
      kind: 'turn',
      turn: 1,
      phase: 'end',
      startedAt: 1,
      completedAt: 2,
      reason: 'completed',
    },
  );
  return input;
}

function dshEvidenceInput(assertions) {
  const input = evidenceInput(assertions);
  const identity = { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 1 };
  input.identity = identity;
  input.workflow.terminalIdle.identity = identity;
  input.facts.identity = identity;
  input.facts.projection = {
    conversationId: identity.conversationId,
    dshSessionId: identity.dshSessionId,
  };
  input.projection = {
    conversationId: identity.conversationId,
    dshSessionId: identity.dshSessionId,
    events: [],
  };
  return input;
}

function dshToolEvent({ toolCallId, title, status, rawInput, result }) {
  return {
    kind: 'tool',
    turn: 1,
    toolCallId,
    status,
    title,
    rawInput,
    rawOutput: [{ type: 'text', text: JSON.stringify(result) }],
  };
}

function workflowSnapshot(options = {}) {
  return {
    conversationId: 'conversation-1',
    events: options.events ?? [],
  };
}
