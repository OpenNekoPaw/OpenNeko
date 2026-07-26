import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewManifest } from '@neko/shared';
import { PcmAudioClient } from '@neko/media/browser';
import type { PreviewPlaybackReadyMessage } from '../shared/types';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';

const SYNC_THRESHOLD_SECONDS = 0.08;

export function PanoramaViewer({ kind }: { readonly kind: 'image' | 'video' }) {
  const { postMessage } = useVscodeReady();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<PcmAudioClient>();
  const audioContextRef = useRef<AudioContext>();
  const [manifest, setManifest] = useState<PreviewManifest>();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string>();

  const disposePlayback = useCallback(() => {
    audioRef.current?.dispose();
    audioRef.current = undefined;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, []);

  useExtensionMessage((message) => {
    if (message.type === 'panorama:init') {
      setManifest(message.payload.manifest);
      return;
    }
    if (message.type === 'panorama:error') {
      setError(message.payload.message);
      return;
    }
    if (message.type !== 'preview:playbackReady' || kind !== 'video') return;
    void connectPlayback(message as PreviewPlaybackReadyMessage).catch((failure: unknown) => {
      setPlaying(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    });
  });

  const connectPlayback = useCallback(
    async (message: PreviewPlaybackReadyMessage): Promise<void> => {
      disposePlayback();
      const descriptor = message.payload.video;
      const video = videoRef.current;
      if (!descriptor || !video) throw new Error('Panoramic video descriptor is unavailable.');
      let audio: PcmAudioClient | undefined;
      if (message.payload.audio) {
        const context = activateAudioContext(audioContextRef);
        audio = new PcmAudioClient({
          descriptor: message.payload.audio,
          playbackRate: message.payload.playbackRate,
          volume: 1,
          onError: (failure) => setError(failure.message),
        });
        await audio.connect(context);
      }
      video.muted = true;
      video.playbackRate = message.payload.playbackRate;
      video.src = descriptor.url;
      video.load();
      await waitForVideo(video);
      video.currentTime = message.payload.startTime;
      audioRef.current = audio;
      await video.play();
      setPlaying(true);
    },
    [disposePlayback],
  );

  useEffect(() => {
    if (!playing || kind !== 'video') return;
    let frame = 0;
    const tick = (): void => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (
        video &&
        audio?.isClockReady &&
        Math.abs(video.currentTime - audio.getCurrentTime()) > SYNC_THRESHOLD_SECONDS
      ) {
        video.currentTime = audio.getCurrentTime();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [kind, playing]);

  useEffect(
    () => () => {
      disposePlayback();
      const context = audioContextRef.current;
      if (context && context.state !== 'closed') void context.close();
      postMessage({ type: 'preview:stop' });
    },
    [disposePlayback, postMessage],
  );

  const togglePlayback = useCallback(() => {
    if (playing) {
      videoRef.current?.pause();
      void audioRef.current?.pause();
      setPlaying(false);
      postMessage({ type: 'preview:pause' });
      return;
    }
    activateAudioContext(audioContextRef);
    if (videoRef.current?.src) {
      void audioRef.current?.resume();
      void videoRef.current.play();
      setPlaying(true);
      postMessage({ type: 'preview:resume' });
      return;
    }
    postMessage({ type: 'preview:play', startTime: 0, speed: 1 });
  }, [playing, postMessage]);

  if (error) return <main className="panorama-state panorama-error">{error}</main>;
  if (!manifest) return <main className="panorama-state">Loading panoramic preview…</main>;

  if (kind === 'image') {
    return (
      <main className="panorama-stage">
        <img
          src={manifest.sourceUrl}
          alt={manifest.sourceName}
          className="panorama-image"
          draggable={false}
        />
      </main>
    );
  }

  return (
    <main className="panorama-stage">
      <video ref={videoRef} className="panorama-video" playsInline muted />
      <button type="button" className="panorama-play" onClick={togglePlayback}>
        {playing ? 'Pause' : 'Play'}
      </button>
    </main>
  );
}

function activateAudioContext(ref: { current?: AudioContext }): AudioContext {
  let context = ref.current;
  if (!context || context.state === 'closed') {
    context = new AudioContext({ sampleRate: 48_000 });
    ref.current = context;
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

async function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  await new Promise<void>((resolve, reject) => {
    const ready = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error(video.error?.message ?? 'Panoramic video failed to load.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
    };
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
}
