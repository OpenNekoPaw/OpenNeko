/**
 * Native Media Engine
 *
 * Unified implementation of IMediaEngine using NativeEngine (Rust N-API).
 * All operations are dispatched through the ActionRequest/ActionResponse protocol.
 *
 * Runs in Extension Host (Node.js), supports all formats.
 */

import type { NativeEngine as NativeEngineType } from '@neko-engine/host-napi';
import type {
  IMediaEngine,
  IDecoder,
  IEncoder,
  IEffectProcessor,
  MediaEngineCapabilities,
  MediaEngineMode,
  MediaEngineState,
  MediaEngineInitOptions,
  MediaEngineError,
  VideoDecoderConfig,
  AudioDecoderConfig,
  EncoderConfig,
  Event,
  MediaInfo,
  EffectProcessorState,
  EffectProcessorGpuInfo,
  GpuEffectParams,
  EffectPipeline,
  VideoFrame,
} from '@neko/shared';
import { COMPATIBLE_MODE_CAPABILITIES } from '@neko/shared';
import { getLogger } from '../base/logger';
import { createNativeEngineBinding } from './nativeEngineBinding';

type EventListener<T> = (data: T) => void;

// =============================================================================
// Native Media Engine
// =============================================================================

/**
 * Compatible mode media engine implementation using NativeEngine.
 *
 * All operations are dispatched through the unified ActionRequest protocol
 * to the Rust-side EngineApi.
 */
export class NativeMediaEngine implements IMediaEngine {
  readonly name = 'NativeMediaEngine';
  readonly mode: MediaEngineMode = 'compatible';

  private _state: MediaEngineState = 'uninitialized';
  private _capabilities: MediaEngineCapabilities = COMPATIBLE_MODE_CAPABILITIES;

  // NativeEngine instance (from engine.rs)
  private _engine: NativeEngineType | null = null;

  // Event listeners
  private _stateListeners: Set<EventListener<MediaEngineState>> = new Set();
  private _errorListeners: Set<EventListener<MediaEngineError>> = new Set();

  constructor() {}

  // =========================================================================
  // Properties
  // =========================================================================

  get state(): MediaEngineState {
    return this._state;
  }

  get capabilities(): MediaEngineCapabilities {
    return this._capabilities;
  }

  get isReady(): boolean {
    return this._state === 'ready';
  }

  /** Expose the underlying NativeEngine for direct use (e.g., ExportService) */
  get engine(): NativeEngineType | null {
    return this._engine;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async initialize(_options?: MediaEngineInitOptions): Promise<void> {
    if (this._state !== 'uninitialized') {
      throw new Error(`Cannot initialize in state: ${this._state}`);
    }

    this._setState('initializing');

    try {
      this._engine = await createNativeEngineBinding();

      // Log GPU info
      const hasGpu = this._engine.hasGpu();
      const engineLogger = getLogger('NativeMediaEngine');
      engineLogger.info(`NativeEngine created (GPU: ${hasGpu ? 'enabled' : 'disabled'})`);

      // Detect hardware acceleration
      this._detectHardwareAcceleration();

      this._setState('ready');
    } catch (error) {
      this._setState('error');
      this.emitError({
        code: 'INIT_FAILED',
        message: error instanceof Error ? error.message : String(error),
        recoverable: false,
      });
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this._engine) {
      // Stop the embedded HTTP server owned by this wrapper instance.
      // The Rust EngineApi itself currently remains alive behind the global
      // host-napi singleton and is not torn down here.
      try {
        await this._engine.stopFrameServer();
      } catch {
        // Ignore — may not be running
      }
      this._engine = null;
    }

    this._setState('disposed');
  }

  // =========================================================================
  // Decoder Factory
  // =========================================================================

  async createVideoDecoder(config: VideoDecoderConfig): Promise<IDecoder> {
    if (!this.isReady || !this._engine) {
      throw new Error('Engine not ready');
    }
    return new NativeVideoDecoder(config, this._engine);
  }

  async createAudioDecoder(config: AudioDecoderConfig): Promise<IDecoder> {
    if (!this.isReady || !this._engine) {
      throw new Error('Engine not ready');
    }
    return new NativeAudioDecoder(config, this._engine);
  }

  canDecode(codec: string, _container?: string): boolean {
    const codecLower = codec.toLowerCase();
    const videoCodec = this._capabilities.videoCodecs.find((c) => c.codec === codecLower);
    if (videoCodec?.decode) return true;
    const audioCodec = this._capabilities.audioCodecs.find((c) => c.codec === codecLower);
    if (audioCodec?.decode) return true;
    return false;
  }

  // =========================================================================
  // Encoder Factory
  // =========================================================================

  async createEncoder(config: EncoderConfig): Promise<IEncoder> {
    if (!this.isReady || !this._engine) {
      throw new Error('Engine not ready');
    }
    return new NativeEncoder(config, this._engine);
  }

  canEncode(codec: string, _container?: string): boolean {
    const codecLower = codec.toLowerCase();
    const videoCodec = this._capabilities.videoCodecs.find((c) => c.codec === codecLower);
    if (videoCodec?.encode) return true;
    const audioCodec = this._capabilities.audioCodecs.find((c) => c.codec === codecLower);
    if (audioCodec?.encode) return true;
    return false;
  }

  // =========================================================================
  // Effect Processor
  // =========================================================================

  async getEffectProcessor(): Promise<IEffectProcessor> {
    if (!this.isReady || !this._engine) {
      throw new Error('Engine not ready');
    }
    const processor = new NativeEffectProcessor(this._engine);
    await processor.initialize();
    return processor;
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  async probeMedia(source: string): Promise<MediaInfo> {
    if (!this.isReady || !this._engine) {
      throw new Error('Engine not ready');
    }

    try {
      const responseJson = await this._engine.probeVideo(source);
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok') {
        const msg = response.error?.message ?? response.error ?? 'Probe failed';
        throw new Error(msg);
      }

      const data = response.data;
      return {
        duration: data.duration ?? 0,
        width: data.width ?? 0,
        height: data.height ?? 0,
        fps: data.fps ?? 0,
        codec: data.codec ?? 'unknown',
        format: data.format ?? 'unknown',
        hasAudio: data.hasAudio ?? data.has_audio ?? false,
        audioCodec: data.audioCodec ?? data.audio_codec,
        audioSampleRate: data.audioSampleRate ?? data.audio_sample_rate,
        audioChannels: data.audioChannels ?? data.audio_channels,
        hasSubtitles: data.hasSubtitles ?? data.has_subtitles ?? false,
      };
    } catch (error) {
      throw new Error(`Failed to probe media: ${error}`);
    }
  }

  canProcess(_mediaInfo: MediaInfo): boolean {
    // Compatible mode supports all formats
    return true;
  }

  // =========================================================================
  // Events
  // =========================================================================

  get onStateChange(): Event<MediaEngineState> {
    return (listener) => {
      this._stateListeners.add(listener);
      return { dispose: () => this._stateListeners.delete(listener) };
    };
  }

  get onError(): Event<MediaEngineError> {
    return (listener) => {
      this._errorListeners.add(listener);
      return { dispose: () => this._errorListeners.delete(listener) };
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private _setState(state: MediaEngineState): void {
    this._state = state;
    for (const listener of this._stateListeners) {
      listener(state);
    }
  }

  private emitError(error: MediaEngineError): void {
    for (const listener of this._errorListeners) {
      listener(error);
    }
  }

  private _detectHardwareAcceleration(): void {
    const platform = process.platform;
    let hwAccelType: 'videotoolbox' | 'nvenc' | 'vaapi' | 'qsv' | undefined;

    if (platform === 'darwin') {
      hwAccelType = 'videotoolbox';
    } else if (platform === 'linux') {
      hwAccelType = 'vaapi';
    } else if (platform === 'win32') {
      hwAccelType = 'qsv';
    }

    if (hwAccelType) {
      this._capabilities = {
        ...this._capabilities,
        hardwareAcceleration: true,
        hwAccelInfo: { available: true, type: hwAccelType },
      };
    }
  }
}

// =============================================================================
// Native Video Decoder — uses engine.captureFrame()
// =============================================================================

class NativeVideoDecoder implements IDecoder {
  readonly type = 'video' as const;
  private _mediaInfo: MediaInfo | null = null;
  private _isOpen = false;
  private _position = 0;
  private _config: VideoDecoderConfig;
  private _engine: NativeEngineType;

  constructor(config: VideoDecoderConfig, engine: NativeEngineType) {
    this._config = config;
    this._engine = engine;
  }

  get mediaInfo() {
    return this._mediaInfo;
  }
  get isOpen() {
    return this._isOpen;
  }
  get position() {
    return this._position;
  }

  async open(): Promise<MediaInfo> {
    // Capture first frame to get dimensions
    try {
      const responseJson = await this._engine.captureFrame(this._config.source, 0, 85, 'rgba');
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok' || !response.data) {
        throw new Error(response.error?.message ?? 'Failed to capture initial frame');
      }

      this._mediaInfo = {
        duration: 0,
        width: response.data.width ?? 0,
        height: response.data.height ?? 0,
        fps: 30,
        codec: 'unknown',
        format: 'rgba',
        hasAudio: false,
        hasSubtitles: false,
      };
      this._isOpen = true;
      return this._mediaInfo;
    } catch (error) {
      throw new Error(`Failed to open video: ${error}`);
    }
  }

  async seek(time: number): Promise<void> {
    this._position = time;
  }

  async decodeNext(): Promise<import('@neko/shared').DecodedVideoFrame | null> {
    return this.decodeAt(this._position);
  }

  async decodeAt(time: number): Promise<import('@neko/shared').DecodedVideoFrame | null> {
    this._position = time;

    try {
      const responseJson = await this._engine.captureFrame(this._config.source, time, 100, 'rgba');
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok' || !response.data) {
        return null;
      }

      const data = response.data;
      const frameBuffer = Buffer.from(data.data, 'base64');

      return {
        type: 'video' as const,
        width: data.width,
        height: data.height,
        data: frameBuffer,
        timestamp: data.timestamp ?? time,
        format: 'rgba' as 'rgba' | 'yuv420p',
        isKeyframe: true,
      };
    } catch (error) {
      getLogger('NativeVideoDecoder').warn('Decode failed', error);
      return null;
    }
  }

  async *decodeRange(
    startTime: number,
    duration: number,
    fps: number,
  ): AsyncGenerator<import('@neko/shared').DecodedVideoFrame, void, undefined> {
    const endTime = startTime + duration;
    const frameInterval = 1 / fps;

    for (let time = startTime; time < endTime; time += frameInterval) {
      const frame = await this.decodeAt(time);
      if (frame) {
        yield frame;
      }
    }
  }

  async close(): Promise<void> {
    this._isOpen = false;
  }
}

// =============================================================================
// Native Audio Decoder — uses engine.dispatchAction("audios", ...)
// =============================================================================

class NativeAudioDecoder implements IDecoder {
  readonly type = 'audio' as const;
  private _mediaInfo: MediaInfo | null = null;
  private _isOpen = false;
  private _position = 0;
  private _config: AudioDecoderConfig;
  private _engine: NativeEngineType;

  constructor(config: AudioDecoderConfig, engine: NativeEngineType) {
    this._config = config;
    this._engine = engine;
  }

  get mediaInfo() {
    return this._mediaInfo;
  }
  get isOpen() {
    return this._isOpen;
  }
  get position() {
    return this._position;
  }

  async open(): Promise<MediaInfo> {
    try {
      const responseJson = await this._engine.dispatchAction(
        'audios',
        'info',
        null,
        JSON.stringify({ source: this._config.source }),
      );
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok' || !response.data) {
        throw new Error(response.error?.message ?? 'Failed to get audio info');
      }

      const info = response.data;
      this._mediaInfo = {
        duration: info.duration ?? 0,
        width: 0,
        height: 0,
        fps: 0,
        codec: info.codec ?? 'unknown',
        format: 'audio',
        hasAudio: true,
        hasSubtitles: false,
      };
      this._isOpen = true;
      return this._mediaInfo;
    } catch (error) {
      throw new Error(`Failed to open audio: ${error}`);
    }
  }

  async seek(time: number): Promise<void> {
    this._position = time;
  }

  async decodeNext(): Promise<import('@neko/shared').DecodedAudioFrame | null> {
    return this.decodeAt(this._position);
  }

  async decodeAt(time: number): Promise<import('@neko/shared').DecodedAudioFrame | null> {
    this._position = time;

    try {
      const responseJson = await this._engine.dispatchAction(
        'audios',
        'extract',
        null,
        JSON.stringify({
          source: this._config.source,
          startTime: time,
          endTime: time + 0.1, // Extract 100ms chunk
        }),
      );
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok' || !response.data) {
        return null;
      }

      const data = response.data;
      const audioBuffer = Buffer.from(data.data, 'base64');
      const floatArray = new Float32Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / 4,
      );

      return {
        type: 'audio',
        data: floatArray,
        sampleRate: data.sampleRate ?? data.sample_rate ?? 48000,
        channels: data.channels ?? 2,
        samplesPerChannel: data.samples ?? floatArray.length / (data.channels ?? 2),
        timestamp: time,
        duration: 0.1,
      };
    } catch (error) {
      getLogger('NativeAudioDecoder').warn('Decode failed', error);
      return null;
    }
  }

  async *decodeRange(
    startTime: number,
    duration: number,
  ): AsyncGenerator<import('@neko/shared').DecodedAudioFrame, void, undefined> {
    // Extract full range at once via Rust side
    try {
      const responseJson = await this._engine.dispatchAction(
        'audios',
        'extract',
        null,
        JSON.stringify({
          source: this._config.source,
          startTime,
          endTime: startTime + duration,
        }),
      );
      const response = JSON.parse(responseJson);

      if (response.status !== 'ok' || !response.data) {
        return;
      }

      const data = response.data;
      const audioBuffer = Buffer.from(data.data, 'base64');
      const floatArray = new Float32Array(
        audioBuffer.buffer,
        audioBuffer.byteOffset,
        audioBuffer.byteLength / 4,
      );
      const sampleRate = data.sampleRate ?? data.sample_rate ?? 48000;
      const channels = data.channels ?? 2;

      yield {
        type: 'audio',
        data: floatArray,
        sampleRate,
        channels,
        samplesPerChannel: floatArray.length / channels,
        timestamp: startTime,
        duration,
      };
    } catch (error) {
      getLogger('NativeAudioDecoder').warn('Range decode failed', error);
    }
  }

  async close(): Promise<void> {
    this._isOpen = false;
  }
}

// =============================================================================
// Native Encoder — delegates to timelines:export via NativeEngine
// =============================================================================

class NativeEncoder implements IEncoder {
  private _state: import('@neko/shared').EncoderState = 'idle';
  private _config: EncoderConfig | null = null;
  private _engine: NativeEngineType;
  private _jobId: string | null = null;
  private _pollInterval: ReturnType<typeof setInterval> | null = null;

  // Event listeners
  private _progressListeners: Set<(progress: import('@neko/shared').EncoderProgress) => void> =
    new Set();
  private _stateListeners: Set<(state: import('@neko/shared').EncoderState) => void> = new Set();
  private _errorListeners: Set<(error: Error) => void> = new Set();

  constructor(config: EncoderConfig, engine: NativeEngineType) {
    this._config = config;
    this._engine = engine;
  }

  get state() {
    return this._state;
  }
  get config() {
    return this._config;
  }
  get isReady() {
    return this._state === 'encoding';
  }

  async initialize(config: EncoderConfig): Promise<void> {
    this._config = config;
    this._state = 'encoding';
    this._notifyStateChange();
  }

  /**
   * Encode a video frame.
   *
   * In the NativeEngine architecture, encoding is handled entirely by the
   * Rust side via `timelines:export`. This method satisfies the IEncoder
   * interface contract but is not used. Use ExportService.export() instead.
   *
   * @throws Always — direct frame encoding is not supported.
   */
  async encodeVideoFrame(_frame: Uint8Array | VideoFrame, _timestamp: number): Promise<void> {
    throw new Error(
      'Direct frame encoding is not supported in NativeEngine mode. ' +
        'Use ExportService.export() which delegates to timelines:export.',
    );
  }

  async finalize(): Promise<import('@neko/shared').EncoderResult> {
    this._stopPolling();
    this._state = 'completed';
    this._notifyStateChange();

    return {
      success: true,
      outputPath: this._config?.outputPath,
    };
  }

  async cancel(): Promise<void> {
    this._stopPolling();

    if (this._jobId) {
      try {
        await this._engine.cancelTask(this._jobId);
      } catch (error) {
        getLogger('NativeEncoder').warn('Failed to cancel task', error);
      }
    }

    this._state = 'cancelled';
    this._notifyStateChange();
  }

  private _stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  private _notifyStateChange(): void {
    for (const listener of this._stateListeners) {
      listener(this._state);
    }
  }

  get onProgress(): import('@neko/shared').EncoderEvent<import('@neko/shared').EncoderProgress> {
    return (listener) => {
      this._progressListeners.add(listener);
      return { dispose: () => this._progressListeners.delete(listener) };
    };
  }

  get onStateChange(): import('@neko/shared').EncoderEvent<import('@neko/shared').EncoderState> {
    return (listener) => {
      this._stateListeners.add(listener);
      return { dispose: () => this._stateListeners.delete(listener) };
    };
  }

  get onError(): import('@neko/shared').EncoderEvent<Error> {
    return (listener) => {
      this._errorListeners.add(listener);
      return { dispose: () => this._errorListeners.delete(listener) };
    };
  }
}

// =============================================================================
// Native Effect Processor — delegates to effects:* actions via NativeEngine
// =============================================================================

class NativeEffectProcessor implements IEffectProcessor {
  private _state: EffectProcessorState = 'uninitialized';
  private _engine: NativeEngineType;
  private _gpuInfo: EffectProcessorGpuInfo | null = null;

  constructor(engine: NativeEngineType) {
    this._engine = engine;
  }

  get state(): EffectProcessorState {
    return this._state;
  }
  get gpuInfo(): EffectProcessorGpuInfo | null {
    return this._gpuInfo;
  }
  get isReady(): boolean {
    return this._state === 'ready';
  }

  async initialize(): Promise<void> {
    try {
      // Fetch GPU info
      const gpuJson = await this._engine.gpuInfo();
      const gpuResponse = JSON.parse(gpuJson);
      if (gpuResponse.status === 'ok' && gpuResponse.data) {
        this._gpuInfo = {
          deviceName: gpuResponse.data.name ?? 'Unknown',
          vendor: gpuResponse.data.vendor ?? 'Unknown',
          backend: gpuResponse.data.backend ?? 'Unknown',
          isDiscrete: gpuResponse.data.device_type === 'DiscreteGpu',
          maxTextureSize: 16384,
        };
      }
      this._state = 'ready';
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  /**
   * Apply GPU effects to a frame.
   *
   * NativeEffectProcessor runs in the Extension Host (Node.js) which does not
   * support the browser-only VideoFrame API. Only raw RGBA pixel data as
   * Uint8Array is accepted. The union type is inherited from IEffectProcessor
   * for interface compatibility with browser-based implementations.
   */
  async processFrame(
    frame: Uint8Array | VideoFrame,
    width: number,
    height: number,
    effects: GpuEffectParams[],
  ): Promise<Uint8Array> {
    if (!this.isReady) {
      throw new Error('Effect processor not ready');
    }

    let currentData: Uint8Array;
    if (frame instanceof Uint8Array) {
      currentData = frame;
    } else {
      // VideoFrame is a browser-only Web Codecs API, unavailable in Node.js.
      // Callers must convert VideoFrame to Uint8Array before invoking.
      throw new Error(
        'VideoFrame input is not supported in NativeEffectProcessor (Node.js environment). ' +
          'Convert VideoFrame to Uint8Array before calling processFrame().',
      );
    }

    // Apply each effect sequentially
    for (const effect of effects) {
      if (effect.type === 'custom') {
        const params = effect.uniforms ?? {};
        const responseJson = await this._engine.dispatchAction(
          'effects',
          'apply',
          null,
          JSON.stringify({
            data: Buffer.from(currentData).toString('base64'),
            width,
            height,
            shaderId: effect.shaderId,
            params,
          }),
        );
        const response = JSON.parse(responseJson);
        if (response.status !== 'ok' || !response.data?.data) {
          throw new Error(response.error?.message ?? 'Effect apply failed');
        }
        currentData = new Uint8Array(Buffer.from(response.data.data, 'base64'));
      } else {
        throw new Error(
          `Effect type '${effect.type}' is not supported in NativeEffectProcessor. ` +
            `Only 'custom' effects are supported through this processor.`,
        );
      }
    }

    return currentData;
  }

  async processPipeline(
    frame: Uint8Array | VideoFrame,
    width: number,
    height: number,
    pipeline: EffectPipeline,
  ): Promise<Uint8Array> {
    const enabledEffects = pipeline.effects
      .filter((e) => e.enabled)
      .sort((a, b) => a.order - b.order)
      .map((e) => e.params);

    return this.processFrame(frame, width, height, enabledEffects);
  }

  async registerCustomShader(id: string, shaderCode: string): Promise<void> {
    const responseJson = await this._engine.dispatchAction(
      'effects',
      'register',
      null,
      JSON.stringify({ id, code: shaderCode, params: [] }),
    );
    const response = JSON.parse(responseJson);
    if (response.status !== 'ok') {
      throw new Error(response.error?.message ?? `Failed to register shader: ${id}`);
    }
  }

  async dispose(): Promise<void> {
    this._state = 'disposed';
    this._gpuInfo = null;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a NativeMediaEngine instance
 */
export async function createNativeMediaEngine(
  options?: MediaEngineInitOptions,
): Promise<NativeMediaEngine> {
  const engine = new NativeMediaEngine();
  await engine.initialize(options);
  return engine;
}
