import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedAsset } from '@neko/shared';
import {
  adoptWorkspaceGeneratedOutputs,
  retainLegacyGeneratedOutput,
} from '../generated-output-adoption';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('adoptWorkspaceGeneratedOutputs', () => {
  it('registers existing generated files in place and remains idempotent', async () => {
    const root = await createTemporaryDirectory();
    const filePath = path.join(root, 'neko', 'generated', 'image', 'legacy.png');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, 'legacy image bytes');
    const assets: GeneratedAsset[] = [];
    const index = {
      list: () => [...assets],
      add: vi.fn(async (asset: GeneratedAsset) => {
        const existing = assets.findIndex((candidate) => candidate.id === asset.id);
        if (existing >= 0) assets[existing] = asset;
        else assets.push(asset);
      }),
    };

    await expect(adoptWorkspaceGeneratedOutputs({ workspaceRoot: root, index })).resolves.toEqual({
      adoptedCount: 1,
      retainedCount: 0,
      diagnostics: [],
    });
    await expect(adoptWorkspaceGeneratedOutputs({ workspaceRoot: root, index })).resolves.toEqual({
      adoptedCount: 0,
      retainedCount: 1,
      diagnostics: [],
    });
    expect(assets[0]).toMatchObject({
      type: 'generated-image',
      path: filePath,
      lifecycle: expect.objectContaining({
        contentDigest: expect.stringMatching(/^sha256:/),
        generation: expect.objectContaining({
          taskId: `legacy-adoption:neko/generated/image/legacy.png`,
        }),
      }),
    });
    expect(index.add).toHaveBeenCalledTimes(1);
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('legacy image bytes');
  });

  it('reports missing indexed files without removing their records', async () => {
    const root = await createTemporaryDirectory();
    const missingPath = path.join(root, 'neko', 'generated', 'video', 'missing.mp4');
    const asset = createVideoAsset(missingPath);
    const index = { list: () => [asset], add: vi.fn() };

    const report = await adoptWorkspaceGeneratedOutputs({ workspaceRoot: root, index });

    expect(report).toMatchObject({
      adoptedCount: 0,
      retainedCount: 0,
      diagnostics: [
        expect.objectContaining({ code: 'generated-output-missing', path: missingPath }),
      ],
    });
    expect(index.add).not.toHaveBeenCalled();
  });
});

describe('retainLegacyGeneratedOutput', () => {
  it('explicitly copies a resolvable runtime source into canonical storage without migrating layout', async () => {
    const root = await createTemporaryDirectory();
    const sourcePath = path.join(root, '.neko', '.cache', 'generated', 'image', 'legacy.png');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, 'runtime image bytes');
    const assets = new Map<string, GeneratedAsset>([
      ['legacy-image', createImageAsset(sourcePath)],
    ]);
    const index = {
      get: (id: string) => assets.get(id),
      add: vi.fn(async (asset: GeneratedAsset) => {
        assets.set(asset.id, asset);
      }),
    };

    const result = await retainLegacyGeneratedOutput({
      workspaceRoot: root,
      assetId: 'legacy-image',
      index,
    });

    expect(result).toMatchObject({
      status: 'retained',
      sourceDisposition: 'copied-to-generated-output',
      runtimeLayout: 'not-migrated',
      asset: {
        id: 'legacy-image',
        path: expect.stringContaining(path.join('neko', 'generated', 'image')),
        lifecycle: expect.objectContaining({
          assetId: 'legacy-image',
          contentDigest: expect.stringMatching(/^sha256:/),
          generation: { taskId: 'legacy-retain:legacy-image' },
        }),
      },
      diagnostics: [],
    });
    if (result.status !== 'retained') throw new Error('Expected retained result.');
    await expect(fs.readFile(result.asset.path, 'utf8')).resolves.toBe('runtime image bytes');
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('runtime image bytes');
    expect(index.add).toHaveBeenCalledTimes(1);

    await expect(
      retainLegacyGeneratedOutput({ workspaceRoot: root, assetId: 'legacy-image', index }),
    ).resolves.toMatchObject({
      status: 'retained',
      sourceDisposition: 'retained-in-place',
      runtimeLayout: 'not-migrated',
    });
  });

  it('returns an actionable unavailable diagnostic without source fallback', async () => {
    const root = await createTemporaryDirectory();
    const sourcePath = path.join(root, '.neko', '.cache', 'generated', 'video', 'gone.mp4');
    const asset = createVideoAsset(sourcePath);
    const index = { get: () => asset, add: vi.fn() };

    await expect(
      retainLegacyGeneratedOutput({ workspaceRoot: root, assetId: asset.id, index }),
    ).resolves.toEqual({
      status: 'unavailable',
      assetId: asset.id,
      runtimeLayout: 'not-migrated',
      diagnostics: [
        expect.objectContaining({
          code: 'legacy-generated-output-source-missing',
          sourcePath,
          message: expect.stringMatching(/Relink|generate it again/u),
        }),
      ],
    });
    expect(index.add).not.toHaveBeenCalled();
    await expect(fs.readdir(path.join(root, 'neko', 'generated'))).rejects.toThrow();
  });
});

function createVideoAsset(filePath: string): GeneratedAsset {
  return {
    id: 'legacy-video',
    type: 'generated-video',
    path: filePath,
    mimeType: 'video/mp4',
    generatedAt: '2026-07-15T00:00:00.000Z',
    duration: 1,
    width: 1280,
    height: 720,
    fps: 24,
  };
}

function createImageAsset(filePath: string): GeneratedAsset {
  return {
    id: 'legacy-image',
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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-output-adoption-'));
  temporaryDirectories.push(directory);
  return directory;
}
