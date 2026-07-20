/**
 * Concurrency Pool Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { ConcurrencyPool, KeyedConcurrencyPool, withConcurrencyLimit } from '../concurrency-pool';

describe('ConcurrencyPool', () => {
  describe('basic operations', () => {
    it('should acquire and release slots', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 2 });

      expect(pool.stats.running).toBe(0);

      await pool.acquire();
      expect(pool.stats.running).toBe(1);

      await pool.acquire();
      expect(pool.stats.running).toBe(2);

      pool.release();
      expect(pool.stats.running).toBe(1);

      pool.release();
      expect(pool.stats.running).toBe(0);

      pool.dispose();
    });

    it('should queue when at capacity', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1, queueTimeout: 5000 });

      await pool.acquire();
      expect(pool.stats.running).toBe(1);
      expect(pool.stats.queued).toBe(0);

      // Start acquiring without await - will queue
      const acquirePromise = pool.acquire();
      // Give it a tick to queue
      await new Promise((r) => setTimeout(r, 0));
      expect(pool.stats.queued).toBe(1);

      // Release to allow queued to proceed
      pool.release();
      await acquirePromise;

      expect(pool.stats.running).toBe(1);
      expect(pool.stats.queued).toBe(0);

      pool.release();
      pool.dispose();
    });

    it('should timeout when queue wait exceeds limit', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1, queueTimeout: 100 });

      await pool.acquire();

      await expect(pool.acquire()).rejects.toThrow('Queue timeout');

      pool.release();
      pool.dispose();
    });

    it('should respect priority in queue', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1, queueTimeout: 5000 });
      const order: number[] = [];

      await pool.acquire();

      // Queue with different priorities
      const p1 = pool.acquire(1).then(() => order.push(1));
      const p2 = pool.acquire(10).then(() => order.push(10)); // Higher priority
      const p3 = pool.acquire(5).then(() => order.push(5));

      await new Promise((r) => setTimeout(r, 10));

      // Release 3 times to let all through
      pool.release();
      await new Promise((r) => setTimeout(r, 10));
      pool.release();
      await new Promise((r) => setTimeout(r, 10));
      pool.release();

      await Promise.all([p1, p2, p3]);

      // Higher priority should come first
      expect(order[0]).toBe(10);
      expect(order[1]).toBe(5);
      expect(order[2]).toBe(1);

      pool.dispose();
    });
  });

  describe('run helper', () => {
    it('should run operation with automatic acquire/release', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 2 });

      const result = await pool.run(async () => {
        expect(pool.stats.running).toBe(1);
        return 42;
      });

      expect(result).toBe(42);
      expect(pool.stats.running).toBe(0);

      pool.dispose();
    });

    it('should release on error', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1 });

      await expect(
        pool.run(async () => {
          throw new Error('test error');
        }),
      ).rejects.toThrow('test error');

      expect(pool.stats.running).toBe(0);

      pool.dispose();
    });

    it('should run multiple operations with concurrency limit', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 2 });
      let maxConcurrent = 0;
      let current = 0;

      const operations = Array(5)
        .fill(null)
        .map(() => async () => {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          await new Promise((r) => setTimeout(r, 50));
          current--;
          return current;
        });

      await pool.runAll(operations);

      expect(maxConcurrent).toBe(2);
      expect(pool.stats.totalAcquired).toBe(5);

      pool.dispose();
    });
  });

  describe('tryAcquire', () => {
    it('should return true when capacity available', () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1 });

      expect(pool.tryAcquire()).toBe(true);
      expect(pool.stats.running).toBe(1);

      pool.release();
      pool.dispose();
    });

    it('should return false when at capacity', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1 });

      await pool.acquire();
      expect(pool.tryAcquire()).toBe(false);
      expect(pool.stats.running).toBe(1);

      pool.release();
      pool.dispose();
    });
  });

  describe('setMaxConcurrent', () => {
    it('should update limit dynamically', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1 });

      await pool.acquire();
      expect(pool.hasCapacity).toBe(false);

      pool.setMaxConcurrent(2);
      expect(pool.hasCapacity).toBe(true);

      pool.release();
      pool.dispose();
    });

    it('should process queued items when limit increases', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1, queueTimeout: 5000 });

      await pool.acquire();

      let resolved = false;
      const pending = pool.acquire().then(() => {
        resolved = true;
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(resolved).toBe(false);

      pool.setMaxConcurrent(2);
      await pending;

      expect(resolved).toBe(true);
      expect(pool.stats.running).toBe(2);

      pool.release();
      pool.release();
      pool.dispose();
    });
  });

  describe('dispose', () => {
    it('should reject pending acquisitions', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1, queueTimeout: 5000 });

      await pool.acquire();
      const pending = pool.acquire();

      pool.dispose();

      await expect(pending).rejects.toThrow('disposed');
    });

    it('should reject new acquisitions after dispose', async () => {
      const pool = new ConcurrencyPool({ maxConcurrent: 1 });
      pool.dispose();

      await expect(pool.acquire()).rejects.toThrow('disposed');
    });
  });
});

describe('KeyedConcurrencyPool', () => {
  it('should maintain separate pools per key', async () => {
    const pools = new KeyedConcurrencyPool({ maxConcurrent: 1 });

    await pools.run('a', async () => {
      // Pool 'a' is at capacity
      expect(pools.getPool('a').stats.running).toBe(1);
      // Pool 'b' should still be available
      expect(pools.getPool('b').stats.running).toBe(0);
    });

    pools.dispose();
  });

  it('should track stats across all pools', async () => {
    const pools = new KeyedConcurrencyPool({ maxConcurrent: 2 });

    await Promise.all([
      pools.run('a', async () => 1),
      pools.run('b', async () => 2),
      pools.run('a', async () => 3),
    ]);

    const stats = pools.getAllStats();
    expect(stats.get('a')?.totalAcquired).toBe(2);
    expect(stats.get('b')?.totalAcquired).toBe(1);

    pools.dispose();
  });
});

describe('withConcurrencyLimit', () => {
  it('should wrap function with concurrency control', async () => {
    const pool = new ConcurrencyPool({ maxConcurrent: 1 });
    let calls = 0;

    const fn = async (x: number) => {
      calls++;
      return x * 2;
    };

    const limited = withConcurrencyLimit(fn, pool);

    const result = await limited(5);
    expect(result).toBe(10);
    expect(calls).toBe(1);
    expect(pool.stats.totalAcquired).toBe(1);

    pool.dispose();
  });
});
