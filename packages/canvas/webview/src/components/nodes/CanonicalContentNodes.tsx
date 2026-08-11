import { contentLocatorKey, type ContentLocator } from '@neko/content';
import type {
  CanvasTextFilePreviewDiagnosticCode,
  CanvasTextFilePreviewKind,
  CanvasTextFilePreviewResult,
  FileCanvasNode,
  JobCanvasNode,
  MarkdownCanvasNode,
  MediaCanvasNode,
} from '@neko/canvas-domain';
import { resolveCanvasTextFilePreviewKind } from '@neko/canvas-domain';
import { FileIcon, toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import { MarkdownDocumentView } from '@neko/ui/markdown';
import type { MilkdownRichSurfaceState } from '@neko/markdown/rich-surface';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import { useOptionalCanvasHost } from '../../host-runtime';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type {
  PreviewPlaybackInteractionHandler,
  PreviewPlaybackInteractionState,
  PreviewSourceDescriptor,
} from '../../preview/types';
import { BaseNode } from './BaseNode';
import type { NodeRendererCommonProps } from './nodeRendererTypes';

type CanonicalNodeProps<TNode> = NodeRendererCommonProps & {
  readonly node: TNode;
  readonly onOpen?: (locator: ContentLocator) => void;
};

type CanvasMediaType = NonNullable<MediaCanvasNode['data']['mediaType']>;
type CanvasFilePreviewPresentation =
  | CanvasTextFilePreviewResult
  | { readonly status: 'loading' }
  | {
      readonly status: 'local-error';
      readonly code: CanvasTextFilePreviewDiagnosticCode;
    };
export type MediaPlaybackOwner = 'idle' | 'hover' | 'manual-playing' | 'manual-paused';
export type MediaPlaybackInteraction =
  'pointer-enter' | 'pointer-leave' | PreviewPlaybackInteractionState;

const CanvasMilkdownRichSurface = lazy(async () => {
  const module = await import('@neko/markdown/rich-surface');
  return { default: module.MilkdownRichSurface };
});

export function transitionMediaPlaybackOwner(
  owner: MediaPlaybackOwner,
  interaction: MediaPlaybackInteraction,
): MediaPlaybackOwner {
  switch (interaction) {
    case 'pointer-enter':
      return owner === 'idle' ? 'hover' : owner;
    case 'pointer-leave':
      return owner === 'hover' ? 'idle' : owner;
    case 'playing':
      return 'manual-playing';
    case 'paused':
      return 'manual-paused';
    case 'ended':
      return 'idle';
  }
}

export function MarkdownNode({
  node,
  isSelected,
  onUpdateData,
  ...baseProps
}: CanonicalNodeProps<MarkdownCanvasNode>) {
  const [isEditing, setIsEditing] = useState(false);
  const [richState, setRichState] = useState<MilkdownRichSurfaceState>('loading');
  const [richFailure, setRichFailure] = useState<string>();

  useEffect(() => {
    if (!isSelected) setIsEditing(false);
  }, [isSelected]);

  const editActive = isSelected && isEditing;
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      onActivate={() => setIsEditing(true)}
    >
      <div
        className="canvas-markdown-node"
        data-editing={editActive ? 'true' : 'false'}
        onMouseDown={editActive ? (event) => event.stopPropagation() : undefined}
        onClick={editActive ? (event) => event.stopPropagation() : undefined}
        onDoubleClick={editActive ? (event) => event.stopPropagation() : undefined}
        onKeyDownCapture={
          editActive
            ? (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                setIsEditing(false);
              }
            : undefined
        }
      >
        {node.data.title ? (
          <div className="canvas-markdown-node__title" title={node.data.title}>
            {node.data.title}
          </div>
        ) : null}
        {editActive ? (
          <div className="canvas-markdown-node__editor">
            <Suspense
              fallback={
                <div className="canvas-markdown-node__status" role="status">
                  {t('node.markdownRichLoading')}
                </div>
              }
            >
              <CanvasMilkdownRichSurface
                value={node.data.content}
                ariaLabel={t('node.markdownInput')}
                readOnly={false}
                className="canvas-markdown-rich-surface"
                mountClassName="canvas-markdown-rich-surface__mount"
                onChange={(content) => onUpdateData?.(node.id, { ...node.data, content })}
                onActions={(actions) => actions?.focus()}
                onStateChange={(nextState, failure) => {
                  setRichState(nextState);
                  setRichFailure(failure);
                }}
              />
            </Suspense>
            {richState === 'unavailable' || richState === 'error' ? (
              <div className="canvas-markdown-node__status" role="alert" title={richFailure}>
                {richState === 'unavailable'
                  ? t('node.markdownRichUnavailable')
                  : t('node.markdownRichFailed')}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="canvas-markdown-node__preview">
            <MarkdownDocumentView
              value={node.data.content}
              className="canvas-markdown-node__document"
            />
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export function MediaNode({ node, isSelected, ...baseProps }: CanonicalNodeProps<MediaCanvasNode>) {
  const host = useOptionalCanvasHost();
  const source = node.data.runtimeAssetPath || node.data.assetPath;
  const contentLocator = node.data.contentLocator;
  const mediaType = node.data.mediaType ?? 'image';
  const previewRole =
    mediaType === 'image'
      ? 'image'
      : host?.supportsMessage('media:probe')
        ? mediaType === 'audio'
          ? 'audio-waveform'
          : 'video-proxy'
        : mediaType === 'video'
          ? 'video-poster'
          : 'unavailable';
  const title =
    resolveCanvasNodeName([node.data.title, node.data.assetPath]) ||
    resolveMediaTypeLabel(mediaType);
  const hoverSequence = useRef(0);
  const [hoverRequestId, setHoverRequestId] = useState<string>();
  const [playbackOwner, setPlaybackOwner] = useState<MediaPlaybackOwner>('idle');
  const [manualPlaybackTime, setManualPlaybackTime] = useState(0);
  const playbackControl = useMemo(() => {
    if (mediaType === 'image' || !hoverRequestId) return undefined;
    return {
      requestId: hoverRequestId,
      state:
        playbackOwner === 'hover' || playbackOwner === 'manual-playing'
          ? ('playing' as const)
          : playbackOwner === 'manual-paused'
            ? ('paused' as const)
            : ('stopped' as const),
      startTimeSeconds:
        playbackOwner === 'manual-playing' || playbackOwner === 'manual-paused'
          ? manualPlaybackTime
          : 0,
      persistence: 'transient' as const,
    };
  }, [hoverRequestId, manualPlaybackTime, mediaType, playbackOwner]);
  const handlePlaybackInteraction: PreviewPlaybackInteractionHandler = (state, currentTime) => {
    hoverSequence.current += 1;
    setHoverRequestId(`canvas-manual:${node.id}:${hoverSequence.current}`);
    setManualPlaybackTime(currentTime);
    setPlaybackOwner((owner) => transitionMediaPlaybackOwner(owner, state));
  };
  const previewSource = useMemo<PreviewSourceDescriptor>(
    () => ({
      id: `canvas-node:${node.id}`,
      role: previewRole,
      title: node.data.title,
      asset: {
        kind: 'asset-identity' as const,
        ...(source ? { path: source } : {}),
        mediaType,
      },
      ...(contentLocator ? { contentLocator } : {}),
      metadata: {
        ...(node.data.duration ? { duration: node.data.duration } : {}),
      },
    }),
    [mediaType, contentLocator, node.data.duration, node.data.title, node.id, previewRole, source],
  );
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      nodeLabel={{
        icon: (
          <span
            aria-hidden="true"
            className={toCodiconClassName(resolveMediaTypeIcon(mediaType))}
          />
        ),
        text: title,
      }}
    >
      <div
        data-testid="canvas-media-node"
        data-media-type={mediaType}
        data-playback-state={
          mediaType === 'image'
            ? undefined
            : playbackOwner === 'hover' || playbackOwner === 'manual-playing'
              ? 'playing'
              : playbackOwner === 'manual-paused'
                ? 'paused'
                : 'stopped'
        }
        data-playback-owner={mediaType === 'image' ? undefined : playbackOwner}
        className={
          mediaType === 'audio'
            ? 'canvas-audio-node flex h-full min-h-0 flex-col'
            : 'flex h-full min-h-0 flex-col'
        }
        onPointerEnter={() => {
          if (mediaType === 'image' || !contentLocator) return;
          if (playbackOwner !== 'idle') return;
          hoverSequence.current += 1;
          setHoverRequestId(`canvas-hover:${node.id}:${hoverSequence.current}`);
          setPlaybackOwner((owner) => transitionMediaPlaybackOwner(owner, 'pointer-enter'));
        }}
        onPointerLeave={() => {
          if (mediaType === 'image') return;
          setPlaybackOwner((owner) => transitionMediaPlaybackOwner(owner, 'pointer-leave'));
        }}
      >
        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{ background: 'var(--node-surface)' }}
        >
          {!contentLocator ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-xs"
              style={{ color: 'var(--node-fg-secondary)' }}
              role="status"
            >
              <strong style={{ color: 'var(--hostPort-errorForeground)' }}>
                {t('node.contentUnavailable')}
              </strong>
              <span>{t('node.contentLocatorMissing')}</span>
            </div>
          ) : (
            <PreviewSurface
              source={previewSource}
              surfaceKind="inline"
              chrome="full-bleed"
              audioLayout={mediaType === 'audio' ? 'node-card' : undefined}
              playbackControl={playbackControl}
              onPlaybackInteraction={handlePlaybackInteraction}
            />
          )}
        </div>
      </div>
    </BaseNode>
  );
}

export function JobNode({ node, isSelected, ...baseProps }: CanonicalNodeProps<JobCanvasNode>) {
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
    >
      <div className="flex h-full flex-col gap-2 p-3 text-xs">
        <div className="flex items-center gap-2">
          <strong className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--node-fg)' }}>
            {node.data.title}
          </strong>
          <span
            className="rounded px-1.5 py-0.5"
            style={{ background: 'var(--node-surface)', color: 'var(--node-fg-secondary)' }}
          >
            {resolveJobStatusLabel(node.data.status)}
          </span>
        </div>
        {node.data.objective ? (
          <p
            className="line-clamp-3 whitespace-pre-wrap"
            style={{ color: 'var(--node-fg-secondary)' }}
          >
            {node.data.objective}
          </p>
        ) : null}
        <div className="mt-auto flex justify-between" style={{ color: 'var(--node-fg-secondary)' }}>
          <span>
            {node.data.jobRef.kind}:{node.data.jobRef.jobId}
          </span>
        </div>
        {node.data.diagnostic ? (
          <div style={{ color: 'var(--hostPort-errorForeground)' }}>{node.data.diagnostic}</div>
        ) : null}
      </div>
    </BaseNode>
  );
}

function resolveMediaTypeLabel(mediaType: CanvasMediaType): string {
  switch (mediaType) {
    case 'image':
      return t('media.type.image');
    case 'audio':
      return t('media.type.audio');
    case 'video':
      return t('media.type.video');
  }
}

function resolveMediaTypeIcon(mediaType: CanvasMediaType): CodiconName {
  switch (mediaType) {
    case 'image':
      return 'file-media';
    case 'audio':
      return 'music';
    case 'video':
      return 'play';
  }
}

function resolveJobStatusLabel(status: JobCanvasNode['data']['status']): string {
  switch (status) {
    case 'draft':
      return t('job.status.draft');
    case 'queued':
      return t('job.status.queued');
    case 'running':
      return t('job.status.running');
    case 'waiting':
      return t('job.status.waiting');
    case 'completed':
      return t('job.status.completed');
    case 'failed':
      return t('job.status.failed');
    case 'cancelled':
      return t('job.status.cancelled');
  }
}

export function FileNode({
  node,
  isSelected,
  onOpen,
  ...baseProps
}: CanonicalNodeProps<FileCanvasNode>) {
  const fileName = resolveCanvasFileName(node.data);
  const contentLocator = node.data.contentLocator;
  const contentLocatorIdentity = contentLocator ? contentLocatorKey(contentLocator) : undefined;
  const contentLocatorRef = useRef(contentLocator);
  contentLocatorRef.current = contentLocator;
  const host = useOptionalCanvasHost();
  const eligibleKind = resolveCanvasTextFilePreviewKind({
    path: node.data.path || node.data.title,
    ...(node.data.mediaType ? { mediaType: node.data.mediaType } : {}),
  });
  const [preview, setPreview] = useState<CanvasFilePreviewPresentation>();

  useEffect(() => {
    const currentContentLocator = contentLocatorRef.current;
    if (!host || !currentContentLocator || !eligibleKind) {
      setPreview(undefined);
      return;
    }
    let active = true;
    setPreview({ status: 'loading' });
    void host.readTextFilePreview(node.id, currentContentLocator).then(
      (result) => {
        if (active) setPreview(result);
      },
      () => {
        if (!active) return;
        setPreview({ status: 'local-error', code: 'canvas-text-preview-read-failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [contentLocatorIdentity, eligibleKind, host, node.id]);

  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      onActivate={contentLocator && onOpen ? () => onOpen(contentLocator) : undefined}
      nodeLabel={{
        icon: <FileIcon size={13} strokeWidth={1.6} aria-hidden="true" />,
        text: fileName,
      }}
    >
      <div
        className="canvas-file-node"
        data-canvas-content-kind="file"
        data-text-preview-status={preview?.status}
        data-text-preview-kind={preview?.status === 'ready' ? preview.kind : undefined}
      >
        <CanvasFileNodeContent contentLocator={contentLocator} preview={preview} />
      </div>
    </BaseNode>
  );
}

function CanvasFileNodeContent({
  contentLocator,
  preview,
}: {
  readonly contentLocator: ContentLocator | undefined;
  readonly preview: CanvasFilePreviewPresentation | undefined;
}) {
  if (!contentLocator) {
    return <CanvasFileIconState diagnostic={t('node.contentUnavailable')} />;
  }
  if (!preview || preview.status === 'unsupported') return <CanvasFileIconState />;
  if (preview.status === 'loading') {
    return (
      <div className="canvas-file-node__state" role="status">
        <span className="canvas-file-node__activity" aria-hidden="true" />
        <span>{t('node.textPreviewLoading')}</span>
      </div>
    );
  }
  if (preview.status === 'local-error') {
    return (
      <div className="canvas-file-node__state canvas-file-node__state--error" role="status">
        <FileIcon size={24} strokeWidth={1.4} aria-hidden="true" />
        <span>{resolveCanvasTextPreviewDiagnostic(preview.code)}</span>
      </div>
    );
  }
  if (preview.status === 'unavailable') {
    return (
      <div className="canvas-file-node__state canvas-file-node__state--error" role="status">
        <FileIcon size={24} strokeWidth={1.4} aria-hidden="true" />
        <span>{resolveCanvasTextPreviewDiagnostic(preview.diagnostic.code)}</span>
      </div>
    );
  }
  if (preview.empty) {
    return (
      <div className="canvas-file-node__state" role="status">
        <FileIcon size={24} strokeWidth={1.4} aria-hidden="true" />
        <span>{t('node.textPreviewEmpty')}</span>
      </div>
    );
  }
  return (
    <div className="canvas-file-node__preview">
      <div className="canvas-file-node__format" aria-label={resolvePreviewKindLabel(preview.kind)}>
        {resolvePreviewKindLabel(preview.kind)}
      </div>
      <div className="canvas-file-node__scroll">
        {preview.kind === 'markdown' ? (
          <MarkdownDocumentView
            value={preview.text}
            className="canvas-file-node__markdown canvas-markdown-node__document"
          />
        ) : (
          <pre className="canvas-file-node__text">{preview.text}</pre>
        )}
      </div>
      {preview.truncated ? (
        <div className="canvas-file-node__truncated" role="status">
          {t('node.textPreviewTruncated')}
        </div>
      ) : null}
    </div>
  );
}

function CanvasFileIconState({ diagnostic }: { readonly diagnostic?: string }) {
  return (
    <div className="canvas-file-node__content">
      <span style={{ color: 'var(--node-fg-secondary)' }}>
        <FileIcon size={36} strokeWidth={1.4} aria-hidden="true" />
      </span>
      {diagnostic ? (
        <div className="canvas-file-node__missing" role="status">
          {diagnostic}
        </div>
      ) : null}
    </div>
  );
}

function resolvePreviewKindLabel(kind: CanvasTextFilePreviewKind): string {
  switch (kind) {
    case 'json':
      return 'JSON';
    case 'markdown':
      return 'Markdown';
    case 'plain':
      return t('node.textPreviewPlain');
  }
}

function resolveCanvasTextPreviewDiagnostic(code: CanvasTextFilePreviewDiagnosticCode): string {
  switch (code) {
    case 'canvas-text-preview-invalid-json':
      return t('node.textPreviewInvalidJson');
    case 'canvas-text-preview-invalid-utf8':
      return t('node.textPreviewInvalidUtf8');
    case 'canvas-text-preview-missing':
      return t('node.textPreviewMissing');
    case 'canvas-text-preview-too-large':
      return t('node.textPreviewTooLarge');
    case 'canvas-text-preview-unauthorized':
      return t('node.textPreviewUnauthorized');
    case 'canvas-text-preview-stale-node':
      return t('node.textPreviewStale');
    case 'canvas-text-preview-read-failed':
    case 'canvas-text-preview-unavailable':
      return t('node.textPreviewUnavailable');
  }
}

export function resolveCanvasFileName(
  data: Pick<FileCanvasNode['data'], 'path' | 'title'>,
): string {
  return resolveCanvasNodeName([data.path, data.title]) || t('node.file');
}

export function resolveCanvasNodeName(candidates: readonly (string | undefined)[]): string {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    const segments = value.replaceAll('\\', '/').split('/').filter(Boolean);
    const name = segments.at(-1);
    if (name) return name;
  }
  return '';
}
