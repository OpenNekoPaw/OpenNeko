import type {
  ThreeReferenceEuler,
  ThreeReferenceRuntimeJointConstraint,
  ThreeReferenceRuntimePosePreset,
} from '@neko/shared';

const JOINT_HIERARCHY = [
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

export type ThreeReferenceMannequinJointId = (typeof JOINT_HIERARCHY)[number][0];

const ZERO_ROTATION: ThreeReferenceEuler = { x: 0, y: 0, z: 0, order: 'XYZ' };

export const THREE_REFERENCE_MANNEQUIN_JOINTS: readonly ThreeReferenceRuntimeJointConstraint[] =
  JOINT_HIERARCHY.map(([jointId, parentJointId]) => ({
    jointId,
    ...(parentJointId ? { parentJointId } : {}),
    rotationConstraint: jointConstraint(jointId),
  }));

export const THREE_REFERENCE_MANNEQUIN_POSES: readonly ThreeReferenceRuntimePosePreset[] = [
  pose('standing', {
    leftShoulder: rotation(0, 0, -1.34),
    rightShoulder: rotation(0, 0, 1.34),
    leftElbow: rotation(0, 0, -0.12),
    rightElbow: rotation(0, 0, 0.12),
  }),
  pose('t-pose', {}),
  pose('walking', {
    hips: rotation(0, 0.08, 0),
    chest: rotation(0, -0.1, 0),
    leftShoulder: rotation(0, 0.55, -1.25),
    rightShoulder: rotation(0, 0.55, 1.25),
    leftElbow: rotation(0, 0, -0.35),
    rightElbow: rotation(0, 0, 0.3),
    leftHip: rotation(-0.5, 0, 0),
    rightHip: rotation(0.45, 0, 0),
    leftKnee: rotation(0.45, 0, 0),
    rightKnee: rotation(0.12, 0, 0),
  }),
  pose('running', {
    hips: rotation(0.12, 0.16, 0),
    spine: rotation(-0.18, 0, 0),
    chest: rotation(-0.22, -0.16, 0),
    leftShoulder: rotation(0, 0.95, -1.1),
    rightShoulder: rotation(0, 0.95, 1.1),
    leftElbow: rotation(0, 0, -0.9),
    rightElbow: rotation(0, 0, 0.9),
    leftHip: rotation(-0.95, 0, 0),
    rightHip: rotation(0.85, 0, 0),
    leftKnee: rotation(1.15, 0, 0),
    rightKnee: rotation(0.65, 0, 0),
  }),
  pose('jumping', {
    hips: rotation(-0.1, 0, 0),
    chest: rotation(-0.12, 0, 0),
    leftShoulder: rotation(0, 0, 1.45),
    rightShoulder: rotation(0, 0, -1.45),
    leftElbow: rotation(0, 0, -0.18),
    rightElbow: rotation(0, 0, 0.18),
    leftHip: rotation(0.35, 0, 0.18),
    rightHip: rotation(0.35, 0, -0.18),
    leftKnee: rotation(0.72, 0, 0),
    rightKnee: rotation(0.72, 0, 0),
  }),
  pose('sitting', {
    hips: rotation(-0.08, 0, 0),
    spine: rotation(0.12, 0, 0),
    leftShoulder: rotation(0, 0, -1.3),
    rightShoulder: rotation(0, 0, 1.3),
    leftHip: rotation(-1.35, 0, 0.08),
    rightHip: rotation(-1.35, 0, -0.08),
    leftKnee: rotation(1.45, 0, 0),
    rightKnee: rotation(1.45, 0, 0),
    leftAnkle: rotation(-0.25, 0, 0),
    rightAnkle: rotation(-0.25, 0, 0),
  }),
  pose('crouching', {
    hips: rotation(0.3, 0, 0),
    spine: rotation(-0.25, 0, 0),
    chest: rotation(-0.25, 0, 0),
    leftShoulder: rotation(0, 0, -1.15),
    rightShoulder: rotation(0, 0, 1.15),
    leftHip: rotation(-0.75, 0, 0.12),
    rightHip: rotation(-0.75, 0, -0.12),
    leftKnee: rotation(1.45, 0, 0),
    rightKnee: rotation(1.45, 0, 0),
    leftAnkle: rotation(-0.55, 0, 0),
    rightAnkle: rotation(-0.55, 0, 0),
  }),
  pose('kneeling', {
    hips: rotation(0.08, 0, 0),
    leftShoulder: rotation(0, 0, -1.3),
    rightShoulder: rotation(0, 0, 1.3),
    leftHip: rotation(-0.45, 0, 0.08),
    rightHip: rotation(-0.95, 0, -0.08),
    leftKnee: rotation(0.95, 0, 0),
    rightKnee: rotation(1.65, 0, 0),
    rightAnkle: rotation(-0.7, 0, 0),
  }),
  pose('falling', {
    hips: rotation(0.15, 0, 0.35),
    spine: rotation(-0.2, 0.12, -0.18),
    chest: rotation(-0.18, -0.2, -0.12),
    leftShoulder: rotation(0, -0.35, -0.55),
    rightShoulder: rotation(0, 0.25, 0.35),
    leftElbow: rotation(0, 0, -0.45),
    rightElbow: rotation(0, 0, 0.65),
    leftHip: rotation(-0.45, 0, 0.2),
    rightHip: rotation(0.25, 0, -0.18),
    leftKnee: rotation(0.85, 0, 0),
    rightKnee: rotation(0.35, 0, 0),
  }),
  pose('waving', {
    chest: rotation(0, -0.12, 0),
    leftShoulder: rotation(0, 0, -1.32),
    rightShoulder: rotation(0, 0, -1.25),
    leftElbow: rotation(0, 0, -0.12),
    rightElbow: rotation(0, 0, 1.05),
    rightWrist: rotation(0, 0, -0.35),
    head: rotation(0, -0.18, 0),
  }),
  pose('thinking', {
    hips: rotation(0, -0.12, 0),
    chest: rotation(-0.08, 0.18, 0),
    leftShoulder: rotation(0, 0, -1.25),
    rightShoulder: rotation(0.35, -0.1, 0.95),
    leftElbow: rotation(0, 0, -0.15),
    rightElbow: rotation(0, 0, 1.25),
    rightWrist: rotation(0.25, 0, -0.2),
    head: rotation(-0.18, -0.2, 0.08),
  }),
  pose('fighting', {
    hips: rotation(0.05, -0.22, 0),
    spine: rotation(-0.12, 0.12, 0),
    chest: rotation(-0.12, 0.28, 0),
    leftShoulder: rotation(0.25, -0.15, -0.72),
    rightShoulder: rotation(-0.15, 0.2, 0.68),
    leftElbow: rotation(0, 0, -1.05),
    rightElbow: rotation(0, 0, 1.1),
    leftHip: rotation(-0.28, 0, 0.15),
    rightHip: rotation(0.18, 0, -0.18),
    leftKnee: rotation(0.55, 0, 0),
    rightKnee: rotation(0.3, 0, 0),
  }),
];

function pose(
  poseId: string,
  overrides: Partial<Record<ThreeReferenceMannequinJointId, ThreeReferenceEuler>>,
): ThreeReferenceRuntimePosePreset {
  return {
    poseId,
    labelKey: `preview.model.posePreset.${poseId}`,
    joints: JOINT_HIERARCHY.map(([jointId]) => ({
      jointId,
      rotation: overrides[jointId] ?? ZERO_ROTATION,
    })),
  };
}

function rotation(x: number, y: number, z: number): ThreeReferenceEuler {
  return { x, y, z, order: 'XYZ' };
}

function jointConstraint(jointId: ThreeReferenceMannequinJointId): {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
} {
  switch (jointId) {
    case 'head':
      return { min: { x: -0.7, y: -1, z: -0.6 }, max: { x: 0.7, y: 1, z: 0.6 } };
    case 'leftKnee':
    case 'rightKnee':
      return { min: { x: -0.15, y: -0.2, z: -0.2 }, max: { x: 1.9, y: 0.2, z: 0.2 } };
    case 'leftElbow':
    case 'rightElbow':
      return { min: { x: -0.35, y: -0.35, z: -1.8 }, max: { x: 0.35, y: 0.35, z: 1.8 } };
    case 'leftAnkle':
    case 'rightAnkle':
    case 'leftWrist':
    case 'rightWrist':
      return { min: { x: -0.9, y: -0.9, z: -0.9 }, max: { x: 0.9, y: 0.9, z: 0.9 } };
    default:
      return { min: { x: -1.8, y: -1.8, z: -1.8 }, max: { x: 1.8, y: 1.8, z: 1.8 } };
  }
}
