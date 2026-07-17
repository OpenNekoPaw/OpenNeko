// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const messageHandlers = vi.hoisted(() => new Set<(message: unknown) => void>());
const lifecycleStart = vi.hoisted(() => vi.fn());
const lifecycleDispose = vi.hoisted(() => vi.fn());

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../shared/useVscodeMessage', () => ({
  useExtensionMessage: (handler: (message: unknown) => void) => {
    messageHandlers.add(handler);
  },
  useVscodeReady: () => ({ postMessage: vi.fn() }),
}));

vi.mock('./VideoControls', () => ({
  VideoControls: () => <div data-testid="video-controls" />,
}));

vi.mock('@neko/neko-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/neko-client')>();
  class EngineAvStreamLifecycle {
    private readonly callbacks: {
      onClientsChanged?: (clients: {
        videoClient: unknown;
        audioClient: unknown;
        scheduler: unknown;
      }) => void;
    };

    constructor(options: {
      callbacks?: {
        onClientsChanged?: (clients: {
          videoClient: unknown;
          audioClient: unknown;
          scheduler: unknown;
        }) => void;
      };
    }) {
      this.callbacks = options.callbacks ?? {};
    }

    async start(descriptor: unknown) {
      lifecycleStart(descriptor);
      this.callbacks.onClientsChanged?.({
        videoClient: { getStats: () => ({ framesDecoded: 1 }), resetDecoder: vi.fn() },
        audioClient: null,
        scheduler: { getStats: () => null, flush: vi.fn(), schedule: vi.fn() },
      });
    }

    dispose() {
      lifecycleDispose();
    }
  }

  return {
    ...actual,
    EngineAvStreamLifecycle,
  };
});

describe('Preview VideoPlayer stream lifecycle', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    lifecycleStart.mockClear();
    lifecycleDispose.mockClear();
    messageHandlers.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    messageHandlers.clear();
  });

  it('starts and disposes streams through EngineAvStreamLifecycle', async () => {
    await act(async () => {
      root.render(<VideoPlayer />);
    });

    await act(async () => {
      for (const handler of messageHandlers) {
        handler({
          type: 'preview:init',
          payload: {
            mediaInfo: { width: 640, height: 360, fps: 24, duration: 10 },
          },
        });
      }
      await Promise.resolve();
    });

    await act(async () => {
      for (const handler of messageHandlers) {
        handler({
          type: 'preview:streamReady',
          payload: {
            streamId: 'video-1',
            streamUrl: 'ws://video',
            audioStreamUrl: 'ws://audio',
          },
        });
      }
      await Promise.resolve();
    });

    expect(lifecycleStart).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ websocketUrl: 'ws://video' }),
        audio: expect.objectContaining({ websocketUrl: 'ws://audio' }),
        fps: 24,
        schedulerMode: 'video',
        videoFrameRoute: 'callback',
      }),
    );

    await act(async () => {
      root.unmount();
    });

    expect(lifecycleDispose).toHaveBeenCalled();
  });
});
