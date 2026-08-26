import { describe, expect, it } from 'vitest';
import { GENERATION_PROVIDER_CAPABILITIES } from './provider-capabilities';

describe('generation Provider capabilities', () => {
  it('publishes every Provider type owned by the AI SDK or a registered media adapter', () => {
    expect(GENERATION_PROVIDER_CAPABILITIES.map((capability) => capability.providerType)).toEqual([
      'minimax',
      'bytedance',
      'openai',
      'newapi',
      'oneapi',
      'generic',
      'xai',
      'kling',
      'runway',
      'luma',
      'liblib',
      'suno',
      'vidu',
      'midjourney',
      'fal',
      'dashscope',
    ]);
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
