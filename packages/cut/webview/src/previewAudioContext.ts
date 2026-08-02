export type PreviewAudioContextFactory = () => AudioContext;

const MINIMUM_AUDIO_START_LEAD_SECONDS = 0.05;
const AUDIO_SCHEDULING_MARGIN_SECONDS = 0.02;

export class PreviewAudioContextOwner {
  private context: AudioContext | undefined;
  private ready: Promise<void> | undefined;

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

  async dispose(): Promise<void> {
    const context = this.context;
    this.context = undefined;
    this.ready = undefined;
    if (context && context.state !== 'closed') {
      await context.close();
    }
  }
}

export function previewAudioStartTime(context: AudioContext): number {
  const baseLatency = finiteNonNegative(context.baseLatency);
  const outputLatency = finiteNonNegative(context.outputLatency);
  return (
    context.currentTime +
    Math.max(
      MINIMUM_AUDIO_START_LEAD_SECONDS,
      baseLatency + outputLatency + AUDIO_SCHEDULING_MARGIN_SECONDS,
    )
  );
}

function finiteNonNegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
}
