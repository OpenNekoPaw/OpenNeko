import { DEFAULT_CANVAS_DATA } from '@neko/canvas-domain';
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
  CANVAS_HOST_RUNTIME_ROUTES,
  CanvasHostRuntimeContractError,
  assertCanvasHostRuntimeIdentity,
  createCanvasHostIntentRequest,
  parseCanvasHostIntentRequest,
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
        type: 'author-material',
        request: {
          kind: 'direct-reference',
          identity: {
            projectId: identity.projectId,
            canvasId: identity.documentId,
            canvasSessionId: identity.sessionId,
          },
          locator: { kind: 'workspace-file', path: 'assets/cat.png' },
          mediaKind: 'image',
        },
      },
    });
    const snapshot = parseCanvasHostSnapshot(validSnapshot());

    expect(request.expectedRevision).toBe(4);
    expect(request.identity.documentId).toBe('canvas-document-1');
    expect(snapshot.canvas.name).toBe(DEFAULT_CANVAS_DATA.name);
  });

  it('requires explicit source intent semantics and preserves Generation draft inputs', () => {
    const source = createCanvasHostIntentRequest({
      requestId: 'request-source',
      commandId: 'command-source',
      expectedRevision: 4,
      identity,
      intent: {
        type: 'request-source',
        sourceKind: 'image',
        sourceMode: 'reference',
      },
    });
    const draft = createCanvasHostIntentRequest({
      requestId: 'request-generation-draft',
      commandId: 'command-generation-draft',
      expectedRevision: 4,
      identity,
      intent: {
        type: 'request-generation-draft',
        mediaKind: 'video',
        position: { x: 24, y: 48 },
        inputNodeIds: ['source-1'],
      },
    });

    expect(source.intent).toEqual({
      type: 'request-source',
      sourceKind: 'image',
      sourceMode: 'reference',
    });
    expect(draft.intent).toEqual({
      type: 'request-generation-draft',
      mediaKind: 'video',
      position: { x: 24, y: 48 },
      inputNodeIds: ['source-1'],
    });
    expect(() =>
      parseCanvasHostIntentRequest({
        ...source,
        intent: { type: 'request-source', sourceKind: 'image' },
      }),
    ).toThrowError(CanvasHostRuntimeContractError);
  });

  it('rejects unknown versions, absolute identities and stale sessions', () => {
    expect(() =>
      parseCanvasHostSnapshot({
        ...validSnapshot(),
        schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION + 1,
      }),
    ).toThrowError(
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
        originCommandId: 'command-1',
        snapshot: validSnapshot(),
      }),
    ).toMatchObject({
      sequence: 1,
      originCommandId: 'command-1',
    });
  });

  it('covers every fixed Canvas Host route', () => {
    expect(Object.values(CANVAS_HOST_RUNTIME_ROUTES).sort()).toEqual(
      ['intent.execute', 'material-actions.resolve', 'projection.event', 'snapshot.get'].sort(),
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
    authoringCapabilities: {
      sourceModes: ['import', 'reference'],
      generationMediaKinds: ['image', 'video', 'audio', 'model', 'document'],
    },
    materialActions: [],
  };
}
