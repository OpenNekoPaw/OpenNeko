import type { PcmStreamDescriptor } from '../contracts';

export interface PcmAudioClientOptions {
  readonly descriptor: PcmStreamDescriptor;
  readonly volume: number;
  readonly playbackRate: number;
  readonly onError?: (error: Error) => void;
  readonly onStreamEnd?: () => void;
}

interface ParsedPcmPacket {
  readonly ptsSeconds: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly samples: Float32Array;
}

const HEADER_BYTES = 22;
const PREBUFFER_SECONDS = 0.1;

export class PcmAudioClient {
  private readonly abortController = new AbortController();
  private audioContext: AudioContext | undefined;
  private gainNode: GainNode | undefined;
  private ownsAudioContext = false;
  private nextPlayTime = 0;
  private clockContextOrigin: number | undefined;
  private clockMediaOrigin: number | undefined;
  private resolveFirstPacket: (() => void) | undefined;
  private rejectFirstPacket: ((error: Error) => void) | undefined;
  private disposed = false;

  constructor(private readonly options: PcmAudioClientOptions) {
    validateDescriptor(options.descriptor);
  }

  async connect(existingAudioContext?: AudioContext): Promise<void> {
    if (this.disposed) throw new Error('PCM audio client is disposed.');
    this.audioContext =
      existingAudioContext ?? new AudioContext({ sampleRate: this.options.descriptor.sampleRate });
    this.ownsAudioContext = existingAudioContext === undefined;
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = clampVolume(this.options.volume);
    this.gainNode.connect(this.audioContext.destination);
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    const response = await fetch(this.options.descriptor.streamUrl, {
      signal: this.abortController.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`PCM request failed with ${response.status}.`);
    }
    const firstPacket = new Promise<void>((resolve, reject) => {
      this.resolveFirstPacket = resolve;
      this.rejectFirstPacket = reject;
    });
    void this.consume(response.body).then(
      () => {
        if (!this.isClockReady) {
          this.rejectPendingConnection(
            new Error('PCM stream ended before its first complete packet.'),
          );
        }
      },
      (error: unknown) => {
        const failure = asError(error);
        if (!this.isClockReady) {
          this.rejectPendingConnection(failure);
        } else if (!this.disposed) {
          this.options.onError?.(failure);
        }
      },
    );
    await firstPacket;
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
    this.gainNode.gain.setValueAtTime(clampVolume(volume), this.audioContext.currentTime);
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const stopped = new Error('PCM audio client was stopped.');
    this.rejectPendingConnection(stopped);
    this.abortController.abort(stopped);
    this.gainNode?.disconnect();
    const audioContext = this.audioContext;
    if (this.ownsAudioContext && audioContext && audioContext.state !== 'closed') {
      void audioContext.close();
    }
    this.audioContext = undefined;
    this.gainNode = undefined;
  }

  private async consume(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    let pending: Uint8Array<ArrayBufferLike> = new Uint8Array();
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        pending = concatenate(pending, result.value);
        for (;;) {
          const parsed = parsePacket(pending);
          if (!parsed) break;
          pending = pending.subarray(parsed.consumedBytes);
          this.schedule(parsed.packet);
        }
      }
      if (pending.byteLength !== 0) {
        throw new Error('PCM stream ended with an incomplete frame.');
      }
      this.options.onStreamEnd?.();
    } finally {
      reader.releaseLock();
    }
  }

  private schedule(packet: ParsedPcmPacket): void {
    const context = this.audioContext;
    const gainNode = this.gainNode;
    if (!context || !gainNode || this.disposed) return;
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
      this.nextPlayTime = context.currentTime + PREBUFFER_SECONDS;
      this.clockContextOrigin = this.nextPlayTime;
      this.clockMediaOrigin = packet.ptsSeconds;
    }
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
    this.resolvePendingConnection();
  }

  private resolvePendingConnection(): void {
    const resolve = this.resolveFirstPacket;
    this.resolveFirstPacket = undefined;
    this.rejectFirstPacket = undefined;
    resolve?.();
  }

  private rejectPendingConnection(error: Error): void {
    const reject = this.rejectFirstPacket;
    this.resolveFirstPacket = undefined;
    this.rejectFirstPacket = undefined;
    reject?.(error);
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

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
