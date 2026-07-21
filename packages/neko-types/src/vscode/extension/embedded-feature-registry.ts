import type * as vscode from 'vscode';

export interface NekoExtension {
  readonly id: string;
  readonly extensionUri: vscode.Uri;
  readonly extensionPath: string;
  readonly isActive: boolean;
  readonly packageJSON: unknown;
  readonly exports: unknown;
  activate(): Promise<unknown>;
}

export interface EmbeddedFeatureRegistration {
  readonly id: string;
  readonly extensionUri: vscode.Uri;
  readonly packageJSON: unknown;
  activate(): Promise<unknown> | unknown;
}

interface EmbeddedFeatureEntry {
  readonly registration: EmbeddedFeatureRegistration;
  readonly activationWaiters: Set<ActivationWaiter>;
  state: 'inactive' | 'activating' | 'active';
  exports?: unknown;
}

interface ActivationWaiter {
  readonly resolve: (extension: NekoExtension) => void;
  readonly reject: (error: Error) => void;
}

declare global {
  var __openNekoEmbeddedFeatureRegistry: EmbeddedFeatureRegistry | undefined;
}

export class EmbeddedFeatureRegistry {
  readonly #entries = new Map<string, EmbeddedFeatureEntry>();
  readonly #activationStack: string[] = [];

  register(registration: EmbeddedFeatureRegistration): vscode.Disposable {
    if (this.#entries.has(registration.id)) {
      throw new Error(`Embedded feature already registered: ${registration.id}`);
    }
    this.#entries.set(registration.id, {
      registration,
      activationWaiters: new Set(),
      state: 'inactive',
    });
    return {
      dispose: () => {
        const entry = this.#entries.get(registration.id);
        if (entry?.state === 'activating') {
          throw new Error(`Cannot unregister activating embedded feature: ${registration.id}`);
        }
        if (entry) {
          this.#rejectActivationWaiters(
            entry,
            new Error(`Embedded feature was unregistered before activation: ${registration.id}`),
          );
        }
        this.#entries.delete(registration.id);
      },
    };
  }

  getExtension(id: string): NekoExtension | undefined {
    const entry = this.#entries.get(id);
    if (!entry) return undefined;
    return this.#projectExtension(entry);
  }

  requireExtension(id: string): NekoExtension {
    const extension = this.getExtension(id);
    if (!extension) {
      throw new Error(`Embedded feature is not registered: ${id}`);
    }
    return extension;
  }

  async activateAll(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.requireExtension(id).activate();
    }
  }

  waitUntilActive(id: string): Promise<NekoExtension> {
    const entry = this.#entries.get(id);
    if (!entry) {
      return Promise.reject(new Error(`Embedded feature is not registered: ${id}`));
    }
    if (entry.state === 'active') return Promise.resolve(this.#projectExtension(entry));
    return new Promise<NekoExtension>((resolve, reject) => {
      entry.activationWaiters.add({ resolve, reject });
    });
  }

  #projectExtension(entry: EmbeddedFeatureEntry): NekoExtension {
    return {
      id: entry.registration.id,
      extensionUri: entry.registration.extensionUri,
      extensionPath: entry.registration.extensionUri.fsPath,
      get isActive() {
        return entry.state === 'active';
      },
      packageJSON: entry.registration.packageJSON,
      get exports() {
        if (entry.state !== 'active') {
          throw new Error(`Embedded feature is not active: ${entry.registration.id}`);
        }
        return entry.exports;
      },
      activate: async () => this.#activateEntry(entry),
    };
  }

  async #activateEntry(entry: EmbeddedFeatureEntry): Promise<unknown> {
    if (entry.state === 'active') return entry.exports;
    if (entry.state === 'activating') {
      const cycleStart = this.#activationStack.indexOf(entry.registration.id);
      const cycle = [
        ...this.#activationStack.slice(cycleStart < 0 ? 0 : cycleStart),
        entry.registration.id,
      ];
      throw new Error(`Embedded feature activation cycle: ${cycle.join(' -> ')}`);
    }

    entry.state = 'activating';
    this.#activationStack.push(entry.registration.id);
    let exports: unknown;
    try {
      exports = await entry.registration.activate();
    } catch (error) {
      entry.state = 'inactive';
      entry.exports = undefined;
      this.#rejectActivationWaiters(
        entry,
        new Error(`Embedded feature activation failed: ${entry.registration.id}`, {
          cause: error,
        }),
      );
      const stackError = this.#popActivation(entry.registration.id);
      if (stackError) {
        throw new AggregateError(
          [error, stackError],
          `Embedded feature activation and stack cleanup failed: ${entry.registration.id}`,
        );
      }
      throw error;
    }

    const stackError = this.#popActivation(entry.registration.id);
    if (stackError) {
      entry.state = 'inactive';
      this.#rejectActivationWaiters(entry, stackError);
      throw stackError;
    }
    entry.exports = exports;
    entry.state = 'active';
    const extension = this.#projectExtension(entry);
    for (const waiter of entry.activationWaiters) waiter.resolve(extension);
    entry.activationWaiters.clear();
    return exports;
  }

  #popActivation(expectedId: string): Error | undefined {
    const completed = this.#activationStack.pop();
    return completed === expectedId
      ? undefined
      : new Error(
          `Embedded feature activation stack corrupted: expected ${expectedId}, received ${String(completed)}`,
        );
  }

  #rejectActivationWaiters(entry: EmbeddedFeatureEntry, error: Error): void {
    for (const waiter of entry.activationWaiters) waiter.reject(error);
    entry.activationWaiters.clear();
  }
}

export function installEmbeddedFeatureRegistry(
  registry: EmbeddedFeatureRegistry,
): vscode.Disposable {
  if (globalThis.__openNekoEmbeddedFeatureRegistry) {
    throw new Error('The OpenNeko embedded feature registry is already installed.');
  }
  globalThis.__openNekoEmbeddedFeatureRegistry = registry;
  return {
    dispose() {
      if (globalThis.__openNekoEmbeddedFeatureRegistry !== registry) {
        throw new Error('The OpenNeko embedded feature registry owner changed unexpectedly.');
      }
      globalThis.__openNekoEmbeddedFeatureRegistry = undefined;
    },
  };
}

export function resolveNekoExtension(
  id: string,
  standaloneResolver?: (extensionId: string) => NekoExtension | undefined,
): NekoExtension | undefined {
  const registry = globalThis.__openNekoEmbeddedFeatureRegistry;
  if (registry && id.startsWith('neko.')) return registry.requireExtension(id);
  return standaloneResolver?.(id);
}

export function requireNekoExtension(id: string): NekoExtension {
  const registry = globalThis.__openNekoEmbeddedFeatureRegistry;
  if (!registry) {
    throw new Error(`OpenNeko embedded feature registry is not installed: ${id}`);
  }
  return registry.requireExtension(id);
}

export function waitForNekoExtensionActivation(id: string): Promise<NekoExtension> | undefined {
  return globalThis.__openNekoEmbeddedFeatureRegistry?.waitUntilActive(id);
}
