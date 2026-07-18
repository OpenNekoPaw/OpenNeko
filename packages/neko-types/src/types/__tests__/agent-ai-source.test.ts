import { describe, expect, it } from 'vitest';
import type { AiProviderSourceResolution, SecretSafeProviderProjection } from '../agent-ai-source';

describe('agent AI source contracts', () => {
  it('keeps explicit provider projections credential-free', () => {
    const provider: SecretSafeProviderProjection = {
      id: 'local-provider',
      name: 'local-provider',
      displayName: 'Local Provider',
      type: 'ollama',
      enabled: true,
      connectionKind: 'local',
      protocolProfile: 'ollama',
      requiresApiKey: false,
      source: 'explicit-config',
    };
    const resolution: AiProviderSourceResolution = {
      source: 'explicit-config',
      providers: [provider],
      models: [],
      selectedProviderId: provider.id,
      selectedModelId: null,
      modelGroups: [],
    };

    expect(resolution.source).toBe('explicit-config');
    expect(JSON.stringify(resolution)).not.toContain('apiKey');
    expect(JSON.stringify(resolution)).not.toContain('authorization');
    expect(JSON.stringify(resolution)).not.toContain('refreshToken');
  });
});
