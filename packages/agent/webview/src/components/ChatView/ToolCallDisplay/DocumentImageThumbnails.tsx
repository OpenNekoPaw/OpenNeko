import { memo, useCallback } from 'react';
import { LightweightPreview } from '@neko/preview-webview/root';
import { useAgentHostMessages } from '../../../host-runtime-context';
import { CopyIcon, FileIcon, MoreHorizontalIcon, UploadIcon } from '@neko/ui/icons';
import { useMessageActions } from '../MessageActionsContext';
import { projectCanvasContentTransferTarget } from '../../../presenters/plugin-transfer-presenter';
import type { DocumentImageThumbnailProjection } from '../../../presenters/tool-call-presenter';
import { useTranslation } from '../../../i18n/I18nContext';
import { getLocale } from '../../../i18n';

interface DocumentImageThumbnailsProps {
  thumbnails: readonly DocumentImageThumbnailProjection[];
}

function DocumentImageThumbnailsComponent({ thumbnails }: DocumentImageThumbnailsProps) {
  const { t } = useTranslation();
  const agentHostMessages = useAgentHostMessages();
  const { pluginsAvailable, contextChips, ambientNodes } = useMessageActions();

  const handleOpen = useCallback(
    (thumbnail: DocumentImageThumbnailProjection) => {
      if (!thumbnail.locator || !thumbnail.contentLocator) return;
      agentHostMessages.revealDocumentLocator({
        contentLocator: thumbnail.contentLocator,
        locator: thumbnail.locator,
      });
    },
    [agentHostMessages],
  );

  const handleCopy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);

  const handleSendToCanvas = useCallback(
    (thumbnail: DocumentImageThumbnailProjection) => {
      if (!thumbnail.contentLocator) return;
      agentHostMessages.sendToPlugin('canvas', {
        kind: 'singleAsset',
        asset: {
          mediaType: 'image',
          name: getFileName(thumbnail.path),
          contentLocator: thumbnail.contentLocator,
        },
        target: projectCanvasContentTransferTarget({ ambientNodes, contextChips }),
        provenance: {
          source: 'webview',
          label: `document-image:${thumbnail.label}`,
          metadata: { contentLocator: thumbnail.contentLocator },
        },
      });
    },
    [agentHostMessages, ambientNodes, contextChips],
  );

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
                disabled={!thumbnail.locator || !thumbnail.contentLocator}
                onClick={() => handleOpen(thumbnail)}
                className="block w-full disabled:cursor-default"
                title={
                  thumbnail.locator && thumbnail.contentLocator
                    ? `Open ${title || thumbnail.label}`
                    : [title || thumbnail.path, thumbnail.previewDiagnostic]
                        .filter(Boolean)
                        .join(' · ')
                }
              >
                <div className="relative h-28 w-full bg-[var(--agent-bg)]">
                  {thumbnail.previewDescriptor ? (
                    <LightweightPreview
                      descriptor={thumbnail.previewDescriptor}
                      locale={getLocale()}
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
              {thumbnail.previewDiagnostic && (
                <div
                  className="border-t border-[var(--agent-input-border)] px-1.5 py-1 text-[9px] leading-tight text-[var(--agent-danger)]"
                  title={thumbnail.previewDiagnostic}
                >
                  Preview unavailable
                </div>
              )}
              <div className="border-t border-[var(--agent-input-border)] px-1 py-0.5">
                <details className="group/thumbnail-menu">
                  <summary
                    className="ml-auto flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded text-[var(--agent-fg-secondary)] hover:bg-[var(--agent-hover)] hover:text-[var(--agent-fg)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--agent-accent)] [&::-webkit-details-marker]:hidden"
                    title={t('chat.documentThumbnail.moreActions')}
                    aria-label={t('chat.documentThumbnail.moreActions')}
                  >
                    <MoreHorizontalIcon className="h-3.5 w-3.5" />
                  </summary>
                  <div className="space-y-0.5 border-t border-[var(--agent-input-border)] pt-1">
                    <button
                      type="button"
                      className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[10px] text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                      onClick={() => void handleCopy(formatLocatorReference(thumbnail))}
                    >
                      <CopyIcon className="h-3 w-3" />
                      <span>{t('chat.documentThumbnail.copyReference')}</span>
                    </button>
                    {pluginsAvailable?.canvas && thumbnail.contentLocator && (
                      <button
                        type="button"
                        className="flex min-h-7 w-full items-center gap-2 rounded px-2 text-left text-[10px] leading-tight text-[var(--agent-fg)] hover:bg-[var(--agent-hover)]"
                        onClick={() => handleSendToCanvas(thumbnail)}
                      >
                        <UploadIcon className="h-3 w-3 shrink-0" />
                        <span>{t('chat.documentThumbnail.sendToCanvas')}</span>
                      </button>
                    )}
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatLocatorReference(thumbnail: DocumentImageThumbnailProjection): string {
  const locator = formatThumbnailLocation(thumbnail);
  return `${thumbnail.filePath}#${locator}`;
}

function formatThumbnailLocation(thumbnail: DocumentImageThumbnailProjection): string {
  if (thumbnail.locator) return formatLocator(thumbnail.locator);
  if (thumbnail.contentLocator?.kind === 'document-entry') {
    return `entry:${thumbnail.contentLocator.entryPath}`;
  }
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
