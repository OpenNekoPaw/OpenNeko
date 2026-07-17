/**
 * PromptSectionCache — LRU cache keyed by module cacheKey string.
 *
 * Used by ModuleOrchestrator to avoid re-invoking a module's render() when its
 * manifest.cacheKey returns the same string it did last time. Each entry holds
 * the readonly section list that was emitted under that key.
 *
 * Intentionally simple: Map insertion-order LRU, no TTL, no size metrics. Suitable
 * for the small number of prompt modules we expect per session (< 32).
 */
import type { PromptModuleSection } from './module-manifest';

const DEFAULT_MAX_ENTRIES = 128;

export class PromptSectionCache {
  private readonly _max: number;
  private readonly _map = new Map<string, readonly PromptModuleSection[]>();

  constructor(max: number = DEFAULT_MAX_ENTRIES) {
    if (max <= 0) {
      throw new Error(`PromptSectionCache: max must be > 0, got ${max}`);
    }
    this._max = max;
  }

  /**
   * Fetch cached sections for a key. Marks the entry as most-recently used.
   */
  get(key: string): readonly PromptModuleSection[] | undefined {
    const value = this._map.get(key);
    if (value === undefined) return undefined;
    // LRU touch: re-insert at the end of iteration order.
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  /**
   * Store sections under a key, evicting the oldest entry if over capacity.
   */
  set(key: string, sections: readonly PromptModuleSection[]): void {
    if (this._map.has(key)) {
      this._map.delete(key);
    }
    this._map.set(key, sections);
    if (this._map.size > this._max) {
      const oldest = this._map.keys().next().value;
      if (oldest !== undefined) {
        this._map.delete(oldest);
      }
    }
  }

  /**
   * Invalidate a single key. Returns true if an entry existed.
   */
  delete(key: string): boolean {
    return this._map.delete(key);
  }

  /**
   * Current cache size.
   */
  size(): number {
    return this._map.size;
  }

  /**
   * Drop all cached entries.
   */
  clear(): void {
    this._map.clear();
  }
}
