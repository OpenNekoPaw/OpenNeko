/**
 * PromptModuleRegistry — container for registered PromptModules.
 *
 * Responsibilities (minimal by design):
 * - Register / unregister modules by manifest.id
 * - Reject duplicate ids at registration time
 * - Query modules by layer, sorted by priority descending (ties preserved by
 *   insertion order)
 *
 * The registry does not know about PromptContext, caches, or composer wiring;
 * those live in ModuleOrchestrator.
 */
import type { PromptLayer } from '../system-prompt-composer-types';
import type { PromptModule } from './module-manifest';

export class PromptModuleRegistry {
  private readonly _modules = new Map<string, PromptModule>();

  /**
   * Register a module. Throws if a module with the same id is already registered.
   */
  register(module: PromptModule): void {
    const id = module.manifest.id;
    if (this._modules.has(id)) {
      throw new Error(`PromptModuleRegistry: duplicate module id '${id}'`);
    }
    this._modules.set(id, module);
  }

  /**
   * Remove a module by id. Returns true if the module existed.
   */
  unregister(id: string): boolean {
    return this._modules.delete(id);
  }

  /**
   * Look up a module by id.
   */
  get(id: string): PromptModule | undefined {
    return this._modules.get(id);
  }

  /**
   * Check whether a module is registered.
   */
  has(id: string): boolean {
    return this._modules.has(id);
  }

  /**
   * Return modules that may write to the given layer, sorted by priority descending.
   * Ties are broken by insertion order (Map iteration order).
   */
  byLayer(layer: PromptLayer): PromptModule[] {
    const matches: PromptModule[] = [];
    for (const module of this._modules.values()) {
      if (module.manifest.layers.includes(layer)) {
        matches.push(module);
      }
    }
    matches.sort((a, b) => b.manifest.priority - a.manifest.priority);
    return matches;
  }

  /**
   * All registered modules in insertion order.
   */
  all(): readonly PromptModule[] {
    return Array.from(this._modules.values());
  }

  /**
   * Number of registered modules.
   */
  size(): number {
    return this._modules.size;
  }

  /**
   * Remove all modules. Primarily for tests.
   */
  clear(): void {
    this._modules.clear();
  }
}
