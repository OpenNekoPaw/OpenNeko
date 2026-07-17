export {
  PROJECT_SEARCH_QUERY_COMMAND,
  PROJECT_SEARCH_REFRESH_COMMAND,
  PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND,
  registerProjectSearchService,
  registerProjectSearchWatchers,
} from './commands';
export {
  createCompatibilityProjectSearchAdapters,
  type CompatibilityProjectSearchAdaptersOptions,
  type JsonReader,
  type WorkspaceFileFinder,
} from './compatAdapters';
export {
  createVSCodeProjectSearchContextResolver,
  resolveProjectSearchContext,
  type VSCodeProjectSearchContextResolverOptions,
} from './projectResolver';
export {
  createVSCodeSemanticCoverageProvider,
  type VSCodeSemanticCoverageProviderOptions,
} from './semanticCoverageProvider';
export { queryProjectGlobalSearch } from './globalSearch';
