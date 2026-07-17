/**
 * MediaDiffApp — Top-level component for the Media Diff webview.
 *
 * Responsibilities:
 * - Bridge useMediaDiffProtocol state → presentation components
 * - Auto-init diff on mount
 * - Manage GitRefSelector and ProgressOverlay
 */

import { useEffect, useCallback, memo } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { useMediaDiffProtocol } from '../../hooks/useMediaDiffProtocol';
import { MediaDiffViewer } from './MediaDiffViewer';

// =============================================================================
// ProgressOverlay
// =============================================================================

interface ProgressOverlayProps {
  progress: number;
  stage: string;
  onCancel: () => void;
}

const ProgressOverlay = memo(function ProgressOverlay({
  progress,
  stage,
  onCancel,
}: ProgressOverlayProps) {
  const { t } = useTranslation();
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'color-mix(in srgb, var(--neko-glass-bg) 86%, transparent)' }}
    >
      <div className="flex flex-col items-center gap-4 p-6 bg-[var(--neko-glass-bg)] rounded-lg border border-[var(--neko-glass-border)] shadow-lg min-w-[300px]">
        {/* Progress bar */}
        <div className="w-full h-2 bg-[var(--neko-hover)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--neko-accent)] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-sm text-[var(--neko-fg)]">{stage}</div>
        <div className="text-xs text-[var(--neko-fg-secondary)]">{Math.round(progress)}%</div>
        <button
          type="button"
          className="px-4 py-1.5 text-xs bg-[var(--neko-elevated)] text-[var(--neko-fg)] rounded hover:bg-[var(--neko-hover)] transition-colors"
          onClick={onCancel}
        >
          {t('mediaDiff.cancel')}
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// GitRefSelector
// =============================================================================

interface GitRefSelectorProps {
  commits: Array<{
    hash: string;
    shortHash: string;
    subject: string;
    authorName: string;
    date: string;
  }>;
  currentRef?: string;
  onChangeRef: (ref: string) => void;
  onLoadHistory: () => void;
}

const GitRefSelector = memo(function GitRefSelector({
  commits,
  currentRef,
  onChangeRef,
  onLoadHistory,
}: GitRefSelectorProps) {
  const { t } = useTranslation();
  if (commits.length === 0) {
    return (
      <button
        type="button"
        className="px-3 py-1.5 text-xs bg-[var(--neko-elevated)] text-[var(--neko-fg)] rounded border border-[var(--neko-border)] hover:bg-[var(--neko-hover)] transition-colors"
        onClick={onLoadHistory}
      >
        {t('mediaDiff.loadGitHistory')}
      </button>
    );
  }

  return (
    <select
      className="px-2 py-1 text-xs bg-[var(--neko-elevated)] text-[var(--neko-fg)] border border-[var(--neko-border)] rounded"
      value={currentRef ?? 'HEAD'}
      onChange={(e) => onChangeRef(e.target.value)}
    >
      <option value="HEAD">HEAD</option>
      {commits.map((c) => (
        <option key={c.hash} value={c.hash}>
          {c.shortHash} — {c.subject} ({c.authorName})
        </option>
      ))}
    </select>
  );
});

// =============================================================================
// Error Display
// =============================================================================

interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

const ErrorDisplay = memo(function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md p-6">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-sm text-red-400 mb-4">{error}</div>
        <button
          type="button"
          className="px-4 py-2 text-xs bg-[var(--neko-accent)] text-white rounded hover:brightness-110 transition-[filter]"
          onClick={onRetry}
        >
          {t('mediaDiff.retry')}
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// MediaDiffApp
// =============================================================================

export default function MediaDiffApp() {
  const { t } = useTranslation();
  const protocol = useMediaDiffProtocol();
  const {
    diffResult,
    isLoading,
    progress,
    error,
    currentImageSrc,
    previousImageSrc,
    heatmapSrc,
    currentWaveform,
    previousWaveform,
    currentFrameSrc,
    previousFrameSrc,
    commits,
    elementThumbnails,
    streamConfig,
    initialState,
    isFetchingPrevious,
    sendInit,
    sendInitLocal,
    sendSeek,
    sendCancel,
    sendGetFileHistory,
    sendChangeRef,
    sendInspectElement,
    sendStreamControl,
    audioStreamConfig,
    sendAudioStreamControl,
    sendSetTimeRange,
  } = protocol;

  // Auto-init on mount
  useEffect(() => {
    if (initialState.isLocalComparison && initialState.previousUri) {
      sendInitLocal(initialState.fileUri, initialState.previousUri);
    } else {
      sendInit(initialState.ref);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Streaming: no auto-start — streams are created lazily on first
  // Play click via handleStreamControl/handleAudioStreamControl('play')
  // in the extension, matching the neko-preview pattern.

  const handleRetry = useCallback(() => {
    if (initialState.isLocalComparison && initialState.previousUri) {
      sendInitLocal(initialState.fileUri, initialState.previousUri);
    } else {
      sendInit(initialState.ref);
    }
  }, [initialState, sendInit, sendInitLocal]);

  const handleTimeChange = useCallback(
    (time: number) => {
      if (diffResult?.mediaType === 'video') {
        sendSeek(time);
      }
    },
    [diffResult?.mediaType, sendSeek],
  );

  const handleChangeRef = useCallback(
    (ref: string) => {
      sendChangeRef(ref);
    },
    [sendChangeRef],
  );

  // Error state (non-loading)
  if (error && !isLoading) {
    return (
      <div className="h-screen flex flex-col bg-[var(--neko-surface)]">
        <ErrorDisplay error={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="relative h-screen flex flex-col bg-[var(--neko-surface)]">
      {/* Git ref selector bar (only for Git mode) */}
      {!initialState.isLocalComparison && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--neko-border)] bg-[var(--neko-surface)]">
          <span className="text-xs text-[var(--neko-fg-secondary)]">
            {t('mediaDiff.compareWith')}
          </span>
          <GitRefSelector
            commits={commits}
            currentRef={initialState.ref}
            onChangeRef={handleChangeRef}
            onLoadHistory={() => sendGetFileHistory(50)}
          />
        </div>
      )}

      {/* Main viewer */}
      <div className="flex-1 overflow-hidden">
        <MediaDiffViewer
          diffResult={diffResult ?? undefined}
          currentSrc={currentImageSrc ?? ''}
          previousSrc={previousImageSrc ?? ''}
          heatmapSrc={heatmapSrc ?? undefined}
          currentFrameSrc={currentFrameSrc ?? undefined}
          previousFrameSrc={previousFrameSrc ?? undefined}
          currentWaveform={currentWaveform}
          previousWaveform={previousWaveform}
          elementThumbnails={elementThumbnails}
          isLoading={isLoading && !progress}
          error={undefined}
          gitRef={initialState.ref ?? 'HEAD'}
          filePath={initialState.fileName}
          streamConfig={streamConfig}
          isFetchingPrevious={isFetchingPrevious}
          onTimeChange={handleTimeChange}
          onInspectElement={sendInspectElement}
          onStreamControl={sendStreamControl}
          audioStreamConfig={audioStreamConfig}
          onAudioStreamControl={sendAudioStreamControl}
          onSetTimeRange={sendSetTimeRange}
        />
      </div>

      {/* Full-screen progress overlay — only when no content to show yet */}
      {progress && !diffResult && (
        <ProgressOverlay
          progress={progress.progress}
          stage={progress.stage}
          onCancel={sendCancel}
        />
      )}

      {/* Non-blocking inline indicator — when content is already visible (video/audio) */}
      {progress && diffResult && (
        <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-[var(--neko-glass-bg)] border border-[var(--neko-glass-border)] shadow-lg">
          <div className="w-3 h-3 border-2 border-[var(--neko-accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-[var(--neko-fg-secondary)]">
            {progress.stage} {Math.round(progress.progress)}%
          </span>
          <button
            type="button"
            className="ml-1 text-[var(--neko-fg-secondary)] hover:text-[var(--neko-fg)]"
            onClick={sendCancel}
            title={t('mediaDiff.cancelAnalysis')}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
