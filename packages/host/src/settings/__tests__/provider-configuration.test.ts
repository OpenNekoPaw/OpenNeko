import { describe, expect, it } from 'vitest';
import { isProviderConfigured } from '../provider-configuration';
import type { Provider } from '../types/provider';

describe('Provider configuration', () => {
  it('accepts an explicit endpoint and a canonical DSH catalog route', () => {
    expect(isProviderConfigured(provider({ apiUrl: 'https://example.test/api' }))).toBe(true);
    expect(
      isProviderConfigured(
        provider({ apiUrl: '', protocolProfile: undefined, supportedModelFamilies: ['dialogue'] }),
      ),
    ).toBe(true);
  });

  it('does not infer a DSH catalog route from an incomplete Provider', () => {
    expect(isProviderConfigured(provider({ apiUrl: '', protocolProfile: undefined }))).toBe(false);
    expect(
      isProviderConfigured(
        provider({
          apiUrl: '',
          protocolProfile: 'openai-completions',
          supportedModelFamilies: ['dialogue'],
        }),
      ),
    ).toBe(false);
    expect(
      isProviderConfigured(
        provider({
          apiUrl: '',
          protocolProfile: undefined,
          supportedModelFamilies: ['generation'],
        }),
      ),
    ).toBe(false);
  });
});

function provider(overrides: Partial<Provider>): Provider {
  return {
    id: 'provider-a',
    name: 'provider-a',
    displayName: 'Provider A',
    type: 'generic',
    apiUrl: '',
    enabled: true,
    ...overrides,
  };
}
