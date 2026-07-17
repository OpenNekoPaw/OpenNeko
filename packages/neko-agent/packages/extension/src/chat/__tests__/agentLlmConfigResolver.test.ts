import { describe, expect, it, vi } from 'vitest';
import { resolveAgentLlmConfigForTurn } from '../agentLlmConfigResolver';
import type { Platform } from '@neko/platform';
import type { MessageAttachment } from '@neko/shared';

function createPlatform(ref?: { providerId: string; modelId: string }): Platform {
  return {
    config: {
      resolveModelRefForPurpose: vi.fn((purpose: string) =>
        purpose === 'video.understand' ? ref : undefined,
      ),
    },
  } as unknown as Platform;
}

function createProviders() {
  return {
    getProvider: vi.fn((providerId: string) => {
      if (providerId === 'google') {
        return {
          id: 'google',
          isConfigured: true,
          modelIds: ['gemini-video-understand'],
        };
      }
      if (providerId === 'openai') {
        return {
          id: 'openai',
          isConfigured: true,
          modelIds: ['gpt-primary'],
        };
      }
      if (providerId === 'anthropic') {
        return {
          id: 'anthropic',
          isConfigured: true,
          modelIds: ['claude-primary'],
        };
      }
      if (providerId === 'runway') {
        return {
          id: 'runway',
          isConfigured: true,
          modelIds: ['gen-3'],
        };
      }
      return undefined;
    }),
    getProviderConfig: vi.fn(),
    getModel: vi.fn((modelId: string) => {
      if (modelId === 'gemini-video-understand') {
        return {
          id: 'gemini-video-understand',
          providerId: 'google',
          type: 'llm',
          enabled: true,
          capabilities: ['chat', 'vision_video'],
        };
      }
      if (modelId === 'gpt-primary') {
        return {
          id: 'gpt-primary',
          providerId: 'openai',
          type: 'llm',
          enabled: true,
          capabilities: ['chat'],
        };
      }
      if (modelId === 'claude-primary') {
        return {
          id: 'claude-primary',
          providerId: 'anthropic',
          type: 'llm',
          enabled: true,
          capabilities: ['chat', 'thinking_budget', 'max_output_tokens'],
        };
      }
      if (modelId === 'gen-3') {
        return {
          id: 'gen-3',
          providerId: 'runway',
          type: 'video',
          enabled: true,
          capabilities: ['video.generate'],
        };
      }
      return undefined;
    }),
  };
}

const videoAttachment: MessageAttachment = {
  id: 'video-1',
  name: 'clip.mp4',
  type: 'video',
  path: '/tmp/clip.mp4',
};

describe('resolveAgentLlmConfigForTurn media understanding routing', () => {
  it('projects session output limits while omitting unsupported thinking fields', () => {
    const providers = createProviders();
    vi.mocked(providers.getProviderConfig).mockReturnValue({
      id: 'openai',
      type: 'openai',
      enabled: true,
    } as never);

    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: 'agent',
      chatModel: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      llmConfig: { creativityPreset: 'creative' },
      settings: {
        temperature: 0.3,
        maxTokens: 8192,
        thinkingBudget: 10000,
      } as never,
      providers: providers as never,
      platform: createPlatform(undefined),
    });

    expect(resolved).toMatchObject({
      ok: true,
      llmRuntimeOptions: {
        projected: true,
        temperature: 0.7,
        topP: 0.95,
        maxTokens: 8192,
      },
    });
  });

  it('projects a supported session thinking budget through model capabilities', () => {
    const providers = createProviders();
    vi.mocked(providers.getProviderConfig).mockReturnValue({
      id: 'anthropic',
      type: 'anthropic',
      enabled: true,
      supportsBeta: true,
    } as never);

    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: 'agent',
      chatModel: { providerId: 'anthropic', modelId: 'claude-primary', category: 'llm' },
      settings: {
        maxTokens: 8192,
        thinkingBudget: 10000,
      } as never,
      providers: providers as never,
      platform: createPlatform(undefined),
    });

    expect(resolved).toMatchObject({
      ok: true,
      llmRuntimeOptions: {
        projected: true,
        maxTokens: 8192,
        thinkingBudget: 10000,
        providerOptions: {
          anthropic: {
            thinking: { type: 'enabled', budgetTokens: 10000 },
          },
        },
      },
    });
  });

  it('keeps the chat model and exposes video.understand for tool context when models differ', () => {
    const platform = createPlatform({ providerId: 'google', modelId: 'gemini-video-understand' });
    const providers = createProviders();

    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: 'agent',
      chatModel: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      attachments: [videoAttachment],
      settings: {},
      providers: providers as never,
      platform,
    });

    expect(resolved).toMatchObject({
      ok: true,
      chatModel: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      agentModels: {
        primary: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      },
      understandingModels: {
        video: { providerId: 'google', modelId: 'gemini-video-understand', category: 'llm' },
      },
      purposeModels: {
        'video.understand': {
          providerId: 'google',
          modelId: 'gemini-video-understand',
          category: 'llm',
        },
      },
    });
    expect(platform.config.resolveModelRefForPurpose).toHaveBeenCalledWith('video.understand');
  });

  it('does not use the video generation default as the video understanding model', () => {
    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: 'agent',
      chatModel: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      agentModels: {
        primary: { providerId: 'runway', modelId: 'gen-3', category: 'video' } as never,
      },
      attachments: [videoAttachment],
      settings: {},
      providers: createProviders() as never,
      platform: createPlatform(undefined),
    });

    expect(resolved).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'missing-media-understanding-model',
          message: expect.stringContaining('video.understand'),
        }),
      ],
    });
  });

  it('keeps the chat model while using the webview-selected understanding model for tool context', () => {
    const platform = createPlatform({ providerId: 'google', modelId: 'gemini-video-understand' });
    const providers = createProviders();
    vi.mocked(providers.getProvider).mockImplementation((providerId: string) => {
      if (providerId === 'google-pro') {
        return { id: 'google-pro', isConfigured: true, modelIds: ['gemini-video-pro'] };
      }
      return createProviders().getProvider(providerId);
    });
    vi.mocked(providers.getModel).mockImplementation((modelId: string) => {
      if (modelId === 'gemini-video-pro') {
        return {
          id: 'gemini-video-pro',
          providerId: 'google-pro',
          type: 'llm',
          enabled: true,
          capabilities: ['chat', 'vision_video'],
        };
      }
      return createProviders().getModel(modelId);
    });

    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: 'agent',
      chatModel: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      understandingModels: {
        video: { providerId: 'google-pro', modelId: 'gemini-video-pro', category: 'llm' },
      },
      purposeModels: {
        'video.understand': {
          providerId: 'google-pro',
          modelId: 'gemini-video-pro',
          category: 'llm',
        },
      },
      attachments: [videoAttachment],
      settings: {},
      providers: providers as never,
      platform,
    });

    expect(resolved).toMatchObject({
      ok: true,
      chatModel: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      understandingModels: {
        video: { providerId: 'google-pro', modelId: 'gemini-video-pro', category: 'llm' },
      },
    });
    expect(platform.config.resolveModelRefForPurpose).not.toHaveBeenCalled();
  });

  it('keeps an explicit flat purpose binding when the main model also handles understanding', () => {
    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: 'agent',
      chatModel: { providerId: 'google', modelId: 'gemini-video-understand', category: 'llm' },
      understandingModels: {
        video: { providerId: 'google', modelId: 'gemini-video-understand', category: 'llm' },
      },
      attachments: [videoAttachment],
      settings: {},
      providers: createProviders() as never,
      platform: createPlatform(undefined),
    });

    expect(resolved).toMatchObject({
      ok: true,
      chatModel: { providerId: 'google', modelId: 'gemini-video-understand', category: 'llm' },
      purposeModels: {
        'video.understand': {
          providerId: 'google',
          modelId: 'gemini-video-understand',
          category: 'llm',
        },
      },
    });
    expect(resolved.ok && resolved.understandingModels).toBeUndefined();
  });

  it('normalizes configured media selections into flat generation purposes once per turn', () => {
    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: 'agent',
      chatModel: { providerId: 'openai', modelId: 'gpt-primary', category: 'llm' },
      mediaModels: {
        image: { providerId: 'newapi', modelId: 'image-v1', category: 'image' },
        video: { providerId: 'newapi', modelId: 'video-v1', category: 'video' },
      },
      settings: {},
      providers: createProviders() as never,
      platform: createPlatform(undefined),
    });

    expect(resolved).toMatchObject({
      ok: true,
      purposeModels: {
        'image.generate': { providerId: 'newapi', modelId: 'image-v1', category: 'image' },
        'video.generate': { providerId: 'newapi', modelId: 'video-v1', category: 'video' },
      },
    });
    expect(resolved.ok && resolved.purposeModels).not.toHaveProperty('image.edit');
  });
});
