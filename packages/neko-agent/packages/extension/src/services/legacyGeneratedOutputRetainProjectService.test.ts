import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedAsset } from '@neko/shared';
import { LegacyGeneratedOutputRetainProjectService } from './legacyGeneratedOutputRetainProjectService';

vi.mock('vscode', async () => await import('../__mocks__/vscode'));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('LegacyGeneratedOutputRetainProjectService', () => {
  it('retains a resolvable legacy record and projects only its canonical identity', async () => {
    const root = await createTemporaryDirectory();
    const sourcePath = path.join(root, '.neko', '.cache', 'generated', 'image', 'old.png');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, 'old image');
    const assets = new Map<string, GeneratedAsset>([['old-image', imageAsset(sourcePath)]]);
    const projectGeneratedAssets = vi.fn(async () => [
      { version: 1 as const, status: 'projected' as const, diagnostics: [] },
    ]);
    const service = new LegacyGeneratedOutputRetainProjectService(
      root,
      {
        get: (id) => assets.get(id),
        add: async (asset) => {
          assets.set(asset.id, asset);
        },
      },
      { projectGeneratedAssets },
    );

    await expect(service.execute('old-image')).resolves.toMatchObject({
      status: 'projected',
      runtimeLayout: 'not-migrated',
      retention: {
        status: 'retained',
        sourceDisposition: 'copied-to-generated-output',
      },
    });
    expect(projectGeneratedAssets).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'old-image',
        path: expect.stringContaining(path.join('neko', 'generated', 'image')),
        lifecycle: expect.objectContaining({ assetId: 'old-image' }),
      }),
    ]);
    expect(JSON.stringify(projectGeneratedAssets.mock.calls)).not.toMatch(
      /position|size|pinned|candidateId|projectionId/u,
    );
  });

  it('reports an unavailable source and never calls Canvas', async () => {
    const root = await createTemporaryDirectory();
    const asset = imageAsset(path.join(root, '.neko', '.cache', 'generated', 'image', 'gone.png'));
    const projectGeneratedAssets = vi.fn();
    const service = new LegacyGeneratedOutputRetainProjectService(
      root,
      { get: () => asset, add: vi.fn() },
      { projectGeneratedAssets },
    );

    await expect(service.execute(asset.id)).resolves.toMatchObject({
      status: 'unavailable',
      runtimeLayout: 'not-migrated',
      retention: {
        diagnostics: [expect.objectContaining({ code: 'legacy-generated-output-source-missing' })],
      },
    });
    expect(projectGeneratedAssets).not.toHaveBeenCalled();
  });
});

function imageAsset(filePath: string): GeneratedAsset {
  return {
    id: 'old-image',
    type: 'generated-image',
    path: filePath,
    mimeType: 'image/png',
    generatedAt: '2026-07-15T00:00:00.000Z',
    width: 1024,
    height: 1024,
    ratio: '1:1',
  };
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-legacy-output-'));
  temporaryDirectories.push(directory);
  return directory;
}
