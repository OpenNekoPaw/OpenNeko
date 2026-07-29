import type { OwnedDisposable, RegistrationOwner } from './types.ts';

export class DisposableStore implements RegistrationOwner {
  readonly #disposables: OwnedDisposable[] = [];
  #disposed = false;

  add<TDisposable extends OwnedDisposable>(disposable: TDisposable): TDisposable {
    if (this.#disposed) {
      throw new Error('Cannot add a disposable to an already disposed owner.');
    }
    this.#disposables.push(disposable);
    return disposable;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const failures: unknown[] = [];
    for (const disposable of this.#disposables.reverse()) {
      try {
        await disposable.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    this.#disposables.length = 0;
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Owned resource disposal failed.');
    }
  }
}
