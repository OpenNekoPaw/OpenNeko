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
import { MediaRuntimeUnavailableError } from '@neko/media';
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
    await message({
      type: 'ready',
      nativeVideoCapabilities: { version: 1, av1Mp4: true, vp9Mp4: true },
    });

    const payload = panel.webview.postMessage.mock.calls[0]?.[0];
    expect(payload).toEqual({
      type: 'preview:init',
      payload: { mediaInfo: MEDIA_INFO, displayName: 'video.mp4' },
    });
    expect(JSON.stringify(payload)).not.toContain('/media/video.mp4');
  });

  it('skips optional poster capture when playback still requires hardware qualification', async () => {
    service.planVideo.mockResolvedValueOnce('h264-sdr-transcode');
    service.startPlayback.mockRejectedValueOnce(
      new MediaRuntimeUnavailableError('AV1 VideoToolbox decoder'),
    );
    const { panel, message } = await resolve(provider);

    await message({
      type: 'ready',
      nativeVideoCapabilities: { version: 1, av1Mp4: false, vp9Mp4: false },
    });
    await message({ type: 'preview:play', startTime: 0, speed: 1 });

    expect(service.planVideo).toHaveBeenCalledWith('/media/video.mp4', {
      nativeVideoCapabilities: { version: 1, av1Mp4: false, vp9Mp4: false },
    });
    expect(service.captureFrame).not.toHaveBeenCalled();
    expect(
      panel.webview.postMessage.mock.calls
        .map(([payload]) => payload)
        .filter((payload) => payload.type === 'preview:operationFailed'),
    ).toEqual([
      {
        type: 'preview:operationFailed',
        payload: {
          operation: 'playback',
          code: 'hardware-decoder-unavailable',
        },
      },
    ]);
  });

  it('restarts playback through native video/PCM descriptors for play and seek', async () => {
    const { panel, message } = await resolve(provider);
    await message({
      type: 'ready',
      nativeVideoCapabilities: { version: 1, av1Mp4: true, vp9Mp4: true },
    });

    await message({ type: 'preview:play', startTime: 4, speed: 1.5 });
    await message({ type: 'preview:seek', time: 12, speed: 0.75 });

    expect(service.startPlayback).toHaveBeenNthCalledWith(
      1,
      '/media/video.mp4',
      MEDIA_INFO,
      'video',
      4,
      1.5,
      { nativeVideoCapabilities: { version: 1, av1Mp4: true, vp9Mp4: true } },
    );
    expect(service.stopPlayback).toHaveBeenCalledWith({
      audioSessionId: PLAYBACK.audioSessionId,
      audio: PLAYBACK.audio,
    });
    expect(service.startPlayback).toHaveBeenNthCalledWith(
      2,
      '/media/video.mp4',
      MEDIA_INFO,
      'audio',
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

  it('publishes only the latest playback generation during overlapping seeks', async () => {
    const first = deferred<PreviewPlayback>();
    const second = deferred<PreviewPlayback>();
    const seekPlayback: PreviewPlayback = {
      audioSessionId: 'seek-audio-session',
      audio: {
        ...PLAYBACK.audio!,
        streamUrl: 'http://127.0.0.1:1234/v1/cut-media/pcm/seek-token',
      },
    };
    service.startPlayback
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { panel, dispatch } = await resolve(provider);

    dispatch({ type: 'preview:play', startTime: 4, speed: 1 });
    await vi.waitFor(() => expect(service.startPlayback).toHaveBeenCalledTimes(1));
    dispatch({ type: 'preview:seek', time: 40, speed: 1 });
    await new Promise<void>((resolveTick) => setTimeout(resolveTick, 0));
    expect(service.startPlayback).toHaveBeenCalledTimes(1);

    first.resolve(PLAYBACK);
    await vi.waitFor(() => expect(service.startPlayback).toHaveBeenCalledTimes(2));
    expect(service.stopPlayback).toHaveBeenCalledWith({
      audioSessionId: PLAYBACK.audioSessionId,
      audio: PLAYBACK.audio,
    });
    expect(panel.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview:playbackReady' }),
    );

    second.resolve(seekPlayback);
    await vi.waitFor(() =>
      expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
        type: 'preview:playbackReady',
        payload: {
          video: PLAYBACK.video,
          audio: seekPlayback.audio,
          startTime: 40,
          playbackRate: 1,
        },
      }),
    );
  });

  it('stops the active runtime sessions on stop and panel disposal', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'preview:play' });
    await message({ type: 'preview:stop' });
    await message({ type: 'preview:play' });

    const dispose = panel.onDidDispose.mock.calls[0]?.[0] as () => void;
    dispose();
    await vi.waitFor(() => expect(service.stopPlayback).toHaveBeenCalledTimes(4));
    expect(statusBar.hide).toHaveBeenCalled();
  });

  it('releases spent PCM at EOF and replays without republishing the video session', async () => {
    const { message } = await resolve(provider);
    await message({ type: 'preview:play', startTime: 0, speed: 1 });
    await message({ type: 'preview:eof' });

    expect(service.stopPlayback).toHaveBeenCalledWith({
      audioSessionId: PLAYBACK.audioSessionId,
      audio: PLAYBACK.audio,
    });
    service.stopPlayback.mockClear();
    await message({ type: 'preview:play', startTime: 0, speed: 1 });

    expect(service.startPlayback).toHaveBeenNthCalledWith(
      2,
      '/media/video.mp4',
      MEDIA_INFO,
      'audio',
      0,
      1,
    );
    expect(service.startPlayback).toHaveBeenCalledTimes(2);
    expect(service.stopPlayback).not.toHaveBeenCalledWith(
      expect.objectContaining({ videoSessionId: PLAYBACK.videoSessionId }),
    );
  });

  it('captures an optional poster after selecting a qualified direct route', async () => {
    const { panel, message } = await resolve(provider);
    await message({
      type: 'ready',
      nativeVideoCapabilities: { version: 1, av1Mp4: true, vp9Mp4: true },
    });

    expect(service.planVideo).toHaveBeenCalled();
    expect(service.captureFrame).toHaveBeenCalledWith('/media/video.mp4', 0);
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:frameData',
      payload: { imageDataUrl: 'data:image/jpeg;base64,frame' },
    });
  });

  it('observes poster capture failures without rejecting the VS Code event callback', async () => {
    service.captureFrame.mockRejectedValueOnce(
      new MediaRuntimeUnavailableError(
        'hardware-only HDR frame capture',
        'HDR frame capture would require a CPU video-filter/readback path and is disabled.',
      ),
    );
    const { panel, message } = await resolve(provider);

    await expect(
      message({
        type: 'ready',
        nativeVideoCapabilities: { version: 1, av1Mp4: true, vp9Mp4: true },
      }),
    ).resolves.toBeUndefined();
    await vi.waitFor(() =>
      expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
        type: 'preview:operationFailed',
        payload: {
          operation: 'captureFrame',
          code: 'hdr-poster-unavailable',
        },
      }),
    );
  });

  it('projects unavailable VideoToolbox decode as a structured playback diagnostic', async () => {
    service.startPlayback.mockRejectedValueOnce(
      new MediaRuntimeUnavailableError('AV1 VideoToolbox decoder'),
    );
    const { panel, message } = await resolve(provider);

    await message({ type: 'preview:play', startTime: 0, speed: 1 });

    await vi.waitFor(() =>
      expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
        type: 'preview:operationFailed',
        payload: {
          operation: 'playback',
          code: 'hardware-decoder-unavailable',
        },
      }),
    );
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

  it('fails visibly for an unknown Webview message without leaking a rejection', async () => {
    const { panel, message } = await resolve(provider);
    await expect(message({ type: 'legacy:engine-play' })).resolves.toBeUndefined();
    await vi.waitFor(() =>
      expect(panel.webview.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'preview:operationFailed',
          payload: expect.objectContaining({ operation: 'protocol' }),
        }),
      ),
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
    planVideo: vi.fn().mockResolvedValue('h264-mp4-direct'),
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
  const callback = panel.webview.onDidReceiveMessage.mock.calls[0]?.[0] as (
    value: Record<string, unknown>,
  ) => void;
  const message = async (value: Record<string, unknown>): Promise<void> => {
    callback(value);
    await new Promise<void>((resolveTick) => setTimeout(resolveTick, 0));
  };
  return { panel, message, dispatch: callback };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
