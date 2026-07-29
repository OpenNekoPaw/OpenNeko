/**
 * SharedMemoryStore — cross-scope scratchpad for IDC runs.
 *
 * See: docs/architecture/agent-unified-workflow.md §9.2 (shared memory)
 *
 * Purpose: a small in-memory key/value store scoped by MemoryScope +
 * topic so Specify-stage producers and Implement-stage producers can
 * observe each other's working state without coupling to concrete tool
 * types. Consumers:
 *
 *   - Iteration Skill reads recent ConsistencyReport entries here.
 *   - ProgressNarrator reads last milestone labels here.
 *   - Autoheal L4 RecoverySubagent reads prior failure details here.
 *
 * Design rules:
 *   - **Scoped**: keys land under `creation:<topic>` /
 *     `execution:<topic>` / `shared:<topic>`. The names mirror the event
 *     bus channel namespaces (CREATION_CHANNELS / EXECUTION_CHANNELS):
 *     'creation' labels Specify-stage writes, 'execution' labels
 *     Implement-stage writes. They are scope tags, not flow identifiers.
 *   - **Bounded history**: each key retains at most `maxPerKey` entries
 *     (default 16). Older entries are dropped FIFO.
 *   - **Subscribable**: callers can watch a topic for new entries.
 *   - **Opt-in serialization**: `snapshot()` / `restore()` exist for
 *     session persistence — plain JSON, not typed.
 *
 * Intentional non-goals (deferred):
 *   - Full-text search / semantic recall.
 *   - LLM-based summarization / compaction.
 *   - Cross-process sync.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Memory-store scope tags. The names align with the event-channel
 * namespaces (creation.* / execution.*) so producers and consumers can
 * reuse the same vocabulary. They are not IDC stage names — 'creation'
 * covers all pre-Implement activity (Specify + Plan + Tasks), 'execution'
 * covers Implement, and 'shared' is scope-agnostic.
 */
export type MemoryScope = 'creation' | 'execution' | 'shared';

export interface MemoryEntry<T = unknown> {
  /** The topic the entry was written under. */
  topic: string;
  /** Which ring wrote it. */
  scope: MemoryScope;
  /** Entry payload (free shape — callers cast). */
  value: T;
  /** Monotonic sequence number within the store. */
  seq: number;
  /** ms epoch when the entry was appended. */
  at: number;
  /** Optional arbitrary tag for filtering. */
  tag?: string;
}

export interface SharedMemoryStoreConfig {
  /** Max entries kept per (scope, topic) pair. Default 16. */
  maxPerKey?: number;
  /** Clock injection for deterministic tests. */
  now?: () => number;
}

export type MemoryListener<T = unknown> = (entry: MemoryEntry<T>) => void;

export interface ISharedMemoryStore {
  /** Append a new entry under (scope, topic). */
  append<T>(scope: MemoryScope, topic: string, value: T, tag?: string): MemoryEntry<T>;
  /** Read all entries under (scope, topic), oldest first. */
  get<T>(scope: MemoryScope, topic: string): readonly MemoryEntry<T>[];
  /**
   * Read every entry for a scope, flattened across topics, oldest first.
   * Handy for debug dumps and ProgressNarrator aggregation.
   */
  getScope<T>(scope: MemoryScope): readonly MemoryEntry<T>[];
  /** Subscribe to new entries on a (scope, topic). Returns unsubscribe. */
  watch<T>(scope: MemoryScope, topic: string, listener: MemoryListener<T>): () => void;
  /** Remove all entries for a scope (both topics under it). */
  clearScope(scope: MemoryScope): void;
  /** Remove everything. */
  clear(): void;
  /** JSON-serializable snapshot for session persistence. */
  snapshot(): readonly MemoryEntry[];
  /** Restore a previously captured snapshot. Replaces current state. */
  restore(entries: readonly MemoryEntry[]): void;
}

// =============================================================================
// Implementation
// =============================================================================

class SharedMemoryStore implements ISharedMemoryStore {
  private readonly _entries = new Map<string, MemoryEntry[]>();
  private readonly _listeners = new Map<string, Set<MemoryListener>>();
  private readonly _maxPerKey: number;
  private readonly _now: () => number;
  private _seq = 0;

  constructor(config: SharedMemoryStoreConfig = {}) {
    this._maxPerKey = Math.max(1, config.maxPerKey ?? 16);
    this._now = config.now ?? (() => Date.now());
  }

  append<T>(scope: MemoryScope, topic: string, value: T, tag?: string): MemoryEntry<T> {
    const key = this._key(scope, topic);
    const entry: MemoryEntry<T> = {
      topic,
      scope,
      value,
      seq: ++this._seq,
      at: this._now(),
      ...(tag !== undefined ? { tag } : {}),
    };

    let bucket = this._entries.get(key);
    if (!bucket) {
      bucket = [];
      this._entries.set(key, bucket);
    }
    bucket.push(entry as MemoryEntry);
    while (bucket.length > this._maxPerKey) {
      bucket.shift();
    }

    this._notify(key, entry);
    return entry;
  }

  get<T>(scope: MemoryScope, topic: string): readonly MemoryEntry<T>[] {
    return (this._entries.get(this._key(scope, topic)) ?? []) as readonly MemoryEntry<T>[];
  }

  getScope<T>(scope: MemoryScope): readonly MemoryEntry<T>[] {
    const prefix = `${scope}:`;
    const out: MemoryEntry<T>[] = [];
    for (const [key, bucket] of this._entries) {
      if (key.startsWith(prefix)) {
        for (const e of bucket) out.push(e as MemoryEntry<T>);
      }
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  watch<T>(scope: MemoryScope, topic: string, listener: MemoryListener<T>): () => void {
    const key = this._key(scope, topic);
    let set = this._listeners.get(key);
    if (!set) {
      set = new Set();
      this._listeners.set(key, set);
    }
    set.add(listener as MemoryListener);
    return () => {
      set!.delete(listener as MemoryListener);
      if (set!.size === 0) this._listeners.delete(key);
    };
  }

  clearScope(scope: MemoryScope): void {
    const prefix = `${scope}:`;
    for (const key of [...this._entries.keys()]) {
      if (key.startsWith(prefix)) this._entries.delete(key);
    }
  }

  clear(): void {
    this._entries.clear();
    // Listeners are kept — callers can rewire them post-clear if needed.
  }

  snapshot(): readonly MemoryEntry[] {
    const out: MemoryEntry[] = [];
    for (const bucket of this._entries.values()) {
      for (const e of bucket) out.push(e);
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  restore(entries: readonly MemoryEntry[]): void {
    this._entries.clear();
    this._seq = 0;
    for (const e of entries) {
      const key = this._key(e.scope, e.topic);
      let bucket = this._entries.get(key);
      if (!bucket) {
        bucket = [];
        this._entries.set(key, bucket);
      }
      bucket.push(e);
      if (e.seq > this._seq) this._seq = e.seq;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _key(scope: MemoryScope, topic: string): string {
    return `${scope}:${topic}`;
  }

  private _notify(key: string, entry: MemoryEntry): void {
    const set = this._listeners.get(key);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(entry);
      } catch {
        // Listeners must not block memory writes.
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSharedMemoryStore(config?: SharedMemoryStoreConfig): ISharedMemoryStore {
  return new SharedMemoryStore(config);
}
