/**
 * VSCode Extension Host API Module
 *
 * Shared base classes and infrastructure for VSCode extension host providers.
 * Requires the vscode module (extension host context only).
 *
 * Import via: @neko/shared/vscode/extension
 *
 * NOTE: Do NOT re-export from @neko/shared/vscode/index.ts.
 * That module is for webview (browser) context.
 */
export { BaseOutlineProvider } from './baseOutlineProvider';
export type { IOutlineProvider } from './baseOutlineProvider';
export {
  EmbeddedFeatureRegistry,
  installEmbeddedFeatureRegistry,
  requireNekoExtension,
  resolveNekoExtension,
  waitForNekoExtensionActivation,
} from './embedded-feature-registry';
export type { EmbeddedFeatureRegistration, NekoExtension } from './embedded-feature-registry';

// Logger (OutputChannel transport + log level config)
export {
  OutputChannelTransport,
  createVSCodeLogger,
  inspectLogLevelSetting,
  resolveLogLevelSetting,
  watchLogLevel,
} from './logger';
export type { LogLevelSettingSnapshot } from './logger';

// Error reporter (showErrorMessage wrapper)
export { VSCodeErrorHandler } from './error-reporter';
export {
  REGISTER_AGENT_CAPABILITIES_COMMAND,
  registerOptionalAgentCapabilityProvider,
} from './optional-agent-capability-registration';

// i18n bridge (locale detection + webview injection)
export { getVSCodeLocale, injectLocaleAttribute } from './i18n-bridge';

// Webview asset utilities (GeneratedAsset → webviewUri conversion)
export { toWebviewAsset } from './webview-asset';
export {
  VSCodeLocalResourceAccessService,
  createDefaultLocalResourceAccessService,
  createExtensionAssetLocalResourceRootProvider,
  createExtensionCacheLocalResourceRootProvider,
  createMediaLibraryLocalResourceRootProvider,
  createStaticLocalResourceRootProvider,
  createWorkspaceCacheLocalResourceRootProvider,
  createWorkspaceLocalResourceRootProvider,
  isRemoteUrl,
  normalizeLocalFilePath,
  revokeWebviewLocalResourceAccess,
} from './local-resource-access';
export type {
  DefaultLocalResourceAccessServiceOptions,
  LocalResourceAccessLogger,
  LocalResourceAccessOptions,
  LocalResourceAccessService,
  LocalResourceProjectionOptions,
  LocalResourceProjectionResult,
  LocalResourceRoot,
  LocalResourceRootInput,
  LocalResourceRootKind,
  LocalResourceRootProvider,
  LocalResourceWebviewOptions,
  MediaLibraryLocalResourceRootProviderOptions,
} from './local-resource-access';

// Resource cache identity, materialization, manifest, and projection orchestration.
export {
  VSCodeResourceCacheService,
  computeStats,
  resolveResourceCacheQuotaPolicy,
} from './resource-cache-service';
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
  VSCodeResourceCacheServiceOptions,
} from './resource-cache-service';
export {
  GENERATED_RESOURCE_CACHE_PROVIDER_ID,
  GeneratedAssetDerivativeResourceCacheProvider,
  PREVIEW_RESOURCE_CACHE_PROVIDER_ID,
  PreviewVariantResourceCacheProvider,
  THUMBNAIL_RESOURCE_CACHE_PROVIDER_ID,
  ThumbnailResourceCacheProvider,
  createFileThumbnailResourceRef,
  createGeneratedAssetResourceRef,
  createPreviewAssetResourceRef,
  resolveGeneratedAssetResourceRef,
} from './resource-cache-providers';
export type {
  CreateFileThumbnailResourceRefInput,
  CreateGeneratedAssetResourceRefInput,
  CreatePreviewAssetResourceRefInput,
  GeneratedAssetDerivativeResourceCacheProviderOptions,
  GeneratedAssetResourceResolverResult,
  GeneratedImageVariantGenerator,
  GeneratedImageVariantGeneratorResult,
  PreviewVariantResourceApi,
  PreviewVariantResourceCacheProviderOptions,
  ResourceCacheFileOps,
  ThumbnailResourceCacheProviderOptions,
  ThumbnailResourceGenerator,
  ThumbnailResourceGeneratorResult,
} from './resource-cache-providers';
export {
  DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
  DocumentResourceCacheProvider,
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
} from './document-resource-cache-provider';
export type {
  CreateDocumentResourceRefInput,
  DocumentEntryReader,
  DocumentResourceCacheFsOps,
  DocumentResourceCacheProviderOptions,
} from './document-resource-cache-provider';
// Intent-aware content read/write orchestration.
export { HostContentAccessService, HostContentIngestService } from './content-access-service';
export type {
  ContentAccessLogger,
  ContentAccessService,
  ContentAccessServiceOptions,
  ContentIngestGuardOptions,
  ContentIngestService,
  ContentIngestServiceOptions,
} from './content-access-service';
export {
  CacheArtifactContentIngestProvider,
  DocumentEntryContentAccessProvider,
  GeneratedAssetSourceContentAccessProvider,
  ExportStagingContentIngestProvider,
  GeneratedOutputContentIngestProvider,
  ImportSourceContentIngestProvider,
  PreviewVariantContentAccessProvider,
  RegisterExistingSourceContentIngestProvider,
  ResourceCacheContentAccessProvider,
  SourceFileContentAccessProvider,
  VideoProxyContentAccessProvider,
} from './content-access-providers';
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
} from './content-access-providers';
export {
  contractHostContentMediaPath,
  createHostContentMediaPathContext,
  createHostContentPathResolver,
  createWorkspaceContentPathResolver,
  getHostContentAuthorizedReadRoots,
  loadHostContentPathPolicy,
  resolveHostContentMediaPath,
} from './content-path-resolver';
export type {
  HostContentPathPolicy,
  HostContentPathResolverOptions,
} from './content-path-resolver';
export {
  createExtensionPrivateResourceCacheOptions,
  createHostContentAccessRuntime,
  createWorkspaceResourceCacheOptions,
} from './content-access-runtime';
export type {
  CreateHostContentAccessRuntimeOptions,
  HostContentAccessRuntime,
  HostContentAccessRuntimeCacheOptions,
  HostContentAccessRuntimeDocumentProviderOptions,
  HostContentAccessRuntimeGeneratedSourceProviderOptions,
  HostContentAccessRuntimeIngestProviderOptions,
  HostContentAccessRuntimeSourceProviderOptions,
} from './content-access-runtime';
export {
  createVSCodeWorkspaceMediaPathContext,
  createVSCodeWorkspacePathResolver,
} from './workspace-media-path';
export type { VSCodeWorkspaceMediaPathContextInput } from './workspace-media-path';
export { readStringMetadata } from './metadata';
export {
  NodeLocalMetadataBulkWorkerExecutor,
  isLocalMetadataBulkWorkerResult,
} from './local-metadata-bulk-worker-executor';
export type {
  LocalMetadataBulkOperation,
  LocalMetadataBulkWorkerRequest,
  LocalMetadataBulkWorkerResult,
  NodeLocalMetadataBulkWorkerExecutorOptions,
} from './local-metadata-bulk-worker-executor';
export { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';
export type { NodeSqliteLocalMetadataStoreOptions } from './node-sqlite-local-metadata-store';
export { createVSCodeProjectFileIoAdapter } from './project-file-io';
export type {
  VSCodeProjectFileContextInput,
  VSCodeProjectFileIoAdapter,
  VSCodeProjectFileIoAdapterOptions,
} from './project-file-io';
export { requestWebviewProjectSnapshot } from './project-file-snapshot';
export type { RequestWebviewProjectSnapshotOptions } from './project-file-snapshot';
export { ProjectFileSaveSession, formatProjectFileDiagnostics } from './project-file-save-session';
export type {
  ProjectFileSaveSessionBackupRequest,
  ProjectFileSaveSessionOptions,
  ProjectFileSaveSessionSaveRequest,
  ProjectFileSaveSessionSnapshotRequest,
} from './project-file-save-session';
export {
  createVSCodeProjectSourceAddRequest,
  normalizeVSCodeProjectSourceAddRequest,
} from './project-source-add';

// Character registry utilities (workspace characters.json read/write + lookup)
export {
  CharacterRegistryService,
  loadCharacterBindingsForNames,
  resolveCharacterBindingsForNames,
  resolveCharacterRegistryPath,
} from './character-registry';

// Creative entity facade + Git-tracked entity/asset binding storage
export {
  CharacterRecordAdapter,
  CreativeEntityRegistryService,
  DefaultAssetRefResolver,
  EntityAssetBindingService,
  EntityAssetRequirementService,
  RepresentationResolver,
  VisualIdentityDraftService,
  characterRecordToCreativeEntity,
  createEmptyEntityAssetBindingFile,
  createEmptyEntityAssetRequirementFile,
  createEmptyVisualIdentityDraftFile,
  resolveEntityAssetRequirementsPath,
  resolveEntityAssetBindingsPath,
  resolveVisualIdentityDraftsPath,
} from './creative-entity-composition';
export type {
  AssetRefBackendResolver,
  CreativeEntityAdapter,
  RepresentationResolverOptions,
} from './creative-entity-composition';

// New-file UX (unique name → write → reveal → rename)
export { createNewFile } from './create-new-file';
export type { CreateNewFileOptions, TemplateChoice } from './create-new-file';

// Command payload parsing helpers
export { isRecord, readNonEmptyString } from './command-args';

// Project snapshot package helper (Extension Host only, no Engine dependency)
export { createProjectSnapshotPackage } from './project-package';
export type { ProjectPackageRequest, ProjectPackageResult } from './project-package';

// StatusBar group lifecycle manager
export {
  StatusBarGroup,
  StatusBarProjectionManager,
  getActiveCustomEditorId,
  getStatusBarActiveSurface,
  isStatusBarItemSpecVisible,
  sortStatusBarItemSpecs,
} from './StatusBarGroup';
export type {
  StatusBarActiveSurface,
  StatusBarItemConfig,
  StatusBarItemSpec,
  StatusBarProjectionManagerOptions,
} from './StatusBarGroup';

// Focused Webview keyboard routing
export { FocusedWebviewRegistry, createFocusedWebviewRegistry } from './focused-webview-registry';
export type {
  FocusedWebviewDisposable,
  FocusedWebviewPanelLike,
  FocusedWebviewPostTarget,
  FocusedWebviewRegistration,
  FocusedWebviewResolution,
  FocusedWebviewResolveRequest,
  IFocusedWebviewRegistry,
} from './focused-webview-registry';

// Cross-extension Webview keyboard ownership context
export {
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
  hasWebviewKeyboardEditableOwner,
  isWebviewKeyboardEditableOwnerUpdate,
  updateWebviewKeyboardEditableOwner,
} from './webview-keyboard-context';
export type { WebviewKeyboardEditableOwnerUpdate } from './webview-keyboard-context';
