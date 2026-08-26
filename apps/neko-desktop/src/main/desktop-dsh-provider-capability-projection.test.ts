import { describe, expect, it } from 'vitest';
import { projectDesktopDshProviderCapability } from './desktop-dsh-provider-capability-projection';

describe('Desktop DSH Provider capability projection', () => {
  it('preserves DSH authority and derives product form metadata outside the Renderer', () => {
    expect(
      projectDesktopDshProviderCapability({
        providerId: 'openai',
        displayName: 'OpenAI',
        settingsNamespace: 'llm-pi-ai',
        settingsPath: ['providers', 'openai'],
        source: 'catalog',
      }),
    ).toEqual({
      providerId: 'openai',
      displayName: 'OpenAI',
      settingsNamespace: 'llm-pi-ai',
      settingsPath: ['providers', 'openai'],
      source: 'catalog',
      providerType: 'openai',
      defaultApiUrl: '',
      connectionKind: 'direct',
      requiresApiKey: true,
    });
  });

  it('keeps future DSH identities executable without teaching the Renderer a new mapping', () => {
    expect(
      projectDesktopDshProviderCapability({
        providerId: 'future-provider',
        displayName: 'Future Provider',
        settingsNamespace: 'llm-pi-ai',
        settingsPath: ['providers', 'future-provider'],
        source: 'catalog',
      }),
    ).toMatchObject({
      providerId: 'future-provider',
      providerType: 'generic',
      requiresApiKey: true,
    });
  });
});
