import { describe, it, expect, beforeEach } from 'vitest';
import { createSessionLock, type SessionLockFsOps } from '../session-lock';

/**
 * In-memory fsOps for tests. Single-file simulation with stored
 * contents + dir list + failure injection.
 */
function memFs(): SessionLockFsOps & {
  files: Map<string, string>;
  dirs: string[];
} {
  const files = new Map<string, string>();
  const dirs: string[] = [];
  return {
    files,
    dirs,
    async mkdir(path: string): Promise<void> {
      dirs.push(path);
    },
    async readFile(path: string): Promise<string> {
      const v = files.get(path);
      if (v === undefined) {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return v;
    },
    async writeFile(path: string, data: string): Promise<void> {
      files.set(path, data);
    },
    async unlink(path: string): Promise<void> {
      if (!files.delete(path)) {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
    },
  };
}

const LOCK_PATH = '/r/.neko/state/session-lock.json';

describe('SessionLock', () => {
  let fs: ReturnType<typeof memFs>;
  let now = 1_000_000;

  beforeEach(() => {
    fs = memFs();
    now = 1_000_000;
  });

  it('acquire on empty workspace writes the lock file', async () => {
    const lock = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-1',
      pid: 42,
      now: () => now,
    });
    const res = await lock.acquire();
    expect(res.acquired).toBe(true);
    if (res.acquired) {
      expect(res.payload).toEqual({ sessionId: 'sess-1', pid: 42, lockedAt: 1_000_000 });
    }
    const raw = fs.files.get(LOCK_PATH)!;
    expect(JSON.parse(raw)).toEqual({
      sessionId: 'sess-1',
      pid: 42,
      lockedAt: 1_000_000,
    });
    expect(fs.dirs).toContain('/r/.neko/state');
  });

  it('conflicting session sees acquired=false + heldBy payload', async () => {
    const a = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-a',
      now: () => now,
    });
    const b = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-b',
      now: () => now + 1000,
    });
    await a.acquire();
    const res = await b.acquire();
    expect(res.acquired).toBe(false);
    if (!res.acquired) {
      expect(res.heldBy.sessionId).toBe('sess-a');
      expect(res.stale).toBe(false);
    }
  });

  it('conflict diagnostics preserve the holder and do not overwrite the lock file', async () => {
    const a = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-a',
      pid: 101,
      now: () => now,
    });
    const b = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-b',
      pid: 202,
      now: () => now + 1000,
    });
    await a.acquire();
    const before = fs.files.get(LOCK_PATH);

    const res = await b.acquire();

    expect(res).toEqual({
      acquired: false,
      heldBy: { sessionId: 'sess-a', pid: 101, lockedAt: 1_000_000 },
      stale: false,
    });
    expect(fs.files.get(LOCK_PATH)).toBe(before);
  });

  it('same session re-acquire refreshes the timestamp', async () => {
    const lock = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-1',
      now: () => now,
    });
    await lock.acquire();
    now += 5000;
    const res = await lock.acquire();
    expect(res.acquired).toBe(true);
    if (res.acquired) expect(res.payload.lockedAt).toBe(1_005_000);
  });

  it('stale lock (older than staleMs) is reclaimable', async () => {
    const a = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-a',
      staleMs: 1000,
      now: () => now,
    });
    await a.acquire();
    const b = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-b',
      staleMs: 1000,
      now: () => now + 2000, // 2s later, > 1s staleMs
    });
    const res = await b.acquire();
    expect(res.acquired).toBe(true);
    if (res.acquired) expect(res.payload.sessionId).toBe('sess-b');
  });

  it('staleMs=0 disables staleness (any existing lock blocks)', async () => {
    const a = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-a',
      now: () => now,
    });
    await a.acquire();
    const b = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-b',
      staleMs: 0,
      now: () => now + 10_000_000, // very old
    });
    const res = await b.acquire();
    expect(res.acquired).toBe(false);
  });

  it('force=true overrides a non-stale holder', async () => {
    const a = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-a',
      now: () => now,
    });
    await a.acquire();
    const b = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-b',
      now: () => now + 100,
    });
    const res = await b.acquire({ force: true });
    expect(res.acquired).toBe(true);
    if (res.acquired) expect(res.payload.sessionId).toBe('sess-b');
  });

  it('release only removes the file when we own it', async () => {
    const a = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-a',
      now: () => now,
    });
    await a.acquire();
    const b = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-b',
      now: () => now,
    });
    await b.release(); // no-op — we don't own it
    expect(fs.files.has(LOCK_PATH)).toBe(true);
    await a.release();
    expect(fs.files.has(LOCK_PATH)).toBe(false);
  });

  it('release tolerates already-gone file', async () => {
    const lock = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-1',
      now: () => now,
    });
    // Never acquired. Must not throw.
    await lock.release();
  });

  it('check returns null when no lock exists', async () => {
    const lock = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-1',
      now: () => now,
    });
    expect(await lock.check()).toBeNull();
  });

  it('check returns the current holder payload', async () => {
    const a = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-a',
      pid: 99,
      now: () => now,
    });
    await a.acquire();
    const b = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-b',
      now: () => now,
    });
    const seen = await b.check();
    expect(seen).toEqual({ sessionId: 'sess-a', pid: 99, lockedAt: 1_000_000 });
  });

  it('corrupt lock file treated as absent', async () => {
    fs.files.set(LOCK_PATH, 'not json');
    const lock = createSessionLock({
      filePath: LOCK_PATH,
      fsOps: fs,
      sessionId: 'sess-1',
      now: () => now,
    });
    const res = await lock.acquire();
    expect(res.acquired).toBe(true);
  });

  it('constructor validates required fields', () => {
    expect(() => createSessionLock({ filePath: '', fsOps: memFs(), sessionId: 's' })).toThrow(
      /filePath/,
    );
    expect(() => createSessionLock({ filePath: LOCK_PATH, fsOps: memFs(), sessionId: '' })).toThrow(
      /sessionId/,
    );
  });
});
