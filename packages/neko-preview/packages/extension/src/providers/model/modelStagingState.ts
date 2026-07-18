import {
  MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
  isModelPreviewStagingState,
  type ModelPreviewStagingState,
} from '@neko/shared';

export function createDefaultModelStagingState(
  sessionId: string,
  sourceFingerprint: string,
): ModelPreviewStagingState {
  return {
    schemaVersion: MODEL_PREVIEW_STAGING_SCHEMA_VERSION,
    sessionId,
    sourceFingerprint,
    revision: 0,
    transformPatches: [],
    cameraPresets: [
      {
        id: 'camera-default',
        label: 'Default',
        position: { x: 3, y: 2, z: 3 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
      },
      {
        id: 'camera-front',
        label: 'Front',
        position: { x: 0, y: 0.15, z: 3.5 },
        target: { x: 0, y: 0, z: 0 },
        fieldOfViewDeg: 45,
      },
    ],
    activeCameraId: 'camera-front',
    lightRig: {
      environmentIntensity: 0.7,
      lights: [
        { id: 'key', color: '#ffffff', intensity: 3, position: { x: 3, y: 4, z: 4 } },
        { id: 'fill', color: '#b8d8ff', intensity: 1.2, position: { x: -3, y: 2, z: 2 } },
        { id: 'rim', color: '#ffd2a8', intensity: 1.8, position: { x: 0, y: 3, z: -4 } },
      ],
    },
    background: '#f5f6f8',
    capture: { width: 1024, height: 1024 },
  };
}

export function restoreModelStagingState(
  value: unknown,
  sessionId: string,
  sourceFingerprint: string,
): ModelPreviewStagingState | undefined {
  if (!isModelPreviewStagingState(value)) return undefined;
  if (
    value.schemaVersion !== MODEL_PREVIEW_STAGING_SCHEMA_VERSION ||
    value.sourceFingerprint !== sourceFingerprint
  ) {
    return undefined;
  }
  return { ...value, sessionId, revision: 0 };
}

export function modelStagingStateKey(sourceFingerprint: string): string {
  return `neko.preview.model.staging.v${MODEL_PREVIEW_STAGING_SCHEMA_VERSION}:${sourceFingerprint}`;
}
