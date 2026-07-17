import { describe, it, expect } from 'vitest';
import { generateMinimalGlb, generateDefaultCubeGlb, generateHumanoidGlb } from '../glb-template';

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_TYPE_JSON = 0x4e4f534a;

function readU32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
  );
}

function parseGlb(data: Uint8Array) {
  // GLB header
  const magic = readU32LE(data, 0);
  expect(magic).toBe(GLB_MAGIC);

  const version = readU32LE(data, 4);
  expect(version).toBe(2);

  const totalLength = readU32LE(data, 8);
  expect(totalLength).toBe(data.length);

  // First chunk must be JSON
  const chunkLength = readU32LE(data, 12);
  const chunkType = readU32LE(data, 16);
  expect(chunkType).toBe(CHUNK_TYPE_JSON);

  const jsonBytes = data.slice(20, 20 + chunkLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));

  return { json, totalLength };
}

describe('generateMinimalGlb', () => {
  it('produces valid GLB binary with correct header', () => {
    const result = generateMinimalGlb('TestScene');
    const { json } = parseGlb(result);

    expect(json.asset.version).toBe('2.0');
    expect(json.asset.generator).toBe('neko-model');
    expect(json.scene).toBe(0);
    expect(json.scenes).toHaveLength(1);
    expect(json.scenes[0].name).toBe('TestScene');
  });

  it('has a single root node', () => {
    const result = generateMinimalGlb('Test');
    const { json } = parseGlb(result);

    expect(json.nodes).toHaveLength(1);
    expect(json.nodes[0].name).toBe('Root');
    expect(json.scenes[0].nodes).toEqual([0]);
  });

  it('has no meshes, materials, or buffers', () => {
    const result = generateMinimalGlb('Test');
    const { json } = parseGlb(result);

    expect(json.meshes).toBeUndefined();
    expect(json.materials).toBeUndefined();
    expect(json.buffers).toBeUndefined();
  });

  it('has minimal size (< 512 bytes)', () => {
    const result = generateMinimalGlb('Test');
    expect(result.length).toBeLessThan(512);
  });

  it('total length is 4-byte aligned', () => {
    const result = generateMinimalGlb('Test');
    expect(result.length % 4).toBe(0);
  });
});

describe('generateDefaultCubeGlb', () => {
  it('produces valid GLB with a renderable cube mesh', () => {
    const result = generateDefaultCubeGlb('CubeScene');
    const { json } = parseGlb(result);

    expect(json.scenes[0].name).toBe('CubeScene');
    expect(json.nodes).toHaveLength(1);
    expect(json.nodes[0]).toMatchObject({ name: 'Cube', mesh: 0 });
    expect(json.meshes).toHaveLength(1);
    expect(json.meshes[0].name).toBe('Cube');
    expect(json.meshes[0].primitives[0].attributes.POSITION).toBe(0);
    expect(json.meshes[0].primitives[0].indices).toBe(2);
    expect(json.materials[0]).toMatchObject({ name: 'Default Gray' });
    expect(json.buffers[0].byteLength).toBeGreaterThan(0);
  });

  it('includes cube bounds for engine camera framing', () => {
    const result = generateDefaultCubeGlb('CubeScene');
    const { json } = parseGlb(result);

    expect(json.accessors[0].min).toEqual([-1, -1, -1]);
    expect(json.accessors[0].max).toEqual([1, 1, 1]);
  });
});

describe('generateHumanoidGlb', () => {
  it('produces valid GLB with humanoid skeleton', () => {
    const result = generateHumanoidGlb('Humanoid');
    const { json } = parseGlb(result);

    expect(json.asset.version).toBe('2.0');
    expect(json.nodes.length).toBe(12); // Hips + Spine + Chest + Head + 4 arms + 4 legs
  });

  it('has correct bone hierarchy', () => {
    const result = generateHumanoidGlb('Test');
    const { json } = parseGlb(result);

    // Hips is root
    const hips = json.nodes[0];
    expect(hips.name).toBe('Hips');
    expect(json.scenes[0].nodes).toEqual([0]);

    // Hips → Spine, LeftUpperLeg, RightUpperLeg
    expect(hips.children).toEqual([1, 8, 10]);

    // Spine → Chest
    expect(json.nodes[1].name).toBe('Spine');
    expect(json.nodes[1].children).toEqual([2]);

    // Chest → Head, LeftUpperArm, RightUpperArm
    expect(json.nodes[2].name).toBe('Chest');
    expect(json.nodes[2].children).toEqual([3, 4, 6]);
  });

  it('has mesh and material data', () => {
    const result = generateHumanoidGlb('Test');
    const { json } = parseGlb(result);

    expect(json.meshes).toBeDefined();
    expect(json.meshes.length).toBeGreaterThan(0);
    expect(json.materials).toBeDefined();
    expect(json.buffers).toBeDefined();
    // Hips has torso mesh reference
    expect(json.nodes[0].mesh).toBe(1);
  });

  it('leaf nodes have no children', () => {
    const result = generateHumanoidGlb('Test');
    const { json } = parseGlb(result);

    // Head, LeftLowerArm, RightLowerArm, LeftLowerLeg, RightLowerLeg are leaves
    const leafIndices = [3, 5, 7, 9, 11];
    for (const i of leafIndices) {
      expect(json.nodes[i].children).toBeUndefined();
    }
  });
});
