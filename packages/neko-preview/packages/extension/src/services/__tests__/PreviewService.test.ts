import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewService, type PreviewMediaRuntime } from '../PreviewService';

vi.mock('vscode', () => ({}));

const videoProbe = {
  durationSeconds: 12,
  formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
  bitRate: 1_500_000,
  video: {
    streamIndex: 0,
    codecName: 'h264',
    pixelFormat: 'yuv420p',
    bitDepth: 8,
    width: 1920,
    height: 1080,
    framesPerSecond: 24,
    color: {},
  },
  audioStreams: [
    {
      streamIndex: 1,
      codecName: 'aac',
      sampleRate: 48_000,
      channels: 2,
    },
  ],
} as const;

function createRuntime(): PreviewMediaRuntime {
  return {
    probe: vi.fn(async () => videoProbe),
    captureFrame: vi.fn(async () => 'data:image/jpeg;base64,AA=='),
    generateWaveform: vi.fn(async () => ({
      peaks: [0.1, 0.5],
      durationSeconds: 12,
      sampleRate: 48_000,
    })),
    prepareVideo: vi.fn(async () => ({
      sessionId: 'video-session',
      video: {
        version: 1,
        transport: 'http',
        url: 'http://127.0.0.1:1234/media/video',
        mimeType: 'video/mp4',
        preparationProfile: 'h264-mp4-direct',
        durationSeconds: 12,
      },
    })),
    publishFile: vi.fn(async () => ({
      sessionId: 'file-session',
      url: 'http://127.0.0.1:1234/media/file',
    })),
    startPcm: vi.fn(async () => ({
      sessionId: 'audio-session',
      stream: {
        version: 1,
        transport: 'http',
        protocol: 'neko-pcm-f32le-v1',
        streamUrl: 'http://127.0.0.1:1234/pcm/audio',
        sampleRate: 48_000,
        channels: 2,
      },
    })),
    stop: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

describe('PreviewService Node media adapter', () => {
  let runtime: PreviewMediaRuntime;
  let service: PreviewService;

  beforeEach(() => {
    runtime = createRuntime();
    service = new PreviewService(runtime);
  });

  it('projects ffprobe metadata without an Engine bridge', async () => {
    await expect(service.probeMedia('/fixture/input.mp4')).resolves.toEqual({
      duration: 12,
      width: 1920,
      height: 1080,
      fps: 24,
      codec: 'h264',
      format: 'mov,mp4,m4a,3gp,3g2,mj2',
      bitrate: 1_500_000,
      hasAudio: true,
      audioCodec: 'aac',
      audioSampleRate: 48_000,
      audioChannels: 2,
    });
  });

  it('returns native video and PCM descriptors and releases both sessions', async () => {
    const mediaInfo = await service.probeMedia('/fixture/input.mp4');
    const playback = await service.startPlayback('/fixture/input.mp4', mediaInfo, 'video', 3, 1.25);

    expect(runtime.prepareVideo).toHaveBeenCalledWith('/fixture/input.mp4');
    expect(runtime.startPcm).toHaveBeenCalledWith('/fixture/input.mp4', {
      startTimeSeconds: 3,
      durationSeconds: 9,
      playbackRate: 1.25,
    });
    expect(playback.video?.transport).toBe('http');
    expect(playback.audio?.protocol).toBe('neko-pcm-f32le-v1');

    await service.stopPlayback(playback);
    expect(runtime.stop).toHaveBeenCalledWith('video-session');
    expect(runtime.stop).toHaveBeenCalledWith('audio-session');
  });

  it('uses the owning provider kind instead of media dimensions to select video preparation', async () => {
    const mediaInfo = {
      ...(await service.probeMedia('/fixture/input.mp4')),
      width: 0,
      height: 0,
    };

    const videoPlayback = await service.startPlayback('/fixture/input.mp4', mediaInfo, 'video');
    expect(videoPlayback.video?.transport).toBe('http');
    expect(runtime.prepareVideo).toHaveBeenCalledWith('/fixture/input.mp4');

    vi.mocked(runtime.prepareVideo).mockClear();
    const audioPlayback = await service.startPlayback('/fixture/input.mp4', mediaInfo, 'audio');
    expect(audioPlayback.video).toBeUndefined();
    expect(runtime.prepareVideo).not.toHaveBeenCalled();
  });

  it('delegates waveform and frame extraction to the canonical runtime', async () => {
    await expect(service.getWaveform('/fixture/input.flac')).resolves.toEqual({
      peaks: [0.1, 0.5],
      duration: 12,
      sampleRate: 48_000,
    });
    await expect(service.captureFrame('/fixture/input.mp4', 4, 90)).resolves.toBe(
      'data:image/jpeg;base64,AA==',
    );
    expect(runtime.captureFrame).toHaveBeenCalledWith('/fixture/input.mp4', 4, { quality: 90 });
  });

  it('disposes the owned runtime and rejects subsequent playback', async () => {
    await service.dispose();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    const mediaInfo = await service.probeMedia('/fixture/input.mp4');
    await expect(service.startPlayback('/fixture/input.mp4', mediaInfo, 'video')).rejects.toThrow(
      'PreviewService is disposed',
    );
  });
});
