// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const lifecycleStart = vi.hoisted(() => vi.fn());
const lifecycleStop = vi.hoisted(() => vi.fn());
const lifecycleDispose = vi.hoisted(() => vi.fn());

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
        videoClient: { resetDecoder: vi.fn() },
        audioClient: { pause: vi.fn(), resume: vi.fn(), resetClock: vi.fn(), setVolume: vi.fn() },
        scheduler: { flush: vi.fn(), schedule: vi.fn(() => ({ action: 'wait' })) },
      });
    }

    stop() {
      lifecycleStop();
      this.callbacks.onClientsChanged?.({
        videoClient: null,
        audioClient: null,
        scheduler: null,
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

describe('narrative preview media runtime time labels', () => {
  afterEach(() => {
    window.__nekoNarrativePreviewMediaRuntime?.dispose('surface-a');
    document.body.replaceChildren();
    lifecycleStart.mockClear();
    lifecycleStop.mockClear();
    lifecycleDispose.mockClear();
  });

  it('formats mounted media time labels through the shared media formatter', async () => {
    await import('./narrativePreviewMediaRuntime');

    const container = document.createElement('div');
    document.body.appendChild(container);

    window.__nekoNarrativePreviewMediaRuntime?.mount({
      surfaceId: 'surface-a',
      container,
      mediaType: 'video',
      startTime: 65.678,
      duration: 3661.2,
    });

    expect(container.querySelector('.neko-preview-media-time')?.textContent).toBe('1:05 / 1:01:01');
  }, 15_000);

  it('starts and disposes media streams through the shared lifecycle', async () => {
    await import('./narrativePreviewMediaRuntime');

    const container = document.createElement('div');
    document.body.appendChild(container);

    window.__nekoNarrativePreviewMediaRuntime?.mount({
      surfaceId: 'surface-a',
      container,
      mediaType: 'video',
      duration: 10,
    });
    window.__nekoNarrativePreviewMediaRuntime?.handleHostMessage({
      type: 'media:streamReady',
      nodeId: 'surface-a',
      videoStreamUrl: 'ws://video',
      audioStreamUrl: 'ws://audio',
      mediaInfo: { duration: 10, width: 640, height: 360, fps: 24 },
    });
    await Promise.resolve();

    expect(lifecycleStart).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ websocketUrl: 'ws://video' }),
        audio: expect.objectContaining({ websocketUrl: 'ws://audio' }),
        fps: 24,
        schedulerMode: 'video',
        videoFrameRoute: 'callback',
      }),
    );

    window.__nekoNarrativePreviewMediaRuntime?.dispose('surface-a');

    expect(lifecycleStop).toHaveBeenCalled();
    expect(lifecycleDispose).toHaveBeenCalled();
  });
});
