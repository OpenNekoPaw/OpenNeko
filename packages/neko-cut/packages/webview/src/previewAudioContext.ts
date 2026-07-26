export type PreviewAudioContextFactory = () => AudioContext;

export class PreviewAudioContextOwner {
  private context: AudioContext | undefined;
  private ready: Promise<void> | undefined;
  private mixInput: GainNode | undefined;
  private limiter: DynamicsCompressorNode | undefined;

  constructor(
    private readonly createContext: PreviewAudioContextFactory = () => new AudioContext(),
  ) {}

  activateFromUserGesture(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = this.createContext();
    }
    this.ready = this.context.state === 'suspended' ? this.context.resume() : Promise.resolve();
    void this.ready.catch(() => undefined);
    return this.context;
  }

  async contextForConnection(): Promise<AudioContext> {
    const context = this.context;
    const ready = this.ready;
    if (!context || !ready) {
      throw new Error('Cut preview AudioContext has not been activated by a user gesture.');
    }
    await ready;
    if (context.state === 'closed') {
      throw new Error('Cut preview AudioContext was closed before media clients connected.');
    }
    return context;
  }

  async mixDestinationForConnection(): Promise<AudioNode> {
    const context = await this.contextForConnection();
    if (!this.mixInput || !this.limiter) {
      const mixInput = context.createGain();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;
      mixInput.connect(limiter);
      limiter.connect(context.destination);
      this.mixInput = mixInput;
      this.limiter = limiter;
    }
    return this.mixInput;
  }

  async dispose(): Promise<void> {
    const context = this.context;
    this.mixInput?.disconnect();
    this.limiter?.disconnect();
    this.mixInput = undefined;
    this.limiter = undefined;
    this.context = undefined;
    this.ready = undefined;
    if (context && context.state !== 'closed') {
      await context.close();
    }
  }
}
