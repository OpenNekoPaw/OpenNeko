import { describe, expect, it } from 'vitest';
import type { ChatModelOption } from '@neko/shared';
import type { Model, Provider } from '../../types/provider';
import {
  buildAssistantConfigState,
  buildAssistantConfiguredProviderViews,
  buildAssistantProviderMutationResultMessage,
  buildAssistantProviderViews,
  buildAssistantProviderMutationSettingsUpdate,
  buildAssistantRuntimeSettingsSnapshot,
  buildAssistantSettingsDataMessage,
  buildAssistantSettingsUpdatedMessage,
  buildDefaultMediaModelOptionIds,
  mapAssistantSettingsToUnifiedScalars,
  mapWebviewSettingsToUnifiedScalars,
  selectAssistantDefaultProvider,
  selectAssistantProvider,
} from '../assistant-config';

const anthropicProvider: Provider = {
  id: 'anthropic',
  name: 'anthropic',
  displayName: 'Anthropic',
  type: 'anthropic',
  apiUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant',
  enabled: true,
};

const openaiProvider: Provider = {
  id: 'openai',
  name: 'openai',
  displayName: 'OpenAI',
  type: 'openai',
  apiUrl: 'https://api.openai.com/v1',
  enabled: true,
};

const ollamaLocalProvider: Provider = {
  id: 'ollama-local',
  name: 'ollama',
  displayName: 'Ollama Local',
  type: 'ollama',
  apiUrl: 'http://localhost:11434/api',
  enabled: true,
  connectionKind: 'local',
  protocolProfile: 'ollama',
  supportLevel: 'compatible',
  requiresApiKey: false,
};

const claudeModel: Model = {
  id: 'anthropic-claude-sonnet-4',
  name: 'claude-sonnet-4-20250514',
  displayName: 'Claude Sonnet 4',
  providerId: 'anthropic',
  type: 'llm',
  enabled: true,
  capabilities: ['chat'],
};

const imageModel: Model = {
  id: 'openai-dall-e-3',
  name: 'dall-e-3',
  displayName: 'DALL-E 3',
  providerId: 'openai',
  type: 'image',
  enabled: true,
  capabilities: ['image_generation'],
};

const localChatModel: Model = {
  id: 'ollama-local-llama3.2',
  name: 'llama3.2',
  displayName: 'Llama 3.2',
  providerId: 'ollama-local',
  type: 'llm',
  enabled: true,
  capabilities: ['chat'],
};

function createConfig(input?: { providers?: Provider[]; models?: Model[] }) {
  return {
    providers: new Map(
      (input?.providers ?? [anthropicProvider, openaiProvider]).map(
        (provider): [string, Provider] => [provider.id, provider],
      ),
    ),
    models: new Map(
      (input?.models ?? [claudeModel, imageModel]).map((model): [string, Model] => [
        model.id,
        model,
      ]),
    ),
  };
}

describe('assistant config presenter', () => {
  it('projects provider views from platform config', () => {
    const providers = buildAssistantProviderViews(createConfig());

    expect(providers).toEqual([
      {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        enabled: true,
        models: [
          {
            id: 'anthropic-claude-sonnet-4',
            name: 'Claude Sonnet 4',
            enabled: true,
          },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        enabled: true,
        models: [
          {
            id: 'openai-dall-e-3',
            name: 'DALL-E 3',
            enabled: true,
          },
        ],
      },
    ]);
  });

  it('projects provider connection metadata', () => {
    const providers = buildAssistantProviderViews(
      createConfig({ providers: [ollamaLocalProvider], models: [localChatModel] }),
    );

    expect(providers[0]).toMatchObject({
      id: 'ollama-local',
      type: 'ollama',
      connectionKind: 'local',
      protocolProfile: 'ollama',
      supportLevel: 'compatible',
      requiresApiKey: false,
    });
  });

  it('projects only configured providers with credentials', () => {
    const providers = buildAssistantConfiguredProviderViews(createConfig());

    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      id: 'anthropic',
      apiKey: 'sk-ant',
      baseUrl: 'https://api.anthropic.com',
    });
  });

  it('treats no-key local providers as configured', () => {
    const providers = buildAssistantConfiguredProviderViews(
      createConfig({ providers: [ollamaLocalProvider], models: [localChatModel] }),
    );

    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      id: 'ollama-local',
      baseUrl: 'http://localhost:11434/api',
      requiresApiKey: false,
    });
  });

  it('builds the webview config state from provider projections', () => {
    const state = buildAssistantConfigState(createConfig());

    expect(state.providers).toHaveLength(2);
    expect(state.configuredProviders).toHaveLength(1);
    expect(state.configuredProviders[0]?.id).toBe('anthropic');
  });

  it('selects configured providers and exposes canonical model IDs', () => {
    expect(selectAssistantDefaultProvider(createConfig())).toEqual({
      id: 'anthropic',
      isConfigured: true,
      defaultModel: 'anthropic-claude-sonnet-4',
      modelIds: ['anthropic-claude-sonnet-4'],
    });
    expect(selectAssistantProvider(createConfig(), 'openai')).toEqual({
      id: 'openai',
      isConfigured: false,
      defaultModel: 'openai-dall-e-3',
      modelIds: ['openai-dall-e-3'],
    });
  });

  it('selects enabled no-key local providers without credentials', () => {
    expect(
      selectAssistantDefaultProvider(
        createConfig({ providers: [ollamaLocalProvider], models: [localChatModel] }),
      ),
    ).toEqual({
      id: 'ollama-local',
      isConfigured: true,
      defaultModel: 'ollama-local-llama3.2',
      modelIds: ['ollama-local-llama3.2'],
    });
  });

  it('marks disabled provider selections as not configured', () => {
    expect(
      selectAssistantProvider(
        createConfig({
          providers: [{ ...anthropicProvider, enabled: false }],
          models: [claudeModel],
        }),
        'anthropic',
      ),
    ).toEqual({
      id: 'anthropic',
      isConfigured: false,
      defaultModel: 'anthropic-claude-sonnet-4',
      modelIds: ['anthropic-claude-sonnet-4'],
    });
  });

  it('excludes disabled models from provider selection model IDs', () => {
    expect(
      selectAssistantProvider(
        createConfig({
          providers: [anthropicProvider],
          models: [{ ...claudeModel, enabled: false }],
        }),
        'anthropic',
      ),
    ).toEqual({
      id: 'anthropic',
      isConfigured: true,
      defaultModel: '',
      modelIds: [],
    });
  });

  it('maps assistant settings to UnifiedConfig scalar keys', () => {
    expect(
      mapAssistantSettingsToUnifiedScalars({
        selectedProviderId: 'anthropic',
        selectedModelId: 'anthropic-claude-sonnet-4',
        customSystemPrompt: 'system',
        autoExecuteTools: false,
        streamResponses: true,
        showToolCalls: false,
        temperature: 0.4,
        maxTokens: 2048,
        executionMode: 'ask',
      }),
    ).toEqual({
      defaultProvider: 'anthropic',
      defaultModel: 'anthropic-claude-sonnet-4',
      customSystemPrompt: 'system',
      autoExecuteTools: false,
      streamResponses: true,
      showToolCalls: false,
      temperature: 0.4,
      maxTokens: 2048,
      executionMode: 'ask',
    });
  });

  it('sanitizes webview settings before writing UnifiedConfig scalars', () => {
    expect(
      mapWebviewSettingsToUnifiedScalars({
        providerId: 'openai',
        modelId: 'openai-gpt-4o',
        systemPrompt: 'system',
        autoExecuteTools: true,
        streamResponses: false,
        showToolCalls: true,
        temperature: 0.5,
        maxTokens: 8192,
        executionMode: 'auto',
        ignored: 'value',
      }),
    ).toEqual({
      defaultProvider: 'openai',
      defaultModel: 'openai-gpt-4o',
      customSystemPrompt: 'system',
      autoExecuteTools: true,
      streamResponses: false,
      showToolCalls: true,
      temperature: 0.5,
      maxTokens: 8192,
      executionMode: 'auto',
    });
  });

  it('normalizes default media model names to chat option IDs', () => {
    const options: ChatModelOption[] = [
      {
        id: 'openai:openai-dall-e-3',
        label: 'OpenAI / DALL-E 3',
        providerId: 'openai',
        modelId: 'openai-dall-e-3',
        category: 'image',
      },
    ];

    expect(
      buildDefaultMediaModelOptionIds({
        defaultMediaModels: { image: 'dall-e-3' },
        chatModelOptions: options,
        models: [imageModel],
      }),
    ).toEqual({ image: 'openai:openai-dall-e-3' });
  });

  it('plans settings cleanup for provider and model mutations', () => {
    expect(
      buildAssistantProviderMutationSettingsUpdate({
        mutation: { type: 'providerRemoved', providerId: 'anthropic' },
        selection: { selectedProviderId: 'anthropic', selectedModelId: 'claude' },
      }),
    ).toEqual({ selectedProviderId: null, selectedModelId: null });

    expect(
      buildAssistantProviderMutationSettingsUpdate({
        mutation: {
          type: 'modelToggled',
          providerId: 'anthropic',
          modelId: 'claude',
          enabled: false,
        },
        selection: { selectedProviderId: 'anthropic', selectedModelId: 'claude' },
      }),
    ).toEqual({ selectedModelId: null });

    expect(
      buildAssistantProviderMutationSettingsUpdate({
        mutation: { type: 'providerToggled', providerId: 'openai', enabled: false },
        selection: { selectedProviderId: 'anthropic', selectedModelId: 'claude' },
      }),
    ).toEqual({});
  });

  it('builds webview settings messages', () => {
    expect(
      buildAssistantSettingsDataMessage({
        providers: [],
        configuredProviders: [],
        selectedProviderId: 'anthropic',
        selectedModelId: 'claude',
        customSystemPrompt: 'system',
        autoExecuteTools: true,
        streamResponses: true,
        showToolCalls: true,
        temperature: 0.7,
        maxTokens: 4096,
        executionMode: 'auto',
        chatModelOptions: [],
        defaultMediaModels: {},
      }),
    ).toEqual({
      type: 'settingsData',
      providers: [],
      configuredProviders: [],
      selectedProviderId: 'anthropic',
      selectedModelId: 'claude',
      customSystemPrompt: 'system',
      systemPrompt: 'system',
      autoExecuteTools: true,
      streamResponses: true,
      showToolCalls: true,
      temperature: 0.7,
      maxTokens: 4096,
      executionMode: 'auto',
      chatModelOptions: [],
      defaultMediaModels: {},
    });

    expect(buildAssistantSettingsUpdatedMessage({ success: true })).toEqual({
      type: 'settingsUpdated',
      success: true,
    });
    expect(
      buildAssistantSettingsUpdatedMessage({
        success: false,
        error: 'Platform is not initialized',
      }),
    ).toEqual({
      type: 'settingsUpdated',
      success: false,
      error: 'Platform is not initialized',
    });

    expect(
      buildAssistantProviderMutationResultMessage({
        type: 'modelAdded',
        success: false,
        modelType: 'openai',
        error: 'Invalid API key',
      }),
    ).toEqual({
      type: 'modelAdded',
      success: false,
      modelType: 'openai',
      error: 'Invalid API key',
    });
  });

  it('builds runtime settings snapshot including agent-only thinking budget', () => {
    expect(
      buildAssistantRuntimeSettingsSnapshot({
        defaultProvider: null,
        defaultModel: null,
      }),
    ).toEqual({
      selectedProviderId: null,
      selectedModelId: null,
      customSystemPrompt: '',
      autoExecuteTools: true,
      streamResponses: true,
      showToolCalls: true,
      temperature: 0.7,
      maxTokens: 8192,
      executionMode: 'ask',
      thinkingBudget: 10000,
    });
  });
});
