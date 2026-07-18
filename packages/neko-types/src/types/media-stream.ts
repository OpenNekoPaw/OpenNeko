/** Descriptor returned by the local Engine for a raw PCM WebSocket stream. */
export interface AudioStreamDescriptor {
  readonly streamId: string;
  readonly codec: 'pcm-f32le';
  readonly frameHeader: 'neko-pcm-v1';
  readonly sampleRate: number;
  readonly channels: number;
}
