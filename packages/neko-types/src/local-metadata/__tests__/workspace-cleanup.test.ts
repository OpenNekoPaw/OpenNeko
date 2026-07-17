import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupWorkspaceStorage } from '../node-workspace-cleanup';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Workspace storage cleanup', () => {
  it('deletes only allowlisted rebuildable/scratch candidates and reports every protected skip', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'neko-workspace-cleanup-'));
    const outsideRoot = await mkdtemp(join(tmpdir(), 'neko-workspace-cleanup-outside-'));
    temporaryDirectories.push(workDir, outsideRoot);
    const cacheRoot = join(workDir, '.neko', '.cache');
    const tempRoot = join(workDir, '.neko', 'tmp');
    const candidates = {
      rebuildable: join(cacheRoot, 'rebuildable.bin'),
      scratch: join(tempRoot, 'scratch.bin'),
      pinned: join(cacheRoot, 'pinned.bin'),
      active: join(cacheRoot, 'active.bin'),
      promoted: join(cacheRoot, 'promoted.bin'),
      debug: join(cacheRoot, 'debug.bin'),
      valuable: join(tempRoot, 'valuable.bin'),
      projectFact: join(workDir, 'neko', 'facts.json'),
      outside: join(outsideRoot, 'outside.bin'),
    };
    await Promise.all(
      Object.values(candidates).map(async (path) => {
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, 'bytes', 'utf8');
      }),
    );

    const report = await cleanupWorkspaceStorage({
      allowedRoots: [cacheRoot, tempRoot],
      candidates: [
        { path: candidates.rebuildable, storageClass: 'rebuildable' },
        { path: candidates.scratch, storageClass: 'scratch' },
        { path: candidates.pinned, storageClass: 'rebuildable', pinned: true },
        { path: candidates.active, storageClass: 'rebuildable', sessionActive: true },
        { path: candidates.promoted, storageClass: 'rebuildable', promoted: true },
        { path: candidates.debug, storageClass: 'rebuildable', debugRetained: true },
        { path: candidates.valuable, storageClass: 'valuable-state' },
        { path: candidates.projectFact, storageClass: 'project-fact' },
        { path: candidates.outside, storageClass: 'scratch' },
      ],
    });

    expect(report).toMatchObject({ deletedCount: 2, deletedBytes: 10, skippedCount: 7 });
    expect(report.maintenanceReport.counts).toMatchObject({
      deleted: 2,
      skipped: 4,
      'user-action-required': 3,
    });
    expect(report.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: candidates.rebuildable, outcome: 'deleted' }),
        expect.objectContaining({ path: candidates.scratch, outcome: 'deleted' }),
        expect.objectContaining({ path: candidates.pinned, reason: 'pinned' }),
        expect.objectContaining({ path: candidates.active, reason: 'session-active' }),
        expect.objectContaining({ path: candidates.promoted, reason: 'promoted' }),
        expect.objectContaining({ path: candidates.debug, reason: 'debug-retained' }),
        expect.objectContaining({ path: candidates.valuable, reason: 'valuable-state' }),
        expect.objectContaining({ path: candidates.projectFact, reason: 'project-fact' }),
        expect.objectContaining({ path: candidates.outside, reason: 'outside-allowed-root' }),
      ]),
    );
    await expect(access(candidates.rebuildable)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(candidates.scratch)).rejects.toMatchObject({ code: 'ENOENT' });
    await Promise.all(
      Object.entries(candidates)
        .filter(([key]) => key !== 'rebuildable' && key !== 'scratch')
        .map(([, path]) => expect(access(path)).resolves.toBeUndefined()),
    );
  });
});
