// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockVSCodeApi,
  installMockWebviewWindow,
  type MockWebviewWindow,
} from '@neko/shared/vscode/test-utils';
import { resetVSCodeApi } from '@neko/shared/vscode';
import { PreviewSurface } from './PreviewRendererRegistry';
import type { PreviewPlaybackControl, PreviewSourceDescriptor } from './types';
import { usePlaybackStore } from '../stores/playbackStore';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const canvasHostMock = vi.hoisted(() => ({
  current: undefined as
    | {
        postMessage(message: unknown): void;
        subscribe(listener: (message: unknown) => void): () => void;
      }
    | undefined,
}));

vi.mock('../host-runtime', () => ({
  useOptionalCanvasHost: () => canvasHostMock.current,
}));

type InlineVideoPlayerMockProps = {
  readonly audioContext?: AudioContext;
  readonly duration: number;
  readonly onStop: (currentTime: number) => void;
  readonly onEnded?: (currentTime: number) => void;
};

type InlineAudioPlayerMockProps = InlineVideoPlayerMockProps & {
  readonly audioLayout?: 'transport' | 'node-card';
};

const audioContextMocks: AudioContextMock[] = [];

class AudioContextMock {
  readonly currentTime = 0;
  readonly state = 'running';
  readonly close = vi.fn().mockResolvedValue(undefined);
  readonly resume = vi.fn().mockResolvedValue(undefined);
}

vi.mock('../components/media/InlineVideoPlayer', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    InlineVideoPlayer: ({ duration, onStop, onEnded }: InlineVideoPlayerMockProps) =>
      ReactModule.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'inline-video-ended',
          onClick: () => {
            onStop(duration);
            onEnded?.(duration);
          },
        },
        'video ended',
      ),
  };
});

vi.mock('../components/media/InlineAudioPlayer', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    AudioPlayerSurface: ({
      layout,
      duration,
      showPlaybackButton = true,
      onTogglePlay,
    }: {
      readonly layout?: 'transport' | 'node-card';
      readonly duration: number;
      readonly showPlaybackButton?: boolean;
      readonly onTogglePlay: (event?: React.MouseEvent) => void;
    }) =>
      layout === 'node-card'
        ? ReactModule.createElement(
            'div',
            {
              'data-testid': 'canvas-audio-waveform',
              'data-duration': duration,
            },
            ReactModule.createElement('div', {
              'data-testid': 'canvas-audio-node-controls',
            }),
          )
        : ReactModule.createElement(
            'div',
            {
              className: 'canvas-audio-transport',
              'data-duration': duration,
            },
            showPlaybackButton
              ? ReactModule.createElement(
                  'button',
                  { type: 'button', title: 'Play', onClick: onTogglePlay },
                  'Play',
                )
              : ReactModule.createElement('span', null, `0:00 / ${duration.toFixed(0)}`),
          ),
    InlineAudioPlayer: ({ duration, onStop, onEnded, audioLayout }: InlineAudioPlayerMockProps) =>
      ReactModule.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'inline-audio-ended',
          'data-audio-layout': audioLayout ?? 'transport',
          onClick: () => {
            onStop(duration);
            onEnded?.(duration);
          },
        },
        'audio ended',
      ),
  };
});

describe('PreviewSurface media playback control', () => {
  let host: HTMLDivElement;
  let root: Root;
  let mockWindow: MockWebviewWindow;
  let postMessage: ReturnType<typeof vi.fn<(message: unknown) => void>>;
  let subscribe: ReturnType<typeof vi.fn<(listener: (message: unknown) => void) => () => void>>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const api = createMockVSCodeApi();
    postMessage = vi.fn<(message: unknown) => void>((message) => {
      api.postedMessages.push(message);
    });
    api.postMessage = postMessage;
    subscribe = vi.fn((listener: (message: unknown) => void) => {
      const handleMessage = (event: MessageEvent) => listener(event.data);
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    });
    canvasHostMock.current = {
      postMessage: (message) => api.postMessage(message),
      subscribe,
    };
    mockWindow = installMockWebviewWindow(api);
    audioContextMocks.length = 0;
    Object.assign(globalThis, {
      AudioContext: class extends AudioContextMock {
        constructor() {
          super();
          audioContextMocks.push(this);
        }
      },
    });
    usePlaybackStore.setState({
      activePlayback: null,
      handoffRequest: null,
      playbacks: new Map(),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    mockWindow.dispose();
    canvasHostMock.current = undefined;
    resetVSCodeApi();
    vi.restoreAllMocks();
  });

  it('receives media responses through the Canvas Host subscription contract', async () => {
    await act(async () => {
      root.render(
        <PreviewSurface
          source={{
            id: 'host-subscription-video',
            role: 'video-proxy',
            asset: {
              kind: 'asset-identity',
              path: 'media/subscribed.mp4',
              mediaType: 'video',
            },
          }}
        />,
      );
    });

    expect(subscribe).toHaveBeenCalled();
  });

  it('contains inline creative images so the complete composition remains visible', async () => {
    await act(async () => {
      root.render(
        <PreviewSurface
          source={{
            id: 'creative-image-1',
            role: 'image',
            title: 'Creative image',
            variants: [
              {
                id: 'creative-image-1:preview',
                role: 'image',
                sourcePath: 'data:image/png;base64,cHJldmlldw==',
              },
            ],
          }}
          surfaceKind="inline"
        />,
      );
    });

    const image = host.querySelector<HTMLImageElement>('[data-preview-surface="visual"] img');
    expect(image?.className).toContain('object-contain');
    expect(image?.className).not.toContain('object-cover');
  });

  it('switches hook-owning preview roles through React component boundaries', async () => {
    const visualSource: PreviewSourceDescriptor = {
      id: 'preview-role-visual',
      role: 'image',
      variants: [
        {
          id: 'preview-role-visual:image',
          role: 'image',
          sourcePath: 'data:image/png;base64,cHJldmlldw==',
        },
      ],
    };
    const audioSource: PreviewSourceDescriptor = {
      id: 'preview-role-audio',
      role: 'audio-waveform',
      title: 'Audio preview',
    };

    await act(async () => {
      root.render(<PreviewSurface source={visualSource} />);
    });
    expect(host.querySelector('[data-preview-surface="visual"]')).not.toBeNull();

    await act(async () => {
      root.render(<PreviewSurface source={audioSource} />);
    });
    expect(host.querySelector('[data-preview-surface="audio"]')).not.toBeNull();

    await act(async () => {
      root.render(<PreviewSurface source={visualSource} />);
    });
    expect(host.querySelector('[data-preview-surface="visual"]')).not.toBeNull();
  });

  it('keeps the default Storyline audio Preview as a compact transport', async () => {
    await act(async () => {
      root.render(
        <PreviewSurface
          source={{
            id: 'canvas-node:audio-a',
            role: 'audio-waveform',
            title: 'Canvas audio',
          }}
          surfaceKind="inline"
          chrome="full-bleed"
        />,
      );
    });

    expect(host.querySelectorAll('[data-preview-surface="audio"] .w-1')).toHaveLength(0);
    expect(host.querySelector<HTMLButtonElement>('button[title="Play"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Canvas audio');
  });

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/controlled.mp4',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/controlled.aac',
    },
  ])(
    'does not render a second idle play action for a Storyline-controlled $mediaType Preview',
    async ({ role, mediaType, assetPath }) => {
      await act(async () => {
        root.render(
          <PreviewSurface
            source={{
              id: `controlled-${mediaType}`,
              role,
              title: assetPath,
              asset: {
                kind: 'asset-identity',
                path: assetPath,
                mediaType,
              },
            }}
            surfaceKind="overlay"
            playbackControl={{
              requestId: 'controlled-preview-idle',
              state: 'paused',
              startTimeSeconds: 0,
            }}
          />,
        );
      });

      expect(host.querySelector('[data-preview-controlled-idle="true"]')).not.toBeNull();
      expect(host.querySelector('button')).toBeNull();
    },
  );

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/idle.mp4',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/idle.aac',
    },
  ])(
    'probes idle $mediaType metadata without starting playback and keeps the controlled Preview populated',
    async ({ role, mediaType, assetPath }) => {
      await act(async () => {
        root.render(
          <PreviewSurface
            source={{
              id: `idle-${mediaType}`,
              role,
              title: assetPath,
              asset: {
                kind: 'asset-identity',
                path: assetPath,
                mediaType,
              },
            }}
            surfaceKind="overlay"
            playbackControl={{
              requestId: `idle-${mediaType}-request`,
              state: 'paused',
              startTimeSeconds: 0,
            }}
          />,
        );
      });

      const probe = latestMessageOfType('media:probe');
      const nodeId = readString(probe['nodeId']);
      if (!nodeId) throw new Error('idle media probe did not include a node id');
      expect(probe).toMatchObject({
        type: 'media:probe',
        assetPath,
        mediaType,
      });
      expect(messagesOfType('media:play')).toHaveLength(0);

      await act(async () => {
        mockWindow.dispatchMessage({
          type: 'media:probeResult',
          nodeId,
          mediaInfo: mediaInfoFor(mediaType),
        });
      });

      const idleSurface = host.querySelector<HTMLElement>(`[data-preview-surface="${mediaType}"]`);
      expect(idleSurface?.dataset.mediaDuration).toBe('2');
      expect(idleSurface?.querySelector('button')).toBeNull();
      expect(idleSurface?.childElementCount).toBeGreaterThan(0);
      expect(messagesOfType('media:play')).toHaveLength(0);
    },
  );

  it('renders the explicit Canvas node audio layout with a waveform silhouette', async () => {
    await act(async () => {
      root.render(
        <PreviewSurface
          source={{
            id: 'canvas-node:audio-b',
            role: 'audio-waveform',
            title: 'Canvas audio',
          }}
          surfaceKind="inline"
          chrome="full-bleed"
          audioLayout="node-card"
        />,
      );
    });

    expect(host.querySelector('[data-testid="canvas-audio-waveform"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="canvas-audio-node-controls"]')).not.toBeNull();
    expect(host.querySelector('.canvas-audio-transport')).toBeNull();
  });

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/user-activated.mp4',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/user-activated.wav',
    },
  ])(
    'primes Web Audio during the initial $mediaType user gesture before the Host stream roundtrip',
    async ({ role, mediaType, assetPath }) => {
      await act(async () => {
        root.render(
          <PreviewSurface
            source={{
              id: `user-activated-${mediaType}`,
              role,
              title: assetPath,
              asset: {
                kind: 'asset-identity',
                path: assetPath,
                mediaType,
              },
            }}
          />,
        );
      });

      const probe = latestMessageOfType('media:probe');
      const nodeId = readString(probe['nodeId']);
      if (!nodeId) throw new Error('media:probe did not include a node id');
      await act(async () => {
        mockWindow.dispatchMessage({
          type: 'media:probeResult',
          nodeId,
          mediaInfo: mediaInfoFor(mediaType),
        });
      });

      await act(async () => {
        host.querySelector<HTMLButtonElement>('button[title="Play"]')?.click();
      });

      expect(audioContextMocks).toHaveLength(1);
      expect(latestMessageOfType('media:play')).toMatchObject({
        type: 'media:play',
        nodeId,
        mediaType,
        startTime: 0,
      });
    },
  );

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/a.mp4',
      readyDescriptors: {
        video: {
          version: 1,
          transport: 'http',
          url: 'http://127.0.0.1:3000/file/video-a',
          mimeType: 'video/mp4',
          preparationProfile: 'h264-mp4-direct',
          durationSeconds: 2,
        },
      },
      endedTestId: 'inline-video-ended',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/a.wav',
      readyDescriptors: {
        audio: {
          version: 1,
          transport: 'http',
          protocol: 'neko-pcm-f32le-v1',
          streamUrl: 'http://127.0.0.1:3000/pcm/audio-a',
          sampleRate: 48_000,
          channels: 2,
        },
      },
      endedTestId: 'inline-audio-ended',
    },
  ])(
    'does not restart a consumed $mediaType playback request after media end',
    async (caseData) => {
      const playbackEnded = vi.fn();
      const source: PreviewSourceDescriptor = {
        id: `playback:${caseData.mediaType}-a`,
        role: caseData.role,
        title: caseData.assetPath,
        asset: {
          kind: 'asset-identity',
          path: caseData.assetPath,
          mediaType: caseData.mediaType,
        },
      };
      const playbackControl: PreviewPlaybackControl = {
        requestId: 'route-playback-1',
        state: 'playing',
        startTimeSeconds: 0,
        onEnded: playbackEnded,
      };

      await act(async () => {
        root.render(
          <PreviewSurface
            source={source}
            surfaceKind="overlay"
            playbackControl={playbackControl}
          />,
        );
      });

      const probe = latestMessageOfType('media:probe');
      expect(probe).toMatchObject({
        type: 'media:probe',
        assetPath: caseData.assetPath,
        mediaType: caseData.mediaType,
      });
      const nodeId = readString(probe['nodeId']);
      if (!nodeId) throw new Error('media:probe did not include a node id');

      await act(async () => {
        mockWindow.dispatchMessage({
          type: 'media:probeResult',
          nodeId,
          mediaInfo: mediaInfoFor(caseData.mediaType),
        });
      });
      expect(latestMessageOfType('media:play')).toMatchObject({
        type: 'media:play',
        nodeId,
        mediaType: caseData.mediaType,
        startTime: 0,
      });

      await act(async () => {
        mockWindow.dispatchMessage({
          type: 'media:streamReady',
          nodeId,
          mediaInfo: mediaInfoFor(caseData.mediaType),
          ...caseData.readyDescriptors,
          startTime: 0,
          playbackRate: 1,
        });
      });

      const endedButton = host.querySelector<HTMLButtonElement>(
        `[data-testid="${caseData.endedTestId}"]`,
      );
      if (!endedButton) throw new Error('inline media player was not rendered');
      expect(
        host.querySelector<HTMLElement>(`[data-preview-surface="${caseData.mediaType}"]`)?.dataset
          .mediaDuration,
      ).toBe('2');

      await act(async () => {
        endedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => undefined);

      expect(playbackEnded).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: source.id,
          mediaType: caseData.mediaType,
          currentTime: 2,
          duration: 2,
        }),
      );
      expect(messagesOfType('media:stop')).toHaveLength(1);
      expect(messagesOfType('media:probe')).toHaveLength(1);
    },
  );

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/hover.mp4',
      readyDescriptors: {
        video: {
          version: 1,
          transport: 'authorized',
          url: 'neko-media://desktop/canvas-hover-video/hover.mp4',
          mimeType: 'video/mp4',
          preparationProfile: 'h264-mp4-direct',
          durationSeconds: 2,
        },
      },
      endedTestId: 'inline-video-ended',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/hover.aac',
      readyDescriptors: {
        audio: {
          version: 1,
          transport: 'authorized',
          protocol: 'neko-pcm-f32le-v1',
          streamUrl: 'neko-media://desktop/canvas-hover-audio/hover.pcm',
          sampleRate: 48_000,
          channels: 2,
        },
      },
      endedTestId: 'inline-audio-ended',
    },
  ])(
    'stops and releases transient $mediaType playback when hover ownership ends',
    async (caseData) => {
      const source: PreviewSourceDescriptor = {
        id: `hover:${caseData.mediaType}`,
        role: caseData.role,
        title: caseData.assetPath,
        asset: {
          kind: 'asset-identity',
          path: caseData.assetPath,
          mediaType: caseData.mediaType,
        },
      };

      await act(async () => {
        root.render(
          <PreviewSurface
            source={source}
            playbackControl={{
              requestId: `hover-${caseData.mediaType}-1`,
              state: 'playing',
              startTimeSeconds: 0,
              persistence: 'transient',
            }}
          />,
        );
      });
      const probe = latestMessageOfType('media:probe');
      const nodeId = readString(probe['nodeId']);
      if (!nodeId) throw new Error('hover media probe did not include a node id');
      await act(async () => {
        mockWindow.dispatchMessage({
          type: 'media:probeResult',
          nodeId,
          mediaInfo: mediaInfoFor(caseData.mediaType),
        });
      });
      await act(async () => {
        mockWindow.dispatchMessage({
          type: 'media:streamReady',
          nodeId,
          mediaInfo: mediaInfoFor(caseData.mediaType),
          ...caseData.readyDescriptors,
          startTime: 0,
          playbackRate: 1,
        });
      });
      expect(messagesOfType('media:play')).toHaveLength(1);
      expect(host.querySelector(`[data-testid="${caseData.endedTestId}"]`)).not.toBeNull();

      await act(async () => {
        root.render(
          <PreviewSurface
            source={source}
            playbackControl={{
              requestId: `hover-${caseData.mediaType}-1`,
              state: 'stopped',
              startTimeSeconds: 0,
              persistence: 'transient',
            }}
          />,
        );
      });

      expect(messagesOfType('media:stop')).toHaveLength(1);
      expect(usePlaybackStore.getState().playbacks.size).toBe(0);
      expect(usePlaybackStore.getState().activePlayback).toBeNull();
    },
  );

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/leave-before-probe.mp4',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/leave-before-probe.aac',
    },
  ])(
    'cancels pending transient $mediaType playback when hover ends before probe',
    async (caseData) => {
      const source: PreviewSourceDescriptor = {
        id: `pending-hover:${caseData.mediaType}`,
        role: caseData.role,
        asset: {
          kind: 'asset-identity',
          path: caseData.assetPath,
          mediaType: caseData.mediaType,
        },
      };

      await act(async () => {
        root.render(
          <PreviewSurface
            source={source}
            playbackControl={{
              requestId: `pending-hover-${caseData.mediaType}-1`,
              state: 'playing',
              startTimeSeconds: 0,
              persistence: 'transient',
            }}
          />,
        );
      });
      const nodeId = readString(latestMessageOfType('media:probe')['nodeId']);
      if (!nodeId) throw new Error('pending hover probe did not include a node id');

      await act(async () => {
        root.render(
          <PreviewSurface
            source={source}
            playbackControl={{
              requestId: `pending-hover-${caseData.mediaType}-1`,
              state: 'stopped',
              startTimeSeconds: 0,
              persistence: 'transient',
            }}
          />,
        );
      });
      await act(async () => {
        mockWindow.dispatchMessage({
          type: 'media:probeResult',
          nodeId,
          mediaInfo: mediaInfoFor(caseData.mediaType),
        });
      });

      expect(messagesOfType('media:play')).toHaveLength(0);
      expect(usePlaybackStore.getState().playbacks.size).toBe(0);
      expect(usePlaybackStore.getState().activePlayback).toBeNull();
    },
  );

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/unmount-hover.mp4',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/unmount-hover.aac',
    },
  ])('stops transient $mediaType playback when its preview surface unmounts', async (caseData) => {
    const source: PreviewSourceDescriptor = {
      id: `unmount-hover:${caseData.mediaType}`,
      role: caseData.role,
      asset: {
        kind: 'asset-identity',
        path: caseData.assetPath,
        mediaType: caseData.mediaType,
      },
    };
    await act(async () => {
      root.render(
        <PreviewSurface
          source={source}
          playbackControl={{
            requestId: `unmount-hover-${caseData.mediaType}-1`,
            state: 'playing',
            startTimeSeconds: 0,
            persistence: 'transient',
          }}
        />,
      );
    });
    const nodeId = readString(latestMessageOfType('media:probe')['nodeId']);
    if (!nodeId) throw new Error('unmount hover probe did not include a node id');
    await act(async () => {
      mockWindow.dispatchMessage({
        type: 'media:probeResult',
        nodeId,
        mediaInfo: mediaInfoFor(caseData.mediaType),
      });
    });
    expect(messagesOfType('media:play')).toHaveLength(1);

    await act(async () => {
      root.render(<div data-testid="hidden-canvas" />);
    });

    expect(messagesOfType('media:stop')).toHaveLength(1);
    expect(usePlaybackStore.getState().playbacks.size).toBe(0);
    expect(usePlaybackStore.getState().activePlayback).toBeNull();
  });

  it('restarts inline video from zero when the saved position is at media end', async () => {
    const assetPath = 'clips/replay.mp4';
    usePlaybackStore.setState({
      playbacks: new Map([
        [
          assetPath,
          {
            currentTime: 2,
            duration: 2,
            wasPlaying: false,
            savedAt: Date.now(),
          },
        ],
      ]),
    });

    await act(async () => {
      root.render(
        <PreviewSurface
          source={{
            id: 'replay-video',
            role: 'video-proxy',
            title: assetPath,
            asset: {
              kind: 'asset-identity',
              path: assetPath,
              mediaType: 'video',
            },
          }}
        />,
      );
    });

    const probe = latestMessageOfType('media:probe');
    const nodeId = readString(probe['nodeId']);
    if (!nodeId) throw new Error('media:probe did not include a node id');
    await act(async () => {
      mockWindow.dispatchMessage({
        type: 'media:probeResult',
        nodeId,
        mediaInfo: mediaInfoFor('video'),
      });
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[title="Play"]')?.click();
    });

    expect(latestMessageOfType('media:play')).toMatchObject({
      type: 'media:play',
      nodeId,
      mediaType: 'video',
      startTime: 0,
    });
  });

  function messagesOfType(type: string): Record<string, unknown>[] {
    return postMessage.mock.calls
      .map((call) => call[0])
      .filter((message): message is Record<string, unknown> => {
        return isRecord(message) && message['type'] === type;
      });
  }

  function latestMessageOfType(type: string): Record<string, unknown> {
    const messages = messagesOfType(type);
    const message = messages[messages.length - 1];
    if (!message) throw new Error(`Expected ${type} message`);
    return message;
  }
});

function mediaInfoFor(mediaType: 'video' | 'audio'): Record<string, unknown> {
  return {
    duration: 2,
    width: mediaType === 'video' ? 320 : undefined,
    height: mediaType === 'video' ? 180 : undefined,
    fps: mediaType === 'video' ? 24 : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
