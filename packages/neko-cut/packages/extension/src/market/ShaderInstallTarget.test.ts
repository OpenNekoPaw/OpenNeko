import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '@neko/shared';
import { ShaderInstallTarget } from './ShaderInstallTarget';

describe('ShaderInstallTarget', () => {
  it('routes shader packages by shader kind', () => {
    const target = new ShaderInstallTarget();
    const manifest = shaderManifest('preset');

    expect(() => target.validateManifest(manifest)).not.toThrow();
    expect(target.getInstallPath(manifest)).toContain('/.neko/shaders/preset/studio/shader');
  });
});

function shaderManifest(shaderKind: 'standalone' | 'preset'): AssetManifest {
  return {
    id: '@studio/shader',
    name: 'shader',
    version: '1.0.0',
    type: 'shader',
    source: { kind: 'local', path: '/tmp/shader' },
    distributionKind: 'archive',
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['shader'],
      checksum: 'sha256-test',
      publisherId: 'studio',
    },
    typeMetadata: {
      type: 'shader',
      data: { shaderKind, language: 'wgsl', stage: 'fragment', inputs: [] },
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
