import { useState, useRef, useCallback, useEffect } from 'react';
import { PcmAudioClient } from '@neko/media/browser';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { useTranslation } from '../i18n/I18nContext';
import { CoverView } from './CoverView';
import { LyricsView } from './LyricsView';
import { WaveformCanvas } from './WaveformCanvas';
import { SpectrumCanvas } from './SpectrumCanvas';
import { AudioControls, type ViewMode } from './AudioControls';
import { ViewTabs } from './ViewTabs';
import type {
  MediaInfo,
  PreviewInitMessage,
  PreviewLyricsMessage,
  PreviewPlaybackReadyMessage,
  PreviewWaveformMessage,
} from '../shared/types';
import { parseLrc, type LrcLine } from './lrc-parser';

export function AudioPlayer() {
  const { t } = useTranslation();
  const { postMessage } = useVscodeReady();
  const [mediaInfo, setMediaInfo] = useState<MediaInfo>();
  const [waveformData, setWaveformData] = useState<{
    peaks: number[];
    duration: number;
  }>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('cover');
  const [fileName, setFileName] = useState('');
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);
  const [error, setError] = useState<string>();
  const [audioClient, setAudioClient] = useState<PcmAudioClient>();
  const audioClientRef = useRef<PcmAudioClient>();
  const audioContextRef = useRef<AudioContext>();
  const generationRef = useRef(0);
  const volumeRef = useRef(volume);
  const statusThrottleRef = useRef(0);

  const disposeClient = useCallback(() => {
    generationRef.current += 1;
    audioClientRef.current?.dispose();
    audioClientRef.current = undefined;
    setAudioClient(undefined);
    setIsConnected(false);
  }, []);

  const activateAudioContext = useCallback((): AudioContext => {
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContext({ sampleRate: 48_000 });
      audioContextRef.current = context;
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  }, []);

  const connectPlayback = useCallback(
    async (message: PreviewPlaybackReadyMessage): Promise<void> => {
      disposeClient();
      const generation = generationRef.current;
      const descriptor = message.payload.audio;
      if (!descriptor) throw new Error('Audio preview produced no PCM descriptor.');
      const context = audioContextRef.current;
      if (!context) throw new Error('Preview AudioContext was not activated by a user gesture.');
      const client = new PcmAudioClient({
        descriptor,
        playbackRate: message.payload.playbackRate,
        volume: volumeRef.current,
        onError: (failure) => setError(failure.message),
        onStreamEnd: () => {
          setIsPlaying(false);
          postMessage({ type: 'preview:eof' });
        },
      });
      await client.connect(context);
      if (generation !== generationRef.current) {
        client.dispose();
        return;
      }
      audioClientRef.current = client;
      setAudioClient(client);
      setIsConnected(true);
      setIsPlaying(true);
    },
    [disposeClient, postMessage],
  );

  useEffect(() => {
    if (!isPlaying || !mediaInfo) return;
    let rafId = 0;
    const tick = (): void => {
      const client = audioClientRef.current;
      const time = client?.isClockReady ? client.getCurrentTime() : currentTime;
      setCurrentTime(Math.min(mediaInfo.duration, time));
      const now = performance.now();
      if (now - statusThrottleRef.current > 1000) {
        statusThrottleRef.current = now;
        postMessage({
          type: 'preview:statusUpdate',
          playbackState: 'playing',
          currentTime: time,
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [currentTime, isPlaying, mediaInfo, postMessage]);

  useEffect(() => {
    return () => {
      disposeClient();
      const context = audioContextRef.current;
      if (context && context.state !== 'closed') void context.close();
      postMessage({ type: 'preview:stop' });
    };
  }, [disposeClient, postMessage]);

  useExtensionMessage((message) => {
    switch (message.type) {
      case 'preview:init': {
        const init = message as PreviewInitMessage;
        setMediaInfo(init.payload.mediaInfo);
        setFileName(init.payload.displayName.replace(/\.[^.]+$/u, ''));
        setIsLoading(false);
        return;
      }
      case 'preview:playbackReady':
        void connectPlayback(message as PreviewPlaybackReadyMessage).catch((failure: unknown) => {
          setIsPlaying(false);
          setError(failure instanceof Error ? failure.message : String(failure));
        });
        return;
      case 'preview:waveform': {
        const waveform = message as PreviewWaveformMessage;
        setWaveformData({
          peaks: waveform.payload.peaks,
          duration: waveform.payload.duration,
        });
        return;
      }
      case 'preview:lyrics': {
        const result = parseLrc((message as PreviewLyricsMessage).payload.lrcContent);
        if (result.lines.length > 0) {
          setLyrics(result.lines);
          setViewMode('lyrics');
        }
        return;
      }
      default:
        return;
    }
  });

  const startAt = useCallback(
    (time: number, playbackRate = speed) => {
      if (!mediaInfo) return;
      activateAudioContext();
      setError(undefined);
      setCurrentTime(time);
      setIsPlaying(true);
      postMessage({ type: 'preview:play', startTime: time, speed: playbackRate });
    },
    [activateAudioContext, mediaInfo, postMessage, speed],
  );

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      void audioClientRef.current?.pause();
      setIsPlaying(false);
      postMessage({ type: 'preview:pause' });
      return;
    }
    if (isConnected) {
      activateAudioContext();
      void audioClientRef.current?.resume();
      setIsPlaying(true);
      postMessage({ type: 'preview:resume' });
      return;
    }
    startAt(mediaInfo && currentTime >= mediaInfo.duration ? 0 : currentTime);
  }, [activateAudioContext, currentTime, isConnected, isPlaying, mediaInfo, postMessage, startAt]);

  const handleSeek = useCallback(
    (time: number) => {
      setCurrentTime(time);
      if (!isPlaying) return;
      disposeClient();
      activateAudioContext();
      postMessage({ type: 'preview:seek', time, speed });
    },
    [activateAudioContext, disposeClient, isPlaying, postMessage, speed],
  );

  const handleVolumeChange = useCallback((nextVolume: number) => {
    volumeRef.current = nextVolume;
    setVolume(nextVolume);
    audioClientRef.current?.setVolume(nextVolume);
  }, []);

  const handleSpeedChange = useCallback(
    (nextSpeed: number) => {
      setSpeed(nextSpeed);
      if (!isPlaying) return;
      disposeClient();
      activateAudioContext();
      postMessage({ type: 'preview:play', startTime: currentTime, speed: nextSpeed });
    },
    [activateAudioContext, currentTime, disposeClient, isPlaying, postMessage],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-8 h-8 border-2 border-neko-preview-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-neko-preview-text-secondary">
          {t('preview.audio.loading')}
        </span>
      </div>
    );
  }
  if (!mediaInfo) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-neko-preview-text-secondary">
        {t('preview.audio.noMediaInfo')}
      </div>
    );
  }

  const subtitle = [
    mediaInfo.audioCodec?.toUpperCase(),
    mediaInfo.audioSampleRate ? `${(mediaInfo.audioSampleRate / 1000).toFixed(1)} kHz` : null,
    mediaInfo.audioChannels === 1
      ? t('preview.audio.mono')
      : mediaInfo.audioChannels === 2
        ? t('preview.audio.stereo')
        : mediaInfo.audioChannels
          ? `${mediaInfo.audioChannels}ch`
          : null,
    mediaInfo.bitrate ? `${Math.round(mediaInfo.bitrate / 1000)} kbps` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const coverUri = mediaInfo.coverArt
    ? `data:${mediaInfo.coverArt.mimeType};base64,${mediaInfo.coverArt.dataBase64}`
    : undefined;
  const displayName = mediaInfo.metadata?.title || fileName;

  return (
    <div className="neko-audio-bg flex flex-col items-center w-full h-full px-8 pt-6 pb-5 overflow-hidden">
      <div className="relative flex-1 flex items-center justify-center w-full min-h-[120px] py-2">
        <div className="relative w-full h-full">
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'cover' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <CoverView fileName={fileName} isPlaying={isPlaying} coverUri={coverUri} />
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'lyrics' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <LyricsView lyrics={lyrics} currentTime={currentTime} />
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'waveform' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <div className="w-full h-full relative rounded-lg bg-[var(--neko-preview-surface)] overflow-hidden cursor-pointer">
              <WaveformCanvas
                peaks={waveformData?.peaks ?? null}
                duration={mediaInfo.duration}
                currentTime={currentTime}
                onSeekCommit={handleSeek}
                onSeeking={setCurrentTime}
              />
            </div>
          </div>
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'spectrum' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <SpectrumCanvas audioClient={audioClient} isPlaying={isPlaying} />
          </div>
        </div>
      </div>
      <ViewTabs viewMode={viewMode} onViewModeChange={setViewMode} />
      <div className="flex flex-col items-center gap-1 pt-3 pb-1 shrink-0 w-full max-w-[400px]">
        <div className="font-semibold text-[17px] text-neko-preview-text-primary whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center tracking-[-0.01em]">
          {displayName}
        </div>
        {mediaInfo.metadata?.artist ? (
          <div className="text-[13px] text-neko-preview-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center">
            {mediaInfo.metadata.artist}
          </div>
        ) : subtitle ? (
          <div className="text-[13px] text-neko-preview-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center">
            {subtitle}
          </div>
        ) : null}
        {error ? <div className="text-xs text-red-400">{error}</div> : null}
      </div>
      <div className="shrink-0 w-full">
        <AudioControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={mediaInfo.duration}
          volume={volume}
          speed={speed}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onScrub={setCurrentTime}
          onVolumeChange={handleVolumeChange}
          onSpeedChange={handleSpeedChange}
        />
      </div>
    </div>
  );
}
