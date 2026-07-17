import { describe, expect, it, vi } from 'vitest';
import { MediaPlaybackService } from '../MediaPlaybackService';
import type { ActionResponse } from '../engine/types';
import type { MediaPlaybackEnginePort, PlaybackStreamGroup } from '../MediaPlaybackService';

describe('MediaPlaybackService', () => {
  it('starts audio playback without creating a video stream', async () => {
    const client = createEngineClientMock();
    const service = new MediaPlaybackService(client);

    const handle = await service.startPlayback('/tmp/song.aac', { mediaType: 'audio' });

    expect(client.createStream).toHaveBeenCalledTimes(1);
    expect(client.createStream).toHaveBeenCalledWith(
      'audios',
      '/tmp/song.aac',
      expect.objectContaining({ sessionId: expect.stringMatching(/^playback-audio-/) }),
    );
    expect(handle).toMatchObject({
      videoStreamId: null,
      videoStreamUrl: null,
      audioStreamId: 'audio-stream',
      audioStreamUrl: 'ws://127.0.0.1:7788/v1/streams/audio-stream',
    });
  });

  it('keeps video playback paired with audio when the source has audio', async () => {
    const client = createEngineClientMock();
    const service = new MediaPlaybackService(client);

    const handle = await service.startPlayback('/tmp/clip.mp4', {
      mediaType: 'video',
      hasAudio: true,
    });

    expect(client.createStream).toHaveBeenCalledTimes(2);
    expect(client.createStream).toHaveBeenNthCalledWith(
      1,
      'videos',
      '/tmp/clip.mp4',
      expect.objectContaining({ sessionId: expect.stringMatching(/^playback-/) }),
    );
    expect(client.createStream).toHaveBeenNthCalledWith(
      2,
      'audios',
      '/tmp/clip.mp4',
      expect.objectContaining({ sessionId: expect.stringMatching(/^playback-audio-/) }),
    );
    expect(handle.videoStreamId).toBe('video-stream');
    expect(handle.audioStreamId).toBe('audio-stream');
  });

  it('probes audio media through the audio action group when a type hint is present', async () => {
    const client = createEngineClientMock();
    const service = new MediaPlaybackService(client);

    await service.probeMedia('/tmp/song.aac', 'audio');

    expect(client.probe).toHaveBeenCalledWith('audios', '/tmp/song.aac');
    expect(client.probe).not.toHaveBeenCalledWith('videos', '/tmp/song.aac');
  });
});

function createEngineClientMock(): MediaPlaybackEnginePort {
  const createStream = vi.fn(async (group: PlaybackStreamGroup) => {
    if (group === 'videos') {
      return {
        streamId: 'video-stream',
        wsUrl: 'ws://127.0.0.1:7788/v1/streams/video-stream',
      };
    }
    return {
      streamId: 'audio-stream',
      wsUrl: 'ws://127.0.0.1:7788/v1/streams/audio-stream',
    };
  });

  const client: MediaPlaybackEnginePort = {
    port: 7788,
    createStream,
    probe: vi.fn(async () => ({
      duration: 12,
      width: 0,
      height: 0,
      fps: 0,
      codec: '',
      format: 'aac',
      hasAudio: true,
    })),
    controlStream: vi.fn(async (): Promise<ActionResponse> => ({ id: 'req-1', status: 'ok' })),
    dispatch: vi.fn(async (): Promise<ActionResponse> => ({ id: 'req-1', status: 'ok' })),
    waveform: vi.fn(async () => ({
      peaks: [],
      sampleRate: 48_000,
      channels: 2,
      duration: 12,
      peaksPerSecond: 100,
    })),
    getStreamWsUrl: (streamId: string) => `ws://127.0.0.1:7788/v1/streams/${streamId}`,
    getAudioWsUrl: (streamId: string) => `ws://127.0.0.1:7788/v1/audio/${streamId}`,
  };
  return client;
}
