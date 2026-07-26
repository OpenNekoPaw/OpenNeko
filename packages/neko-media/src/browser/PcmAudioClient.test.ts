// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PcmAudioClient, parsePcmPackets } from './PcmAudioClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePcmPackets', () => {
  it('buffers incomplete HTTP chunks and parses multiple framed packets', () => {
    const first = packet(1_250_000n, 20_000n, 48_000, 2);
    const second = packet(1_270_000n, 10_000n, 48_000, 2);
    const joined = concatenate(first, second);
    const split = first.byteLength + 17;

    const partial = parsePcmPackets(joined.subarray(0, split));
    expect(partial.packets).toHaveLength(1);
    expect(partial.packets[0]?.ptsSeconds).toBe(1.25);
    expect(partial.remaining.byteLength).toBe(17);

    const completed = parsePcmPackets(concatenate(partial.remaining, joined.subarray(split)));
    expect(completed.packets).toHaveLength(1);
    expect(completed.packets[0]).toMatchObject({
      ptsSeconds: 1.27,
      sampleRate: 48_000,
      channels: 2,
    });
    expect(completed.remaining.byteLength).toBe(0);
  });

  it('fails visibly for an invalid header', () => {
    const invalid = new Uint8Array(22);
    expect(() => parsePcmPackets(invalid)).toThrow('Invalid PCM packet header');
  });

  it('does not complete connection before the first PCM packet is scheduled', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    const starts: number[] = [];
    const audioContext = fakeAudioContext(starts);
    const client = new PcmAudioClient({
      descriptor: {
        version: 1,
        transport: 'http',
        protocol: 'neko-pcm-f32le-v1',
        streamUrl: 'http://127.0.0.1/pcm/session',
        sampleRate: 48_000,
        channels: 2,
      },
      playbackRate: 1,
      volume: 1,
    });

    let connected = false;
    const connection = client.connect(audioContext).then(() => {
      connected = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const connectedBeforeFirstPacket = connected;

    streamController?.enqueue(packet(1_250_000n, 20_000n, 48_000, 2));
    streamController?.close();
    await connection;

    expect(connectedBeforeFirstPacket).toBe(false);
    expect(client.isClockReady).toBe(true);
    expect(starts).toEqual([0.6]);
    client.dispose();
  });
});

function fakeAudioContext(starts: number[]): AudioContext {
  const gainNode = {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    currentTime: 0.5,
    destination: {},
    state: 'running',
    createGain: () => gainNode,
    createBuffer: (_channels: number, frames: number, sampleRate: number) => ({
      duration: frames / sampleRate,
      getChannelData: () => new Float32Array(frames),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: (time: number) => starts.push(time),
    }),
    getOutputTimestamp: () => ({ contextTime: 0.5, performanceTime: 0 }),
  } as unknown as AudioContext;
}

function packet(pts: bigint, duration: bigint, sampleRate: number, channels: number): Uint8Array {
  const frames = Math.round((Number(duration) / 1_000_000) * sampleRate);
  const bytes = new Uint8Array(22 + frames * channels * 4);
  const view = new DataView(bytes.buffer);
  view.setBigInt64(0, pts, true);
  view.setBigInt64(8, duration, true);
  view.setUint32(16, sampleRate, true);
  view.setUint16(20, channels, true);
  return bytes;
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left);
  result.set(right, left.byteLength);
  return result;
}
