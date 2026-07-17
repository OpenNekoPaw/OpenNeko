import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioStreamConfig } from '@neko/shared';
import type { AudioStreamClient } from '@neko/neko-client';
import { useMediaDiffRuntime } from '../runtime/MediaDiffRuntimeContext';
import { getLogger } from '../utils/logger';

const logger = getLogger('useAudioDiffPlayback');

export interface UseAudioDiffPlaybackOptions {
  audioStreamConfig: AudioStreamConfig | null;
  playingVersion: 'current' | 'previous' | 'both';
  onTimeChange: (time: number) => void;
  onAudioStreamControl?: (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => void;
}

export interface UseAudioDiffPlaybackResult {
  isPlaying: boolean;
  togglePlayback: () => void;
  seekTo: (time: number) => void;
}

export function useAudioDiffPlayback({
  audioStreamConfig,
  playingVersion,
  onTimeChange,
  onAudioStreamControl,
}: UseAudioDiffPlaybackOptions): UseAudioDiffPlaybackResult {
  const { streamClientFactory, rafScheduler } = useMediaDiffRuntime();
  const currentClientRef = useRef<AudioStreamClient | null>(null);
  const previousClientRef = useRef<AudioStreamClient | null>(null);
  const rafHandleRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const cancelTick = useCallback(() => {
    rafScheduler.cancelFrame(rafHandleRef.current);
    rafHandleRef.current = null;
  }, [rafScheduler]);

  useEffect(() => {
    if (!audioStreamConfig) {
      return;
    }

    const { port, currentAudioStreamId, previousAudioStreamId } = audioStreamConfig;
    const baseUrl = `ws://127.0.0.1:${port}/v1/streams`;

    const currentClient = streamClientFactory.createAudioStreamClient({
      websocketUrl: `${baseUrl}/${currentAudioStreamId}`,
      volume: playingVersion === 'previous' ? 0 : 1,
      onError: (err) => logger.error('Current stream error', err),
    });

    const previousClient = streamClientFactory.createAudioStreamClient({
      websocketUrl: `${baseUrl}/${previousAudioStreamId}`,
      volume: playingVersion === 'current' ? 0 : 1,
      onError: (err) => logger.error('Previous stream error', err),
    });

    currentClientRef.current = currentClient;
    previousClientRef.current = previousClient;

    void currentClient.connect();
    void previousClient.connect();

    return () => {
      cancelTick();
      currentClient.dispose();
      previousClient.dispose();
      currentClientRef.current = null;
      previousClientRef.current = null;
    };
  }, [audioStreamConfig, cancelTick, streamClientFactory]);

  useEffect(() => {
    if (!isPlaying) {
      cancelTick();
      return;
    }

    const tick = () => {
      const client = currentClientRef.current;
      if (client?.isClockReady) {
        onTimeChange(client.getCurrentTime());
      }
      rafHandleRef.current = rafScheduler.requestFrame(tick);
    };

    rafHandleRef.current = rafScheduler.requestFrame(tick);
    return cancelTick;
  }, [cancelTick, isPlaying, onTimeChange, rafScheduler]);

  useEffect(() => {
    currentClientRef.current?.setVolume(playingVersion === 'previous' ? 0 : 1);
    previousClientRef.current?.setVolume(playingVersion === 'current' ? 0 : 1);
  }, [playingVersion]);

  useEffect(() => cancelTick, [cancelTick]);

  const togglePlayback = useCallback(() => {
    const currentClient = currentClientRef.current;
    const previousClient = previousClientRef.current;

    if (isPlaying) {
      currentClient?.pause();
      previousClient?.pause();
      onAudioStreamControl?.('pause');
      cancelTick();
      setIsPlaying(false);
      return;
    }

    currentClient?.resume();
    previousClient?.resume();
    onAudioStreamControl?.('play');
    setIsPlaying(true);
  }, [cancelTick, isPlaying, onAudioStreamControl]);

  const seekTo = useCallback(
    (time: number) => {
      onTimeChange(time);
      currentClientRef.current?.resetClock();
      previousClientRef.current?.resetClock();
      onAudioStreamControl?.('seek', { time });
    },
    [onAudioStreamControl, onTimeChange],
  );

  return {
    isPlaying,
    togglePlayback,
    seekTo,
  };
}
