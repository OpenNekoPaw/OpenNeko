import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({ fsPath: filePath, path: filePath }),
    joinPath: (base: { path: string }, ...segments: string[]) => ({
      path: [base.path, ...segments].join('/'),
    }),
  },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../../utils/html', () => ({
  getWebviewHtml: vi.fn(() => '<html>panorama-video</html>'),
}));

vi.mock('../../services/PreviewService', () => ({
  PreviewService: { tryCreate: vi.fn() },
}));

import * as vscode from 'vscode';
import type { PreviewManifest } from '@neko/shared';
import { PanoramicVideoPreviewProvider } from '../PanoramicVideoPreviewProvider';
import type { MediaInfo, PreviewPlayback } from '../../services/PreviewService';

const MEDIA_INFO: MediaInfo = {
  duration: 60,
  width: 3840,
  height: 1920,
  fps: 30,
  codec: 'h264',
  format: 'mp4',
  hasAudio: true,
  audioCodec: 'aac',
  audioSampleRate: 48_000,
  audioChannels: 2,
};

const MANIFEST: PreviewManifest = {
  manifestVersion: 1,
  assetId: 'video-asset',
  token: 'video-token',
  kind: 'video',
  status: 'ready',
  sourceName: 'tour_360.mp4',
  sourceUrl: 'http://127.0.0.1:1234/v1/cut-media/file/token',
  createdAt: '2026-07-26T00:00:00.000Z',
  media: {
    mimeType: 'video/mp4',
    fileSizeBytes: 2048,
    dynamicRange: 'sdr',
    dimensions: { width: 3840, height: 1920 },
    codec: { videoCodec: 'h264', container: 'mp4', durationSecs: 60 },
  },
  projection: {
    type: 'equirectangular',
    source: 'filename',
    confidence: 'trusted-filename',
  },
  variants: [],
};

const PLAYBACK: PreviewPlayback = {
  videoSessionId: 'video-session',
  audioSessionId: 'audio-session',
  video: {
    version: 1,
    transport: 'http',
    url: 'http://127.0.0.1:1234/v1/cut-media/file/prepared',
    mimeType: 'video/mp4',
    preparationProfile: 'h264-mp4-direct',
    durationSeconds: 60,
  },
  audio: {
    version: 1,
    transport: 'http',
    protocol: 'neko-pcm-f32le-v1',
    streamUrl: 'http://127.0.0.1:1234/v1/cut-media/pcm/audio',
    sampleRate: 48_000,
    channels: 2,
  },
};

describe('PanoramicVideoPreviewProvider Node media path', () => {
  let service: ReturnType<typeof createService>;
  let provider: PanoramicVideoPreviewProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
    provider = new PanoramicVideoPreviewProvider(
      vscode.Uri.file('/extension'),
      { show: vi.fn(), hide: vi.fn(), updatePlayback: vi.fn(), dispose: vi.fn() } as never,
      async () => service as never,
    );
  });

  it('initializes from a tokenized manifest without exposing the host path', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });

    expect(service.registerPreviewAsset).toHaveBeenCalledWith({
      source: '/media/tour_360.mp4',
      kind: 'video',
    });
    const init = panel.webview.postMessage.mock.calls[0]?.[0];
    expect(init).toEqual({ type: 'panorama:init', payload: { manifest: MANIFEST } });
    expect(JSON.stringify(init)).not.toContain('/media/tour_360.mp4');
  });

  it('starts native video plus PCM descriptors through PreviewService', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'preview:play', startTime: 6, speed: 1.25 });

    expect(service.probeMedia).toHaveBeenCalledWith('/media/tour_360.mp4');
    expect(service.startPlayback).toHaveBeenCalledWith(
      '/media/tour_360.mp4',
      MEDIA_INFO,
      'video',
      6,
      1.25,
    );
    expect(panel.webview.postMessage).toHaveBeenLastCalledWith({
      type: 'preview:playbackReady',
      payload: {
        video: PLAYBACK.video,
        audio: PLAYBACK.audio,
        startTime: 6,
        playbackRate: 1.25,
      },
    });
  });

  it('replaces the active sessions on seek', async () => {
    const { message } = await resolve(provider);
    await message({ type: 'preview:play' });
    await message({ type: 'preview:seek', time: 20, speed: 0.75 });

    expect(service.stopPlayback).toHaveBeenCalledWith(PLAYBACK);
    expect(service.startPlayback).toHaveBeenLastCalledWith(
      '/media/tour_360.mp4',
      MEDIA_INFO,
      'video',
      20,
      0.75,
    );
  });

  it('stops playback and unregisters the manifest on disposal', async () => {
    const { panel, message } = await resolve(provider);
    await message({ type: 'ready' });
    await message({ type: 'preview:play' });
    const dispose = panel.onDidDispose.mock.calls[0]?.[0] as () => void;
    dispose();

    await vi.waitFor(() => {
      expect(service.stopPlayback).toHaveBeenCalledWith(PLAYBACK);
      expect(service.unregisterPreviewAsset).toHaveBeenCalledWith('video-asset');
    });
  });

  it('fails visibly for an unknown control message', async () => {
    const { message } = await resolve(provider);
    await expect(message({ type: 'legacy:engine-control' })).rejects.toThrow(
      'Unknown panoramic video message',
    );
  });
});

function createService() {
  return {
    isAvailable: true,
    registerPreviewAsset: vi.fn().mockResolvedValue(MANIFEST),
    unregisterPreviewAsset: vi.fn().mockResolvedValue(undefined),
    probeMedia: vi.fn().mockResolvedValue(MEDIA_INFO),
    startPlayback: vi.fn().mockResolvedValue(PLAYBACK),
    stopPlayback: vi.fn().mockResolvedValue(undefined),
  };
}

async function resolve(provider: PanoramicVideoPreviewProvider) {
  const panel = createPanel();
  await provider.resolveCustomEditor(
    { uri: vscode.Uri.file('/media/tour_360.mp4'), dispose: vi.fn() },
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
    webview: {
      options: {},
      html: '',
      cspSource: 'https://webview.csp',
      asWebviewUri: vi.fn((uri: { path: string }) => uri.path),
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      postMessage: vi.fn().mockResolvedValue(true),
    },
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
  };
}
