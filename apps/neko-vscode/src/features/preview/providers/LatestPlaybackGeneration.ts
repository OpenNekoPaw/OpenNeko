export class LatestPlaybackGeneration<T> {
  private active: T | undefined;
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly stopSession: (session: T) => Promise<void>) {}

  replace(prepare: () => Promise<T>, publish: (session: T) => Promise<void>): Promise<void> {
    const generation = ++this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation) return;
      await this.stopActive();
      if (generation !== this.generation) return;
      const prepared = await prepare();
      if (generation !== this.generation) {
        await this.stopSession(prepared);
        return;
      }
      this.active = prepared;
      try {
        await publish(prepared);
      } catch (error) {
        this.active = undefined;
        try {
          await this.stopSession(prepared);
        } catch (stopError) {
          throw new AggregateError(
            [error, stopError],
            'Playback publication and prepared-session cleanup both failed.',
          );
        }
        throw error;
      }
    });
  }

  stop(): Promise<void> {
    this.generation += 1;
    return this.enqueue(() => this.stopActive());
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.tail.then(operation, operation);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async stopActive(): Promise<void> {
    const active = this.active;
    if (active === undefined) return;
    this.active = undefined;
    await this.stopSession(active);
  }
}
