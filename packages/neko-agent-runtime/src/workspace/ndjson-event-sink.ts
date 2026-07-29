/**
 * NdjsonEventSink — append Agent runtime events to a JSONL log file.
 *
 * See: docs/architecture/agent-unified-workflow.md §7 (format dichotomy:
 *   AI → Markdown, program → JSONL) + §7.4 (events/audits/steps split).
 *
 * Subscribes to IEventBus via onAny() and appends each event as a single
 * JSON line. The sink writes to exactly one file; separation by
 * concern (events vs audits vs steps) is done by creating multiple
 * sinks with different routing predicates.
 *
 * Serialisation rules:
 *   - Line = `JSON.stringify({ seq, partitionSeq, partition, ts, event }) + '\n'`
 *   - `seq` is monotonic per sink instance (1-based) and diagnostic only.
 *   - `partitionSeq` is monotonic inside the event's conversation/turn/run partition.
 *   - `ts` is ms-epoch from an injected clock.
 *   - Optional `mapEvent` runs before writing.
 *   - Writes are chained through a Promise so ordering on disk matches
 *     the onAny() delivery order — concurrent event bursts don't
 *     interleave inside a single line.
 *
 * The sink does **not** create the file — it relies on fsOps.appendFile
 * to create-or-append. `mkdir -p` is called once per sink before the
 * first write so the logs/ directory materialises lazily.
 *
 * File-system calls are injected (mkdir + appendFile) so the agent
 * package never imports Node `fs` directly. The extension layer wires
 * Node's promise-based fs when it constructs the sink.
 */

import type { IEventBus } from '../events/event-bus';
import type { AgentEventBusEvent } from '../events/event-bus';
import { getLogger } from '../utils/logger';

const logger = getLogger('NdjsonEventSink');
let ndjsonEventSinkWriterOrdinal = 0;

// =============================================================================
// FS dependency
// =============================================================================

export interface NdjsonFsOps {
  appendFile(path: string, data: string): Promise<void>;
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
}

// =============================================================================
// Config
// =============================================================================

export interface NdjsonEventSinkConfig {
  /** Absolute path to the `.jsonl` file (caller resolves via NekoPaths). */
  filePath: string;
  /** Filesystem operations — injected so the agent package stays fs-free. */
  fsOps: NdjsonFsOps;
  /** Optional stable writer id for multi-window/process diagnostics. */
  writerId?: string;
  /** Optional projection used by owning sessions to attach log-only identity. */
  mapEvent?: (event: AgentEventBusEvent) => NdjsonLoggedEvent;
  /**
   * Optional predicate deciding which events end up on disk. When
   * absent, every event on the bus is written. Pass a predicate to
   * split streams (e.g. `e.channel.startsWith('execution.autoheal.')`
   * for an audits-only sink).
   */
  filter?: (event: AgentEventBusEvent) => boolean;
  /** Clock injection. Defaults to Date.now. */
  now?: () => number;
}

// =============================================================================
// Sink
// =============================================================================

export interface INdjsonEventSink {
  /**
   * Attach the sink to an event bus. Returns an unsubscribe function;
   * calling it detaches the sink but keeps the last-write promise
   * intact. Call again on another bus to relocate — one sink attaches
   * to one bus at a time. Calling attach while already attached is a
   * noop and returns the original unsubscriber.
   */
  attach(bus: IEventBus): () => void;
  /** Flush any pending writes; safe to call repeatedly. */
  flush(): Promise<void>;
  /** Detach + flush; safe to call from dispose paths. */
  dispose(): Promise<void>;
}

export type NdjsonLoggedEvent = AgentEventBusEvent & {
  readonly conversationId?: string;
  readonly turnId?: string;
};

export interface NdjsonEventLogPartition {
  readonly conversationId?: string;
  readonly turnId?: string;
  readonly runId?: string;
}

class NdjsonEventSink implements INdjsonEventSink {
  private readonly _filePath: string;
  private readonly _fsOps: NdjsonFsOps;
  private readonly _writerId: string;
  private readonly _mapEvent: ((event: AgentEventBusEvent) => NdjsonLoggedEvent) | undefined;
  private readonly _filter: ((event: AgentEventBusEvent) => boolean) | undefined;
  private readonly _now: () => number;
  private _seq = 0;
  private readonly _partitionSeq = new Map<string, number>();
  private _dirEnsured = false;
  private _pending: Promise<void> = Promise.resolve();
  private _unsubscribe: (() => void) | null = null;
  private _disposed = false;

  constructor(config: NdjsonEventSinkConfig) {
    if (!config.filePath) {
      throw new Error('NdjsonEventSink: filePath is required');
    }
    this._filePath = config.filePath;
    this._fsOps = config.fsOps;
    this._writerId = config.writerId ?? createNdjsonEventSinkWriterId();
    this._mapEvent = config.mapEvent;
    this._filter = config.filter;
    this._now = config.now ?? (() => Date.now());
  }

  attach(bus: IEventBus): () => void {
    if (this._disposed) {
      logger.warn('attach() after dispose — returning noop');
      return () => {};
    }
    if (this._unsubscribe) {
      // Already attached; caller probably wants the existing handle.
      return this._unsubscribe;
    }
    this._unsubscribe = bus.onAny((event) => {
      if (this._filter && !this._filter(event)) return;
      this._enqueue(event);
    });
    return this._unsubscribe;
  }

  async flush(): Promise<void> {
    await this._pending;
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    await this._pending;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _enqueue(event: AgentEventBusEvent): void {
    const seq = ++this._seq;
    const ts = this._now();
    const loggedEvent = this._mapEvent ? this._mapEvent(event) : event;
    const partition = createNdjsonEventLogPartition(loggedEvent);
    const partitionSeq = this._nextPartitionSeq(partition);
    const line =
      JSON.stringify({
        writerId: this._writerId,
        seq,
        partitionSeq,
        partition,
        ts,
        event: loggedEvent,
      }) + '\n';
    this._pending = this._pending
      .then(async () => {
        await this._ensureDir();
        await this._fsOps.appendFile(this._filePath, line);
      })
      .catch((err) => {
        // One bad write must not poison the chain — log and continue
        // so subsequent events still have a chance to land.
        logger.warn(`ndjson write failed: ${String(err)}`);
      });
  }

  private async _ensureDir(): Promise<void> {
    if (this._dirEnsured) return;
    const dir = this._filePath.replace(/[/\\][^/\\]+$/, '');
    if (dir && dir !== this._filePath) {
      await this._fsOps.mkdir(dir, { recursive: true });
    }
    this._dirEnsured = true;
  }

  private _nextPartitionSeq(partition: NdjsonEventLogPartition): number {
    const key = createNdjsonEventLogPartitionKey(partition);
    const next = (this._partitionSeq.get(key) ?? 0) + 1;
    this._partitionSeq.set(key, next);
    return next;
  }
}

function createNdjsonEventLogPartition(event: NdjsonLoggedEvent): NdjsonEventLogPartition {
  const conversationId = readNonEmptyString(event, 'conversationId');
  const turnId = readNonEmptyString(event, 'turnId');
  const runId = readNonEmptyString(event, 'runId');

  return {
    ...(conversationId ? { conversationId } : {}),
    ...(runId ? { runId } : {}),
    ...(turnId ? { turnId } : {}),
  };
}

function createNdjsonEventSinkWriterId(): string {
  ndjsonEventSinkWriterOrdinal += 1;
  return `ndjson-${Date.now().toString(36)}-${ndjsonEventSinkWriterOrdinal}`;
}

function createNdjsonEventLogPartitionKey(partition: NdjsonEventLogPartition): string {
  return [
    partition.conversationId ?? 'global',
    partition.runId
      ? `run:${partition.runId}`
      : partition.turnId
        ? `turn:${partition.turnId}`
        : 'none',
  ].join('\u001f');
}

function readNonEmptyString(record: object, key: string): string | null {
  const value = Reflect.get(record, key);
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// =============================================================================
// Factory
// =============================================================================

export function createNdjsonEventSink(config: NdjsonEventSinkConfig): INdjsonEventSink {
  return new NdjsonEventSink(config);
}
