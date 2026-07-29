import type {
  ExternalResearchFetchInput,
  ExternalResearchFetchResult,
  ExternalResearchProvider,
  ExternalResearchProviderCapabilities,
  ExternalResearchSearchInput,
  ExternalResearchSearchResult,
  ResearchSource,
} from '@neko/shared';

export interface FakeExternalResearchProviderOptions {
  readonly id?: string;
  readonly capabilities?: Partial<ExternalResearchProviderCapabilities>;
  readonly now?: () => string;
}

export function createFakeExternalResearchProvider(
  options: FakeExternalResearchProviderOptions = {},
): ExternalResearchProvider {
  const providerId = options.id ?? 'fake:external-research';
  const now = options.now ?? (() => '2026-07-10T00:00:00.000Z');
  const capabilities: ExternalResearchProviderCapabilities = {
    supportsIndexed: options.capabilities?.supportsIndexed ?? true,
    supportsLive: options.capabilities?.supportsLive ?? true,
    supportsDomainFilters: options.capabilities?.supportsDomainFilters ?? true,
  };

  return {
    id: providerId,
    capabilities,
    async search(input: ExternalResearchSearchInput, signal: AbortSignal) {
      throwIfAborted(signal);
      const source = createSource({
        providerId,
        mode: input.mode,
        url: `https://research.example.test/search/${encodeURIComponent(input.query)}`,
        title: `Reference for ${input.query}`,
        snippet: `Deterministic fake source for ${input.query}`,
        searchedAt: now(),
      });
      return {
        query: input.query,
        providerId,
        mode: input.mode,
        sources: [source].slice(0, input.maxResults),
      } satisfies ExternalResearchSearchResult;
    },
    async fetch(input: ExternalResearchFetchInput, signal: AbortSignal) {
      throwIfAborted(signal);
      const source = createSource({
        providerId,
        mode: 'live',
        url: input.url,
        finalUrl: input.url,
        title: `Fetched ${input.url}`,
        fetchedAt: now(),
        contentType: 'text/plain',
      });
      return {
        url: input.url,
        providerId,
        mode: 'live',
        source,
        content: `Deterministic fake fetched content for ${input.url}`,
      } satisfies ExternalResearchFetchResult;
    },
  };
}

function createSource(input: ResearchSource): ResearchSource {
  return input;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('External research request aborted.');
  }
}
