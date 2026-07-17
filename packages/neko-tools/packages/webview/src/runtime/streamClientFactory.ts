import {
  AudioStreamClient,
  H264StreamClient,
  type AudioStreamClientConfig,
  type H264StreamClientConfig,
} from '@neko/neko-client';

export interface IMediaDiffStreamClientFactory {
  createAudioStreamClient(config: AudioStreamClientConfig): AudioStreamClient;
  createVideoStreamClient(config: H264StreamClientConfig): H264StreamClient;
}

class DefaultMediaDiffStreamClientFactory implements IMediaDiffStreamClientFactory {
  createAudioStreamClient(config: AudioStreamClientConfig): AudioStreamClient {
    return new AudioStreamClient(config);
  }

  createVideoStreamClient(config: H264StreamClientConfig): H264StreamClient {
    return new H264StreamClient(config);
  }
}

const defaultMediaDiffStreamClientFactory = new DefaultMediaDiffStreamClientFactory();

export function getDefaultMediaDiffStreamClientFactory(): IMediaDiffStreamClientFactory {
  return defaultMediaDiffStreamClientFactory;
}
