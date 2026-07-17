export {
  createDocumentAccessService,
  createManifestBatchCursor,
  detectDocumentFormat,
  DocumentAccessError,
  DocumentAccessService,
  DEFAULT_DOCUMENT_BATCH_MAX_CHARS,
  type DocumentAccessErrorCode,
  type DocumentAccessServiceDeps,
  type DocumentLowLevelAccess,
  type IDocumentAccessService,
} from './document-access-service';

export {
  DocumentReaderRuntime,
  createDocumentReaderRuntime,
  estimateSlideCount,
  isDocumentUrl,
  isSupportedDocumentPath,
  stripHtmlToText,
  type DocumentContent,
  type DocumentReaderLogger,
  type DocumentReaderRuntimeDeps,
  type IDocumentReader,
} from './document-reader';

export {
  imageMetadataProbe,
  probeImageMetadata,
  type ImageMetadata,
  type ImageMetadataProbe,
} from './image-metadata';

export {
  DocumentContentAccessRuntime,
  type DocumentContentAccessInput,
  type DocumentContentAccessMode,
  type DocumentContentAccessResult,
  type DocumentContentAccessRuntimeDeps,
} from './content-access-document-runtime';

export {
  createDocumentEntryVariantFromMetadata,
  createManagedDocumentResourceRef,
  formatDocumentAliasScope,
  formatDocumentImageAlias,
  formatDocumentSourceId,
  projectDocumentResourceRefsInValue,
  readDocumentArchiveResourceProjection,
  readDocumentResourceDisplayId,
  type DocumentResourceProjection,
  type DocumentResourceProjectionProjector,
} from './document-resource-projection';

export {
  createContentDocumentReadCapabilityProvider,
  createContentMediaReadCapabilityProvider,
  createContentReadCapabilityProvider,
  type ContentReadCapabilityProviderDeps,
} from './content-read-capability-provider';

export {
  createReadDocumentTool,
  DEFAULT_DOCUMENT_IMAGE_INFO_LIMIT,
  DEFAULT_READ_DOCUMENT_MAX_CHARS,
  MAX_DOCUMENT_IMAGE_INFO_LIMIT,
  MAX_READ_DOCUMENT_CHARS,
  type ReadDocumentContentAccessInput,
  type ReadDocumentContentAccessResult,
  type ReadDocumentContentAccessRuntime,
  type ReadDocumentToolDeps,
} from './read-document-tool';

export {
  createReadImageTool,
  executeReadImage,
  DEFAULT_READ_IMAGE_LIMIT,
  MAX_READ_IMAGE_BYTES,
  MAX_READ_IMAGE_LIMIT,
  READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED,
  type ReadImageAnalysisKind,
  type ReadImageContentAccessRuntime,
  type ReadImageInputImage,
  type ReadImageMetadataInput,
  type ReadImageMetadataResult,
  type ReadImageMode,
  type ReadImageProviderAssetInput,
  type ReadImageProviderAssetResult,
  type ReadImageResultData,
  type ReadImageResultImage,
  type ReadImageToolDeps,
} from './read-image-tool';
