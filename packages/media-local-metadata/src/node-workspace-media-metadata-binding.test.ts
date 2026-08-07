import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeWorkspaceMediaMetadataBinding } from './node-workspace-media-metadata-binding';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Node workspace media metadata binding', () => {
  it('round-trips current media metadata in the exact workspace partition', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111';
    const homedir = await mkdtemp(join(tmpdir(), 'openneko-media-metadata-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir);

    const binding = await createNodeWorkspaceMediaMetadataBinding({
      homedir,
      workDir,
      createWorkspaceId: () => workspaceId,
      now: () => '2026-08-06T00:00:00.000Z',
    });
    try {
      await binding.repository.upsert({
        partition: binding.partition,
        record: {
          sourceKey: 'media/scene.mp4',
          sourceMtimeMs: 1_775_603_200_000,
          metadata: {
            fileSize: 8_192,
            mimeType: 'video/mp4',
            width: 1_920,
            height: 1_080,
            duration: 12,
            codec: 'h264',
          },
          updatedAt: '2026-08-06T00:00:00.000Z',
        },
      });

      await expect(binding.repository.get(binding.partition, 'media/scene.mp4')).resolves.toEqual({
        sourceKey: 'media/scene.mp4',
        sourceMtimeMs: 1_775_603_200_000,
        metadata: {
          fileSize: 8_192,
          mimeType: 'video/mp4',
          width: 1_920,
          height: 1_080,
          duration: 12,
          codec: 'h264',
        },
        updatedAt: '2026-08-06T00:00:00.000Z',
      });
      expect(binding.workspaceId).toBe(workspaceId);
      expect(binding.partition).toEqual({
        scope: 'workspace',
        workspaceId,
        domain: 'media-metadata',
      });
    } finally {
      await binding.dispose();
    }
  });
});
