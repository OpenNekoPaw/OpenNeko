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

export type {
  DocumentChapterCoordinate,
  DocumentPageCoordinate,
  DocumentReadCoordinate,
  DocumentRegionCoordinate,
  DocumentSlideCoordinate,
  DocumentTextRangeCoordinate,
} from '../contracts/document-read-coordinate';

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
  type ContentDocumentCursor,
  type ContentDocumentManifest,
  type ContentDocumentManifestUnit,
} from './content-access-document-runtime';
export {
  DOCUMENT_DSH_TOOL_NAME,
  DOCUMENT_DSH_TOOL_OPERATIONS,
  DOCUMENT_DSH_TOOL_PARAMETERS,
  decodeDocumentDshToolArgs,
  decodeDocumentDshToolInput,
  documentDshJsonValue,
  type DocumentDshJsonValue,
  type DocumentDshContinueInput,
  type DocumentDshReadImagesInput,
  type DocumentDshReadInput,
  type DocumentDshToolInput,
  type DocumentDshToolOperation,
} from './dsh-tool';
