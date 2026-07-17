import { describe, expect, it } from 'vitest';
import type { AgentLlmConfig } from '@neko-agent/types';
import type { Model, Provider } from '../../types/provider';
import {
  projectAgentPresetIntent,
  projectLlmModelCapabilities,
  projectLlmParameters,
  resolveLlmProviderFamily,
} from '../llm-parameter-projection';

const baseProvider: Provider = {
  id: 'provider',
  name: 'provider',
  displayName: 'Provider',
  type: 'newapi',
  apiUrl: 'https://api.example.test',
  enabled: true,
};

function createModel(input: Partial<Model> = {}): Model {
  return {
    id: 'model',
    name: 'model',
    providerId: baseProvider.id,
    type: 'llm',
    capabilities: ['chat'],
    enabled: true,
    ...input,
  };
}

function createProvider(input: Partial<Provider> = {}): Provider {
  return {
    ...baseProvider,
    ...input,
  };
}

describe('llm-parameter-projection', () => {
  it('projects LLM control availability from model and provider capabilities', () => {
    const model = createModel({
      capabilities: [
        'chat',
        'function_calling',
        'vision',
        'reasoning',
        'verbosity',
        'service_tier.fast',
      ],
    });

    const capabilities = projectLlmModelCapabilities({
      model,
      provider: createProvider({ type: 'openai', protocolProfile: 'openai-responses' }),
    });

    expect(capabilities.supportsTools).toBe(true);
    expect(capabilities.supportsVision).toBe(true);
    expect(capabilities.supportsReasoningEffort).toBe(true);
    expect(capabilities.reasoningEffortValues).toContain('medium');
    expect(capabilities.reasoningEffortValues).toContain('none');
    expect(capabilities.reasoningEffortValues).toContain('xhigh');
    expect(capabilities.supportsVerbosity).toBe(true);
    expect(capabilities.supportsFastTier).toBe(true);
  });

  it('keeps custom provider defaults conservative for advanced controls', () => {
    const capabilities = projectLlmModelCapabilities({
      model: createModel({ capabilities: ['chat'] }),
      provider: createProvider({
        type: 'newapi',
        protocolProfile: 'newapi',
        supportLevel: 'custom',
      }),
    });

    expect(capabilities.supportsTemperature).toBe(true);
    expect(capabilities.supportsTopP).toBe(true);
    expect(capabilities.supportsReasoningEffort).toBe(false);
    expect(capabilities.supportsThinkingBudget).toBe(false);
    expect(capabilities.supportsVerbosity).toBe(false);
    expect(capabilities.supportsFastTier).toBe(false);
  });

  it('allows explicit provider/model metadata to enable advanced custom controls', () => {
    const capabilities = projectLlmModelCapabilities({
      model: createModel({
        options: {
          llmCapabilities: {
            reasoningEffortValues: ['low', 'medium'],
            verbosity: true,
            fastTier: true,
          },
        },
      }),
      provider: createProvider({ type: 'newapi', supportLevel: 'custom' }),
    });

    expect(capabilities.supportsReasoningEffort).toBe(true);
    expect(capabilities.reasoningEffortValues).toEqual(['low', 'medium']);
    expect(capabilities.supportsVerbosity).toBe(true);
    expect(capabilities.supportsFastTier).toBe(true);
  });

  it('maps Agent presets to normalized request intent', () => {
    expect(
      projectAgentPresetIntent({
        reasoningPreset: 'deep',
        verbosityPreset: 'brief',
        creativityPreset: 'stable',
      }),
    ).toEqual({
      reasoningEffort: 'high',
      thinkingBudget: 12000,
      verbosity: 'low',
      temperature: 0.2,
      topP: 0.8,
    });
  });

  it('lets advanced values override preset intent', () => {
    const config: AgentLlmConfig = {
      reasoningPreset: 'balanced',
      verbosityPreset: 'standard',
      creativityPreset: 'creative',
      advanced: {
        reasoningEffort: 'low',
        thinkingBudget: 2048,
        verbosity: 'high',
        temperature: 0.4,
        topP: 0.6,
      },
    };

    expect(projectAgentPresetIntent(config)).toEqual({
      reasoningEffort: 'low',
      thinkingBudget: 2048,
      verbosity: 'high',
      temperature: 0.4,
      topP: 0.6,
    });
  });

  it('maps OpenAI-compatible reasoning and verbosity into provider options when supported', () => {
    const projection = projectLlmParameters({
      model: createModel({
        capabilities: ['chat', 'reasoning', 'verbosity', 'service_tier.fast'],
      }),
      provider: createProvider({ type: 'openai', protocolProfile: 'openai-responses' }),
      llmConfig: {
        reasoningPreset: 'fast',
        verbosityPreset: 'detailed',
        creativityPreset: 'creative',
      },
    });

    expect(projection.providerFamily).toBe('openai');
    expect(projection.chatOptions).toEqual({});
    expect(projection.providerOptions).toEqual({
      openai: {
        reasoningEffort: 'low',
        textVerbosity: 'high',
        serviceTier: 'priority',
      },
    });
    expect(projection.diagnostics).toEqual([]);
  });

  it('keeps sampling controls for models that explicitly support reasoning and sampling together', () => {
    const projection = projectLlmParameters({
      model: createModel({
        capabilities: ['chat', 'reasoning', 'verbosity', 'temperature', 'top_p'],
      }),
      provider: createProvider({ type: 'openai', protocolProfile: 'openai-responses' }),
      llmConfig: {
        reasoningPreset: 'balanced',
        verbosityPreset: 'standard',
        creativityPreset: 'creative',
      },
    });

    expect(projection.chatOptions).toEqual({
      temperature: 0.7,
      topP: 0.95,
    });
    expect(projection.providerOptions).toEqual({
      openai: {
        reasoningEffort: 'medium',
        textVerbosity: 'medium',
      },
    });
    expect(projection.diagnostics).toEqual([]);
  });

  it('returns diagnostics instead of dropping unsupported OpenAI parameters', () => {
    const projection = projectLlmParameters({
      model: createModel({ capabilities: ['chat'] }),
      provider: createProvider({ type: 'openai', protocolProfile: 'openai-responses' }),
      llmConfig: {
        reasoningPreset: 'deep',
        verbosityPreset: 'detailed',
      },
    });

    expect(projection.providerOptions).toEqual({});
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-reasoning-effort',
      'unsupported-verbosity',
    ]);
  });

  it('diagnoses explicit thinking budget on OpenAI-compatible models that cannot send it', () => {
    const projection = projectLlmParameters({
      model: createModel({ capabilities: ['chat'] }),
      provider: createProvider({ type: 'openai', protocolProfile: 'openai-responses' }),
      llmConfig: {
        advanced: {
          thinkingBudget: 2048,
        },
      },
    });

    expect(projection.chatOptions).toEqual({});
    expect(projection.providerOptions).toEqual({});
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-thinking-budget',
    ]);
  });

  it('maps Anthropic thinking budget and rejects sampling combinations while thinking is enabled', () => {
    const projection = projectLlmParameters({
      model: createModel({ capabilities: ['chat', 'thinking'] }),
      provider: createProvider({ type: 'anthropic', protocolProfile: 'anthropic' }),
      llmConfig: {
        reasoningPreset: 'balanced',
        creativityPreset: 'creative',
      },
    });

    expect(projection.providerFamily).toBe('anthropic');
    expect(projection.chatOptions.thinkingBudget).toBe(4096);
    expect(projection.providerOptions).toEqual({
      anthropic: {
        thinking: {
          type: 'enabled',
          budgetTokens: 4096,
        },
      },
    });
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-anthropic-thinking-sampling-combination',
    ]);
  });

  it('uses model protocol profile overrides for multiplex gateway parameter projection', () => {
    const projection = projectLlmParameters({
      model: createModel({
        protocolProfile: 'anthropic',
        capabilities: ['chat', 'thinking'],
      }),
      provider: createProvider({
        type: 'newapi',
        protocolProfile: 'newapi',
        connectionKind: 'gateway',
        supportsBeta: false,
      }),
      llmConfig: {
        reasoningPreset: 'balanced',
      },
    });

    expect(projection.providerFamily).toBe('anthropic');
    expect(projection.providerOptions).toEqual({});
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-thinking-budget',
    ]);
  });

  it('maps Anthropic effort-only models without sending preset thinking budget', () => {
    const projection = projectLlmParameters({
      model: createModel({
        capabilities: ['chat', 'reasoning'],
        options: {
          llmCapabilities: {
            reasoningEffortValues: ['low', 'medium', 'high'],
            thinkingBudget: false,
          },
        },
      }),
      provider: createProvider({ type: 'anthropic', protocolProfile: 'anthropic' }),
      llmConfig: {
        reasoningPreset: 'balanced',
      },
    });

    expect(projection.chatOptions.thinkingBudget).toBeUndefined();
    expect(projection.providerOptions).toEqual({
      anthropic: {
        effort: 'medium',
      },
    });
    expect(projection.diagnostics).toEqual([]);
  });

  it('diagnoses Anthropic thinking when beta support is disabled', () => {
    const projection = projectLlmParameters({
      model: createModel({ capabilities: ['chat', 'thinking'] }),
      provider: createProvider({
        type: 'anthropic',
        protocolProfile: 'anthropic',
        supportsBeta: false,
      }),
      llmConfig: {
        reasoningPreset: 'balanced',
      },
    });

    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-thinking-budget',
    ]);
    expect(projection.providerOptions).toEqual({});
  });

  it('keeps generic OpenAI-compatible providers to common sampling unless capabilities declare more', () => {
    const projection = projectLlmParameters({
      model: createModel({ capabilities: ['chat'] }),
      provider: createProvider({
        type: 'newapi',
        protocolProfile: 'newapi',
        supportLevel: 'custom',
      }),
      llmConfig: {
        creativityPreset: 'wild',
        reasoningPreset: 'deep',
        verbosityPreset: 'detailed',
      },
    });

    expect(projection.providerFamily).toBe('generic-openai');
    expect(projection.chatOptions).toEqual({ temperature: 1, topP: 1 });
    expect(projection.providerOptions).toEqual({});
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-reasoning-effort',
      'unsupported-verbosity',
    ]);
  });

  it('keeps generic openai-chat providers out of official OpenAI-only parameter projection', () => {
    const projection = projectLlmParameters({
      model: createModel({
        protocolProfile: 'openai-chat',
        capabilities: ['chat', 'reasoning', 'verbosity'],
      }),
      provider: createProvider({
        type: 'generic',
        protocolProfile: 'openai-chat',
        connectionKind: 'direct',
      }),
      llmConfig: {
        reasoningPreset: 'fast',
        verbosityPreset: 'detailed',
      },
    });

    expect(projection.providerFamily).toBe('generic-openai');
    expect(projection.providerOptions).toEqual({});
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-reasoning-effort',
      'unsupported-verbosity',
      'unsupported-service-tier',
    ]);
  });

  it('keeps local Ollama mapping to safe sampling and token options', () => {
    const projection = projectLlmParameters({
      model: createModel({ providerId: 'ollama', capabilities: ['chat'] }),
      provider: createProvider({
        id: 'ollama',
        type: 'ollama',
        protocolProfile: 'ollama',
        connectionKind: 'local',
      }),
      llmConfig: {
        creativityPreset: 'stable',
        reasoningPreset: 'fast',
      },
    });

    expect(projection.providerFamily).toBe('local-ollama');
    expect(projection.chatOptions).toEqual({ temperature: 0.2, topP: 0.8 });
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-reasoning-effort',
      'unsupported-service-tier',
    ]);
  });

  it('resolves provider family from provider profile', () => {
    expect(resolveLlmProviderFamily(createProvider({ type: 'openai' }))).toBe('openai');
    expect(resolveLlmProviderFamily(createProvider({ type: 'anthropic' }))).toBe('anthropic');
    expect(resolveLlmProviderFamily(createProvider({ type: 'ollama' }))).toBe('local-ollama');
    expect(resolveLlmProviderFamily(createProvider({ type: 'newapi' }))).toBe('generic-openai');
  });
});
