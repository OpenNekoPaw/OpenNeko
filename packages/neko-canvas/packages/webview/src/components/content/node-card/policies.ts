import type { CanvasNode, CanvasPreviewRole, NodePreviewDescriptor } from '@neko/shared';
import { summarizeReferencesFromCanvasNode } from '@neko/shared';
import type {
  CardActionDescriptor,
  CardBadge,
  CardPreviewSource,
  NodeCardPolicy,
  NodeCardPolicyRegistry,
} from './types';
import {
  capitalize,
  createAssetPreviewDescriptor,
  createSubtitle,
  createTextExcerpt,
  extractFileBasename,
  isSafeWebviewUrl,
  readDocumentResourceEntryPath,
  readDocumentResourceRef,
  readDocumentResourceStatus,
  readPersistentAssetPath,
  readReferenceImageResourceRef,
  readReferenceResourceRef,
  readResourceRef,
  readNumber,
  readRecord,
  readString,
  resolvePlacementTitle,
} from './utils';
import { isImagePreviewUrl } from '../../../preview';
import { t } from '../../../i18n';
import { resolveCanvasStatusLabel } from '../../../i18n/canvasValueLabels';
import { resolveResourceRefDisplayName } from '../../../utils/resourceDisplayName';

const REMOVE_ACTION: CardActionDescriptor = {
  id: 'remove',
  label: 'action.remove',
  icon: 'x',
  position: 'top-right',
  visibleWhen: 'hover',
  danger: true,
};

const DEFAULT_ACTIONS: readonly CardActionDescriptor[] = [REMOVE_ACTION];

export const defaultCardPolicy: NodeCardPolicy = {
  nodeType: 'annotation',
  resolvePreviewSource: (node) => ({
    renderForm: 'icon',
    icon: getDefaultIcon(node),
  }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ?? node.preview?.title ?? capitalize(node.type),
  resolveSubtitle: (node) => node.preview?.subtitle,
  resolveBadges: (node) => normalizePreviewBadges(node.preview?.badges),
  resolveActions: () => DEFAULT_ACTIONS,
};

export const mediaCardPolicy: NodeCardPolicy = {
  nodeType: 'media',
  resolvePreviewSource: (node) => {
    const data = readRecord(node.data);
    const mediaType = readString(data, 'mediaType');
    if (mediaType === 'audio') {
      return { renderForm: 'waveform', waveformStyle: 'bars' };
    }

    const posterPath =
      readString(data, 'runtimeThumbnailPath') ?? readString(data, 'thumbnailPath');
    const assetPath = readPersistentAssetPath(node);
    const sourcePath =
      mediaType === 'video'
        ? posterPath
        : (posterPath ?? readString(data, 'runtimeAssetPath') ?? readString(data, 'assetPath'));
    const title = resolveMediaTitle(node);
    const role: CanvasPreviewRole = mediaType === 'video' ? 'video-poster' : 'image';
    const documentResourceRef = readDocumentResourceRef(node);
    const resourceRef = readResourceRef(node);
    const stableRuntimePath =
      mediaType === 'image' && documentResourceRef && sourcePath && isSafeWebviewUrl(sourcePath)
        ? sourcePath
        : undefined;
    const stablePosterPath =
      mediaType === 'video' && sourcePath && isImagePreviewUrl(sourcePath) ? sourcePath : undefined;
    const source = createAssetPreviewDescriptor({
      id: `node-card:${node.id}:media`,
      role,
      path:
        mediaType === 'video'
          ? assetPath
          : stableRuntimePath || stablePosterPath
            ? undefined
            : sourcePath,
      stablePath:
        stableRuntimePath ??
        stablePosterPath ??
        (mediaType === 'video' ? readString(data, 'thumbnailPath') : (posterPath ?? assetPath)),
      mediaType,
      title,
      metadata:
        documentResourceRef || resourceRef
          ? {
              ...(documentResourceRef ? { documentResourceRef } : {}),
              ...(resourceRef ? { resourceRef } : {}),
            }
          : undefined,
    });

    if (mediaType === 'video') {
      return { renderForm: 'media-poster', aspectRatio: '3/2', source };
    }
    return { renderForm: 'asset-thumbnail', aspectRatio: '3/2', source };
  },
  resolveTitle: (node, parent) => resolvePlacementTitle(node, parent) ?? resolveMediaTitle(node),
  resolveSubtitle: (node) =>
    readDocumentResourceStatus(node)?.message ?? readString(node.data, 'mediaType'),
  resolveBadges: (node) => [
    ...normalizePreviewBadges(node.preview?.badges),
    ...(readDocumentResourceStatus(node) ? [{ label: 'Cache', tone: 'warning' as const }] : []),
    ...referenceSummaryBadges(node),
  ],
  resolveActions: () => [
    REMOVE_ACTION,
    {
      id: 'open-media-preview',
      label: 'action.openPreview',
      icon: 'play',
      position: 'overlay-center',
      visibleWhen: 'hover',
      enabledWhen: 'has-asset',
    },
  ],
};

export const shotCardPolicy: NodeCardPolicy = {
  nodeType: 'shot',
  resolvePreviewSource: resolveShotPreviewSource,
  resolveTitle: (node, parent) => resolvePlacementTitle(node, parent) ?? resolveShotTitle(node),
  resolveSubtitle: (node) => createSubtitle(readRecord(node.data)['visualDescription']),
  resolveBadges: (node) => {
    const status = readString(node.data, 'generationStatus');
    return [
      ...(status
        ? [{ label: resolveCanvasStatusLabel(status), tone: badgeToneForGenerationStatus(status) }]
        : []),
      ...referenceSummaryBadges(node),
    ];
  },
  resolveActions: () => [
    REMOVE_ACTION,
    {
      id: 'generate',
      label: 'action.generate',
      icon: 'sparkles',
      position: 'bottom',
      visibleWhen: 'hover',
      enabledWhen: 'not-generating',
    },
    {
      id: 'open-content-overlay',
      label: 'action.open',
      icon: 'maximize',
      position: 'overlay-center',
      visibleWhen: 'hover',
      enabledWhen: 'has-preview',
    },
  ],
};

export function resolveShotPreviewSource(node: CanvasNode): CardPreviewSource {
  return createShotPreviewSource(node, 'image');
}

export function resolveShotReviewPreviewSource(node: CanvasNode): CardPreviewSource {
  return createShotPreviewSource(node, 'source-image');
}

function createShotPreviewSource(
  node: CanvasNode,
  referenceRole: Extract<CanvasPreviewRole, 'image' | 'source-image'>,
): CardPreviewSource {
  const selected = findSelectedGenerationCandidate(node);
  const generatedImage = readString(node.data, 'generatedImage');
  const generatedAssetPath = readString(readRecord(node.data)['generatedAsset'], 'path');
  const runtimeReferenceImagePath = readString(node.data, 'runtimeReferenceImagePath');
  const referenceImagePath = readString(node.data, 'referenceImagePath');
  const sourceRole: CanvasPreviewRole =
    selected || generatedImage || generatedAssetPath ? 'generation-candidate' : referenceRole;
  const referenceImageResourceRef =
    selected || generatedImage || generatedAssetPath
      ? undefined
      : readReferenceImageResourceRef(node);
  const referenceResourceRef =
    selected || generatedImage || generatedAssetPath ? undefined : readReferenceResourceRef(node);
  const sourcePath =
    selected?.dataUrl ??
    generatedImage ??
    generatedAssetPath ??
    runtimeReferenceImagePath ??
    (referenceImageResourceRef ? undefined : referenceImagePath);
  const resolverPath =
    referenceImageResourceRef || referenceResourceRef
      ? undefined
      : (sourcePath ?? referenceImagePath);
  const directVariantPath =
    sourcePath && (selected || generatedImage || generatedAssetPath || isSafeWebviewUrl(sourcePath))
      ? sourcePath
      : undefined;
  const variants = directVariantPath
    ? [
        {
          id:
            selected?.id ??
            (generatedImage
              ? 'generated-image'
              : generatedAssetPath
                ? 'generated-asset'
                : 'reference-image'),
          role: sourceRole,
          sourcePath: directVariantPath,
          selected: true,
        },
      ]
    : undefined;

  return {
    renderForm: 'asset-thumbnail',
    aspectRatio: '3/2',
    source: createAssetPreviewDescriptor({
      id: `node-card:${node.id}:shot`,
      role: sourceRole,
      path: directVariantPath ? undefined : resolverPath,
      mediaType: referenceImageResourceRef || referenceResourceRef ? 'image' : undefined,
      title: resolveShotTitle(node),
      metadata:
        referenceImageResourceRef || referenceResourceRef
          ? {
              ...(referenceImageResourceRef
                ? { documentResourceRef: referenceImageResourceRef }
                : {}),
              ...(referenceResourceRef ? { resourceRef: referenceResourceRef } : {}),
            }
          : undefined,
      variants,
    }),
  };
}

const annotationCardPolicy: NodeCardPolicy = {
  nodeType: 'annotation',
  resolvePreviewSource: (node) => ({
    renderForm: 'text',
    textExcerpt: createTextExcerpt(readRecord(node.data)['content']),
  }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ??
    createTextExcerpt(readRecord(node.data)['content'], 30) ??
    t('node.note'),
  resolveSubtitle: () => undefined,
  resolveActions: () => DEFAULT_ACTIONS,
};

export const textCardPolicy: NodeCardPolicy = {
  nodeType: 'text',
  resolvePreviewSource: (node) => ({
    renderForm: 'text',
    textExcerpt: createTextExcerpt(readRecord(node.data)['content']),
  }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ??
    createTextExcerpt(readRecord(node.data)['content'], 30) ??
    t('node.newText'),
  resolveSubtitle: () => undefined,
  resolveActions: () => DEFAULT_ACTIONS,
};

const containerSummaryCardPolicy: NodeCardPolicy = {
  nodeType: 'group',
  resolvePreviewSource: () => ({ renderForm: 'icon', icon: 'C' }),
  resolveTitle: (node, parent) =>
    resolvePlacementTitle(node, parent) ?? node.preview?.title ?? resolveContainerTitle(node),
  resolveSubtitle: (node) => node.preview?.subtitle,
  resolveBadges: (node) => normalizePreviewBadges(node.preview?.badges),
  resolveActions: () => DEFAULT_ACTIONS,
};

const galleryCardPolicy: NodeCardPolicy = {
  ...containerSummaryCardPolicy,
  nodeType: 'gallery',
  resolveBadges: (node) => [
    ...normalizePreviewBadges(node.preview?.badges),
    ...referenceSummaryBadges(node),
  ],
};

const generatedAssetCardPolicy: NodeCardPolicy = {
  ...containerSummaryCardPolicy,
  nodeType: 'generated-asset',
  resolveBadges: (node) => [
    ...normalizePreviewBadges(node.preview?.badges),
    ...referenceSummaryBadges(node),
  ],
};

function referenceSummaryBadges(node: CanvasNode): readonly CardBadge[] {
  const summary = summarizeReferencesFromCanvasNode(node);
  if (summary.total === 0) return [];
  return [
    {
      label: `Refs ${summary.total}`,
      tone: summary.blockedCount > 0 ? 'error' : summary.warningCount > 0 ? 'warning' : 'info',
    },
  ];
}

export function createBuiltInNodeCardPolicyRegistry(): NodeCardPolicyRegistry {
  return {
    media: mediaCardPolicy,
    shot: shotCardPolicy,
    annotation: annotationCardPolicy,
    text: textCardPolicy,
    scene: { ...containerSummaryCardPolicy, nodeType: 'scene' },
    gallery: galleryCardPolicy,
    group: { ...containerSummaryCardPolicy, nodeType: 'group' },
    artboard: { ...containerSummaryCardPolicy, nodeType: 'artboard' },
    table: { ...containerSummaryCardPolicy, nodeType: 'table' },
    'generated-asset': generatedAssetCardPolicy,
  };
}

export function getNodeCardPolicy(
  registry: NodeCardPolicyRegistry,
  node: CanvasNode,
): NodeCardPolicy {
  return registry[node.type] ?? defaultCardPolicy;
}

interface SelectedGenerationCandidate {
  id: string;
  dataUrl?: string;
}

function findSelectedGenerationCandidate(
  node: CanvasNode,
): SelectedGenerationCandidate | undefined {
  const history = readRecord(node.data)['generationHistory'];
  if (!Array.isArray(history)) {
    return undefined;
  }

  const selected = history.find(
    (candidate): candidate is Record<string, unknown> =>
      isRecord(candidate) && candidate['selected'] === true,
  );
  if (!selected) {
    return undefined;
  }

  const id = typeof selected['id'] === 'string' ? selected['id'] : 'selected';
  const dataUrl = typeof selected['dataUrl'] === 'string' ? selected['dataUrl'] : undefined;
  return { id, dataUrl };
}

function resolveMediaTitle(node: CanvasNode): string {
  const authoredTitle = readString(node.data, 'title')?.trim();
  if (authoredTitle) {
    return authoredTitle;
  }
  const resourceRef = readResourceRef(node);
  if (resourceRef) {
    return resolveResourceRefDisplayName(resourceRef);
  }
  if (node.preview?.title) {
    return extractFileBasename(node.preview.title);
  }

  const assetPath = readPersistentAssetPath(node) ?? readDocumentResourceEntryPath(node);
  if (assetPath) {
    return extractFileBasename(assetPath);
  }

  const mediaType = readString(node.data, 'mediaType');
  if (mediaType === 'video') return t('media.emptyVideo');
  if (mediaType === 'audio') return t('media.emptyAudio');
  return t('media.emptyImage');
}

function resolveShotTitle(node: CanvasNode): string {
  if (node.preview?.title) {
    return node.preview.title;
  }

  const shotNumber = readNumber(node.data, 'shotNumber');
  return typeof shotNumber === 'number'
    ? t('scene.shotBadgeTitle', { number: shotNumber })
    : t('node.shot');
}

function resolveContainerTitle(node: CanvasNode): string {
  switch (node.type) {
    case 'scene':
      return readString(node.data, 'sceneTitle') ?? t('node.sceneGroup');
    case 'gallery':
      return readString(node.data, 'characterName') ?? t('node.gallery');
    case 'table':
      return readString(node.data, 'label') ?? t('node.table');
    case 'group':
      return readString(node.data, 'label') ?? t('node.group');
    case 'artboard':
      return readString(node.data, 'title') ?? t('node.artboard');
    default:
      return capitalize(node.type);
  }
}

function normalizePreviewBadges(badges: NodePreviewDescriptor['badges'] | undefined): CardBadge[] {
  if (!Array.isArray(badges)) {
    return [];
  }

  return badges.map((badge) => ({
    label: String(badge.label),
    tone: normalizeBadgeTone(badge.tone),
  }));
}

function normalizeBadgeTone(tone: unknown): CardBadge['tone'] {
  switch (tone) {
    case 'success':
    case 'warning':
    case 'info':
    case 'neutral':
      return tone;
    case 'danger':
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

function badgeToneForGenerationStatus(status: string): CardBadge['tone'] {
  switch (status) {
    case 'done':
      return 'success';
    case 'error':
      return 'error';
    case 'generating':
      return 'warning';
    default:
      return 'neutral';
  }
}

function getDefaultIcon(node: CanvasNode): string {
  switch (node.type) {
    case 'media':
      return 'M';
    case 'shot':
      return 'S';
    case 'scene':
      return 'SC';
    case 'gallery':
      return 'G';
    case 'table':
      return 'T';
    default:
      return 'N';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
