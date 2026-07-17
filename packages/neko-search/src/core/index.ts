export { ProjectCacheSearchService } from './ProjectCacheSearchService';
export { ProjectIndexCoordinator } from './ProjectIndexCoordinator';
export {
  buildProjectSearchText,
  matchesProjectSearchItem,
  normalizeProjectSearchQuery,
  normalizeSearchText,
  projectSearchItemMatchesFilters,
  rankProjectSearchItems,
} from './normalization';
export {
  aggregateProjectSearchFreshnessValues,
  aggregateProjectSearchItemsFreshness,
  aggregateProjectSearchPartitionStatus,
  dedupeCreativeEntityProjectSearchItems,
  type ProjectSearchPartitionStatusAggregationOptions,
} from './aggregation';
export {
  DebouncedProjectCacheWriter,
  readProjectSearchCacheManifest,
  writeProjectSearchCacheManifest,
} from './cacheManifest';
export {
  aggregateProjectSemanticCoverage,
  type ProjectSemanticCoverageAggregationInput,
} from './semanticCoverage';
export {
  projectSearchItemToGlobalSearchItem,
  projectSearchResultToGlobalSearchResult,
  toProjectGlobalSearchQuery,
  type ProjectGlobalSearchItem,
  type ProjectGlobalSearchQuery,
  type ProjectGlobalSearchResult,
} from './projections';
export { SimpleEventEmitter } from './simpleEventEmitter';
export type {
  ProjectSearchContextResolver,
  ProjectSearchDisposable,
  ProjectSearchEvent,
  ProjectSearchLogger,
  ProjectSearchRuntimePorts,
  ProjectSemanticCoverageProvider,
} from './ports';
