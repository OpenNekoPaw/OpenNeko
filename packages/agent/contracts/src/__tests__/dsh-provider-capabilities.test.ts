import { describe, expect, it } from 'vitest';

import {
  decodeDshAcpProviderCapabilityProjection,
  projectDshAcpProviderCapabilities,
} from '../dsh-acp';

describe('DSH Provider capability projection', () => {
  it('preserves the DSH directory and opaque protocol identities', () => {
    const projection = projectDshAcpProviderCapabilities(
      [
        {
          provider: 'openai',
          displayName: 'OpenAI',
          settingsNs: 'llm-pi-ai',
          settingsPath: ['providers', 'openai'],
          declared: false,
        },
      ],
      ['openai-completions', 'future-wire-protocol'],
    );

    expect(decodeDshAcpProviderCapabilityProjection({ ...projection })).toEqual({
      providers: [
        {
          providerId: 'openai',
          displayName: 'OpenAI',
          settingsNamespace: 'llm-pi-ai',
          settingsPath: ['providers', 'openai'],
          source: 'catalog',
        },
      ],
      protocols: ['openai-completions', 'future-wire-protocol'],
      diagnostics: [],
    });
  });

  it('isolates invalid entries without dropping valid siblings', () => {
    expect(
      projectDshAcpProviderCapabilities(
        [
          {
            provider: '',
            displayName: 'Invalid',
            settingsNs: 'llm-pi-ai',
            settingsPath: ['providers', 'invalid'],
          },
          {
            provider: 'anthropic',
            displayName: 'Anthropic',
            settingsNs: 'llm-pi-ai',
            settingsPath: ['providers', 'anthropic'],
          },
        ],
        ['', 'anthropic-messages'],
      ),
    ).toMatchObject({
      providers: [{ providerId: 'anthropic' }],
      protocols: ['anthropic-messages'],
      diagnostics: [
        { code: 'invalid-provider', index: 0 },
        { code: 'invalid-protocol', index: 0 },
      ],
    });
  });
});
