export class PreviewStopCoordinator<Key extends object> {
  private readonly tasks = new WeakMap<Key, Promise<void>>();

  async run(key: Key, stop: () => Promise<void>): Promise<void> {
    const active = this.tasks.get(key);
    if (active) {
      await active;
      return;
    }

    const task = stop();
    this.tasks.set(key, task);
    try {
      await task;
    } finally {
      if (this.tasks.get(key) === task) {
        this.tasks.delete(key);
      }
    }
  }
}
