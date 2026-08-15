import {
  isCanvasDurableMaterialContentLocator,
  resolveCanvasTextFilePreviewKind,
  selectedCanvasGenerationOutput,
  type CanvasGenerationOutputBinding,
  type CanvasNode,
} from '@neko/canvas-domain';
import { validateContentLocator } from '@neko/content';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@neko/ui/icons';
import { IconButton } from '@neko/ui/primitives';
import {
  getPreviewMediaType,
  parsePreviewMediaDescriptor,
  type PreviewMediaDescriptor,
} from '@neko/preview-domain';
import { LightweightPreview } from '@neko/preview-webview/root';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getLocale, t } from '../../i18n';
import { useOptionalCanvasHost } from '../../host-runtime';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type { PreviewSourceDescriptor } from '../../preview/types';

type CanvasFullscreenPreviewKind = 'image' | 'video' | 'audio' | 'text';
export type CanvasFullscreenPreviewSource = PreviewSourceDescriptor & {
  readonly previewKind: CanvasFullscreenPreviewKind;
};
type CanvasFullscreenPreviewItems = readonly [
  CanvasFullscreenPreviewSource,
  ...CanvasFullscreenPreviewSource[],
];

export interface CanvasFullscreenPreviewRequest {
  readonly nodeId: string;
  readonly items: CanvasFullscreenPreviewItems;
  readonly initialIndex: number;
}

export function resolveCanvasFullscreenPreviewRequest(
  node: CanvasNode,
  preferredOutputId?: string,
): CanvasFullscreenPreviewRequest | undefined {
  if (node.type === 'generation') {
    const preferredOutput = preferredOutputId
      ? node.data.outputs.find((output) => output.outputId === preferredOutputId)
      : undefined;
    const activeOutput = preferredOutput ?? selectedCanvasGenerationOutput(node.data);
    if (!activeOutput) return undefined;
    const outputs = node.data.outputs.filter(
      (output) =>
        output.kind === activeOutput.kind && output.jobRef.jobId === activeOutput.jobRef.jobId,
    );
    const items = outputs.map((output) => generationPreviewSource(node, output));
    const first = items[0];
    if (!first) return undefined;
    const initialIndex = outputs.findIndex((output) => output.outputId === activeOutput.outputId);
    if (initialIndex < 0) {
      throw new Error(
        `Canvas Image preview output "${activeOutput.outputId}" is not in its Job group.`,
      );
    }
    return {
      nodeId: node.id,
      items: [first, ...items.slice(1)],
      initialIndex,
    };
  }

  if (
    node.type === 'media' &&
    isFullscreenPreviewKind(node.data.mediaType) &&
    node.data.contentLocator
  ) {
    const validation = validateContentLocator(node.data.contentLocator);
    if (!validation.ok || !isCanvasDurableMaterialContentLocator(validation.locator)) {
      return undefined;
    }
    const previewKind = node.data.mediaType;
    return {
      nodeId: node.id,
      items: [
        {
          id: `canvas-fullscreen:media:${node.id}`,
          role: previewRole(previewKind),
          previewKind,
          title: node.data.title || basename(node.data.assetPath) || t(`node.${previewKind}`),
          asset: {
            kind: 'asset-identity',
            mediaType: previewKind,
            ...(node.data.runtimeAssetPath || node.data.assetPath
              ? { path: node.data.runtimeAssetPath || node.data.assetPath }
              : {}),
          },
          contentLocator: validation.locator,
          metadata: {},
        },
      ],
      initialIndex: 0,
    };
  }

  if (node.type === 'file' && node.data.contentLocator) {
    const validation = validateContentLocator(node.data.contentLocator);
    if (!validation.ok || !isCanvasDurableMaterialContentLocator(validation.locator)) {
      return undefined;
    }
    const fileName = node.data.path || node.data.title;
    const previewKind = resolveFileFullscreenPreviewKind(
      node.data.mediaKind,
      fileName,
      node.data.mediaType,
    );
    if (!previewKind) return undefined;
    return {
      nodeId: node.id,
      items: [
        {
          id: `canvas-fullscreen:file:${node.id}`,
          role: previewRole(previewKind),
          previewKind,
          title: basename(node.data.title) || basename(node.data.path) || t(`node.${previewKind}`),
          asset: { kind: 'asset-identity', mediaType: previewKind },
          contentLocator: validation.locator,
          metadata: {},
        },
      ],
      initialIndex: 0,
    };
  }

  return undefined;
}

export function CanvasFullscreenPreviewOverlay({
  request,
  onClose,
}: {
  readonly request: CanvasFullscreenPreviewRequest;
  readonly onClose: () => void;
}): ReactNode {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(request.initialIndex);
  const activeSource = fullscreenPreviewItemAt(request.items, activeIndex);
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex < request.items.length - 1;

  const selectIndex = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(request.items.length - 1, index));
      setActiveIndex(nextIndex);
    },
    [request.items.length],
  );

  useEffect(() => {
    setActiveIndex(request.initialIndex);
  }, [request]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      let handled = true;
      switch (event.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (hasPrevious) selectIndex(activeIndex - 1);
          break;
        case 'ArrowRight':
          if (hasNext) selectIndex(activeIndex + 1);
          break;
        default:
          handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeIndex, hasNext, hasPrevious, onClose, selectIndex]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    overlayRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="canvas-image-preview-overlay"
      data-canvas-image-preview="true"
      data-image-preview-active-index={activeIndex}
      data-image-preview-count={request.items.length}
      role="dialog"
      aria-modal="true"
      aria-label={t('selection.mediaPreview')}
      tabIndex={-1}
      {...getKeyboardBoundaryMetadata({
        scope: 'modal',
        ownerId: 'canvas-preview-resource',
        priority: 0,
        ownedKeys: ['Escape', 'ArrowLeft', 'ArrowRight'],
      })}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="canvas-image-preview-overlay__toolbar">
        <span className="canvas-image-preview-overlay__title">{activeSource.title}</span>
        <div className="canvas-image-preview-overlay__toolbar-actions">
          {request.items.length > 1 ? (
            <span className="canvas-image-preview-overlay__counter">
              {t('selection.imagePreviewCounter', {
                index: activeIndex + 1,
                count: request.items.length,
              })}
            </span>
          ) : null}
          <IconButton
            size="sm"
            variant="ghost"
            icon={<CloseIcon size={16} />}
            label={t('selection.closeImagePreview')}
            title={t('selection.closeImagePreview')}
            onClick={onClose}
          />
        </div>
      </div>
      <div
        className="canvas-image-preview-overlay__content"
        data-preview-kind={activeSource.previewKind}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onWheel={(event) => {
          event.stopPropagation();
        }}
      >
        <CanvasFullscreenPreviewBody request={request} source={activeSource} />
        {request.items.length > 1 ? (
          <>
            <IconButton
              className="canvas-image-preview-overlay__navigate canvas-image-preview-overlay__navigate--previous"
              size="md"
              variant="ghost"
              icon={<ChevronLeftIcon size={20} />}
              label={t('selection.imagePreviewPrevious')}
              title={t('selection.imagePreviewPrevious')}
              disabled={!hasPrevious}
              onClick={() => selectIndex(activeIndex - 1)}
            />
            <IconButton
              className="canvas-image-preview-overlay__navigate canvas-image-preview-overlay__navigate--next"
              size="md"
              variant="ghost"
              icon={<ChevronRightIcon size={20} />}
              label={t('selection.imagePreviewNext')}
              title={t('selection.imagePreviewNext')}
              disabled={!hasNext}
              onClick={() => selectIndex(activeIndex + 1)}
            />
          </>
        ) : null}
      </div>
      {request.items.length > 1 ? (
        <div className="canvas-image-preview-overlay__footer">
          <div className="canvas-image-preview-overlay__thumbnails" role="group">
            {request.items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="canvas-image-preview-overlay__thumbnail"
                data-active={index === activeIndex ? 'true' : 'false'}
                aria-pressed={index === activeIndex}
                aria-label={t('selection.imagePreviewSelect', { index: index + 1 })}
                onClick={() => selectIndex(index)}
              >
                <PreviewSurface source={item} surfaceKind="inline" chrome="full-bleed" />
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function generationPreviewSource(
  node: Extract<CanvasNode, { readonly type: 'generation' }>,
  output: CanvasGenerationOutputBinding,
): CanvasFullscreenPreviewSource {
  const previewKind = output.kind === 'prompt' ? 'text' : output.kind;
  return {
    id: `canvas-fullscreen:generation:${node.id}:${output.outputId}`,
    role: previewRole(previewKind),
    previewKind,
    title: node.data.recipe.prompt || t(`node.${output.kind}`),
    asset: { kind: 'asset-identity', mediaType: previewKind },
    contentLocator: output.locator,
    metadata: {},
  };
}

let fullscreenPreviewRequestSequence = 0;

function CanvasFullscreenPreviewBody({
  request,
  source,
}: {
  readonly request: CanvasFullscreenPreviewRequest;
  readonly source: CanvasFullscreenPreviewSource;
}): ReactNode {
  const host = useOptionalCanvasHost();
  const [descriptor, setDescriptor] = useState<PreviewMediaDescriptor>();
  const [diagnostic, setDiagnostic] = useState<string>();

  useEffect(() => {
    const hostPort = host;
    const locator = source.contentLocator;
    setDescriptor(undefined);
    setDiagnostic(undefined);
    if (!hostPort || !locator) {
      setDiagnostic(t('selection.imagePreviewUnavailable'));
      return;
    }

    fullscreenPreviewRequestSequence += 1;
    const requestId = `canvas-preview-resource-${fullscreenPreviewRequestSequence.toString(36)}`;
    let resolvedDescriptorId: string | undefined;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    unsubscribe = hostPort.subscribe((message) => {
      if (
        !isRecord(message) ||
        message['type'] !== 'preview:resourceResolved' ||
        message['requestId'] !== requestId
      ) {
        return;
      }
      if (typeof message['error'] === 'string') {
        if (!disposed) setDiagnostic(message['error']);
        unsubscribe();
        return;
      }
      try {
        const nextDescriptor = parsePreviewMediaDescriptor(message['descriptor']);
        resolvedDescriptorId = nextDescriptor.descriptorId;
        if (disposed) {
          hostPort.postMessage({
            type: 'preview:releaseResource',
            descriptorId: nextDescriptor.descriptorId,
          });
        } else {
          setDescriptor(nextDescriptor);
        }
      } catch (error: unknown) {
        if (!disposed) setDiagnostic(describeError(error));
      }
      unsubscribe();
    });

    const fileName = contentLocatorFileName(locator);
    hostPort.postMessage({
      type: 'preview:resolveResource',
      requestId,
      nodeId: request.nodeId,
      outputId: locator.kind === 'generated-output' ? locator.outputId : request.nodeId,
      contentLocator: locator,
      contentKind: source.previewKind,
      mediaType: getPreviewMediaType(fileName) ?? defaultMediaType(source.previewKind),
      displayName: source.title || basename(fileName) || t(`node.${source.previewKind}`),
    });

    return () => {
      disposed = true;
      if (resolvedDescriptorId) {
        unsubscribe();
        hostPort.postMessage({
          type: 'preview:releaseResource',
          descriptorId: resolvedDescriptorId,
        });
      }
    };
  }, [host, request.nodeId, source]);

  if (diagnostic) {
    return (
      <div className="canvas-image-preview-overlay__diagnostic" role="alert">
        {diagnostic}
      </div>
    );
  }
  if (!descriptor) {
    return (
      <div className="canvas-image-preview-overlay__diagnostic" role="status">
        {t('selection.imagePreviewLoading')}
      </div>
    );
  }
  return <LightweightPreview descriptor={descriptor} locale={getLocale()} controlDensity="full" />;
}

function fullscreenPreviewItemAt(
  items: CanvasFullscreenPreviewItems,
  index: number,
): CanvasFullscreenPreviewSource {
  const item = items[index];
  if (!item) throw new Error(`Canvas preview resource index ${index} is out of bounds.`);
  return item;
}

function isFullscreenPreviewKind(value: unknown): value is CanvasFullscreenPreviewKind {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'text';
}

function previewRole(kind: CanvasFullscreenPreviewKind): PreviewSourceDescriptor['role'] {
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video-proxy';
  return kind === 'audio' ? 'audio-waveform' : 'text';
}

function defaultMediaType(kind: CanvasFullscreenPreviewKind): string {
  if (kind === 'image') return 'image/png';
  if (kind === 'video') return 'video/mp4';
  return kind === 'audio' ? 'audio/mpeg' : 'text/plain';
}

function resolveFileFullscreenPreviewKind(
  mediaKind: unknown,
  fileName: string,
  mediaType: string | undefined,
): CanvasFullscreenPreviewKind | undefined {
  if (mediaKind === 'image' || mediaKind === 'video' || mediaKind === 'audio') return mediaKind;
  if (resolveCanvasTextFilePreviewKind({ path: fileName, ...(mediaType ? { mediaType } : {}) })) {
    return 'text';
  }
  return undefined;
}

function basename(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/u, '');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).trim();
  return name || undefined;
}

function contentLocatorFileName(
  locator: NonNullable<CanvasFullscreenPreviewSource['contentLocator']>,
): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return locator.path;
    case 'media-library':
      return locator.relativePath;
    case 'document-entry':
      return locator.entryPath;
    case 'package-resource':
      return locator.resourcePath;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
