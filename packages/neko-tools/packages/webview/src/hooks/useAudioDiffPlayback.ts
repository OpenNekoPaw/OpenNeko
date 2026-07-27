import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioStreamConfig } from '@neko-tools/contracts';
import type { PcmAudioClient } from '@neko/media/browser';
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
  const { streamClientFactory, rafScheduler, audioContextFactory } = useMediaDiffRuntime();
  const currentClientRef = useRef<PcmAudioClient>();
  const previousClientRef = useRef<PcmAudioClient>();
  const audioContextRef = useRef<AudioContext>();
  const rafHandleRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const activateAudio = useCallback((): AudioContext => {
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = audioContextFactory.create({ sampleRate: 48_000 });
      audioContextRef.current = context;
    }
    void audioContextFactory.resume(context);
    return context;
  }, [audioContextFactory]);

  const cancelTick = useCallback(() => {
    rafScheduler.cancelFrame(rafHandleRef.current);
    rafHandleRef.current = null;
  }, [rafScheduler]);

  useEffect(() => {
    if (!audioStreamConfig) return;
    const context = activateAudio();
    const currentClient = streamClientFactory.createAudioClient({
      descriptor: audioStreamConfig.currentAudio,
      playbackRate: audioStreamConfig.playbackRate,
      volume: playingVersion === 'previous' ? 0 : 1,
      onError: (error) => logger.error('Current PCM stream error', error),
    });
    const previousClient = streamClientFactory.createAudioClient({
      descriptor: audioStreamConfig.previousAudio,
      playbackRate: audioStreamConfig.playbackRate,
      volume: playingVersion === 'current' ? 0 : 1,
      onError: (error) => logger.error('Previous PCM stream error', error),
    });
    currentClientRef.current = currentClient;
    previousClientRef.current = previousClient;
    void Promise.all([currentClient.connect(context), previousClient.connect(context)])
      .then(() => setIsPlaying(true))
      .catch((error: unknown) => logger.error('Audio diff PCM connect failed', error));
    return () => {
      cancelTick();
      currentClient.dispose();
      previousClient.dispose();
      if (currentClientRef.current === currentClient) currentClientRef.current = undefined;
      if (previousClientRef.current === previousClient) previousClientRef.current = undefined;
    };
  }, [activateAudio, audioStreamConfig, cancelTick, streamClientFactory]);

  useEffect(() => {
    if (!isPlaying) {
      cancelTick();
      return;
    }
    const tick = (): void => {
      const client = currentClientRef.current;
      if (client?.isClockReady) onTimeChange(client.getCurrentTime());
      rafHandleRef.current = rafScheduler.requestFrame(tick);
    };
    rafHandleRef.current = rafScheduler.requestFrame(tick);
    return cancelTick;
  }, [cancelTick, isPlaying, onTimeChange, rafScheduler]);

  useEffect(() => {
    currentClientRef.current?.setVolume(playingVersion === 'previous' ? 0 : 1);
    previousClientRef.current?.setVolume(playingVersion === 'current' ? 0 : 1);
  }, [playingVersion]);

  useEffect(() => {
    return () => {
      cancelTick();
      const context = audioContextRef.current;
      if (context) void audioContextFactory.close(context);
    };
  }, [audioContextFactory, cancelTick]);

  const togglePlayback = useCallback(() => {
    activateAudio();
    if (isPlaying) {
      void currentClientRef.current?.pause();
      void previousClientRef.current?.pause();
      onAudioStreamControl?.('pause');
      cancelTick();
      setIsPlaying(false);
      return;
    }
    if (currentClientRef.current && previousClientRef.current) {
      void currentClientRef.current.resume();
      void previousClientRef.current.resume();
      setIsPlaying(true);
    }
    onAudioStreamControl?.('play');
  }, [activateAudio, cancelTick, isPlaying, onAudioStreamControl]);

  const seekTo = useCallback(
    (time: number) => {
      onTimeChange(time);
      onAudioStreamControl?.('seek', { time });
    },
    [onAudioStreamControl, onTimeChange],
  );

  return { isPlaying, togglePlayback, seekTo };
}
