import { describe, expect, it } from 'vitest';
import { GENERATION_PROVIDER_CAPABILITIES } from './provider-capabilities';

describe('generation Provider capabilities', () => {
  it('publishes only Provider types with an AI SDK media model contract', () => {
    expect(GENERATION_PROVIDER_CAPABILITIES.map((capability) => capability.providerType)).toEqual([
      'minimax',
      'bytedance',
      'openai',
      'newapi',
      'oneapi',
      'generic',
    ]);
  });

  it('does not claim video support for the unverified NewAPI-compatible path', () => {
    for (const providerType of ['newapi', 'oneapi', 'generic'] as const) {
      const capability = GENERATION_PROVIDER_CAPABILITIES.find(
        (candidate) => candidate.providerType === providerType,
      );
      expect(capability?.supportedModelTypes).not.toContain('video');
    }
  });

  it('keeps templates inside their owning Provider capability and supported model type', () => {
    for (const capability of GENERATION_PROVIDER_CAPABILITIES) {
      expect(capability.supportedModelTypes).not.toContain('llm');
      for (const template of capability.modelTemplates) {
        expect(template.providerType).toBe(capability.providerType);
        expect(capability.supportedModelTypes).toContain(template.type);
      }
    }
  });
});
