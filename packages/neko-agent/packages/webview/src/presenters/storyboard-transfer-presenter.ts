import {
  projectStoryboardTableToCutPayload as projectSemanticStoryboardTableToCutPayload,
  validateCanonicalStoryboardTable,
  type DocumentArchiveResourceRef,
  type StoryboardMediaRef,
  type StoryboardTable,
} from '@neko/shared';
import type {
  PluginTransferAssetRef,
  PluginTransferPayload,
  RequestCanvasAuthoringHandoffWebviewMessage,
} from '@neko-agent/types';
import type { StoryboardScene } from '@/components/ChatView/MediaPreview';
import type {
  ResolvedCompositeMedia,
  ResolvedCompositeSection,
  StoryboardTableRichData,
} from './composite-content-presenter';

type StoryboardCanvasAuthoringHandoff = Omit<
  RequestCanvasAuthoringHandoffWebviewMessage,
  'type' | 'requestId' | 'conversationId'
>;

export function projectCanonicalStoryboardCanvasAuthoringHandoff(
  storyboard: StoryboardTable,
): StoryboardCanvasAuthoringHandoff | null {
  if (!validateCanonicalStoryboardTable(storyboard).ok) return null;

  const shotCount = storyboard.scenes.reduce((count, scene) => count + scene.shots.length, 0);
  return {
    sourceKind: 'structured-content',
    sourceFormat: 'composite-artifact',
    content: `Canonical Storyboard: ${storyboard.title} (${storyboard.scenes.length} scenes, ${shotCount} shots)`,
    title: storyboard.title,
    canonicalStoryboard: storyboard,
    userIntent:
      'Create Canvas storyboard production nodes from this canonical Storyboard without Markdown reconstruction or asset flattening.',
    targetHints: {
      declaredProfileHint: 'storyboard',
      operationHint: 'canvas.createStoryboardFromMarkdown',
    },
  };
}

export function projectStoryboardTableCanvasAuthoringHandoff(
  data: StoryboardTableRichData,
): StoryboardCanvasAuthoringHandoff | null {
  return data.storyboardTable
    ? projectCanonicalStoryboardCanvasAuthoringHandoff(data.storyboardTable)
    : null;
}

export function projectStoryboardScenesAssetBatch(
  scenes: readonly StoryboardScene[],
): PluginTransferPayload | null {
  const assets = scenes.flatMap((scene) =>
    scene.shots.flatMap((shot) => {
      const portablePath = readPortableTransferPath(shot.localPath);
      return portablePath
        ? [
            {
              path: portablePath,
              mediaType: 'image' as const,
              name: `scene-${scene.sceneIndex}-shot-${shot.shotIndex}`,
            },
          ]
        : [];
    }),
  );
  return assets.length > 0 ? { kind: 'assetBatch', assets } : null;
}

export function projectStoryboardTableAssetBatch(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  const assets = data.sections.flatMap((section) =>
    section.media.flatMap((media, mediaIndex) => {
      const asset = projectCompositeMediaAssetRef(media, section, mediaIndex);
      return asset ? [asset] : [];
    }),
  );
  return assets.length > 0 ? { kind: 'assetBatch', assets } : null;
}

export function projectStoryboardTableCutTimelinePayload(
  data: StoryboardTableRichData,
): PluginTransferPayload | null {
  if (data.storyboardTable) {
    const storyboard = projectSemanticStoryboardTableToCutPayload(data.storyboardTable, {
      resolveImagePath: ({ mediaRef }) => resolveStoryboardMediaPath(data, mediaRef),
    });
    return storyboard ? { kind: 'cutStoryboard', storyboard } : null;
  }
  return null;
}

function resolveStoryboardMediaPath(
  data: StoryboardTableRichData,
  mediaRef: StoryboardMediaRef,
): string | undefined {
  const media = resolveStoryboardMedia(data, mediaRef);
  return getLocalImageMediaPath(media);
}

function resolveStoryboardMedia(
  data: StoryboardTableRichData,
  mediaRef: StoryboardMediaRef,
): ResolvedCompositeMedia | undefined {
  if (mediaRef.locator.type === 'tool-result') {
    const locator = mediaRef.locator;
    const exact = findStoryboardMedia(data, (media) => {
      return media.toolCallId === locator.toolCallId && media.assetIndex === locator.assetIndex;
    });
    if (exact) return exact;
  }

  return findStoryboardMedia(data, (media) => doesStoryboardMediaMatchRef(media, mediaRef));
}

function findStoryboardMedia(
  data: StoryboardTableRichData,
  predicate: (media: ResolvedCompositeMedia) => boolean,
): ResolvedCompositeMedia | undefined {
  for (const section of data.sections) {
    for (const media of section.media) {
      if (predicate(media)) return media;
    }
  }
  return undefined;
}

function doesStoryboardMediaMatchRef(
  media: ResolvedCompositeMedia,
  mediaRef: StoryboardMediaRef,
): boolean {
  const locator = mediaRef.locator;
  return (
    media.id.includes(mediaRef.refId) ||
    media.assetId === mediaRef.refId ||
    media.stableUri === mediaRef.refId ||
    (locator.type === 'asset' &&
      (media.assetId === locator.assetId || media.stableUri === locator.uri))
  );
}

function getLocalImageMediaPath(media: ResolvedCompositeMedia | undefined): string | undefined {
  return (
    (media?.stableUri && isCanvasReferenceImagePathUsable(media.stableUri)
      ? media.stableUri
      : undefined) ?? (media?.src && isCanvasPortableImageUrl(media.src) ? media.src : undefined)
  );
}

function isCanvasPortableImageUrl(value: string): boolean {
  return value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://');
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function projectCompositeMediaAssetRef(
  media: ResolvedCompositeMedia,
  section: ResolvedCompositeSection,
  mediaIndex: number,
): PluginTransferAssetRef | null {
  if (media.type === 'unknown') return null;
  const portablePath =
    media.stableUri && isCanvasReferenceImagePathUsable(media.stableUri)
      ? media.stableUri
      : undefined;
  if (!portablePath && !media.resourceRef) return null;
  return {
    ...(media.resourceRef ? {} : { path: portablePath }),
    mediaType: media.type,
    name:
      media.caption ??
      media.label ??
      section.heading ??
      `section-${section.index + 1}-asset-${mediaIndex + 1}`,
    ...(media.resourceRef
      ? { documentResourceRef: toStableDocumentArchiveResourceRef(media.resourceRef) }
      : {}),
  };
}

function readPortableTransferPath(value: string | undefined): string | undefined {
  return value && isCanvasReferenceImagePathUsable(value) ? value : undefined;
}

function isCanvasReferenceImagePathUsable(value: string): boolean {
  if (!value || value.startsWith('blob:') || value.startsWith('file:')) return false;
  if (value.startsWith('generated-assets/')) return false;
  if (/^(?:p|page|image|img|panel)[_-]?\d{1,4}$/i.test(value.trim())) return false;
  if (/^p\d{1,4}$/i.test(value.trim())) return false;
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.neko/.cache/')) return false;
  if (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://')) {
    return true;
  }
  if (value.startsWith('${')) return true;
  return !isAbsolutePath(value);
}

function toStableDocumentArchiveResourceRef(
  ref: DocumentArchiveResourceRef | undefined,
): DocumentArchiveResourceRef | undefined {
  if (!ref) return undefined;
  return ref;
}
