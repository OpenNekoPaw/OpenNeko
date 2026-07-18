import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION } from '@neko/shared';
import {
  createTuiAutomationAppPort as createProductionTuiAutomationAppPort,
  projectTaskFacts,
  readContinuationFacts,
  readMessageSummaryContent,
  readMessageToolCallSummaries,
} from '../app-port';
import type { TuiAutomationAppPortOptions } from '../app-port';
import type { Message } from '../../../types/state';
import {
  createTuiTestRuntime,
  type TuiTestRuntime,
} from '../../../__tests__/render-with-presentation';

let runtime: TuiTestRuntime;

type TestAppPortOptions = Omit<TuiAutomationAppPortOptions, 'submitInput'> &
  Partial<Pick<TuiAutomationAppPortOptions, 'submitInput'>>;

function createTuiAutomationAppPort(options: TestAppPortOptions) {
  return createProductionTuiAutomationAppPort({
    ...options,
    submitInput: options.submitInput ?? ((input) => options.readHandle().submit(input)),
  });
}

beforeEach(() => {
  runtime = createTuiTestRuntime();
});

afterEach(() => {
  runtime.application.dispose();
});

describe('readMessageSummaryContent', () => {
  it('uses explicit message content when present', () => {
    expect(readMessageSummaryContent(createMessage({ content: 'final answer' }))).toBe(
      'final answer',
    );
  });

  it('falls back to assistant timeline text for automation summaries', () => {
    expect(
      readMessageSummaryContent(
        createMessage({
          content: '',
          timelineRows: [
            {
              id: 'row-1',
              sequence: 1,
              kind: 'assistant_text',
              status: 'complete',
              content: 'hello ',
              timestamp: 1,
            },
            {
              id: 'row-2',
              sequence: 2,
              kind: 'tool',
              status: 'success',
              toolCallId: 'call-1',
              timestamp: 2,
            },
            {
              id: 'row-3',
              sequence: 3,
              kind: 'assistant_text',
              status: 'complete',
              content: 'world',
              timestamp: 3,
            },
          ],
        }),
      ),
    ).toBe('hello world');
  });
});

describe('readMessageToolCallSummaries', () => {
  it('keeps structured arguments, results, and failures from timeline-only projection', () => {
    expect(
      readMessageToolCallSummaries(
        createMessage({
          timelineRows: [
            {
              id: 'tool-row-create-skill',
              sequence: 1,
              kind: 'tool',
              status: 'error',
              toolCallId: 'call-create-skill',
              toolName: 'CreateSkill',
              toolArguments: {
                target: 'project',
                skill: { name: 'portable-review' },
              },
              toolResult: { code: 'skill-already-exists' },
              toolError: 'Skill directory already exists',
              resultSummary: 'Skill directory already exists',
              timestamp: 1,
            },
          ],
        }),
      ),
    ).toEqual([
      {
        id: 'call-create-skill',
        name: 'CreateSkill',
        status: 'error',
        arguments: {
          target: 'project',
          skill: { name: 'portable-review' },
        },
        result: { code: 'skill-already-exists' },
        error: 'Skill directory already exists',
        resultObservation: 'error',
        diagnostics: [
          {
            code: 'tool-call-error',
            severity: 'error',
            message: 'Skill directory already exists',
          },
        ],
      },
    ]);
  });

  it('includes tool calls projected as timeline rows', () => {
    expect(
      readMessageToolCallSummaries(
        createMessage({
          timelineRows: [
            {
              id: 'tool-row-1',
              sequence: 1,
              kind: 'tool',
              status: 'success',
              toolCallId: 'call-read-document',
              toolName: 'ReadDocument',
              resultSummary: '402 pages',
              timestamp: 1,
            },
          ],
        }),
      ),
    ).toEqual([
      {
        id: 'call-read-document',
        name: 'ReadDocument',
        status: 'success',
        result: '402 pages',
        resultObservation: 'available',
        diagnostics: [],
      },
    ]);
  });
});

describe('task result delivery idle projection', () => {
  it('keeps the session non-idle while a terminal Task result is being delivered', async () => {
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getPendingTaskResultDeliveryCount: () => 1,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });

    expect(facts.idle).toMatchObject({
      fullyIdle: false,
      mediaDeliveryIdle: { idle: false, status: 'delivering' },
      taskResultObservationIdle: { idle: false, status: 'observing' },
    });
  });
});

describe('readContinuationFacts', () => {
  it('reports executed and queued continuations without user-message parsing', () => {
    runtime.conversation.stores.conversation.getState().addSystemMessage({
      content: 'Task result ready task-1. Continuing from the completed async result.',
      source: 'task-result-continuation',
      displayKind: 'task-continuation',
      metadata: { taskId: 'task-1', observationId: 'obs-1', status: 'running' },
    });

    const facts = readContinuationFacts(
      {
        conversationId: 'conv-1',
        pendingCount: 1,
        version: 1,
        items: [
          {
            id: 'queue-1',
            conversationId: 'conv-1',
            content: 'Continue from subagent result',
            createdAt: 10,
            source: 'subagent-result-continuation',
            displayKind: 'subagent-continuation',
            metadata: { subagentId: 'subagent-1', status: 'queued' },
          },
        ],
      },
      runtime.conversation.stores,
    );
    expect(facts).toEqual([
      expect.objectContaining({
        source: 'task-result-continuation',
        displayKind: 'task-continuation',
        metadata: expect.objectContaining({ taskId: 'task-1', observationId: 'obs-1' }),
        status: 'running',
      }),
      expect.objectContaining({
        id: 'queue-1',
        source: 'subagent-result-continuation',
        displayKind: 'subagent-continuation',
        metadata: expect.objectContaining({ subagentId: 'subagent-1' }),
        status: 'queued',
      }),
    ]);
    expect(facts.every((fact) => fact.promptHash?.startsWith('sha256:'))).toBe(true);
    expect(JSON.stringify(facts)).not.toContain('Continue from subagent result');
  });
});

describe('projectTaskFacts', () => {
  it('projects stable scope, provider/model, result observation, metrics, and diagnostics', () => {
    const task = {
      scope: {
        conversationId: 'conversation-1',
        runId: 'run-1',
        runStartedAt: 1,
        parentRunId: 'parent-1',
        childRunId: 'task-child-1',
        childKind: 'task' as const,
      },
      id: 'task-1',
      type: 'image_generation' as const,
      status: 'completed' as const,
      input: {
        type: 'image_generation' as const,
        payload: { providerId: 'fal', modelId: 'flux-pro' },
      },
      output: {
        data: { stableRef: 'asset-1' },
        metrics: { startTime: 1, endTime: 4, duration: 3, retries: 1 },
      },
      progress: 100,
      createdAt: 1,
      updatedAt: 4,
      retryCount: 1,
    };
    const [fact] = projectTaskFacts(
      [task],
      [
        {
          id: 'continuation-1',
          conversationId: 'conversation-1',
          source: 'task-result-continuation',
          displayKind: 'task-continuation',
          metadata: {
            taskId: 'task-1',
            observationId: 'observation-1',
            status: 'completed',
          },
          status: 'completed',
          timestamp: 5,
          diagnostics: [],
        },
      ],
    );
    expect(fact).toMatchObject({
      scope: task.scope,
      id: 'task-1',
      providerId: 'fal',
      modelId: 'flux-pro',
      retryCount: 1,
      metrics: { duration: 3, retries: 1 },
      resultObservation: { status: 'observed', observationIds: ['observation-1'] },
      diagnostics: [],
    });
    expect(JSON.stringify(fact)).not.toContain('stableRef');
  });

  it('diagnoses a completed task with no output', () => {
    const [fact] = projectTaskFacts(
      [
        {
          scope: {
            conversationId: 'conversation-1',
            runId: 'run-1',
            parentRunId: 'parent-1',
            childRunId: 'task-child-1',
            childKind: 'task',
          },
          id: 'task-1',
          type: 'custom',
          status: 'completed',
          input: { type: 'custom', payload: {} },
          progress: 100,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      [],
    );
    expect(fact).toMatchObject({
      resultObservation: { status: 'missing' },
      diagnostics: [expect.objectContaining({ code: 'completed-task-output-missing' })],
    });
  });
});

describe('createTuiAutomationAppPort', () => {
  it('exposes a failed session initialization through the App owner port', () => {
    const initializationError = new Error('conversation storage initialization failed');
    runtime.conversation.stores.agent.getState().setError(initializationError);
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: false,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    expect(port.getInitializationError()).toBe(initializationError);
  });

  it('submits through the App user-input dispatcher instead of the raw session handle', async () => {
    const rawSubmit = vi.fn(async () => {
      throw new Error('raw session submit must not receive App user input');
    });
    const submitInput = vi.fn(async () => {
      runtime.conversation.stores.agent.getState().setRunning();
    });
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      submitInput,
      readHandle: () => ({
        isReady: true,
        submit: rawSubmit,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    await port.submitMessage({ prompt: '$creation-persona write a draft' });

    expect(submitInput).toHaveBeenCalledWith('$creation-persona write a draft');
    expect(rawSubmit).not.toHaveBeenCalled();
  });

  it('accepts a submission that settles with a projected Agent error', async () => {
    const expectedError = new Error('provider configuration unavailable');
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      submitInput: async () => {
        runtime.conversation.stores.agent.getState().setError(expectedError);
      },
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    await port.submitMessage({ prompt: 'run with unavailable provider' });

    expect(runtime.conversation.stores.agent.getState().error).toBe(expectedError);
    expect(runtime.conversation.stores.conversation.getState().messages).toEqual([]);
  });

  it('accepts submission without waiting for completion and exposes active cancellation', async () => {
    let resolveSubmit!: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    let cancelled = false;
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: () => submitPromise,
        cancel: () => {
          cancelled = true;
        },
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    runtime.conversation.stores.agent.getState().setRunning();
    const accepted = port.submitMessage({ prompt: 'long response' });
    expect(port.cancelActiveMessage()).toBe(true);
    expect(cancelled).toBe(true);
    resolveSubmit();
    await accepted;
  });

  it('fails the machine fact read visibly without injecting human transcript prose', async () => {
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => {
          throw new Error('TASK_PROVIDER_DETAIL');
        },
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    await expect(
      port.readFacts({ sessionId: 'debug-session-1', includeHistory: false }),
    ).rejects.toThrow('TASK_PROVIDER_DETAIL');
    expect(runtime.conversation.stores.conversation.getState().messages).toEqual([]);
  });

  it('exposes bounded Markdown facts and applies generic terminal resize through the UI store', async () => {
    const markdown = {
      pathEvents: [{ type: 'session-created' as const, key: 'assistant-1' }],
      droppedPathEventCount: 2,
    };
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => markdown,
    });

    port.resizeTerminal({ columns: 42, rows: 18 });
    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });

    expect(runtime.conversation.stores.ui.getState().terminalSize).toEqual({
      columns: 42,
      rows: 18,
    });
    expect(facts.markdown).toEqual(markdown);
    expect(facts.conversationPersistence).toEqual(memoryPersistenceSnapshot());
  });


  it('projects a secret-free effective configuration digest from the current session stores', async () => {
    runtime.conversation.stores.config.getState().setConfig({
      temperature: 0.25,
      maxTokens: 2048,
      thinkingBudget: 128,
      outputFormat: 'json',
      apiKey: 'MUST_NOT_PROJECT',
      baseUrl: 'https://secret-bearing.invalid',
    });
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'conversation-1',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });
    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });
    expect(facts.configuration).toMatchObject({
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      runtime: {
        temperature: 0.25,
        maxTokens: 2048,
        thinkingBudget: 128,
        outputFormat: 'json',
      },
      chat: facts.model,
    });
    expect(JSON.stringify(facts.configuration)).not.toContain('MUST_NOT_PROJECT');
    expect(JSON.stringify(facts.configuration)).not.toContain('secret-bearing');
  });

  it('forwards only bounded secret-free prompt composition metadata', async () => {
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'conversation-1',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
        getPromptCompositionProjection: () => [
          {
            id: 'skill:storyboard',
            source: 'skill-lifecycle',
            order: 0,
            version: `sha256:${'a'.repeat(64)}`,
            hash: `sha256:${'b'.repeat(64)}`,
          },
        ],
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });
    expect(facts.promptComposition).toEqual([
      {
        id: 'skill:storyboard',
        source: 'skill-lifecycle',
        order: 0,
        version: `sha256:${'a'.repeat(64)}`,
        hash: `sha256:${'b'.repeat(64)}`,
      },
    ]);
    expect(facts.evidenceCompleteness.promptComposition).toEqual({
      limit: 256,
      droppedCount: 0,
    });
    expect(JSON.stringify(facts.promptComposition)).not.toContain('content');
    expect(JSON.stringify(facts.promptComposition)).not.toContain('systemPrompt');
  });

  it('collects stable artifact facts from canonical Timeline rows', async () => {
    runtime.conversation.stores.conversation.getState().startAssistantMessage();
    runtime.conversation.stores.conversation.getState().applyTimelineRows([
      {
        id: 'tool-row-1',
        sequence: 1,
        kind: 'tool',
        status: 'success',
        toolCallId: 'tool-call-1',
        toolName: 'CreateArtifact',
        artifactFacts: [
          {
            ref: 'artifact-1',
            kind: 'composite-artifact',
            digest: `sha256:${'a'.repeat(64)}`,
            provenance: { source: 'tool', toolCallId: 'tool-call-1' },
            deliveryStatus: 'delivered',
            validator: { id: 'composite-artifact-schema', status: 'valid' },
            diagnostics: [],
          },
        ],
        timestamp: 1,
      },
    ]);
    runtime.conversation.stores.conversation.getState().completeMessage('Created artifact.');
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'conversation-1',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });
    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });
    expect(facts.artifacts).toEqual([
      expect.objectContaining({
        ref: 'artifact-1',
        digest: `sha256:${'a'.repeat(64)}`,
        deliveryStatus: 'delivered',
        validator: { id: 'composite-artifact-schema', status: 'valid' },
      }),
    ]);
  });

  it('projects bounded Workspace Board outcomes without exposing document URIs', async () => {
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'conversation-1',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
        getWorkspaceBoardProjections: () => [
          {
            version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
            status: 'projected',
            target: {
              kind: 'workspace',
              documentUri: 'file:///private/workspace/neko/boards/workspace.nkc',
            },
            revision: `sha256:${'c'.repeat(64)}`,
            nodeIds: ['workspace-inbox', 'generated-output-1'],
            diagnostics: [],
          },
        ],
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });

    expect(facts.workspaceBoardProjections).toEqual([
      {
        status: 'projected',
        targetKind: 'workspace',
        revision: `sha256:${'c'.repeat(64)}`,
        nodeIds: ['workspace-inbox', 'generated-output-1'],
        diagnosticCodes: [],
      },
    ]);
    expect(facts.evidenceCompleteness.workspaceBoardProjections).toEqual({
      limit: 128,
      droppedCount: 0,
    });
    expect(JSON.stringify(facts.workspaceBoardProjections)).not.toContain('documentUri');
    expect(JSON.stringify(facts.workspaceBoardProjections)).not.toContain('/private/workspace');
  });

  it('collects revision-bound generated-output facts from completed media tasks', async () => {
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [
          {
            scope: {
              conversationId: 'conversation-1',
              runId: 'run-1',
              parentRunId: 'run-1',
              childRunId: 'task-1',
              childKind: 'task' as const,
            },
            id: 'task-1',
            type: 'image_generation' as const,
            status: 'completed' as const,
            input: { type: 'image_generation' as const, payload: {} },
            output: {
              data: {
                assets: [
                  {
                    localPath: '/private/runtime/generated-1.png',
                    resourceRef: {
                      id: 'resource:generated-1:rev-1',
                      scope: 'project' as const,
                      provider: 'generated-asset',
                      kind: 'generated' as const,
                      source: {
                        kind: 'generated-asset' as const,
                        generatedAssetId: 'generated-1',
                        metadata: { revision: 'rev-1', contentDigest: 'sha256:content' },
                      },
                      locator: { kind: 'generated-asset' as const, assetId: 'generated-1' },
                      fingerprint: { strategy: 'hash' as const, value: 'sha256:content' },
                    },
                  },
                ],
              },
            },
            progress: 100,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        getCurrentConversationId: () => 'conversation-1',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });

    expect(facts.artifacts).toEqual([
      expect.objectContaining({
        ref: 'resource:generated-1:rev-1',
        kind: 'generated-asset',
        digest: 'sha256:content',
        revision: 'rev-1',
        provenance: expect.objectContaining({ taskId: 'task-1' }),
        validator: { id: 'durable-resource-ref', status: 'valid' },
      }),
    ]);
    expect(JSON.stringify(facts.artifacts)).not.toContain('/private/runtime');
  });

  it('bounds fact collections and projects usage, timing, retry, and dropped counts', async () => {
    runtime.conversation.stores.conversation
      .getState()
      .replaceMessages(
        Array.from({ length: 520 }, (_value, index) =>
          createMessage({ id: `message-${index}`, timestamp: index + 1 }),
        ),
      );
    runtime.conversation.stores.agent
      .getState()
      .updateUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    runtime.conversation.stores.agent.getState().setContextTokenCount(321);
    const port = createTuiAutomationAppPort({
      stores: runtime.conversation.stores,
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'conversation-1',
        getHistory: () => Array.from({ length: 513 }, (_value, index) => ({ index })),
        getMessageQueueSnapshot: () => null,
        getConversationPersistenceSnapshot: memoryPersistenceSnapshot,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 3 }),
    });
    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: true });
    expect(facts.turns).toHaveLength(512);
    expect(facts.history).toHaveLength(512);
    expect(facts.usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      contextTokens: 321,
    });
    expect(facts.timing).toMatchObject({ firstTurnAt: 9, lastTurnAt: 520 });
    expect(facts.retries).toEqual({ taskRetryCount: 0, tasksWithRetries: 0 });
    expect(facts.evidenceCompleteness).toMatchObject({
      turns: { limit: 512, droppedCount: 8 },
      history: { limit: 512, droppedCount: 1 },
      markdownPathEvents: { limit: 2048, droppedCount: 3 },
    });
  });
});

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    toolCalls: [],
    todos: [],
    timestamp: 1,
    ...overrides,
  };
}

function memoryPersistenceSnapshot() {
  return {
    authority: 'memory' as const,
    catalog: 'memory' as const,
    databaseScope: 'isolated-test' as const,
    resume: { status: 'new' as const, restoredMessageCount: 0 },
  };
}
