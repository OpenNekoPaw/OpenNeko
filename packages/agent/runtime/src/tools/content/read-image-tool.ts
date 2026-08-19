import * as path from 'path';
import {
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES,
} from '@neko/agent-contracts';
import { CONTENT_LOCATOR_SCHEMA } from './content-locator-schema';
import { createTool } from '../base';
import { getMimeType } from '@neko/media';
import {
  contentLocatorKey,
  isContentRepresentationHandle,
  validateContentLocator,
  type ContentLocator,
  type ContentRepresentationHandle,
} from '@neko/content';
import {
  TOOL_NAMES_SYSTEM,
  type PerceptionCard,
  type Tool,
  type ToolParameterProperty,
  type ToolResult,
} from '@neko/agent-contracts';
import { type PerceptualAssetRef } from '@neko/media';
import { hashStableValue } from '@neko/shared';
import type { ImageMetadata } from '@neko/content/document';
import {
  loadAgentImageAsset,
  type AgentImageAssetAccessRuntime,
  type AgentImageAssetDiagnostic,
  type AgentImageAssetResult,
  type AgentImageAssetStatus,
} from './image-asset-source';

const DEFAULT_READ_IMAGE_LIMIT = 4;
const MAX_READ_IMAGE_LIMIT = AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES;
export const MAX_READ_IMAGE_BYTES = AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES;

export interface ReadImageToolDeps {
  readonly contentAccessRuntime?: ReadImageContentAccessRuntime;
  readonly now?: () => number;
}

export type ReadImageContentAccessRuntime = AgentImageAssetAccessRuntime;
export type ReadImageProviderAssetResult = AgentImageAssetResult;
export type ReadImageContentStatus = AgentImageAssetStatus;
export type ReadImageDiagnostic = AgentImageAssetDiagnostic;

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
  readonly contentLocator?: ContentLocator;
  readonly representationHandle?: ContentRepresentationHandle;
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
  readonly contentLocator?: ContentLocator;
}

export interface ReadImageResultData {
  readonly mode: ReadImageMode;
  readonly analysis?: ReadImageAnalysisKind;
  readonly images: readonly ReadImageResultImage[];
  readonly imageCount: number;
  readonly imagesTruncated: boolean;
}

export type ReadImageMode = 'metadata';
export type ReadImageAnalysisKind = 'describe' | 'ocr' | 'panels' | 'storyboard' | 'custom';

interface LoadedImage {
  readonly input: ReadImageInputImage;
  readonly resolvedPath: string;
  readonly metadata: ImageMetadata;
}

const REPRESENTATION_HANDLE_SCHEMA: ToolParameterProperty = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['content-representation-handle'] },
    id: { type: 'string', minLength: 1 },
  },
  required: ['kind', 'id'],
  additionalProperties: false,
};

export function createReadImageTool(deps: ReadImageToolDeps = {}): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.READ_IMAGE,
    description:
      'Read local image metadata and expose selected images as native multimodal Agent resources. ' +
      'Use exact content bindings resolved by the Agent content protocol. ' +
      'Do not pass document positions, entry paths, cache paths, Webview URIs, system paths, or whole document sources. ' +
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
            'Structured image bindings resolved from conversation-scoped image references.',
          items: {
            type: 'object',
            anyOf: [
              {
                type: 'object',
                required: ['contentLocator'],
                properties: { contentLocator: CONTENT_LOCATOR_SCHEMA },
              },
              {
                type: 'object',
                required: ['representationHandle'],
                properties: { representationHandle: REPRESENTATION_HANDLE_SCHEMA },
              },
            ],
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
              contentLocator: CONTENT_LOCATOR_SCHEMA,
              representationHandle: REPRESENTATION_HANDLE_SCHEMA,
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
  let mode: ReadImageMode;
  let analysis: ReadImageAnalysisKind;
  try {
    mode = readMode(args['mode']);
    analysis = readAnalysisKind(args['analysis']);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
  const maxImages = readBoundedInteger(
    args['max_images'],
    DEFAULT_READ_IMAGE_LIMIT,
    1,
    MAX_READ_IMAGE_LIMIT,
  );
  let images: ReadImageInputImage[];
  try {
    images = readInputImages(args);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (images.length === 0) {
    return {
      success: false,
      error: 'Missing required image binding from the owning Agent content protocol.',
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
      portableForTransfer: image.input.contentLocator
        ? true
        : (image.input.portableForTransfer ?? false),
      ...(!image.input.contentLocator && image.input.nonPortableReason
        ? { nonPortableReason: image.input.nonPortableReason }
        : {}),
      ...(image.input.label ? { label: image.input.label } : {}),
      ...(image.metadata.width !== undefined ? { width: image.metadata.width } : {}),
      ...(image.metadata.height !== undefined ? { height: image.metadata.height } : {}),
      ...(image.metadata.mimeType ? { mimeType: image.metadata.mimeType } : {}),
      byteSize: image.metadata.byteSize,
      ...(image.input.metadata ? { metadata: image.input.metadata } : {}),
      ...(image.input.contentLocator ? { contentLocator: image.input.contentLocator } : {}),
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
  const loaded = await loadAgentImageAsset({
    binding: input,
    contentAccessRuntime: deps.contentAccessRuntime,
    maxBytes: MAX_READ_IMAGE_BYTES,
    operationName: 'ReadImage',
  });
  const resolvedPath = input.representationHandle
    ? `data:${loaded.metadata.mimeType};base64,${Buffer.from(loaded.bytes).toString('base64')}`
    : input.contentLocator
      ? `content:${contentLocatorKey(input.contentLocator)}`
      : undefined;
  if (!resolvedPath) {
    throw new Error('ReadImage loaded an image without a canonical source identity.');
  }
  return {
    input,
    resolvedPath,
    metadata: loaded.metadata,
  };
}

function readInputImages(args: Record<string, unknown>): ReadImageInputImage[] {
  const structured = args['images'];
  if (Array.isArray(structured)) {
    return structured.flatMap((item, index) => {
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
      const contentLocator = parseContentLocator(item['contentLocator'], index);
      const representationHandle = isContentRepresentationHandle(item['representationHandle'])
        ? item['representationHandle']
        : undefined;
      return contentLocator || representationHandle
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
              ...(contentLocator ? { contentLocator } : {}),
              ...(representationHandle ? { representationHandle } : {}),
            },
          ]
        : [];
    });
  }

  return [];
}

function parseContentLocator(value: unknown, imageIndex: number): ContentLocator | undefined {
  if (value === undefined) return undefined;
  const result = validateContentLocator(value);
  if (result.ok) return result.locator;
  throw new Error(
    `ReadImage images[${imageIndex}].contentLocator is invalid: ${result.diagnostics
      .map((diagnostic) => diagnostic.message)
      .join(' ')}`,
  );
}

function readMode(value: unknown): ReadImageMode {
  if (value === undefined || value === 'metadata') return 'metadata';
  throw new Error('ReadImage mode must be "metadata".');
}

function readAnalysisKind(value: unknown): ReadImageAnalysisKind {
  if (value === undefined || value === 'describe') return 'describe';
  if (value === 'ocr' || value === 'panels' || value === 'storyboard' || value === 'custom') {
    return value;
  }
  throw new Error('ReadImage analysis is invalid.');
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
    ...(input.image.contentLocator ? { contentLocator: input.image.contentLocator } : {}),
    ...(input.loaded.input.representationHandle
      ? { representationHandle: input.loaded.input.representationHandle }
      : {}),
    ...(input.image.label ? { label: input.image.label } : {}),
  };

  return {
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
    cacheKey:
      input.loaded.input.representationHandle?.id ??
      (input.image.contentLocator ? contentLocatorKey(input.image.contentLocator) : assetId),
  };
}

function createReadImageAssetId(
  image: ReadImageResultImage,
  resolvedPath: string,
  index: number,
): string {
  const label =
    image.label ??
    image.entryPath ??
    image.alias ??
    path.basename(resolvedPath) ??
    `image-${index + 1}`;
  const identity = image.contentLocator ?? resolvedPath;
  return `read-image-${sanitizeAssetIdPart(label)}-${hashStableValue(identity)}`;
}

function sanitizeAssetIdPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'asset';
}

function selectPerceptualAssetUri(image: ReadImageResultImage, resolvedPath: string): string {
  if (image.contentLocator) return `content:${contentLocatorKey(image.contentLocator)}`;
  return resolvedPath;
}

function inferImageFormat(mimeType: string, filePath: string): string {
  if (mimeType.startsWith('image/')) {
    return mimeType.slice('image/'.length);
  }
  const extension = path.extname(filePath).replace(/^\./, '');
  return extension || 'image';
}
