import * as THREE from 'three';
import type { ThreeReferencePoseState, ThreeReferenceRuntimePoseCapabilities } from '@neko/shared';

export interface NeutralMannequinRuntime {
  readonly root: THREE.Group;
  readonly joints: ReadonlyMap<string, THREE.Group>;
  readonly capabilities: ThreeReferenceRuntimePoseCapabilities;
}

export type BlockoutReferenceImplementationId =
  'primitive-blockout-props-v1' | 'studio-room-blockout-v1' | 'neutral-panorama-grid-v1';

const JOINT_LAYOUT = [
  ['hips', undefined, [0, 1.02, 0]],
  ['spine', 'hips', [0, 0.16, 0]],
  ['chest', 'spine', [0, 0.28, 0]],
  ['head', 'chest', [0, 0.42, 0]],
  ['leftShoulder', 'chest', [0.26, 0.12, 0]],
  ['leftElbow', 'leftShoulder', [0.3, 0, 0]],
  ['leftWrist', 'leftElbow', [0.26, 0, 0]],
  ['rightShoulder', 'chest', [-0.26, 0.12, 0]],
  ['rightElbow', 'rightShoulder', [-0.3, 0, 0]],
  ['rightWrist', 'rightElbow', [-0.26, 0, 0]],
  ['leftHip', 'hips', [0.11, -0.1, 0]],
  ['leftKnee', 'leftHip', [0, -0.42, 0]],
  ['leftAnkle', 'leftKnee', [0, -0.4, 0]],
  ['rightHip', 'hips', [-0.11, -0.1, 0]],
  ['rightKnee', 'rightHip', [0, -0.42, 0]],
  ['rightAnkle', 'rightKnee', [0, -0.4, 0]],
] as const;

export function createNeutralMannequin(
  capabilities: ThreeReferenceRuntimePoseCapabilities,
): NeutralMannequinRuntime {
  validateCapabilities(capabilities);
  const root = new THREE.Group();
  root.name = 'guide-neutral-mannequin';
  const joints = new Map<string, THREE.Group>();
  for (const [jointId, parentId, position] of JOINT_LAYOUT) {
    const joint = new THREE.Group();
    joint.name = `joint:${jointId}`;
    joint.userData['referenceJointId'] = jointId;
    joint.position.set(...position);
    const parent = parentId ? joints.get(parentId) : root;
    if (!parent) throw new Error(`3D Reference mannequin parent joint is missing: ${parentId}`);
    parent.add(joint);
    joints.set(jointId, joint);
  }
  const material = new THREE.MeshStandardMaterial({
    color: 0x91a0b5,
    roughness: 0.82,
    metalness: 0,
  });
  addPart(joints, 'hips', 'pelvis', new THREE.BoxGeometry(0.34, 0.18, 0.2), material);
  addPart(
    joints,
    'chest',
    'torso',
    new THREE.BoxGeometry(0.42, 0.48, 0.2),
    material,
    [0, -0.08, 0],
  );
  addPart(joints, 'head', 'head', new THREE.SphereGeometry(0.14, 12, 8), material, [0, 0.11, 0]);
  addArm(joints, material, 'left', 1);
  addArm(joints, material, 'right', -1);
  addLeg(joints, material, 'left');
  addLeg(joints, material, 'right');
  root.updateMatrixWorld(true);
  return { root, joints, capabilities };
}

export function applyDeclaredMannequinPose(
  mannequin: NeutralMannequinRuntime,
  pose: ThreeReferencePoseState,
): void {
  if (!mannequin.capabilities.posePresetIds.includes(pose.poseId)) {
    throw new Error(`Unknown 3D Reference pose preset: ${pose.poseId}`);
  }
  const seen = new Set<string>();
  for (const jointPose of pose.joints) {
    if (seen.has(jointPose.jointId)) {
      throw new Error(`Duplicate 3D Reference joint pose: ${jointPose.jointId}`);
    }
    seen.add(jointPose.jointId);
    const joint = mannequin.joints.get(jointPose.jointId);
    const declaration = mannequin.capabilities.joints.find(
      (candidate) => candidate.jointId === jointPose.jointId,
    );
    if (!joint || !declaration) {
      throw new Error(`Unknown joint in 3D Reference pose: ${jointPose.jointId}`);
    }
    const { rotation } = jointPose;
    const { min, max } = declaration.rotationConstraint;
    if (
      rotation.x < min.x ||
      rotation.x > max.x ||
      rotation.y < min.y ||
      rotation.y > max.y ||
      rotation.z < min.z ||
      rotation.z > max.z
    ) {
      throw new Error(`3D Reference joint rotation exceeds constraint: ${jointPose.jointId}`);
    }
  }
  for (const joint of mannequin.joints.values()) joint.rotation.set(0, 0, 0, 'XYZ');
  for (const jointPose of pose.joints) {
    const joint = mannequin.joints.get(jointPose.jointId);
    if (!joint) throw new Error(`Unknown joint in 3D Reference pose: ${jointPose.jointId}`);
    joint.rotation.set(
      jointPose.rotation.x,
      jointPose.rotation.y,
      jointPose.rotation.z,
      jointPose.rotation.order,
    );
  }
  mannequin.root.updateMatrixWorld(true);
}

export function createBlockoutReferencePreset(
  implementationId: BlockoutReferenceImplementationId,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `guide:${implementationId}`;
  const material = new THREE.MeshStandardMaterial({
    color: 0x91a0b5,
    roughness: 0.9,
    metalness: 0,
  });
  switch (implementationId) {
    case 'primitive-blockout-props-v1':
      addMesh(root, 'cube', new THREE.BoxGeometry(0.7, 0.7, 0.7), material, [-0.9, 0.35, 0]);
      addMesh(
        root,
        'cylinder',
        new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12),
        material,
        [0, 0.45, 0],
      );
      addMesh(root, 'sphere', new THREE.SphereGeometry(0.42, 12, 8), material, [0.95, 0.42, 0]);
      break;
    case 'studio-room-blockout-v1':
      addMesh(root, 'floor', new THREE.BoxGeometry(4, 0.05, 4), material, [0, -0.025, 0]);
      addMesh(root, 'back-wall', new THREE.BoxGeometry(4, 2.6, 0.05), material, [0, 1.3, -2]);
      addMesh(root, 'side-wall', new THREE.BoxGeometry(0.05, 2.6, 4), material, [-2, 1.3, 0]);
      break;
    case 'neutral-panorama-grid-v1': {
      const gridMaterial = new THREE.MeshBasicMaterial({
        color: 0x91a0b5,
        wireframe: true,
        side: THREE.BackSide,
      });
      material.dispose();
      addMesh(
        root,
        'orientation-sphere',
        new THREE.SphereGeometry(2, 24, 12),
        gridMaterial,
        [0, 0, 0],
      );
      break;
    }
  }
  root.updateMatrixWorld(true);
  return root;
}

function validateCapabilities(capabilities: ThreeReferenceRuntimePoseCapabilities): void {
  const actualIds = new Set(JOINT_LAYOUT.map(([jointId]) => jointId));
  const declaredIds = new Set(capabilities.joints.map((joint) => joint.jointId));
  if (
    actualIds.size !== declaredIds.size ||
    [...actualIds].some((jointId) => !declaredIds.has(jointId))
  ) {
    throw new Error('3D Reference mannequin joint declarations do not match its runtime.');
  }
  for (const declaration of capabilities.joints) {
    const layout = JOINT_LAYOUT.find(([jointId]) => jointId === declaration.jointId);
    if (!layout) throw new Error(`Unknown declared mannequin joint: ${declaration.jointId}`);
    if (declaration.parentJointId !== undefined && declaration.parentJointId !== layout[1]) {
      throw new Error(`3D Reference mannequin hierarchy mismatch: ${declaration.jointId}`);
    }
  }
}

function addArm(
  joints: ReadonlyMap<string, THREE.Group>,
  material: THREE.Material,
  side: 'left' | 'right',
  direction: 1 | -1,
): void {
  addPart(
    joints,
    `${side}Shoulder`,
    `${side}-upper-arm`,
    new THREE.CylinderGeometry(0.045, 0.055, 0.3, 10),
    material,
    [direction * 0.15, 0, 0],
    Math.PI / 2,
  );
  addPart(
    joints,
    `${side}Elbow`,
    `${side}-lower-arm`,
    new THREE.CylinderGeometry(0.035, 0.045, 0.26, 10),
    material,
    [direction * 0.13, 0, 0],
    Math.PI / 2,
  );
  addPart(
    joints,
    `${side}Wrist`,
    `${side}-hand`,
    new THREE.BoxGeometry(0.1, 0.07, 0.04),
    material,
    [direction * 0.05, 0, 0],
    0,
  );
}

function addLeg(
  joints: ReadonlyMap<string, THREE.Group>,
  material: THREE.Material,
  side: 'left' | 'right',
): void {
  addPart(
    joints,
    `${side}Hip`,
    `${side}-upper-leg`,
    new THREE.CylinderGeometry(0.06, 0.075, 0.42, 10),
    material,
    [0, -0.21, 0],
  );
  addPart(
    joints,
    `${side}Knee`,
    `${side}-lower-leg`,
    new THREE.CylinderGeometry(0.045, 0.06, 0.4, 10),
    material,
    [0, -0.2, 0],
  );
  addPart(
    joints,
    `${side}Ankle`,
    `${side}-foot`,
    new THREE.BoxGeometry(0.12, 0.08, 0.24),
    material,
    [0, -0.02, 0.07],
  );
}

function addPart(
  joints: ReadonlyMap<string, THREE.Group>,
  jointId: string,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number] = [0, 0, 0],
  rotationZ = 0,
): void {
  const joint = joints.get(jointId);
  if (!joint) throw new Error(`3D Reference mannequin joint is missing: ${jointId}`);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `guide-part:${name}`;
  mesh.position.set(...position);
  mesh.rotation.z = rotationZ;
  joint.add(mesh);
}

function addMesh(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
): void {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `guide-part:${name}`;
  mesh.position.set(...position);
  parent.add(mesh);
}
