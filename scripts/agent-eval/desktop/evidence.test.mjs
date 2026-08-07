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

});

function run(input) {
  const facts = createDesktopEvaluationFacts({
    facts: input.facts,
    identity: input.identity,
    workflow: input.workflow,
    projection: input.projection,
    snapshot: input.snapshot,
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
      pausedAfterCancel: false,
      items: [],
    },
    queued: (options.pendingCount ?? 0) > 0,
    projectionEvents: [],
  };
}
