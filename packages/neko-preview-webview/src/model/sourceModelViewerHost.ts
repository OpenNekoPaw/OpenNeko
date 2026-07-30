import {
  THREE_REFERENCE_PROTOCOL_VERSION,
  type ModelPreviewSourceDescriptor,
  type ThreeReferenceHostMessage,
  type ThreeReferencePanelSubject,
} from '@neko/shared';
import { createSourceModelStaging } from '@neko-preview/contracts';
import type { ModelViewerHostPort } from './modelViewerHost';

export function createSourceModelViewerHost(input: {
  readonly sessionId: string;
  readonly source: ModelPreviewSourceDescriptor;
}): ModelViewerHostPort {
  const panelSubject = createSourceModelPanelSubject(input.source);
  const staging = createSourceModelStaging(input.sessionId, panelSubject.subject);
  const listeners = new Set<(message: unknown) => void>();
  let state: Record<string, unknown> | null = null;
  let initialized = false;
  let subscriptionEpoch = 0;
  return {
    postMessage(message) {
      if (!isRecord(message) || typeof message['type'] !== 'string') {
        throw new Error('Model Viewer emitted an invalid Host message.');
      }
      switch (message['type']) {
        case '3d-reference/ready': {
          if (!isReadyMessage(message)) {
            throw new Error('Model Viewer emitted an invalid ready message.');
          }
          if (message.sessionId !== input.sessionId) {
            throw new Error('Model Viewer ready identity does not match the source session.');
          }
          if (initialized) return;
          initialized = true;
          const readyEpoch = subscriptionEpoch;
          const init: ThreeReferenceHostMessage = {
            type: '3d-reference/session-init',
            protocolVersion: THREE_REFERENCE_PROTOCOL_VERSION,
            panelSubject,
            availablePresets: [],
            eligiblePurposes: [],
            staging,
          };
          queueMicrotask(() => {
            if (!initialized || readyEpoch !== subscriptionEpoch) return;
            for (const listener of listeners) listener(init);
          });
          return;
        }
        case '3d-reference/load-completed':
        case '3d-reference/staging-changed':
        case '3d-reference/diagnostic':
          return;
        case '3d-reference/capture-requested':
        case '3d-reference/panorama-picker-requested':
        case '3d-reference/preset-subject-requested':
          throw new Error(`Desktop source Preview does not implement '${message['type']}' yet.`);
        default:
          throw new Error(`Model Viewer emitted unknown Host message '${message['type']}'.`);
      }
    },
    getState() {
      return state;
    },
    setState(next) {
      state = isRecord(next) ? next : null;
    },
    subscribe(listener) {
      subscriptionEpoch += 1;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          initialized = false;
          subscriptionEpoch += 1;
        }
      };
    },
  };
}

function createSourceModelPanelSubject(
  source: ModelPreviewSourceDescriptor,
): Extract<ThreeReferencePanelSubject, { readonly kind: 'source-model' }> {
  return {
    kind: 'source-model',
    subject: {
      kind: 'source-model',
      source: source.source,
      fingerprint: source.sourceFingerprint,
      format: source.format,
    },
    runtime: {
      source: source.source,
      fingerprint: source.sourceFingerprint,
      format: source.format,
      entryUri: source.entryUri,
      uriMap: source.uriMap,
      sizeBytes: source.sizeBytes,
    },
  };
}

function isReadyMessage(value: unknown): value is {
  readonly type: '3d-reference/ready';
  readonly protocolVersion: typeof THREE_REFERENCE_PROTOCOL_VERSION;
  readonly sessionId: string;
} {
  return (
    isRecord(value) &&
    value['type'] === '3d-reference/ready' &&
    value['protocolVersion'] === THREE_REFERENCE_PROTOCOL_VERSION &&
    typeof value['sessionId'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
