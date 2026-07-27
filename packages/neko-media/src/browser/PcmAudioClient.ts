import type { PcmStreamDescriptor } from '../contracts';

export interface PcmAudioClientOptions {
  readonly descriptor: PcmStreamDescriptor;
  readonly volume: number;
  readonly playbackRate: number;
  readonly destination?: AudioNode;
  readonly gainEnvelope?: PcmGainEnvelope;
  readonly onError?: (error: Error) => void;
  readonly onPlaybackEnd?: () => void;
}

export interface PcmGainEnvelope {
  readonly positionSeconds: number;
  readonly clipDurationSeconds: number;
  readonly fadeInSeconds: number;
  readonly fadeOutSeconds: number;
}

interface ParsedPcmPacket {
  readonly ptsSeconds: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly samples: Float32Array;
}

const HEADER_BYTES = 22;
const PREBUFFER_SECONDS = 0.1;
const SCHEDULE_HIGH_WATER_SECONDS = 1;
const SCHEDULE_LOW_WATER_SECONDS = 0.5;
const CAPACITY_POLL_MILLISECONDS = 20;

export class PcmAudioClient {
  private readonly abortController = new AbortController();
  private readonly scheduledSources = new Set<AudioBufferSourceNode>();
  private audioContext: AudioContext | undefined;
  private gainNode: GainNode | undefined;
  private envelopeGainNode: GainNode | undefined;
  private ownsAudioContext = false;
  private nextPlayTime = 0;
  private clockContextOrigin: number | undefined;
  private clockMediaOrigin: number | undefined;
  private resolvePrepared: (() => void) | undefined;
  private rejectPrepared: ((error: Error) => void) | undefined;
  private resolveStart: ((contextTime: number) => void) | undefined;
  private rejectStart: ((error: Error) => void) | undefined;
  private resolveFirstScheduled: (() => void) | undefined;
  private rejectFirstScheduled: ((error: Error) => void) | undefined;
  private state: 'idle' | 'preparing' | 'prepared' | 'started' = 'idle';
  private inputEnded = false;
  private playbackEndNotified = false;
  private retirementTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: PcmAudioClientOptions) {
    validateDescriptor(options.descriptor);
    assertNonNegativeFinite(options.volume, 'PCM volume');
    assertPositiveFinite(options.playbackRate, 'PCM playback rate');
    if (options.gainEnvelope) validateGainEnvelope(options.gainEnvelope);
  }

  async connect(existingAudioContext?: AudioContext): Promise<void> {
    await this.prepare(existingAudioContext);
    const context = this.requireAudioContext();
    await this.startAt(context.currentTime + PREBUFFER_SECONDS);
  }

  async prepare(existingAudioContext?: AudioContext): Promise<void> {
    if (this.disposed) throw new Error('PCM audio client is disposed.');
    if (this.state !== 'idle') {
      throw new Error(`PCM audio client cannot prepare from state ${this.state}.`);
    }
    this.state = 'preparing';
    this.audioContext =
      existingAudioContext ?? new AudioContext({ sampleRate: this.options.descriptor.sampleRate });
    this.ownsAudioContext = existingAudioContext === undefined;
    this.gainNode = this.audioContext.createGain();
    this.envelopeGainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.options.volume;
    this.envelopeGainNode.connect(this.gainNode);
    this.gainNode.connect(this.options.destination ?? this.audioContext.destination);
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    const response = await fetch(this.options.descriptor.streamUrl, {
      signal: this.abortController.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`PCM request failed with ${response.status}.`);
    }
    const prepared = new Promise<void>((resolve, reject) => {
      this.resolvePrepared = resolve;
      this.rejectPrepared = reject;
    });
    const start = new Promise<number>((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    const firstScheduled = new Promise<void>((resolve, reject) => {
      this.resolveFirstScheduled = resolve;
      this.rejectFirstScheduled = reject;
    });
    void this.consume(response.body, start).then(
      () => {
        if (this.state === 'preparing') {
          this.rejectPendingPreparation(
            new Error('PCM stream ended before its first complete packet.'),
          );
        }
      },
      (error: unknown) => {
        const failure = asError(error);
        if (this.state === 'preparing') {
          this.rejectPendingPreparation(failure);
        } else if (this.state === 'prepared') {
          this.rejectPendingStart(failure);
        } else if (!this.isClockReady) {
          this.rejectPendingFirstScheduled(failure);
        } else if (!this.disposed) {
          this.options.onError?.(failure);
        }
      },
    );
    await prepared;
    if (this.state === 'preparing') this.state = 'prepared';
    void firstScheduled.catch(() => undefined);
  }

  async startAt(contextTime: number): Promise<void> {
    if (this.disposed) throw new Error('PCM audio client is disposed.');
    if (this.state !== 'prepared') {
      throw new Error(`PCM audio client cannot start from state ${this.state}.`);
    }
    const context = this.requireAudioContext();
    if (!Number.isFinite(contextTime) || contextTime < context.currentTime) {
      throw new Error('PCM start time must be a finite AudioContext time in the future.');
    }
    this.state = 'started';
    this.applyGainEnvelope(contextTime);
    const firstScheduled = new Promise<void>((resolve, reject) => {
      const previousResolve = this.resolveFirstScheduled;
      const previousReject = this.rejectFirstScheduled;
      this.resolveFirstScheduled = () => {
        previousResolve?.();
        resolve();
      };
      this.rejectFirstScheduled = (error) => {
        previousReject?.(error);
        reject(error);
      };
    });
    const resolve = this.resolveStart;
    this.resolveStart = undefined;
    this.rejectStart = undefined;
    resolve?.(contextTime);
    await firstScheduled;
  }

  get isClockReady(): boolean {
    return this.clockContextOrigin !== undefined && this.clockMediaOrigin !== undefined;
  }

  getCurrentTime(): number {
    if (
      !this.audioContext ||
      this.clockContextOrigin === undefined ||
      this.clockMediaOrigin === undefined
    ) {
      return 0;
    }
    return (
      this.clockMediaOrigin +
      (this.outputContextTime() - this.clockContextOrigin) * this.options.playbackRate
    );
  }

  setVolume(volume: number): void {
    if (!this.audioContext || !this.gainNode) return;
    assertNonNegativeFinite(volume, 'PCM volume');
    this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
  }

  pause(): Promise<void> {
    return this.audioContext?.state === 'running' ? this.audioContext.suspend() : Promise.resolve();
  }

  resume(): Promise<void> {
    return this.audioContext?.state === 'suspended'
      ? this.audioContext.resume()
      : Promise.resolve();
  }

  getAudioContext(): AudioContext | undefined {
    return this.audioContext;
  }

  getGainNode(): GainNode | undefined {
    return this.gainNode;
  }

  retireAt(contextTime: number, fadeDurationSeconds = 0.01): void {
    if (this.disposed) return;
    const context = this.audioContext;
    const gainNode = this.gainNode;
    if (!context || !gainNode) {
      this.dispose();
      return;
    }
    if (!Number.isFinite(contextTime) || contextTime < context.currentTime) {
      throw new Error('PCM retirement time must be a finite AudioContext time in the future.');
    }
    assertNonNegativeFinite(fadeDurationSeconds, 'PCM retirement fade duration');
    this.disposed = true;
    const stopped = new Error('PCM audio client was retired.');
    this.rejectPendingPreparation(stopped);
    this.rejectPendingStart(stopped);
    this.rejectPendingFirstScheduled(stopped);
    this.abortController.abort(stopped);
    const endTime = contextTime + fadeDurationSeconds;
    gainNode.gain.cancelScheduledValues(contextTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, contextTime);
    gainNode.gain.linearRampToValueAtTime(0, endTime);
    for (const source of this.scheduledSources) {
      try {
        source.stop(endTime);
      } catch {
        // An already-ended Web Audio source has no remaining resource to retire.
      }
    }
    const delayMilliseconds = Math.max(0, (endTime - context.currentTime) * 1000);
    this.retirementTimer = setTimeout(() => {
      this.retirementTimer = undefined;
      this.releaseAudioNodes(false);
    }, delayMilliseconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const stopped = new Error('PCM audio client was stopped.');
    this.rejectPendingPreparation(stopped);
    this.rejectPendingStart(stopped);
    this.rejectPendingFirstScheduled(stopped);
    this.abortController.abort(stopped);
    this.releaseAudioNodes(true);
  }

  private releaseAudioNodes(stopImmediately: boolean): void {
    if (this.retirementTimer) {
      clearTimeout(this.retirementTimer);
      this.retirementTimer = undefined;
    }
    for (const source of this.scheduledSources) {
      if (stopImmediately) {
        try {
          source.stop();
        } catch {
          // An already-ended Web Audio source has no remaining resource to stop.
        }
      }
      source.disconnect();
    }
    this.scheduledSources.clear();
    this.gainNode?.disconnect();
    this.envelopeGainNode?.disconnect();
    const audioContext = this.audioContext;
    if (this.ownsAudioContext && audioContext && audioContext.state !== 'closed') {
      void audioContext.close();
    }
    this.audioContext = undefined;
    this.gainNode = undefined;
    this.envelopeGainNode = undefined;
  }

  private async consume(stream: ReadableStream<Uint8Array>, start: Promise<number>): Promise<void> {
    const reader = stream.getReader();
    let pending: Uint8Array<ArrayBufferLike> = new Uint8Array();
    const prebuffer: ParsedPcmPacket[] = [];
    let prebufferDurationSeconds = 0;
    let started = false;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        pending = concatenate(pending, result.value);
        for (;;) {
          const parsed = parsePacket(pending);
          if (!parsed) break;
          pending = pending.subarray(parsed.consumedBytes);
          if (!started) {
            prebuffer.push(parsed.packet);
            prebufferDurationSeconds += packetDurationSeconds(parsed.packet);
            if (prebufferDurationSeconds < PREBUFFER_SECONDS) continue;
            this.resolvePendingPreparation();
            this.nextPlayTime = await start;
            started = true;
            for (const packet of prebuffer) this.schedule(packet);
            prebuffer.length = 0;
            continue;
          }
          await this.waitForScheduleCapacity();
          this.schedule(parsed.packet);
        }
      }
      if (pending.byteLength !== 0) {
        throw new Error('PCM stream ended with an incomplete frame.');
      }
      if (!started && prebuffer.length > 0) {
        this.resolvePendingPreparation();
        this.nextPlayTime = await start;
        started = true;
        for (const packet of prebuffer) this.schedule(packet);
        prebuffer.length = 0;
      }
      this.inputEnded = true;
      this.notifyPlaybackEndIfComplete();
    } finally {
      reader.releaseLock();
    }
  }

  private schedule(packet: ParsedPcmPacket): void {
    const context = this.audioContext;
    const gainNode = this.gainNode;
    const envelopeGainNode = this.envelopeGainNode;
    if (!context || !gainNode || !envelopeGainNode || this.disposed) return;
    const frames = packet.samples.length / packet.channels;
    if (!Number.isInteger(frames) || frames <= 0) throw new Error('Invalid PCM sample count.');
    const audioBuffer = context.createBuffer(packet.channels, frames, packet.sampleRate);
    for (let channel = 0; channel < packet.channels; channel += 1) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let frame = 0; frame < frames; frame += 1) {
        channelData[frame] = packet.samples[frame * packet.channels + channel] ?? 0;
      }
    }
    if (this.clockContextOrigin === undefined) {
      this.clockContextOrigin = this.nextPlayTime;
      this.clockMediaOrigin = packet.ptsSeconds;
    }
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(envelopeGainNode);
    source.onended = () => {
      this.scheduledSources.delete(source);
      source.disconnect();
      this.notifyPlaybackEndIfComplete();
    };
    this.scheduledSources.add(source);
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
    this.resolvePendingFirstScheduled();
  }

  private resolvePendingPreparation(): void {
    const resolve = this.resolvePrepared;
    this.resolvePrepared = undefined;
    this.rejectPrepared = undefined;
    resolve?.();
  }

  private rejectPendingPreparation(error: Error): void {
    const reject = this.rejectPrepared;
    this.resolvePrepared = undefined;
    this.rejectPrepared = undefined;
    reject?.(error);
  }

  private rejectPendingStart(error: Error): void {
    const reject = this.rejectStart;
    this.resolveStart = undefined;
    this.rejectStart = undefined;
    reject?.(error);
  }

  private resolvePendingFirstScheduled(): void {
    const resolve = this.resolveFirstScheduled;
    this.resolveFirstScheduled = undefined;
    this.rejectFirstScheduled = undefined;
    resolve?.();
  }

  private notifyPlaybackEndIfComplete(): void {
    if (
      this.disposed ||
      this.playbackEndNotified ||
      !this.inputEnded ||
      this.scheduledSources.size !== 0
    ) {
      return;
    }
    this.playbackEndNotified = true;
    this.options.onPlaybackEnd?.();
  }

  private rejectPendingFirstScheduled(error: Error): void {
    const reject = this.rejectFirstScheduled;
    this.resolveFirstScheduled = undefined;
    this.rejectFirstScheduled = undefined;
    reject?.(error);
  }

  private async waitForScheduleCapacity(): Promise<void> {
    if (this.nextPlayTime - this.outputContextTime() <= SCHEDULE_HIGH_WATER_SECONDS) return;
    while (
      !this.disposed &&
      this.nextPlayTime - this.outputContextTime() > SCHEDULE_LOW_WATER_SECONDS
    ) {
      await abortableDelay(CAPACITY_POLL_MILLISECONDS, this.abortController.signal);
    }
  }

  private requireAudioContext(): AudioContext {
    const context = this.audioContext;
    if (!context) throw new Error('PCM audio client has no AudioContext.');
    return context;
  }

  private applyGainEnvelope(contextTime: number): void {
    const envelope = this.options.gainEnvelope;
    const parameter = this.envelopeGainNode?.gain;
    if (!envelope || !parameter) return;
    const remainingSeconds = envelope.clipDurationSeconds - envelope.positionSeconds;
    const pointCount = Math.max(2, Math.min(512, Math.ceil(remainingSeconds * 50) + 1));
    const curve = new Float32Array(pointCount);
    for (let index = 0; index < pointCount; index += 1) {
      const progress = index / (pointCount - 1);
      curve[index] = envelopeGain(envelope.positionSeconds + remainingSeconds * progress, envelope);
    }
    parameter.cancelScheduledValues(contextTime);
    parameter.setValueCurveAtTime(curve, contextTime, remainingSeconds);
  }

  private outputContextTime(): number {
    const context = this.audioContext;
    if (!context) return 0;
    try {
      const timestamp = context.getOutputTimestamp();
      if (timestamp.contextTime !== undefined && timestamp.contextTime > 0) {
        return timestamp.contextTime;
      }
    } catch {
      // Electron versions without output timestamps use the AudioContext clock.
    }
    return context.currentTime;
  }
}

function packetDurationSeconds(packet: ParsedPcmPacket): number {
  const frames = packet.samples.length / packet.channels;
  if (!Number.isInteger(frames) || frames <= 0) throw new Error('Invalid PCM sample count.');
  return frames / packet.sampleRate;
}

export function parsePcmPackets(bytes: Uint8Array): {
  readonly packets: readonly ParsedPcmPacket[];
  readonly remaining: Uint8Array;
} {
  const packets: ParsedPcmPacket[] = [];
  let remaining = bytes;
  for (;;) {
    const parsed = parsePacket(remaining);
    if (!parsed) return { packets, remaining };
    packets.push(parsed.packet);
    remaining = remaining.subarray(parsed.consumedBytes);
  }
}

function parsePacket(
  bytes: Uint8Array,
): { readonly packet: ParsedPcmPacket; readonly consumedBytes: number } | undefined {
  if (bytes.byteLength < HEADER_BYTES) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ptsMicroseconds = Number(view.getBigInt64(0, true));
  const durationMicroseconds = Number(view.getBigInt64(8, true));
  const sampleRate = view.getUint32(16, true);
  const channels = view.getUint16(20, true);
  if (
    !Number.isSafeInteger(ptsMicroseconds) ||
    !Number.isSafeInteger(durationMicroseconds) ||
    durationMicroseconds <= 0 ||
    sampleRate <= 0 ||
    channels <= 0
  ) {
    throw new Error('Invalid PCM packet header.');
  }
  const frameCount = Math.round((durationMicroseconds / 1_000_000) * sampleRate);
  const payloadBytes = frameCount * channels * Float32Array.BYTES_PER_ELEMENT;
  const consumedBytes = HEADER_BYTES + payloadBytes;
  if (bytes.byteLength < consumedBytes) return undefined;
  const payload = bytes.slice(HEADER_BYTES, consumedBytes);
  return {
    packet: {
      ptsSeconds: ptsMicroseconds / 1_000_000,
      sampleRate,
      channels,
      samples: new Float32Array(payload.buffer, payload.byteOffset, payloadBytes / 4),
    },
    consumedBytes,
  };
}

function validateDescriptor(descriptor: PcmStreamDescriptor): void {
  if (
    descriptor.version !== 1 ||
    descriptor.transport !== 'http' ||
    descriptor.protocol !== 'neko-pcm-f32le-v1'
  ) {
    throw new Error('Unsupported PCM descriptor version.');
  }
  const url = new URL(descriptor.streamUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw new Error('PCM descriptor must use loopback HTTP.');
  }
  if (descriptor.sampleRate <= 0 || descriptor.channels <= 0) {
    throw new Error('PCM descriptor contains invalid audio metadata.');
  }
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.byteLength === 0) return right;
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left);
  result.set(right, left.byteLength);
  return result;
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function validateGainEnvelope(envelope: PcmGainEnvelope): void {
  assertNonNegativeFinite(envelope.positionSeconds, 'PCM envelope position');
  assertPositiveFinite(envelope.clipDurationSeconds, 'PCM envelope clip duration');
  assertNonNegativeFinite(envelope.fadeInSeconds, 'PCM envelope fade-in');
  assertNonNegativeFinite(envelope.fadeOutSeconds, 'PCM envelope fade-out');
  if (
    envelope.positionSeconds >= envelope.clipDurationSeconds ||
    envelope.fadeInSeconds > envelope.clipDurationSeconds ||
    envelope.fadeOutSeconds > envelope.clipDurationSeconds
  ) {
    throw new Error('PCM gain envelope is outside the Clip duration.');
  }
}

function envelopeGain(positionSeconds: number, envelope: PcmGainEnvelope): number {
  const fadeInGain =
    envelope.fadeInSeconds > 0 ? Math.min(1, positionSeconds / envelope.fadeInSeconds) : 1;
  const remainingSeconds = envelope.clipDurationSeconds - positionSeconds;
  const fadeOutGain =
    envelope.fadeOutSeconds > 0 ? Math.min(1, remainingSeconds / envelope.fadeOutSeconds) : 1;
  return Math.max(0, Math.min(fadeInGain, fadeOutGain));
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = (): void => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
