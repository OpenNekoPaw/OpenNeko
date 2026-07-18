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
    case '3d-reference/capture-requested':
      return isNonEmptyString(value['requestId']) &&
        isThreeReferenceIdentity(value['identity']) &&
        isThreeReferencePurpose(value['purpose'])
        ? {
            type: '3d-reference/capture-requested',
            requestId: value['requestId'],
            identity: value['identity'],
            purpose: value['purpose'],
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
