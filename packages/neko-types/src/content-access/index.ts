export {
  HostContentAccessService,
  HostContentIngestService,
} from '../vscode/extension/content-access-service';
export type {
  ContentAccessLogger,
  ContentAccessService,
  ContentAccessServiceOptions,
  ContentIngestGuardOptions,
  ContentIngestService,
  ContentIngestServiceOptions,
} from '../vscode/extension/content-access-service';

export {
  CacheArtifactContentIngestProvider,
  DocumentEntryContentAccessProvider,
  ExportStagingContentIngestProvider,
  GeneratedAssetSourceContentAccessProvider,
  GeneratedOutputContentIngestProvider,
  ImportSourceContentIngestProvider,
  PreviewVariantContentAccessProvider,
  RegisterExistingSourceContentIngestProvider,
  ResourceCacheContentAccessProvider,
  SourceFileContentAccessProvider,
  VideoProxyContentAccessProvider,
} from '../vscode/extension/content-access-providers';
export type {
  CacheArtifactContentIngestProviderOptions,
  ContentAccessFileOps,
  ContentAccessFileExists,
  ContentAccessWebviewResolver,
  ContentIngestFileProviderOptions,
  DocumentEntryContentAccessProviderOptions,
  GeneratedAssetSourceContentAccessProviderOptions,
  PreviewVariantContentAccessProviderOptions,
  ResourceCacheContentAccessProviderOptions,
  SourceFileContentAccessProviderOptions,
  VideoProxyContentAccessProviderOptions,
} from '../vscode/extension/content-access-providers';

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
  DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
  DocumentResourceCacheProvider,
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
} from '../vscode/extension/document-resource-cache-provider';
export type {
  CreateDocumentResourceRefInput,
  DocumentEntryReader,
  DocumentResourceCacheFsOps,
  DocumentResourceCacheProviderOptions,
} from '../vscode/extension/document-resource-cache-provider';
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
