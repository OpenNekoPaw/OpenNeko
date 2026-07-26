// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const messageHandlers = vi.hoisted(() => new Set<(message: unknown) => void>());
const pause = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());
const play = vi.hoisted(() => vi.fn(async () => undefined));
const postMessage = vi.hoisted(() => vi.fn());

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../shared/useVscodeMessage', () => ({
  useExtensionMessage: (handler: (message: unknown) => void) => {
    messageHandlers.clear();
    messageHandlers.add(handler);
  },
  useVscodeReady: () => ({ postMessage }),
}));

vi.mock('./VideoControls', () => ({
  VideoControls: () => <div data-testid="video-controls" />,
}));

describe('Preview VideoPlayer native playback lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    messageHandlers.clear();
    pause.mockClear();
    load.mockClear();
    play.mockClear();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(load);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(3);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    messageHandlers.clear();
  });

  it('attaches the tokenized HTTP descriptor to a native video element and releases it', async () => {
    await act(async () => root.render(<VideoPlayer />));
    await emit({
      type: 'preview:init',
      payload: {
        mediaInfo: {
          width: 640,
          height: 360,
          fps: 24,
          duration: 10,
          codec: 'h264',
          format: 'mp4',
          hasAudio: false,
        },
        displayName: 'fixture.mp4',
      },
    });
    await emit({
      type: 'preview:playbackReady',
      payload: {
        video: {
          version: 1,
          transport: 'http',
          url: 'http://127.0.0.1:4567/media/token',
          mimeType: 'video/mp4',
          preparationProfile: 'h264-mp4-direct',
          durationSeconds: 10,
        },
        startTime: 2,
        playbackRate: 1,
      },
    });

    await vi.waitFor(() => {
      expect(host.querySelector('video')?.src).toBe('http://127.0.0.1:4567/media/token');
    });
    const video = host.querySelector('video');
    expect(video?.muted).toBe(true);
    expect(play).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });
});

async function emit(message: unknown): Promise<void> {
  await act(async () => {
    for (const handler of messageHandlers) handler(message);
    await Promise.resolve();
  });
}
