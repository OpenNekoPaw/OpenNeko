export {
  VSCodeResourceCacheService as HostResourceCacheService,
  VSCodeResourceCacheService,
  computeStats,
  resolveResourceCacheQuotaPolicy,
} from '../vscode/extension/resource-cache-service';
export type {
  ResourceCacheFsOps,
  ResourceCacheGcResult,
  ResourceCacheLookupResult,
  ResourceCacheLogger,
  ResourceCacheManifestLoadOptions,
  ResourceCacheManifestStore,
  ResourceCacheOperationOptions,
  ResourceCacheOperationResult,
  ResourceCacheProjectOptions,
  ResourceCacheProjectResult,
  ResourceCacheProvider,
  ResourceCacheService,
  ResourceEnsureInput,
  ResourceEnsureResult,
  ResourceProbeResult,
  VSCodeResourceCacheServiceOptions as HostResourceCacheServiceOptions,
  VSCodeResourceCacheServiceOptions,
} from '../vscode/extension/resource-cache-service';

export {
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
} from '../vscode/extension/document-resource-ref';
export type { CreateDocumentResourceRefInput } from '../vscode/extension/document-resource-ref';
export {
  GENERATED_RESOURCE_CACHE_PROVIDER_ID,
  GeneratedAssetDerivativeResourceCacheProvider,
  createGeneratedAssetResourceRef,
  resolveGeneratedAssetResourceRef,
} from '../vscode/extension/resource-cache-providers';
export type {
  CreateGeneratedAssetResourceRefInput,
  GeneratedAssetDerivativeResourceCacheProviderOptions,
  GeneratedAssetResourceResolverResult,
  GeneratedImageVariantGenerator,
  GeneratedImageVariantGeneratorResult,
  ResourceCacheFileOps,
} from '../vscode/extension/resource-cache-providers';

export * from '../types/content-representation';
export * from '../types/content-io';
export * from '../types/content-locator';
export * from './content-read-service';
export {
  createNodeHostContentReadService,
  NodeDocumentEntryContentReadHandler,
  NodeGeneratedOutputContentReadHandler,
  UnavailableContentReadHandler,
  type CreateNodeHostContentReadServiceOptions,
  type NodeDocumentEntryReader,
} from '../vscode/extension/node-content-read-service';
export {
  createHostDerivedContentRuntime,
  type CreateHostDerivedContentRuntimeOptions,
  type HostDerivedContentMaintenanceOptions,
  type HostDerivedContentMaintenanceResult,
  type HostDerivedContentRuntime,
  type HostDerivedContentTarget,
} from '../vscode/extension/host-derived-content-runtime';
