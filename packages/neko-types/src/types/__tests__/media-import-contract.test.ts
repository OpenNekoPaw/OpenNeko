import { describe, expect, it } from 'vitest';
import type {
  ImportedAssetDescriptor,
  ImportPlan,
  ImportResult,
  ImportValidation,
} from '../media-import';

describe('media import contracts', () => {
  it('represents all supported import planning actions', () => {
    const plans: readonly ImportPlan[] = [
      {
        action: 'useSource',
        sourcePath: '/workspace/hero.glb',
        projectRef: 'hero.glb',
      },
      {
        action: 'promote',
        sourcePath: '/external/hero.glb',
        targetPath: '/workspace/assets/hero.glb',
        targetDir: '/workspace/assets',
        projectRef: 'assets/hero.glb',
      },
      {
        action: 'bundle-memory',
        sourcePath: '/external/sakura.zip',
        bundlePath: 'imports/sakura.zip',
        projectRef: 'imports/sakura.zip#avatars/sakura/model3.json',
      },
      {
        action: 'extract-promote',
        sourcePath: '/external/model.zip',
        targetDir: '/workspace/media/imports/models/model',
        projectRef: 'media/imports/models/model/scene.gltf',
      },
    ];

    expect(plans.map((plan) => plan.action)).toEqual([
      'useSource',
      'promote',
      'bundle-memory',
      'extract-promote',
    ]);
  });

  it('describes imported workspace, disk, and bundle-memory assets', () => {
    const importedAssets: readonly ImportedAssetDescriptor[] = [
      {
        dimension: 'model',
        mediaKind: 'model-3d',
        storageMode: 'workspace',
        path: './hero.glb',
        sourceHash: 'sha256:model',
      },
      {
        dimension: 'motion',
        mediaKind: 'live2d-motion',
        storageMode: 'bundle-memory',
        locator: {
          bundlePath: './sakura.zip',
          entryPath: 'motions/wave.motion3.json',
          fragmentRef: './sakura.zip#motions/wave.motion3.json',
        },
      },
      {
        dimension: 'config',
        mediaKind: 'model-config',
        storageMode: 'disk',
        path: './hero.model3.json',
        metadata: { format: 'live2d-config' },
      },
    ];
    const result: ImportResult = {
      projectFilePath: './character-import.json',
      importedAssets,
      diagnostics: ['Imported with existing workspace references.'],
    };
    const validation: ImportValidation = {
      supported: true,
      detectedMediaKind: 'character-pack',
    };

    expect(result.importedAssets.map((asset) => asset.dimension)).toEqual([
      'model',
      'motion',
      'config',
    ]);
    expect(result.importedAssets[1]?.locator?.entryPath).toBe('motions/wave.motion3.json');
    expect(validation.detectedMediaKind).toBe('character-pack');
  });
});
