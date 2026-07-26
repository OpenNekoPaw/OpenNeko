import type { CanvasMaterialGenerationContext, CanvasNode } from '@neko/shared';
import { isCanvasMaterialGenerationContext } from '@neko/shared';

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
  readonly canCopyToMediaLibrary: boolean;
  readonly generation?: CanvasMaterialGenerationPresentation;
}

export function resolveCanvasMaterialPresentation(
  node: CanvasNode,
  allNodes: readonly CanvasNode[],
): CanvasMaterialPresentation | undefined {
  if (node.type === 'media') {
    return resolveMediaMaterialPresentation(node, allNodes);
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
  const targetNodeId = sourceNodeId
    ? allNodes.find((candidate) => candidate.id === sourceNodeId)?.id
    : node.id;

  return {
    source: generated ? 'generated' : 'referenced',
    mediaType: data.mediaType,
    canPreview: true,
    canCopyToMediaLibrary: true,
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

function projectGenerationContext(
  context: CanvasMaterialGenerationContext | undefined,
): CanvasMaterialGenerationPresentation {
  return context ? { ...context } : {};
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
