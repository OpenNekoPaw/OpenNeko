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
                builtin: false,
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
});
