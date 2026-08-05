import { Transform } from 'node:stream';
import type { RunningProcess } from './NodeFfmpegProcess';

export interface RegisteredMediaFile {
  readonly token: string;
  readonly url: string;
  release(): void;
}

export interface RegisteredPcmStream extends RegisteredMediaFile {
  prime(): void;
}

export interface NodeMediaPublisher {
  registerFile(path: string, contentType: string): Promise<RegisteredMediaFile>;
  registerPcm(createStream: (signal: AbortSignal) => RunningProcess): Promise<RegisteredPcmStream>;
  unregister(token: string): void;
}

export interface PcmPacketTransformOptions {
  readonly sampleRate: number;
  readonly channels: number;
  readonly startTimeSeconds: number;
  readonly playbackRate: number;
  readonly framesPerPacket?: number;
}

export function createPcmPacketTransform(options: PcmPacketTransformOptions): Transform {
  const framesPerPacket = options.framesPerPacket ?? 960;
  const bytesPerFrame = options.channels * Float32Array.BYTES_PER_ELEMENT;
  const packetBytes = framesPerPacket * bytesPerFrame;
  let buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let emittedFrames = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      buffered = buffered.byteLength === 0 ? chunk : Buffer.concat([buffered, chunk]);
      while (buffered.byteLength >= packetBytes) {
        const packet = buffered.subarray(0, packetBytes);
        buffered = buffered.subarray(packetBytes);
        this.push(framePcmPacket(packet, framesPerPacket, emittedFrames, options));
        emittedFrames += framesPerPacket;
      }
      callback();
    },
    flush(callback) {
      const completeFrames = Math.floor(buffered.byteLength / bytesPerFrame);
      if (completeFrames > 0) {
        const bytes = buffered.subarray(0, completeFrames * bytesPerFrame);
        this.push(framePcmPacket(bytes, completeFrames, emittedFrames, options));
      }
      callback();
    },
  });
}

function framePcmPacket(
  pcm: Buffer,
  frameCount: number,
  emittedFrames: number,
  options: PcmPacketTransformOptions,
): Buffer {
  const header = Buffer.alloc(22);
  const elapsedOutputSeconds = emittedFrames / options.sampleRate;
  const ptsMicroseconds = Math.round(
    (options.startTimeSeconds + elapsedOutputSeconds * options.playbackRate) * 1_000_000,
  );
  const durationMicroseconds = Math.round((frameCount / options.sampleRate) * 1_000_000);
  header.writeBigInt64LE(BigInt(ptsMicroseconds), 0);
  header.writeBigInt64LE(BigInt(durationMicroseconds), 8);
  header.writeUInt32LE(options.sampleRate, 16);
  header.writeUInt16LE(options.channels, 20);
  return Buffer.concat([header, pcm]);
}
