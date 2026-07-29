import { DEFAULT_CANVAS_DATA } from '@neko/shared';
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
  CANVAS_HOST_RUNTIME_ROUTES,
  CanvasHostRuntimeContractError,
  assertCanvasHostRuntimeIdentity,
  createCanvasHostIntentRequest,
  parseCanvasHostIntentResult,
  parseCanvasHostProjectionEvent,
  parseCanvasHostSnapshot,
} from './index';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas-view-1',
  viewEpoch: 1,
  documentId: 'canvas-document-1',
  sessionId: 'canvas-session-1',
  endpointEpoch: 'endpoint-1',
} as const;

describe('Canvas Host runtime contract', () => {
  it('builds revision-bound intents and parses authoritative snapshots', () => {
    const request = createCanvasHostIntentRequest({
      requestId: 'request-1',
      commandId: 'command-1',
      expectedRevision: 4,
      identity,
      intent: {
        type: 'project-content',
        locator: { kind: 'workspace-file', path: 'assets/cat.png' },
      },
    });
    const snapshot = parseCanvasHostSnapshot(validSnapshot());

    expect(request.expectedRevision).toBe(4);
    expect(request.identity.documentId).toBe('canvas-document-1');
    expect(snapshot.canvas.name).toBe(DEFAULT_CANVAS_DATA.name);
  });

  it('rejects unknown versions, absolute identities and stale sessions', () => {
    expect(() => parseCanvasHostSnapshot({ ...validSnapshot(), schemaVersion: 2 })).toThrowError(
      expect.objectContaining<Partial<CanvasHostRuntimeContractError>>({
        code: 'unsupported-canvas-host-runtime-version',
      }),
    );
    expect(() =>
      parseCanvasHostSnapshot({
        ...validSnapshot(),
        identity: { ...identity, documentId: '/Users/private/project.nkc' },
      }),
    ).toThrowError(CanvasHostRuntimeContractError);
    expect(() =>
      assertCanvasHostRuntimeIdentity(identity, {
        ...identity,
        sessionId: 'canvas-session-2',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CanvasHostRuntimeContractError>>({
        code: 'canvas-host-runtime-stale-identity',
      }),
    );
  });

  it('matches response request/command identity and validates projection events', () => {
    expect(
      parseCanvasHostIntentResult(
        {
          schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
          requestId: 'request-1',
          commandId: 'command-1',
          status: 'accepted',
          snapshot: validSnapshot(),
        },
        'request-1',
        'command-1',
      ).status,
    ).toBe('accepted');
    expect(() =>
      parseCanvasHostIntentResult(
        {
          schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
          requestId: 'request-other',
          commandId: 'command-1',
          status: 'accepted',
          snapshot: validSnapshot(),
        },
        'request-1',
        'command-1',
      ),
    ).toThrowError(CanvasHostRuntimeContractError);
    expect(
      parseCanvasHostProjectionEvent({
        schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
        sequence: 1,
        snapshot: validSnapshot(),
      }).sequence,
    ).toBe(1);
  });

  it('covers every fixed Canvas Host route', () => {
    expect(Object.values(CANVAS_HOST_RUNTIME_ROUTES).sort()).toEqual(
      ['intent.execute', 'projection.event', 'snapshot.get'].sort(),
    );
  });
});

function validSnapshot() {
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    identity,
    revision: 4,
    dirty: false,
    canvas: DEFAULT_CANVAS_DATA,
    presentation: {
      viewport: {
        pan: { x: 0, y: 0 },
        zoom: 1,
      },
      selectedNodeIds: [],
    },
  };
}
