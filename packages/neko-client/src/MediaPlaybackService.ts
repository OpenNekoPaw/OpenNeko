import type {
  ActionRequest,
  ActionResponse,
  PlaybackHandle,
  ProbeResult,
  StreamHandle,
  WaveformResult,
} from './engine/types';
import { getLogger } from './utils/logger';

const logger = getLogger('MediaPlaybackService');

export type PlaybackMediaType = 'auto' | 'video' | 'audio';
export type PlaybackStreamGroup = 'videos' | 'audios';

export interface MediaPlaybackEnginePort {
  readonly port: number;
  getStreamWsUrl(streamId: string): string;
  getAudioWsUrl(streamId: string): string;
  dispatch(req: ActionRequest): Promise<ActionResponse>;
  probe(group: PlaybackStreamGroup, source: string): Promise<ProbeResult>;
  createStream(
    group: PlaybackStreamGroup,
    source: string,
    opts?: Record<string, unknown>,
  ): Promise<StreamHandle>;
  controlStream(
    group: PlaybackStreamGroup,
    streamId: string,
    action: string,
    opts?: Record<string, unknown>,
  ): Promise<ActionResponse>;
  waveform(source: string, opts?: { peaksPerSecond?: number }): Promise<WaveformResult>;
}

export interface StartPlaybackOptions {
  hasAudio?: boolean;
  mediaType?: PlaybackMediaType;
  startPaused?: boolean;
  startTime?: number;
  speed?: number;
}

export interface CaptureFrameOptions {
  quality?: number;
  format?: string;
  width?: number;
  height?: number;
}

export class MediaPlaybackService {
  constructor(private readonly client: MediaPlaybackEnginePort) {}

  get port(): number {
    return this.client.port;
  }

  getStreamWebSocketUrl(streamId: string): string {
    return this.client.getStreamWsUrl(streamId);
  }

  getAudioWebSocketUrl(streamId: string): string {
    return this.client.getAudioWsUrl(streamId);
  }

  async probeMedia(filePath: string, mediaType: PlaybackMediaType = 'auto'): Promise<ProbeResult> {
    if (mediaType === 'audio') {
      return this.client.probe('audios', filePath);
    }

    if (mediaType === 'video') {
      return this.client.probe('videos', filePath);
    }

    try {
      return await this.client.probe('videos', filePath);
    } catch {
      return await this.client.probe('audios', filePath);
    }
  }

  async startPlayback(filePath: string, options?: StartPlaybackOptions): Promise<PlaybackHandle> {
    const {
      hasAudio = true,
      mediaType = 'auto',
      startPaused = false,
      startTime = 0,
      speed = 1.0,
    } = options ?? {};

    const handle: PlaybackHandle = {
      videoStreamId: null,
      audioStreamId: null,
      videoStreamUrl: null,
      audioStreamUrl: null,
    };

    try {
      if (mediaType !== 'audio') {
        let videoStream: StreamHandle | undefined;
        try {
          videoStream = await this.client.createStream('videos', filePath, {
            sessionId: `playback-${Date.now()}`,
            initialPaused: startPaused,
            startTime,
            speed,
          });
        } catch (err) {
          logger.warn('Failed to create video stream', err);
        }
        if (videoStream) {
          handle.videoStreamId = videoStream.streamId;
          handle.videoStreamUrl = videoStream.wsUrl;
        }
      }

      if (hasAudio) {
        let audioStream: StreamHandle | undefined;
        try {
          audioStream = await this.client.createStream('audios', filePath, {
            sessionId: `playback-audio-${Date.now()}`,
            initialPaused: startPaused,
            startTime,
            speed,
          });
        } catch (err) {
          logger.warn('Failed to create audio stream', err);
        }
        if (audioStream) {
          handle.audioStreamId = audioStream.streamId;
          handle.audioStreamUrl = audioStream.audioWsUrl ?? audioStream.wsUrl;
        }
      }

      return handle;
    } catch (error) {
      await this.stopPlayback(handle);
      throw error;
    }
  }

  async stopPlayback(handle: PlaybackHandle): Promise<void> {
    await this.controlBoth(handle, 'stop');
  }

  async seekPlayback(handle: PlaybackHandle, time: number): Promise<void> {
    await this.controlBoth(handle, 'seek', { time });
  }

  async pausePlayback(handle: PlaybackHandle): Promise<void> {
    await this.controlBoth(handle, 'pause');
  }

  async resumePlayback(handle: PlaybackHandle): Promise<void> {
    await this.controlBoth(handle, 'resume');
  }

  async setPlaybackSpeed(handle: PlaybackHandle, speed: number): Promise<void> {
    await this.controlBoth(handle, 'speed', { speed });
  }

  async captureFrame(filePath: string, time: number, opts?: CaptureFrameOptions): Promise<string> {
    const resp = await this.client.dispatch({
      group: 'videos',
      action: 'capture',
      options: {
        source: filePath,
        time,
        quality: opts?.quality ?? 85,
        format: opts?.format ?? 'jpeg',
        ...(opts?.width != null && { width: opts.width }),
        ...(opts?.height != null && { height: opts.height }),
      },
    });

    if (resp.status === 'error') {
      throw new Error(resp.error?.message ?? 'captureFrame failed');
    }

    const data = resp.data as { data?: string; base64?: string } | undefined;
    const b64 = data?.data ?? data?.base64;
    if (!b64 || typeof b64 !== 'string') {
      throw new Error('captureFrame returned no image data');
    }

    return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
  }

  async getWaveform(filePath: string, opts?: { peaksPerSecond?: number }): Promise<WaveformResult> {
    return this.client.waveform(filePath, opts);
  }

  private async controlBoth(
    handle: PlaybackHandle,
    action: string,
    opts?: Record<string, unknown>,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    if (handle.videoStreamId) {
      tasks.push(
        this.client.controlStream('videos', handle.videoStreamId, action, opts).catch((err) => {
          if (action !== 'stop') throw err;
          logger.debug(`Ignoring stop error for video stream`, err);
        }),
      );
    }

    if (handle.audioStreamId) {
      tasks.push(
        this.client.controlStream('audios', handle.audioStreamId, action, opts).catch((err) => {
          if (action !== 'stop') throw err;
          logger.debug(`Ignoring stop error for audio stream`, err);
        }),
      );
    }

    await Promise.all(tasks);
  }
}
