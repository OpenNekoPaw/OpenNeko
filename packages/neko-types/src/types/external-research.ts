// =============================================================================
// Agent External Research Contracts
// =============================================================================

export const EXTERNAL_RESEARCH_MODES = ['disabled', 'indexed', 'live'] as const;

export type ExternalResearchMode = (typeof EXTERNAL_RESEARCH_MODES)[number];

export const EXTERNAL_RESEARCH_PROVIDER_KINDS = ['mcp'] as const;

export type ExternalResearchProviderKind = (typeof EXTERNAL_RESEARCH_PROVIDER_KINDS)[number];

export const EXTERNAL_RESEARCH_SEARCH_SCHEMA_V1 = 'neko.externalResearch.search.v1' as const;
export const EXTERNAL_RESEARCH_FETCH_SCHEMA_V1 = 'neko.externalResearch.fetch.v1' as const;

export type ExternalResearchSearchOutputSchema = typeof EXTERNAL_RESEARCH_SEARCH_SCHEMA_V1;
export type ExternalResearchFetchOutputSchema = typeof EXTERNAL_RESEARCH_FETCH_SCHEMA_V1;

export interface ExternalResearchMcpSearchToolBinding {
  readonly name: string;
  readonly queryArg: string;
  readonly maxResultsArg?: string;
  readonly allowedDomainsArg?: string;
  readonly blockedDomainsArg?: string;
  readonly outputSchema: ExternalResearchSearchOutputSchema;
}

export interface ExternalResearchMcpFetchToolBinding {
  readonly name: string;
  readonly urlArg: string;
  readonly maxContentTokensArg?: string;
  readonly allowedDomainsArg?: string;
  readonly blockedDomainsArg?: string;
  readonly outputSchema: ExternalResearchFetchOutputSchema;
}

export interface ExternalResearchMcpProviderConfig {
  readonly serverId: string;
  readonly searchTool: ExternalResearchMcpSearchToolBinding;
  readonly fetchTool?: ExternalResearchMcpFetchToolBinding;
  /** Explicit opt-in escape hatch; bound tools are adapter-only by default. */
  readonly exposeBoundToolsAsRawMcp?: boolean;
}

export interface ExternalResearchConfig {
  readonly mode: ExternalResearchMode;
  readonly providerId?: string;
  readonly requireApprovalForLive: boolean;
  readonly allowProjectContextInQuery: boolean;
  readonly maxResults: number;
  readonly maxFetchContentTokens: number;
  readonly allowedDomains?: readonly string[];
  readonly blockedDomains?: readonly string[];
  readonly mcp?: ExternalResearchMcpProviderConfig;
}

export interface ExternalResearchConfigInput {
  readonly mode?: ExternalResearchMode;
  readonly providerId?: string;
  readonly requireApprovalForLive?: boolean;
  readonly allowProjectContextInQuery?: boolean;
  readonly maxResults?: number;
  readonly maxFetchContentTokens?: number;
  readonly allowedDomains?: readonly string[];
  readonly blockedDomains?: readonly string[];
  readonly mcp?: ExternalResearchMcpProviderConfig;
}

export const DEFAULT_EXTERNAL_RESEARCH_CONFIG: ExternalResearchConfig = {
  mode: 'disabled',
  requireApprovalForLive: true,
  allowProjectContextInQuery: false,
  maxResults: 5,
  maxFetchContentTokens: 12000,
};

export function normalizeExternalResearchConfig(
  input: ExternalResearchConfigInput | undefined,
): ExternalResearchConfig {
  return {
    ...DEFAULT_EXTERNAL_RESEARCH_CONFIG,
    ...removeUndefined({
      mode: input?.mode,
      providerId: input?.providerId,
      requireApprovalForLive: input?.requireApprovalForLive,
      allowProjectContextInQuery: input?.allowProjectContextInQuery,
      maxResults: input?.maxResults,
      maxFetchContentTokens: input?.maxFetchContentTokens,
      allowedDomains: input?.allowedDomains,
      blockedDomains: input?.blockedDomains,
      mcp: input?.mcp,
    }),
  };
}

export interface ExternalResearchSearchInput {
  readonly query: string;
  readonly mode: Exclude<ExternalResearchMode, 'disabled'>;
  readonly maxResults: number;
  readonly allowedDomains?: readonly string[];
  readonly blockedDomains?: readonly string[];
}

export interface ExternalResearchFetchInput {
  readonly url: string;
  readonly mode: 'live';
  readonly maxContentTokens: number;
  readonly allowedDomains?: readonly string[];
  readonly blockedDomains?: readonly string[];
}

export interface ResearchSource {
  readonly url: string;
  readonly providerId: string;
  readonly mode: Exclude<ExternalResearchMode, 'disabled'>;
  readonly searchedAt?: string;
  readonly fetchedAt?: string;
  readonly title?: string;
  readonly snippet?: string;
  readonly publishedAt?: string;
  readonly finalUrl?: string;
  readonly contentType?: string;
  readonly truncated?: boolean;
}

export interface ExternalResearchSearchResult {
  readonly query: string;
  readonly providerId: string;
  readonly mode: Exclude<ExternalResearchMode, 'disabled'>;
  readonly sources: readonly ResearchSource[];
}

export interface ExternalResearchFetchResult {
  readonly url: string;
  readonly providerId: string;
  readonly mode: 'live';
  readonly source: ResearchSource;
  readonly content: string;
}

export interface ResearchNote {
  readonly title: string;
  readonly markdown: string;
  readonly sources: readonly ResearchSource[];
  readonly createdAt: string;
  readonly source: 'external-research';
}

export type ExternalResearchDiagnosticSeverity = 'info' | 'warning' | 'error';

export type ExternalResearchDiagnosticCode =
  | 'external-research.unsupported-mode'
  | 'external-research.disabled'
  | 'external-research.provider-missing'
  | 'external-research.provider-capability-missing'
  | 'external-research.invalid-config'
  | 'external-research.invalid-provider-output';

export interface ExternalResearchDiagnostic {
  readonly code: ExternalResearchDiagnosticCode;
  readonly severity: ExternalResearchDiagnosticSeverity;
  readonly message: string;
  readonly mode?: ExternalResearchMode;
  readonly providerId?: string;
}

export interface ExternalResearchMcpSearchV1 {
  readonly sources: readonly {
    readonly url: string;
    readonly title?: string;
    readonly snippet?: string;
    readonly publishedAt?: string;
  }[];
}

export interface ExternalResearchMcpFetchV1 {
  readonly url: string;
  readonly finalUrl?: string;
  readonly title?: string;
  readonly content: string;
  readonly contentType?: string;
  readonly fetchedAt?: string;
  readonly truncated?: boolean;
}

export interface ExternalResearchProviderCapabilities {
  readonly supportsIndexed: boolean;
  readonly supportsLive: boolean;
  readonly supportsDomainFilters: boolean;
}

export interface ExternalResearchProvider {
  readonly id: string;
  readonly capabilities: ExternalResearchProviderCapabilities;
  search(
    input: ExternalResearchSearchInput,
    signal: AbortSignal,
  ): Promise<ExternalResearchSearchResult>;
  fetch(
    input: ExternalResearchFetchInput,
    signal: AbortSignal,
  ): Promise<ExternalResearchFetchResult>;
}

export function createUnsupportedExternalResearchModeDiagnostic(input: {
  readonly mode: ExternalResearchMode;
  readonly providerId?: string;
}): ExternalResearchDiagnostic {
  return {
    code: 'external-research.unsupported-mode',
    severity: 'error',
    message: `External research mode "${input.mode}" is not supported by the resolved provider.`,
    mode: input.mode,
    ...(input.providerId !== undefined ? { providerId: input.providerId } : {}),
  };
}

export function isExternalResearchMode(value: unknown): value is ExternalResearchMode {
  return EXTERNAL_RESEARCH_MODES.some((mode) => mode === value);
}

export function isExternalResearchConfig(value: unknown): value is ExternalResearchConfig {
  if (!isRecord(value) || !isExternalResearchMode(value['mode'])) return false;
  return (
    isOptionalString(value['providerId']) &&
    typeof value['requireApprovalForLive'] === 'boolean' &&
    typeof value['allowProjectContextInQuery'] === 'boolean' &&
    isPositiveInteger(value['maxResults']) &&
    isPositiveInteger(value['maxFetchContentTokens']) &&
    isOptionalStringArray(value['allowedDomains']) &&
    isOptionalStringArray(value['blockedDomains']) &&
    (value['mcp'] === undefined || isExternalResearchMcpProviderConfig(value['mcp']))
  );
}

export function isExternalResearchSearchInput(
  value: unknown,
): value is ExternalResearchSearchInput {
  if (!isRecord(value)) return false;
  return (
    typeof value['query'] === 'string' &&
    isEnabledExternalResearchMode(value['mode']) &&
    isPositiveInteger(value['maxResults']) &&
    isOptionalStringArray(value['allowedDomains']) &&
    isOptionalStringArray(value['blockedDomains'])
  );
}

export function isExternalResearchFetchInput(value: unknown): value is ExternalResearchFetchInput {
  if (!isRecord(value)) return false;
  return (
    typeof value['url'] === 'string' &&
    value['mode'] === 'live' &&
    isPositiveInteger(value['maxContentTokens']) &&
    isOptionalStringArray(value['allowedDomains']) &&
    isOptionalStringArray(value['blockedDomains'])
  );
}

export function isResearchSource(value: unknown): value is ResearchSource {
  if (!isRecord(value)) return false;
  return (
    typeof value['url'] === 'string' &&
    typeof value['providerId'] === 'string' &&
    isEnabledExternalResearchMode(value['mode']) &&
    isOptionalString(value['searchedAt']) &&
    isOptionalString(value['fetchedAt']) &&
    isOptionalString(value['title']) &&
    isOptionalString(value['snippet']) &&
    isOptionalString(value['publishedAt']) &&
    isOptionalString(value['finalUrl']) &&
    isOptionalString(value['contentType']) &&
    isOptionalBoolean(value['truncated'])
  );
}

export function isExternalResearchSearchResult(
  value: unknown,
): value is ExternalResearchSearchResult {
  if (!isRecord(value) || !Array.isArray(value['sources'])) return false;
  return (
    typeof value['query'] === 'string' &&
    typeof value['providerId'] === 'string' &&
    isEnabledExternalResearchMode(value['mode']) &&
    value['sources'].every(isResearchSource)
  );
}

export function isExternalResearchFetchResult(
  value: unknown,
): value is ExternalResearchFetchResult {
  if (!isRecord(value)) return false;
  return (
    typeof value['url'] === 'string' &&
    typeof value['providerId'] === 'string' &&
    value['mode'] === 'live' &&
    isResearchSource(value['source']) &&
    typeof value['content'] === 'string'
  );
}

export function isResearchNote(value: unknown): value is ResearchNote {
  if (!isRecord(value) || !Array.isArray(value['sources'])) return false;
  return (
    typeof value['title'] === 'string' &&
    typeof value['markdown'] === 'string' &&
    value['sources'].every(isResearchSource) &&
    typeof value['createdAt'] === 'string' &&
    value['source'] === 'external-research'
  );
}

export function isExternalResearchProviderCapabilities(
  value: unknown,
): value is ExternalResearchProviderCapabilities {
  if (!isRecord(value)) return false;
  return (
    typeof value['supportsIndexed'] === 'boolean' &&
    typeof value['supportsLive'] === 'boolean' &&
    typeof value['supportsDomainFilters'] === 'boolean'
  );
}

export function isExternalResearchMcpProviderConfig(
  value: unknown,
): value is ExternalResearchMcpProviderConfig {
  if (!isRecord(value)) return false;
  return (
    typeof value['serverId'] === 'string' &&
    isExternalResearchMcpSearchToolBinding(value['searchTool']) &&
    (value['fetchTool'] === undefined ||
      isExternalResearchMcpFetchToolBinding(value['fetchTool'])) &&
    (value['exposeBoundToolsAsRawMcp'] === undefined ||
      typeof value['exposeBoundToolsAsRawMcp'] === 'boolean')
  );
}

export function isExternalResearchMcpSearchV1(
  value: unknown,
): value is ExternalResearchMcpSearchV1 {
  if (!isRecord(value) || !Array.isArray(value['sources'])) return false;
  return value['sources'].every(isExternalResearchMcpSearchSource);
}

export function isExternalResearchMcpFetchV1(value: unknown): value is ExternalResearchMcpFetchV1 {
  return (
    isRecord(value) && typeof value['url'] === 'string' && typeof value['content'] === 'string'
  );
}

function isExternalResearchMcpSearchToolBinding(
  value: unknown,
): value is ExternalResearchMcpSearchToolBinding {
  if (!isRecord(value)) return false;
  return (
    typeof value['name'] === 'string' &&
    typeof value['queryArg'] === 'string' &&
    isOptionalString(value['maxResultsArg']) &&
    isOptionalString(value['allowedDomainsArg']) &&
    isOptionalString(value['blockedDomainsArg']) &&
    value['outputSchema'] === EXTERNAL_RESEARCH_SEARCH_SCHEMA_V1
  );
}

function isExternalResearchMcpFetchToolBinding(
  value: unknown,
): value is ExternalResearchMcpFetchToolBinding {
  if (!isRecord(value)) return false;
  return (
    typeof value['name'] === 'string' &&
    typeof value['urlArg'] === 'string' &&
    isOptionalString(value['maxContentTokensArg']) &&
    isOptionalString(value['allowedDomainsArg']) &&
    isOptionalString(value['blockedDomainsArg']) &&
    value['outputSchema'] === EXTERNAL_RESEARCH_FETCH_SCHEMA_V1
  );
}

function isExternalResearchMcpSearchSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value['url'] !== 'string') return false;
  return (
    isOptionalString(value['title']) &&
    isOptionalString(value['snippet']) &&
    isOptionalString(value['publishedAt'])
  );
}

function isEnabledExternalResearchMode(
  value: unknown,
): value is Exclude<ExternalResearchMode, 'disabled'> {
  return value === 'indexed' || value === 'live';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalStringArray(value: unknown): value is readonly string[] | undefined {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
