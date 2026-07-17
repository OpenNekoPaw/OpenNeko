import { describe, expect, it } from 'vitest';
import type { Model, Provider } from '../../types/provider';
import { ChatModelService } from '../chat-model-service';

const provider: Provider = {
  id: 'anthropic',
  name: 'anthropic',
  displayName: 'Anthropic',
  type: 'anthropic',
  apiUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant',
  enabled: true,
};

const model: Model = {
  id: 'claude-sonnet-4',
  name: 'claude-sonnet-4-20250514',
  displayName: 'Claude Sonnet 4',
  providerId: 'anthropic',
  type: 'llm',
  enabled: true,
  capabilities: ['chat'],
  contextWindow: 200000,
  maxOutputTokens: 64000,
};

describe('ChatModelService', () => {
  it('exposes model context windows to the webview model options', () => {
    const service = new ChatModelService();

    expect(service.getChatModelOptions([provider], [model])).toContainEqual({
      id: 'anthropic:claude-sonnet-4',
      label: 'Anthropic / Claude Sonnet 4',
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4',
      providerLabel: 'Anthropic',
      source: 'explicit-config',
      capabilities: ['chat'],
      category: 'llm',
      contextWindow: 200000,
      maxOutputTokens: 64000,
      llmParameterControls: {
        reasoning: false,
        verbosity: false,
        creativity: true,
        maxOutputTokens: true,
      },
    });
  });

  it('includes no-key local text-only chat models', () => {
    const service = new ChatModelService();
    const localProvider: Provider = {
      id: 'ollama-local',
      name: 'ollama',
      displayName: 'Ollama Local',
      type: 'ollama',
      apiUrl: 'http://localhost:11434/api',
      enabled: true,
      requiresApiKey: false,
      connectionKind: 'local',
      protocolProfile: 'ollama',
    };
    const localModel: Model = {
      id: 'ollama-local-llama3.2',
      name: 'llama3.2',
      displayName: 'Llama 3.2',
      providerId: 'ollama-local',
      type: 'llm',
      enabled: true,
      capabilities: ['chat'],
    };

    expect(service.getChatModelOptions([localProvider], [localModel])).toContainEqual({
      id: 'ollama-local:ollama-local-llama3.2',
      label: 'Ollama Local / Llama 3.2',
      providerId: 'ollama-local',
      modelId: 'ollama-local-llama3.2',
      providerLabel: 'Ollama Local',
      source: 'explicit-config',
      connectionKind: 'local',
      protocolProfile: 'ollama',
      capabilities: ['chat'],
      category: 'llm',
      llmParameterControls: {
        reasoning: false,
        verbosity: false,
        creativity: true,
        maxOutputTokens: true,
      },
    });
  });

  it('keeps missing token metadata unknown in selector options', () => {
    const service = new ChatModelService();
    const [option] = service.getChatModelOptions(
      [provider],
      [
        {
          ...model,
          contextWindow: undefined,
          maxOutputTokens: undefined,
        },
      ],
    );

    expect(option?.contextWindow).toBeUndefined();
    expect(option?.maxOutputTokens).toBeUndefined();
  });

  it('does not project invalid token metadata into selector options', () => {
    const service = new ChatModelService();
    const [option] = service.getChatModelOptions(
      [provider],
      [
        {
          ...model,
          contextWindow: -1,
          maxOutputTokens: 0,
        },
      ],
    );

    expect(option?.contextWindow).toBeUndefined();
    expect(option?.maxOutputTokens).toBeUndefined();
  });

  it('projects effective model protocol profiles into selector options', () => {
    const service = new ChatModelService();
    const gatewayProvider: Provider = {
      id: 'mixed-gateway',
      name: 'mixed-gateway',
      displayName: 'Mixed Gateway',
      type: 'newapi',
      apiUrl: 'https://gateway.example.com/v1',
      apiKey: 'sk-gateway',
      enabled: true,
      connectionKind: 'gateway',
      protocolProfile: 'newapi',
      supportsBeta: false,
    };
    const gatewayModel: Model = {
      id: 'claude-via-gateway',
      name: 'claude-sonnet',
      displayName: 'Claude via Gateway',
      providerId: 'mixed-gateway',
      type: 'llm',
      enabled: true,
      protocolProfile: 'anthropic',
      capabilities: ['chat', 'thinking'],
    };

    expect(service.getChatModelOptions([gatewayProvider], [gatewayModel])).toContainEqual(
      expect.objectContaining({
        id: 'mixed-gateway:claude-via-gateway',
        protocolProfile: 'anthropic',
        llmParameterControls: {
          reasoning: false,
          verbosity: false,
          creativity: true,
          maxOutputTokens: true,
        },
      }),
    );
  });

  it('projects provider expression profile ids into selector options', () => {
    const service = new ChatModelService();

    expect(
      service.getChatModelOptions(
        [provider],
        [
          {
            ...model,
            providerExpressionProfileId: 'provider-expression:anthropic:claude-sonnet-4',
          },
        ],
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: 'anthropic:claude-sonnet-4',
        providerExpressionProfileId: 'provider-expression:anthropic:claude-sonnet-4',
      }),
    );
  });

  it('keeps generic OpenAI-chat models conservative for provider-specific controls', () => {
    const service = new ChatModelService();
    const deepseekProvider: Provider = {
      id: 'deepseek-direct',
      name: 'deepseek',
      displayName: 'DeepSeek',
      type: 'generic',
      apiUrl: 'https://api.deepseek.com',
      apiKey: 'sk-deepseek',
      enabled: true,
      connectionKind: 'direct',
      protocolProfile: 'openai-chat',
    };
    const deepseekModel: Model = {
      id: 'deepseek-chat',
      name: 'deepseek-chat',
      providerId: 'deepseek-direct',
      type: 'llm',
      enabled: true,
      capabilities: ['chat', 'reasoning', 'verbosity'],
    };

    expect(service.getChatModelOptions([deepseekProvider], [deepseekModel])).toContainEqual(
      expect.objectContaining({
        id: 'deepseek-direct:deepseek-chat',
        protocolProfile: 'openai-chat',
        llmParameterControls: {
          reasoning: false,
          verbosity: false,
          creativity: false,
          maxOutputTokens: true,
        },
      }),
    );
  });

  it('does not include remote providers missing an endpoint even with an API key', () => {
    const service = new ChatModelService();

    expect(
      service
        .getChatModelOptions([{ ...provider, apiUrl: '' }], [model])
        .map((option) => option.id),
    ).toEqual([]);
  });

  it('keeps a real provider-owned auto model selectable', () => {
    const service = new ChatModelService();

    expect(
      service.getChatModelOptions([provider], [{ ...model, id: 'auto', name: 'auto' }]),
    ).toContainEqual(
      expect.objectContaining({
        id: 'anthropic:auto',
        providerId: 'anthropic',
        modelId: 'auto',
      }),
    );
  });
});
