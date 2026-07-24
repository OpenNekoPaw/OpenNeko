import { memo, useCallback } from 'react';
import { AgentHostMessages } from '@/messages';
import { CopyIcon, FileIcon } from '@neko/shared/icons';
import { SendToMenu } from '@/components/ChatView/SendToMenu';
import { useMessageActions } from '@/components/ChatView/MessageActionsContext';
import { projectCanvasContentTransferTarget } from '@/presenters/plugin-transfer-presenter';
import type { DocumentImageThumbnailProjection } from '@/presenters/tool-call-presenter';

interface DocumentImageThumbnailsProps {
  thumbnails: readonly DocumentImageThumbnailProjection[];
}

function DocumentImageThumbnailsComponent({ thumbnails }: DocumentImageThumbnailsProps) {
  const { pluginsAvailable, contextChips, ambientNodes, activeConversationId } =
    useMessageActions();

  const handleOpen = useCallback((thumbnail: DocumentImageThumbnailProjection) => {
    if (!thumbnail.locator) return;
    AgentHostMessages.revealDocumentLocator({
      filePath: thumbnail.filePath,
      locator: thumbnail.locator,
      ...(thumbnail.source ? { source: thumbnail.source } : {}),
    });
  }, []);

  const handleCopy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);

  if (thumbnails.length === 0) return null;

  return (
    <div className="mt-2 overflow-x-auto">
      <div className="flex gap-2 pb-1">
        {thumbnails.map((thumbnail) => {
          const dimensions = formatDimensions(thumbnail.width, thumbnail.height);
          const byteSize = formatByteSize(thumbnail.byteSize);
          const title = [thumbnail.label, dimensions, byteSize].filter(Boolean).join(' · ');
          return (
            <div
              key={thumbnail.id}
              className="group w-20 shrink-0 overflow-hidden rounded border border-[var(--agent-input-border)] bg-[var(--agent-elevated)] text-left transition-colors hover:border-[var(--agent-accent)]"
            >
              <button
                type="button"
                disabled={!thumbnail.locator}
                onClick={() => handleOpen(thumbnail)}
                className="block w-full disabled:cursor-default"
                title={
                  thumbnail.locator
                    ? `Open ${title || thumbnail.label}`
                    : [title || thumbnail.path, thumbnail.previewDiagnostic]
                        .filter(Boolean)
                        .join(' · ')
                }
              >
                <div className="relative h-28 w-full bg-[var(--agent-bg)]">
                  {thumbnail.src ? (
                    <img
                      src={thumbnail.src}
                      alt={thumbnail.label}
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-[var(--agent-fg-secondary)]"
                      title={thumbnail.previewDiagnostic}
                    >
                      <FileIcon className="h-5 w-5" />
                    </div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/65 px-1 py-0.5 text-[9px] font-medium leading-none text-white">
                    {thumbnail.label}
                  </span>
                </div>
              </button>
              {(dimensions || byteSize) && (
                <div className="space-y-0.5 px-1.5 py-1 text-[9px] leading-tight text-[var(--agent-fg-secondary)]">
                  {dimensions && <div className="truncate">{dimensions}</div>}
                  {byteSize && <div className="truncate">{byteSize}</div>}
                </div>
              )}
              <div className="flex border-t border-[var(--agent-input-border)]">
                <ThumbnailActionButton
                  title="Copy reference JSON"
                  onClick={() => handleCopy(thumbnail.referenceJson)}
                >
                  <CopyIcon className="h-3 w-3" />
                </ThumbnailActionButton>
                <ThumbnailActionButton
                  title="Copy thumbnail summary"
                  onClick={() => handleCopy(formatThumbnailSummary(thumbnail))}
                >
                  <span className="text-[9px] font-medium leading-none">i</span>
                </ThumbnailActionButton>
              </div>
              {pluginsAvailable?.canvas && thumbnail.resourceRef && (
                <div className="border-t border-[var(--agent-input-border)] px-1 py-1">
                  <SendToMenu
                    payload={{
                      kind: 'singleAsset',
                      asset: {
                        mediaType: 'image',
                        name: getFileName(thumbnail.path),
                        documentResourceRef: thumbnail.resourceRef,
                      },
                      target: projectCanvasContentTransferTarget({
                        ambientNodes,
                        contextChips,
                      }),
                      provenance: {
                        source: 'webview',
                        label: `document-image:${thumbnail.label}`,
                        metadata: {
                          documentResourceRef: thumbnail.resourceRef,
                        },
                      },
                    }}
                    mediaType="image"
                    plugins={pluginsAvailable}
                    conversationId={activeConversationId}
                    allowedTargets={['canvas']}
                    showDirectCanvasImport
                    hidePrefixLabel
                    className="justify-center"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ThumbnailActionButtonProps {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}

function ThumbnailActionButton({ children, title, onClick }: ThumbnailActionButtonProps) {
  return (
    <button
      type="button"
      className="flex h-6 flex-1 items-center justify-center text-[var(--agent-fg-secondary)] transition-colors hover:bg-[var(--agent-hover)] hover:text-[var(--agent-fg)]"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        void onClick();
      }}
    >
      {children}
    </button>
  );
}

function formatLocatorReference(thumbnail: DocumentImageThumbnailProjection): string {
  const locator = formatThumbnailLocation(thumbnail);
  return `${thumbnail.filePath}#${locator}`;
}

function formatThumbnailSummary(thumbnail: DocumentImageThumbnailProjection): string {
  const parts = [
    `Document: ${thumbnail.filePath}`,
    `Reference: ${formatLocatorReference(thumbnail)}`,
    `Location: ${formatThumbnailLocation(thumbnail)}`,
  ];
  if (thumbnail.resourceRef?.entryPath) parts.push(`Entry: ${thumbnail.resourceRef.entryPath}`);
  const dimensions = formatDimensions(thumbnail.width, thumbnail.height);
  if (dimensions) parts.push(`Dimensions: ${dimensions}`);
  const byteSize = formatByteSize(thumbnail.byteSize);
  if (byteSize) parts.push(`Size: ${byteSize}`);
  if (thumbnail.mimeType) parts.push(`MIME: ${thumbnail.mimeType}`);
  return parts.join('\n');
}

function formatThumbnailLocation(thumbnail: DocumentImageThumbnailProjection): string {
  if (thumbnail.locator) return formatLocator(thumbnail.locator);
  if (thumbnail.resourceRef?.entryPath) return `entry:${thumbnail.resourceRef.entryPath}`;
  return thumbnail.label;
}

function formatLocator(locator: DocumentImageThumbnailProjection['locator']): string {
  if (!locator) return 'unknown';
  switch (locator.kind) {
    case 'page':
      return `page:${locator.pageNumber}`;
    case 'region':
      return `page:${locator.pageNumber}:region`;
    case 'chapter':
      return locator.spineIndex !== undefined
        ? `chapter:${locator.chapterHref}@${locator.spineIndex}`
        : `chapter:${locator.chapterHref}`;
    case 'slide':
      return `slide:${locator.slideNumber}`;
    case 'text-range':
      if (locator.startLine !== undefined || locator.endLine !== undefined) {
        return `lines:${locator.startLine ?? '?'}-${locator.endLine ?? '?'}`;
      }
      return `chars:${locator.startChar ?? '?'}-${locator.endChar ?? '?'}`;
    default:
      return 'unknown';
  }
}

function formatDimensions(width: number | undefined, height: number | undefined): string {
  return width !== undefined && height !== undefined ? `${width} x ${height}` : '';
}

function formatByteSize(byteSize: number | undefined): string {
  if (byteSize === undefined) return '';
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || 'document-image';
}

export const DocumentImageThumbnails = memo(DocumentImageThumbnailsComponent);
