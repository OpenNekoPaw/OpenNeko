import { describe, expect, it } from 'vitest';
import type {
  ProjectAssetDependency,
  ProjectAssetDependencyManifest,
} from '../project-asset-dependency-manifest';

describe('project asset dependency manifest contract', () => {
  it('tracks import, market, and workspace dependencies in one manifest', () => {
    const dependencies: readonly ProjectAssetDependency[] = [
      {
        id: 'import:sakura',
        sourceKind: 'import',
        mediaKind: 'live2d-model',
        dimensions: ['model', 'motion', 'config'],
        storageMode: 'bundle-memory',
        originalFile: '${PROJECT}/imports/sakura.zip',
        contentHash: 'sha256:zip',
        importDestination: './imports/sakura.zip',
        files: ['./imports/sakura.zip'],
        bundleEntries: [
          {
            bundlePath: './imports/sakura.zip',
            entryPath: 'avatars/sakura/model3.json',
            fragmentRef: './imports/sakura.zip#avatars/sakura/model3.json',
          },
        ],
      },
      {
        id: 'market:voice-pack',
        sourceKind: 'market',
        mediaKind: 'voice-pack',
        dimensions: ['audio'],
        storageMode: 'market',
        packageId: '@neko/voices/default',
        version: '1.2.3',
      },
      {
        id: 'workspace:hero',
        sourceKind: 'workspace',
        mediaKind: 'model-3d',
        dimensions: ['model'],
        storageMode: 'workspace',
        workspacePath: './models/hero.glb',
        assetEntityId: 'asset:hero',
      },
    ];
    const manifest: ProjectAssetDependencyManifest = {
      version: 1,
      projectRoot: '${PROJECT}',
      generatedAt: '2026-05-20T00:00:00.000Z',
      dependencies,
    };

    expect(manifest.dependencies.map((dependency) => dependency.sourceKind)).toEqual([
      'import',
      'market',
      'workspace',
    ]);
    expect(manifest.dependencies[0]).toMatchObject({
      sourceKind: 'import',
      storageMode: 'bundle-memory',
      bundleEntries: [{ entryPath: 'avatars/sakura/model3.json' }],
    });
    expect(manifest.dependencies[1]).toMatchObject({
      sourceKind: 'market',
      packageId: '@neko/voices/default',
    });
    expect(manifest.dependencies[2]).toMatchObject({
      sourceKind: 'workspace',
      workspacePath: './models/hero.glb',
    });
  });
});
