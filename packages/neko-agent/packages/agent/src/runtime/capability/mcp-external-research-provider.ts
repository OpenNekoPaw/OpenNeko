import {
  EXTERNAL_RESEARCH_FETCH_SCHEMA_V1,
  EXTERNAL_RESEARCH_SEARCH_SCHEMA_V1,
  isExternalResearchMcpFetchV1,
  isExternalResearchMcpProviderConfig,
  isExternalResearchMcpSearchV1,
  type ExternalResearchFetchInput,
  type ExternalResearchFetchResult,
  type ExternalResearchMcpFetchV1,
  type ExternalResearchMcpProviderConfig,
  type ExternalResearchMcpSearchV1,
  type ExternalResearchProvider,
  type ExternalResearchSearchInput,
  type ExternalResearchSearchResult,
  type ResearchSource,
} from '@neko/shared';
import type { MCPToolCallManager } from '../../mcp/mcp-tool';

export interface CreateMcpExternalResearchProviderOptions {
  readonly id?: string;
  readonly config: ExternalResearchMcpProviderConfig;
  readonly mcpManager: MCPToolCallManager;
}

export function createMcpExternalResearchProvider(
  options: CreateMcpExternalResearchProviderOptions,
): ExternalResearchProvider {
  if (!isExternalResearchMcpProviderConfig(options.config)) {
    throw new Error('Invalid MCP external research provider config.');
  }
  const providerId = options.id ?? `mcp:${options.config.serverId}`;

  return {
    id: providerId,
    capabilities: {
      supportsIndexed: true,
      supportsLive: options.config.fetchTool !== undefined,
      supportsDomainFilters: hasDomainFilterMappings(options.config),
    },
    async search(input: ExternalResearchSearchInput, signal: AbortSignal) {
      throwIfAborted(signal);
      const raw = await options.mcpManager.callTool(
        options.config.serverId,
        options.config.searchTool.name,
        createSearchArgs(options.config, input),
      );
      if (!raw.success) {
        throw new Error(raw.error ?? 'MCP external research search failed.');
      }
      const parsed = parseStructuredMcpOutput(raw.data, EXTERNAL_RESEARCH_SEARCH_SCHEMA_V1);
      if (!isExternalResearchMcpSearchV1(parsed)) {
        throw new Error('MCP external research search returned invalid structured output.');
      }
      return normalizeSearchResult(providerId, input, parsed);
    },
    async fetch(input: ExternalResearchFetchInput, signal: AbortSignal) {
      throwIfAborted(signal);
      const fetchTool = options.config.fetchTool;
      if (!fetchTool) {
        throw new Error('MCP external research provider does not support fetch.');
      }
      const raw = await options.mcpManager.callTool(
        options.config.serverId,
        fetchTool.name,
        createFetchArgs(options.config, input),
      );
      if (!raw.success) {
        throw new Error(raw.error ?? 'MCP external research fetch failed.');
      }
      const parsed = parseStructuredMcpOutput(raw.data, EXTERNAL_RESEARCH_FETCH_SCHEMA_V1);
      if (!isExternalResearchMcpFetchV1(parsed)) {
        throw new Error('MCP external research fetch returned invalid structured output.');
      }
      return normalizeFetchResult(providerId, input, parsed);
    },
  };
}

function createSearchArgs(
  config: ExternalResearchMcpProviderConfig,
  input: ExternalResearchSearchInput,
): Record<string, unknown> {
  return removeUndefined({
    [config.searchTool.queryArg]: input.query,
    ...(config.searchTool.maxResultsArg
      ? { [config.searchTool.maxResultsArg]: input.maxResults }
      : {}),
    ...(config.searchTool.allowedDomainsArg
      ? { [config.searchTool.allowedDomainsArg]: input.allowedDomains }
      : {}),
    ...(config.searchTool.blockedDomainsArg
      ? { [config.searchTool.blockedDomainsArg]: input.blockedDomains }
      : {}),
  });
}

function createFetchArgs(
  config: ExternalResearchMcpProviderConfig,
  input: ExternalResearchFetchInput,
): Record<string, unknown> {
  const fetchTool = config.fetchTool;
  if (!fetchTool) return {};
  return removeUndefined({
    [fetchTool.urlArg]: input.url,
    ...(fetchTool.maxContentTokensArg
      ? { [fetchTool.maxContentTokensArg]: input.maxContentTokens }
      : {}),
    ...(fetchTool.allowedDomainsArg ? { [fetchTool.allowedDomainsArg]: input.allowedDomains } : {}),
    ...(fetchTool.blockedDomainsArg ? { [fetchTool.blockedDomainsArg]: input.blockedDomains } : {}),
  });
}

function parseStructuredMcpOutput(data: unknown, schema: string): unknown {
  const value = typeof data === 'string' ? parseJsonObject(data) : data;
  if (!isRecord(value) || value['schema'] !== schema) {
    throw new Error(`MCP external research output must be a ${schema} object.`);
  }
  return value['result'];
}

function parseJsonObject(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new Error('MCP external research output must be structured JSON, not prose.');
  }
}

function normalizeSearchResult(
  providerId: string,
  input: ExternalResearchSearchInput,
  output: ExternalResearchMcpSearchV1,
): ExternalResearchSearchResult {
  return {
    query: input.query,
    providerId,
    mode: input.mode,
    sources: output.sources.map((source) => ({
      url: source.url,
      providerId,
      mode: input.mode,
      ...(source.title !== undefined ? { title: source.title } : {}),
      ...(source.snippet !== undefined ? { snippet: source.snippet } : {}),
      ...(source.publishedAt !== undefined ? { publishedAt: source.publishedAt } : {}),
    })),
  };
}

function normalizeFetchResult(
  providerId: string,
  input: ExternalResearchFetchInput,
  output: ExternalResearchMcpFetchV1,
): ExternalResearchFetchResult {
  const source: ResearchSource = {
    url: output.url,
    providerId,
    mode: 'live',
    ...(output.finalUrl !== undefined ? { finalUrl: output.finalUrl } : {}),
    ...(output.title !== undefined ? { title: output.title } : {}),
    ...(output.contentType !== undefined ? { contentType: output.contentType } : {}),
    ...(output.fetchedAt !== undefined ? { fetchedAt: output.fetchedAt } : {}),
    ...(output.truncated !== undefined ? { truncated: output.truncated } : {}),
  };
  return {
    url: input.url,
    providerId,
    mode: 'live',
    source,
    content: output.content,
  };
}

function hasDomainFilterMappings(config: ExternalResearchMcpProviderConfig): boolean {
  return (
    Boolean(config.searchTool.allowedDomainsArg || config.searchTool.blockedDomainsArg) &&
    (config.fetchTool === undefined ||
      Boolean(config.fetchTool.allowedDomainsArg || config.fetchTool.blockedDomainsArg))
  );
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('External research request aborted.');
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
