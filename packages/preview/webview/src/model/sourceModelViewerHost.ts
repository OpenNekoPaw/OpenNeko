import {
  isThreeReferenceStagingSnapshot,
  type ModelPreviewSourceDescriptor,
  type ThreeReferenceDiagnostic,
  type ThreeReferenceHostMessage,
  type ThreeReferencePanelSubject,
  type ThreeReferenceStagingSnapshot,
} from '@neko/preview-domain';
import { contentLocatorsEqual } from '@neko/content';
import { createSourceModelStaging } from '@neko/preview-domain';
import type { ModelViewerHostPort } from './modelViewerHost';

export function createSourceModelViewerHost(input: {
  readonly sessionId: string;
  readonly source: ModelPreviewSourceDescriptor;
}): ModelViewerHostPort {
  const panelSubject = createSourceModelPanelSubject(input.source);
  const initialStaging = createSourceModelStaging(input.sessionId, panelSubject.subject);
  const listeners = new Set<(message: unknown) => void>();
  let state: unknown = null;
  let initialized = false;
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
          if (message.identity.sessionId !== input.sessionId) {
            throw new Error('Model Viewer ready identity does not match the source session.');
          }
          if (initialized) return;
          initialized = true;
          const restored = restoreStaging(state, initialStaging, panelSubject);
          const init: ThreeReferenceHostMessage = {
            type: '3d-reference/session-init',
            identity: message.identity,
            panelSubject,
            availablePresets: [],
            eligiblePurposes: [],
            staging: restored.staging,
          };
          const subscribedListeners = [...listeners];
          queueMicrotask(() => {
            if (!initialized) return;
            for (const listener of subscribedListeners) {
              if (!listeners.has(listener)) continue;
              listener(init);
              if (restored.diagnostic) {
                listener({
                  type: '3d-reference/diagnostic',
                  identity: message.identity,
                  diagnostic: restored.diagnostic,
                } satisfies ThreeReferenceHostMessage);
              }
            }
          });
          return;
        }
        case '3d-reference/load-completed':
        case '3d-reference/staging-changed':
        case '3d-reference/diagnostic': {
          requireRequestIdentity(message, input.sessionId);
          return;
        }
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
      state = next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          initialized = false;
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
  readonly identity: { readonly sessionId: string; readonly requestId: string };
} {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['type', 'identity']) &&
    value['type'] === '3d-reference/ready' &&
    isRequestIdentity(value['identity'])
  );
}

function restoreStaging(
  state: unknown,
  initial: ThreeReferenceStagingSnapshot,
  panelSubject: Extract<ThreeReferencePanelSubject, { readonly kind: 'source-model' }>,
): {
  readonly staging: ThreeReferenceStagingSnapshot;
  readonly diagnostic?: ThreeReferenceDiagnostic;
} {
  if (state === null || state === undefined) return { staging: initial };
  const candidate = isRecord(state) ? state['threeReferenceStaging'] : undefined;
  if (
    isThreeReferenceStagingSnapshot(candidate) &&
    candidate.sessionId === initial.sessionId &&
    candidate.subject.kind === 'source-model' &&
    candidate.subject.fingerprint === panelSubject.subject.fingerprint &&
    contentLocatorsEqual(candidate.subject.source, panelSubject.subject.source)
  ) {
    return { staging: candidate };
  }
  return {
    staging: initial,
    diagnostic: {
      code: 'staging-invalid',
      message: 'Stored Model Preview staging does not belong to this panel and source.',
      severity: 'warning',
      identity: { sessionId: initial.sessionId },
    },
  };
}

function requireRequestIdentity(value: Record<string, unknown>, sessionId: string): void {
  if (!isRequestIdentity(value['identity']) || value['identity'].sessionId !== sessionId) {
    throw new Error('Model Viewer message does not belong to this source session request.');
  }
}

function isRequestIdentity(
  value: unknown,
): value is { readonly sessionId: string; readonly requestId: string } {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['sessionId', 'requestId']) &&
    typeof value['sessionId'] === 'string' &&
    value['sessionId'].length > 0 &&
    typeof value['requestId'] === 'string' &&
    value['requestId'].length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}
