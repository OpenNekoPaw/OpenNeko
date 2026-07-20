/**
 * AudioPlayer - Main audio preview component (modern layout)
 *
 * Connects to neko-engine's PCM audio stream via WebSocket,
 * plays through Web Audio API (AudioStreamClient), and provides
 * three switchable views: cover art, lyrics, waveform.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { EngineAvStreamLifecycle, type EngineAvAudioStreamClient } from '@neko/neko-client';
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
  PreviewStreamReadyMessage,
  PreviewStreamReconnectMessage,
  PreviewWaveformMessage,
} from '../shared/types';
import { getLogger } from '../utils/logger';
import { parseLrc, type LrcLine } from './lrc-parser';

const logger = getLogger('AudioPlayer');

export function AudioPlayer() {
  const { t } = useTranslation();
  const { postMessage } = useVscodeReady();

  // State
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [waveformData, setWaveformData] = useState<{
    peaks: number[];
    duration: number;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('cover');
  const [fileName, setFileName] = useState('');
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);

  // Refs
  const audioClientRef = useRef<EngineAvAudioStreamClient | null>(null);
  const lifecycleRef = useRef<EngineAvStreamLifecycle | null>(null);
  const playStartTimeRef = useRef(0);
  const playWallTimeRef = useRef(0);
  const statusThrottleRef = useRef(0);

  if (!lifecycleRef.current) {
    lifecycleRef.current = new EngineAvStreamLifecycle({
      callbacks: {
        onClientsChanged: ({ audioClient }) => {
          audioClientRef.current = audioClient;
        },
      },
    });
  }

  // =========================================================================
  // Time tracking during playback
  // =========================================================================

  // RAF animation loop — defined entirely inside useEffect to avoid stale closures
  // and ensure React 18 concurrent mode flushes renders on every frame.
  useEffect(() => {
    if (!isPlaying || !mediaInfo) return;

    let rafId: number;

    const tick = () => {
      let newTime: number;
      const audioClient = audioClientRef.current;
      if (audioClient && audioClient.isClockReady) {
        newTime = audioClient.getCurrentTime();
      } else {
        const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
        newTime = playStartTimeRef.current + elapsed * speed;
      }

      if (newTime >= mediaInfo.duration) {
        setCurrentTime(mediaInfo.duration);
        setIsPlaying(false);
        audioClientRef.current?.pause();
        postMessage({ type: 'preview:eof' });
        postMessage({
          type: 'preview:statusUpdate',
          playbackState: 'stopped',
          currentTime: mediaInfo.duration,
        });
        return;
      }

      setCurrentTime(newTime);

      // Throttle status updates to ~1/sec
      const now = performance.now();
      if (now - statusThrottleRef.current > 1000) {
        statusThrottleRef.current = now;
        postMessage({
          type: 'preview:statusUpdate',
          playbackState: 'playing',
          currentTime: newTime,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, mediaInfo, speed, postMessage]);

  // Cleanup on unmount — dispose audio client
  useEffect(() => {
    return () => {
      lifecycleRef.current?.dispose();
    };
  }, []);

  const startAudioLifecycle = useCallback(
    async (websocketUrl: string) => {
      await lifecycleRef.current?.start({
        audio: {
          websocketUrl,
          volume,
        },
      });
    },
    [volume],
  );

  // =========================================================================
  // Extension message handlers
  // =========================================================================

  useExtensionMessage((msg) => {
    switch (msg.type) {
      case 'preview:init': {
        const initMsg = msg as PreviewInitMessage;
        setMediaInfo(initMsg.payload.mediaInfo);
        const path = initMsg.payload.filePath;
        setFileName(
          path
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') ?? t('preview.audio.defaultFilename'),
        );
        setIsLoading(false);
        logger.info('Media info received', initMsg.payload.mediaInfo);
        break;
      }
      case 'preview:waveform': {
        const waveMsg = msg as PreviewWaveformMessage;
        setWaveformData({ peaks: waveMsg.payload.peaks, duration: waveMsg.payload.duration });
        break;
      }
      case 'preview:streamReady': {
        const streamMsg = msg as PreviewStreamReadyMessage;
        const wsUrl = streamMsg.payload.audioStreamUrl ?? streamMsg.payload.streamUrl;
        logger.info('Audio stream ready', wsUrl);
        startAudioLifecycle(wsUrl).catch((err) => {
          logger.error('AudioStreamClient connect failed', err);
        });
        break;
      }
      case 'preview:streamReconnect': {
        // EOF closed the WebSocket — reconnect to the same streamId
        const reconnectMsg = msg as PreviewStreamReconnectMessage;
        const wsUrl = reconnectMsg.payload.audioStreamUrl;
        if (!wsUrl) break;
        logger.info('Audio stream reconnect', wsUrl);
        startAudioLifecycle(wsUrl).catch((err) => {
          logger.error('AudioStreamClient reconnect failed', err);
        });
        break;
      }
      case 'preview:lyrics': {
        const lyricsMsg = msg as PreviewLyricsMessage;
        const result = parseLrc(lyricsMsg.payload.lrcContent);
        if (result.lines.length > 0) {
          setLyrics(result.lines);
          setViewMode('lyrics');
        }
        break;
      }
    }
  });

  // =========================================================================
  // Playback controls
  // =========================================================================

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      // Pause — keep client alive
      postMessage({ type: 'preview:pause' });
      setIsPlaying(false);
      const client = audioClientRef.current;
      if (client) {
        client.pause();
      }
    } else {
      // Resume — reuse existing client
      const client = audioClientRef.current;
      if (client) {
        client.resume();
      }
      postMessage({ type: 'preview:play', startTime: currentTime });
      playStartTimeRef.current = currentTime;
      playWallTimeRef.current = performance.now();
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, postMessage]);

  const handleSeek = useCallback(
    (time: number) => {
      setCurrentTime(time);
      playStartTimeRef.current = time;
      playWallTimeRef.current = performance.now();
      // Reset audio clock so post-seek packets re-establish timing
      const client = audioClientRef.current;
      if (client) {
        client.resetClock();
      }
      postMessage({ type: 'preview:seek', time });
    },
    [postMessage],
  );

  const handleScrub = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    const client = audioClientRef.current;
    if (client) {
      client.setVolume(v);
    }
  }, []);

  const handleSpeedChange = useCallback(
    (s: number) => {
      setSpeed(s);
      // Reset wall-clock baseline so the fallback path uses the new speed
      // from the current position (matches VideoPlayer's handleSpeedChange).
      if (isPlaying) {
        playStartTimeRef.current = currentTime;
        playWallTimeRef.current = performance.now();
      }
      postMessage({ type: 'preview:speed', speed: s });
    },
    [isPlaying, currentTime, postMessage],
  );

  // =========================================================================
  // Derived values
  // =========================================================================

  const subtitle = mediaInfo
    ? [
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
        .join(' · ')
    : '';

  // =========================================================================
  // Render
  // =========================================================================

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

  // Build cover art data URI from engine metadata
  const coverUri = mediaInfo?.coverArt
    ? `data:${mediaInfo.coverArt.mimeType};base64,${mediaInfo.coverArt.dataBase64}`
    : undefined;

  // Use metadata title if available, otherwise filename
  const displayName = mediaInfo?.metadata?.title || fileName;

  return (
    <div className="neko-audio-bg flex flex-col items-center w-full h-full px-8 pt-6 pb-5 overflow-hidden">
      {/* Main visual area — switchable views */}
      <div className="relative flex-1 flex items-center justify-center w-full min-h-[120px] py-2">
        <div className="relative w-full h-full">
          {/* Cover */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'cover' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <CoverView fileName={fileName} isPlaying={isPlaying} coverUri={coverUri} />
          </div>
          {/* Lyrics */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'lyrics' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <LyricsView lyrics={lyrics} currentTime={currentTime} />
          </div>
          {/* Waveform */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'waveform' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <div className="w-full h-full relative rounded-lg bg-[var(--neko-preview-surface)] overflow-hidden cursor-pointer">
              <WaveformCanvas
                peaks={waveformData?.peaks ?? null}
                duration={mediaInfo.duration}
                currentTime={currentTime}
                onSeekCommit={handleSeek}
                onSeeking={handleScrub}
              />
            </div>
          </div>
          {/* Spectrum */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${viewMode === 'spectrum' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <div className="w-full h-full relative rounded-lg bg-[var(--neko-preview-surface)] overflow-hidden">
              <SpectrumCanvas audioClient={audioClientRef.current} isPlaying={isPlaying} />
            </div>
          </div>
        </div>
      </div>

      {/* View mode tabs — below visual area, centered */}
      <ViewTabs viewMode={viewMode} onViewModeChange={setViewMode} />

      {/* Metadata */}
      <div className="flex flex-col items-center gap-1 pt-3 pb-1 shrink-0 w-full max-w-[400px]">
        <div className="font-semibold text-[17px] text-neko-preview-text-primary whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center tracking-[-0.01em]">
          {displayName}
        </div>
        {mediaInfo?.metadata?.artist && (
          <div className="text-[13px] text-neko-preview-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center">
            {mediaInfo.metadata.artist}
          </div>
        )}
        {subtitle && !mediaInfo?.metadata?.artist && (
          <div className="text-[13px] text-neko-preview-text-secondary whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-center">
            {subtitle}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 w-full">
        <AudioControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={mediaInfo.duration}
          volume={volume}
          speed={speed}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onScrub={handleScrub}
          onVolumeChange={handleVolumeChange}
          onSpeedChange={handleSpeedChange}
        />
      </div>
    </div>
  );
}
