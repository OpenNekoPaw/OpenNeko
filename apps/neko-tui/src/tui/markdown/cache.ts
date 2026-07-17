export interface DeterministicCachePolicy<V> {
  readonly maxEntries: number;
  readonly maxWeight?: number;
  readonly weightOf?: (value: V) => number;
}

export interface DeterministicCacheStats {
  readonly entries: number;
  readonly weight: number;
  readonly evictions: number;
}

interface CacheEntry<V> {
  readonly value: V;
  readonly weight: number;
}

/** Deterministic insertion/LRU cache; reads promote an entry and eviction removes oldest first. */
export class DeterministicLruCache<K, V> {
  readonly #entries = new Map<K, CacheEntry<V>>();
  readonly #policy: DeterministicCachePolicy<V>;
  #weight = 0;
  #evictions = 0;

  public constructor(policy: DeterministicCachePolicy<V>) {
    if (!Number.isInteger(policy.maxEntries) || policy.maxEntries < 0) {
      throw new RangeError(
        `maxEntries must be a non-negative integer, received ${policy.maxEntries}.`,
      );
    }
    if (
      policy.maxWeight !== undefined &&
      (!Number.isInteger(policy.maxWeight) || policy.maxWeight < 0)
    ) {
      throw new RangeError(
        `maxWeight must be a non-negative integer, received ${policy.maxWeight}.`,
      );
    }
    this.#policy = policy;
  }

  public get(key: K): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  public set(key: K, value: V): void {
    const weight = Math.max(0, Math.trunc(this.#policy.weightOf?.(value) ?? 1));
    const previous = this.#entries.get(key);
    if (previous !== undefined) {
      this.#entries.delete(key);
      this.#weight -= previous.weight;
    }
    this.#entries.set(key, { value, weight });
    this.#weight += weight;
    this.#evictToBounds();
  }

  public delete(key: K): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) return false;
    this.#entries.delete(key);
    this.#weight -= entry.weight;
    return true;
  }

  public clear(): void {
    this.#entries.clear();
    this.#weight = 0;
  }

  public keys(): readonly K[] {
    return [...this.#entries.keys()];
  }

  public stats(): DeterministicCacheStats {
    return { entries: this.#entries.size, weight: this.#weight, evictions: this.#evictions };
  }

  #evictToBounds(): void {
    const maxWeight = this.#policy.maxWeight ?? Number.POSITIVE_INFINITY;
    while (this.#entries.size > this.#policy.maxEntries || this.#weight > maxWeight) {
      const oldest = this.#entries.entries().next().value as [K, CacheEntry<V>] | undefined;
      if (oldest === undefined) return;
      this.#entries.delete(oldest[0]);
      this.#weight -= oldest[1].weight;
      this.#evictions += 1;
    }
  }
}
