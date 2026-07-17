// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { ProjectData } from '@neko/shared';
import { PreviewPanel } from './PreviewPanel';
import { useEditorStore } from '../../stores/editor-store';
import { postMessage } from '../../utils/vscodeApi';
import { publishFrameServerMessage } from '../../services/frameServerMessages';

type MockStoreState = {
  project: ProjectData | null;
  currentTime: number;
  seekRevision: number;
  isPlaying: boolean;
  playbackSpeed: number;
  previewQuality: 'low' | 'medium' | 'high';
  previewVolume: number;
  previewMuted: boolean;
  showFpsCounter: boolean;
  currentFps: number;
  performanceStats: unknown;
  setCurrentFps: (fps: number) => void;
  setPerformanceStats: (stats: unknown) => void;
  setIsPiPActive: (active: boolean) => void;
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const storeMock = vi.hoisted(() => {
  let state: MockStoreState;
  const subscribers = new Set<() => void>();
  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };
  return {
    getState: () => state,
    replaceState: (next: MockStoreState) => {
      state = next;
      notify();
    },
    setState: (partial: Partial<MockStoreState>) => {
      state = { ...state, ...partial };
      notify();
    },
    subscribe: (subscriber: () => void) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
});

const streamLifecycleMock = vi.hoisted(() => {
  let onVideoError: ((error: Error) => void) | undefined;
  return {
    captureVideoError(handler: ((error: Error) => void) | undefined) {
      onVideoError = handler;
    },
    emitVideoError(error: Error) {
      if (!onVideoError) throw new Error('Video error handler has not been registered');
      onVideoError(error);
    },
    reset() {
      onVideoError = undefined;
    },
  };
});

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../stores/editor-store', async () => {
  const ReactModule = await import('react');

  function useEditorStore<T>(selector?: (state: MockStoreState) => T): T | MockStoreState {
    const [, forceRender] = ReactModule.useReducer((count: number) => count + 1, 0);
    ReactModule.useEffect(() => {
      const unsubscribe = storeMock.subscribe(forceRender);
      return () => {
        unsubscribe();
      };
    }, []);
    const state = storeMock.getState();
    return selector ? selector(state) : state;
  }
  useEditorStore.setState = storeMock.setState;

  return { useEditorStore };
});

vi.mock('../../hooks/useMediaInfoCache', () => ({
  useMediaInfoCache: () => ({ bitrate: '', codec: '', resolution: '' }),
}));

vi.mock('../../utils/vscodeApi', () => ({
  postMessage: vi.fn(),
}));

vi.mock('../../services/mediaProxyFactory', () => ({
  getMediaProxy: () => ({
    renderCompositeFrame: vi.fn(),
    getStreamStats: vi.fn(() => Promise.resolve(null)),
  }),
}));

vi.mock('@neko/neko-client', () => {
  const h264Connect = vi.fn();
  const lifecycleStart = vi.fn();
  const lifecycleStop = vi.fn();
  const lifecycleDispose = vi.fn();

  class H264StreamClient {
    connect = h264Connect;
    dispose = vi.fn();
    resetDecoder = vi.fn();
    getStats = vi.fn(() => ({
      framesDecoded: 1,
      framesDropped: 0,
      avgDecodeTimeMs: 0,
      avgLatencyMs: 0,
      hardwareAcceleration: false,
    }));
  }

  class AudioStreamClient {
    isClockReady = false;
    connect = vi.fn();
    dispose = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    setVolume = vi.fn();
    resetClock = vi.fn();
    getCurrentTime = vi.fn(() => 0);
    setClockPlaybackRate = vi.fn();
  }

  class FrameScheduler {
    enqueue = vi.fn();
    schedule = vi.fn(() => ({ action: 'wait', skipped: 0, deltaUs: 0 }));
    flush = vi.fn();
    dispose = vi.fn();
    switchClock = vi.fn();
    getStats = vi.fn(() => ({ queueLength: 0, skipped: 0, backpressure: 0 }));
  }

  class EngineAvStreamLifecycle {
    private readonly callbacks: {
      onClientsChanged?: (clients: {
        videoClient: H264StreamClient | null;
        audioClient: AudioStreamClient | null;
        scheduler: FrameScheduler | null;
      }) => void;
    };

    constructor(options: {
      callbacks?: {
        onClientsChanged?: (clients: {
          videoClient: H264StreamClient | null;
          audioClient: AudioStreamClient | null;
          scheduler: FrameScheduler | null;
        }) => void;
      };
    }) {
      this.callbacks = options.callbacks ?? {};
    }

    async start(descriptor: {
      video?: { onError?: (error: Error) => void };
      audio?: unknown;
      schedulerMode?: 'auto' | 'video' | 'av' | 'none';
    }) {
      lifecycleStart(descriptor);
      streamLifecycleMock.captureVideoError(descriptor.video?.onError);
      const videoClient = descriptor.video ? new H264StreamClient() : null;
      const audioClient = descriptor.audio ? new AudioStreamClient() : null;
      const scheduler =
        descriptor.video && descriptor.schedulerMode !== 'none' ? new FrameScheduler() : null;
      this.callbacks.onClientsChanged?.({ videoClient, audioClient, scheduler });
      await audioClient?.connect();
      await videoClient?.connect();
      return { videoClient, audioClient, scheduler, descriptor };
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
      this.callbacks.onClientsChanged?.({
        videoClient: null,
        audioClient: null,
        scheduler: null,
      });
    }
  }

  class PlaybackPerformanceMonitor {
    reset = vi.fn();
    recordFrame = vi.fn();
    recordRenderTime = vi.fn();
    recordPacketSize = vi.fn();
    recordDroppedFrames = vi.fn();
    getSnapshot = vi.fn(() => ({
      droppedFrames: 0,
      avgRenderTimeMs: 0,
      frameTimeP50: 0,
      frameTimeP95: 0,
      frameTimeP99: 0,
      measuredFps: 0,
      bitrateKbps: 0,
      memoryUsedMB: 0,
    }));
  }

  return {
    H264StreamClient,
    AudioStreamClient,
    FrameScheduler,
    EngineAvStreamLifecycle,
    PlaybackPerformanceMonitor,
    __h264Connect: h264Connect,
    __lifecycleStart: lifecycleStart,
    __lifecycleStop: lifecycleStop,
    __lifecycleDispose: lifecycleDispose,
  };
});

const baseProject: ProjectData = {
  version: '1.0',
  name: 'Preview test',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [],
};

async function renderPreview(): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<PreviewPanel />);
    await Promise.resolve();
  });
  return { root, container };
}

function clearFrameServerStreamCache(): void {
  publishFrameServerMessage({ type: 'frameServer:streamStopped' });
}

describe('PreviewPanel playback controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamLifecycleMock.reset();
    clearFrameServerStreamCache();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal(
      'AudioContext',
      class AudioContext {
        state: AudioContextState = 'running';
        resume(): Promise<void> {
          return Promise.resolve();
        }
        close(): Promise<void> {
          this.state = 'closed';
          return Promise.resolve();
        }
      },
    );
    storeMock.replaceState({
      project: baseProject,
      currentTime: 0,
      seekRevision: 0,
      isPlaying: false,
      playbackSpeed: 1,
      previewQuality: 'medium',
      previewVolume: 1,
      previewMuted: false,
      showFpsCounter: false,
      currentFps: 0,
      performanceStats: null,
      setCurrentFps: vi.fn(),
      setPerformanceStats: vi.fn(),
      setIsPiPActive: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    useEditorStore.setState({
      project: null,
      currentTime: 0,
      seekRevision: 0,
      isPlaying: false,
      playbackSpeed: 1,
    });
  });

  it('sends only speed control when playback speed changes during playback', async () => {
    const { root } = await renderPreview();

    await act(async () => {
      publishFrameServerMessage({ type: 'frameServer:config', port: 39001 });
      await Promise.resolve();
    });

    const mockedPostMessage = vi.mocked(postMessage);
    await act(async () => {
      useEditorStore.setState({ isPlaying: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    });
    mockedPostMessage.mockClear();

    await act(async () => {
      useEditorStore.setState({ playbackSpeed: 2 });
      await Promise.resolve();
    });

    const messageTypes = mockedPostMessage.mock.calls.map((call) => {
      const message = call[0] as { type?: unknown };
      return message.type;
    });
    expect(messageTypes).toContain('media:frameServer:projectPlayback:speed');
    expect(messageTypes).not.toContain('media:frameServer:projectPlayback:pause');
    expect(messageTypes).not.toContain('media:frameServer:projectPlayback:resume');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('does not restart playback when the playhead advances without an explicit seek', async () => {
    const { root } = await renderPreview();

    await act(async () => {
      publishFrameServerMessage({ type: 'frameServer:config', port: 39001 });
      await Promise.resolve();
    });

    const mockedPostMessage = vi.mocked(postMessage);
    await act(async () => {
      useEditorStore.setState({ isPlaying: true, currentTime: 0, seekRevision: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    });
    mockedPostMessage.mockClear();

    await act(async () => {
      useEditorStore.setState({ currentTime: 60 });
      await Promise.resolve();
    });

    const messageTypes = mockedPostMessage.mock.calls.map((call) => {
      const message = call[0] as { type?: unknown };
      return message.type;
    });
    expect(messageTypes).not.toContain('media:frameServer:projectPlayback:resume');
    expect(messageTypes).not.toContain('media:frameServer:projectPlayback:seek');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('restarts playback from the target time when seekRevision changes during playback', async () => {
    const { root } = await renderPreview();

    await act(async () => {
      publishFrameServerMessage({ type: 'frameServer:config', port: 39001 });
      await Promise.resolve();
    });

    const mockedPostMessage = vi.mocked(postMessage);
    await act(async () => {
      useEditorStore.setState({ isPlaying: true, currentTime: 0, seekRevision: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    });
    mockedPostMessage.mockClear();

    await act(async () => {
      useEditorStore.setState({ currentTime: 60, seekRevision: 1 });
      await Promise.resolve();
    });

    expect(mockedPostMessage).toHaveBeenCalledWith({
      type: 'media:frameServer:projectPlayback:resume',
      payload: {
        startTime: 60,
        speed: 1,
      },
    });

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('connects to cached frame server stream when streamCreated arrives before mount', async () => {
    publishFrameServerMessage({
      type: 'frameServer:config',
      port: 39001,
    });
    publishFrameServerMessage({
      type: 'frameServer:streamCreated',
      streamId: 'strm_editor-v_cached',
      wsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-v_cached',
      audioStreamId: null,
      audioWsUrl: null,
    });

    const { root } = await renderPreview();
    const clientModule = await import('@neko/neko-client');
    const lifecycleStart = (
      clientModule as typeof clientModule & { __lifecycleStart: ReturnType<typeof vi.fn> }
    ).__lifecycleStart;

    expect(lifecycleStart).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          websocketUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-v_cached',
        }),
        schedulerMode: 'video',
        videoFrameRoute: 'callback',
      }),
    );

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('defers AudioContext and audio stream startup until a user gesture', async () => {
    const audioContexts: Array<{ state: AudioContextState }> = [];
    vi.stubGlobal(
      'AudioContext',
      class AudioContext {
        state: AudioContextState = 'running';
        constructor() {
          audioContexts.push(this);
        }
        resume(): Promise<void> {
          return Promise.resolve();
        }
        close(): Promise<void> {
          this.state = 'closed';
          return Promise.resolve();
        }
      },
    );
    publishFrameServerMessage({ type: 'frameServer:config', port: 39001 });
    publishFrameServerMessage({
      type: 'frameServer:streamCreated',
      streamId: 'strm_editor-v_audio-gated',
      wsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-v_audio-gated',
      audioStreamId: 'strm_editor-a_audio-gated',
      audioWsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-a_audio-gated',
    });

    const { root } = await renderPreview();
    const clientModule = await import('@neko/neko-client');
    const lifecycleStart = (
      clientModule as typeof clientModule & { __lifecycleStart: ReturnType<typeof vi.fn> }
    ).__lifecycleStart;

    expect(audioContexts).toHaveLength(0);
    expect(lifecycleStart).toHaveBeenLastCalledWith(expect.objectContaining({ audio: undefined }));

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerdown'));
      await Promise.resolve();
    });

    expect(audioContexts).toHaveLength(1);
    expect(lifecycleStart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          websocketUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-a_audio-gated',
        }),
      }),
    );

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('does not keep the GPU initializing overlay after the frame server stream is ready', async () => {
    const { root, container } = await renderPreview();

    expect(container.textContent).toContain('preview.initializingGpu');

    await act(async () => {
      publishFrameServerMessage({
        type: 'frameServer:config',
        port: 39001,
      });
      publishFrameServerMessage({
        type: 'frameServer:streamCreated',
        streamId: 'strm_editor-v_ready',
        wsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-v_ready',
        audioStreamId: 'strm_editor-a_ready',
        audioWsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-a_ready',
      });
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('preview.initializingGpu');
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.style.display).toBe('block');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('projects an Engine stream disconnect as a typed visible diagnostic', async () => {
    publishFrameServerMessage({ type: 'frameServer:config', port: 39001 });
    publishFrameServerMessage({
      type: 'frameServer:streamCreated',
      streamId: 'strm_editor-v_unavailable',
      wsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-v_unavailable',
      audioStreamId: null,
      audioWsUrl: null,
    });

    const { root, container } = await renderPreview();

    await act(async () => {
      streamLifecycleMock.emitVideoError(new Error('WebSocket connection error'));
      await Promise.resolve();
    });

    const diagnostic = container.querySelector(
      '[role="alert"][data-diagnostic-code="cut.engine.stream-unavailable"]',
    );
    expect(diagnostic?.textContent).toContain('WebSocket connection error');
    expect(container.textContent).not.toContain('preview.gpuRequired');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('disposes the shared stream lifecycle on unmount', async () => {
    publishFrameServerMessage({
      type: 'frameServer:config',
      port: 39001,
    });
    publishFrameServerMessage({
      type: 'frameServer:streamCreated',
      streamId: 'strm_editor-v_dispose',
      wsUrl: 'ws://127.0.0.1:39001/v1/streams/strm_editor-v_dispose',
      audioStreamId: null,
      audioWsUrl: null,
    });

    const { root } = await renderPreview();
    const clientModule = await import('@neko/neko-client');
    const lifecycleDispose = (
      clientModule as typeof clientModule & { __lifecycleDispose: ReturnType<typeof vi.fn> }
    ).__lifecycleDispose;

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });

    expect(lifecycleDispose).toHaveBeenCalled();
  });
});
