/**
 * SessionLock — project-level concurrency guard (ADR §7.4 `state/`).
 *
 * A `.neko/state/session-lock.json` file marks "there is an active
 * AgentSession writing to this workspace." Two sessions pointing at
 * the same project root would otherwise corrupt each other's todos /
 * logs / proposals; this guard surfaces the conflict and lets the
 * host decide how to react (refuse / prompt user to take over / etc.).
 *
 * Design rules:
 *   - Advisory lock, not OS-level: we own the file, not a filesystem
 *     mutex. Concurrent writers racing to acquire can both succeed if
 *     they interleave check + write. That's fine — the second one will
 *     overwrite the first, and the first will eventually notice its
 *     lock was stolen on the next `check()` / `release()`.
 *   - Stale-lock detection via `lockedAt` age. Crashed sessions leave
 *     dangling locks; configurable TTL (default 10 min) lets a new
 *     session reclaim without manual cleanup.
 *   - `force: true` lets callers take over explicitly. Useful after
 *     the user confirms "yes, close the other one."
 *   - FS ops injected (read / write / unlink / mkdir) so the agent
 *     package stays Node-free. Extension layer wires node:fs/promises.
 */

// =============================================================================
// Types
// =============================================================================

export interface SessionLockFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
  /** Remove the lock file. MUST tolerate ENOENT as a success. */
  unlink(path: string): Promise<void>;
}

export interface SessionLockPayload {
  /** Stable id for the session holding the lock. */
  sessionId: string;
  /** Process id, purely for humans reading the file. */
  pid: number;
  /** ms epoch — when the lock was acquired. */
  lockedAt: number;
}

export interface SessionLockConfig {
  /** Absolute path to the lock file (NekoPaths.state('sessionLock')). */
  filePath: string;
  fsOps: SessionLockFsOps;
  /** Our own session id — any lock owned by this id is considered ours. */
  sessionId: string;
  /** Our pid; defaults to `process.pid` if the runtime exposes it. */
  pid?: number;
  /**
   * Locks older than `staleMs` are considered abandoned (previous
   * session crashed). Acquire will overwrite them. Default 10 min;
   * set to 0 to disable staleness (any existing lock blocks).
   */
  staleMs?: number;
  /** Clock injection. */
  now?: () => number;
}

export type AcquireResult =
  | { acquired: true; payload: SessionLockPayload }
  | {
      acquired: false;
      /** The current lock holder that blocked us. */
      heldBy: SessionLockPayload;
      /** True iff the holder is older than `staleMs` (can be force-claimed). */
      stale: boolean;
    };

export interface ISessionLock {
  /**
   * Acquire the lock. Returns the payload we just wrote on success.
   * On conflict, returns the current holder plus a stale flag.
   * `force: true` always wins (for "take over" flows after a user
   * prompt).
   */
  acquire(options?: { force?: boolean }): Promise<AcquireResult>;
  /** Release the lock IF we own it. No-op otherwise (safe on crash paths). */
  release(): Promise<void>;
  /** Inspect current lock state without mutating. */
  check(): Promise<SessionLockPayload | null>;
}

const DEFAULT_STALE_MS = 10 * 60 * 1000;

// =============================================================================
// Implementation
// =============================================================================

class SessionLock implements ISessionLock {
  private readonly _filePath: string;
  private readonly _fsOps: SessionLockFsOps;
  private readonly _sessionId: string;
  private readonly _pid: number;
  private readonly _staleMs: number;
  private readonly _now: () => number;

  constructor(config: SessionLockConfig) {
    if (!config.filePath) throw new Error('SessionLock: filePath is required');
    if (!config.sessionId) throw new Error('SessionLock: sessionId is required');
    this._filePath = config.filePath;
    this._fsOps = config.fsOps;
    this._sessionId = config.sessionId;
    // `process` may be undefined in non-Node runtimes — fall back to 0.
    const runtimePid =
      typeof process !== 'undefined' && typeof process.pid === 'number' ? process.pid : 0;
    this._pid = config.pid ?? runtimePid;
    this._staleMs = config.staleMs ?? DEFAULT_STALE_MS;
    this._now = config.now ?? (() => Date.now());
  }

  async acquire(options?: { force?: boolean }): Promise<AcquireResult> {
    const force = options?.force ?? false;
    const existing = await this._readExisting();

    if (existing && !force) {
      // We already own it — treat as reacquire, refresh timestamp.
      if (existing.sessionId === this._sessionId) {
        return this._write();
      }
      const age = this._now() - existing.lockedAt;
      const stale = this._staleMs > 0 && age > this._staleMs;
      if (!stale) {
        return { acquired: false, heldBy: existing, stale: false };
      }
      // Stale — we claim it below.
    }

    return this._write();
  }

  async release(): Promise<void> {
    const existing = await this._readExisting();
    // Only release if we own it. Silently ignore locks we don't own —
    // that's another session's problem.
    if (existing && existing.sessionId !== this._sessionId) return;
    await this._fsOps.unlink(this._filePath).catch(() => {
      // ENOENT etc. — already released, nothing to do.
    });
  }

  async check(): Promise<SessionLockPayload | null> {
    return this._readExisting();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async _readExisting(): Promise<SessionLockPayload | null> {
    try {
      const raw = await this._fsOps.readFile(this._filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SessionLockPayload>;
      if (
        typeof parsed.sessionId !== 'string' ||
        typeof parsed.pid !== 'number' ||
        typeof parsed.lockedAt !== 'number'
      ) {
        // Corrupt file — treat as absent; callers can overwrite.
        return null;
      }
      return {
        sessionId: parsed.sessionId,
        pid: parsed.pid,
        lockedAt: parsed.lockedAt,
      };
    } catch {
      // ENOENT / permission / parse error — no lock from our POV.
      return null;
    }
  }

  private async _write(): Promise<{ acquired: true; payload: SessionLockPayload }> {
    const payload: SessionLockPayload = {
      sessionId: this._sessionId,
      pid: this._pid,
      lockedAt: this._now(),
    };
    const dir = this._filePath.replace(/[/\\][^/\\]+$/, '');
    if (dir && dir !== this._filePath) {
      await this._fsOps.mkdir(dir, { recursive: true });
    }
    await this._fsOps.writeFile(this._filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { acquired: true, payload };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSessionLock(config: SessionLockConfig): ISessionLock {
  return new SessionLock(config);
}
