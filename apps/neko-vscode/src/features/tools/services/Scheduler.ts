import type { IScheduledTask, IScheduler } from '../contracts/IScheduler';

class TimeoutTask implements IScheduledTask {
  private cancelled = false;

  constructor(private readonly handle: ReturnType<typeof setTimeout>) {}

  cancel(): void {
    if (this.cancelled) {
      return;
    }

    clearTimeout(this.handle);
    this.cancelled = true;
  }
}

export class DefaultScheduler implements IScheduler {
  scheduleOnce(callback: () => void, delayMs: number): IScheduledTask {
    const handle = setTimeout(callback, delayMs);
    return new TimeoutTask(handle);
  }

  async wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      const handle = this.scheduleOnce(resolve, delayMs);
      void handle;
    });
  }
}
