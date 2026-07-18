import {
  THREE_REFERENCE_STAGING_SCHEMA_VERSION,
  isThreeReferenceStagingSnapshot,
  type ThreeReferenceEnvironment,
  type ThreeReferenceStagingSnapshot,
  type ThreeReferenceSubject,
} from '@neko/shared';
import type { ThreeReferencePresetCatalogEntry } from './threeReferencePresetCatalog';

const FRONT_CAMERA = {
  cameraId: 'camera-front',
  position: { x: 0, y: 0.15, z: 3.5 },
  target: { x: 0, y: 0, z: 0 },
  fieldOfViewDeg: 45,
  aspectRatio: 1,
} as const;

export function createSourceModelStaging(
  sessionId: string,
  subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>,
): ThreeReferenceStagingSnapshot {
  return assertValidStaging(createBaseStaging(sessionId, subject, ['appearance', 'camera']));
}

export function createBuiltinPresetStaging(
  sessionId: string,
  preset: ThreeReferencePresetCatalogEntry,
  environment?: ThreeReferenceEnvironment,
): ThreeReferenceStagingSnapshot {
  const subject: Extract<ThreeReferenceSubject, { readonly kind: 'builtin-preset' }> = {
    kind: 'builtin-preset',
    presetId: preset.presetId,
    presetVersion: preset.presetVersion,
    fingerprint: preset.fingerprint,
    presetKind: preset.presetKind,
    appearancePolicy: preset.appearancePolicy,
    allowedPurposes: preset.allowedPurposes,
  };
  const staging = createBaseStaging(sessionId, subject, preset.allowedPurposes);
  const withPose = preset.allowedPurposes.includes('pose')
    ? {
        ...staging,
        pose: { poseId: preset.poseCapabilities?.posePresetIds[0] ?? 'standing', joints: [] },
      }
    : staging;
  const result = environment ? { ...withPose, environment } : withPose;
  return assertValidStaging(result);
}

export function createEnvironmentOnlyStaging(
  sessionId: string,
  environment?: ThreeReferenceEnvironment,
): ThreeReferenceStagingSnapshot {
  return assertValidStaging(
    createBaseStaging(
      sessionId,
      { kind: 'environment-only' },
      environment ? ['panorama-scene'] : ['camera'],
      environment,
    ),
  );
}

export function restoreThreeReferenceStaging(
  value: unknown,
  sessionId: string,
  subject: ThreeReferenceSubject,
): ThreeReferenceStagingSnapshot | undefined {
  if (!isThreeReferenceStagingSnapshot(value) || !sameSubject(value.subject, subject)) {
    return undefined;
  }
  return { ...value, sessionId, revision: 0, subject };
}

export function threeReferenceStagingStateKey(subject: ThreeReferenceSubject): string {
  return `neko.preview.3d-reference.staging.v${THREE_REFERENCE_STAGING_SCHEMA_VERSION}:${subjectKey(subject)}`;
}

function createBaseStaging(
  sessionId: string,
  subject: ThreeReferenceSubject,
  selectedPurposes: ThreeReferenceStagingSnapshot['selectedPurposes'],
  environment?: ThreeReferenceEnvironment,
): ThreeReferenceStagingSnapshot {
  const staging: ThreeReferenceStagingSnapshot = {
    schemaVersion: THREE_REFERENCE_STAGING_SCHEMA_VERSION,
    sessionId,
    revision: 0,
    subject,
    selectedPurposes,
    camera: FRONT_CAMERA,
    ...(environment ? { environment } : {}),
  };
  return staging;
}

function assertValidStaging(staging: ThreeReferenceStagingSnapshot): ThreeReferenceStagingSnapshot {
  if (!isThreeReferenceStagingSnapshot(staging)) {
    throw new Error(`Invalid initial 3D Reference staging for ${staging.subject.kind}.`);
  }
  return staging;
}

function sameSubject(left: ThreeReferenceSubject, right: ThreeReferenceSubject): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'source-model':
      return (
        right.kind === 'source-model' &&
        left.source.id === right.source.id &&
        left.fingerprint === right.fingerprint &&
        left.format === right.format
      );
    case 'builtin-preset':
      return (
        right.kind === 'builtin-preset' &&
        left.presetId === right.presetId &&
        left.presetVersion === right.presetVersion &&
        left.fingerprint === right.fingerprint
      );
    case 'environment-only':
      return right.kind === 'environment-only';
  }
  throw new Error('Unknown 3D Reference subject kind.');
}

function subjectKey(subject: ThreeReferenceSubject): string {
  switch (subject.kind) {
    case 'source-model':
      return `source:${subject.fingerprint}`;
    case 'builtin-preset':
      return `preset:${subject.presetId}:${subject.presetVersion}:${subject.fingerprint}`;
    case 'environment-only':
      return 'environment-only';
  }
  throw new Error('Unknown 3D Reference subject kind.');
}
