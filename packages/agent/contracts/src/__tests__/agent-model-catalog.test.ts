import { describe, expect, it } from 'vitest';
import {
  parseAgentConfigurationRequest,
  parseAgentModelCatalogEntry,
} from '../agent-model-catalog';

describe('Agent model catalog contract', () => {
  it('distinguishes discovered metadata from executable availability', () => {
    expect(
      parseAgentModelCatalogEntry({
        id: 'openai:gpt-5',
        label: 'GPT-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        modelType: 'llm',
        contextWindow: 128_000,
        maximumOutputTokens: 16_384,
        purposeCapabilities: ['agent.main'],
        availability: { status: 'available' },
      }),
    ).toMatchObject({ availability: { status: 'available' }, contextWindow: 128_000 });

    expect(
      parseAgentModelCatalogEntry({
        id: 'provider:incomplete',
        label: 'Incomplete',
        providerId: 'provider',
        modelId: 'incomplete',
        modelType: 'llm',
        contextWindow: null,
        maximumOutputTokens: null,
        purposeCapabilities: [],
        availability: {
          status: 'unavailable',
          diagnostic: {
            code: 'model-metadata-incomplete',
            owner: 'agent-config',
            message: 'Context and output limits are required.',
          },
        },
      }),
    ).toMatchObject({ availability: { status: 'unavailable' } });
  });

  it('requires exact catalog, provider and model identities in a configuration request', () => {
    expect(
      parseAgentConfigurationRequest({
        modelCatalogEntryId: 'openai:gpt-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        executionMode: 'ask',
        temperature: 0.7,
        maximumOutputTokens: 4096,
        thinkingBudget: 1024,
      }),
    ).toMatchObject({ modelCatalogEntryId: 'openai:gpt-5', thinkingBudget: 1024 });
  });

  it('rejects invalid per-field requests without rewriting other fields', () => {
    expect(() =>
      parseAgentConfigurationRequest({
        modelCatalogEntryId: 'openai:gpt-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        executionMode: 'ask',
        temperature: 2.1,
      }),
    ).toThrow('temperature');
  });
});
