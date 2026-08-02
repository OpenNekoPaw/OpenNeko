import type { ProjectSearchDisposable, ProjectSearchEvent } from './ports';

export class SimpleEventEmitter<T> implements ProjectSearchDisposable {
  private listeners = new Set<(event: T) => void>();

  readonly event: ProjectSearchEvent<T> = (listener) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  fire(event: T): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
