import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { disposeObjectTree } from './threeRuntime';
import {
  applyDeclaredMannequinPose,
  createBlockoutReferencePreset,
  createNeutralMannequin,
} from './threeReferencePresetRuntime';

describe('neutral 3D Reference mannequin runtime', () => {
  it('creates all declared neutral landmarks without textures or appearance detail', () => {
    const mannequin = createNeutralMannequin(poseCapabilities());
    expect([...mannequin.joints.keys()]).toHaveLength(16);
    expect([...mannequin.joints.keys()]).toEqual(
      expect.arrayContaining(['hips', 'head', 'leftElbow', 'rightAnkle']),
    );
    mannequin.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        expect('map' in material ? material.map : undefined).toBeFalsy();
      }
    });
  });

  it('applies declared constrained joints and rejects unknown or out-of-range values', () => {
    const mannequin = createNeutralMannequin(poseCapabilities());
    applyDeclaredMannequinPose(mannequin, {
      poseId: 'standing',
      joints: [
        {
          jointId: 'leftElbow',
          rotation: { x: 0, y: 0, z: 0.5, order: 'XYZ' },
        },
      ],
    });
    expect(mannequin.joints.get('leftElbow')?.rotation.z).toBeCloseTo(0.5);
    expect(() =>
      applyDeclaredMannequinPose(mannequin, {
        poseId: 'standing',
        joints: [{ jointId: 'unknown', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
      }),
    ).toThrow(/unknown joint/i);
    expect(() =>
      applyDeclaredMannequinPose(mannequin, {
        poseId: 'standing',
        joints: [{ jointId: 'leftElbow', rotation: { x: 9, y: 0, z: 0, order: 'XYZ' } }],
      }),
    ).toThrow(/constraint/i);
  });

  it('recursively disposes every mannequin geometry and shared material exactly once', () => {
    const mannequin = createNeutralMannequin(poseCapabilities());
    const disposals = { geometry: 0, material: 0 };
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    mannequin.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) =>
      geometry.addEventListener('dispose', () => {
        disposals.geometry += 1;
      }),
    );
    materials.forEach((material) =>
      material.addEventListener('dispose', () => {
        disposals.material += 1;
      }),
    );
    disposeObjectTree(mannequin.root);
    expect(disposals).toEqual({ geometry: geometries.size, material: materials.size });
  });

  it.each([
    'primitive-blockout-props-v1',
    'studio-room-blockout-v1',
    'neutral-panorama-grid-v1',
  ] as const)('creates the declared guide-only blockout runtime %s', (implementationId) => {
    const root = createBlockoutReferencePreset(implementationId);
    const meshes: THREE.Mesh[] = [];
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    expect(meshes.length).toBeGreaterThan(0);
    expect(new THREE.Box3().setFromObject(root).isEmpty()).toBe(false);
    for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      expect(materials.every((material) => !('map' in material) || !material.map)).toBe(true);
    }
    disposeObjectTree(root);
  });
});

function poseCapabilities() {
  const ids = [
    'hips',
    'spine',
    'chest',
    'head',
    'leftShoulder',
    'leftElbow',
    'leftWrist',
    'rightShoulder',
    'rightElbow',
    'rightWrist',
    'leftHip',
    'leftKnee',
    'leftAnkle',
    'rightHip',
    'rightKnee',
    'rightAnkle',
  ];
  return {
    posePresetIds: ['standing'],
    joints: ids.map((jointId) => ({
      jointId,
      rotationConstraint: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
      },
    })),
  };
}
