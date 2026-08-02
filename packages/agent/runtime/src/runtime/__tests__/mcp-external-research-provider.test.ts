import { describe, expect, it, vi } from 'vitest';
import { createMcpExternalResearchProvider } from '../capability/mcp-external-research-provider';

const searchEnvelope = JSON.stringify({
  schema: 'neko.externalResearch.search.v1',
  result: {
    sources: [
      {
        url: 'https://example.com/source',
        title: 'Source',
        snippet: 'Snippet',
        publishedAt: '2026-01-01',
      },
    ],
  },
});

const fetchEnvelope = JSON.stringify({
  schema: 'neko.externalResearch.fetch.v1',
  result: {
    url: 'https://example.com/source',
    finalUrl: 'https://example.com/source',
    title: 'Source',
    content: 'Fetched content',
    contentType: 'text/html',
    truncated: false,
  },
});

function createConfig() {
  return {
    serverId: 'research',
    searchTool: {
      name: 'web_search',
      queryArg: 'q',
      maxResultsArg: 'limit',
      allowedDomainsArg: 'allowed',
      blockedDomainsArg: 'blocked',
      outputSchema: 'neko.externalResearch.search.v1' as const,
    },
    fetchTool: {
      name: 'fetch_url',
      urlArg: 'target',
      maxContentTokensArg: 'max_tokens',
      outputSchema: 'neko.externalResearch.fetch.v1' as const,
    },
  };
}

describe('createMcpExternalResearchProvider', () => {
  it('maps search input to explicit MCP tool arguments and normalizes sources', async () => {
    const callTool = vi.fn(async () => ({ success: true, data: searchEnvelope }));
    const provider = createMcpExternalResearchProvider({
      config: createConfig(),
      mcpManager: { callTool },
    });

    await expect(
      provider.search(
        {
          query: 'period rooms',
          mode: 'indexed',
          maxResults: 3,
          allowedDomains: ['example.com'],
          blockedDomains: ['blocked.example'],
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      query: 'period rooms',
      providerId: 'mcp:research',
      mode: 'indexed',
      sources: [
        {
          url: 'https://example.com/source',
          providerId: 'mcp:research',
          mode: 'indexed',
          title: 'Source',
          snippet: 'Snippet',
          publishedAt: '2026-01-01',
        },
      ],
    });
    expect(callTool).toHaveBeenCalledWith('research', 'web_search', {
      q: 'period rooms',
      limit: 3,
      allowed: ['example.com'],
      blocked: ['blocked.example'],
    });
  });

  it('maps fetch input to explicit MCP tool arguments and normalizes fetched content', async () => {
    const callTool = vi.fn(async () => ({ success: true, data: fetchEnvelope }));
    const provider = createMcpExternalResearchProvider({
      config: createConfig(),
      mcpManager: { callTool },
    });

    await expect(
      provider.fetch(
        { url: 'https://example.com/source', mode: 'live', maxContentTokens: 12000 },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      url: 'https://example.com/source',
      providerId: 'mcp:research',
      mode: 'live',
      source: expect.objectContaining({
        url: 'https://example.com/source',
        providerId: 'mcp:research',
        mode: 'live',
        finalUrl: 'https://example.com/source',
      }),
      content: 'Fetched content',
    });
    expect(callTool).toHaveBeenCalledWith('research', 'fetch_url', {
      target: 'https://example.com/source',
      max_tokens: 12000,
    });
  });

  it('fails visibly for prose-only MCP output', async () => {
    const provider = createMcpExternalResearchProvider({
      config: createConfig(),
      mcpManager: { callTool: vi.fn(async () => ({ success: true, data: 'Here is a summary.' })) },
    });

    await expect(
      provider.search({ query: 'x', mode: 'indexed', maxResults: 1 }, new AbortController().signal),
    ).rejects.toThrow('MCP external research output must be structured JSON, not prose.');
  });

  it('fails visibly when schema envelope is missing or wrong', async () => {
    const provider = createMcpExternalResearchProvider({
      config: createConfig(),
      mcpManager: {
        callTool: vi.fn(async () => ({
          success: true,
          data: JSON.stringify({ result: { sources: [] } }),
        })),
      },
    });

    await expect(
      provider.search({ query: 'x', mode: 'indexed', maxResults: 1 }, new AbortController().signal),
    ).rejects.toThrow(
      'MCP external research output must be a neko.externalResearch.search.v1 object.',
    );
  });

  it('fails visibly when structured search output omits source citations', async () => {
    const provider = createMcpExternalResearchProvider({
      config: createConfig(),
      mcpManager: {
        callTool: vi.fn(async () => ({
          success: true,
          data: JSON.stringify({
            schema: 'neko.externalResearch.search.v1',
            result: { sources: [{ title: 'Missing URL' }] },
          }),
        })),
      },
    });

    await expect(
      provider.search({ query: 'x', mode: 'indexed', maxResults: 1 }, new AbortController().signal),
    ).rejects.toThrow('MCP external research search returned invalid structured output.');
  });
});
