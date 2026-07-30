import { describe, expect, it, vi } from 'vitest';
import type { ExternalResearchProvider } from '@neko/shared';
import {
  createExternalResearchCapabilityProvider,
  resolveExternalResearchCapability,
} from '../capability/external-research-capability-provider';

function createProvider(
  overrides: Partial<ExternalResearchProvider> = {},
): ExternalResearchProvider {
  return {
    id: 'mcp:research',
    capabilities: {
      supportsIndexed: true,
      supportsLive: true,
      supportsDomainFilters: true,
    },
    search: vi.fn(async (input) => ({
      query: input.query,
      providerId: 'mcp:research',
      mode: input.mode,
      sources: [
        {
          url: 'https://example.com/source',
          providerId: 'mcp:research',
          mode: input.mode,
          title: 'Source',
        },
      ],
    })),
    fetch: vi.fn(async (input) => ({
      url: input.url,
      providerId: 'mcp:research',
      mode: 'live' as const,
      source: {
        url: input.url,
        providerId: 'mcp:research',
        mode: 'live' as const,
        title: 'Fetched source',
      },
      content: 'Fetched content',
    })),
    ...overrides,
  };
}

function resolver(provider: ExternalResearchProvider | undefined) {
  return { resolve: vi.fn(() => provider) };
}

describe('external research capability provider', () => {
  it('does not register tools when external research is disabled', () => {
    const capability = createExternalResearchCapabilityProvider({
      config: { mode: 'disabled' },
      providers: resolver(createProvider()),
    });

    expect(capability.getTools({ extensionContext: null })).toEqual([]);
  });

  it('registers WebSearch only for indexed mode', () => {
    const capability = createExternalResearchCapabilityProvider({
      config: { mode: 'indexed', providerId: 'mcp:research' },
      providers: resolver(createProvider()),
    });

    expect(capability.getTools({ extensionContext: null }).map((tool) => tool.name)).toEqual([
      'WebSearch',
    ]);
  });

  it('contributes prompt guidance for cited intake without auto-saving to project memory', () => {
    const capability = createExternalResearchCapabilityProvider({
      config: { mode: 'indexed', providerId: 'mcp:research' },
      providers: resolver(createProvider()),
    });
    const fragment = capability.getPromptFragments?.({ extensionContext: null })[0];

    expect(fragment?.id).toBe('external-research:usage-boundary');
    expect(fragment?.content).toContain('cited reference intake');
    expect(fragment?.content).toContain('unless the user explicitly asks');
    expect(fragment?.content).toContain(
      'Do not present external research as a default model knowledge upgrade',
    );
    expect(fragment?.content).not.toMatch(/auto-?save/i);
  });

  it('registers WebSearch and WebFetch for live mode', () => {
    const capability = createExternalResearchCapabilityProvider({
      config: { mode: 'live', providerId: 'mcp:research', requireApprovalForLive: true },
      providers: resolver(createProvider()),
    });
    const tools = capability.getTools({ extensionContext: null });

    expect(tools.map((tool) => tool.name)).toEqual(['WebSearch', 'WebFetch']);
    expect(tools.find((tool) => tool.name === 'WebFetch')?.requiresConfirmation).toBe(true);
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'WebSearch',
          safetyKind: 'read-only-query',
          traits: expect.objectContaining({ locality: 'network' }),
        }),
        expect.objectContaining({
          name: 'WebFetch',
          safetyKind: 'read-only-query',
          traits: expect.objectContaining({ locality: 'network' }),
        }),
      ]),
    );
  });

  it('records missing provider diagnostics and exposes no executable tools', () => {
    const resolved = resolveExternalResearchCapability({
      config: { mode: 'indexed', providerId: 'mcp:missing' },
      providers: resolver(undefined),
    });

    expect(resolved.diagnostics).toEqual([
      expect.objectContaining({
        code: 'external-research.provider-missing',
        severity: 'error',
        mode: 'indexed',
        providerId: 'mcp:missing',
      }),
    ]);
    expect(
      createExternalResearchCapabilityProvider({
        config: { mode: 'indexed', providerId: 'mcp:missing' },
        providers: resolver(undefined),
      }).getTools({ extensionContext: null }),
    ).toEqual([]);
  });

  it('records unsupported provider mode diagnostics and exposes no executable tools', () => {
    const provider = createProvider({
      capabilities: {
        supportsIndexed: true,
        supportsLive: false,
        supportsDomainFilters: true,
      },
    });
    const resolved = resolveExternalResearchCapability({
      config: { mode: 'live', providerId: 'mcp:research' },
      providers: resolver(provider),
    });

    expect(resolved.diagnostics).toEqual([
      expect.objectContaining({
        code: 'external-research.unsupported-mode',
        severity: 'error',
        mode: 'live',
        providerId: 'mcp:research',
      }),
    ]);
    expect(
      createExternalResearchCapabilityProvider({
        config: { mode: 'live', providerId: 'mcp:research' },
        providers: resolver(provider),
      }).getTools({ extensionContext: null }),
    ).toEqual([]);
  });

  it('requires provider-native domain filter support when domain policy is configured', () => {
    const provider = createProvider({
      capabilities: {
        supportsIndexed: true,
        supportsLive: true,
        supportsDomainFilters: false,
      },
    });
    const resolved = resolveExternalResearchCapability({
      config: { mode: 'indexed', providerId: 'mcp:research', allowedDomains: ['example.com'] },
      providers: resolver(provider),
    });

    expect(resolved.diagnostics).toEqual([
      expect.objectContaining({
        code: 'external-research.provider-capability-missing',
        severity: 'error',
        providerId: 'mcp:research',
      }),
    ]);
    expect(
      createExternalResearchCapabilityProvider({
        config: { mode: 'indexed', providerId: 'mcp:research', allowedDomains: ['example.com'] },
        providers: resolver(provider),
      }).getTools({ extensionContext: null }),
    ).toEqual([]);
  });

  it('executes WebSearch through the resolved ExternalResearchProvider', async () => {
    const provider = createProvider();
    const [webSearch] = createExternalResearchCapabilityProvider({
      config: { mode: 'indexed', providerId: 'mcp:research', maxResults: 3 },
      providers: resolver(provider),
    }).getTools({ extensionContext: null });

    await expect(webSearch?.execute({ query: 'costume references' })).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        query: 'costume references',
        providerId: 'mcp:research',
        mode: 'indexed',
      }),
    });
    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'costume references', maxResults: 3 }),
      expect.objectContaining({ aborted: false }),
    );
  });

  it('does not enrich WebSearch with hidden project context when disabled', async () => {
    const provider = createProvider();
    const [webSearch] = createExternalResearchCapabilityProvider({
      config: {
        mode: 'indexed',
        providerId: 'mcp:research',
        allowProjectContextInQuery: false,
      },
      providers: resolver(provider),
    }).getTools({ extensionContext: null });

    await webSearch?.execute(
      { query: 'visible user query' },
      { metadata: { projectContext: 'SECRET_PROJECT_CONTEXT' } },
    );

    expect(provider.search).toHaveBeenCalledWith(
      expect.not.objectContaining({ projectContext: expect.anything() }),
      expect.anything(),
    );
    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'visible user query' }),
      expect.anything(),
    );
  });

  it('returns external research results without invoking persistence side effects', async () => {
    const provider = createProvider();
    const persistResearchNote = vi.fn();
    const writeProjectMemory = vi.fn();
    const [webSearch] = createExternalResearchCapabilityProvider({
      config: { mode: 'indexed', providerId: 'mcp:research' },
      providers: resolver(provider),
    }).getTools({ extensionContext: null });

    await expect(webSearch?.execute({ query: 'session-only references' })).resolves.toEqual({
      success: true,
      data: expect.objectContaining({ sources: expect.any(Array) }),
    });

    expect(persistResearchNote).not.toHaveBeenCalled();
    expect(writeProjectMemory).not.toHaveBeenCalled();
  });

  it('executes WebFetch through the provider with URL safety and domain policy', async () => {
    const provider = createProvider();
    const webFetch = createExternalResearchCapabilityProvider({
      config: {
        mode: 'live',
        providerId: 'mcp:research',
        maxFetchContentTokens: 6000,
        allowedDomains: ['example.com'],
      },
      providers: resolver(provider),
    })
      .getTools({ extensionContext: null })
      .find((tool) => tool.name === 'WebFetch');

    await expect(
      webFetch?.execute({ url: 'https://example.com/source', blockedDomains: ['ads.example.com'] }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        url: 'https://example.com/source',
        providerId: 'mcp:research',
        mode: 'live',
      }),
    });
    expect(provider.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/source',
        maxContentTokens: 6000,
        allowedDomains: ['example.com'],
        blockedDomains: ['ads.example.com'],
      }),
      expect.objectContaining({ aborted: false }),
    );
  });

  it('rejects unsafe WebFetch URLs before provider execution', async () => {
    const provider = createProvider();
    const webFetch = createExternalResearchCapabilityProvider({
      config: { mode: 'live', providerId: 'mcp:research' },
      providers: resolver(provider),
    })
      .getTools({ extensionContext: null })
      .find((tool) => tool.name === 'WebFetch');

    await expect(webFetch?.execute({ url: 'http://127.0.0.1:3000' })).resolves.toEqual({
      success: false,
      error: 'Unsafe URL host is not allowed: 127.0.0.1',
    });
    expect(provider.fetch).not.toHaveBeenCalled();
  });

  it('rejects configured blocked domains before provider execution', async () => {
    const provider = createProvider();
    const webFetch = createExternalResearchCapabilityProvider({
      config: { mode: 'live', providerId: 'mcp:research', blockedDomains: ['blocked.example'] },
      providers: resolver(provider),
    })
      .getTools({ extensionContext: null })
      .find((tool) => tool.name === 'WebFetch');

    await expect(webFetch?.execute({ url: 'https://blocked.example/source' })).resolves.toEqual({
      success: false,
      error: 'URL domain is blocked: blocked.example',
    });
    expect(provider.fetch).not.toHaveBeenCalled();
  });

  it('rejects fetch results whose final URL escapes policy', async () => {
    const provider = createProvider({
      fetch: vi.fn(async () => ({
        url: 'https://example.com/source',
        providerId: 'mcp:research',
        mode: 'live' as const,
        source: {
          url: 'https://example.com/source',
          finalUrl: 'https://blocked.example/source',
          providerId: 'mcp:research',
          mode: 'live' as const,
        },
        content: 'Fetched content',
      })),
    });
    const webFetch = createExternalResearchCapabilityProvider({
      config: { mode: 'live', providerId: 'mcp:research', blockedDomains: ['blocked.example'] },
      providers: resolver(provider),
    })
      .getTools({ extensionContext: null })
      .find((tool) => tool.name === 'WebFetch');

    await expect(webFetch?.execute({ url: 'https://example.com/source' })).resolves.toEqual({
      success: false,
      error: 'URL domain is blocked: blocked.example',
    });
  });
});
