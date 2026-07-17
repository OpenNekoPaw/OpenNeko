import * as path from 'path';
import {
  createTool,
  getMimeType,
  isDocumentArchiveResourceRef,
  isResourceRef,
  parseDocumentArchiveResourceRef,
  TOOL_NAMES_SYSTEM,
  type ContentAccessDiagnostic,
  type ContentAccessResult,
  type ContentSourceRef,
  type DocumentArchiveResourceRef,
  type PerceptionCard,
  type PerceptualAssetRef,
  type ResourceRef,
  type ResourceVariantRequest,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import {
  createDocumentEntryVariantFromMetadata,
  createManagedDocumentResourceRef,
  readDocumentResourceDisplayId,
} from './document-resource-projection';
import type { ImageMetadata } from './image-metadata';

export const DEFAULT_READ_IMAGE_LIMIT = 4;
export const MAX_READ_IMAGE_LIMIT = 16;
export const MAX_READ_IMAGE_BYTES = 20 * 1024 * 1024;
export const READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED =
  'ReadImage no longer performs model-backed vision analysis. Use metadata mode to expose image resources, then let the selected chat model analyze them through the native multimodal Agent turn. Future external vision-model tools must use a separate tool name.';

export interface ReadImageToolDeps {
  readonly contentAccessRuntime?: ReadImageContentAccessRuntime;
  readonly resolveResourceScope?: () => ResourceRef['scope'];
  readonly now?: () => number;
}

export interface ReadImageContentAccessRuntime {
  loadProviderAsset(input: ReadImageProviderAssetInput): Promise<ReadImageProviderAssetResult>;
  resolveImageMetadata(input: ReadImageMetadataInput): Promise<ReadImageMetadataResult>;
}

export interface ReadImageProviderAssetInput {
  readonly caller: 'read-image';
  readonly source: ContentSourceRef;
  readonly preferredTarget: 'bytes';
  readonly variant?: ResourceVariantRequest;
  readonly mimeTypeHint?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ReadImageProviderAssetResult {
  readonly status: ContentAccessResult['status'];
  readonly diagnostics: readonly ContentAccessDiagnostic[];
  readonly bytes?: Uint8Array;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface ReadImageMetadataInput {
  readonly caller: 'read-image';
  readonly source: ContentSourceRef;
  readonly variant?: ResourceVariantRequest;
  readonly metadata?: Record<string, unknown>;
}

export interface ReadImageMetadataResult {
  readonly status: ContentAccessResult['status'];
  readonly diagnostics: readonly ContentAccessDiagnostic[];
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
}

export interface ReadImageInputImage {
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly portableForTransfer?: boolean;
  readonly nonPortableReason?: string;
  readonly label?: string;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly metadata?: Record<string, unknown>;
  readonly resourceRef?: DocumentArchiveResourceRef | ResourceRef;
}

interface InternalReadImageInputImage extends ReadImageInputImage {
  readonly managedResourceRef?: ResourceRef;
}

export interface ReadImageResultImage {
  readonly alias?: string;
  readonly aliasScope?: string;
  readonly sourceDocumentId?: string;
  readonly entryPath?: string;
  readonly portableForTransfer?: boolean;
  readonly nonPortableReason?: string;
  readonly label?: string;
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly byteSize: number;
  readonly metadata?: Record<string, unknown>;
  readonly resourceRef?: DocumentArchiveResourceRef | ResourceRef;
}

export interface ReadImageResultData {
  readonly mode: ReadImageMode;
  readonly analysis?: ReadImageAnalysisKind;
  readonly images: readonly ReadImageResultImage[];
  readonly imageCount: number;
  readonly imagesTruncated: boolean;
}

export type ReadImageMode = 'metadata' | 'vision';
export type ReadImageAnalysisKind = 'describe' | 'ocr' | 'panels' | 'storyboard' | 'custom';

interface LoadedImage {
  readonly input: InternalReadImageInputImage;
  readonly resolvedPath: string;
  readonly metadata: ImageMetadata;
}

export function createReadImageTool(deps: ReadImageToolDeps = {}): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_IMAGE,
    description:
      'Read local image metadata and expose selected images as native multimodal Agent resources. ' +
      'Use this only with structured imageInfo entries returned by ReadDocument or ResourceRef values returned by unified content access. ' +
      'Do not pass document locators, EPUB entry paths, cache paths, Webview URIs, or whole document sources, and do not fabricate resourceRef objects. ' +
      'The selected chat model performs visual analysis in the next Agent reasoning step; this tool does not call a separate vision model.',
    category: 'analysis',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          description:
            'Structured image inputs with stable resourceRef values returned by ReadDocument or unified content access.',
          items: {
            type: 'object',
            required: ['resourceRef'],
            properties: {
              width: { type: 'integer' },
              height: { type: 'integer' },
              mimeType: { type: 'string' },
              label: { type: 'string' },
              alias: { type: 'string' },
              aliasScope: { type: 'string' },
              sourceDocumentId: { type: 'string' },
              entryPath: { type: 'string' },
              portableForTransfer: { type: 'boolean' },
              nonPortableReason: { type: 'string' },
              metadata: {
                type: 'object',
                description: 'Optional metadata copied from ReadDocument.imageInfo.',
              },
              resourceRef: {
                type: 'object',
                description:
                  'Stable DocumentArchiveResourceRef copied exactly from ReadDocument.imageInfo[].resourceRef, or a ResourceRef returned by unified content access.',
              },
            },
          },
        },
        mode: {
          type: 'string',
          enum: ['metadata'],
          description:
            'metadata reads local file/image metadata and exposes images to the native multimodal Agent turn.',
        },
        analysis: {
          type: 'string',
          enum: ['describe', 'ocr', 'panels', 'storyboard', 'custom'],
          description:
            'Optional hint for the next native multimodal Agent reasoning step. This tool does not perform model analysis.',
        },
        prompt: {
          type: 'string',
          description:
            'Optional hint for the next native multimodal Agent reasoning step. This tool does not perform model analysis.',
        },
        max_images: {
          type: 'integer',
          description: `Maximum number of images to process. Default ${DEFAULT_READ_IMAGE_LIMIT}; max ${MAX_READ_IMAGE_LIMIT}.`,
          minimum: 1,
          maximum: MAX_READ_IMAGE_LIMIT,
        },
      },
    },
    execute: async (args) => executeReadImage(deps, args),
  });
}

export async function executeReadImage(
  deps: ReadImageToolDeps,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const mode = readMode(args['mode']);
  const analysis = readAnalysisKind(args['analysis']);
  if (mode === 'vision') {
    return { success: false, error: READ_IMAGE_MODEL_ANALYSIS_UNSUPPORTED };
  }
  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_IMAGE_LIMIT,
    1,
    MAX_READ_IMAGE_LIMIT,
  );
  const images = readInputImages(args);
  if (images.length === 0) {
    return {
      success: false,
      error:
        'Missing required field: images[].resourceRef. Pass images as ReadDocument.imageInfo[] entries or objects containing resourceRef from unified content access. Do not inspect cache directories, pass image paths, EPUB entry paths, or whole document sources.',
    };
  }

  const selected = images.slice(0, maxImages);
  try {
    const loaded = await Promise.all(selected.map((image) => loadImage(deps, image)));
    const results: ReadImageResultImage[] = loaded.map((image) => ({
      ...(image.input.alias ? { alias: image.input.alias } : {}),
      ...(image.input.aliasScope ? { aliasScope: image.input.aliasScope } : {}),
      ...(image.input.sourceDocumentId ? { sourceDocumentId: image.input.sourceDocumentId } : {}),
      ...(image.input.entryPath ? { entryPath: image.input.entryPath } : {}),
      portableForTransfer: image.input.portableForTransfer ?? false,
      ...(image.input.nonPortableReason
        ? { nonPortableReason: image.input.nonPortableReason }
        : {}),
      ...(image.input.label ? { label: image.input.label } : {}),
      ...(image.metadata.width !== undefined ? { width: image.metadata.width } : {}),
      ...(image.metadata.height !== undefined ? { height: image.metadata.height } : {}),
      ...(image.metadata.mimeType ? { mimeType: image.metadata.mimeType } : {}),
      byteSize: image.metadata.byteSize,
      ...(image.input.metadata ? { metadata: image.input.metadata } : {}),
      ...(image.input.resourceRef ? { resourceRef: image.input.resourceRef } : {}),
    }));
    const perceptionCards = results.map((image, index) => {
      const loadedImage = loaded[index];
      if (!loadedImage) {
        throw new Error(`ReadImage result ${index + 1} is missing its loaded image.`);
      }
      return createReadImagePerceptionCard({
        image,
        loaded: loadedImage,
        createdAt: deps.now?.() ?? Date.now(),
        index,
      });
    });
    const attachments = perceptionCards.map((card, index) => {
      const image = results[index];
      const assetRef = card.perceptual?.keyframeRefs?.[0];
      if (!image || !assetRef) {
        throw new Error(`ReadImage result ${index + 1} is missing its perceptual asset ref.`);
      }
      return {
        type: 'image' as const,
        path: assetRef.uri,
        ...(image.mimeType ? { mimeType: image.mimeType } : {}),
        assetRef,
      };
    });

    return {
      success: true,
      data: {
        mode,
        analysis,
        images: results,
        imageCount: images.length,
        imagesTruncated: selected.length < images.length,
      } satisfies ReadImageResultData,
      attachments,
      perceptionCards,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function loadImage(
  deps: ReadImageToolDeps,
  input: ReadImageInputImage,
): Promise<LoadedImage> {
  const contentAccessRuntime = deps.contentAccessRuntime;
  if (!contentAccessRuntime) {
    throw new Error('ReadImage requires AgentContentAccessRuntime.');
  }
  const withRefs = restoreManagedResourceRef(deps, input);
  const source = await createReadImageSource(withRefs);
  const providerAsset = await contentAccessRuntime.loadProviderAsset({
    caller: 'read-image',
    source,
    preferredTarget: 'bytes',
    variant: withRefs.managedResourceRef ? createDocumentEntryVariant(withRefs) : undefined,
    mimeTypeHint: withRefs.mimeType,
    metadata: withRefs.metadata,
  });
  if (providerAsset.status !== 'ready' || !providerAsset.bytes) {
    throw new Error(
      providerAsset.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `ReadImage could not load image bytes: ${providerAsset.status}`,
    );
  }
  if (providerAsset.bytes.byteLength > MAX_READ_IMAGE_BYTES) {
    throw new Error(`Image is too large for ReadImage: ${getImageDisplayPath(withRefs)}`);
  }
  const metadataResult = await contentAccessRuntime.resolveImageMetadata({
    caller: 'read-image',
    source,
    variant: withRefs.managedResourceRef ? createDocumentEntryVariant(withRefs) : undefined,
    metadata: withRefs.metadata,
  });
  if (metadataResult.status !== 'ready') {
    throw new Error(
      metadataResult.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `Unsupported or unreadable image file: ${metadataResult.status}`,
    );
  }
  const metadata: ImageMetadata = {
    mimeType:
      metadataResult.mimeType ??
      providerAsset.mimeType ??
      withRefs.mimeType ??
      getMimeType(getImageDisplayPath(withRefs)),
    byteSize: metadataResult.sizeBytes ?? providerAsset.sizeBytes ?? providerAsset.bytes.byteLength,
    ...(metadataResult.width !== undefined ? { width: metadataResult.width } : {}),
    ...(metadataResult.height !== undefined ? { height: metadataResult.height } : {}),
  };
  return {
    input: withRefs,
    resolvedPath: getImageDisplayPath(withRefs),
    metadata,
  };
}

function restoreManagedResourceRef(
  deps: ReadImageToolDeps,
  input: ReadImageInputImage,
): InternalReadImageInputImage {
  if (input.resourceRef && isDocumentArchiveResourceRef(input.resourceRef)) {
    if (!input.resourceRef.entryPath) {
      throw new Error(
        'ReadImage document resource refs require a stable document entry path; whole document archive bytes are not valid image assets.',
      );
    }
    const managedResourceRef = createManagedDocumentResourceRef(
      input.resourceRef,
      deps.resolveResourceScope?.() ?? 'project',
    );
    return withResourceTransferMetadata(input, managedResourceRef, { managedResourceRef });
  }
  if (input.resourceRef && isResourceRef(input.resourceRef)) {
    return withResourceTransferMetadata(input, input.resourceRef);
  }
  return input;
}

function withResourceTransferMetadata(
  input: ReadImageInputImage,
  resourceRef: ResourceRef,
  extra: Pick<InternalReadImageInputImage, 'managedResourceRef'> = {},
): InternalReadImageInputImage {
  return {
    ...input,
    ...extra,
    portableForTransfer: input.portableForTransfer ?? resourceRef.scope === 'project',
    ...(input.nonPortableReason
      ? { nonPortableReason: input.nonPortableReason }
      : resourceRef.scope !== 'project'
        ? { nonPortableReason: 'workspace-required-for-transfer' }
        : {}),
  };
}

async function createReadImageSource(input: InternalReadImageInputImage): Promise<ResourceRef> {
  if (input.managedResourceRef) {
    return input.managedResourceRef;
  }

  if (input.resourceRef && isResourceRef(input.resourceRef)) {
    return input.resourceRef;
  }

  if (input.resourceRef) {
    throw new Error('ReadImage could not convert documentResourceRef to a managed ResourceRef.');
  }

  throw new Error('ReadImage image inputs require images[].resourceRef.');
}

function createDocumentEntryVariant(input: ReadImageInputImage): ResourceVariantRequest {
  return createDocumentEntryVariantFromMetadata(input);
}

function getImageDisplayPath(input: InternalReadImageInputImage): string {
  return readDocumentResourceDisplayId(input.resourceRef) ?? input.alias ?? input.label ?? 'image';
}

function readInputImages(args: Record<string, unknown>): ReadImageInputImage[] {
  const structured = args['images'];
  if (Array.isArray(structured)) {
    return structured.flatMap((item) => {
      if (!isRecord(item)) return [];
      const alias = readString(item['alias']);
      const aliasScope = readString(item['aliasScope']);
      const sourceDocumentId = readString(item['sourceDocumentId']);
      const entryPath = readString(item['entryPath']);
      const portableForTransfer = readBoolean(item['portableForTransfer']);
      const nonPortableReason = readString(item['nonPortableReason']);
      const label = readString(item['label']);
      const width = readPositiveInteger(item['width']);
      const height = readPositiveInteger(item['height']);
      const mimeType = readString(item['mimeType']);
      const metadata = isRecord(item['metadata']) ? item['metadata'] : undefined;
      const resourceRef = parseReadImageResourceRef(item['resourceRef']);
      return resourceRef
        ? [
            {
              ...(alias ? { alias } : {}),
              ...(aliasScope ? { aliasScope } : {}),
              ...(sourceDocumentId ? { sourceDocumentId } : {}),
              ...(entryPath ? { entryPath } : {}),
              ...(portableForTransfer !== undefined ? { portableForTransfer } : {}),
              ...(nonPortableReason ? { nonPortableReason } : {}),
              ...(label ? { label } : {}),
              ...(width !== undefined ? { width } : {}),
              ...(height !== undefined ? { height } : {}),
              ...(mimeType ? { mimeType } : {}),
              ...(metadata ? { metadata } : {}),
              ...(resourceRef ? { resourceRef } : {}),
            },
          ]
        : [];
    });
  }

  return [];
}

function parseReadImageResourceRef(
  value: unknown,
): DocumentArchiveResourceRef | ResourceRef | undefined {
  return parseDocumentArchiveResourceRef(value) ?? (isResourceRef(value) ? value : undefined);
}

function readMode(value: unknown): ReadImageMode {
  return value === 'vision' ? 'vision' : 'metadata';
}

function readAnalysisKind(value: unknown): ReadImageAnalysisKind {
  return value === 'ocr' || value === 'panels' || value === 'storyboard' || value === 'custom'
    ? value
    : 'describe';
}

function readBoundedInteger(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : defaultValue;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createReadImagePerceptionCard(input: {
  readonly image: ReadImageResultImage;
  readonly loaded: LoadedImage;
  readonly createdAt: number;
  readonly index: number;
}): PerceptionCard {
  const mimeType =
    input.image.mimeType ??
    input.loaded.metadata.mimeType ??
    getMimeType(input.loaded.resolvedPath);
  const assetId = createReadImageAssetId(input.image, input.loaded.resolvedPath, input.index);
  const assetRef: PerceptualAssetRef = {
    assetId,
    uri: selectPerceptualAssetUri(input.image, input.loaded.resolvedPath),
    mimeType,
    ...(input.image.resourceRef && isResourceRef(input.image.resourceRef)
      ? { resourceRef: input.image.resourceRef }
      : {}),
    ...(input.image.resourceRef && isDocumentArchiveResourceRef(input.image.resourceRef)
      ? { documentResourceRef: input.image.resourceRef }
      : {}),
    ...(input.image.label ? { label: input.image.label } : {}),
  };

  return {
    version: 1,
    assetId,
    modality: 'image',
    createdAt: input.createdAt,
    layerStatus: {
      layer0: 'complete',
      layer1: 'skipped',
      layer2: 'complete',
    },
    structural: {
      format: inferImageFormat(mimeType, input.loaded.resolvedPath),
      mimeType,
      byteSize: input.image.byteSize,
      ...(input.image.width !== undefined ? { width: input.image.width } : {}),
      ...(input.image.height !== undefined ? { height: input.image.height } : {}),
    },
    perceptual: {
      keyframeRefs: [assetRef],
      thumbnailRef: assetRef,
    },
    cacheKey: readDocumentResourceDisplayId(input.image.resourceRef) ?? assetId,
  };
}

function createReadImageAssetId(
  image: ReadImageResultImage,
  resolvedPath: string,
  index: number,
): string {
  const source = image.sourceDocumentId
    ? `${image.sourceDocumentId}-${image.entryPath ?? image.alias ?? index + 1}`
    : (image.alias ?? path.basename(resolvedPath) ?? `image-${index + 1}`);
  return `read-image-${sanitizeAssetIdPart(source)}`;
}

function sanitizeAssetIdPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'asset';
}

function selectPerceptualAssetUri(image: ReadImageResultImage, resolvedPath: string): string {
  if (image.resourceRef && isDocumentArchiveResourceRef(image.resourceRef)) {
    return (
      image.resourceRef.entryPath ??
      image.alias ??
      image.sourceDocumentId ??
      `document-${image.resourceRef.source.format}`
    );
  }
  if (image.resourceRef && isResourceRef(image.resourceRef)) {
    return image.alias ?? image.label ?? image.resourceRef.id;
  }
  return resolvedPath;
}

function inferImageFormat(mimeType: string, filePath: string): string {
  if (mimeType.startsWith('image/')) {
    return mimeType.slice('image/'.length);
  }
  const extension = path.extname(filePath).replace(/^\./, '');
  return extension || 'image';
}
