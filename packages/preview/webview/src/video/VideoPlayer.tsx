import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import { VideoControls } from './VideoControls';
import { EmptyState } from '@neko/ui/primitives';
import { PauseIcon, PlayIcon, WarningIcon } from '@neko/ui/icons';
import type { PreviewMediaViewerSnapshot } from '../root/viewer-snapshot';
import type { PreviewViewerPlayback } from '../root/viewer-kernel';
import { useProgrammaticMediaPlayback } from '../shared/useProgrammaticMediaPlayback';
import '../styles/player.css';

const CONTROLS_HIDE_DELAY = 3000;

export interface VideoPlayerProps {
  readonly sourceUrl: string;
  readonly displayName?: string;
  readonly autoPlay?: boolean;
  readonly compact?: boolean;
  readonly ambient?: boolean;
  readonly inlinePlayback?: boolean;
  readonly muted?: boolean;
  readonly controls?: boolean;
  readonly initialSnapshot?: PreviewMediaViewerSnapshot;
  readonly onSnapshotChange?: (snapshot: PreviewMediaViewerSnapshot) => void;
  readonly playback?: PreviewViewerPlayback;
}

export function VideoPlayer({
  sourceUrl,
  displayName,
  autoPlay = false,
  compact = false,
  ambient = false,
  inlinePlayback = false,
  muted = false,
  controls = true,
  initialSnapshot,
  onSnapshotChange,
  playback,
}: VideoPlayerProps) {
  return (
    <SourceVideoPlayer
      sourceUrl={sourceUrl}
      displayName={displayName ?? ''}
      autoPlay={autoPlay}
      compact={compact}
      ambient={ambient}
      inlinePlayback={inlinePlayback}
      muted={muted}
      controls={controls}
      initialSnapshot={initialSnapshot}
      onSnapshotChange={onSnapshotChange}
      playback={playback}
    />
  );
}

function SourceVideoPlayer({
  sourceUrl,
  displayName,
  autoPlay,
  compact,
  ambient,
  inlinePlayback,
  muted,
  controls,
  initialSnapshot,
  onSnapshotChange,
  playback,
}: Required<
  Pick<
    VideoPlayerProps,
    'sourceUrl' | 'autoPlay' | 'compact' | 'ambient' | 'inlinePlayback' | 'muted' | 'controls'
  >
> &
  Pick<VideoPlayerProps, 'displayName' | 'initialSnapshot' | 'onSnapshotChange' | 'playback'>) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(initialSnapshot?.currentTime ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSnapshot?.playbackRate ?? 1);
  const [volume, setVolume] = useState(initialSnapshot?.volume ?? 1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const consumedRequestRef = useRef<string>();
  const programmaticPlayback = useProgrammaticMediaPlayback();
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotChangeRef.current = onSnapshotChange;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = initialSnapshot?.playbackRate ?? 1;
    video.volume = initialSnapshot?.volume ?? 1;
    const entered = () => setIsPiPActive(true);
    const left = () => setIsPiPActive(false);
    video.addEventListener('enterpictureinpicture', entered);
    video.addEventListener('leavepictureinpicture', left);
    return () => {
      onSnapshotChangeRef.current?.({
        currentTime: video.currentTime,
        playbackRate: video.playbackRate,
        volume: video.volume,
      });
      programmaticPlayback.pause(video);
      video.removeEventListener('enterpictureinpicture', entered);
      video.removeEventListener('leavepictureinpicture', left);
    };
  }, [programmaticPlayback, sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.defaultMuted = muted;
  }, [muted, sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !autoPlay) return;
    setFailed(false);
    programmaticPlayback.play(video, () => {
      setIsPlaying(false);
    });
  }, [autoPlay, programmaticPlayback, sourceUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) return;
    if (
      consumedRequestRef.current !== playback.requestId &&
      typeof playback.startTimeSeconds === 'number'
    ) {
      consumedRequestRef.current = playback.requestId;
      video.currentTime = Math.max(0, playback.startTimeSeconds);
    }
    if (playback.state === 'playing') {
      setFailed(false);
      programmaticPlayback.play(video, () => {
        setIsPlaying(false);
      });
    } else {
      programmaticPlayback.pause(video);
    }
  }, [playback?.requestId, playback?.startTimeSeconds, playback?.state, programmaticPlayback]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    if (video.paused) {
      void video.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      video.pause();
    }
  }, []);
  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(duration, time));
      setCurrentTime(video.currentTime);
    },
    [duration],
  );
  const changeSpeed = useCallback((next: number) => {
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }, []);
  const changeVolume = useCallback((next: number) => {
    setVolume(next);
    if (videoRef.current) videoRef.current.volume = next;
  }, []);
  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  }, []);
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    }
  }, [isPlaying]);

  return (
    <div className="absolute inset-0 bg-black" onMouseMove={showControls}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          src={sourceUrl}
          aria-label={displayName}
          autoPlay={autoPlay}
          controls={controls && compact && !ambient}
          loop={ambient}
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            setDuration(
              Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
            );
            const restoredTime = initialSnapshot?.currentTime ?? 0;
            event.currentTarget.currentTime = Math.max(
              0,
              Math.min(event.currentTarget.duration || restoredTime, restoredTime),
            );
            setCurrentTime(event.currentTarget.currentTime);
            setFailed(false);
          }}
          onTimeUpdate={(event) => {
            const nextTime = event.currentTarget.currentTime;
            setCurrentTime(nextTime);
            onSnapshotChange?.({ currentTime: nextTime, playbackRate: speed, volume });
            playback?.onTimeUpdate?.(nextTime, duration);
          }}
          onPlay={() => {
            setIsPlaying(true);
          }}
          onPause={() => {
            setIsPlaying(false);
          }}
          onEnded={(event) => {
            setIsPlaying(false);
            if (!ambient) {
              playback?.onEnded?.(event.currentTarget.currentTime, duration);
            }
          }}
          onError={() => {
            setIsPlaying(false);
            setFailed(true);
          }}
        />
        {(inlinePlayback || (controls && !compact && !isPlaying)) && !failed ? (
          <button
            type="button"
            data-testid="preview-video-toggle-playback"
            data-preview-video-playing={isPlaying ? 'true' : 'false'}
            className="group absolute inset-0 flex items-center justify-center"
            onClick={togglePlay}
            aria-label={t(isPlaying ? 'preview.video.pauseButton' : 'preview.video.playButton')}
          >
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white shadow-lg transition-opacity ${
                isPlaying
                  ? 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                  : 'opacity-100'
              }`}
            >
              {isPlaying ? <PauseIcon className="h-8 w-8" /> : <PlayIcon className="h-8 w-8" />}
            </span>
          </button>
        ) : null}
        {failed ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pb-16"
            role="alert"
          >
            <EmptyState
              className="w-full max-w-md rounded-xl border border-[var(--neko-inputValidation-warningBorder,var(--neko-panel-border))] bg-[var(--neko-editor-background)] shadow-xl"
              icon={<WarningIcon size={28} />}
              title={t('preview.video.playbackFailedTitle')}
              description={t('preview.video.playbackFailedDescription')}
            />
          </div>
        ) : null}
      </div>
      {controls && !compact ? (
        <div
          className={`absolute bottom-0 left-0 right-0 transition-opacity ${
            controlsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <VideoControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            speed={speed}
            volume={volume}
            isPiPActive={isPiPActive}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onScrub={setCurrentTime}
            onSpeedChange={changeSpeed}
            onVolumeChange={changeVolume}
            onTogglePiP={document.pictureInPictureEnabled ? () => void togglePiP() : undefined}
            visible={controlsVisible}
          />
        </div>
      ) : null}
    </div>
  );
}
