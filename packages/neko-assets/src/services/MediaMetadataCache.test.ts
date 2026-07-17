import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PathResolver, type MediaFileMetadata } from '@neko/shared';
import type { MediaMetadataRecord, MediaMetadataRepository } from '@neko/shared/local-metadata';
import { MediaMetadataCache } from './MediaMetadataCache';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('MediaMetadataCache', () => {
  it('persists probe metadata through the injected repository using a portable source key', async () => {
    const workspaceRoot = await createTemporaryDirectory();
    const filePath = join(workspaceRoot, 'media', 'clip.mp4');
    await mkdir(join(workspaceRoot, 'media'), { recursive: true });
    await writeFile(filePath, 'probe-source', 'utf8');
    const repository = createRepository();
    const partition = {
      scope: 'workspace' as const,
      workspaceId: 'd5a66cfd-dd07-4b31-9030-f225491b57ee',
      domain: 'media-metadata',
    };
    const cache = new MediaMetadataCache({
      repository,
      partition,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      now: () => '2026-07-13T03:00:00.000Z',
    });
    const metadata: MediaFileMetadata = {
      fileSize: 12,
      mimeType: 'video/mp4',
      duration: 3,
      codec: 'h264',
    };

    await cache.load();
    await cache.set(filePath, metadata);

    expect(repository.upsert).toHaveBeenCalledWith({
      partition,
      record: expect.objectContaining({
        sourceKey: '${WORKSPACE}/media/clip.mp4',
        metadata,
        updatedAt: '2026-07-13T03:00:00.000Z',
      }),
    });
    await expect(cache.get(filePath)).resolves.toEqual(metadata);
  });
});

function createRepository(): MediaMetadataRepository {
  const records = new Map<string, MediaMetadataRecord>();
  return {
    get: vi.fn(async (_partition, sourceKey) => records.get(sourceKey) ?? null),
    list: vi.fn(async () => [...records.values()]),
    upsert: vi.fn(async ({ record }) => {
      records.set(record.sourceKey, record);
    }),
    delete: vi.fn(async (_partition, sourceKey) => records.delete(sourceKey)),
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'neko-media-cache-'));
  temporaryDirectories.push(directory);
  return directory;
}
