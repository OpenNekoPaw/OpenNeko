import { describe, expect, it } from 'vitest';
import {
  createDesktopAiModelSettingsRequest,
  parseDesktopAiModelSettingsResponse,
} from './ai-model-settings-contract';

describe('Desktop AI model settings contract', () => {
  it('accepts a strict supported Provider request', () => {
    expect(
      createDesktopAiModelSettingsRequest({
        requestId: 'request-1',
        operation: 'save-provider',
        provider: {
          id: 'deepseek',
          displayName: 'DeepSeek',
          apiUrl: 'https://api.deepseek.com/v1',
          protocol: 'openai-chat',
          supportedModelFamilies: ['dialogue'],
          enabled: true,
        },
        apiKey: 'transient-secret',
      }),
    ).toMatchObject({ operation: 'save-provider', provider: { id: 'deepseek' } });
  });

  it('rejects a secret-bearing projection', () => {
    expect(() =>
      parseDesktopAiModelSettingsResponse(
        {
          requestId: 'request-2',
          restartRequired: false,
          projection: {
            providers: [
              {
                id: 'deepseek',
                displayName: 'DeepSeek',
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

  it('rejects config-only Provider metadata in a Renderer projection', () => {
    expect(() =>
      parseDesktopAiModelSettingsResponse(
        {
          requestId: 'request-config-metadata',
          restartRequired: false,
          projection: {
            providers: [
              {
                id: 'deepseek',
                displayName: 'DeepSeek',
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
          apiUrl: 'http://localhost:11434/api',
          protocol: 'ollama',
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
});
