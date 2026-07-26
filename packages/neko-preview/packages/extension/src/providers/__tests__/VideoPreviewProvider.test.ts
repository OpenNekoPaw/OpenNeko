import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      scheme: 'file',
      fsPath: filePath,
      path: filePath,
      toString: () => filePath,
    }),
    joinPath: (base: { path: string }, ...segments: string[]) => ({
      path: [base.path, ...segments].join('/'),
    }),
  },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../../utils/html', () => ({
  getWebviewHtml: vi.fn(() => '<html>video</html>'),
}));

vi.mock('../../services/PreviewService', () => ({
  PreviewService: { tryCreate: vi.fn() },
}));

import * as vscode from 'vscode';
import { VideoPreviewProvider } from '../VideoPreviewProvider';
import type { MediaInfo, PreviewPlayback } from '../../services/PreviewService';

const MEDIA_INFO: MediaInfo = {
  duration: 120,
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'h264',
  format: 'mp4',
  hasAudio: true,
  audioCodec: 'aac',
  audioSampleRate: 48_000,
  audioChannels: 2,
};

const PLAYBACK: PreviewPlayback = {
  videoSessionId: 'video-session',
  audioSessionId: 'audio-session',
  video: {
    version: 1,
    transport: 'http',
    url: 'http://127.0.0.1:1234/v1/cut-media/file/token',
    mimeType: 'video/mp4',
    preparationProfile: 'h264-mp4-direct',
    durationSeconds: 120,
  },
  audio: {
    version: 1,
    transport: 'http',
    protocol: 'neko-pcm-f32le-v1',
    streamUrl: 'http://127.0.0.1:1234/v1/cut-media/pcm/token',
    sampleRate: 48_000,
    channels: 2,
  },
};

describe('VideoPreviewProvider Node media path', () => {
  let statusBar: ReturnType<typeof createStatusBar>;
  let service: ReturnType<typeof createPreviewService>;
  let provider: VideoPreviewProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    statusBar = createStatusBar();
    service = createPreviewService();
    provider = new VideoPreviewProvider(
      vscode.Uri.file('/extension'),
      statusBar as never,
      async () => service as never,
    );
  });

  it('configures the Webview and probes through PreviewService', async () => {
    const { panel } = await resolve(provider);
    await Promise.resolve();

    expect(panel.webview.options).toEqual(expect.objectContaining({ enableScripts: true }));
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.pinEditor');
    expect(service.probeMedia).toHaveBeenCalledWith('/media/video.mp4');
    expect(panel.onDidChangeViewState).toHaveBeenCalledOnce();
    expect(panel.onDidDispose).toHaveBeenCalledOnce();
  });

  it('reports probe failures without attempting a legacy fallback', async () => {
    service.probeMedia.mockRejectedValueOnce(new Error('corrupt interval'));
    const { panel } = await resolve(provider);
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));

    expect(panel.webview.html).toContain('Failed to prepare video preview');
    expect(panel.webview.html).toContain('corrupt interval');
    expect(service.startPlayback).not.toHaveBeenCalled();
  });

  it('sends media metadata without exposing the host file path', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });

    const payload = panel.webview.postMessage.mock.calls[0]?.[0];
    expect(payload).toEqual({
      type: 'preview:init',
      payload: { mediaInfo: MEDIA_INFO, displayName: 'video.mp4' },
    });
    expect(JSON.stringify(payload)).not.toContain('/media/video.mp4');
  });

  it('restarts playback through native video/PCM descriptors for play and seek', async () => {
    const { panel, message } = await resolve(provider);

    await message({ type: 'preview:play', startTime: 4, speed: 1.5 });
    await message({ type: 'preview:seek', time: 12, speed: 0.75 });

    expect(service.startPlayback).toHaveBeenNthCalledWith(
      1,
      '/media/video.mp4',
      MEDIA_INFO,
      'video',
      4,
      1.5,
    );
    expect(service.stopPlayback).toHaveBeenCalledWith(PLAYBACK);
    expect(service.startPlayback).toHaveBeenNthCalledWith(
      2,
      '/media/video.mp4',
      MEDIA_INFO,
      'video',
      12,
      0.75,
    );
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:playbackReady',
      payload: {
        video: PLAYBACK.video,
        audio: PLAYBACK.audio,
        startTime: 12,
        playbackRate: 0.75,
      },
    });
  });

  it('stops the active runtime sessions on stop and panel disposal', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'preview:play' });
    await message({ type: 'preview:stop' });
    await message({ type: 'preview:play' });

    const dispose = panel.onDidDispose.mock.calls[0]?.[0] as () => void;
    dispose();
    await vi.waitFor(() => expect(service.stopPlayback).toHaveBeenCalledTimes(2));
    expect(statusBar.hide).toHaveBeenCalled();
  });

  it('captures a frame through FFmpeg and returns only a data URL', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'preview:captureFrame', time: 7.5 });

    expect(service.captureFrame).toHaveBeenCalledWith('/media/video.mp4', 7.5);
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:frameData',
      payload: { imageDataUrl: 'data:image/jpeg;base64,frame' },
    });
  });

  it('projects playback status and panel visibility into the status bar', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'preview:statusUpdate', playbackState: 'playing', currentTime: 9 });
    expect(statusBar.updatePlayback).toHaveBeenCalledWith('playing', 9);

    panel.visible = false;
    const onViewState = panel.onDidChangeViewState.mock.calls[0]?.[0] as () => Promise<void>;
    await onViewState();
    expect(statusBar.hide).toHaveBeenCalled();
    panel.visible = true;
    await onViewState();
    expect(statusBar.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileName: 'video.mp4', codec: 'h264', duration: 120 }),
    );
  });

  it('fails visibly for an unknown Webview message', async () => {
    const { message } = await resolve(provider);
    await expect(message({ type: 'legacy:engine-play' })).rejects.toThrow(
      'Unknown video preview message',
    );
  });
});

function createStatusBar() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    updatePlayback: vi.fn(),
    dispose: vi.fn(),
  };
}

function createPreviewService() {
  return {
    isAvailable: true,
    probeMedia: vi.fn().mockResolvedValue(MEDIA_INFO),
    startPlayback: vi.fn().mockResolvedValue(PLAYBACK),
    stopPlayback: vi.fn().mockResolvedValue(undefined),
    captureFrame: vi.fn().mockResolvedValue('data:image/jpeg;base64,frame'),
  };
}

async function resolve(provider: VideoPreviewProvider) {
  const panel = createPanel();
  await provider.resolveCustomEditor(
    {
      uri: vscode.Uri.file('/media/video.mp4'),
      dispose: vi.fn(),
    },
    panel as never,
    {} as never,
  );
  const message = panel.webview.onDidReceiveMessage.mock.calls[0]?.[0] as (
    value: Record<string, unknown>,
  ) => Promise<void>;
  return { panel, message };
}

function createPanel() {
  return {
    visible: true,
    webview: {
      options: {},
      html: '',
      cspSource: 'https://webview.csp',
      asWebviewUri: vi.fn((uri: { path: string }) => uri.path),
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      postMessage: vi.fn().mockResolvedValue(true),
    },
    onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
  };
}
