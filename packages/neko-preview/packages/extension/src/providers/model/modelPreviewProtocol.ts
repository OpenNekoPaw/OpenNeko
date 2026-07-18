import {
  MODEL_PREVIEW_PROTOCOL_VERSION,
  isModelPreviewCaptureResult,
  isModelPreviewIdentity,
  isModelPreviewStagingState,
  isNormalizedModelFacts,
  type ModelPreviewWebviewMessage,
} from '@neko/shared';

export function parseModelPreviewWebviewMessage(
  value: unknown,
): ModelPreviewWebviewMessage | undefined {
  if (!isRecord(value) || typeof value['type'] !== 'string') return undefined;
  switch (value['type']) {
    case 'model-preview/ready':
      return value['protocolVersion'] === MODEL_PREVIEW_PROTOCOL_VERSION &&
        isNonEmptyString(value['sessionId'])
        ? {
            type: 'model-preview/ready',
            protocolVersion: MODEL_PREVIEW_PROTOCOL_VERSION,
            sessionId: value['sessionId'],
          }
        : undefined;
    case 'model-preview/load-completed':
      return isModelPreviewIdentity(value['identity']) && isNormalizedModelFacts(value['facts'])
        ? {
            type: 'model-preview/load-completed',
            identity: value['identity'],
            facts: value['facts'],
          }
        : undefined;
    case 'model-preview/state-changed':
      return isModelPreviewStagingState(value['staging'])
        ? { type: 'model-preview/state-changed', staging: value['staging'] }
        : undefined;
    case 'model-preview/capture-completed':
      return isNonEmptyString(value['requestId']) && isModelPreviewCaptureResult(value['capture'])
        ? {
            type: 'model-preview/capture-completed',
            requestId: value['requestId'],
            capture: value['capture'],
          }
        : undefined;
    case 'model-preview/send-requested':
      return isModelPreviewIdentity(value['identity'])
        ? { type: 'model-preview/send-requested', identity: value['identity'] }
        : undefined;
    case 'model-preview/diagnostic':
      return isDiagnostic(value['diagnostic'])
        ? { type: 'model-preview/diagnostic', diagnostic: value['diagnostic'] }
        : undefined;
    default:
      return undefined;
  }
}

function isDiagnostic(
  value: unknown,
): value is Extract<
  ModelPreviewWebviewMessage,
  { readonly type: 'model-preview/diagnostic' }
>['diagnostic'] {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    (value['severity'] === 'info' ||
      value['severity'] === 'warning' ||
      value['severity'] === 'error')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
