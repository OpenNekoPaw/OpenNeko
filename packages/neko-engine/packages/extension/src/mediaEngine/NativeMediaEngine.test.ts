import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const nativeEngine = {
    hasGpu: vi.fn(() => true),
    probeVideo: vi.fn(),
    dispatchAction: vi.fn(),
    captureFrame: vi.fn(),
    stopFrameServer: vi.fn(async () => undefined),
    gpuInfo: vi.fn(),
    cancelTask: vi.fn(),
  };

  const create = vi.fn(async () => nativeEngine);

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    nativeEngine,
    create,
    logger,
  };
});

vi.mock('@neko-engine/host-napi', () => ({
  NativeEngine: {
    create: mockState.create,
  },
}));

vi.mock('../base/logger', () => ({
  getLogger: vi.fn(() => mockState.logger),
}));

vi.mock('@neko/shared', () => ({
  COMPATIBLE_MODE_CAPABILITIES: {
    videoCodecs: [{ codec: 'h264', decode: true, encode: true }],
    audioCodecs: [{ codec: 'aac', decode: true, encode: true }],
    containerFormats: ['mp4'],
    hardwareAcceleration: false,
    maxResolution: { width: 3840, height: 2160 },
    hdrSupport: false,
    gpuEffects: false,
  },
}));

describe('NativeMediaEngine', () => {
  beforeEach(() => {
    mockState.create.mockClear();
    mockState.nativeEngine.hasGpu.mockReset();
    mockState.nativeEngine.hasGpu.mockReturnValue(true);
    mockState.nativeEngine.probeVideo.mockReset();
    mockState.nativeEngine.dispatchAction.mockReset();
    mockState.nativeEngine.captureFrame.mockReset();
    mockState.nativeEngine.stopFrameServer.mockReset();
    mockState.nativeEngine.stopFrameServer.mockResolvedValue(undefined);
    mockState.nativeEngine.gpuInfo.mockReset();
    mockState.nativeEngine.cancelTask.mockReset();
    mockState.logger.info.mockReset();
    mockState.logger.warn.mockReset();
    mockState.logger.error.mockReset();
  });

  it('maps NativeEngine probeVideo responses into MediaInfo', async () => {
    mockState.nativeEngine.probeVideo.mockResolvedValue(
      JSON.stringify({
        status: 'ok',
        data: {
          duration: 12.5,
          width: 1920,
          height: 1080,
          fps: 29.97,
          codec: 'h264',
          format: 'mp4',
          has_audio: true,
          audio_codec: 'aac',
          audio_sample_rate: 48000,
          audio_channels: 2,
          has_subtitles: true,
        },
      }),
    );

    const { NativeMediaEngine } = await import('./NativeMediaEngine');
    const engine = new NativeMediaEngine();

    await engine.initialize();
    const info = await engine.probeMedia('/tmp/demo.mp4');

    expect(mockState.create).toHaveBeenCalledTimes(1);
    expect(mockState.nativeEngine.probeVideo).toHaveBeenCalledWith('/tmp/demo.mp4');
    expect(info).toEqual({
      duration: 12.5,
      width: 1920,
      height: 1080,
      fps: 29.97,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioCodec: 'aac',
      audioSampleRate: 48000,
      audioChannels: 2,
      hasSubtitles: true,
    });
  });

  it('bridges audio decoder info and extract calls through dispatchAction', async () => {
    const pcm = new Float32Array([0.25, -0.25]);
    const pcmBase64 = Buffer.from(pcm.buffer).toString('base64');

    mockState.nativeEngine.dispatchAction
      .mockResolvedValueOnce(
        JSON.stringify({
          status: 'ok',
          data: {
            duration: 6,
            codec: 'aac',
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          status: 'ok',
          data: {
            data: pcmBase64,
            sample_rate: 44100,
            channels: 1,
          },
        }),
      );

    const { NativeMediaEngine } = await import('./NativeMediaEngine');
    const engine = new NativeMediaEngine();

    await engine.initialize();
    const decoder = await engine.createAudioDecoder({ source: '/tmp/audio.wav' });
    const mediaInfo = await decoder.open();
    const frame = await decoder.decodeAt(1.5);

    expect(mediaInfo).toMatchObject({
      duration: 6,
      codec: 'aac',
      format: 'audio',
      hasAudio: true,
    });
    expect(mockState.nativeEngine.dispatchAction).toHaveBeenNthCalledWith(
      1,
      'audios',
      'info',
      null,
      JSON.stringify({ source: '/tmp/audio.wav' }),
    );
    expect(mockState.nativeEngine.dispatchAction).toHaveBeenNthCalledWith(
      2,
      'audios',
      'extract',
      null,
      JSON.stringify({
        source: '/tmp/audio.wav',
        startTime: 1.5,
        endTime: 1.6,
      }),
    );
    expect(frame).not.toBeNull();
    expect(frame?.type).toBe('audio');
    if (frame?.type !== 'audio') {
      throw new Error('Expected the audio decoder to return an audio frame');
    }
    expect(frame).toMatchObject({
      type: 'audio',
      sampleRate: 44100,
      channels: 1,
      samplesPerChannel: 2,
      timestamp: 1.5,
      duration: 0.1,
    });
    expect(Array.from(frame.data)).toEqual([0.25, -0.25]);
  });

  it('stops the embedded frame server when disposing the wrapper', async () => {
    const { NativeMediaEngine } = await import('./NativeMediaEngine');
    const engine = new NativeMediaEngine();

    await engine.initialize();
    await engine.dispose();

    expect(mockState.nativeEngine.stopFrameServer).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe('disposed');
    expect(engine.engine).toBeNull();
  });
});
