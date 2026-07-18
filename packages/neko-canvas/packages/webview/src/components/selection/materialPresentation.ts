import type { CanvasMaterialGenerationContext, CanvasNode } from '@neko/shared';
import {
  isCanvasMaterialGenerationContext,
  isCanvasStoryboardPromptState,
  isResourceRef,
} from '@neko/shared';

export type CanvasMaterialSource = 'referenced' | 'generated';
export type CanvasMaterialMediaType = 'image' | 'video' | 'audio';

export interface CanvasMaterialGenerationPresentation {
  readonly prompt?: string;
  readonly model?: string;
  readonly generatedAt?: string;
  readonly aspectRatio?: string;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: number;
  readonly targetNodeId?: string;
}

export interface CanvasMaterialPresentation {
  readonly source: CanvasMaterialSource;
  readonly mediaType?: CanvasMaterialMediaType;
  readonly canPreview: boolean;
  readonly canPromoteToAssetLibrary: boolean;
  readonly generation?: CanvasMaterialGenerationPresentation;
}

export function resolveCanvasMaterialPresentation(
  node: CanvasNode,
  allNodes: readonly CanvasNode[],
): CanvasMaterialPresentation | undefined {
  if (node.type === 'media') {
    return resolveMediaMaterialPresentation(node, allNodes);
  }
  if (node.type === 'shot') {
    return resolveShotMaterialPresentation(node);
  }
  return undefined;
}

function resolveMediaMaterialPresentation(
  node: Extract<CanvasNode, { type: 'media' }>,
  allNodes: readonly CanvasNode[],
): CanvasMaterialPresentation | undefined {
  const data = node.data;
  const hasIdentity = Boolean(
    data.assetPath || data.runtimeAssetPath || data.resourceRef || data.documentResourceRef,
  );
  if (!hasIdentity) return undefined;

  const context = isCanvasMaterialGenerationContext(data.generationContext)
    ? data.generationContext
    : undefined;
  const generated = Boolean(
    context ||
    isStableGeneratedAssetPath(data.assetPath) ||
    data.resourceRef?.kind === 'generated' ||
    readString(data.provenance, 'projectionId')?.startsWith('generated-output:'),
  );
  const sourceNodeId = context?.sourceNodeId;
  const targetNodeId =
    sourceNodeId && data.mediaType !== 'audio'
      ? allNodes.find((candidate) => candidate.id === sourceNodeId && candidate.type === 'shot')?.id
      : undefined;

  return {
    source: generated ? 'generated' : 'referenced',
    mediaType: data.mediaType,
    canPreview: true,
    canPromoteToAssetLibrary: true,
    ...(generated
      ? {
          generation: {
            ...projectGenerationContext(context),
            ...(targetNodeId ? { targetNodeId } : {}),
          },
        }
      : {}),
  };
}

function resolveShotMaterialPresentation(
  node: Extract<CanvasNode, { type: 'shot' }>,
): CanvasMaterialPresentation | undefined {
  const image = readRecord(node.data.generatedAsset);
  const video = readRecord(node.data.generatedVideoAsset);
  const asset = hasMaterialIdentity(image) ? image : hasMaterialIdentity(video) ? video : undefined;
  if (!asset) return undefined;
  const mediaType: CanvasMaterialMediaType = asset === image ? 'image' : 'video';
  const promptState = isCanvasStoryboardPromptState(node.data.storyboardPrompt)
    ? node.data.storyboardPrompt
    : undefined;
  const promptDocument =
    mediaType === 'image'
      ? promptState?.promptBlocks?.imagePromptDocument
      : promptState?.promptBlocks?.videoPromptDocument;
  const prompt = readString(asset, 'prompt') ?? promptDocument?.text;
  const model = readString(asset, 'model') ?? promptState?.generationParams?.modelId;
  const resourceRef = asset['resourceRef'];
  const path = readString(asset, 'path');
  const hasIdentity = Boolean(path || isResourceRef(resourceRef));

  return {
    source: 'generated',
    mediaType,
    canPreview: hasIdentity,
    canPromoteToAssetLibrary: hasIdentity,
    generation: {
      ...(prompt ? { prompt } : {}),
      ...(model ? { model } : {}),
      ...(readString(asset, 'generatedAt')
        ? { generatedAt: readString(asset, 'generatedAt') }
        : {}),
      ...(readString(asset, 'ratio')
        ? { aspectRatio: readString(asset, 'ratio') }
        : promptState?.generationParams?.aspectRatio
          ? { aspectRatio: promptState.generationParams.aspectRatio }
          : {}),
      ...(readPositiveNumber(asset, 'width') ? { width: readPositiveNumber(asset, 'width') } : {}),
      ...(readPositiveNumber(asset, 'height')
        ? { height: readPositiveNumber(asset, 'height') }
        : {}),
      ...(readPositiveNumber(asset, 'duration')
        ? { duration: readPositiveNumber(asset, 'duration') }
        : {}),
      targetNodeId: node.id,
    },
  };
}

function projectGenerationContext(
  context: CanvasMaterialGenerationContext | undefined,
): CanvasMaterialGenerationPresentation {
  return context ? { ...context } : {};
}

function hasMaterialIdentity(value: Record<string, unknown>): boolean {
  return Boolean(readString(value, 'path') || isResourceRef(value['resourceRef']));
}

function isStableGeneratedAssetPath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  return /^(?:\$\{[A-Z][A-Z0-9_]*\}\/)?neko\/generated\//.test(normalized);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown, key: string): string | undefined {
  const candidate = readRecord(value)[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function readPositiveNumber(value: unknown, key: string): number | undefined {
  const candidate = readRecord(value)[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : undefined;
}
