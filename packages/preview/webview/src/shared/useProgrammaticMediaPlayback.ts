import { useCallback, useMemo, useRef } from 'react';

type ProgrammaticPlaybackEvent = 'playing' | 'paused';

export interface ProgrammaticMediaPlayback {
  readonly play: (media: HTMLMediaElement, onRejected: () => void) => void;
  readonly pause: (media: HTMLMediaElement) => void;
  readonly consumeEvent: (event: ProgrammaticPlaybackEvent) => boolean;
}

/** Keeps commands from being projected back as user interaction. */
export function useProgrammaticMediaPlayback(): ProgrammaticMediaPlayback {
  const expectedEventsRef = useRef<Record<ProgrammaticPlaybackEvent, boolean>>({
    playing: false,
    paused: false,
  });
  const desiredStateRef = useRef<ProgrammaticPlaybackEvent>('paused');

  const pause = useCallback((media: HTMLMediaElement): void => {
    desiredStateRef.current = 'paused';
    if (!media.paused) expectedEventsRef.current.paused = true;
    media.pause();
  }, []);

  const play = useCallback(
    (media: HTMLMediaElement, onRejected: () => void): void => {
      desiredStateRef.current = 'playing';
      if (media.paused) expectedEventsRef.current.playing = true;
      void media
        .play()
        .then(() => {
          if (desiredStateRef.current === 'paused') pause(media);
        })
        .catch(() => {
          expectedEventsRef.current.playing = false;
          onRejected();
        });
    },
    [pause],
  );

  const consumeEvent = useCallback((event: ProgrammaticPlaybackEvent): boolean => {
    const expected = expectedEventsRef.current[event];
    expectedEventsRef.current[event] = false;
    return expected;
  }, []);

  return useMemo(() => ({ play, pause, consumeEvent }), [consumeEvent, pause, play]);
}
