import {
  isModelPreviewFormat,
  type ModelPreviewFormat,
  type NormalizedModelFacts,
} from './model-preview.js';
import { isResourceRef, type ResourceRef } from './resource-cache.js';

export const THREE_REFERENCE_CONTEXT_VERSION = 1 as const;
export const THREE_REFERENCE_PROTOCOL_VERSION = 1 as const;
export const THREE_REFERENCE_STAGING_SCHEMA_VERSION = 1 as const;

export const THREE_REFERENCE_PURPOSES = ['appearance', 'pose', 'camera', 'panorama-scene'] as const;
export type ThreeReferencePurpose = (typeof THREE_REFERENCE_PURPOSES)[number];

export type ThreeReferencePresetKind = 'mannequin' | 'prop' | 'environment' | 'panorama-grid';
export type ThreeReferenceAppearancePolicy = 'guide-only' | 'appearance-capable';

export interface ThreeReferenceIdentity {
  readonly sessionId: string;
  readonly revision: number;
}

export interface ThreeReferenceVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ThreeReferenceEuler {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly order: 'XYZ';
}

export interface ThreeReferencePresetIdentity {
  readonly presetId: string;
  readonly presetVersion: number;
  readonly fingerprint: string;
  readonly presetKind: ThreeReferencePresetKind;
  readonly appearancePolicy: ThreeReferenceAppearancePolicy;
  readonly allowedPurposes: readonly ThreeReferencePurpose[];
}

export type ThreeReferenceSubject =
  | {
      readonly kind: 'source-model';
      readonly source: ResourceRef;
      readonly fingerprint: string;
      readonly format: ModelPreviewFormat;
    }
  | ({ readonly kind: 'builtin-preset' } & ThreeReferencePresetIdentity)
  | { readonly kind: 'environment-only' };

export interface ThreeReferenceJointPose {
  readonly jointId: string;
  readonly rotation: ThreeReferenceEuler;
}

export interface ThreeReferencePoseState {
  readonly poseId: string;
  readonly joints: readonly ThreeReferenceJointPose[];
}

export interface ThreeReferenceCamera {
  readonly cameraId: string;
  readonly position: ThreeReferenceVector3;
  readonly target: ThreeReferenceVector3;
  readonly fieldOfViewDeg: number;
  readonly aspectRatio: number;
}

export interface ThreeReferencePanoramaOrientation {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly fieldOfViewDeg: number;
}

export interface ThreeReferenceEnvironment {
  readonly source: ResourceRef;
  readonly fingerprint: string;
  readonly orientation: ThreeReferencePanoramaOrientation;
}

export interface ThreeReferenceSourceRuntimeDescriptor {
  readonly source: ResourceRef;
  readonly fingerprint: string;
  readonly format: ModelPreviewFormat;
  readonly entryUri: string;
  readonly uriMap: Readonly<Record<string, string>>;
  readonly sizeBytes: number;
}

export type ThreeReferencePanelSubject =
  | {
      readonly kind: 'source-model';
      readonly subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>;
      readonly runtime: ThreeReferenceSourceRuntimeDescriptor;
    }
  | {
      readonly kind: 'builtin-preset';
      readonly subject: Extract<ThreeReferenceSubject, { readonly kind: 'builtin-preset' }>;
    }
  | {
      readonly kind: 'environment-only';
      readonly subject: Extract<ThreeReferenceSubject, { readonly kind: 'environment-only' }>;
    };

export interface ThreeReferenceStagingSnapshot extends ThreeReferenceIdentity {
  readonly schemaVersion: typeof THREE_REFERENCE_STAGING_SCHEMA_VERSION;
  readonly subject: ThreeReferenceSubject;
  readonly environment?: ThreeReferenceEnvironment;
  readonly selectedPurposes: readonly ThreeReferencePurpose[];
  readonly camera: ThreeReferenceCamera;
  readonly pose?: ThreeReferencePoseState;
}

interface ThreeReferenceOutputIdentity extends ThreeReferenceIdentity {}

export type ThreeReferenceOutput =
  | (ThreeReferenceOutputIdentity & {
      readonly kind: 'appearance';
      readonly image: ResourceRef;
      readonly source: ResourceRef;
    })
  | (ThreeReferenceOutputIdentity & {
      readonly kind: 'pose';
      readonly controlImage: ResourceRef;
      readonly controlMode: 'pose' | 'depth';
      readonly joints: readonly ThreeReferenceJointPose[];
    })
  | (ThreeReferenceOutputIdentity & {
      readonly kind: 'camera';
      readonly camera: ThreeReferenceCamera;
      readonly compositionImage?: ResourceRef;
    })
  | (ThreeReferenceOutputIdentity & {
      readonly kind: 'panorama-scene';
      readonly panorama: ResourceRef;
      readonly orientation: ThreeReferencePanoramaOrientation;
      readonly viewportImage?: ResourceRef;
    });

export interface ThreeReferenceContextData {
  readonly contractVersion: typeof THREE_REFERENCE_CONTEXT_VERSION;
  readonly staging: ThreeReferenceStagingSnapshot;
  readonly outputs: readonly ThreeReferenceOutput[];
}

export type ThreeReferenceExtensionMessage =
  | {
      readonly type: '3d-reference/session-init';
      readonly protocolVersion: typeof THREE_REFERENCE_PROTOCOL_VERSION;
      readonly panelSubject: ThreeReferencePanelSubject;
      readonly eligiblePurposes: readonly ThreeReferencePurpose[];
      readonly staging: ThreeReferenceStagingSnapshot;
    }
  | {
      readonly type: '3d-reference/diagnostic';
      readonly diagnostic: ThreeReferenceDiagnostic;
    }
  | {
      readonly type: '3d-reference/cancel';
      readonly identity: ThreeReferenceIdentity;
      readonly reason: string;
    };

export type ThreeReferenceWebviewMessage =
  | {
      readonly type: '3d-reference/ready';
      readonly protocolVersion: typeof THREE_REFERENCE_PROTOCOL_VERSION;
      readonly sessionId: string;
    }
  | {
      readonly type: '3d-reference/load-completed';
      readonly identity: ThreeReferenceIdentity;
      readonly facts?: NormalizedModelFacts;
    }
  | {
      readonly type: '3d-reference/staging-changed';
      readonly staging: ThreeReferenceStagingSnapshot;
    }
  | {
      readonly type: '3d-reference/capture-requested';
      readonly requestId: string;
      readonly identity: ThreeReferenceIdentity;
      readonly purpose: ThreeReferencePurpose;
    }
  | {
      readonly type: '3d-reference/diagnostic';
      readonly diagnostic: ThreeReferenceDiagnostic;
    };

export const THREE_REFERENCE_DIAGNOSTIC_CODES = [
  'contract-version-unsupported',
  'staging-version-unsupported',
  'session-mismatch',
  'stale-revision',
  'subject-invalid',
  'preset-invalid',
  'purpose-unsupported',
  'purpose-role-violation',
  'output-invalid',
  'resource-invalid',
  'source-missing',
  'source-unauthorized',
  'source-unsupported',
  'source-load-failed',
  'panorama-load-failed',
  'protocol-mismatch',
  'renderer-unavailable',
  'renderer-lost',
  'cancelled',
  'disposed',
] as const;
export type ThreeReferenceDiagnosticCode = (typeof THREE_REFERENCE_DIAGNOSTIC_CODES)[number];

export interface ThreeReferenceDiagnostic {
  readonly code: ThreeReferenceDiagnosticCode;
  readonly message: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly identity?: Partial<ThreeReferenceIdentity>;
  readonly purpose?: ThreeReferencePurpose;
}

export function isThreeReferencePurpose(value: unknown): value is ThreeReferencePurpose {
  return THREE_REFERENCE_PURPOSES.some((purpose) => purpose === value);
}

export function isThreeReferenceIdentity(value: unknown): value is ThreeReferenceIdentity {
  return isRecord(value) && isIdentityFields(value);
}

export function isThreeReferenceSourceRuntimeDescriptor(
  value: unknown,
): value is ThreeReferenceSourceRuntimeDescriptor {
  return (
    isRecord(value) &&
    isResourceRef(value['source']) &&
    isNonEmptyString(value['fingerprint']) &&
    isModelPreviewFormat(value['format']) &&
    isNonEmptyString(value['entryUri']) &&
    isStringRecord(value['uriMap']) &&
    isNonNegativeInteger(value['sizeBytes'])
  );
}

export function isThreeReferencePanelSubject(value: unknown): value is ThreeReferencePanelSubject {
  if (!isRecord(value) || !isThreeReferenceSubject(value['subject'])) return false;
  if (value['kind'] !== value['subject'].kind) return false;
  switch (value['kind']) {
    case 'source-model':
      return (
        value['subject'].kind === 'source-model' &&
        isThreeReferenceSourceRuntimeDescriptor(value['runtime']) &&
        value['runtime'].source.id === value['subject'].source.id &&
        value['runtime'].fingerprint === value['subject'].fingerprint &&
        value['runtime'].format === value['subject'].format
      );
    case 'builtin-preset':
      return value['subject'].kind === 'builtin-preset' && value['runtime'] === undefined;
    case 'environment-only':
      return value['subject'].kind === 'environment-only' && value['runtime'] === undefined;
    default:
      return false;
  }
}

export function isThreeReferenceDiagnostic(value: unknown): value is ThreeReferenceDiagnostic {
  if (!isRecord(value)) return false;
  const identity = value['identity'];
  return (
    THREE_REFERENCE_DIAGNOSTIC_CODES.some((code) => code === value['code']) &&
    isNonEmptyString(value['message']) &&
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error') &&
    (identity === undefined || isPartialThreeReferenceIdentity(identity)) &&
    (value['purpose'] === undefined || isThreeReferencePurpose(value['purpose']))
  );
}

export function isThreeReferenceContextData(value: unknown): value is ThreeReferenceContextData {
  if (!isRecord(value) || value['contractVersion'] !== THREE_REFERENCE_CONTEXT_VERSION) {
    return false;
  }
  if (!isThreeReferenceStagingSnapshot(value['staging'])) return false;
  if (!isArrayOf(value['outputs'], isThreeReferenceOutput) || value['outputs'].length === 0) {
    return false;
  }

  const staging = value['staging'];
  const outputKinds = value['outputs'].map((output) => output.kind);
  if (!sameUniquePurposes(staging.selectedPurposes, outputKinds)) return false;

  return value['outputs'].every(
    (output) =>
      output.sessionId === staging.sessionId &&
      output.revision === staging.revision &&
      outputMatchesStaging(output, staging),
  );
}

export function isThreeReferenceStagingSnapshot(
  value: unknown,
): value is ThreeReferenceStagingSnapshot {
  if (
    !isRecord(value) ||
    value['schemaVersion'] !== THREE_REFERENCE_STAGING_SCHEMA_VERSION ||
    !isIdentityFields(value) ||
    !isThreeReferenceSubject(value['subject']) ||
    !isArrayOf(value['selectedPurposes'], isThreeReferencePurpose) ||
    value['selectedPurposes'].length === 0 ||
    !isUnique(value['selectedPurposes']) ||
    !isThreeReferenceCamera(value['camera']) ||
    (value['pose'] !== undefined && !isThreeReferencePoseState(value['pose'])) ||
    (value['environment'] !== undefined && !isThreeReferenceEnvironment(value['environment']))
  ) {
    return false;
  }

  const subject = value['subject'];
  if (
    subject.kind === 'builtin-preset' &&
    !value['selectedPurposes'].every((purpose) => subject.allowedPurposes.includes(purpose))
  ) {
    return false;
  }
  if (value['selectedPurposes'].includes('pose') && value['pose'] === undefined) return false;
  if (value['selectedPurposes'].includes('panorama-scene') && value['environment'] === undefined) {
    return false;
  }
  return true;
}

export function isThreeReferenceSubject(value: unknown): value is ThreeReferenceSubject {
  if (!isRecord(value)) return false;
  switch (value['kind']) {
    case 'source-model':
      return (
        isResourceRef(value['source']) &&
        isNonEmptyString(value['fingerprint']) &&
        isModelPreviewFormat(value['format'])
      );
    case 'builtin-preset':
      return isThreeReferencePresetIdentity(value);
    case 'environment-only':
      return true;
    default:
      return false;
  }
}

export function isThreeReferenceOutput(value: unknown): value is ThreeReferenceOutput {
  if (!isRecord(value) || !isIdentityFields(value)) return false;
  switch (value['kind']) {
    case 'appearance':
      return isResourceRef(value['image']) && isResourceRef(value['source']);
    case 'pose':
      return (
        isResourceRef(value['controlImage']) &&
        (value['controlMode'] === 'pose' || value['controlMode'] === 'depth') &&
        isArrayOf(value['joints'], isThreeReferenceJointPose)
      );
    case 'camera':
      return (
        isThreeReferenceCamera(value['camera']) &&
        (value['compositionImage'] === undefined || isResourceRef(value['compositionImage']))
      );
    case 'panorama-scene':
      return (
        isResourceRef(value['panorama']) &&
        isThreeReferencePanoramaOrientation(value['orientation']) &&
        (value['viewportImage'] === undefined || isResourceRef(value['viewportImage']))
      );
    default:
      return false;
  }
}

function isThreeReferencePresetIdentity(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value['presetId']) &&
    isPositiveInteger(value['presetVersion']) &&
    isNonEmptyString(value['fingerprint']) &&
    (value['presetKind'] === 'mannequin' ||
      value['presetKind'] === 'prop' ||
      value['presetKind'] === 'environment' ||
      value['presetKind'] === 'panorama-grid') &&
    (value['appearancePolicy'] === 'guide-only' ||
      value['appearancePolicy'] === 'appearance-capable') &&
    isArrayOf(value['allowedPurposes'], isThreeReferencePurpose) &&
    value['allowedPurposes'].length > 0 &&
    isUnique(value['allowedPurposes']) &&
    (value['appearancePolicy'] === 'appearance-capable' ||
      !value['allowedPurposes'].includes('appearance'))
  );
}

function isIdentityFields(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value['sessionId']) && isNonNegativeInteger(value['revision']);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isPartialThreeReferenceIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['sessionId'] === undefined || isNonEmptyString(value['sessionId'])) &&
    (value['revision'] === undefined || isNonNegativeInteger(value['revision']))
  );
}

function isThreeReferencePoseState(value: unknown): value is ThreeReferencePoseState {
  return (
    isRecord(value) &&
    isNonEmptyString(value['poseId']) &&
    isArrayOf(value['joints'], isThreeReferenceJointPose)
  );
}

function isThreeReferenceJointPose(value: unknown): value is ThreeReferenceJointPose {
  return (
    isRecord(value) &&
    isNonEmptyString(value['jointId']) &&
    isThreeReferenceEuler(value['rotation'])
  );
}

function isThreeReferenceCamera(value: unknown): value is ThreeReferenceCamera {
  return (
    isRecord(value) &&
    isNonEmptyString(value['cameraId']) &&
    isThreeReferenceVector3(value['position']) &&
    isThreeReferenceVector3(value['target']) &&
    isFiniteNumber(value['fieldOfViewDeg']) &&
    value['fieldOfViewDeg'] >= 10 &&
    value['fieldOfViewDeg'] <= 120 &&
    isFiniteNumber(value['aspectRatio']) &&
    value['aspectRatio'] > 0
  );
}

function isThreeReferenceEnvironment(value: unknown): value is ThreeReferenceEnvironment {
  return (
    isRecord(value) &&
    isResourceRef(value['source']) &&
    isNonEmptyString(value['fingerprint']) &&
    isThreeReferencePanoramaOrientation(value['orientation'])
  );
}

function isThreeReferencePanoramaOrientation(
  value: unknown,
): value is ThreeReferencePanoramaOrientation {
  return (
    isRecord(value) &&
    isFiniteNumber(value['yawDeg']) &&
    isFiniteNumber(value['pitchDeg']) &&
    value['pitchDeg'] >= -90 &&
    value['pitchDeg'] <= 90 &&
    isFiniteNumber(value['fieldOfViewDeg']) &&
    value['fieldOfViewDeg'] >= 10 &&
    value['fieldOfViewDeg'] <= 120
  );
}

function isThreeReferenceVector3(value: unknown): value is ThreeReferenceVector3 {
  return (
    isRecord(value) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isFiniteNumber(value['z'])
  );
}

function isThreeReferenceEuler(value: unknown): value is ThreeReferenceEuler {
  return (
    isRecord(value) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isFiniteNumber(value['z']) &&
    value['order'] === 'XYZ'
  );
}

function outputMatchesStaging(
  output: ThreeReferenceOutput,
  staging: ThreeReferenceStagingSnapshot,
): boolean {
  switch (output.kind) {
    case 'pose':
      return staging.pose !== undefined && sameJointPoses(output.joints, staging.pose.joints);
    case 'camera':
      return sameCamera(output.camera, staging.camera);
    case 'panorama-scene':
      return (
        staging.environment !== undefined &&
        output.panorama.id === staging.environment.source.id &&
        samePanoramaOrientation(output.orientation, staging.environment.orientation)
      );
    case 'appearance':
      return staging.subject.kind !== 'environment-only';
  }
}

function sameJointPoses(
  outputs: readonly ThreeReferenceJointPose[],
  staging: readonly ThreeReferenceJointPose[],
): boolean {
  if (outputs.length !== staging.length) return false;
  return outputs.every((output) => {
    const staged = staging.find((candidate) => candidate.jointId === output.jointId);
    return staged !== undefined && sameEuler(output.rotation, staged.rotation);
  });
}

function sameCamera(left: ThreeReferenceCamera, right: ThreeReferenceCamera): boolean {
  return (
    left.cameraId === right.cameraId &&
    sameVector3(left.position, right.position) &&
    sameVector3(left.target, right.target) &&
    left.fieldOfViewDeg === right.fieldOfViewDeg &&
    left.aspectRatio === right.aspectRatio
  );
}

function samePanoramaOrientation(
  left: ThreeReferencePanoramaOrientation,
  right: ThreeReferencePanoramaOrientation,
): boolean {
  return (
    left.yawDeg === right.yawDeg &&
    left.pitchDeg === right.pitchDeg &&
    left.fieldOfViewDeg === right.fieldOfViewDeg
  );
}

function sameVector3(left: ThreeReferenceVector3, right: ThreeReferenceVector3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function sameEuler(left: ThreeReferenceEuler, right: ThreeReferenceEuler): boolean {
  return (
    left.x === right.x && left.y === right.y && left.z === right.z && left.order === right.order
  );
}

function sameUniquePurposes(
  selectedPurposes: readonly ThreeReferencePurpose[],
  outputKinds: readonly ThreeReferencePurpose[],
): boolean {
  if (!isUnique(outputKinds) || selectedPurposes.length !== outputKinds.length) return false;
  return selectedPurposes.every((purpose) => outputKinds.includes(purpose));
}

function isUnique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}
