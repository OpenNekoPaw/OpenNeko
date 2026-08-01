// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PcmAudioClient, parsePcmPackets } from './PcmAudioClient';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('parsePcmPackets', () => {
  it('buffers incomplete stream chunks and parses multiple framed packets', () => {
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
        protocol: 'neko-pcm-f32le-v1',
        streamUrl: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
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

  it('does not report a cold stream prepared until 100 ms of PCM is buffered', async () => {
    const { stream, controller } = controlledStream();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    const client = createClient();
    let isPrepared = false;
    const prepared = client.prepare(fakeAudioContext([])).then(() => {
      isPrepared = true;
    });

    controller.enqueue(concatenateMany(prebufferPackets().slice(0, 4)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isPrepared).toBe(false);

    controller.enqueue(prebufferPackets()[4]!);
    await prepared;
    expect(isPrepared).toBe(true);
    client.dispose();
  });

  it('prepares concurrent tracks before starting both at one shared context time', async () => {
    const streams = [controlledStream(), controlledStream()];
    let fetchIndex = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: streams[fetchIndex++]?.stream,
      })),
    );
    const starts: number[] = [];
    const context = fakeAudioContext(starts);
    const clients = [createClient(), createClient()];

    const prepared = clients.map((client) => client.prepare(context));
    streams.forEach(({ controller }, index) => {
      controller.enqueue(concatenateMany(prebufferPackets(BigInt(1_000_000 + index * 500_000))));
    });
    await Promise.all(prepared);
    await Promise.all(clients.map((client) => client.startAt(1.25)));

    expect(starts).toEqual([1.25, 1.27, 1.29, 1.31, 1.33, 1.25, 1.27, 1.29, 1.31, 1.33]);
    clients.forEach((client) => client.dispose());
  });

  it('keeps scheduled PCM lead bounded and stops scheduled sources on disposal', async () => {
    const packets = Array.from({ length: 200 }, (_, index) =>
      packet(BigInt(index * 20_000), 20_000n, 48_000, 2),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(concatenateMany(packets));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    const starts: number[] = [];
    const stopped: number[] = [];
    const client = createClient();

    await client.connect(fakeAudioContext(starts, stopped));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(starts.length).toBeGreaterThan(1);
    expect(starts.length).toBeLessThanOrEqual(52);
    client.dispose();
    expect(stopped).toHaveLength(starts.length);
  });

  it('retires a generation with a gain ramp before scheduled sources stop', async () => {
    vi.useFakeTimers();
    const { stream, controller } = controlledStream();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    const starts: number[] = [];
    const stopped: number[] = [];
    const ramps: Array<{ value: number; time: number }> = [];
    const client = createClient();
    const prepared = client.prepare(fakeAudioContext(starts, stopped, [], [], [], ramps));
    controller.enqueue(concatenateMany(prebufferPackets()));
    await prepared;
    await client.startAt(0.75);

    client.retireAt(0.8, 0.01);

    expect(ramps).toEqual([{ value: 0, time: 0.81 }]);
    expect(stopped).toEqual([0.81, 0.81, 0.81, 0.81, 0.81]);
    await vi.advanceTimersByTimeAsync(310);
    vi.useRealTimers();
  });

  it('reports playback end only after the final scheduled source has ended', async () => {
    const { stream, controller } = controlledStream();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    const scheduledSources: Array<{ onended: (() => void) | null }> = [];
    const onPlaybackEnd = vi.fn();
    const client = new PcmAudioClient({
      descriptor: {
        version: 1,
        protocol: 'neko-pcm-f32le-v1',
        streamUrl: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
        sampleRate: 48_000,
        channels: 2,
      },
      playbackRate: 1,
      volume: 1,
      onPlaybackEnd,
    });
    const prepared = client.prepare(fakeAudioContext([], [], [], [], scheduledSources));
    controller.enqueue(concatenateMany(prebufferPackets()));
    controller.close();
    await prepared;
    await client.startAt(0.75);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onPlaybackEnd).not.toHaveBeenCalled();
    scheduledSources.forEach((source) => source.onended?.());
    expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it('preserves positive linear gain instead of clamping preview audio to unity', async () => {
    const { stream, controller } = controlledStream();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    const gainValues: number[] = [];
    const client = createClient(2);
    const prepared = client.prepare(fakeAudioContext([], [], gainValues));
    controller.enqueue(concatenateMany(prebufferPackets()));
    await prepared;
    await client.startAt(0.75);

    expect(gainValues).toContain(2);
    client.dispose();
  });

  it('starts a realtime envelope from the current position inside a Clip fade', async () => {
    const { stream, controller } = controlledStream();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, body: stream })),
    );
    const curves: Float32Array[] = [];
    const client = new PcmAudioClient({
      descriptor: {
        version: 1,
        protocol: 'neko-pcm-f32le-v1',
        streamUrl: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
        sampleRate: 48_000,
        channels: 2,
      },
      playbackRate: 1,
      volume: 1,
      gainEnvelope: {
        positionSeconds: 1,
        clipDurationSeconds: 4,
        fadeInSeconds: 2,
        fadeOutSeconds: 1,
      },
    });
    const prepared = client.prepare(fakeAudioContext([], [], [], curves));
    controller.enqueue(concatenateMany(prebufferPackets(1_000_000n)));
    await prepared;
    await client.startAt(0.75);

    expect(curves).toHaveLength(1);
    expect(curves[0]?.[0]).toBeCloseTo(0.5);
    expect(curves[0]?.at(-1)).toBeCloseTo(0);
    client.dispose();
  });
});

function createClient(volume = 1): PcmAudioClient {
  return new PcmAudioClient({
    descriptor: {
      version: 1,
      protocol: 'neko-pcm-f32le-v1',
      streamUrl: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
      sampleRate: 48_000,
      channels: 2,
    },
    playbackRate: 1,
    volume,
  });
}

function controlledStream(): {
  readonly stream: ReadableStream<Uint8Array>;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  if (!controller) throw new Error('Controlled stream did not expose its controller.');
  return { stream, controller };
}

function fakeAudioContext(
  starts: number[],
  stopped: number[] = [],
  gainValues: number[] = [],
  curves: Float32Array[] = [],
  scheduledSources: Array<{ onended: (() => void) | null }> = [],
  ramps: Array<{ value: number; time: number }> = [],
): AudioContext {
  const gainNode = {
    gain: {
      set value(value: number) {
        gainValues.push(value);
      },
      get value() {
        return gainValues.at(-1) ?? 1;
      },
      setValueAtTime: vi.fn((value: number) => gainValues.push(value)),
      cancelScheduledValues: vi.fn(),
      setValueCurveAtTime: vi.fn((curve: Float32Array) => curves.push(curve)),
      linearRampToValueAtTime: vi.fn((value: number, time: number) => ramps.push({ value, time })),
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
    createBufferSource: () => {
      const source = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: (time: number) => starts.push(time),
        stop: (time = 0) => stopped.push(time),
        onended: null as (() => void) | null,
      };
      scheduledSources.push(source);
      return source;
    },
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

function prebufferPackets(startPts = 0n): readonly Uint8Array[] {
  return Array.from({ length: 5 }, (_, index) =>
    packet(startPts + BigInt(index * 20_000), 20_000n, 48_000, 2),
  );
}

function concatenate(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.byteLength + right.byteLength);
  result.set(left);
  result.set(right, left.byteLength);
  return result;
}

function concatenateMany(values: readonly Uint8Array[]): Uint8Array {
  return values.reduce((result, value) => concatenate(result, value), new Uint8Array());
}
