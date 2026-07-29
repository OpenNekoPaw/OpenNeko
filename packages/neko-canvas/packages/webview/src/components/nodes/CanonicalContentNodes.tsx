import type {
  FileCanvasNode,
  JobCanvasNode,
  MarkdownCanvasNode,
  MediaCanvasNode,
} from '@neko/shared';
import { FileIcon } from '@neko/shared/icons';
import { MarkdownDocumentView } from '@neko/ui/markdown';
import { t } from '../../i18n';
import { useOptionalCanvasHost } from '../../host-runtime';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import { BaseNode } from './BaseNode';
import type { NodeRendererCommonProps } from './nodeRendererTypes';

type CanonicalNodeProps<TNode> = NodeRendererCommonProps & {
  readonly node: TNode;
  readonly onOpen?: (path: string) => void;
};

type CanvasMediaType = NonNullable<MediaCanvasNode['data']['mediaType']>;

export function MarkdownNode({
  node,
  isSelected,
  onUpdateData,
  ...baseProps
}: CanonicalNodeProps<MarkdownCanvasNode>) {
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-2">
        {node.data.title ? (
          <div className="truncate text-xs font-semibold" style={{ color: 'var(--node-fg)' }}>
            {node.data.title}
          </div>
        ) : null}
        {isSelected ? (
          <textarea
            className="min-h-0 flex-1 resize-none rounded border bg-transparent p-2 text-xs outline-none"
            style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
            value={node.data.content}
            aria-label={t('node.markdownInput')}
            onChange={(event) =>
              onUpdateData?.(node.id, { ...node.data, content: event.currentTarget.value })
            }
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto text-sm leading-6">
            <MarkdownDocumentView value={node.data.content} />
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export function MediaNode({ node, isSelected, ...baseProps }: CanonicalNodeProps<MediaCanvasNode>) {
  const host = useOptionalCanvasHost();
  const source = node.data.runtimeAssetPath || node.data.assetPath;
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
    node.data.title || node.data.assetPath.split('/').pop() || resolveMediaTypeLabel(mediaType);
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
    >
      <div
        className={
          mediaType === 'audio'
            ? 'canvas-audio-node flex h-full min-h-0 flex-col'
            : 'flex h-full min-h-0 flex-col'
        }
      >
        {mediaType === 'audio' ? (
          <div className="canvas-audio-node-title">
            <span className="canvas-audio-node-title-icon" aria-hidden="true">
              ♪
            </span>
            <span className="truncate">{title}</span>
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{ background: 'var(--node-surface)' }}
        >
          {!source ? (
            <div
              className="flex h-full items-center justify-center text-xs"
              style={{ color: 'var(--node-fg-secondary)' }}
            >
              {resolveMediaTypeLabel(mediaType)}
            </div>
          ) : (
            <PreviewSurface
              source={{
                id: `canvas-node:${node.id}`,
                role: previewRole,
                title: node.data.title,
                asset: {
                  kind: 'asset-identity',
                  path: source,
                  mediaType,
                },
                metadata: {
                  ...(node.data.duration ? { duration: node.data.duration } : {}),
                  ...(node.data.resourceRef ? { resourceRef: node.data.resourceRef } : {}),
                  ...(node.data.documentResourceRef
                    ? { documentResourceRef: node.data.documentResourceRef }
                    : {}),
                },
              }}
              surfaceKind="inline"
              chrome="full-bleed"
              audioLayout={mediaType === 'audio' ? 'node-card' : undefined}
            />
          )}
        </div>
        {mediaType === 'audio' ? null : (
          <div
            className="truncate border-t px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--node-divider)', color: 'var(--node-fg)' }}
          >
            {title}
          </div>
        )}
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
          <span>{node.data.jobId}</span>
          <span>r{node.data.revision}</span>
        </div>
        {node.data.diagnostic ? (
          <div style={{ color: 'var(--vscode-errorForeground)' }}>{node.data.diagnostic}</div>
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
  const fileName = node.data.path.split('/').pop() || node.data.title;
  return (
    <BaseNode
      node={node}
      isSelected={isSelected}
      {...baseProps}
      presentation="foundational"
      opaqueSurface
      onActivate={node.data.path && onOpen ? () => onOpen(node.data.path) : undefined}
    >
      <div className="flex h-full flex-col items-center justify-center gap-3 p-3 text-center">
        <span style={{ color: 'var(--node-fg-secondary)' }}>
          <FileIcon size={36} strokeWidth={1.4} />
        </span>
        <div className="w-full truncate text-sm font-medium" style={{ color: 'var(--node-fg)' }}>
          {node.data.title || fileName}
        </div>
        <div className="w-full truncate text-xs" style={{ color: 'var(--node-fg-secondary)' }}>
          {node.data.mediaType || fileName}
        </div>
      </div>
    </BaseNode>
  );
}
