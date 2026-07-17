import { describe, expect, it } from 'vitest';
import { mergeConfigs, normalizeConfig } from './config-normalizer';

describe('config normalizer merge', () => {
  it('merges type default models by key', () => {
    const merged = mergeConfigs(
      {
        defaultModels: {
          llm: { providerId: 'chat-base-provider', modelId: 'chat-base' },
          audio: { providerId: 'audio-base-provider', modelId: 'audio-base' },
        },
      },
      {
        defaultModels: {
          audio: { providerId: 'audio-workspace-provider', modelId: 'audio-workspace' },
          video: { providerId: 'video-workspace-provider', modelId: 'video-workspace' },
        },
      },
    );

    expect(merged.defaultModels).toEqual({
      llm: { providerId: 'chat-base-provider', modelId: 'chat-base' },
      audio: { providerId: 'audio-workspace-provider', modelId: 'audio-workspace' },
      video: { providerId: 'video-workspace-provider', modelId: 'video-workspace' },
    });
  });

  it('merges purpose default models by purpose', () => {
    const merged = mergeConfigs(
      {
        defaultModelPurposes: {
          'video.understand': { providerId: 'google', modelId: 'gemini-flash' },
        },
      },
      {
        defaultModelPurposes: {
          'video.understand': { providerId: 'google', modelId: 'gemini-pro' },
          'llm.judge': { providerId: 'neko-gateway', modelId: 'judge' },
        },
      },
    );

    expect(merged.defaultModelPurposes).toEqual({
      'video.understand': { providerId: 'google', modelId: 'gemini-pro' },
      'llm.judge': { providerId: 'neko-gateway', modelId: 'judge' },
    });
  });

  it('normalizes conservative external research defaults', () => {
    const normalized = normalizeConfig({});

    expect(normalized.externalResearch).toEqual({
      mode: 'disabled',
      requireApprovalForLive: true,
      allowProjectContextInQuery: false,
      maxResults: 5,
      maxFetchContentTokens: 12000,
    });
  });

  it('merges external research MCP bindings by field', () => {
    const merged = mergeConfigs(
      {
        externalResearch: {
          mode: 'indexed',
          providerId: 'mcp:research',
          mcp: {
            serverId: 'research',
            searchTool: {
              name: 'web_search',
              queryArg: 'query',
              outputSchema: 'neko.externalResearch.search.v1',
            },
          },
        },
      },
      {
        externalResearch: {
          mode: 'live',
          mcp: {
            serverId: 'research',
            searchTool: {
              name: 'web_search',
              queryArg: 'q',
              maxResultsArg: 'limit',
              outputSchema: 'neko.externalResearch.search.v1',
            },
            fetchTool: {
              name: 'fetch_url',
              urlArg: 'url',
              outputSchema: 'neko.externalResearch.fetch.v1',
            },
          },
        },
      },
    );

    expect(merged.externalResearch).toEqual({
      mode: 'live',
      providerId: 'mcp:research',
      mcp: {
        serverId: 'research',
        searchTool: {
          name: 'web_search',
          queryArg: 'q',
          maxResultsArg: 'limit',
          outputSchema: 'neko.externalResearch.search.v1',
        },
        fetchTool: {
          name: 'fetch_url',
          urlArg: 'url',
          outputSchema: 'neko.externalResearch.fetch.v1',
        },
      },
    });
  });
});
