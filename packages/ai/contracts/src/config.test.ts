import { describe, expect, it } from 'vitest';
import {
  MEDIA_MODEL_TYPES,
  MODEL_TYPES,
  PROVIDER_CONNECTION_KINDS,
  PROVIDER_MODEL_FAMILIES,
  PROVIDER_TYPES,
  type ChatModelOption,
  type ModelRefConfig,
  type ProviderConfig,
} from './config';

describe('AI configuration contracts', () => {
  it('keeps provider and model identities explicit', () => {
    const provider: ProviderConfig = {
      id: 'fixture-provider',
      name: 'fixture-provider',
      displayName: 'Fixture Provider',
      type: 'openai',
      apiUrl: 'https://fixture.invalid/api',
      enabled: true,
      connectionKind: 'direct',
      supportedModelFamilies: ['dialogue'],
    };
    const modelRef: ModelRefConfig = {
      providerId: provider.id,
      modelId: 'fixture-model',
    };
    const option: ChatModelOption = {
      id: `${modelRef.providerId}:${modelRef.modelId}`,
      label: 'Fixture Provider / Fixture Model',
      providerId: modelRef.providerId,
      modelId: modelRef.modelId,
      category: 'llm',
    };

    expect(option.id).toBe('fixture-provider:fixture-model');
    expect(PROVIDER_TYPES).toContain(provider.type);
    expect(PROVIDER_CONNECTION_KINDS).toContain(provider.connectionKind);
    expect(PROVIDER_MODEL_FAMILIES).toEqual(['dialogue', 'generation']);
    expect(MODEL_TYPES).toEqual(['llm', 'image', 'video', 'audio']);
    expect(MEDIA_MODEL_TYPES).toEqual(['image', 'video', 'audio']);
  });
});
