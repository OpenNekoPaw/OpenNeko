import { useCallback, useEffect, useRef, useState } from 'react';
import { PcmAudioClient } from '@neko/media/browser';
import type {
  PreviewInitMessage,
  PreviewOperationFailedMessage,
  PreviewPlaybackReadyMessage,
  MediaInfo,
  ReadyMessage,
} from '../shared/types';
import { useExtensionMessage, useHostReady } from '../shared/useHostMessage';
import { useTranslation } from '../i18n/I18nContext';
import { VideoControls } from './VideoControls';
import { EmptyState } from '@neko/ui/primitives';
import { InfoIcon, PlayIcon, WarningIcon } from '@neko/ui/icons';
import type { PreviewOperationDiagnosticCode } from '../shared/types';

const CONTROLS_HIDE_DELAY = 3000;
const VIDEO_SYNC_THRESHOLD_SECONDS = 0.08;

export interface VideoPlayerProps {
  readonly sourceUrl?: string;
  readonly displayName?: string;
  readonly autoPlay?: boolean;
  readonly compact?: boolean;
  readonly muted?: boolean;
}

export function VideoPlayer({
  sourceUrl,
  displayName,
  autoPlay = false,
  compact = false,
  muted = false,
}: VideoPlayerProps = {}) {
  return sourceUrl ? (
    <SourceVideoPlayer
      sourceUrl={sourceUrl}
      displayName={displayName ?? ''}
      autoPlay={autoPlay}
      compact={compact}
      muted={muted}
    />
  ) : (
    <EngineVideoPlayer />
  );
}

function SourceVideoPlayer({
  sourceUrl,
  autoPlay,
  compact,
  muted,
}: Required<Pick<VideoPlayerProps, 'sourceUrl' | 'autoPlay' | 'compact' | 'muted'>> &
  Pick<VideoPlayerProps, 'displayName'>) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.defaultMuted = muted;
    if (autoPlay) {
      setFailed(false);
      void video.play().catch(() => {
        setIsPlaying(false);
        setFailed(true);
      });
    }
    const entered = () => setIsPiPActive(true);
    const left = () => setIsPiPActive(false);
    video.addEventListener('enterpictureinpicture', entered);
    video.addEventListener('leavepictureinpicture', left);
    return () => {
      video.pause();
      video.removeEventListener('enterpictureinpicture', entered);
      video.removeEventListener('leavepictureinpicture', left);
    };
  }, [autoPlay, muted, sourceUrl]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    if (video.paused) {
      void video.play().catch(() => {
        setIsPlaying(false);
        setFailed(true);
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
          className="max-w-full max-h-full object-contain"
          src={sourceUrl}
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            setDuration(
              Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
            );
            setFailed(false);
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            setIsPlaying(false);
            setFailed(true);
          }}
        />
        {!compact && !isPlaying && !failed ? (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center"
            onClick={togglePlay}
            aria-label={t('preview.video.playButton')}
          >
            <span className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center">
              <PlayIcon className="w-8 h-8 text-white" />
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
      {!compact ? (
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

function EngineVideoPlayer() {
  const { t } = useTranslation();
  const readyMessageRef = useRef<ReadyMessage>();
  readyMessageRef.current ??= createVideoReadyMessage();
  const { postMessage } = useHostReady(readyMessageRef.current);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<PcmAudioClient>();
  const audioContextRef = useRef<AudioContext>();
  const generationRef = useRef(0);
  const playbackEndedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const volumeRef = useRef(1);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo>();
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [posterUrl, setPosterUrl] = useState<string>();
  const [posterDiagnostic, setPosterDiagnostic] = useState<PreviewOperationDiagnosticCode>();
  const [playbackDiagnostic, setPlaybackDiagnostic] = useState<PreviewOperationDiagnosticCode>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPiPActive, setIsPiPActive] = useState(false);

  const disposeClients = useCallback((resetVideo = true) => {
    generationRef.current += 1;
    audioRef.current?.dispose();
    audioRef.current = undefined;
    const video = videoRef.current;
    if (video) {
      video.pause();
      if (resetVideo) {
        video.removeAttribute('src');
        video.load();
      }
    }
    setIsConnected(false);
  }, []);

  const finishPlayback = useCallback(
    (expectedAudio: PcmAudioClient | undefined, endTime: number) => {
      if (expectedAudio && audioRef.current !== expectedAudio) return;
      const audio = audioRef.current;
      audioRef.current = undefined;
      audio?.dispose();
      videoRef.current?.pause();
      playbackEndedRef.current = true;
      setCurrentTime(endTime);
      setIsConnected(false);
      setIsPlaying(false);
      postMessage({ type: 'preview:eof' });
    },
    [postMessage],
  );

  const connectPlayback = useCallback(
    async (message: PreviewPlaybackReadyMessage): Promise<void> => {
      const { audio, video: descriptor, startTime, playbackRate } = message.payload;
      const existingVideo = videoRef.current;
      const reuseVideo =
        descriptor !== undefined &&
        existingVideo !== null &&
        existingVideo.src === descriptor.url &&
        existingVideo.hasAttribute('src');
      disposeClients(!reuseVideo);
      const generation = generationRef.current;
      let audioClient: PcmAudioClient | undefined;
      try {
        const element = videoRef.current;
        if (!descriptor) {
          throw new Error('Video preview descriptor is unavailable.');
        }
        if (!element) {
          throw new Error('Video preview element is no longer mounted.');
        }
        element.muted = true;
        element.defaultMuted = true;
        element.playsInline = true;
        element.playbackRate = playbackRate;
        if (!reuseVideo) {
          element.src = descriptor.url;
          element.load();
          await waitForVideoReady(element);
        }
        element.currentTime = Math.min(startTime, Math.max(0, element.duration || startTime));
        if (audio) {
          const context = audioContextRef.current;
          if (!context) {
            throw new Error('Preview AudioContext was not activated by a user gesture.');
          }
          audioClient = new PcmAudioClient({
            descriptor: audio,
            playbackRate,
            volume: volumeRef.current,
            onError: (_failure) => {
              if (generation === generationRef.current && audioRef.current === audioClient) {
                setPlaybackDiagnostic('playback-failed');
              }
            },
            onPlaybackEnd: () => finishPlayback(audioClient, descriptor.durationSeconds),
          });
          await audioClient.connect(context);
        }
        if (generation !== generationRef.current) {
          audioClient?.dispose();
          return;
        }
        audioRef.current = audioClient;
        playbackEndedRef.current = false;
        await element.play();
        setIsConnected(true);
        setIsPlaying(true);
      } catch (error) {
        audioClient?.dispose();
        if (audioRef.current === audioClient) audioRef.current = undefined;
        if (generation !== generationRef.current) return;
        throw error;
      }
    },
    [disposeClients, finishPlayback],
  );

  useExtensionMessage((message) => {
    switch (message.type) {
      case 'preview:init': {
        const info = (message as PreviewInitMessage).payload.mediaInfo;
        setMediaInfo(info);
        setIsLoading(false);
        return;
      }
      case 'preview:playbackReady':
        void connectPlayback(message as PreviewPlaybackReadyMessage).catch((_failure: unknown) => {
          setIsPlaying(false);
          setPlaybackDiagnostic('playback-failed');
        });
        return;
      case 'preview:frameData':
        setPosterUrl(message.payload.imageDataUrl);
        setPosterDiagnostic(undefined);
        return;
      case 'preview:operationFailed': {
        const failure = message as PreviewOperationFailedMessage;
        if (failure.payload.operation === 'captureFrame') {
          setPosterDiagnostic(failure.payload.code);
          return;
        }
        setIsPlaying(false);
        setPosterDiagnostic(undefined);
        setPlaybackDiagnostic(failure.payload.code);
        return;
      }
      default:
        return;
    }
  });

  useEffect(() => {
    if (!isPlaying || !mediaInfo) return;
    let frame = 0;
    const tick = (): void => {
      const video = videoRef.current;
      const audio = audioRef.current;
      const time = audio?.isClockReady ? audio.getCurrentTime() : (video?.currentTime ?? 0);
      if (
        video &&
        audio?.isClockReady &&
        Math.abs(video.currentTime - time) > VIDEO_SYNC_THRESHOLD_SECONDS
      ) {
        video.currentTime = time;
      }
      setCurrentTime(Math.min(mediaInfo.duration, time));
      if (time >= mediaInfo.duration) {
        finishPlayback(audio, mediaInfo.duration);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finishPlayback, isPlaying, mediaInfo]);

  useEffect(() => {
    return () => {
      disposeClients();
      const context = audioContextRef.current;
      if (context && context.state !== 'closed') void context.close();
      postMessage({ type: 'preview:stop' });
    };
  }, [disposeClients, postMessage]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const entered = () => setIsPiPActive(true);
    const left = () => setIsPiPActive(false);
    video.addEventListener('enterpictureinpicture', entered);
    video.addEventListener('leavepictureinpicture', left);
    return () => {
      video.removeEventListener('enterpictureinpicture', entered);
      video.removeEventListener('leavepictureinpicture', left);
    };
  }, [mediaInfo]);

  const activateAudioContext = useCallback((): AudioContext => {
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContext({ sampleRate: 48_000 });
      audioContextRef.current = context;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }, []);

  const startAt = useCallback(
    (time: number) => {
      if (!mediaInfo) return;
      activateAudioContext();
      setPlaybackDiagnostic(undefined);
      playbackEndedRef.current = false;
      setCurrentTime(time);
      setIsPlaying(true);
      postMessage({ type: 'preview:play', startTime: time, speed });
    },
    [activateAudioContext, mediaInfo, postMessage, speed],
  );

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      videoRef.current?.pause();
      void audioRef.current?.pause();
      setIsPlaying(false);
      postMessage({ type: 'preview:pause' });
      return;
    }
    if (playbackEndedRef.current) {
      startAt(0);
      return;
    }
    if (isConnected) {
      activateAudioContext();
      void audioRef.current?.resume();
      void videoRef.current?.play();
      setIsPlaying(true);
      postMessage({ type: 'preview:resume' });
      return;
    }
    startAt(mediaInfo && currentTime >= mediaInfo.duration ? 0 : currentTime);
  }, [activateAudioContext, currentTime, isConnected, isPlaying, mediaInfo, postMessage, startAt]);

  const handleSeek = useCallback(
    (time: number) => {
      setPlaybackDiagnostic(undefined);
      playbackEndedRef.current = false;
      setCurrentTime(time);
      if (isPlaying) {
        disposeClients(false);
        if (videoRef.current) videoRef.current.currentTime = time;
        activateAudioContext();
        postMessage({ type: 'preview:seek', time, speed });
      } else if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    [activateAudioContext, disposeClients, isPlaying, postMessage, speed],
  );

  const handleSpeedChange = useCallback(
    (nextSpeed: number) => {
      setSpeed(nextSpeed);
      if (isPlaying) {
        disposeClients(false);
        if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
        activateAudioContext();
        postMessage({ type: 'preview:play', startTime: currentTime, speed: nextSpeed });
      } else if (videoRef.current) {
        videoRef.current.playbackRate = nextSpeed;
      }
    },
    [activateAudioContext, currentTime, disposeClients, isPlaying, postMessage],
  );

  const handleVolumeChange = useCallback((nextVolume: number) => {
    volumeRef.current = nextVolume;
    setVolume(nextVolume);
    audioRef.current?.setVolume(nextVolume);
  }, []);

  const handleVideoError = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.hasAttribute('src')) return;
    setPlaybackDiagnostic('playback-failed');
  }, []);

  const handleVideoEnded = useCallback(() => {
    if (audioRef.current || !mediaInfo) return;
    finishPlayback(undefined, mediaInfo.duration);
  }, [finishPlayback, mediaInfo]);

  const handleTogglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    }
  }, [isPlaying]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">{t('preview.video.loading')}</div>
    );
  }
  if (!mediaInfo) return null;

  const hardwareDecoderUnavailable = playbackDiagnostic === 'hardware-decoder-unavailable';
  const hardwarePreviewUnavailable = playbackDiagnostic === 'hardware-preview-unavailable';
  const playbackNoticeTitle = hardwareDecoderUnavailable
    ? t('preview.video.hardwareDecoderUnavailableTitle', {
        codec: mediaInfo.codec.toUpperCase(),
      })
    : hardwarePreviewUnavailable
      ? t('preview.video.hardwarePreviewUnavailableTitle')
      : t('preview.video.playbackFailedTitle');
  const playbackNoticeDescription = hardwareDecoderUnavailable
    ? t('preview.video.hardwareDecoderUnavailableDescription', {
        codec: mediaInfo.codec.toUpperCase(),
      })
    : hardwarePreviewUnavailable
      ? t('preview.video.hardwarePreviewUnavailableDescription')
      : t('preview.video.playbackFailedDescription');

  return (
    <div className="absolute inset-0 bg-black" onMouseMove={showControls}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain"
          poster={posterUrl}
          playsInline
          muted
          onEnded={handleVideoEnded}
          onError={handleVideoError}
        />
        {!isPlaying && !playbackDiagnostic && (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center"
            onClick={handleTogglePlay}
            aria-label={t('preview.video.playButton')}
          >
            <span className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center">
              <PlayIcon className="w-8 h-8 text-white" />
            </span>
          </button>
        )}
        {playbackDiagnostic && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 pb-16"
            role="alert"
            aria-live="assertive"
          >
            <EmptyState
              className="w-full max-w-md rounded-xl border border-[var(--neko-inputValidation-warningBorder,var(--neko-panel-border))] bg-[var(--neko-editor-background)] shadow-xl"
              icon={<WarningIcon size={28} />}
              title={playbackNoticeTitle}
              description={playbackNoticeDescription}
            />
          </div>
        )}
        {posterDiagnostic && !posterUrl && !playbackDiagnostic && (
          <div
            className="absolute top-3 left-1/2 flex w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 items-start gap-2 rounded-lg border border-[var(--neko-inputValidation-infoBorder,var(--neko-panel-border))] bg-[var(--neko-editor-background)] px-3 py-2 text-xs text-neko-descriptionForeground shadow-lg"
            role="status"
            aria-live="polite"
          >
            <InfoIcon className="mt-0.5 shrink-0" size={16} />
            <span>
              <strong className="block font-medium text-neko-foreground">
                {t('preview.video.hdrPosterUnavailableTitle')}
              </strong>
              {t('preview.video.hdrPosterUnavailableDescription')}
            </span>
          </div>
        )}
      </div>
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <VideoControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={mediaInfo.duration}
          speed={speed}
          volume={volume}
          isPiPActive={isPiPActive}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onScrub={setCurrentTime}
          onSpeedChange={handleSpeedChange}
          onVolumeChange={handleVolumeChange}
          onTogglePiP={() => void handleTogglePiP()}
          visible={controlsVisible}
        />
      </div>
    </div>
  );
}

function createVideoReadyMessage(): ReadyMessage {
  const video = document.createElement('video');
  return {
    type: 'ready',
    nativeVideoCapabilities: {
      version: 1,
      // Electron can report AV1 Main10 as playable while composing one frozen frame.
      // Direct AV1 requires source-specific frame-output qualification, not canPlayType().
      av1Mp4: false,
      vp9Mp4: video.canPlayType('video/mp4; codecs="vp09.02.51.10"') === 'probably',
    },
  };
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error(video.error?.message ?? 'Video metadata failed to load.'));
    };
    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}
