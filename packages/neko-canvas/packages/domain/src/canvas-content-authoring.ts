import { planCanvasNodeCreation, type CanvasData, type ContentLocator } from '@neko/shared';

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);
const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.webm']);
const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav']);

export function projectContentLocatorToCanvas(input: {
  readonly canvas: CanvasData;
  readonly locator: ContentLocator;
  readonly position?: { readonly x: number; readonly y: number };
}): CanvasData {
  if (input.locator.kind !== 'workspace-file') {
    throw new Error('Canvas authoring does not support this ContentLocator kind.');
  }
  const title = basename(input.locator.path);
  const extension = extensionOf(input.locator.path);
  const position = input.position ?? {
    x: 100 + (input.canvas.nodes.length % 4) * 40,
    y: 100 + Math.floor(input.canvas.nodes.length / 4) * 40,
  };
  if (extension === '.nkc') {
    return planCanvasNodeCreation(
      { canvasData: input.canvas },
      {
        type: 'canvas-embed',
        position,
        data: {
          canvasPath: input.locator.path,
          canvasTitle: title,
        },
      },
    ).canvasData;
  }
  const mediaType = resolveMediaType(extension);
  if (mediaType) {
    return planCanvasNodeCreation(
      { canvasData: input.canvas },
      {
        type: 'media',
        position,
        data: {
          assetPath: input.locator.path,
          contentLocator: input.locator,
          mediaType,
          title,
          provenance: {
            source: 'content-locator',
            locatorKind: input.locator.kind,
          },
        },
      },
    ).canvasData;
  }
  return planCanvasNodeCreation(
    { canvasData: input.canvas },
    {
      type: 'file',
      position,
      data: {
        path: input.locator.path,
        title,
        contentLocator: input.locator,
        provenance: {
          source: 'content-locator',
          locatorKind: input.locator.kind,
        },
      },
    },
  ).canvasData;
}

function resolveMediaType(extension: string): 'image' | 'video' | 'audio' | undefined {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  return undefined;
}

function basename(locatorPath: string): string {
  return locatorPath.slice(locatorPath.lastIndexOf('/') + 1);
}

function extensionOf(locatorPath: string): string {
  const name = basename(locatorPath);
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index).toLocaleLowerCase();
}
