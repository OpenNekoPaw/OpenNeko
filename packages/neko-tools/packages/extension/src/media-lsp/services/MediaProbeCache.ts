/**
 * Media Probe Cache — TTL-based cache for ProbeResult metadata.
 *
 * Used by diagnostic and hover providers to avoid repeated engine probe calls.
 * File watchers can call invalidate() when media files change.
 */

import type { IMediaProbeCache, ProbeResultLike } from './types';

interface CacheEntry {
  result: ProbeResultLike;
  expiry: number;
}

const DEFAULT_TTL_MS = 60_000; // 60 seconds

export class MediaProbeCache implements IMediaProbeCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(absolutePath: string): ProbeResultLike | undefined {
    const entry = this.cache.get(absolutePath);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(absolutePath);
      return undefined;
    }
    return entry.result;
  }

  set(absolutePath: string, result: ProbeResultLike): void {
    this.cache.set(absolutePath, {
      result,
      expiry: Date.now() + this.ttlMs,
    });
  }

  invalidate(absolutePath: string): void {
    this.cache.delete(absolutePath);
  }

  clear(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.clear();
  }
}
