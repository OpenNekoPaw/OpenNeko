import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObjectTree } from '../src/model/threeRuntime';

const AUDITED_RIGGED_SIMPLE = {
  source: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/RiggedSimple',
  asset:
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/RiggedSimple/glTF-Binary/RiggedSimple.glb',
  license: 'CC-BY-4.0',
  attribution: '© 2017 Cesium',
  sha256: '3a79dabb67bb0cd598a18d08b954d9d357c27c30672f82ef5d3f4e7fe6ca3401',
} as const;

const REQUIRED_LANDMARKS = [
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
] as const;

interface CandidateMetrics {
  readonly buildOrParseMedianMs: number;
  readonly bytes: number;
  readonly objects: number;
  readonly meshes: number;
  readonly skinnedMeshes: number;
  readonly bones: number;
  readonly triangles: number;
  readonly landmarks: readonly string[];
  readonly landmarkCoverage: number;
  readonly poseChangesLandmark: boolean;
  readonly disposedGeometries: number;
  readonly disposedMaterials: number;
  readonly disposalComplete: boolean;
}

async function main(): Promise<void> {
  const riggedPath = process.argv[2];
  if (!riggedPath) {
    throw new Error(
      'Usage: tsx scripts/three-reference-preset-feasibility.mts <audited-RiggedSimple.glb>',
    );
  }

  const riggedBytes = await readFile(riggedPath);
  const fingerprint = createHash('sha256').update(riggedBytes).digest('hex');
  if (fingerprint !== AUDITED_RIGGED_SIMPLE.sha256) {
    throw new Error(`Rigged GLB fingerprint mismatch: ${fingerprint}`);
  }

  const proceduralRuns = measureSynchronousRuns(30, createProceduralMannequin).slice(5);
  const riggedRuns = (await measureAsynchronousRuns(30, () => parseGlb(riggedBytes))).slice(5);
  const procedural = inspectCandidate(createProceduralMannequin(), 0, median(proceduralRuns));
  const rigged = inspectCandidate(
    await parseGlb(riggedBytes),
    riggedBytes.byteLength,
    median(riggedRuns),
  );

  const decision = {
    selected: 'project-owned-procedural',
    reason:
      'The audited GLB proves skin loading but is a two-joint skinning test, not a humanoid. The procedural candidate provides all declared humanoid landmarks, deterministic articulation, zero packaged binary bytes, neutral guide-only geometry, and complete disposal through the production recursive disposer.',
    productionConstraint:
      'Keep the procedural mannequin Preview-owned and guide-only. Do not present RiggedSimple as a user preset or copy it into the repository.',
  } as const;

  process.stdout.write(
    `${JSON.stringify(
      {
        auditedAsset: AUDITED_RIGGED_SIMPLE,
        evaluation: {
          procedural,
          auditedRiggedGlb: rigged,
          renderQualityProxy: {
            procedural:
              'Complete neutral head/torso/limb silhouette with explicit humanoid pivots; intentionally no appearance detail.',
            auditedRiggedGlb:
              'Valid skinning test geometry, but not a humanoid silhouette and therefore unsuitable for pose/camera reference.',
          },
        },
        decision,
      },
      null,
      2,
    )}\n`,
  );
}

function createProceduralMannequin(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'guide-neutral-mannequin';
  const material = new THREE.MeshStandardMaterial({
    color: 0x91a0b5,
    roughness: 0.82,
    metalness: 0,
  });
  const joints = new Map<string, THREE.Group>();

  const addJoint = (
    id: string,
    parent: THREE.Object3D,
    position: readonly [number, number, number],
  ): THREE.Group => {
    const joint = new THREE.Group();
    joint.name = `joint:${id}`;
    joint.userData['referenceJointId'] = id;
    joint.position.set(...position);
    parent.add(joint);
    joints.set(id, joint);
    return joint;
  };
  const addPart = (
    parent: THREE.Object3D,
    name: string,
    geometry: THREE.BufferGeometry,
    position: readonly [number, number, number] = [0, 0, 0],
    rotationZ = 0,
  ): void => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `guide-part:${name}`;
    mesh.position.set(...position);
    mesh.rotation.z = rotationZ;
    parent.add(mesh);
  };

  const hips = addJoint('hips', root, [0, 1.02, 0]);
  addPart(hips, 'pelvis', new THREE.BoxGeometry(0.34, 0.18, 0.2));
  const spine = addJoint('spine', hips, [0, 0.16, 0]);
  const chest = addJoint('chest', spine, [0, 0.28, 0]);
  addPart(chest, 'torso', new THREE.BoxGeometry(0.42, 0.48, 0.2), [0, -0.08, 0]);
  const head = addJoint('head', chest, [0, 0.42, 0]);
  addPart(head, 'head', new THREE.SphereGeometry(0.14, 12, 8), [0, 0.11, 0]);

  addArm('left', 1, chest, addJoint, addPart);
  addArm('right', -1, chest, addJoint, addPart);
  addLeg('left', 1, hips, addJoint, addPart);
  addLeg('right', -1, hips, addJoint, addPart);

  root.userData['joints'] = joints;
  root.updateMatrixWorld(true);
  return root;
}

function addArm(
  side: 'left' | 'right',
  direction: 1 | -1,
  chest: THREE.Object3D,
  addJoint: (
    id: string,
    parent: THREE.Object3D,
    position: readonly [number, number, number],
  ) => THREE.Group,
  addPart: (
    parent: THREE.Object3D,
    name: string,
    geometry: THREE.BufferGeometry,
    position?: readonly [number, number, number],
    rotationZ?: number,
  ) => void,
): void {
  const shoulder = addJoint(`${side}Shoulder`, chest, [direction * 0.26, 0.12, 0]);
  addPart(
    shoulder,
    `${side}-upper-arm`,
    new THREE.CylinderGeometry(0.045, 0.055, 0.3, 10),
    [direction * 0.15, 0, 0],
    Math.PI / 2,
  );
  const elbow = addJoint(`${side}Elbow`, shoulder, [direction * 0.3, 0, 0]);
  addPart(
    elbow,
    `${side}-lower-arm`,
    new THREE.CylinderGeometry(0.035, 0.045, 0.26, 10),
    [direction * 0.13, 0, 0],
    Math.PI / 2,
  );
  const wrist = addJoint(`${side}Wrist`, elbow, [direction * 0.26, 0, 0]);
  addPart(wrist, `${side}-hand`, new THREE.BoxGeometry(0.1, 0.07, 0.04), [direction * 0.05, 0, 0]);
}

function addLeg(
  side: 'left' | 'right',
  direction: 1 | -1,
  hips: THREE.Object3D,
  addJoint: (
    id: string,
    parent: THREE.Object3D,
    position: readonly [number, number, number],
  ) => THREE.Group,
  addPart: (
    parent: THREE.Object3D,
    name: string,
    geometry: THREE.BufferGeometry,
    position?: readonly [number, number, number],
    rotationZ?: number,
  ) => void,
): void {
  const hip = addJoint(`${side}Hip`, hips, [direction * 0.11, -0.1, 0]);
  addPart(
    hip,
    `${side}-upper-leg`,
    new THREE.CylinderGeometry(0.06, 0.075, 0.42, 10),
    [0, -0.21, 0],
  );
  const knee = addJoint(`${side}Knee`, hip, [0, -0.42, 0]);
  addPart(
    knee,
    `${side}-lower-leg`,
    new THREE.CylinderGeometry(0.045, 0.06, 0.4, 10),
    [0, -0.2, 0],
  );
  const ankle = addJoint(`${side}Ankle`, knee, [0, -0.4, 0]);
  addPart(ankle, `${side}-foot`, new THREE.BoxGeometry(0.12, 0.08, 0.24), [0, -0.02, 0.07]);
}

async function parseGlb(bytes: Uint8Array): Promise<THREE.Object3D> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject);
  });
}

function inspectCandidate(
  root: THREE.Object3D,
  bytes: number,
  buildOrParseMedianMs: number,
): CandidateMetrics {
  const landmarks: string[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let objects = 0;
  let meshes = 0;
  let skinnedMeshes = 0;
  let bones = 0;
  let triangles = 0;

  root.traverse((object) => {
    objects += 1;
    const jointId = object.userData['referenceJointId'];
    if (typeof jointId === 'string') landmarks.push(jointId);
    if (object instanceof THREE.Bone) bones += 1;
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    if (object instanceof THREE.SkinnedMesh) skinnedMeshes += 1;
    geometries.add(object.geometry);
    const position = object.geometry.getAttribute('position');
    if (object.geometry.index) triangles += object.geometry.index.count / 3;
    else if (position) triangles += position.count / 3;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of entries) materials.add(material);
  });

  let disposedGeometries = 0;
  let disposedMaterials = 0;
  for (const geometry of geometries) {
    geometry.addEventListener('dispose', () => {
      disposedGeometries += 1;
    });
  }
  for (const material of materials) {
    material.addEventListener('dispose', () => {
      disposedMaterials += 1;
    });
  }

  const poseChangesLandmark = exercisePose(root);
  disposeObjectTree(root);
  const covered = REQUIRED_LANDMARKS.filter((landmark) => landmarks.includes(landmark));

  return {
    buildOrParseMedianMs: round(buildOrParseMedianMs),
    bytes,
    objects,
    meshes,
    skinnedMeshes,
    bones,
    triangles: Math.round(triangles),
    landmarks: covered,
    landmarkCoverage: round(covered.length / REQUIRED_LANDMARKS.length),
    poseChangesLandmark,
    disposedGeometries,
    disposedMaterials,
    disposalComplete: disposedGeometries >= geometries.size && disposedMaterials >= materials.size,
  };
}

function exercisePose(root: THREE.Object3D): boolean {
  const elbow = root.getObjectByName('joint:leftElbow');
  const wrist = root.getObjectByName('joint:leftWrist');
  if (!elbow || !wrist) return false;
  root.updateMatrixWorld(true);
  const before = wrist.getWorldPosition(new THREE.Vector3());
  elbow.rotation.z = Math.PI / 3;
  root.updateMatrixWorld(true);
  const after = wrist.getWorldPosition(new THREE.Vector3());
  return before.distanceTo(after) > 0.01;
}

function measureSynchronousRuns(count: number, create: () => THREE.Object3D): readonly number[] {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    const root = create();
    samples.push(performance.now() - start);
    disposeObjectTree(root);
  }
  return samples;
}

async function measureAsynchronousRuns(
  count: number,
  create: () => Promise<THREE.Object3D>,
): Promise<readonly number[]> {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    const root = await create();
    samples.push(performance.now() - start);
    disposeObjectTree(root);
  }
  return samples;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const value = sorted[Math.floor(sorted.length / 2)];
  if (value === undefined) throw new Error('Cannot calculate median of an empty sample.');
  return value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

await main();
