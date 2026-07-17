/**
 * AudioCard - Compact audio result card (renamed from AudioPlayer, ADR-6)
 *
 * Displays audio metadata with file info.
 * Clicking "Open" opens the file in neko-preview
 * (hardware-accelerated audio preview with waveform via customEditor).
 *
 * ADR-6 fix: inline mode now shows a static waveform placeholder + click→neko-preview,
 * consistent with VideoCard inline behaviour (no native <audio controls>).
 */

import { useState, useRef, useCallback, memo } from 'react';
import { formatTime } from '@neko/neko-client';
import { ChevronDownIcon as ChevronIcon, ErrorIcon, OpenIcon, PlayIcon } from '@neko/shared/icons';
import { openMediaTarget } from './openMediaTarget';

interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  /** Local file path for opening in neko-preview */
  localPath?: string;
  /** Inline mode: native audio controls embedded (for use inside TaskCard) */
  inline?: boolean;
}

/**
 * Extract filename from path or URL
 */
function getFileName(src: string, title?: string): string {
  if (title) return title.split('/').pop() || title;
  try {
    const url = new URL(src);
    return url.pathname.split('/').pop() || 'audio';
  } catch {
    return src.split('/').pop() || 'audio';
  }
}

/**
 * Compact inline audio card shown inside TaskCard (ADR-6 fix).
 * Shows static waveform placeholder + filename + duration.
 * Clicking opens in neko-preview — consistent with VideoCard inline behaviour.
 * A hidden <audio preload="metadata"> is used only to extract duration.
 */
function InlineAudioCard({
  src,
  title,
  localPath,
  className,
}: {
  src: string;
  title?: string;
  localPath?: string;
  className?: string;
}) {
  const [duration, setDuration] = useState(0);
  const fileName = getFileName(src, title);

  const handleOpenPreview = useCallback(() => {
    const pathToOpen = localPath || src;
    openMediaTarget(pathToOpen);
  }, [localPath, src]);

  return (
    <div
      onClick={handleOpenPreview}
      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
        bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#a855f7)]
        hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${className || ''}`}
    >
      {/* Hidden audio element — metadata extraction only */}
      <audio
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          if (isFinite(audio.duration)) {
            setDuration(audio.duration);
          }
        }}
        style={{ display: 'none' }}
      />

      {/* Static waveform placeholder icon */}
      <AudioWaveformIcon className="w-4 h-4 text-[var(--vscode-charts-purple)] shrink-0" />

      {/* File name */}
      <span className="flex-1 truncate text-[11px] text-[var(--vscode-foreground)]">
        {fileName}
      </span>

      {/* Duration */}
      {duration > 0 && (
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] tabular-nums shrink-0">
          {formatTime(duration)}
        </span>
      )}

      {/* "Open in Preview" hint */}
      <span className="text-[9px] text-[var(--vscode-descriptionForeground)] opacity-60 shrink-0">
        Open in Preview
      </span>
    </div>
  );
}

function AudioPlayerComponent({
  src,
  title,
  className,
  localPath,
  inline = false,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  const fileName = getFileName(src, title);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration);
    }
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  // Open file in neko-preview (hardware-accelerated preview with waveform)
  const handleOpenPreview = useCallback(() => {
    const pathToOpen = localPath || src;
    openMediaTarget(pathToOpen);
  }, [localPath, src]);

  // Inline mode: compact card with waveform placeholder + click-to-open (ADR-6)
  if (inline) {
    return <InlineAudioCard src={src} title={title} localPath={localPath} className={className} />;
  }

  return (
    <div className={`my-1 ${className || ''}`}>
      {/* Hidden audio element for metadata extraction */}
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
        preload="metadata"
      />

      {/* Compact header - matches ToolCallDisplay style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-t text-[11px] cursor-pointer transition-colors
          ${
            hasError
              ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]'
              : 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#a855f7)]'
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
          <AudioIcon className="w-3 h-3 text-[var(--vscode-charts-purple)] shrink-0" />
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

      {/* Expanded content — audio info card with click-to-open */}
      {isExpanded && (
        <div className="border border-t-0 border-[var(--vscode-panel-border)] rounded-b bg-[var(--vscode-editor-background)] overflow-hidden">
          {hasError ? (
            <div className="flex items-center justify-center py-4 text-[var(--vscode-errorForeground)] text-[11px]">
              <ErrorIcon className="w-4 h-4 mr-2" />
              <span>Failed to load audio</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-3 p-3 cursor-pointer group hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              onClick={handleOpenPreview}
            >
              {/* Play button icon */}
              <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-[var(--vscode-button-background)] group-hover:bg-[var(--vscode-button-hoverBackground)] text-[var(--vscode-button-foreground)] transition-colors">
                <PlayIcon className="w-4 h-4 ml-0.5" />
              </div>

              {/* Audio info */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-[var(--vscode-foreground)] truncate">
                  {fileName}
                </div>
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {duration > 0 ? formatTime(duration) : 'Loading...'} · Click to open in Neko
                  Preview
                </div>
              </div>

              {/* Open icon */}
              <OpenIcon className="w-4 h-4 text-[var(--vscode-descriptionForeground)] group-hover:text-[var(--vscode-foreground)] transition-colors shrink-0" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const AudioCard = memo(AudioPlayerComponent);

// Icons
function AudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
      />
    </svg>
  );
}

/** Static waveform placeholder icon for inline mode (ADR-6) */
function AudioWaveformIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect x="2" y="10" width="2" height="4" rx="1" />
      <rect x="6" y="7" width="2" height="10" rx="1" />
      <rect x="10" y="4" width="2" height="16" rx="1" />
      <rect x="14" y="8" width="2" height="8" rx="1" />
      <rect x="18" y="6" width="2" height="12" rx="1" />
      <rect x="22" y="9" width="2" height="6" rx="1" />
    </svg>
  );
}
