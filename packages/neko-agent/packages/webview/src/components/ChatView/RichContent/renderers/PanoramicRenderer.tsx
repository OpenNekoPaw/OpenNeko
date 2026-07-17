/**
 * Panoramic rich-content renderer.
 *
 * Agent keeps panoramic cards lightweight: it shows an engine/webview-safe
 * thumbnail-like image and delegates interactive spherical viewing to
 * neko-preview through the normal open-file message.
 */

import type { RichContentProps, RichContentRendererEntry } from '../types';
import { openMediaTarget } from '@/components/ChatView/MediaPreview/openMediaTarget';

interface PanoramicRichData {
  src: string;
  poster?: string;
  name?: string;
  localPath?: string;
  kind: 'image' | 'video';
}

function isPanoramicRichData(data: unknown): data is PanoramicRichData {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return (
    typeof record['src'] === 'string' && (record['kind'] === 'image' || record['kind'] === 'video')
  );
}

function PanoramicRendererComponent({
  data,
  className,
  inline,
}: RichContentProps<PanoramicRichData>) {
  const displayName = data.name ?? getFileName(data.localPath ?? data.src);
  const src = data.poster ?? data.src;

  const openPreview = () => {
    const pathToOpen = data.localPath ?? data.src;
    openMediaTarget(pathToOpen);
  };

  return (
    <div className={inline ? className : `my-1 ${className ?? ''}`}>
      {!inline && (
        <div className="flex items-center gap-1.5 rounded-t bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#0ea5e9)] px-2 py-1 text-[11px]">
          <span className="font-medium text-[var(--vscode-foreground)] truncate">
            {displayName}
          </span>
          <span className="agent-badge shrink-0 text-[9px] text-[var(--agent-fg)]">360</span>
          <button
            onClick={openPreview}
            className="ml-auto rounded bg-[var(--vscode-button-secondaryBackground)] px-1.5 py-0.5 text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
            title="Open in Neko Preview"
          >
            Preview
          </button>
        </div>
      )}
      <button
        type="button"
        className={`relative block w-full overflow-hidden bg-black text-left ${inline ? 'rounded' : 'rounded-b border border-t-0 border-[var(--vscode-panel-border)]'}`}
        onClick={openPreview}
        title="Open in Neko Preview"
      >
        <img src={src} alt={displayName} className="max-h-[200px] w-full object-contain" />
        <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] uppercase text-white">
          {data.kind === 'video' ? '360 video' : '360'}
        </span>
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
          <span className="rounded bg-black/70 px-2 py-1 text-[11px] text-white">
            Open in Preview
          </span>
        </span>
      </button>
    </div>
  );
}

export const panoramicImageRendererEntry: RichContentRendererEntry<PanoramicRichData> = {
  kind: 'panoramic-image',
  validate: (data): data is PanoramicRichData => isPanoramicRichData(data) && data.kind === 'image',
  component: PanoramicRendererComponent,
};

export const panoramicVideoRendererEntry: RichContentRendererEntry<PanoramicRichData> = {
  kind: 'panoramic-video',
  validate: (data): data is PanoramicRichData => isPanoramicRichData(data) && data.kind === 'video',
  component: PanoramicRendererComponent,
};

function getFileName(pathOrUrl: string): string {
  try {
    const url = new URL(pathOrUrl);
    return url.pathname.split('/').pop() || 'panorama';
  } catch {
    return pathOrUrl.split(/[\\/]/).pop() || 'panorama';
  }
}
