import * as THREE from 'three';
import type { ThreeReferencePoseState, ThreeReferenceRuntimePoseCapabilities } from '@neko/shared';

export interface NeutralMannequinRuntime {
  readonly root: THREE.Group;
  readonly joints: ReadonlyMap<string, THREE.Group>;
  readonly capabilities: ThreeReferenceRuntimePoseCapabilities;
}

export type NeutralMannequinVariant = 'female' | 'male' | 'child';

export type BlockoutReferenceImplementationId =
  'primitive-blockout-props-v1' | 'studio-room-blockout-v1' | 'neutral-panorama-grid-v1';

interface MannequinBodyProfile {
  readonly rootName: string;
  readonly color: number;
  readonly hipsY: number;
  readonly spineLength: number;
  readonly chestLength: number;
  readonly neckToHead: number;
  readonly shoulderWidth: number;
  readonly upperArmLength: number;
  readonly lowerArmLength: number;
  readonly hipWidth: number;
  readonly upperLegLength: number;
  readonly lowerLegLength: number;
  readonly chestWidth: number;
  readonly waistWidth: number;
  readonly pelvisWidth: number;
  readonly torsoDepth: number;
  readonly limbRadius: number;
  readonly headRadius: number;
}

type JointLayout = readonly [
  jointId: string,
  parentJointId: string | undefined,
  position: readonly [number, number, number],
][];

const BODY_PROFILES: Readonly<Record<NeutralMannequinVariant, MannequinBodyProfile>> = {
  female: {
    rootName: 'guide-mannequin-female',
    color: 0x8ca6c8,
    hipsY: 1.02,
    spineLength: 0.17,
    chestLength: 0.27,
    neckToHead: 0.4,
    shoulderWidth: 0.27,
    upperArmLength: 0.29,
    lowerArmLength: 0.25,
    hipWidth: 0.125,
    upperLegLength: 0.43,
    lowerLegLength: 0.4,
    chestWidth: 0.22,
    waistWidth: 0.145,
    pelvisWidth: 0.22,
    torsoDepth: 0.115,
    limbRadius: 0.052,
    headRadius: 0.135,
  },
  male: {
    rootName: 'guide-mannequin-male',
    color: 0x7897c1,
    hipsY: 1.08,
    spineLength: 0.18,
    chestLength: 0.3,
    neckToHead: 0.43,
    shoulderWidth: 0.315,
    upperArmLength: 0.32,
    lowerArmLength: 0.28,
    hipWidth: 0.12,
    upperLegLength: 0.46,
    lowerLegLength: 0.43,
    chestWidth: 0.255,
    waistWidth: 0.17,
    pelvisWidth: 0.205,
    torsoDepth: 0.135,
    limbRadius: 0.06,
    headRadius: 0.14,
  },
  child: {
    rootName: 'guide-mannequin-child',
    color: 0x9aafd0,
    hipsY: 0.73,
    spineLength: 0.12,
    chestLength: 0.19,
    neckToHead: 0.31,
    shoulderWidth: 0.19,
    upperArmLength: 0.205,
    lowerArmLength: 0.175,
    hipWidth: 0.09,
    upperLegLength: 0.29,
    lowerLegLength: 0.265,
    chestWidth: 0.155,
    waistWidth: 0.13,
    pelvisWidth: 0.155,
    torsoDepth: 0.1,
    limbRadius: 0.043,
    headRadius: 0.13,
  },
};

export function createNeutralMannequin(
  variant: NeutralMannequinVariant,
  capabilities: ThreeReferenceRuntimePoseCapabilities,
): NeutralMannequinRuntime {
  const profile = BODY_PROFILES[variant];
  const layout = createJointLayout(profile);
  validateCapabilities(capabilities, layout);
  const root = new THREE.Group();
  root.name = profile.rootName;
  root.userData['referenceMannequinVariant'] = variant;
  const joints = new Map<string, THREE.Group>();
  for (const [jointId, parentId, position] of layout) {
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
    color: profile.color,
    roughness: 0.76,
    metalness: 0,
  });
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(profile.color).multiplyScalar(0.84),
    roughness: 0.72,
    metalness: 0,
  });
  addAnatomicalTorso(joints, profile, material);
  addHeadAndNeck(joints, profile, material, jointMaterial);
  addArm(joints, profile, material, jointMaterial, 'left', 1);
  addArm(joints, profile, material, jointMaterial, 'right', -1);
  addLeg(joints, profile, material, jointMaterial, 'left');
  addLeg(joints, profile, material, jointMaterial, 'right');
  root.updateMatrixWorld(true);
  return { root, joints, capabilities };
}

export function applyDeclaredMannequinPose(
  mannequin: NeutralMannequinRuntime,
  pose: ThreeReferencePoseState,
): void {
  if (!mannequin.capabilities.posePresets.some((preset) => preset.poseId === pose.poseId)) {
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
  if (seen.size !== mannequin.joints.size) {
    throw new Error(`Incomplete 3D Reference joint pose: ${pose.poseId}`);
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

export function createMannequinSkeletonOverlay(mannequin: NeutralMannequinRuntime): THREE.Group {
  mannequin.root.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.name = 'guide-output:pose-skeleton';
  const jointPositions = new Map<string, THREE.Vector3>();
  for (const [jointId, joint] of mannequin.joints) {
    jointPositions.set(jointId, joint.getWorldPosition(new THREE.Vector3()));
  }
  const points = [...jointPositions.values()];
  const segmentPoints: THREE.Vector3[] = [];
  for (const declaration of mannequin.capabilities.joints) {
    if (!declaration.parentJointId) continue;
    const parent = jointPositions.get(declaration.parentJointId);
    const child = jointPositions.get(declaration.jointId);
    if (!parent || !child) {
      throw new Error(`3D Reference skeleton joint is unavailable: ${declaration.jointId}`);
    }
    segmentPoints.push(parent, child);
  }
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(segmentPoints);
  root.add(
    new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: 0x18212d, linewidth: 2 }),
    ),
  );
  const pointGeometry = new THREE.BufferGeometry().setFromPoints(points);
  root.add(
    new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({ color: 0x2d73da, size: 8, sizeAttenuation: false }),
    ),
  );
  return root;
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

function validateCapabilities(
  capabilities: ThreeReferenceRuntimePoseCapabilities,
  layout: JointLayout,
): void {
  const actualIds = new Set(layout.map(([jointId]) => jointId));
  const declaredIds = new Set(capabilities.joints.map((joint) => joint.jointId));
  if (
    actualIds.size !== declaredIds.size ||
    [...actualIds].some((jointId) => !declaredIds.has(jointId))
  ) {
    throw new Error('3D Reference mannequin joint declarations do not match its runtime.');
  }
  for (const declaration of capabilities.joints) {
    const layoutEntry = layout.find(([jointId]) => jointId === declaration.jointId);
    if (!layoutEntry) throw new Error(`Unknown declared mannequin joint: ${declaration.jointId}`);
    if (declaration.parentJointId !== layoutEntry[1]) {
      throw new Error(`3D Reference mannequin hierarchy mismatch: ${declaration.jointId}`);
    }
  }
}

function createJointLayout(profile: MannequinBodyProfile): JointLayout {
  return [
    ['hips', undefined, [0, profile.hipsY, 0]],
    ['spine', 'hips', [0, profile.spineLength, 0]],
    ['chest', 'spine', [0, profile.chestLength, 0]],
    ['head', 'chest', [0, profile.neckToHead, 0]],
    ['leftShoulder', 'chest', [profile.shoulderWidth, profile.chestLength * 0.38, 0]],
    ['leftElbow', 'leftShoulder', [profile.upperArmLength, 0, 0]],
    ['leftWrist', 'leftElbow', [profile.lowerArmLength, 0, 0]],
    ['rightShoulder', 'chest', [-profile.shoulderWidth, profile.chestLength * 0.38, 0]],
    ['rightElbow', 'rightShoulder', [-profile.upperArmLength, 0, 0]],
    ['rightWrist', 'rightElbow', [-profile.lowerArmLength, 0, 0]],
    ['leftHip', 'hips', [profile.hipWidth, -profile.pelvisWidth * 0.35, 0]],
    ['leftKnee', 'leftHip', [0, -profile.upperLegLength, 0]],
    ['leftAnkle', 'leftKnee', [0, -profile.lowerLegLength, 0]],
    ['rightHip', 'hips', [-profile.hipWidth, -profile.pelvisWidth * 0.35, 0]],
    ['rightKnee', 'rightHip', [0, -profile.upperLegLength, 0]],
    ['rightAnkle', 'rightKnee', [0, -profile.lowerLegLength, 0]],
  ];
}

function addAnatomicalTorso(
  joints: ReadonlyMap<string, THREE.Group>,
  profile: MannequinBodyProfile,
  material: THREE.Material,
): void {
  addEllipsoid(
    joints,
    'hips',
    'pelvis',
    material,
    [profile.pelvisWidth, profile.pelvisWidth * 0.58, profile.torsoDepth],
    [0, profile.spineLength * 0.12, 0],
  );
  addEllipsoid(
    joints,
    'spine',
    'abdomen',
    material,
    [profile.waistWidth, profile.chestLength * 0.6, profile.torsoDepth * 0.82],
    [0, profile.chestLength * 0.28, 0],
  );
  addEllipsoid(
    joints,
    'chest',
    'ribcage',
    material,
    [profile.chestWidth, profile.chestLength * 0.72, profile.torsoDepth],
    [0, -profile.chestLength * 0.08, 0],
  );
}

function addHeadAndNeck(
  joints: ReadonlyMap<string, THREE.Group>,
  profile: MannequinBodyProfile,
  material: THREE.Material,
  jointMaterial: THREE.Material,
): void {
  addCapsulePart(
    joints,
    'chest',
    'neck',
    profile.limbRadius * 0.78,
    profile.neckToHead * 0.42,
    material,
    [0, profile.neckToHead * 0.22, 0],
  );
  addEllipsoid(
    joints,
    'head',
    'head',
    material,
    [profile.headRadius * 0.84, profile.headRadius * 1.14, profile.headRadius],
    [0, profile.headRadius * 0.48, 0],
  );
  addEllipsoid(
    joints,
    'head',
    'face-plane',
    jointMaterial,
    [profile.headRadius * 0.58, profile.headRadius * 0.5, profile.headRadius * 0.2],
    [0, profile.headRadius * 0.42, profile.headRadius * 0.82],
  );
}

function addArm(
  joints: ReadonlyMap<string, THREE.Group>,
  profile: MannequinBodyProfile,
  material: THREE.Material,
  jointMaterial: THREE.Material,
  side: 'left' | 'right',
  direction: 1 | -1,
): void {
  addJointSphere(
    joints,
    `${side}Shoulder`,
    `${side}-shoulder`,
    profile.limbRadius * 1.18,
    jointMaterial,
  );
  addOrientedCapsule(
    joints,
    `${side}Shoulder`,
    `${side}-upper-arm`,
    profile.limbRadius,
    [direction * profile.upperArmLength, 0, 0],
    material,
  );
  addJointSphere(joints, `${side}Elbow`, `${side}-elbow`, profile.limbRadius * 0.9, jointMaterial);
  addOrientedCapsule(
    joints,
    `${side}Elbow`,
    `${side}-lower-arm`,
    profile.limbRadius * 0.82,
    [direction * profile.lowerArmLength, 0, 0],
    material,
  );
  addJointSphere(joints, `${side}Wrist`, `${side}-wrist`, profile.limbRadius * 0.65, jointMaterial);
  addEllipsoid(
    joints,
    `${side}Wrist`,
    `${side}-hand`,
    material,
    [profile.limbRadius * 1.25, profile.limbRadius * 0.65, profile.limbRadius * 0.42],
    [direction * profile.limbRadius * 1.12, 0, 0],
  );
}

function addLeg(
  joints: ReadonlyMap<string, THREE.Group>,
  profile: MannequinBodyProfile,
  material: THREE.Material,
  jointMaterial: THREE.Material,
  side: 'left' | 'right',
): void {
  addJointSphere(joints, `${side}Hip`, `${side}-hip`, profile.limbRadius * 1.28, jointMaterial);
  addOrientedCapsule(
    joints,
    `${side}Hip`,
    `${side}-upper-leg`,
    profile.limbRadius * 1.28,
    [0, -profile.upperLegLength, 0],
    material,
  );
  addJointSphere(joints, `${side}Knee`, `${side}-knee`, profile.limbRadius, jointMaterial);
  addOrientedCapsule(
    joints,
    `${side}Knee`,
    `${side}-lower-leg`,
    profile.limbRadius,
    [0, -profile.lowerLegLength, 0],
    material,
  );
  addJointSphere(joints, `${side}Ankle`, `${side}-ankle`, profile.limbRadius * 0.72, jointMaterial);
  addEllipsoid(
    joints,
    `${side}Ankle`,
    `${side}-foot`,
    material,
    [profile.limbRadius * 1.05, profile.limbRadius * 0.7, profile.limbRadius * 1.9],
    [0, -profile.limbRadius * 0.35, profile.limbRadius * 1.18],
  );
}

function addOrientedCapsule(
  joints: ReadonlyMap<string, THREE.Group>,
  jointId: string,
  name: string,
  radius: number,
  endpoint: readonly [number, number, number],
  material: THREE.Material,
): void {
  const joint = joints.get(jointId);
  if (!joint) throw new Error(`3D Reference mannequin joint is missing: ${jointId}`);
  const direction = new THREE.Vector3(...endpoint);
  const length = direction.length();
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.001), 8, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `guide-part:${name}`;
  mesh.position.copy(direction).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  joint.add(mesh);
}

function addCapsulePart(
  joints: ReadonlyMap<string, THREE.Group>,
  jointId: string,
  name: string,
  radius: number,
  length: number,
  material: THREE.Material,
  position: readonly [number, number, number],
): void {
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.001), 8, 16);
  addPartMesh(joints, jointId, name, geometry, material, position);
}

function addJointSphere(
  joints: ReadonlyMap<string, THREE.Group>,
  jointId: string,
  name: string,
  radius: number,
  material: THREE.Material,
): void {
  addPartMesh(joints, jointId, name, new THREE.SphereGeometry(radius, 20, 14), material, [0, 0, 0]);
}

function addEllipsoid(
  joints: ReadonlyMap<string, THREE.Group>,
  jointId: string,
  name: string,
  material: THREE.Material,
  scale: readonly [number, number, number],
  position: readonly [number, number, number],
): void {
  const mesh = addPartMesh(
    joints,
    jointId,
    name,
    new THREE.SphereGeometry(1, 24, 16),
    material,
    position,
  );
  mesh.scale.set(...scale);
}

function addPartMesh(
  joints: ReadonlyMap<string, THREE.Group>,
  jointId: string,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
): THREE.Mesh {
  const joint = joints.get(jointId);
  if (!joint) throw new Error(`3D Reference mannequin joint is missing: ${jointId}`);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `guide-part:${name}`;
  mesh.position.set(...position);
  joint.add(mesh);
  return mesh;
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
