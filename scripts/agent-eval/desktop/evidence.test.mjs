import { describe, expect, it } from 'vitest';
import {
  assertDesktopEvidenceSupport,
  createDesktopEvaluationFacts,
  requiresOpenNekoResourceObservation,
} from './evidence.mjs';
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

  it('derives package-owned media observation from assertion semantics', () => {
    expect(
      requiresOpenNekoResourceObservation([
        {
          kind: 'resource-display-projection',
          status: 'authorized',
          transport: 'openneko-resource',
        },
      ]),
    ).toBe(true);
    expect(
      requiresOpenNekoResourceObservation([
        { kind: 'final-answer', mode: 'non-empty', evidenceRef: 'facts' },
      ]),
    ).toBe(false);
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
        {
          id: 'queue',
          kind: 'queue-state',
          stepId: 'queue',
          status: 'queued',
          evidenceRef: 'facts',
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

  it('proves queued, drained and ordered workflow state from public Desktop snapshots', () => {
    const assertions = [
      {
        id: 'queued',
        kind: 'queue-state',
        stepId: 'review',
        status: 'queued',
        minPending: 1,
        evidenceRef: 'facts',
      },
      {
        id: 'drained',
        kind: 'queue-state',
        stepId: 'idle',
        status: 'drained',
        evidenceRef: 'facts',
      },
      {
        id: 'order',
        kind: 'process-order',
        events: [
          { kind: 'workflow-step', stepId: 'draft', method: 'message.submit' },
          { kind: 'workflow-step', stepId: 'review', method: 'message.submit' },
          { kind: 'turn', role: 'assistant' },
        ],
        evidenceRef: 'facts',
      },
    ];
    const input = evidenceInput(assertions);
    input.workflow.steps = [
      {
        id: 'draft',
        kind: 'submit',
        method: 'message.submit',
        accepted: true,
        snapshot: workflowSnapshot({ pendingCount: 0 }),
      },
      {
        id: 'review',
        kind: 'queue',
        method: 'message.submit',
        accepted: true,
        queued: true,
        snapshot: workflowSnapshot({ pendingCount: 1 }),
      },
      {
        id: 'idle',
        kind: 'wait-for-idle',
        method: 'session.waitForIdle',
        snapshot: workflowSnapshot({
          pendingCount: 0,
          messages: [{ id: 'assistant-1', role: 'assistant', content: 'complete' }],
        }),
      },
    ];

    expect(run(input)).toEqual([
      expect.objectContaining({ id: 'queued', status: 'pass' }),
      expect.objectContaining({ id: 'drained', status: 'pass' }),
      expect.objectContaining({ id: 'order', status: 'pass' }),
    ]);

    input.workflow.steps[1].queued = false;
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('not accepted') }),
    );
  });

  it('proves cancellation pause and exact queued-item send-now identity', () => {
    const assertions = [
      {
        id: 'paused',
        kind: 'queue-state',
        stepId: 'cancelled-idle',
        status: 'paused-after-cancel',
        minPending: 2,
        evidenceRef: 'facts',
      },
      {
        id: 'send-now',
        kind: 'queue-state',
        stepId: 'priority-now',
        status: 'resumed-by-send-now',
        queueStepId: 'priority',
        evidenceRef: 'facts',
      },
    ];
    const input = evidenceInput(assertions);
    input.workflow.steps = [
      {
        id: 'priority',
        kind: 'queue',
        method: 'message.submit',
        accepted: true,
        queued: true,
        queueItemId: 'queue-priority',
        snapshot: workflowSnapshot({ pendingCount: 2 }),
      },
      {
        id: 'cancelled-idle',
        kind: 'wait-for-idle',
        method: 'session.waitForIdle',
        snapshot: workflowSnapshot({ pendingCount: 2, paused: true }),
      },
      {
        id: 'priority-now',
        kind: 'send-queued-now',
        method: 'message.queue.send-now',
        accepted: true,
        queueItemId: 'queue-priority',
        queueStepId: 'priority',
        snapshot: workflowSnapshot({ pendingCount: 1, paused: false }),
      },
    ];

    expect(run(input)).toEqual([
      expect.objectContaining({ id: 'paused', status: 'pass' }),
      expect.objectContaining({ id: 'send-now', status: 'pass' }),
    ]);

    input.workflow.steps[2].queueItemId = 'queue-other';
    expect(run(input)[1]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('exact item') }),
    );
  });

  it('proves denied resource projection without authorizing a render transport', () => {
    const assertion = {
      id: 'denied-resource',
      kind: 'resource-display-projection',
      projectionKind: 'tool-result',
      status: 'denied',
      locatorKind: 'workspace-file',
      transport: 'none',
      renderTarget: 'agent-webview',
      diagnosticsEmpty: false,
      evidenceRef: 'facts',
    };
    const input = evidenceInput([assertion]);
    input.facts.receipts.tools.items.push({ callId: 'tool-1', name: 'Read', status: 'error' });
    input.facts.resourceDisplayProjections.items.push({
      conversationId: input.identity.conversationId,
      toolCallId: 'tool-1',
      projectionKind: 'tool-result',
      status: 'denied',
      locatorKind: 'workspace-file',
      transport: 'none',
      renderTarget: 'agent-webview',
      diagnosticCodes: ['resource-not-authorized'],
    });

    expect(run(input)[0]).toEqual(expect.objectContaining({ status: 'pass' }));
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
    const input = evidenceInput([assertion]);
    input.facts.receipts.tools.items.push({
      callId: 'automation-call-1',
      name: assertion.name,
      status: 'success',
    });
    input.projection.events.push({
      kind: 'tool_call',
      payload: {
        toolCall: {
          id: 'automation-call-1',
          name: assertion.name,
          result: {
            success: true,
            data: {
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
            },
          },
        },
      },
    });

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

    input.projection.events[0].payload.toolCall.result.data.session.processId = 42;
    expect(run(input)[0]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('session fields'),
      }),
    );
  });

  it('requires a real resumed Pi Session snapshot for persistence evidence', () => {
    const assertion = {
      id: 'persistence',
      kind: 'conversation-persistence',
      authority: 'pi-session',
      catalog: 'sqlite',
      databaseScope: 'user-global',
      resumeStatus: 'restored',
      recordSource: 'pi-session',
      minRestoredMessages: 2,
      evidenceRef: 'facts',
    };
    const input = evidenceInput([assertion]);
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
    firstFacts.identity.turnId = 'turn-a';
    firstFacts.identity.runId = 'run-a';
    firstFacts.configuration.effective.values.modelBinding = {
      providerId: 'provider-1',
      modelId: 'model-a',
    };
    input.workflow.receipts = {
      'first-idle': {
        identity: { conversationId: 'conversation-1', turnId: 'turn-a', runId: 'run-a' },
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
      expect.objectContaining({ id: 'models', status: 'pass' }),
      expect.objectContaining({ id: 'compact', status: 'pass' }),
    ]);

    input.interaction.final.draftId = 'draft-2';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('binding') }),
    );
    input.interaction.final.draftId = 'draft-1';
    input.workflow.receipts['first-idle'].identity.turnId = 'turn-1';
    input.workflow.receipts['first-idle'].facts.identity.turnId = 'turn-1';
    expect(run(input)[1]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('distinct Turn identities'),
      }),
    );
  });

  it('proves Draft rejection has no Session side effect and configuration updates create no Turn', () => {
    const assertions = [
      {
        id: 'entry-compact',
        kind: 'draft-rejection',
        stepId: 'compact-draft',
        catalogRef: 'initial',
        initialBindingKind: 'unbound',
        currentBindingKind: 'unbound',
        surfaceBindingKind: 'unbound',
        conversationCreated: false,
        messageIncludes: 'committed conversation session',
        availabilityCode: 'session-required',
        evidenceRef: 'facts',
      },
      {
        id: 'model-update',
        kind: 'configuration-update',
        stepId: 'configure-next',
        providerId: 'provider-1',
        modelId: 'model-1',
        status: 'applied',
        turnState: 'running',
        turnCreated: false,
        evidenceRef: 'facts',
      },
    ];
    const input = evidenceInput(assertions);
    input.workflow.receipts = {
      'compact-draft': {
        accepted: false,
        status: 'rejected',
        catalogRef: 'initial',
        diagnosticMessage: "Agent route 'compact' requires a committed conversation session.",
        initialBindingKind: 'unbound',
        currentBindingKind: 'unbound',
        conversationCreated: false,
        surfaceBefore: { phase: 'draft', bindingKind: 'unbound', draftId: 'draft-1' },
        surfaceAfter: { phase: 'draft', bindingKind: 'unbound', draftId: 'draft-1' },
        availability: { diagnostic: { code: 'session-required' } },
      },
      'configure-next': {
        accepted: true,
        status: 'applied',
        conversationId: 'conversation-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        turnStateAtUpdate: 'running',
        submissionCountBefore: 1,
        submissionCountAfter: 1,
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
        id: 'entry-compact',
        status: 'pass',
        details: expect.objectContaining({ conversationCreated: false }),
      }),
      expect.objectContaining({
        id: 'model-update',
        status: 'pass',
        details: expect.objectContaining({ turnCreated: false }),
      }),
    ]);

    input.workflow.receipts['compact-draft'].surfaceAfter.conversationId = 'conversation-2';
    expect(run(input)[0]).toEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('rejection') }),
    );
    delete input.workflow.receipts['compact-draft'].surfaceAfter.conversationId;
    input.workflow.receipts['configure-next'].submissionCountAfter = 2;
    expect(run(input)[1]).toEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('configuration update evidence'),
      }),
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
  });
  return evaluateHardGates(input.executionCase.assertions, facts, {
    executionCase: input.executionCase,
    authorization: input.authorization,
  });
}

function evidenceInput(assertions) {
  const identity = { conversationId: 'conversation-1', turnId: 'turn-1', runId: 'run-1' };
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
        branchId: 'branch-1',
        piSessionId: 'pi-session-1',
      },
      runtimePath: {
        controller: 'sender-bound-desktop-agent-controller',
        runtime: 'pi-conversation-runtime',
        transcript: 'pi-session',
        metadata: 'sqlite',
        projection: 'conversation-projection-store',
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
      projection: { terminalState: 'completed' },
      resourceDisplayProjections: bounded(),
      persistence: { durability: 'durable', checkpoint: 'observed' },
      diagnostics: bounded(),
      disposal: { status: 'disposed' },
    },
  };
}

function workflowSnapshot(options = {}) {
  return {
    conversationId: 'conversation-1',
    messages: options.messages ?? [],
    messageQueue: {
      conversationId: 'conversation-1',
      pendingCount: options.pendingCount ?? 0,
      sequence: 1,
      paused: options.paused ?? false,
      items: options.items ?? [],
    },
    queued: (options.pendingCount ?? 0) > 0,
    projectionEvents: [],
  };
}
