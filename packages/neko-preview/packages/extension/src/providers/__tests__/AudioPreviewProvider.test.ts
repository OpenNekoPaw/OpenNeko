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
  getWebviewHtml: vi.fn(() => '<html>audio</html>'),
}));

vi.mock('../../services/PreviewService', () => ({
  PreviewService: { tryCreate: vi.fn() },
}));

import * as vscode from 'vscode';
import { AudioPreviewProvider } from '../AudioPreviewProvider';
import type { MediaInfo, PreviewPlayback } from '../../services/PreviewService';

const MEDIA_INFO: MediaInfo = {
  duration: 240,
  width: 0,
  height: 0,
  fps: 0,
  codec: '',
  format: 'flac',
  hasAudio: true,
  audioCodec: 'flac',
  audioSampleRate: 96_000,
  audioChannels: 6,
};

const PLAYBACK: PreviewPlayback = {
  audioSessionId: 'audio-session',
  audio: {
    version: 1,
    transport: 'http',
    protocol: 'neko-pcm-f32le-v1',
    streamUrl: 'http://127.0.0.1:1234/v1/cut-media/pcm/token',
    sampleRate: 48_000,
    channels: 2,
  },
};

describe('AudioPreviewProvider PCM path', () => {
  let statusBar: ReturnType<typeof createStatusBar>;
  let service: ReturnType<typeof createPreviewService>;
  let waveform: ReturnType<typeof vi.fn>;
  let provider: AudioPreviewProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    statusBar = createStatusBar();
    service = createPreviewService();
    waveform = vi.fn().mockResolvedValue({
      peaks: [0.1, 0.5, 0.3],
      duration: 240,
      sampleRate: 48_000,
    });
    provider = new AudioPreviewProvider(
      vscode.Uri.file('/extension'),
      statusBar as never,
      async () => service as never,
      waveform,
    );
  });

  it('probes and initializes metadata plus waveform without exposing the host path', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });

    expect(service.probeMedia).toHaveBeenCalledWith('/media/audio.flac');
    expect(waveform).toHaveBeenCalledWith('/media/audio.flac', service);
    expect(panel.webview.postMessage).toHaveBeenNthCalledWith(1, {
      type: 'preview:init',
      payload: { mediaInfo: MEDIA_INFO, displayName: 'audio.flac' },
    });
    expect(panel.webview.postMessage).toHaveBeenNthCalledWith(2, {
      type: 'preview:waveform',
      payload: { peaks: [0.1, 0.5, 0.3], duration: 240, sampleRate: 48_000 },
    });
    expect(JSON.stringify(panel.webview.postMessage.mock.calls)).not.toContain('/media/audio.flac');
  });

  it('reports probe failures without attempting playback', async () => {
    service.probeMedia.mockRejectedValueOnce(new Error('unsupported audio stream'));
    const { panel } = await resolve(provider);
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));

    expect(panel.webview.html).toContain('Failed to prepare audio preview');
    expect(panel.webview.html).toContain('unsupported audio stream');
    expect(service.startPlayback).not.toHaveBeenCalled();
  });

  it('starts PCM at the requested time and restarts it on seek', async () => {
    const { panel, message } = await resolve(provider);

    await message({ type: 'preview:play', startTime: 5, speed: 1.25 });
    await message({ type: 'preview:seek', time: 30, speed: 0.5 });

    expect(service.startPlayback).toHaveBeenNthCalledWith(
      1,
      '/media/audio.flac',
      MEDIA_INFO,
      'audio',
      5,
      1.25,
    );
    expect(service.stopPlayback).toHaveBeenCalledWith(PLAYBACK);
    expect(service.startPlayback).toHaveBeenNthCalledWith(
      2,
      '/media/audio.flac',
      MEDIA_INFO,
      'audio',
      30,
      0.5,
    );
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:playbackReady',
      payload: { audio: PLAYBACK.audio, startTime: 30, playbackRate: 0.5 },
    });
  });

  it('publishes only the latest PCM generation during overlapping seeks', async () => {
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
    const { panel, message } = await resolve(provider);

    const playRequest = message({ type: 'preview:play', startTime: 5, speed: 1 });
    await vi.waitFor(() => expect(service.startPlayback).toHaveBeenCalledTimes(1));
    const seekRequest = message({ type: 'preview:seek', time: 60, speed: 1 });
    await new Promise<void>((resolveTick) => setTimeout(resolveTick, 0));
    expect(service.startPlayback).toHaveBeenCalledTimes(1);

    first.resolve(PLAYBACK);
    await vi.waitFor(() => expect(service.startPlayback).toHaveBeenCalledTimes(2));
    expect(service.stopPlayback).toHaveBeenCalledWith(PLAYBACK);
    expect(panel.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview:playbackReady' }),
    );

    second.resolve(seekPlayback);
    await Promise.all([playRequest, seekRequest]);
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:playbackReady',
      payload: {
        audio: seekPlayback.audio,
        startTime: 60,
        playbackRate: 1,
      },
    });
  });

  it('stops PCM on request and disposal', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'preview:play' });
    await message({ type: 'preview:stop' });
    await message({ type: 'preview:play' });

    const dispose = panel.onDidDispose.mock.calls[0]?.[0] as () => void;
    dispose();
    await vi.waitFor(() => expect(service.stopPlayback).toHaveBeenCalledTimes(2));
  });

  it('releases the finite PCM generation at EOF', async () => {
    const { message } = await resolve(provider);
    await message({ type: 'preview:play' });
    await message({ type: 'preview:eof' });

    expect(service.stopPlayback).toHaveBeenCalledWith(PLAYBACK);
  });

  it('observes playback rejection and projects an operation-scoped failure', async () => {
    service.startPlayback.mockRejectedValueOnce(new Error('PCM decoder unavailable'));
    const { panel, message } = await resolve(provider);

    await expect(message({ type: 'preview:play' })).rejects.toThrow('PCM decoder unavailable');
    await vi.waitFor(() =>
      expect(panel.webview.postMessage).toHaveBeenCalledWith({
        type: 'preview:operationFailed',
        payload: {
          operation: 'playback',
          message: 'PCM decoder unavailable',
        },
      }),
    );
  });

  it('keeps pause/resume/speed in the Webview and projects status updates', async () => {
    const { message } = await resolve(provider);
    await expect(message({ type: 'preview:pause' })).resolves.toBeUndefined();
    await expect(message({ type: 'preview:resume' })).resolves.toBeUndefined();
    await expect(message({ type: 'preview:speed', speed: 2 })).resolves.toBeUndefined();
    await message({ type: 'preview:statusUpdate', playbackState: 'paused', currentTime: 18 });

    expect(service.startPlayback).not.toHaveBeenCalled();
    expect(statusBar.updatePlayback).toHaveBeenCalledWith('paused', 18);
  });

  it('updates the status bar when the panel visibility changes', async () => {
    const { panel } = await resolve(provider);
    const onViewState = panel.onDidChangeViewState.mock.calls[0]?.[0] as () => Promise<void>;
    panel.visible = false;
    await onViewState();
    expect(statusBar.hide).toHaveBeenCalled();
    panel.visible = true;
    await onViewState();
    expect(statusBar.show).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fileName: 'audio.flac',
        audioCodec: 'flac',
        audioChannels: 6,
      }),
    );
  });

  it('fails visibly for an unknown message', async () => {
    const { message } = await resolve(provider);
    await expect(message({ type: 'legacy:engine-stream' })).rejects.toThrow(
      'Unknown audio preview message',
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
  };
}

async function resolve(provider: AudioPreviewProvider) {
  const panel = createPanel();
  await provider.resolveCustomEditor(
    {
      uri: vscode.Uri.file('/media/audio.flac'),
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
