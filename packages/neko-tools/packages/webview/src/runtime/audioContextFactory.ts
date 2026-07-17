export interface IAudioContextFactory {
  create(options?: AudioContextOptions): AudioContext;
  resume(context: AudioContext): Promise<void>;
  close(context: AudioContext): Promise<void>;
}

class BrowserAudioContextFactory implements IAudioContextFactory {
  create(options?: AudioContextOptions): AudioContext {
    return new AudioContext(options);
  }

  async resume(context: AudioContext): Promise<void> {
    if (context.state === 'suspended') {
      await context.resume();
    }
  }

  async close(context: AudioContext): Promise<void> {
    if (context.state !== 'closed') {
      await context.close();
    }
  }
}

const defaultAudioContextFactory = new BrowserAudioContextFactory();

export function getDefaultAudioContextFactory(): IAudioContextFactory {
  return defaultAudioContextFactory;
}
