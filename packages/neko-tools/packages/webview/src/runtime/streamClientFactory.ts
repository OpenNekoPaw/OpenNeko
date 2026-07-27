import { PcmAudioClient, type PcmAudioClientOptions } from '@neko/media/browser';

export interface IMediaDiffStreamClientFactory {
  createAudioClient(options: PcmAudioClientOptions): PcmAudioClient;
}

class DefaultMediaDiffStreamClientFactory implements IMediaDiffStreamClientFactory {
  createAudioClient(options: PcmAudioClientOptions): PcmAudioClient {
    return new PcmAudioClient(options);
  }
}

const defaultMediaDiffStreamClientFactory = new DefaultMediaDiffStreamClientFactory();

export function getDefaultMediaDiffStreamClientFactory(): IMediaDiffStreamClientFactory {
  return defaultMediaDiffStreamClientFactory;
}
