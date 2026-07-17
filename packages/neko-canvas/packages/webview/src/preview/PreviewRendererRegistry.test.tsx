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

type InlineVideoPlayerMockProps = {
  readonly duration: number;
  readonly onStop: (currentTime: number) => void;
  readonly onEnded?: (currentTime: number) => void;
};

type InlineAudioPlayerMockProps = InlineVideoPlayerMockProps;

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
    InlineAudioPlayer: ({ duration, onStop, onEnded }: InlineAudioPlayerMockProps) =>
      ReactModule.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'inline-audio-ended',
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

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const api = createMockVSCodeApi();
    postMessage = vi.fn<(message: unknown) => void>((message) => {
      api.postedMessages.push(message);
    });
    api.postMessage = postMessage;
    mockWindow = installMockWebviewWindow(api);
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
    resetVSCodeApi();
    vi.restoreAllMocks();
  });

  it.each([
    {
      role: 'video-proxy' as const,
      mediaType: 'video' as const,
      assetPath: 'clips/a.mp4',
      readyUrls: { videoStreamUrl: 'ws://video/a', audioStreamUrl: null },
      endedTestId: 'inline-video-ended',
    },
    {
      role: 'audio-waveform' as const,
      mediaType: 'audio' as const,
      assetPath: 'audio/a.wav',
      readyUrls: { videoStreamUrl: null, audioStreamUrl: 'ws://audio/a' },
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
          ...caseData.readyUrls,
        });
      });

      const endedButton = host.querySelector<HTMLButtonElement>(
        `[data-testid="${caseData.endedTestId}"]`,
      );
      if (!endedButton) throw new Error('inline media player was not rendered');

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
