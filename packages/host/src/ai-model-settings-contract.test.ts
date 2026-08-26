import { describe, expect, it } from 'vitest';
import {
  createDesktopAiModelSettingsRequest,
  parseDesktopAiModelSettingsResponse,
} from './ai-model-settings-contract';

describe('Desktop AI model settings contract', () => {
  const dialogueCapabilities = {
    status: 'available',
    providers: [],
    protocols: ['openai-completions'],
    diagnostics: [],
  } as const;

  it('accepts a strict supported Provider request', () => {
    expect(
      createDesktopAiModelSettingsRequest({
        requestId: 'request-1',
        operation: 'save-provider',
        provider: {
          id: 'deepseek',
          displayName: 'DeepSeek',
          type: 'generic',
          apiUrl: 'https://api.deepseek.com/v1',
          protocol: 'openai-chat',
          supportedModelFamilies: ['dialogue'],
          enabled: true,
        },
        apiKey: 'transient-secret',
      }),
    ).toMatchObject({ operation: 'save-provider', provider: { id: 'deepseek' } });
  });

  it('accepts a DSH catalog Provider without local protocol or endpoint overrides', () => {
    expect(
      createDesktopAiModelSettingsRequest({
        requestId: 'request-catalog',
        operation: 'save-provider',
        provider: {
          id: 'future-provider',
          displayName: 'Future Provider',
          type: 'generic',
          apiUrl: '',
          supportedModelFamilies: ['dialogue'],
          enabled: true,
        },
      }),
    ).toMatchObject({ provider: { id: 'future-provider', apiUrl: '' } });
  });

  it('carries explicit custom-model capabilities and rejects duplicates', () => {
    const request = {
      requestId: 'request-model-capabilities',
      operation: 'save-model' as const,
      model: {
        existingId: 'gpt-sol',
        providerId: 'nekoapi-chat',
        apiName: 'gpt-5.6-sol',
        displayName: 'GPT 5.6 SOL',
        type: 'llm' as const,
        capabilities: ['chat', 'llm.chat', 'vision', 'function_calling', 'streaming'],
        enabled: true,
      },
    };
    expect(createDesktopAiModelSettingsRequest(request)).toEqual(request);
    expect(() =>
      createDesktopAiModelSettingsRequest({
        ...request,
        model: { ...request.model, capabilities: ['chat', 'chat'] },
      }),
    ).toThrow(/duplicates/u);
  });

  it('rejects a secret-bearing projection', () => {
    expect(() =>
      parseDesktopAiModelSettingsResponse(
        {
          requestId: 'request-2',
          runtimeEffect: 'unchanged',
          projection: {
            dialogueCapabilities,
            generationCapabilities: [],
            providers: [
              {
                id: 'deepseek',
                displayName: 'DeepSeek',
                type: 'generic',
                apiUrl: 'https://api.deepseek.com/v1',
                protocol: 'openai-chat',
                connectionKind: 'direct',
                enabled: true,
                supportedModelFamilies: ['dialogue'],
                credentialStatus: 'configured',
                apiKey: 'must-not-cross',
              },
            ],
            models: [],
            defaults: {},
          },
        },
        'request-2',
      ),
    ).toThrow(/unknown fields/u);
  });

  it('rejects the removed whole-application restart response', () => {
    expect(() =>
      parseDesktopAiModelSettingsResponse(
        {
          requestId: 'request-restart',
          restartRequired: true,
          projection: { dialogueCapabilities, providers: [], models: [], defaults: {} },
        },
        'request-restart',
      ),
    ).toThrow(/unknown fields/u);
  });

  it('rejects config-only Provider metadata in a Renderer projection', () => {
    expect(() =>
      parseDesktopAiModelSettingsResponse(
        {
          requestId: 'request-config-metadata',
          runtimeEffect: 'unchanged',
          projection: {
            dialogueCapabilities,
            generationCapabilities: [],
            providers: [
              {
                id: 'deepseek',
                displayName: 'DeepSeek',
                type: 'generic',
                apiUrl: 'https://api.deepseek.com/v1',
                protocol: 'openai-chat',
                connectionKind: 'direct',
                enabled: true,
                supportedModelFamilies: ['dialogue'],
                credentialStatus: 'configured',
                builtin: true,
              },
            ],
            models: [],
            defaults: {},
          },
        },
        'request-config-metadata',
      ),
    ).toThrow(/unknown fields/u);
  });

  it('accepts local Ollama and exact delete requests', () => {
    expect(
      createDesktopAiModelSettingsRequest({
        requestId: 'request-local',
        operation: 'save-provider',
        provider: {
          id: 'ollama-local',
          displayName: 'Ollama Local',
          type: 'ollama',
          apiUrl: 'http://localhost:11434/api',
          protocol: 'ollama',
          presetId: 'dialogue-ollama',
          supportedModelFamilies: ['dialogue'],
          enabled: true,
        },
      }),
    ).toMatchObject({ operation: 'save-provider', provider: { protocol: 'ollama' } });
    expect(
      createDesktopAiModelSettingsRequest({
        requestId: 'request-delete-model',
        operation: 'delete-model',
        modelId: 'local-model',
      }),
    ).toEqual({
      requestId: 'request-delete-model',
      operation: 'delete-model',
      modelId: 'local-model',
    });
  });

  it('rejects an empty or duplicate Provider family declaration', () => {
    const provider = {
      id: 'invalid-families',
      displayName: 'Invalid families',
      type: 'generic' as const,
      apiUrl: 'https://example.test/v1',
      protocol: 'openai-chat' as const,
      enabled: true,
    };
    expect(() =>
      createDesktopAiModelSettingsRequest({
        requestId: 'request-empty-families',
        operation: 'save-provider',
        provider: { ...provider, supportedModelFamilies: [] },
      }),
    ).toThrow(/non-empty array/u);
    expect(() =>
      createDesktopAiModelSettingsRequest({
        requestId: 'request-duplicate-families',
        operation: 'save-provider',
        provider: { ...provider, supportedModelFamilies: ['dialogue', 'dialogue'] },
      }),
    ).toThrow(/duplicates/u);
  });

  it('accepts native generation Providers without a DSH dialogue protocol', () => {
    expect(
      createDesktopAiModelSettingsRequest({
        requestId: 'request-minimax',
        operation: 'save-provider',
        provider: {
          id: 'minimax-media',
          displayName: 'MiniMax H3',
          type: 'minimax',
          apiUrl: 'https://api.minimaxi.com/v2',
          presetId: 'generation-minimax-h3',
          supportedModelFamilies: ['generation'],
          enabled: true,
        },
      }),
    ).toMatchObject({
      operation: 'save-provider',
      provider: { type: 'minimax', supportedModelFamilies: ['generation'] },
    });
  });
});
