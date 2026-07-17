import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetEntity } from '@neko/shared';
import { AssetFileImportService } from './AssetFileImportService';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('AssetFileImportService generated output promotion', () => {
  it('creates a distinct Asset identity without Board projection or source mutation', async () => {
    const fixture = await createLegacySource();
    const entity = createEntity();
    const importFile = vi.fn(async () => ({ entity }));
    const didImport = vi.fn();
    const service = new AssetFileImportService({
      library: { importFile, flush: vi.fn(async () => undefined) },
      fs: { assertReadable: access },
      didImport,
    });

    await expect(service.importFile(fixture.sourcePath)).resolves.toEqual(entity);
    expect(entity.id).not.toBe('generated-output:legacy');
    await expect(readFile(fixture.sourcePath, 'utf8')).resolves.toBe('legacy bytes');
    expect(importFile).toHaveBeenCalledWith(fixture.sourcePath);
    expect(didImport).toHaveBeenCalledOnce();
  });

  it('fails visibly for missing and import-failure cases while preserving the source', async () => {
    const fixture = await createLegacySource();
    const missingPath = path.join(fixture.root, 'neko', 'generated', 'image', 'missing.png');
    const importFile = vi.fn(async () => {
      throw new Error('Asset fact registration failed.');
    });
    const service = new AssetFileImportService({
      library: { importFile, flush: vi.fn(async () => undefined) },
      fs: { assertReadable: access },
      didImport: vi.fn(),
    });

    await expect(service.importFile(missingPath)).rejects.toThrow();
    expect(importFile).not.toHaveBeenCalled();
    await expect(service.importFile(fixture.sourcePath)).rejects.toThrow(
      'Asset fact registration failed.',
    );
    await expect(readFile(fixture.sourcePath, 'utf8')).resolves.toBe('legacy bytes');
  });

  it('returns the library identity for an already-imported generated source', async () => {
    const fixture = await createLegacySource();
    const entity = createEntity();
    const importFile = vi.fn(async () => ({ entity }));
    const service = new AssetFileImportService({
      library: { importFile, flush: vi.fn(async () => undefined) },
      fs: { assertReadable: access },
      didImport: vi.fn(),
    });

    const first = await service.importFile(fixture.sourcePath);
    const replayed = await service.importFile(fixture.sourcePath);

    expect(replayed.id).toBe(first.id);
    expect(importFile).toHaveBeenCalledTimes(2);
    await expect(readFile(fixture.sourcePath, 'utf8')).resolves.toBe('legacy bytes');
  });
});

async function createLegacySource(): Promise<{ root: string; sourcePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-legacy-generated-import-'));
  temporaryDirectories.push(root);
  const sourcePath = path.join(root, 'neko', 'generated', 'image', 'legacy.png');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, 'legacy bytes');
  return { root, sourcePath };
}

function createEntity(): AssetEntity {
  return {
    id: 'asset:legacy:1',
    name: 'Legacy generated image',
    category: 'object',
    metadata: { source: { type: 'imported' } },
    variants: [],
    tags: ['legacy-generated'],
    usageCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
}
