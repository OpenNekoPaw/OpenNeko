import {
  isExternalResearchFetchResult,
  isExternalResearchSearchResult,
  type ResearchSource,
} from '@neko/shared';

export interface ExternalResearchTraceProjection {
  readonly toolName: 'WebSearch' | 'WebFetch';
  readonly mode: 'indexed' | 'live';
  readonly providerId: string;
  readonly query?: string;
  readonly url?: string;
  readonly approvalState?: 'not-required' | 'approved' | 'denied' | 'unknown';
  readonly sources: readonly ResearchSource[];
}

export function projectExternalResearchToolResult(input: {
  readonly toolName: string;
  readonly resultData: unknown;
  readonly approvalState?: ExternalResearchTraceProjection['approvalState'];
}): ExternalResearchTraceProjection | null {
  if (input.toolName === 'WebSearch' && isExternalResearchSearchResult(input.resultData)) {
    return {
      toolName: 'WebSearch',
      mode: input.resultData.mode,
      providerId: input.resultData.providerId,
      query: input.resultData.query,
      sources: input.resultData.sources,
      ...(input.approvalState ? { approvalState: input.approvalState } : {}),
    };
  }

  if (input.toolName === 'WebFetch' && isExternalResearchFetchResult(input.resultData)) {
    return {
      toolName: 'WebFetch',
      mode: 'live',
      providerId: input.resultData.providerId,
      url: input.resultData.url,
      sources: [input.resultData.source],
      ...(input.approvalState ? { approvalState: input.approvalState } : {}),
    };
  }

  return null;
}
