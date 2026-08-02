import { memo, useCallback, useState } from 'react';
import { formatMediaTime } from '@neko/media';
import { ChevronDownIcon as ChevronIcon, ErrorIcon } from '@neko/ui/icons';
import { isAuthorizedResourceDisplayUri } from '../../../presenters/resource-display-uri';

interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  /** @deprecated Display cards never open Host paths or transient display URLs. */
  localPath?: string;
  /** Inline mode uses compact native audio controls. */
  inline?: boolean;
}

function AudioPlayerComponent({ src, title, className, inline = false }: AudioPlayerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const fileName = getFileName(src, title);

  const handleLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLAudioElement>) => {
    const nextDuration = event.currentTarget.duration;
    if (Number.isFinite(nextDuration)) setDuration(nextDuration);
  }, []);

  if (!isAuthorizedResourceDisplayUri(src)) {
    return (
      <ResourceDenied className={className} message="Audio display source was not authorized." />
    );
  }

  if (inline) {
    return (
      <div
        className={`flex flex-col gap-1.5 rounded bg-[color-mix(in_srgb,var(--neko-textBlockQuote-background)_95%,#a855f7)] px-2 py-1.5 ${className || ''}`}
      >
        <span className="truncate text-[11px] text-[var(--neko-foreground)]">{fileName}</span>
        <NativeAudio
          src={src}
          onLoadedMetadata={handleLoadedMetadata}
          onError={() => setHasError(true)}
        />
        {hasError ? (
          <span className="text-[10px] text-[var(--neko-errorForeground)]">
            Failed to load audio
          </span>
        ) : duration > 0 ? (
          <span className="text-right text-[10px] tabular-nums text-[var(--neko-descriptionForeground)]">
            {formatMediaTime(duration)}
          </span>
        ) : null}
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
            : 'bg-[color-mix(in_srgb,var(--neko-textBlockQuote-background)_95%,#a855f7)]'
        } hover:bg-[var(--neko-list-hoverBackground)] ${!isExpanded ? 'rounded-b' : ''}`}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        {hasError ? (
          <ErrorIcon className="h-3 w-3 shrink-0 text-[var(--neko-charts-red)]" />
        ) : (
          <AudioIcon className="h-3 w-3 shrink-0 text-[var(--neko-charts-purple)]" />
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
        <div className="overflow-hidden rounded-b border border-t-0 border-[var(--neko-panel-border)] bg-[var(--neko-editor-background)] p-2">
          {hasError ? (
            <div className="flex items-center justify-center py-4 text-[11px] text-[var(--neko-errorForeground)]">
              <ErrorIcon className="mr-2 h-4 w-4" />
              <span>Failed to load audio</span>
            </div>
          ) : (
            <NativeAudio
              src={src}
              onLoadedMetadata={handleLoadedMetadata}
              onError={() => setHasError(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NativeAudio(props: {
  readonly src: string;
  readonly onLoadedMetadata: (event: React.SyntheticEvent<HTMLAudioElement>) => void;
  readonly onError: () => void;
}) {
  return (
    <audio
      controls
      crossOrigin="anonymous"
      preload="metadata"
      className="h-9 w-full"
      onLoadedMetadata={props.onLoadedMetadata}
      onError={props.onError}
      src={props.src}
    />
  );
}

function ResourceDenied(props: { readonly className?: string; readonly message: string }) {
  return (
    <div
      role="alert"
      className={`my-1 rounded px-2 py-2 text-[11px] text-[var(--neko-errorForeground)] ${props.className || ''}`}
    >
      {props.message}
    </div>
  );
}

function getFileName(src: string, title?: string): string {
  if (title) return title.split('/').pop() || title;
  try {
    return new URL(src).pathname.split('/').pop() || 'audio';
  } catch {
    return 'audio';
  }
}

function AudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3-.895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3-.895 3 2zM9 10l12-3"
      />
    </svg>
  );
}

export const AudioCard = memo(AudioPlayerComponent);
