import { useCallback, useEffect, useRef, useState } from 'react';
import { PcmAudioClient } from '@neko/media/browser';
import type { PreviewInitMessage, PreviewPlaybackReadyMessage, MediaInfo } from '../shared/types';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { useTranslation } from '../i18n/I18nContext';
import { VideoControls } from './VideoControls';
import { PlayIcon } from '@neko/ui/icons';

const CONTROLS_HIDE_DELAY = 3000;
const VIDEO_SYNC_THRESHOLD_SECONDS = 0.08;

export function VideoPlayer() {
  const { t } = useTranslation();
  const { postMessage } = useVscodeReady();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<PcmAudioClient>();
  const audioContextRef = useRef<AudioContext>();
  const generationRef = useRef(0);
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
  const [error, setError] = useState<string>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isPiPActive, setIsPiPActive] = useState(false);

  const disposeClients = useCallback(() => {
    generationRef.current += 1;
    audioRef.current?.dispose();
    audioRef.current = undefined;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    setIsConnected(false);
  }, []);

  const connectPlayback = useCallback(
    async (message: PreviewPlaybackReadyMessage): Promise<void> => {
      disposeClients();
      const generation = generationRef.current;
      const { audio, video: descriptor, startTime, playbackRate } = message.payload;
      let audioClient: PcmAudioClient | undefined;
      if (audio) {
        const context = audioContextRef.current;
        if (!context) throw new Error('Preview AudioContext was not activated by a user gesture.');
        audioClient = new PcmAudioClient({
          descriptor: audio,
          playbackRate,
          volume: volumeRef.current,
          onError: (failure) => setError(failure.message),
        });
        await audioClient.connect(context);
      }
      if (generation !== generationRef.current) {
        audioClient?.dispose();
        return;
      }
      const element = videoRef.current;
      if (!descriptor) {
        audioClient?.dispose();
        throw new Error('Video preview descriptor is unavailable.');
      }
      if (!element) {
        audioClient?.dispose();
        throw new Error('Video preview element is no longer mounted.');
      }
      element.muted = true;
      element.defaultMuted = true;
      element.playsInline = true;
      element.playbackRate = playbackRate;
      element.src = descriptor.url;
      element.load();
      await waitForVideoReady(element);
      element.currentTime = Math.min(startTime, Math.max(0, element.duration || startTime));
      audioRef.current = audioClient;
      await element.play();
      setIsConnected(true);
      setIsPlaying(true);
    },
    [disposeClients],
  );

  useExtensionMessage((message) => {
    switch (message.type) {
      case 'preview:init': {
        const info = (message as PreviewInitMessage).payload.mediaInfo;
        setMediaInfo(info);
        setIsLoading(false);
        postMessage({ type: 'preview:captureFrame', time: 0 });
        return;
      }
      case 'preview:playbackReady':
        void connectPlayback(message as PreviewPlaybackReadyMessage).catch((failure: unknown) => {
          setIsPlaying(false);
          setError(failure instanceof Error ? failure.message : String(failure));
        });
        return;
      case 'preview:frameData':
        setPosterUrl(message.payload.imageDataUrl);
        return;
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
        setIsPlaying(false);
        postMessage({ type: 'preview:eof' });
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, mediaInfo, postMessage]);

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
      setError(undefined);
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
      setCurrentTime(time);
      if (isPlaying) {
        disposeClients();
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
        disposeClients();
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
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-vscode-error p-5">{error}</div>
    );
  }
  if (!mediaInfo) return null;

  return (
    <div className="absolute inset-0 bg-black" onMouseMove={showControls}>
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="max-w-full max-h-full object-contain"
          poster={posterUrl}
          playsInline
          muted
          onError={() => setError(videoRef.current?.error?.message ?? 'Video playback failed.')}
        />
        {!isPlaying && (
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
          isConnected={isConnected}
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
