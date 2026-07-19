import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { disposeObjectTree } from './threeRuntime';
import {
  applyDeclaredMannequinPose,
  createBlockoutReferencePreset,
  createMannequinSkeletonOverlay,
  createNeutralMannequin,
} from './threeReferencePresetRuntime';

describe('neutral 3D Reference mannequin runtime', () => {
  it.each(['female', 'male', 'child'] as const)(
    'creates a smooth, complete %s mannequin without textures or appearance detail',
    (variant) => {
      const mannequin = createNeutralMannequin(variant, poseCapabilities());
      const meshes: THREE.Mesh[] = [];
      mannequin.root.traverse((object) => {
        if (object instanceof THREE.Mesh) meshes.push(object);
      });
      expect(meshes.length).toBeGreaterThanOrEqual(20);
      expect(meshes.every((mesh) => mesh.geometry.getAttribute('normal') !== undefined)).toBe(true);
      expect(new THREE.Box3().setFromObject(mannequin.root).isEmpty()).toBe(false);
      disposeObjectTree(mannequin.root);
    },
  );

  it('creates all declared neutral landmarks without textures or appearance detail', () => {
    const mannequin = createNeutralMannequin('female', poseCapabilities());
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
    const capabilities = poseCapabilities();
    const mannequin = createNeutralMannequin('female', capabilities);
    const standing = capabilities.posePresets[0];
    if (!standing) throw new Error('Test pose capabilities omitted standing.');
    applyDeclaredMannequinPose(mannequin, {
      poseId: 'standing',
      joints: standing.joints.map((joint) =>
        joint.jointId === 'leftElbow'
          ? { ...joint, rotation: { x: 0, y: 0, z: 0.5, order: 'XYZ' as const } }
          : joint,
      ),
    });
    expect(mannequin.joints.get('leftElbow')?.rotation.z).toBeCloseTo(0.5);
    expect(() =>
      applyDeclaredMannequinPose(mannequin, {
        poseId: 'standing',
        joints: [
          ...standing.joints,
          { jointId: 'unknown', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } },
        ],
      }),
    ).toThrow(/unknown joint/i);
    expect(() =>
      applyDeclaredMannequinPose(mannequin, {
        poseId: 'standing',
        joints: standing.joints.map((joint) =>
          joint.jointId === 'leftElbow'
            ? { ...joint, rotation: { x: 9, y: 0, z: 0, order: 'XYZ' as const } }
            : joint,
        ),
      }),
    ).toThrow(/constraint/i);
  });

  it('projects only declared joints and parent links into the pose render overlay', () => {
    const mannequin = createNeutralMannequin('female', poseCapabilities());
    const overlay = createMannequinSkeletonOverlay(mannequin);
    const lines = overlay.children.find((child) => child instanceof THREE.LineSegments);
    const points = overlay.children.find((child) => child instanceof THREE.Points);
    expect(lines).toBeInstanceOf(THREE.LineSegments);
    expect(points).toBeInstanceOf(THREE.Points);
    if (!(lines instanceof THREE.LineSegments) || !(points instanceof THREE.Points)) {
      throw new Error('Pose overlay omitted declared line or point geometry.');
    }
    expect(lines.geometry.getAttribute('position').count).toBe(30);
    expect(points.geometry.getAttribute('position').count).toBe(16);
    disposeObjectTree(overlay);
    disposeObjectTree(mannequin.root);
  });

  it('recursively disposes every mannequin geometry and shared material exactly once', () => {
    const mannequin = createNeutralMannequin('female', poseCapabilities());
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

  it.each(['blockout-cube-v1', 'blockout-sphere-v1', 'blockout-cylinder-v1'] as const)(
    'creates exactly one declared blockout primitive for %s',
    (implementationId) => {
      const root = createBlockoutReferencePreset(implementationId);
      const meshes: THREE.Mesh[] = [];
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) meshes.push(object);
      });
      expect(meshes).toHaveLength(1);
      expect(meshes[0]?.name).toBe(
        `guide-part:${implementationId.replace('blockout-', '').replace('-v1', '')}`,
      );
      expect(new THREE.Box3().setFromObject(root).isEmpty()).toBe(false);
      disposeObjectTree(root);
    },
  );

  it.each(['studio-room-blockout-v1', 'neutral-panorama-grid-v1'] as const)(
    'creates the declared guide-only blockout runtime %s',
    (implementationId) => {
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
    },
  );
});

function poseCapabilities() {
  const hierarchy = [
    ['hips', undefined],
    ['spine', 'hips'],
    ['chest', 'spine'],
    ['head', 'chest'],
    ['leftShoulder', 'chest'],
    ['leftElbow', 'leftShoulder'],
    ['leftWrist', 'leftElbow'],
    ['rightShoulder', 'chest'],
    ['rightElbow', 'rightShoulder'],
    ['rightWrist', 'rightElbow'],
    ['leftHip', 'hips'],
    ['leftKnee', 'leftHip'],
    ['leftAnkle', 'leftKnee'],
    ['rightHip', 'hips'],
    ['rightKnee', 'rightHip'],
    ['rightAnkle', 'rightKnee'],
  ] as const;
  return {
    posePresets: [
      {
        poseId: 'standing',
        labelKey: 'preview.model.posePreset.standing',
        joints: hierarchy.map(([jointId]) => ({
          jointId,
          rotation: { x: 0, y: 0, z: 0, order: 'XYZ' as const },
        })),
      },
    ],
    joints: hierarchy.map(([jointId, parentJointId]) => ({
      jointId,
      ...(parentJointId ? { parentJointId } : {}),
      rotationConstraint: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
      },
    })),
  };
}
