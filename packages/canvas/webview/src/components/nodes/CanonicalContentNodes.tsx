import { contentLocatorKey, type ContentLocator } from '@neko/content-domain';
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import { useOptionalCanvasHost } from '../../host-runtime';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type { PreviewSourceDescriptor } from '../../preview/types';
import { BaseNode } from './BaseNode';
import type { NodeRendererCommonProps } from './nodeRendererTypes';
import {
  readCanonicalContentLocator,
  readCanonicalContentLocatorKey,
} from '../../utils/stableContentLocator';

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
export function MarkdownNode({
  node,
  isSelected,
  onUpdateData: _onUpdateData,
  onMarkdownEdit,
  ...baseProps
}: CanonicalNodeProps<MarkdownCanvasNode>) {
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      onActivate={onMarkdownEdit ? () => onMarkdownEdit(node.id) : undefined}
    >
      <div className="canvas-markdown-node">
        {node.data.title ? (
          <div className="canvas-markdown-node__title" title={node.data.title}>
            {node.data.title}
          </div>
        ) : null}
        <div className="canvas-markdown-node__preview" data-canvas-wheel-owner="content">
          <MarkdownDocumentView
            value={node.data.content}
            className="canvas-markdown-node__document"
          />
        </div>
      </div>
    </BaseNode>
  );
}

export function MediaNode({
  node,
  isSelected,
  onFullscreenPreview,
  ...baseProps
}: CanonicalNodeProps<MediaCanvasNode>) {
  const source = node.data.runtimeAssetPath || node.data.assetPath;
  const contentLocatorIdentity = readCanonicalContentLocatorKey(node.data.contentLocator);
  const contentLocator = useMemo(
    () => readCanonicalContentLocator(node.data.contentLocator),
    [contentLocatorIdentity],
  );
  const mediaType = node.data.mediaType ?? 'image';
  const sourceFingerprint = readSourceFingerprint(node.data.provenance);
  const previewRole =
    mediaType === 'image' ? 'image' : mediaType === 'audio' ? 'audio-waveform' : 'video-proxy';
  const title =
    resolveCanvasNodeName([node.data.title, node.data.assetPath]) ||
    resolveMediaTypeLabel(mediaType);
  const previewSource = useMemo<PreviewSourceDescriptor>(
    () => ({
      id: `canvas-node:${node.id}`,
      nodeId: node.id,
      outputId: node.id,
      role: previewRole,
      title: node.data.title,
      asset: {
        kind: 'asset-identity' as const,
        ...(source ? { path: source } : {}),
        mediaType,
      },
      ...(contentLocator ? { contentLocator } : {}),
      ...(sourceFingerprint ? { sourceFingerprint } : {}),
      metadata: {
        ...(node.data.duration ? { duration: node.data.duration } : {}),
      },
    }),
    [
      mediaType,
      contentLocator,
      node.data.duration,
      node.data.title,
      node.id,
      previewRole,
      source,
      sourceFingerprint,
    ],
  );
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      className={mediaType === 'image' ? 'canvas-image-node-frame' : undefined}
      onActivate={
        contentLocator && onFullscreenPreview ? () => onFullscreenPreview(node.id) : undefined
      }
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
        className={
          mediaType === 'audio'
            ? 'canvas-audio-node flex h-full min-h-0 flex-col'
            : 'flex h-full min-h-0 flex-col'
        }
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
              mediaPlayback={mediaType === 'video' ? 'inline' : undefined}
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
  onFullscreenPreview,
  ...baseProps
}: CanonicalNodeProps<FileCanvasNode>) {
  const fileName = resolveCanvasFileName(node.data);
  const contentLocator = readCanonicalContentLocator(node.data.contentLocator);
  const contentLocatorIdentity = contentLocator ? contentLocatorKey(contentLocator) : undefined;
  const sourceFingerprint = readSourceFingerprint(node.data.provenance);
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
  }, [contentLocatorIdentity, eligibleKind, host, node.id, sourceFingerprint]);

  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      className={eligibleKind ? 'canvas-text-reference-node' : undefined}
      onActivate={
        contentLocator && isFullscreenPreviewFile(node.data) && onFullscreenPreview
          ? () => onFullscreenPreview(node.id)
          : contentLocator && onOpen
            ? () => onOpen(contentLocator)
            : undefined
      }
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

function readSourceFingerprint(
  provenance: FileCanvasNode['data']['provenance'],
): string | undefined {
  const value = provenance?.['contentFingerprint'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isFullscreenPreviewMediaKind(value: unknown): value is 'image' | 'video' | 'audio' {
  return value === 'image' || value === 'video' || value === 'audio';
}

function isFullscreenPreviewFile(data: FileCanvasNode['data']): boolean {
  if (isFullscreenPreviewMediaKind(data.mediaKind)) return true;
  return Boolean(
    resolveCanvasTextFilePreviewKind({
      path: data.path || data.title,
      ...(data.mediaType ? { mediaType: data.mediaType } : {}),
    }),
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
      <div className="canvas-file-node__scroll" data-canvas-wheel-owner="content">
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
