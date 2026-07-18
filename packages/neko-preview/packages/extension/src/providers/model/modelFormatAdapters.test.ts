import { describe, expect, it } from 'vitest';
import {
  findModelFormatAdapter,
  MODEL_FORMAT_ADAPTERS,
  requireModelFormatAdapter,
} from './modelFormatAdapters';

describe('model format adapters', () => {
  it.each([
    ['hero.glb', 'glb'],
    ['scene.gltf', 'gltf'],
    ['mesh.obj', 'obj'],
    ['print.stl', 'stl'],
    ['scan.ply', 'ply'],
  ] as const)('selects the fixed adapter for %s', (fileName, format) => {
    expect(requireModelFormatAdapter(fileName).format).toBe(format);
  });

  it('keeps MTL dependency-only and rejects unknown formats', () => {
    expect(findModelFormatAdapter('materials.mtl')).toBeUndefined();
    expect(findModelFormatAdapter('character.fbx')).toBeUndefined();
    expect(() => requireModelFormatAdapter('character.vrm')).toThrow(/Unsupported/);
  });

  it('rejects MIME and extension mismatches without fallback', () => {
    expect(findModelFormatAdapter('hero.glb', 'model/gltf+json')).toBeUndefined();
    expect(findModelFormatAdapter('hero.gltf', 'model/gltf-binary')).toBeUndefined();
  });

  it('exposes an immutable code-owned table without a runtime register API', () => {
    expect(MODEL_FORMAT_ADAPTERS.map((adapter) => adapter.format)).toEqual([
      'glb',
      'gltf',
      'obj',
      'stl',
      'ply',
    ]);
    expect(Object.isFrozen(MODEL_FORMAT_ADAPTERS)).toBe(true);
    expect('register' in MODEL_FORMAT_ADAPTERS).toBe(false);
  });
});
