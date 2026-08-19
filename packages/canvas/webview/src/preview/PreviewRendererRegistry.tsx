import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  getPreviewMediaType,
  parsePreviewMediaDescriptor,
  type PreviewMediaDescriptor,
} from '@neko/preview-domain';
import { LightweightPreview, type LightweightPreviewPlayback } from '@neko/preview-webview/root';
import type { DelegateAction } from '@neko/canvas-domain';
import type { ContentLocator } from '@neko/content';
import { dispatchPreviewDelegate } from './previewDelegates';
import type { PreviewPlaybackControl, PreviewSourceDescriptor } from './types';
import type { PlaybackSurfaceKind } from '../stores/playbackStore';
import { useOptionalCanvasHost } from '../host-runtime';
import { getLocale, t } from '../i18n';
import {
  readCanonicalContentLocator,
  readCanonicalContentLocatorKey,
} from '../utils/stableContentLocator';

export interface PreviewRendererProps {
  source: PreviewSourceDescriptor;
  delegateActions?: DelegateAction[];
  surfaceKind?: PlaybackSurfaceKind;
  playbackControl?: PreviewPlaybackControl;
  chrome?: 'contained' | 'full-bleed';
  audioLayout?: 'transport' | 'node-card';
}

export type PreviewRenderer = ComponentType<PreviewRendererProps>;
export type PreviewRendererRegistry = Partial<
  Record<PreviewSourceDescriptor['role'], PreviewRenderer>
>;

const PREVIEWABLE_ROLES = new Set<PreviewSourceDescriptor['role']>([
  'image',
  'source-image',
  'document-cover',
  'video-poster',
  'video-proxy',
  'audio-waveform',
  'generation-candidate',
]);

export function PreviewSurface(props: PreviewRendererProps): ReactNode {
  return PREVIEWABLE_ROLES.has(props.source.role) ? (
    <CanonicalPreviewRenderer key={props.source.id} {...props} />
  ) : (
    <FallbackPreviewRenderer {...props} />
  );
}

function CanonicalPreviewRenderer({
  source,
  chrome = 'contained',
  playbackControl,
}: PreviewRendererProps): ReactNode {
  const { descriptor, diagnostic } = useCanvasPreviewDescriptor(source);
  const contentKind = previewContentKind(source);
  const playback = useMemo<LightweightPreviewPlayback | undefined>(() => {
    if (!playbackControl || (contentKind !== 'audio' && contentKind !== 'video')) return undefined;
    return {
      requestId: playbackControl.requestId,
      state: playbackControl.state,
      ...(typeof playbackControl.startTimeSeconds === 'number'
        ? { startTimeSeconds: playbackControl.startTimeSeconds }
        : {}),
      ...(playbackControl.onTimeUpdate
        ? {
            onTimeUpdate: (currentTime: number, duration: number) =>
              playbackControl.onTimeUpdate?.({ sourceId: source.id, currentTime, duration }),
          }
        : {}),
      ...(playbackControl.onEnded
        ? {
            onEnded: (currentTime: number, duration: number) =>
              playbackControl.onEnded?.({
                sourceId: source.id,
                mediaType: contentKind,
                currentTime,
                duration,
              }),
          }
        : {}),
    };
  }, [contentKind, playbackControl, source.id]);

  return (
    <div
      className={previewFrameClassName(chrome)}
      data-preview-surface={contentKind}
      data-preview-chrome={chrome}
    >
      {diagnostic ? (
        <div
          className="flex h-full items-center justify-center px-3 text-center text-xs text-[var(--hostPort-errorForeground)]"
          role="alert"
        >
          {diagnostic}
        </div>
      ) : descriptor ? (
        <LightweightPreview descriptor={descriptor} locale={getLocale()} playback={playback} />
      ) : (
        <div
          className="flex h-full items-center justify-center text-xs text-[var(--node-fg-secondary)]"
          role="status"
        >
          {t('selection.imagePreviewLoading')}
        </div>
      )}
    </div>
  );
}

let previewRequestSequence = 0;

function useCanvasPreviewDescriptor(source: PreviewSourceDescriptor): {
  readonly descriptor?: PreviewMediaDescriptor;
  readonly diagnostic?: string;
} {
  const host = useOptionalCanvasHost();
  const locatorIdentity = readCanonicalContentLocatorKey(source.contentLocator);
  const locator = useMemo(
    () => readCanonicalContentLocator(source.contentLocator),
    [locatorIdentity],
  );
  const [descriptor, setDescriptor] = useState<PreviewMediaDescriptor>();
  const [diagnostic, setDiagnostic] = useState<string>();

  useEffect(() => {
    setDescriptor(undefined);
    setDiagnostic(undefined);
    if (!host || !locator || !source.nodeId || !source.outputId) {
      setDiagnostic(t('node.contentUnavailable'));
      return;
    }

    previewRequestSequence += 1;
    const requestId = `canvas-lightweight-preview-${previewRequestSequence.toString(36)}`;
    let descriptorId: string | undefined;
    let disposed = false;
    let unsubscribe: () => void = () => undefined;
    unsubscribe = host.subscribe((message) => {
      if (
        !isRecord(message) ||
        message['type'] !== 'preview:resourceResolved' ||
        message['requestId'] !== requestId
      )
        return;
      if (typeof message['error'] === 'string') {
        if (!disposed) setDiagnostic(message['error']);
        unsubscribe();
        return;
      }
      try {
        const next = parsePreviewMediaDescriptor(message['descriptor']);
        descriptorId = next.descriptorId;
        if (disposed) {
          host.postMessage({ type: 'preview:releaseResource', descriptorId: next.descriptorId });
        } else {
          setDescriptor(next);
        }
      } catch (error: unknown) {
        if (!disposed) setDiagnostic(describeError(error));
      }
      unsubscribe();
    });

    const contentKind = previewContentKind(source);
    const fileName = contentLocatorFileName(locator);
    host.postMessage({
      type: 'preview:resolveResource',
      requestId,
      nodeId: source.nodeId,
      outputId: source.outputId,
      contentLocator: locator,
      contentKind,
      mediaType: getPreviewMediaType(fileName) ?? defaultMediaType(contentKind),
      displayName: source.title || basename(fileName) || source.id,
    });

    return () => {
      disposed = true;
      unsubscribe();
      if (descriptorId) {
        host.postMessage({ type: 'preview:releaseResource', descriptorId });
      }
    };
  }, [host, locator, source.id, source.nodeId, source.outputId, source.role, source.title]);

  return { ...(descriptor ? { descriptor } : {}), ...(diagnostic ? { diagnostic } : {}) };
}

function previewContentKind(source: PreviewSourceDescriptor): 'image' | 'video' | 'audio' {
  if (source.role === 'video-proxy') return 'video';
  if (source.role === 'audio-waveform') return 'audio';
  return 'image';
}

function previewFrameClassName(chrome: NonNullable<PreviewRendererProps['chrome']>): string {
  return chrome === 'full-bleed'
    ? 'relative h-full min-h-0 w-full overflow-hidden'
    : 'relative h-full min-h-[80px] w-full overflow-hidden rounded border border-[var(--node-border)]';
}

function FallbackPreviewRenderer(props: PreviewRendererProps): ReactNode {
  const host = useOptionalCanvasHost();
  return (
    <div
      className={
        props.chrome === 'full-bleed'
          ? 'flex h-full min-h-0 w-full items-center justify-between gap-2 px-2 text-xs text-[var(--node-fg-secondary)]'
          : 'flex min-h-[72px] items-center justify-between gap-2 rounded border border-dashed border-[var(--node-border)] px-2 text-xs text-[var(--node-fg-secondary)]'
      }
      data-preview-surface="fallback"
    >
      <span className="min-w-0 truncate">{props.source.title ?? props.source.id}</span>
      {props.delegateActions?.[0] ? (
        <button
          type="button"
          className="flex-shrink-0 rounded border border-[var(--node-border)] px-2 py-1"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            dispatchPreviewDelegate(host, {
              action: props.delegateActions?.[0] as DelegateAction,
              asset: props.source.asset,
            });
          }}
        >
          Open
        </button>
      ) : null}
    </div>
  );
}

function contentLocatorFileName(locator: ContentLocator): string {
  return locator.selector?.kind === 'entry' ? locator.selector.path : locator.file.path;
}

function defaultMediaType(kind: 'image' | 'video' | 'audio'): string {
  if (kind === 'image') return 'image/png';
  if (kind === 'video') return 'video/mp4';
  return 'audio/mpeg';
}

function basename(value: string): string | undefined {
  const normalized = value.replaceAll('\\', '/').replace(/\/+$/u, '');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).trim();
  return name || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
