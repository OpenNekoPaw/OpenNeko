import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Model, Provider } from '@neko/platform';
import type { PiProductEventSink } from '@neko/agent/pi';

import type { IAgentManager } from '../../ai/agentManager';
import { AgentTurnBridge, type ExecuteAgentTurnForWebviewInput } from './agentTurnBridge';
import type { AgentStreamProcessor, StreamProcessingResult } from './agentStreamProcessor';

vi.mock('vscode', () => ({}));

const provider: Provider = {
  id: 'gateway',
  name: 'gateway',
  displayName: 'Gateway',
  type: 'newapi',
  apiUrl: 'https://gateway.example/v1',
  enabled: true,
  protocolProfile: 'newapi',
  requiresApiKey: true,
  useBearerAuth: true,
};

const model: Model = {
  id: 'chat-model',
  name: 'api-chat-model',
  displayName: 'Chat Model',
  providerId: 'gateway',
  capabilities: ['llm.chat', 'streaming'],
  contextWindow: 64_000,
  maxOutputTokens: 8_000,
  enabled: true,
};

const visionModel: Model = {
  ...model,
  id: 'vision-model',
  name: 'api-vision-model',
  displayName: 'Vision Model',
  capabilities: ['image.understand', 'vision'],
};

const imageModel: Model = {
  id: 'image-model',
  name: 'api-image-model',
  displayName: 'Image Model',
  providerId: 'gateway',
  type: 'image',
  capabilities: ['image.generate'],
  enabled: true,
};

const streamResult: StreamProcessingResult = {
  messageId: 'message-1',
  identity: { turnId: 'turn-1', runId: 'run-1' },
  accumulatedResponse: 'done',
  accumulatedThinking: '',
  hasError: false,
  terminalStatus: 'completed',
  collectedToolCalls: [],
  contentBlocks: [],
};

describe('AgentTurnBridge Pi canonical path', () => {
  const pendingItems: Array<{
    id: string;
    conversationId: string;
    content: string;
    createdAt: number;
    source: 'composer' | 'task-result-continuation';
  }> = [];
  const executePiTurn = vi.fn();
  const legacyGetOrCreate = vi.fn(() => {
    throw new Error('legacy AgentRunner path was invoked');
  });
  const postMessage = vi.fn(async () => true);
  const streamDispose = vi.fn();
  const deliverCreatorVisibleArtifacts = vi.fn(async () => []);
  const streamEvents: PiProductEventSink = { emit: vi.fn() };
  const createPiStream = vi.fn(() => ({
    events: streamEvents,
    result: () => streamResult,
    dispose: streamDispose,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    pendingItems.length = 0;
    executePiTurn.mockResolvedValue({
      status: 'completed',
      turnId: 'turn-1',
      runId: 'run-1',
      durability: 'durable',
    });
  });

  it('executes the real Webview turn through Pi without AgentRunner fallback', async () => {
    const bridge = createBridge();
    const result = await bridge.execute(createInput());

    expect(result.status).toBe('completed');
    expect(executePiTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        prompt: 'hello',
        provider,
        model,
        providerSource: 'explicit-config',
        executionMode: 'ask',
        events: streamEvents,
        images: [{ type: 'base64', media_type: 'image/png', data: 'cG5n' }],
      }),
    );
    expect(createPiStream).toHaveBeenCalledWith(
      expect.objectContaining({ postMessage }),
      'conversation-1',
      'message-1',
      expect.any(Function),
    );
    expect(legacyGetOrCreate).not.toHaveBeenCalled();
    expect(streamDispose).toHaveBeenCalledOnce();
  });

  it('submits one terminal artifact batch with the original Pi turn/run identity', async () => {
    createPiStream.mockReturnValueOnce({
      events: streamEvents,
      result: () => ({
        ...streamResult,
        collectedToolCalls: [
          {
            id: 'tool-1',
            name: 'AnalyzeMaterial',
            arguments: {},
            result: {
              success: true,
              data: {},
              artifacts: [
                {
                  type: 'artifactSnapshot',
                  complete: true,
                  artifact: {
                    schemaVersion: 1,
                    kind: 'composite-artifact',
                    artifactId: 'analysis-1',
                    title: 'Material Analysis',
                    blocks: [{ blockId: 'text-1', kind: 'text', text: 'Findings.' }],
                  },
                },
              ],
            },
          },
        ],
      }),
      dispose: streamDispose,
    });
    const bridge = createBridge();

    await bridge.execute(createInput());

    expect(deliverCreatorVisibleArtifacts).toHaveBeenCalledTimes(1);
    expect(deliverCreatorVisibleArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: 'agent-turn:turn-1',
        runId: 'run-1',
        artifacts: [
          expect.objectContaining({
            artifactId: 'analysis-1',
            kind: 'markdown',
            role: 'analysis',
          }),
        ],
      }),
    );
  });

  it('projects normalized topP into the exact Pi turn snapshot', async () => {
    const bridge = createBridge();

    await bridge.execute(
      createInput({
        llmRuntimeOptions: {
          projected: true,
          topP: 0.95,
        },
      }),
    );

    expect(executePiTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        topP: 0.95,
      }),
    );
    expect(legacyGetOrCreate).not.toHaveBeenCalled();
  });

  it('queues a concurrent message at the Host boundary without starting a second runtime', async () => {
    let release!: () => void;
    executePiTurn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              status: 'completed',
              turnId: 'turn-1',
              runId: 'run-1',
              durability: 'durable',
            });
        }),
    );
    const bridge = createBridge();
    const first = bridge.execute(createInput());
    await vi.waitFor(() => expect(executePiTurn).toHaveBeenCalledTimes(1));
    const queued = await bridge.execute(createInput({ message: 'second' }));

    expect(queued.status).toBe('queued');
    expect(executePiTurn).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'messageQueued', content: 'second' }),
    );

    release();
    await first;
    await vi.waitFor(() => expect(executePiTurn).toHaveBeenCalledTimes(2));
  });

  it('fails visibly when the selected model is not owned by the selected provider', async () => {
    const bridge = createBridge({
      getModel: () => ({ ...model, providerId: 'other-provider' }),
    });

    await expect(bridge.execute(createInput())).rejects.toThrow(
      'Configured Pi model gateway/chat-model is unavailable.',
    );
    expect(executePiTurn).not.toHaveBeenCalled();
    expect(legacyGetOrCreate).not.toHaveBeenCalled();
  });

  it('projects bounded understanding as a flat Pi purpose model', async () => {
    const bridge = createBridge({
      getModel: (modelId) => (modelId === visionModel.id ? visionModel : model),
    });

    await bridge.execute(
      createInput({
        purposeModels: {
          'image.understand': {
            providerId: provider.id,
            modelId: visionModel.id,
            category: 'llm',
          },
        },
      }),
    );

    expect(executePiTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        purposeModels: {
          'image.understand': {
            provider,
            model: visionModel,
            providerSource: 'explicit-config',
          },
        },
      }),
    );
  });

  it('projects domain generation as a peer flat purpose selection', async () => {
    const bridge = createBridge({
      getModel: (modelId) => (modelId === imageModel.id ? imageModel : model),
    });

    await bridge.execute(
      createInput({
        purposeModels: {
          'image.generate': {
            providerId: provider.id,
            modelId: imageModel.id,
            category: 'image',
          },
        },
      }),
    );

    expect(executePiTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        purposeModels: {
          'image.generate': {
            provider,
            model: imageModel,
            providerSource: 'explicit-config',
          },
        },
      }),
    );
  });

  function createBridge(overrides?: {
    getModel?: (modelId: string) => Model | undefined;
  }): AgentTurnBridge {
    return new AgentTurnBridge({
      providers: {
        getProviderConfig: () => provider,
        getModel: overrides?.getModel ?? (() => model),
        getProviderSource: () => 'explicit-config',
      } as never,
      agentManager: {
        executePiTurn,
        getOrCreate: legacyGetOrCreate,
        enqueuePendingMessage: vi.fn((conversationId, input) => {
          const item = {
            id: `queue-${pendingItems.length + 1}`,
            conversationId,
            content: input.content,
            createdAt: Date.now(),
            source: input.source ?? 'composer',
          };
          pendingItems.push(item);
          return item;
        }),
        getPendingMessageQueue: vi.fn(() => [...pendingItems]),
        promotePendingMessage: vi.fn((_conversationId, queueItemId) => {
          const index = pendingItems.findIndex((item) => item.id === queueItemId);
          const [item] = pendingItems.splice(index, 1);
          if (!item) throw new Error(`Missing queued item ${queueItemId}`);
          pendingItems.unshift(item);
          return item;
        }),
        dequeuePendingMessage: vi.fn(() => pendingItems.shift() ?? null),
      } as unknown as IAgentManager,
      getSystemPrompt: () => 'system prompt',
      streamProcessor: { createPiStream } as unknown as AgentStreamProcessor,
      terminalArtifactDelivery: { deliverCreatorVisibleArtifacts },
      onPhaseChange: vi.fn(),
      generateMessageId: () => 'message-1',
    });
  }

  function createInput(
    overrides: Partial<ExecuteAgentTurnForWebviewInput> = {},
  ): ExecuteAgentTurnForWebviewInput {
    return {
      webview: { postMessage } as never,
      conversationId: 'conversation-1',
      message: 'hello',
      chatModel: { providerId: 'gateway', modelId: 'chat-model' },
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'cG5n' }],
      locale: 'en-US',
      settings: {
        selectedProviderId: 'gateway',
        selectedModelId: 'chat-model',
        customSystemPrompt: '',
        autoExecuteTools: false,
        streamResponses: true,
        showToolCalls: true,
        temperature: 0.2,
        maxTokens: 2_000,
        executionMode: 'ask',
        thinkingBudget: 0,
      },
      ...overrides,
    };
  }
});
