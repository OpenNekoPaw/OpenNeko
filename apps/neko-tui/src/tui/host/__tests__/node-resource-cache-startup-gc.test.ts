import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RESOURCE_CACHE_GLOBAL_MAX_BYTES,
  DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
} from '@neko/shared';
import type { ResourceCacheService } from '@neko/shared/content-access';
import {
  createNodeProjectResourceCacheStartupGcTarget,
  runNodeResourceCacheStartupGc,
} from '../node-resource-cache-startup-gc';

describe('node resource cache startup GC', () => {
  it('uses the shared project cache root and default quota policy', async () => {
    const cache = createResourceCache();
    const workDir = '/workspace/project';

    const results = await runNodeResourceCacheStartupGc({
      workDir,
      homedir: '/home/neko',
      createCacheService: (target) => {
        expect(target).toEqual({
          scope: 'project',
          cacheRoot: path.join(workDir, '.neko', '.cache', 'resources'),
          manifestPath: path.join(workDir, '.neko', '.cache', 'resources', 'manifest.json'),
          projectRoot: workDir,
        });
        return cache;
      },
    });

    expect(results).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ scope: 'project', projectRoot: workDir }),
        result: expect.objectContaining({ removedCount: 0 }),
      }),
    ]);
    expect(cache.gc).toHaveBeenCalledWith({
      projectMaxBytes: DEFAULT_RESOURCE_CACHE_PROJECT_MAX_BYTES,
      globalMaxBytes: DEFAULT_RESOURCE_CACHE_GLOBAL_MAX_BYTES,
      preservePinned: true,
      preserveSessionActive: true,
      preserveDebug: true,
      preservePromoted: true,
    });
  });

  it('reports GC failures without making startup throw', async () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const error = new Error('gc failed');

    const results = await runNodeResourceCacheStartupGc({
      workDir: '/workspace/project',
      createCacheService: () => createResourceCache(error),
      logger,
    });

    expect(results).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ scope: 'project' }),
        error,
      }),
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'TUI resource cache startup GC failed',
      expect.objectContaining({ error }),
    );
  });

  it('does not enumerate Extension-private cache targets from TUI startup', async () => {
    const createCacheService = vi.fn((target) => {
      expect(target.scope).toBe('project');
      expect(target.cacheRoot).not.toContain('/global/neko-agent');
      expect(target.manifestPath).not.toContain('/global/neko-agent');
      return createResourceCache();
    });

    const results = await runNodeResourceCacheStartupGc({
      workDir: '/workspace/project',
      homedir: '/home/neko',
      createCacheService,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.target).toMatchObject({
      scope: 'project',
      projectRoot: '/workspace/project',
    });
    expect(createCacheService).toHaveBeenCalledTimes(1);
  });

  it('exposes the same project target resolver used by content materialization', () => {
    expect(
      createNodeProjectResourceCacheStartupGcTarget({
        workDir: '/workspace/project',
        homedir: '/home/neko',
      }),
    ).toEqual({
      scope: 'project',
      cacheRoot: '/workspace/project/.neko/.cache/resources',
      manifestPath: '/workspace/project/.neko/.cache/resources/manifest.json',
      projectRoot: '/workspace/project',
    });
  });
});

function createResourceCache(error?: Error): ResourceCacheService {
  return {
    gc: vi.fn(async () => {
      if (error) {
        throw error;
      }
      return {
        removedCount: 0,
        removedBytes: 0,
        skippedCount: 0,
        skippedReasons: {},
      };
    }),
  } as unknown as ResourceCacheService;
}
