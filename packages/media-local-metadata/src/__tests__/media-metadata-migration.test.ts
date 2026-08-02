import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeWorkspaceMediaMetadataBinding } from '../node-workspace-media-metadata-binding';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('legacy media metadata migration', () => {
  it('backs up, contracts, imports, verifies, and archives a legacy cache', async () => {
    const homedir = await createTemporaryDirectory('neko-media-home-');
    const workDir = join(homedir, 'Git', 'neko-workspace');
    const legacyPath = join(workDir, '.neko', '.cache', 'media-metadata.json');
    const sourcePath = join(workDir, 'media', 'clip.mp4');
    await mkdir(join(workDir, '.neko', '.cache'), { recursive: true });
    await writeFile(
      legacyPath,
      JSON.stringify({
        version: 1,
        entries: {
          [sourcePath]: {
            mtime: 1_752_364_800_000,
            metadata: {
              fileSize: 4_096,
              mimeType: 'video/mp4',
              width: 1920,
              height: 1080,
              duration: 12.5,
              codec: 'h264',
            },
          },
        },
      }),
      'utf8',
    );

    const binding = await createNodeWorkspaceMediaMetadataBinding({
      homedir,
      workDir,
      createWorkspaceId: () => '1c7a1e7f-5f0a-4f0b-92c9-1d7ec894c9cb',
      now: () => '2026-07-13T02:00:00.000Z',
    });

    expect(binding.migrationReport).toMatchObject({
      sourceStatus: 'migrated',
      importedEntryCount: 1,
      verifiedEntryCount: 1,
    });
    await expect(
      binding.repository.get(binding.partition, '${WORKSPACE}/media/clip.mp4'),
    ).resolves.toMatchObject({
      sourceKey: '${WORKSPACE}/media/clip.mp4',
      sourceMtimeMs: 1_752_364_800_000,
      metadata: { mimeType: 'video/mp4', codec: 'h264' },
    });
    await expect(access(binding.migrationReport.backupPath!)).resolves.toBeUndefined();
    await expect(access(binding.migrationReport.archivedPath!)).resolves.toBeUndefined();
    await expect(access(legacyPath)).rejects.toThrow();

    await binding.dispose();
  });

  it('backs up and quarantines malformed legacy metadata without reporting empty success', async () => {
    const homedir = await createTemporaryDirectory('neko-media-corrupt-home-');
    const workDir = join(homedir, 'Git', 'neko-workspace');
    const legacyPath = join(workDir, '.neko', '.cache', 'media-metadata.json');
    await mkdir(join(workDir, '.neko', '.cache'), { recursive: true });
    await writeFile(legacyPath, '', 'utf8');

    const binding = await createNodeWorkspaceMediaMetadataBinding({
      homedir,
      workDir,
      createWorkspaceId: () => '08b13068-a238-4e21-b538-4445e094f505',
      now: () => '2026-07-13T02:30:00.000Z',
    });

    expect(binding.migrationReport).toMatchObject({
      sourceStatus: 'quarantined',
      importedEntryCount: 0,
      verifiedEntryCount: 0,
      sourceDiagnostic: expect.stringContaining('JSON'),
    });
    await expect(access(binding.migrationReport.backupPath!)).resolves.toBeUndefined();
    await expect(access(binding.migrationReport.quarantinePath!)).resolves.toBeUndefined();
    await expect(binding.repository.list(binding.partition)).resolves.toEqual([]);

    await binding.dispose();
  });
});

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}
