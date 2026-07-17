import { describe, expect, it } from 'vitest';
import {
  createUnsupportedExternalResearchModeDiagnostic,
  isExternalResearchConfig,
  isExternalResearchFetchInput,
  isExternalResearchFetchResult,
  isExternalResearchMcpFetchV1,
  isExternalResearchMcpSearchV1,
  isExternalResearchProviderCapabilities,
  isExternalResearchSearchInput,
  isExternalResearchSearchResult,
  isResearchNote,
  isResearchSource,
  normalizeExternalResearchConfig,
} from '../types/external-research';

describe('external research contracts', () => {
  it('normalizes default configuration', () => {
    expect(normalizeExternalResearchConfig(undefined)).toEqual({
      mode: 'disabled',
      requireApprovalForLive: true,
      allowProjectContextInQuery: false,
      maxResults: 5,
      maxFetchContentTokens: 12000,
    });
  });

  it('validates complete external research config', () => {
    expect(
      isExternalResearchConfig({
        mode: 'live',
        providerId: 'mcp:research',
        requireApprovalForLive: true,
        allowProjectContextInQuery: false,
        maxResults: 5,
        maxFetchContentTokens: 12000,
        mcp: {
          serverId: 'research',
          searchTool: {
            name: 'web_search',
            queryArg: 'query',
            outputSchema: 'neko.externalResearch.search.v1',
          },
          fetchTool: {
            name: 'fetch_url',
            urlArg: 'url',
            outputSchema: 'neko.externalResearch.fetch.v1',
          },
        },
      }),
    ).toBe(true);
  });

  it('rejects prose-only MCP search output', () => {
    expect(isExternalResearchMcpSearchV1({ text: 'Here is what I found.' })).toBe(false);
  });

  it('accepts structured MCP search and fetch output', () => {
    expect(
      isExternalResearchMcpSearchV1({
        sources: [{ url: 'https://example.com', title: 'Example' }],
      }),
    ).toBe(true);
    expect(
      isExternalResearchMcpFetchV1({
        url: 'https://example.com',
        content: 'Example content',
      }),
    ).toBe(true);
  });

  it('validates external research tool inputs and rejects disabled tool mode', () => {
    expect(
      isExternalResearchSearchInput({
        query: 'period costume references',
        mode: 'indexed',
        maxResults: 5,
      }),
    ).toBe(true);
    expect(
      isExternalResearchSearchInput({
        query: 'period costume references',
        mode: 'disabled',
        maxResults: 5,
      }),
    ).toBe(false);
    expect(
      isExternalResearchFetchInput({
        url: 'https://example.com/reference',
        mode: 'live',
        maxContentTokens: 12000,
      }),
    ).toBe(true);
    expect(
      isExternalResearchFetchInput({
        url: 'https://example.com/reference',
        mode: 'indexed',
        maxContentTokens: 12000,
      }),
    ).toBe(false);
  });

  it('validates provider outputs and research notes with source provenance', () => {
    const source = {
      url: 'https://example.com/reference',
      providerId: 'mcp:research',
      mode: 'live',
      title: 'Reference',
      snippet: 'Useful source',
      truncated: false,
    };

    expect(isResearchSource(source)).toBe(true);
    expect(
      isExternalResearchSearchResult({
        query: 'reference',
        providerId: 'mcp:research',
        mode: 'live',
        sources: [source],
      }),
    ).toBe(true);
    expect(
      isExternalResearchFetchResult({
        url: 'https://example.com/reference',
        providerId: 'mcp:research',
        mode: 'live',
        source,
        content: 'Fetched text',
      }),
    ).toBe(true);
    expect(
      isResearchNote({
        title: 'Reference notes',
        markdown: '# Reference notes\n\n## Sources\n- https://example.com/reference',
        sources: [source],
        createdAt: '2026-07-10T00:00:00.000Z',
        source: 'external-research',
      }),
    ).toBe(true);
  });

  it('validates provider capability flags and unsupported mode diagnostics', () => {
    expect(
      isExternalResearchProviderCapabilities({
        supportsIndexed: true,
        supportsLive: false,
        supportsDomainFilters: true,
      }),
    ).toBe(true);
    expect(
      createUnsupportedExternalResearchModeDiagnostic({ mode: 'live', providerId: 'mcp:research' }),
    ).toEqual({
      code: 'external-research.unsupported-mode',
      severity: 'error',
      message: 'External research mode "live" is not supported by the resolved provider.',
      mode: 'live',
      providerId: 'mcp:research',
    });
  });
});
