import {
  THREE_REFERENCE_PROTOCOL_VERSION,
  isNormalizedModelFacts,
  isThreeReferenceDiagnostic,
  isThreeReferenceIdentity,
  isThreeReferencePurpose,
  isThreeReferenceStagingSnapshot,
  type ThreeReferenceWebviewMessage,
} from '@neko/shared';

export function parseThreeReferenceWebviewMessage(
  value: unknown,
): ThreeReferenceWebviewMessage | undefined {
  if (!isRecord(value) || typeof value['type'] !== 'string') return undefined;
  switch (value['type']) {
    case '3d-reference/ready':
      return value['protocolVersion'] === THREE_REFERENCE_PROTOCOL_VERSION &&
        isNonEmptyString(value['sessionId'])
        ? {
            type: '3d-reference/ready',
            protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
            sessionId: value['sessionId'],
          }
        : undefined;
    case '3d-reference/load-completed':
      return isThreeReferenceIdentity(value['identity']) &&
        (value['facts'] === undefined || isNormalizedModelFacts(value['facts']))
        ? {
            type: '3d-reference/load-completed',
            identity: value['identity'],
            ...(value['facts'] === undefined ? {} : { facts: value['facts'] }),
          }
        : undefined;
    case '3d-reference/staging-changed':
      return isThreeReferenceStagingSnapshot(value['staging'])
        ? { type: '3d-reference/staging-changed', staging: value['staging'] }
        : undefined;
    case '3d-reference/preset-subject-requested':
      return isThreeReferenceIdentity(value['identity']) && isNonEmptyString(value['presetId'])
        ? {
            type: '3d-reference/preset-subject-requested',
            identity: value['identity'],
            presetId: value['presetId'],
          }
        : undefined;
    case '3d-reference/panorama-picker-requested':
      return isThreeReferenceIdentity(value['identity'])
        ? {
            type: '3d-reference/panorama-picker-requested',
            identity: value['identity'],
          }
        : undefined;
    case '3d-reference/capture-requested':
      return isNonEmptyString(value['requestId']) &&
        isThreeReferenceIdentity(value['identity']) &&
        isThreeReferencePurpose(value['purpose']) &&
        isBoundedPngDataUrl(value['imageDataUrl']) &&
        isCaptureDimension(value['width']) &&
        isCaptureDimension(value['height']) &&
        (value['poseControlMode'] === undefined ||
          value['poseControlMode'] === 'pose' ||
          value['poseControlMode'] === 'depth')
        ? {
            type: '3d-reference/capture-requested',
            requestId: value['requestId'],
            identity: value['identity'],
            purpose: value['purpose'],
            imageDataUrl: value['imageDataUrl'],
            width: value['width'],
            height: value['height'],
            ...(value['poseControlMode'] === undefined
              ? {}
              : { poseControlMode: value['poseControlMode'] }),
          }
        : undefined;
    case '3d-reference/diagnostic':
      return isThreeReferenceDiagnostic(value['diagnostic'])
        ? { type: '3d-reference/diagnostic', diagnostic: value['diagnostic'] }
        : undefined;
    default:
      return undefined;
  }
}

function isBoundedPngDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('data:image/png;base64,') &&
    value.length <= 24 * 1024 * 1024
  );
}

function isCaptureDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 64 && value <= 2048;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
