import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioStreamDescriptor } from '@neko/shared';
import { AudioStreamClient } from '../AudioStreamClient';
import { H264StreamClient } from '../H264StreamClient';

const audioDescriptor: AudioStreamDescriptor = {
  streamId: 'audio-stream',
  codec: 'pcm-f32le',
  frameHeader: 'neko-pcm-v1',
  sampleRate: 48_000,
  channels: 2,
};

const decoderConfigs: VideoDecoderConfig[] = [];
const sockets: FakeWebSocket[] = [];
let fakeDecodeQueueSize = 0;

class FakeVideoDecoder {
  state: CodecState = 'unconfigured';
  ondequeue: ((this: VideoDecoder, event: Event) => unknown) | null = null;

  constructor(private readonly init: VideoDecoderInit) {}

  get decodeQueueSize(): number {
    return fakeDecodeQueueSize;
  }

  static isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
    decoderConfigs.push(config);
    return Promise.resolve({ supported: true, config });
  }

  configure(config: VideoDecoderConfig): void {
    decoderConfigs.push(config);
    this.state = 'configured';
  }

  decode(chunk: EncodedVideoChunk): void {
    this.init.output({
      timestamp: chunk.timestamp,
      displayWidth: 1280,
      displayHeight: 720,
      close: vi.fn(),
    } as unknown as VideoFrame);
  }

  close(): void {
    this.state = 'closed';
  }

  reset(): void {
    this.state = 'unconfigured';
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  addEventListener(): void {}
  removeEventListener(): void {}
}

class FakeWebSocket {
  binaryType: BinaryType = 'arraybuffer';
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    sockets.push(this);
  }

  close(): void {}
}

class FakeEncodedVideoChunk {
  readonly timestamp: number;
  readonly duration?: number;

  constructor(init: EncodedVideoChunkInit) {
    this.timestamp = init.timestamp;
    this.duration = init.duration;
  }
}

class FakeGainNode {
  gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn((value: number) => {
      this.gain.value = value;
    }),
    linearRampToValueAtTime: vi.fn((value: number) => {
      this.gain.value = value;
    }),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  connect = vi.fn();
  start = vi.fn();
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  resume = vi.fn(() => Promise.resolve());
  createGain = vi.fn(() => new FakeGainNode());
  createBufferSource = vi.fn(() => new FakeBufferSource());
  createBuffer = vi.fn();
  getOutputTimestamp = vi.fn(() => ({ contextTime: this.currentTime, performanceTime: 0 }));
}

describe('media stream clients', () => {
  beforeEach(() => {
    decoderConfigs.length = 0;
    sockets.length = 0;
    fakeDecodeQueueSize = 0;
    vi.stubGlobal('VideoDecoder', FakeVideoDecoder);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('EncodedVideoChunk', FakeEncodedVideoChunk);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('configures a generic low-latency H.264 decoder', async () => {
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/video',
      width: 1280,
      height: 720,
      codecString: 'avc1.640028',
    });

    await client.connect();

    expect(decoderConfigs).toEqual([
      expect.objectContaining({
        codec: 'avc1.640028',
        codedWidth: 1280,
        codedHeight: 720,
        optimizeForLatency: true,
      }),
      expect.objectContaining({ codec: 'avc1.640028' }),
    ]);
    expect(sockets[0]?.url).toBe('ws://127.0.0.1:3000/v1/streams/video');
    client.dispose();
  });

  it('waits for a keyframe and then emits decoded media frames', async () => {
    const frames: number[] = [];
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/video',
      width: 1280,
      height: 720,
      onFrame: (frame) => frames.push(frame.timestamp),
    });
    await client.connect();
    const socket = sockets[0];

    socket?.onmessage?.({ data: createH264Packet(10_000, 33_333, false) });
    socket?.onmessage?.({ data: createH264Packet(20_000, 33_333, true) });

    expect(frames).toEqual([20_000]);
    expect(client.getStats()).toMatchObject({
      packetsReceived: 2,
      framesDecoded: 1,
      framesDropped: 1,
      framesDroppedBeforeDecode: 1,
    });
    client.dispose();
  });

  it('drops backlogged delta frames under the explicit media policy', async () => {
    const frames: number[] = [];
    const client = new H264StreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/video',
      width: 1280,
      height: 720,
      onFrame: (frame) => frames.push(frame.timestamp),
      backpressure: {
        maxDecodeQueueDepth: 2,
        dropDeltaFramesWhenBacklogged: true,
        preserveKeyframes: true,
      },
    });
    await client.connect();
    const socket = sockets[0];
    socket?.onmessage?.({ data: createH264Packet(10_000, 33_333, true) });
    fakeDecodeQueueSize = 4;
    socket?.onmessage?.({ data: createH264Packet(20_000, 33_333, false) });

    expect(frames).toEqual([10_000]);
    expect(client.getStats().framesDroppedBeforeDecode).toBe(1);
    client.dispose();
  });

  it('rejects invalid media dimensions', () => {
    expect(
      () =>
        new H264StreamClient({
          websocketUrl: 'ws://127.0.0.1:3000/v1/streams/video',
          width: 0,
          height: 720,
        }),
    ).toThrow('width must be a positive integer');
  });

  it('validates retained PCM audio descriptors', () => {
    expect(() => AudioStreamClient.validateDescriptor(audioDescriptor)).not.toThrow();
    expect(() =>
      AudioStreamClient.validateDescriptor({
        ...audioDescriptor,
        codec: 'aac',
      } as unknown as AudioStreamDescriptor),
    ).toThrow(/Unsupported audio stream codec/);
  });

  it('does not close an externally owned AudioContext', async () => {
    const client = new AudioStreamClient({
      websocketUrl: 'ws://127.0.0.1:3000/v1/streams/audio',
      descriptor: audioDescriptor,
    });
    const audioContext = new FakeAudioContext();

    await client.connect(audioContext as unknown as AudioContext);
    client.dispose();

    expect(audioContext.close).not.toHaveBeenCalled();
  });
});

function createH264Packet(ptsUs: number, durationUs: number, isKeyframe: boolean): ArrayBuffer {
  const data = new ArrayBuffer(29);
  const view = new DataView(data);
  view.setBigInt64(0, BigInt(ptsUs), true);
  view.setBigInt64(8, BigInt(ptsUs), true);
  view.setUint8(16, isKeyframe ? 1 : 0);
  view.setBigInt64(17, BigInt(durationUs), true);
  return data;
}
