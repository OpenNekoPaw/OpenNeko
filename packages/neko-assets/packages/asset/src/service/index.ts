/**
 * Service Layer Exports
 */

export { EntityService } from './EntityService';
export { VariantService } from './VariantService';
export { FileService, type FileServiceConfig, type MetadataExtractor } from './FileService';
export {
  AssetLibrary,
  type AssetLibraryConfig,
  type ImportOptions,
  type ImportResult,
  type ThumbnailGenerator,
  type ThumbnailGeneratorResult,
} from './AssetLibrary';
export {
  AssetDiffService,
  type IAssetDiffService,
  type IGitService,
  type IAIAnalysisService,
} from './AssetDiffService';
export { AssetRegistry, type AssetRegistryConfig, type AssetChangeListener } from './AssetRegistry';
export { AssetHealthService, type AssetHealthServiceConfig } from './AssetHealthService';
export {
  buildAssetBindingCandidate,
  buildCancelEntityBindingPlan,
  buildDeleteAssetPlan,
  buildRepresentationPackageDetail,
  parseProjectAssetEntityId,
  toProjectAssetRef,
  type AssetBindingCandidate,
  type CancelEntityBindingPlan,
  type DeleteAssetPlan,
  type RepresentationPackageDetail,
} from './EntityAssetCompositionService';
export type {
  FileAccessChecker,
  FileHealthResult,
  HealthCheckProgress,
  PathVariableMap,
} from './types';
export { generateEntityId, generateVariantId, generateFileId } from './utils';
