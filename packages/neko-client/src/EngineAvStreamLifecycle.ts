import {
  H264StreamClient,
  type H264StreamClientConfig,
  type H264StreamClientStats,
} from './H264StreamClient';
import {
  AudioStreamClient,
  type AudioStreamClientConfig,
  type AudioStreamStats,
} from './AudioStreamClient';
import { FrameScheduler, type FrameSchedulerStats } from './FrameScheduler';

export interface EngineAvVideoStreamClient {
  connect(): Promise<void>;
  dispose(): void;
  getStats(): H264StreamClientStats;
  resetDecoder?(): void;
  updateBackpressurePolicy?: H264StreamClient['updateBackpressurePolicy'];
}

export interface EngineAvAudioStreamClient {
  connect(existingAudioCtx?: AudioContext): Promise<void>;
  dispose(): void;
  getStats(): AudioStreamStats;
  getCurrentTime(): number;
  readonly isClockReady: boolean;
  getAudioContext(): AudioContext | null;
  getGainNode(): GainNode | null;
  setVolume(volume: number): void;
  setClockPlaybackRate(rate: number): void;
  pause(): void;
  resume(): void;
  fadeOut(duration?: number): Promise<void>;
  resetClock(): void;
}

export interface EngineAvFrameScheduler {
  enqueue(frame: VideoFrame): void;
  schedule(masterClockUs: number): ReturnType<FrameScheduler['schedule']>;
  flush(): void;
  switchClock(newMasterClockUs: number): void;
  dispose(): void;
  getStats(): FrameSchedulerStats;
}

export interface EngineAvStreamDescriptor {
  readonly video?: H264StreamClientConfig;
  readonly audio?: AudioStreamClientConfig;
  readonly fps?: number;
  readonly warmupFrames?: number;
  readonly schedulerMode?: 'auto' | 'video' | 'av' | 'none';
  readonly videoFrameRoute?: 'scheduler' | 'callback';
}

export interface EngineAvStreamClients {
  readonly videoClient: EngineAvVideoStreamClient | null;
  readonly audioClient: EngineAvAudioStreamClient | null;
  readonly scheduler: EngineAvFrameScheduler | null;
}

export interface EngineAvStreamLifecycleSnapshot extends EngineAvStreamClients {
  readonly descriptor: EngineAvStreamDescriptor | null;
}

export interface EngineAvStreamLifecycleStats {
  readonly h264: H264StreamClientStats | null;
  readonly audio: AudioStreamStats | null;
  readonly scheduler: FrameSchedulerStats | null;
}

export interface EngineAvStreamLifecycleCallbacks {
  readonly onClientsChanged?: (clients: EngineAvStreamClients) => void;
  readonly onVideoConnectionChange?: (connected: boolean) => void;
  readonly onAudioConnectionChange?: (connected: boolean) => void;
  readonly onError?: (error: Error) => void;
  readonly onStreamEnd?: (kind: 'video' | 'audio') => void;
}

export interface EngineAvStreamLifecycleFactories {
  readonly createVideoClient?: (config: H264StreamClientConfig) => EngineAvVideoStreamClient;
  readonly createAudioClient?: (config: AudioStreamClientConfig) => EngineAvAudioStreamClient;
  readonly createFrameScheduler?: (fps: number, warmupFrames?: number) => EngineAvFrameScheduler;
}

export interface EngineAvStreamLifecycleOptions {
  readonly factories?: EngineAvStreamLifecycleFactories;
  readonly callbacks?: EngineAvStreamLifecycleCallbacks;
}

export class EngineAvStreamLifecycle {
  private readonly factories: Required<EngineAvStreamLifecycleFactories>;
  private readonly callbacks: EngineAvStreamLifecycleCallbacks;
  private descriptor: EngineAvStreamDescriptor | null = null;
  private videoClient: EngineAvVideoStreamClient | null = null;
  private audioClient: EngineAvAudioStreamClient | null = null;
  private scheduler: EngineAvFrameScheduler | null = null;
  private disposed = false;
  private generation = 0;

  constructor(options: EngineAvStreamLifecycleOptions = {}) {
    this.factories = {
      createVideoClient:
        options.factories?.createVideoClient ?? ((config) => new H264StreamClient(config)),
      createAudioClient:
        options.factories?.createAudioClient ?? ((config) => new AudioStreamClient(config)),
      createFrameScheduler:
        options.factories?.createFrameScheduler ??
        ((fps, warmupFrames) => new FrameScheduler(fps, warmupFrames)),
    };
    this.callbacks = options.callbacks ?? {};
  }

  async start(
    descriptor: EngineAvStreamDescriptor,
    options: { readonly audioContext?: AudioContext } = {},
  ): Promise<EngineAvStreamLifecycleSnapshot> {
    if (this.disposed) {
      throw new Error('Cannot start a disposed EngineAvStreamLifecycle');
    }

    this.stop();
    const generation = this.generation;
    this.descriptor = descriptor;

    const scheduler = shouldCreateScheduler(descriptor)
      ? this.factories.createFrameScheduler(descriptor.fps ?? 25, descriptor.warmupFrames)
      : null;
    this.scheduler = scheduler;

    const audioClient = descriptor.audio
      ? this.factories.createAudioClient({
          ...descriptor.audio,
          onConnectionChange: (connected) => {
            if (!this.isCurrentGeneration(generation)) return;
            descriptor.audio?.onConnectionChange?.(connected);
            this.callbacks.onAudioConnectionChange?.(connected);
          },
          onError: (error) => {
            if (!this.isCurrentGeneration(generation)) return;
            descriptor.audio?.onError?.(error);
            this.callbacks.onError?.(error);
          },
          onStreamEnd: () => {
            if (!this.isCurrentGeneration(generation)) return;
            descriptor.audio?.onStreamEnd?.();
            this.callbacks.onStreamEnd?.('audio');
          },
        })
      : null;
    this.audioClient = audioClient;

    const videoClient = descriptor.video
      ? this.factories.createVideoClient({
          ...descriptor.video,
          onFrame: (frame) => {
            if (!this.isCurrentGeneration(generation)) {
              frame.close();
              return;
            }
            if (scheduler && (descriptor.videoFrameRoute ?? 'scheduler') === 'scheduler') {
              scheduler.enqueue(frame);
              return;
            }
            if (descriptor.video?.onFrame) {
              descriptor.video.onFrame(frame);
              return;
            }
            frame.close();
          },
          onConnectionChange: (connected) => {
            if (!this.isCurrentGeneration(generation)) return;
            descriptor.video?.onConnectionChange?.(connected);
            this.callbacks.onVideoConnectionChange?.(connected);
          },
          onError: (error) => {
            if (!this.isCurrentGeneration(generation)) return;
            descriptor.video?.onError?.(error);
            this.callbacks.onError?.(error);
          },
          onPacketReceived: (sizeBytes) => {
            if (!this.isCurrentGeneration(generation)) return;
            descriptor.video?.onPacketReceived?.(sizeBytes);
          },
          onStreamEnd: () => {
            if (!this.isCurrentGeneration(generation)) return;
            descriptor.video?.onStreamEnd?.();
            this.callbacks.onStreamEnd?.('video');
          },
        })
      : null;
    this.videoClient = videoClient;
    this.callbacks.onClientsChanged?.(this.getClients());

    const videoConnect = videoClient?.connect() ?? Promise.resolve();
    const audioConnect = audioClient?.connect(options.audioContext) ?? Promise.resolve();

    await Promise.all([videoConnect, audioConnect]);

    if (!this.isCurrentGeneration(generation)) {
      throw new Error(`Engine AV stream generation ${generation} was superseded before startup.`);
    }
    return this.getSnapshot();
  }

  stop(): void {
    this.generation += 1;
    this.disposeCurrentClients();
    this.descriptor = null;
    this.callbacks.onClientsChanged?.(this.getClients());
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation += 1;
    this.disposeCurrentClients();
    this.callbacks.onClientsChanged?.(this.getClients());
  }

  getSnapshot(): EngineAvStreamLifecycleSnapshot {
    return {
      descriptor: this.descriptor,
      ...this.getClients(),
    };
  }

  getStats(): EngineAvStreamLifecycleStats {
    return {
      h264: this.videoClient?.getStats() ?? null,
      audio: this.audioClient?.getStats() ?? null,
      scheduler: this.scheduler?.getStats() ?? null,
    };
  }

  private getClients(): EngineAvStreamClients {
    return {
      videoClient: this.videoClient,
      audioClient: this.audioClient,
      scheduler: this.scheduler,
    };
  }

  private isCurrentGeneration(generation: number): boolean {
    return !this.disposed && this.generation === generation;
  }

  private disposeCurrentClients(): void {
    const scheduler = this.scheduler;
    const videoClient = this.videoClient;
    const audioClient = this.audioClient;

    this.scheduler = null;
    this.videoClient = null;
    this.audioClient = null;

    scheduler?.dispose();
    videoClient?.dispose();
    audioClient?.dispose();
  }
}

function shouldCreateScheduler(descriptor: EngineAvStreamDescriptor): boolean {
  if (!descriptor.video) {
    return false;
  }

  switch (descriptor.schedulerMode ?? 'auto') {
    case 'none':
      return false;
    case 'video':
    case 'av':
      return true;
    case 'auto':
      return Boolean(descriptor.audio);
  }
}
