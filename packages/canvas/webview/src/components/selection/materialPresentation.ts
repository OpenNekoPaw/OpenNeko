import type { CanvasMaterialGenerationContext, CanvasNode } from '@neko/canvas-domain';
import { validateContentLocator } from '@neko/content';
import { deriveCanvasMaterialOrigin, isCanvasGenerationEvidence } from '@neko/canvas-domain';

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
): CanvasMaterialPresentation | undefined {
  if (node.type === 'media' || node.type === 'file') {
    return resolveMaterialPresentation(node);
  }
  return undefined;
}

function resolveMaterialPresentation(
  node: Extract<CanvasNode, { type: 'media' | 'file' }>,
): CanvasMaterialPresentation | undefined {
  const data = node.data;
  const locator = validateContentLocator(data.contentLocator);
  if (!locator.ok) return undefined;
  const mediaType =
    node.type === 'media'
      ? node.data.mediaType
      : isPresentationMediaType(node.data.mediaKind)
        ? node.data.mediaKind
        : undefined;

  const source = deriveCanvasMaterialOrigin(locator.locator);
  if (source === 'referenced') {
    if (data.generation !== undefined) return undefined;
    return {
      source,
      ...(mediaType ? { mediaType } : {}),
      canPreview: true,
      canCopyToMediaLibrary: true,
    };
  }

  if (!isCanvasGenerationEvidence(data.generation)) return undefined;
  const context = data.generation.summary;

  return {
    source,
    ...(mediaType ? { mediaType } : {}),
    canPreview: true,
    canCopyToMediaLibrary: true,
    generation: projectGenerationContext(context),
  };
}

function projectGenerationContext(
  context: CanvasMaterialGenerationContext,
): CanvasMaterialGenerationPresentation {
  return { ...context };
}

function isPresentationMediaType(value: unknown): value is CanvasMaterialMediaType {
  return value === 'image' || value === 'video' || value === 'audio';
}
