import { useCallback, useMemo, useRef } from 'react';

export interface ProgrammaticMediaPlayback {
  readonly play: (media: HTMLMediaElement, onRejected: () => void) => void;
  readonly pause: (media: HTMLMediaElement) => void;
}

/** Keeps a stale asynchronous play completion behind the latest playback intent. */
export function useProgrammaticMediaPlayback(): ProgrammaticMediaPlayback {
  const desiredStateRef = useRef<'playing' | 'paused'>('paused');

  const pause = useCallback((media: HTMLMediaElement): void => {
    desiredStateRef.current = 'paused';
    media.pause();
  }, []);

  const play = useCallback(
    (media: HTMLMediaElement, onRejected: () => void): void => {
      desiredStateRef.current = 'playing';
      void media
        .play()
        .then(() => {
          if (desiredStateRef.current === 'paused') pause(media);
        })
        .catch(() => {
          onRejected();
        });
    },
    [pause],
  );
  return useMemo(() => ({ play, pause }), [pause, play]);
}
