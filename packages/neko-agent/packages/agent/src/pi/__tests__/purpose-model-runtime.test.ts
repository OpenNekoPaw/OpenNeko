import {
  createAssistantMessageEventStream,
  createModels,
  type AssistantMessage,
} from '@earendil-works/pi-ai';
import { describe, expect, it, vi } from 'vitest';

import { resolveAgentModelPolicy } from '../model-policy';
import { completePiPurposeModel } from '../purpose-model-runtime';

const model = {
  id: 'canvas-prompt',
  name: 'Canvas prompt',
  api: 'openai-completions' as const,
  provider: 'openai',
  baseUrl: 'https://api.openai.invalid/v1',
  reasoning: false,
  input: ['text' as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_192,
  maxTokens: 1_024,
};

describe('completePiPurposeModel', () => {
  it('streams the exact resolved model and parameters without selecting a fallback', async () => {
    const models = createModels();
    const streamSimple = vi.spyOn(models, 'streamSimple').mockReturnValue(
      completedStream({
        role: 'assistant',
        content: [{ type: 'text', text: 'improved prompt' }],
        api: 'openai-completions',
        provider: 'openai',
        model: 'canvas-prompt',
        usage: {
          input: 10,
          output: 3,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 13,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 1,
      }),
    );
    const policy = resolveAgentModelPolicy({
      catalog: [
        {
          model,
          capabilities: ['llm.chat'],
          credentialState: 'configured',
          defaultParameters: { temperature: 0.4, topP: 0.85, maxTokens: 900 },
        },
      ],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'canvas-prompt' },
      },
    });

    await expect(
      completePiPurposeModel({
        models,
        modelUse: policy['agent.main'],
        context: {
          systemPrompt: 'Optimize a Canvas prompt.',
          messages: [{ role: 'user', content: 'draft', timestamp: 1 }],
        },
        maxTokens: 700,
      }),
    ).resolves.toEqual({
      purpose: 'agent.main',
      providerId: 'openai',
      modelId: 'canvas-prompt',
      text: 'improved prompt',
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
    });
    expect(streamSimple).toHaveBeenCalledTimes(1);
    expect(streamSimple).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', id: 'canvas-prompt' }),
      expect.objectContaining({ systemPrompt: 'Optimize a Canvas prompt.' }),
      expect.objectContaining({ temperature: 0.4, maxTokens: 700 }),
    );
    const options = streamSimple.mock.calls[0]?.[2];
    await expect(
      options?.onPayload?.({ model: 'canvas-prompt', messages: [] }, model),
    ).resolves.toEqual({ model: 'canvas-prompt', messages: [], top_p: 0.85 });
  });

  it.each([
    ['error', 'provider rejected request'],
    ['aborted', 'request aborted'],
  ] as const)('fails visibly when Pi reports %s', async (stopReason, errorMessage) => {
    const models = createModels();
    vi.spyOn(models, 'streamSimple').mockReturnValue(
      completedStream({
        role: 'assistant',
        content: [],
        api: 'openai-completions',
        provider: 'openai',
        model: 'canvas-prompt',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason,
        errorMessage,
        timestamp: 1,
      }),
    );
    const policy = resolveAgentModelPolicy({
      catalog: [{ model, capabilities: ['llm.chat'], credentialState: 'configured' }],
      userBindings: {
        'agent.main': { providerId: 'openai', modelId: 'canvas-prompt' },
      },
    });

    await expect(
      completePiPurposeModel({
        models,
        modelUse: policy['agent.main'],
        context: { messages: [{ role: 'user', content: 'draft', timestamp: 1 }] },
      }),
    ).rejects.toThrow(errorMessage);
  });
});

function completedStream(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: 'start', partial: message });
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      stream.push({ type: 'error', reason: message.stopReason, error: message });
      return;
    }
    stream.push({ type: 'done', reason: message.stopReason, message });
  });
  return stream;
}
