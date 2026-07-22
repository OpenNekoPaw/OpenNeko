import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TuiAutomationEmptyReadStream, TuiDebugAutomationSessionManager } from '../session-manager';
import type { TuiDebugAutomationAppPort, TuiDebugAutomationController } from '../types';
import { emitTerminalMarkdownPathEvent } from '../../../markdown/path-observer';
import { loadConfig } from '../../config';

const mockState = vi.hoisted(
  (): {
    renderedAppProps?: {
      readonly automation?: TuiDebugAutomationController;
      readonly resumeConversationId?: string;
      readonly initialPrompt?: string;
      readonly config?: Record<string, unknown>;
    };
    submittedPrompts: string[];
    terminalSizes: Array<{ columns: number; rows: number }>;
    initializationError?: Error;
  } => ({
    submittedPrompts: [],
    terminalSizes: [],
  }),
);

vi.mock('ink', () => ({
  render: (element: { readonly props?: typeof mockState.renderedAppProps }) => {
    mockState.renderedAppProps = element.props;
    emitTerminalMarkdownPathEvent({ type: 'session-created', key: 'assistant-before-bind' });
    element.props?.automation?.bind(createFakePort());
    return {
      unmount: vi.fn(),
      cleanup: vi.fn(),
      waitUntilExit: async () => undefined,
      clear: vi.fn(),
      rerender: vi.fn(),
    };
  },
}));

vi.mock('../../config', () => ({
  loadConfig: vi.fn((workDir: string) => ({
    provider: 'nekoapi-chat',
    providerType: 'openai-chat',
    providerRequiresApiKey: false,
    model: 'gpt-test',
    chatModel: { providerId: 'nekoapi-chat', modelId: 'gpt-test' },
    mediaModels: [],
    maxTokens: 8192,
    temperature: 0.7,
    verbose: false,
    workDir,
    mcpServers: [],
    outputFormat: 'text',
    thinkingBudget: 0,
  })),
  validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
}));

vi.mock('../../../components/App', () => ({
  App: (props: Record<string, unknown>) => React.createElement('mock-app', props),
}));

beforeEach(() => {
  mockState.renderedAppProps = undefined;
  mockState.submittedPrompts = [];
  mockState.terminalSizes = [];
  mockState.initializationError = undefined;
});

describe('TuiDebugAutomationSessionManager', () => {
  it('provides an Ink-compatible automation stdin without reading terminal input', () => {
    const input = new TuiAutomationEmptyReadStream();

    expect(input.isTTY).toBe(true);
    expect(input.setRawMode(true)).toBe(input);
    expect(input.ref()).toBe(input);
    expect(input.unref()).toBe(input);
  });

  it('mounts the complete TUI App owner and submits through the bound app port', async () => {
    const manager = new TuiDebugAutomationSessionManager({
      defaultWorkDir: '/workspace',
      createSessionId: () => 'debug-session-test',
    });

    const created = await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '1',
      method: 'session.create',
      params: {},
    });

    expect(created).toMatchObject({
      sessionId: 'debug-session-test',
      conversationId: 'tui-2026-01-01T00-00-00-000Z-test',
    });
    expect(mockState.renderedAppProps?.automation).toBeDefined();

    await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '2',
      method: 'message.submit',
      params: { sessionId: 'debug-session-test', prompt: 'hello' },
    });

    expect(mockState.submittedPrompts).toEqual(['hello']);

    await expect(
      manager.handle({
        schema: 'neko.tui-debug-automation.request.v1',
        id: 'cancel',
        method: 'message.cancel',
        params: { sessionId: 'debug-session-test' },
      }),
    ).resolves.toMatchObject({ accepted: true });

    await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '3',
      method: 'terminal.resize',
      params: { sessionId: 'debug-session-test', columns: 44, rows: 20 },
    });
    const facts = await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '4',
      method: 'session.facts',
      params: { sessionId: 'debug-session-test' },
    });

    expect(mockState.terminalSizes).toEqual([{ columns: 44, rows: 20 }]);
    expect(facts).toMatchObject({
      markdown: {
        pathEvents: [{ type: 'session-created', key: 'assistant-before-bind' }],
        droppedPathEventCount: 0,
      },
    });
    await manager.disposeAll();
  });

  it('passes validated flat model purposes into normal TUI config loading', async () => {
    const manager = new TuiDebugAutomationSessionManager({ defaultWorkDir: '/workspace' });

    await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: 'purpose-session',
      method: 'session.create',
      params: {
        modelPurposes: {
          'image.understand': {
            providerId: 'vision-provider',
            modelId: 'vision-config',
          },
        },
      },
    });

    expect(vi.mocked(loadConfig)).toHaveBeenLastCalledWith('/workspace', {
      provider: undefined,
      model: undefined,
      apiKey: undefined,
      defaultModelPurposes: {
        'image.understand': {
          providerId: 'vision-provider',
          modelId: 'vision-config',
        },
      },
    });
  });

  it('fails session creation immediately with the App initialization diagnostic', async () => {
    mockState.initializationError = new Error('conversation storage initialization failed');
    const manager = new TuiDebugAutomationSessionManager({
      defaultWorkDir: '/workspace',
      createSessionId: () => 'debug-session-failed',
    });

    await expect(
      manager.handle({
        schema: 'neko.tui-debug-automation.request.v1',
        id: 'failed-create',
        method: 'session.create',
        params: {},
      }),
    ).rejects.toMatchObject({
      code: 'internal-error',
      details: {
        sessionId: 'debug-session-failed',
        diagnostic: 'conversation storage initialization failed',
      },
    });
  });

  it('fails visibly for non-canonical resume conversation ids before mounting App', async () => {
    const manager = new TuiDebugAutomationSessionManager({
      defaultWorkDir: '/workspace',
    });

    await expect(
      manager.handle({
        schema: 'neko.tui-debug-automation.request.v1',
        id: '1',
        method: 'session.resume',
        params: { conversationId: 'cli-legacy-123' },
      }),
    ).rejects.toThrow('non-canonical');
    expect(mockState.renderedAppProps).toBeUndefined();
  });

  it('applies supported session runtime config and rejects unknown config before mounting', async () => {
    const manager = new TuiDebugAutomationSessionManager({ defaultWorkDir: '/workspace' });
    await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: 'configured',
      method: 'session.create',
      params: {
        runtimeConfig: {
          temperature: 0.2,
          maxTokens: 2048,
          thinkingBudget: 256,
          outputFormat: 'json',
        },
      },
    });
    expect(mockState.renderedAppProps?.config).toMatchObject({
      temperature: 0.2,
      maxTokens: 2048,
      thinkingBudget: 256,
      outputFormat: 'json',
    });
    await manager.disposeAll();

    mockState.renderedAppProps = undefined;
    await expect(
      manager.handle({
        schema: 'neko.tui-debug-automation.request.v1',
        id: 'invalid',
        method: 'session.create',
        params: { runtimeConfig: { evaluationVariant: 'candidate' } },
      }),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    expect(mockState.renderedAppProps).toBeUndefined();
  });

  it('preserves loaded defaults when a runtime profile overrides one setting', async () => {
    const manager = new TuiDebugAutomationSessionManager({ defaultWorkDir: '/workspace' });

    await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: 'partial-runtime-profile',
      method: 'session.create',
      params: { runtimeConfig: { thinkingBudget: 128 } },
    });

    expect(mockState.renderedAppProps?.config).toMatchObject({
      temperature: 0.7,
      maxTokens: 8192,
      thinkingBudget: 128,
      outputFormat: 'text',
    });
    await manager.disposeAll();
  });
});

function createFakePort(): TuiDebugAutomationAppPort {
  return {
    ownerKind: 'tui-app-session-owner',
    isReady: () => true,
    getInitializationError: () => mockState.initializationError ?? null,
    getConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
    async submitMessage(input) {
      mockState.submittedPrompts.push(input.prompt);
    },
    cancelActiveMessage() {
      return true;
    },
    async confirmPendingTool(input) {
      return {
        toolCallId: 'tool-call-1',
        toolName: input.toolName,
        approved: input.approved,
      };
    },
    resizeTerminal(input) {
      mockState.terminalSizes.push(input);
    },
    async waitForIdle() {
      return {
        turnIdle: { idle: true, terminal: true, status: 'idle' },
        backgroundTasksIdle: { idle: true, terminal: true, status: 'idle' },
        mediaDeliveryIdle: { idle: true, terminal: true, status: 'idle' },
        taskResultObservationIdle: { idle: true, terminal: true, status: 'idle' },
        fullyIdle: true,
      };
    },
    async readFacts(input) {
      return {
        sessionId: input.sessionId,
        conversationId: 'tui-2026-01-01T00-00-00-000Z-test',
        ready: true,
        model: { providerId: 'nekoapi-chat', modelId: 'gpt-test' },
        configuration: {
          digest: `sha256:${'a'.repeat(64)}`,
          runtime: {
            executionMode: 'auto',
            temperature: 0.7,
            maxTokens: 8192,
            thinkingBudget: 0,
            outputFormat: 'text',
          },
          chat: { providerId: 'nekoapi-chat', modelId: 'gpt-test' },
          modelPurposes: {},
        },
        idle: await this.waitForIdle({ timeoutMs: 1, pollIntervalMs: 1 }),
        turns: [],
        skillReceipts: [],
        tasks: [],
        messageQueue: null,
        continuations: [],
        promptComposition: [],
        artifacts: [],
        workspaceBoardProjections: [],
        workspaceBoardDelivery: {
          canonicalSubmissionCount: 0,
          resumeScanCount: 0,
          legacyFallbackCounts: {
            activeCanvas: 0,
            recentCanvas: 0,
            directWriter: 0,
            genericSendToCanvas: 0,
          },
        },
        runtimeErrors: [],
        canvas: { messageSummaries: [], toolCallSummaries: [] },
        markdown: mockState.renderedAppProps?.automation?.readMarkdownFacts() ?? {
          pathEvents: [],
          droppedPathEventCount: 0,
        },
        conversationPersistence: {
          authority: 'memory',
          catalog: 'memory',
          databaseScope: 'isolated-test',
          resume: { status: 'new', restoredMessageCount: 0 },
        },
        piRuntime: null,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        timing: { capturedAt: 1 },
        iteration: { current: 0, max: 0 },
        retries: { taskRetryCount: 0, tasksWithRetries: 0 },
        evidenceCompleteness: {
          turns: { limit: 512, droppedCount: 0 },
          turnToolCalls: { limit: 256, droppedCount: 0 },
          timelineRows: { limit: 2048, droppedCount: 0 },
          skillReceipts: { limit: 128, droppedCount: 0 },
          tasks: { limit: 512, droppedCount: 0 },
          continuations: { limit: 512, droppedCount: 0 },
          promptComposition: { limit: 256, droppedCount: 0 },
          artifacts: { limit: 512, droppedCount: 0 },
          workspaceBoardProjections: { limit: 128, droppedCount: 0 },
          runtimeErrors: { limit: 256, droppedCount: 0 },
          canvasMessageSummaries: { limit: 128, droppedCount: 0 },
          canvasToolCallSummaries: { limit: 128, droppedCount: 0 },
          markdownPathEvents: { limit: 2048, droppedCount: 0 },
        },
      };
    },
  };
}
