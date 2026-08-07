import { memo, useCallback, useState } from 'react';
import { formatMediaTime } from '@neko/media';
import { ChevronDownIcon as ChevronIcon, ErrorIcon } from '@neko/ui/icons';
import { isAuthorizedResourceDisplayUri } from '../../../presenters/resource-display-uri';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  className?: string;
  /** Inline mode uses compact native video controls. */
  inline?: boolean;
}

function VideoPlayerComponent({ src, poster, title, className, inline = false }: VideoPlayerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const fileName = getFileName(src, title);

  const handleLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const nextDuration = event.currentTarget.duration;
    if (Number.isFinite(nextDuration)) setDuration(nextDuration);
  }, []);

  if (!isAuthorizedResourceDisplayUri(src)) {
    return (
      <div
        role="alert"
        className={`my-1 rounded px-2 py-2 text-[11px] text-[var(--neko-errorForeground)] ${className || ''}`}
      >
        Video display source was not authorized.
      </div>
    );
  }

  const authorizedPoster = poster && isAuthorizedResourceDisplayUri(poster) ? poster : undefined;
  const video = (
    <div className="relative bg-black">
      <video
        controls
        crossOrigin="anonymous"
        preload="metadata"
        className="max-h-[260px] w-full object-contain"
        poster={authorizedPoster}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => setHasError(true)}
        src={src}
      />
      {duration > 0 && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] tabular-nums text-white/90">
          {formatMediaTime(duration)}
        </span>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className={`overflow-hidden rounded ${className || ''}`}>
        {hasError ? <VideoError /> : video}
      </div>
    );
  }

  return (
    <div className={`my-1 ${className || ''}`}>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 rounded-t px-2 py-1 text-left text-[11px] transition-colors ${
          hasError
            ? 'bg-[color-mix(in_srgb,var(--neko-textBlockQuote-background)_95%,#ef4444)]'
            : 'bg-[color-mix(in_srgb,var(--neko-textBlockQuote-background)_95%,#3b82f6)]'
        } hover:bg-[var(--neko-list-hoverBackground)] ${!isExpanded ? 'rounded-b' : ''}`}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        {hasError ? (
          <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--neko-charts-red)]" />
        ) : (
          <VideoIcon className="h-3 w-3 shrink-0 text-[var(--neko-charts-blue)]" />
        )}
        <span className="truncate font-medium text-[var(--neko-foreground)]">{fileName}</span>
        {duration > 0 && !hasError && (
          <span className="text-[10px] text-[var(--neko-descriptionForeground)]">
            {formatMediaTime(duration)}
          </span>
        )}
        <span className="flex-1" />
        <ChevronIcon
          className={`h-3 w-3 shrink-0 text-[var(--neko-descriptionForeground)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="overflow-hidden rounded-b border border-t-0 border-[var(--neko-panel-border)] bg-black">
          {hasError ? <VideoError /> : video}
        </div>
      )}
    </div>
  );
}

function VideoError() {
  return (
    <div className="flex items-center justify-center bg-[var(--neko-editor-background)] py-6 text-[11px] text-[var(--neko-errorForeground)]">
      <ErrorIcon className="mr-2 h-4 w-4" />
      <span>Failed to load video</span>
    </div>
  );
}

function getFileName(src: string, title?: string): string {
  if (title) return title.split('/').pop() || title;
  try {
    return new URL(src).pathname.split('/').pop() || 'video';
  } catch {
    return 'video';
  }
}

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

export const VideoCard = memo(VideoPlayerComponent);
