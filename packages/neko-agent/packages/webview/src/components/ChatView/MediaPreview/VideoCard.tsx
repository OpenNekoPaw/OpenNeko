/**
 * VideoCard - Compact video result card (renamed from VideoPlayer, ADR-6)
 *
 * Displays video metadata with a thumbnail preview.
 * Clicking "Open" or the thumbnail opens the file in neko-preview
 * (hardware-accelerated H.264 preview via customEditor).
 */

import { useState, useRef, useCallback, memo } from 'react';
import { formatTime } from '@neko/neko-client';
import { ChevronDownIcon as ChevronIcon, ErrorIcon, OpenIcon, PlayIcon } from '@neko/shared/icons';
import { openMediaTarget } from './openMediaTarget';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  className?: string;
  /** Local file path for opening in neko-preview */
  localPath?: string;
  /** Inline mode: compact card without header (for use inside TaskCard) */
  inline?: boolean;
}

/**
 * Extract filename from path or URL
 */
function getFileName(src: string, title?: string): string {
  if (title) return title.split('/').pop() || title;
  try {
    const url = new URL(src);
    return url.pathname.split('/').pop() || 'video';
  } catch {
    return src.split('/').pop() || 'video';
  }
}

function VideoPlayerComponent({
  src,
  poster,
  title,
  className,
  localPath,
  inline = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  const fileName = getFileName(src, title);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
    }
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  // Open file in neko-preview (hardware-accelerated preview)
  const handleOpenPreview = useCallback(() => {
    const pathToOpen = localPath || src;
    openMediaTarget(pathToOpen);
  }, [localPath, src]);

  // Inline mode: compact thumbnail card with click-to-open
  if (inline) {
    return (
      <div className={`rounded overflow-hidden bg-black ${className || ''}`}>
        {hasError ? (
          <div className="flex items-center justify-center py-6 text-[var(--vscode-errorForeground)] text-[11px] bg-[var(--vscode-editor-background)]">
            <ErrorIcon className="w-4 h-4 mr-2" />
            <span>Failed to load video</span>
          </div>
        ) : (
          <div className="relative cursor-pointer group" onClick={handleOpenPreview}>
            {/* Hidden video element for metadata extraction */}
            <video
              ref={videoRef}
              src={src}
              poster={poster}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleError}
              className="w-full max-h-[200px] object-contain"
              preload="metadata"
            />

            {/* Play overlay — click to open in neko-preview */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-colors">
                <PlayIcon className="w-5 h-5 text-white ml-0.5" />
              </div>
            </div>

            {/* Duration badge */}
            {duration > 0 && (
              <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] text-white/90 tabular-nums">
                {formatTime(duration)}
              </div>
            )}

            {/* "Open in Preview" hint */}
            <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
              Open in Preview
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`my-1 ${className || ''}`}>
      {/* Compact header - matches ToolCallDisplay style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-t text-[11px] cursor-pointer transition-colors
          ${
            hasError
              ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]'
              : 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#3b82f6)]'
          }
          hover:bg-[var(--vscode-list-hoverBackground)]
          ${!isExpanded ? 'rounded-b' : ''}
        `}
        onClick={toggleExpand}
      >
        {/* Status indicator */}
        {hasError ? (
          <ErrorIcon className="w-3 h-3 text-[var(--vscode-charts-red)] shrink-0" />
        ) : (
          <VideoIcon className="w-3 h-3 text-[var(--vscode-charts-blue)] shrink-0" />
        )}

        {/* File name */}
        <span className="font-medium text-[var(--vscode-foreground)] truncate">{fileName}</span>

        {/* Duration badge */}
        {duration > 0 && !hasError && (
          <span className="text-[var(--vscode-descriptionForeground)] text-[10px]">
            {formatTime(duration)}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Open in Preview button */}
        {!hasError && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenPreview();
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors flex items-center gap-1 shrink-0"
            title="Open in Neko Preview"
          >
            <OpenIcon className="w-3 h-3" />
            <span>Preview</span>
          </button>
        )}

        {/* Expand indicator */}
        <ChevronIcon
          className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Expanded content — thumbnail with click-to-open */}
      {isExpanded && (
        <div className="border border-t-0 border-[var(--vscode-panel-border)] rounded-b bg-black overflow-hidden">
          {hasError ? (
            <div className="flex items-center justify-center py-6 text-[var(--vscode-errorForeground)] text-[11px] bg-[var(--vscode-editor-background)]">
              <ErrorIcon className="w-4 h-4 mr-2" />
              <span>Failed to load video</span>
            </div>
          ) : (
            <div className="relative cursor-pointer group" onClick={handleOpenPreview}>
              {/* Video element for poster/thumbnail — no playback controls */}
              <video
                ref={videoRef}
                src={src}
                poster={poster}
                onLoadedMetadata={handleLoadedMetadata}
                onError={handleError}
                className="w-full max-h-[200px] object-contain"
                preload="metadata"
              />

              {/* Play overlay — click to open in neko-preview */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                <div className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-colors">
                  <PlayIcon className="w-5 h-5 text-white ml-0.5" />
                </div>
              </div>

              {/* "Click to open in Preview" hint */}
              <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/70 opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to open in Neko Preview
                  </span>
                  {duration > 0 && (
                    <span className="text-[9px] text-white/80 tabular-nums">
                      {formatTime(duration)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const VideoCard = memo(VideoPlayerComponent);

// Icons
function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}
