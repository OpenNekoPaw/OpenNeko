export interface IScheduledTask {
  cancel(): void;
}

export interface IScheduler {
  scheduleOnce(callback: () => void, delayMs: number): IScheduledTask;
  wait(delayMs: number): Promise<void>;
}
