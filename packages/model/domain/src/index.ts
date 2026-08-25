import {
  isThreeReferenceStagingSnapshot,
  type ThreeReferenceStagingSnapshot,
  type ThreeReferenceSubject,
} from './three-reference.js';

export * from './model-preview.js';
export * from './three-reference.js';

export function createSourceModelStaging(
  sessionId: string,
  subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>,
): ThreeReferenceStagingSnapshot & {
  readonly subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>;
} {
  const staging: ThreeReferenceStagingSnapshot & {
    readonly subject: Extract<ThreeReferenceSubject, { readonly kind: 'source-model' }>;
  } = {
    sessionId,
    subject,
    selectedPurposes: ['appearance', 'camera'],
    camera: {
      cameraId: 'camera-front',
      position: { x: 0, y: 0.15, z: 3.5 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfViewDeg: 45,
      aspectRatio: 1,
    },
  };
  if (!isThreeReferenceStagingSnapshot(staging)) {
    throw new Error('Invalid initial 3D Reference staging for source-model.');
  }
  return staging;
}
