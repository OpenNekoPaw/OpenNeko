import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

const mockGetExtension = vi.fn();
const mockExecuteCommand = vi.fn();

vi.mock('vscode', () => ({
  Disposable: { from: vi.fn() },
  extensions: {
    getExtension: (...args: unknown[]) => mockGetExtension(...args),
  },
  commands: {
    executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  },
}));

// ============================================================================
// Mock @neko/neko-client
// ============================================================================

const mockProbeMedia = vi.fn();
const mockStartPlayback = vi.fn();
const mockStopPlayback = vi.fn();
const mockSeekPlayback = vi.fn();
const mockPausePlayback = vi.fn();
const mockResumePlayback = vi.fn();
const mockSetPlaybackSpeed = vi.fn();
const mockCaptureFrame = vi.fn();
const mockGetWaveform = vi.fn();
const mockGetStreamWebSocketUrl = vi.fn();
const mockGetAudioWebSocketUrl = vi.fn();
const mockRegisterPreviewAsset = vi.fn();
const mockRequestPreviewVariant = vi.fn();
const mockUpdatePreviewAssetMetadata = vi.fn();
const mockUnregisterPreviewAsset = vi.fn();

vi.mock('@neko/neko-client', () => ({
  EngineClient: vi.fn().mockImplementation(function (this: Record<string, unknown>, port: number) {
    this.port = port;
    this.registerPreviewAsset = mockRegisterPreviewAsset;
    this.requestPreviewVariant = mockRequestPreviewVariant;
    this.updatePreviewAssetMetadata = mockUpdatePreviewAssetMetadata;
    this.unregisterPreviewAsset = mockUnregisterPreviewAsset;
  }),
  MediaPlaybackService: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.probeMedia = mockProbeMedia;
    this.startPlayback = mockStartPlayback;
    this.stopPlayback = mockStopPlayback;
    this.seekPlayback = mockSeekPlayback;
    this.pausePlayback = mockPausePlayback;
    this.resumePlayback = mockResumePlayback;
    this.setPlaybackSpeed = mockSetPlaybackSpeed;
    this.captureFrame = mockCaptureFrame;
    this.getWaveform = mockGetWaveform;
    this.getStreamWebSocketUrl = mockGetStreamWebSocketUrl;
    this.getAudioWebSocketUrl = mockGetAudioWebSocketUrl;
  }),
}));

import { PreviewService, type MediaInfo } from '../../services/PreviewService';

// ============================================================================
// Helper to create an initialized PreviewService
// ============================================================================

async function createService(port = 8080): Promise<PreviewService> {
  mockGetExtension.mockReturnValue({
    id: 'neko.neko-engine',
    isActive: true,
    activate: vi.fn(),
  });
  mockExecuteCommand.mockResolvedValue({ port });
  mockGetStreamWebSocketUrl.mockImplementation(
    (id: string) => `ws://127.0.0.1:${port}/v1/streams/${id}`,
  );
  mockGetAudioWebSocketUrl.mockImplementation(
    (id: string) => `ws://127.0.0.1:${port}/v1/audio/${id}`,
  );

  const service = await PreviewService.tryCreate();
  expect(service).not.toBeNull();
  return service!;
}

// ============================================================================
// Tests
// ============================================================================

describe('PreviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tryCreate()', () => {
    it('should create a service when engine extension is available', async () => {
      const service = await createService(9090);

      expect(service).not.toBeNull();
      expect(service.isAvailable).toBe(true);
      expect(service.port).toBe(9090);
    });

    it('should return null when engine extension is not installed', async () => {
      mockGetExtension.mockReturnValue(undefined);

      const service = await PreviewService.tryCreate();

      expect(service).toBeNull();
    });

    it('should return null when ensureFrameServer returns null', async () => {
      mockGetExtension.mockReturnValue({
        id: 'neko.neko-engine',
        isActive: true,
      });
      mockExecuteCommand.mockResolvedValue(null);

      const service = await PreviewService.tryCreate();

      expect(service).toBeNull();
    });

    it('should activate engine extension if not active', async () => {
      const mockActivate = vi.fn().mockResolvedValue(undefined);
      mockGetExtension.mockReturnValue({
        id: 'neko.neko-engine',
        isActive: false,
        activate: mockActivate,
      });
      mockExecuteCommand.mockResolvedValue({ port: 8080 });

      const service = await PreviewService.tryCreate();

      expect(service).not.toBeNull();
      expect(mockActivate).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    it('should return true when client and port are present', async () => {
      const service = await createService();
      expect(service.isAvailable).toBe(true);
    });

    it('should return false after disposal', async () => {
      const service = await createService();
      await service.dispose();
      expect(service.isAvailable).toBe(false);
    });
  });

  describe('getStreamWebSocketUrl()', () => {
    it('should build correct WebSocket URL', async () => {
      const service = await createService(3000);

      const url = service.getStreamWebSocketUrl('stream-abc');

      expect(url).toBe('ws://127.0.0.1:3000/v1/streams/stream-abc');
    });

    it('should return null after disposal', async () => {
      const service = await createService(3000);
      await service.dispose();

      const url = service.getStreamWebSocketUrl('stream-abc');

      expect(url).toBeNull();
    });
  });

  describe('getAudioWebSocketUrl()', () => {
    it('should build correct audio WebSocket URL', async () => {
      const service = await createService(3000);

      const url = service.getAudioWebSocketUrl('audio-abc');

      expect(url).toBe('ws://127.0.0.1:3000/v1/audio/audio-abc');
    });

    it('should return null after disposal', async () => {
      const service = await createService(3000);
      await service.dispose();

      const url = service.getAudioWebSocketUrl('audio-abc');

      expect(url).toBeNull();
    });
  });

  describe('getPreviewBaseUrl()', () => {
    it('should build the engine preview HTTP base URL', async () => {
      const service = await createService(3000);

      expect(service.getPreviewBaseUrl()).toBe('http://127.0.0.1:3000');
    });
  });

  describe('probeMedia()', () => {
    it('should delegate to MediaPlaybackService and return MediaInfo', async () => {
      const service = await createService();

      mockProbeMedia.mockResolvedValue({
        duration: 120.5,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'h264',
        format: 'mp4',
        bitrate: 5000000,
        hasAudio: true,
        audioCodec: 'aac',
        audioSampleRate: 44100,
        audioChannels: 2,
      });

      const info = await service.probeMedia('/path/to/video.mp4');

      expect(info).toEqual({
        duration: 120.5,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'h264',
        format: 'mp4',
        bitrate: 5000000,
        hasAudio: true,
        audioCodec: 'aac',
        audioSampleRate: 44100,
        audioChannels: 2,
      });
      expect(mockProbeMedia).toHaveBeenCalledWith('/path/to/video.mp4');
    });

    it('should handle audio-only files', async () => {
      const service = await createService();

      mockProbeMedia.mockResolvedValue({
        duration: 240,
        width: 0,
        height: 0,
        fps: 0,
        codec: '',
        format: 'mp3',
        hasAudio: true,
        audioCodec: 'mp3',
        audioSampleRate: 48000,
        audioChannels: 2,
      });

      const info = await service.probeMedia('/path/to/song.mp3');

      expect(info.hasAudio).toBe(true);
      expect(info.width).toBe(0);
      expect(info.height).toBe(0);
      expect(info.codec).toBe('');
      expect(info.audioCodec).toBe('mp3');
    });

    it('should throw on error', async () => {
      const service = await createService();

      mockProbeMedia.mockRejectedValue(new Error('Unsupported format'));

      await expect(service.probeMedia('/path/to/bad.file')).rejects.toThrow('Unsupported format');
    });
  });

  describe('startVideoPlayback()', () => {
    const mediaInfo: MediaInfo = {
      duration: 60,
      width: 1280,
      height: 720,
      fps: 24,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioCodec: 'aac',
      audioSampleRate: 44100,
      audioChannels: 2,
    };

    it('should start video and audio streams', async () => {
      const service = await createService();

      mockStartPlayback.mockResolvedValue({
        videoStreamId: 'video-1',
        audioStreamId: 'audio-1',
        videoStreamUrl: null,
        audioStreamUrl: null,
      });

      const result = await service.startVideoPlayback('/path/to/video.mp4', mediaInfo);

      expect(result.videoStreamId).toBe('video-1');
      expect(result.audioStreamId).toBe('audio-1');
      expect(mockStartPlayback).toHaveBeenCalledWith('/path/to/video.mp4', {
        hasAudio: true,
        startTime: 0,
        speed: 1.0,
      });
    });

    it('should skip audio stream if media has no audio', async () => {
      const service = await createService();
      const noAudioInfo = { ...mediaInfo, hasAudio: false };

      mockStartPlayback.mockResolvedValue({
        videoStreamId: 'video-1',
        audioStreamId: null,
        videoStreamUrl: null,
        audioStreamUrl: null,
      });

      const result = await service.startVideoPlayback('/path/to/video.mp4', noAudioInfo);

      expect(result.videoStreamId).toBe('video-1');
      expect(result.audioStreamId).toBeNull();
      expect(mockStartPlayback).toHaveBeenCalledWith('/path/to/video.mp4', {
        hasAudio: false,
        startTime: 0,
        speed: 1.0,
      });
    });

    it('should pass startTime when not zero', async () => {
      const service = await createService();

      mockStartPlayback.mockResolvedValue({
        videoStreamId: 'video-1',
        audioStreamId: 'audio-1',
        videoStreamUrl: null,
        audioStreamUrl: null,
      });

      await service.startVideoPlayback('/path/to/video.mp4', mediaInfo, 30);

      expect(mockStartPlayback).toHaveBeenCalledWith('/path/to/video.mp4', {
        hasAudio: true,
        startTime: 30,
        speed: 1.0,
      });
    });

    it('should pass speed when not 1.0', async () => {
      const service = await createService();

      mockStartPlayback.mockResolvedValue({
        videoStreamId: 'video-1',
        audioStreamId: 'audio-1',
        videoStreamUrl: null,
        audioStreamUrl: null,
      });

      await service.startVideoPlayback('/path/to/video.mp4', mediaInfo, 0, 2.0);

      expect(mockStartPlayback).toHaveBeenCalledWith('/path/to/video.mp4', {
        hasAudio: true,
        startTime: 0,
        speed: 2.0,
      });
    });

    it('should return null stream IDs on error', async () => {
      const service = await createService();

      mockStartPlayback.mockRejectedValue(new Error('Cannot start stream'));

      await expect(service.startVideoPlayback('/path/to/video.mp4', mediaInfo)).rejects.toThrow(
        'Cannot start stream',
      );
    });
  });

  describe('stopStreams()', () => {
    it('should stop both video and audio streams', async () => {
      const service = await createService();

      mockStopPlayback.mockResolvedValue(undefined);

      await service.stopStreams('video-1', 'audio-1');

      expect(mockStopPlayback).toHaveBeenCalledWith({
        videoStreamId: 'video-1',
        audioStreamId: 'audio-1',
        videoStreamUrl: null,
        audioStreamUrl: null,
      });
    });

    it('should handle null stream IDs gracefully', async () => {
      const service = await createService();

      mockStopPlayback.mockResolvedValue(undefined);

      await service.stopStreams(null, null);

      expect(mockStopPlayback).toHaveBeenCalledWith({
        videoStreamId: null,
        audioStreamId: null,
        videoStreamUrl: null,
        audioStreamUrl: null,
      });
    });

    it('should propagate stop errors from MediaPlaybackService', async () => {
      const service = await createService();

      mockStopPlayback.mockRejectedValue(new Error('Stream not found'));

      await expect(service.stopStreams('video-1', 'audio-1')).rejects.toThrow('Stream not found');
    });
  });

  describe('seekStreams()', () => {
    it('should seek both streams to the specified time', async () => {
      const service = await createService();

      mockSeekPlayback.mockResolvedValue(undefined);

      await service.seekStreams('video-1', 'audio-1', 42.5);

      expect(mockSeekPlayback).toHaveBeenCalledWith(
        {
          videoStreamId: 'video-1',
          audioStreamId: 'audio-1',
          videoStreamUrl: null,
          audioStreamUrl: null,
        },
        42.5,
      );
    });
  });

  describe('pauseStreams()', () => {
    it('should pause both streams', async () => {
      const service = await createService();

      mockPausePlayback.mockResolvedValue(undefined);

      await service.pauseStreams('video-1', 'audio-1');

      expect(mockPausePlayback).toHaveBeenCalledWith({
        videoStreamId: 'video-1',
        audioStreamId: 'audio-1',
        videoStreamUrl: null,
        audioStreamUrl: null,
      });
    });
  });

  describe('resumeStreams()', () => {
    it('should resume both streams', async () => {
      const service = await createService();

      mockResumePlayback.mockResolvedValue(undefined);

      await service.resumeStreams('video-1', 'audio-1');

      expect(mockResumePlayback).toHaveBeenCalledWith({
        videoStreamId: 'video-1',
        audioStreamId: 'audio-1',
        videoStreamUrl: null,
        audioStreamUrl: null,
      });
    });
  });

  describe('setStreamSpeed()', () => {
    it('should set speed on both streams', async () => {
      const service = await createService();

      mockSetPlaybackSpeed.mockResolvedValue(undefined);

      await service.setStreamSpeed('video-1', 'audio-1', 1.5);

      expect(mockSetPlaybackSpeed).toHaveBeenCalledWith(
        {
          videoStreamId: 'video-1',
          audioStreamId: 'audio-1',
          videoStreamUrl: null,
          audioStreamUrl: null,
        },
        1.5,
      );
    });
  });

  describe('getWaveform()', () => {
    it('should delegate to MediaPlaybackService', async () => {
      const service = await createService();

      mockGetWaveform.mockResolvedValue({
        peaks: [0.5, 0.9, 0.8],
        duration: 0.03,
        sampleRate: 44100,
      });

      const result = await service.getWaveform('/path/to/audio.mp3');

      expect(result.peaks).toEqual([0.5, 0.9, 0.8]);
      expect(result.duration).toBe(0.03);
      expect(result.sampleRate).toBe(44100);
      expect(mockGetWaveform).toHaveBeenCalledWith('/path/to/audio.mp3');
    });

    it('should throw when service is not available', async () => {
      const service = await createService();
      await service.dispose();

      await expect(service.getWaveform('/path/to/audio.mp3')).rejects.toThrow(
        'PreviewService not available',
      );
    });
  });

  describe('captureFrame()', () => {
    it('should delegate to MediaPlaybackService', async () => {
      const service = await createService();

      mockCaptureFrame.mockResolvedValue('data:image/jpeg;base64,abc123');

      const result = await service.captureFrame('/path/to/video.mp4', 5.0);

      expect(result).toBe('data:image/jpeg;base64,abc123');
      expect(mockCaptureFrame).toHaveBeenCalledWith('/path/to/video.mp4', 5.0, { quality: 80 });
    });

    it('should throw on error', async () => {
      const service = await createService();

      mockCaptureFrame.mockRejectedValue(new Error('No frame at time'));

      await expect(service.captureFrame('/path/to/video.mp4', -1)).rejects.toThrow(
        'No frame at time',
      );
    });
  });

  describe('preview manifests', () => {
    it('delegates preview asset registration to EngineClient', async () => {
      const service = await createService();
      const manifest = {
        manifestVersion: 1,
        assetId: 'asset-1',
        token: 'token-1',
        kind: 'image',
        status: 'ready',
        sourceName: 'pano.jpg',
        projection: { type: 'equirectangular', confidence: 'explicit', source: 'metadata' },
        media: { fileSizeBytes: 1, mimeType: 'image/jpeg', dynamicRange: 'sdr' },
        variants: [],
        createdAt: '1',
      };
      mockRegisterPreviewAsset.mockResolvedValue(manifest);

      await expect(
        service.registerPreviewAsset({ source: '/project/pano.jpg', kind: 'image' }),
      ).resolves.toEqual(manifest);
      expect(mockRegisterPreviewAsset).toHaveBeenCalledWith({
        source: '/project/pano.jpg',
        kind: 'image',
      });
    });

    it('delegates preview variant requests to EngineClient', async () => {
      const service = await createService();
      const variant = {
        id: 'asset-1:thumbnail',
        assetId: 'asset-1',
        role: 'thumbnail',
        url: '/v1/preview/file/variant-token',
        token: 'variant-token',
      };
      mockRequestPreviewVariant.mockResolvedValue(variant);

      await expect(
        service.requestPreviewVariant('asset-1', { role: 'thumbnail', width: 256, height: 128 }),
      ).resolves.toEqual(variant);
      expect(mockRequestPreviewVariant).toHaveBeenCalledWith('asset-1', {
        role: 'thumbnail',
        width: 256,
        height: 128,
      });
    });

    it('delegates preview asset metadata persistence to EngineClient', async () => {
      const service = await createService();
      const manifest = {
        manifestVersion: 1,
        assetId: 'asset-1',
        token: 'token-1',
        kind: 'image',
        status: 'ready',
        sourceName: 'pano.jpg',
        projection: { type: 'flat', confidence: 'manual', source: 'manual' },
        media: { fileSizeBytes: 1, mimeType: 'image/jpeg', dynamicRange: 'sdr' },
        variants: [],
        createdAt: '1',
      };
      mockUpdatePreviewAssetMetadata.mockResolvedValue(manifest);

      await expect(
        service.updatePreviewAssetMetadata('asset-1', { projectionType: 'flat' }),
      ).resolves.toEqual(manifest);
      expect(mockUpdatePreviewAssetMetadata).toHaveBeenCalledWith('asset-1', {
        projectionType: 'flat',
      });
    });

    it('throws when preview metadata persistence is unavailable', async () => {
      const service = await createService();
      await service.dispose();

      await expect(
        service.updatePreviewAssetMetadata('asset-1', { projectionType: 'flat' }),
      ).rejects.toThrow('PreviewService not available');
    });

    it('delegates preview asset unregister to EngineClient', async () => {
      const service = await createService();

      await expect(service.unregisterPreviewAsset('asset-1')).resolves.toBeUndefined();
      expect(mockUnregisterPreviewAsset).toHaveBeenCalledWith('asset-1');
    });
  });

  describe('dispose()', () => {
    it('should mark service as unavailable', async () => {
      const service = await createService();

      await service.dispose();

      expect(service.isAvailable).toBe(false);
      expect(service.port).toBeNull();
    });

    it('should be idempotent (calling dispose twice does not throw)', async () => {
      const service = await createService();

      await service.dispose();
      await service.dispose();

      expect(service.isAvailable).toBe(false);
    });
  });
});
