import { DEFAULT_CANVAS_DATA } from '@neko/canvas-domain';
import { describe, expect, it } from 'vitest';
import {
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
  viewInstanceId: 'view-instance-1',
  documentId: 'canvas-document-1',
  sessionId: 'canvas-session-1',
  rendererSessionId: 'endpoint-1',
} as const;

describe('Canvas Host runtime contract', () => {
  it('builds identity-bound intents and parses authoritative snapshots', () => {
    const request = createCanvasHostIntentRequest({
      requestId: 'request-1',
      commandId: 'command-1',
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

    expect(request.identity.documentId).toBe('canvas-document-1');
    expect(snapshot.canvas.name).toBe(DEFAULT_CANVAS_DATA.name);
    expect(snapshot.authoringCapabilities.generationModels).toEqual([
      {
        binding: {
          purpose: 'image.generate',
          providerId: 'provider-1',
          modelId: 'image-model-1',
        },
        label: 'Image Model',
        providerLabel: 'Provider One',
        isDefault: true,
      },
    ]);
  });

  it('requires explicit source semantics and typed Generation Node creation', () => {
    const source = createCanvasHostIntentRequest({
      requestId: 'request-source',
      commandId: 'command-source',
      identity,
      intent: {
        type: 'request-source',
        sourceKind: 'image',
        sourceMode: 'reference',
      },
    });
    const generation = createCanvasHostIntentRequest({
      requestId: 'request-generation-create',
      commandId: 'command-generation-create',
      identity,
      intent: {
        type: 'create-generation-node',
        kind: 'video',
        position: { x: 24, y: 48 },
      },
    });

    expect(source.intent).toEqual({
      type: 'request-source',
      sourceKind: 'image',
      sourceMode: 'reference',
    });
    expect(generation.intent).toEqual({
      type: 'create-generation-node',
      kind: 'video',
      position: { x: 24, y: 48 },
    });
    expect(() =>
      parseCanvasHostIntentRequest({
        ...source,
        intent: { type: 'request-source', sourceKind: 'image' },
      }),
    ).toThrowError(CanvasHostRuntimeContractError);
  });

  it('preserves exact node removal evidence on save intents', () => {
    const save = createCanvasHostIntentRequest({
      requestId: 'request-save',
      commandId: 'command-save',
      identity,
      intent: { type: 'save', removedNodeIds: ['node-1', 'node-2'] },
    });

    expect(parseCanvasHostIntentRequest(save).intent).toEqual({
      type: 'save',
      removedNodeIds: ['node-1', 'node-2'],
    });
    expect(() =>
      parseCanvasHostIntentRequest({
        ...save,
        intent: { type: 'save', removedNodeIds: ['node-1', 'node-1'] },
      }),
    ).toThrowError(CanvasHostRuntimeContractError);
  });

  it('preserves a stale-Recipe Generation projection and rejects invalid projection fields', () => {
    const projection = {
      nodeId: 'generation-1',
      submissionId: 'submission-1',
      recipeInputFingerprint: 'sha256:recipe-1',
      phase: 'succeeded',
      createdAt: 100,
      updatedAt: 250,
      recipeStale: true,
    };
    const snapshot = parseCanvasHostSnapshot({
      ...validSnapshot(),
      generationNodes: [projection],
    });

    expect(snapshot.generationNodes).toEqual([projection]);
    expect(() =>
      parseCanvasHostSnapshot({
        ...validSnapshot(),
        generationNodes: [{ ...projection, recipeStale: 'true' }],
      }),
    ).toThrowError('Canvas Generation Recipe stale marker is invalid.');
    expect(() =>
      parseCanvasHostSnapshot({
        ...validSnapshot(),
        generationNodes: [{ ...projection, staleReason: 'recipe-changed' }],
      }),
    ).toThrowError('Canvas Generation runtime projection contains unsupported fields.');
    expect(() =>
      parseCanvasHostSnapshot({
        ...validSnapshot(),
        generationNodes: [{ ...projection, updatedAt: 50 }],
      }),
    ).toThrowError('Canvas Generation runtime timestamp order is invalid.');
    const { updatedAt: _updatedAt, ...missingUpdatedAt } = projection;
    expect(() =>
      parseCanvasHostSnapshot({
        ...validSnapshot(),
        generationNodes: [missingUpdatedAt],
      }),
    ).toThrowError('Canvas Generation runtime timestamps must be projected together.');
  });

  it('rejects removed fields, absolute identities and stale sessions', () => {
    expect(() =>
      parseCanvasHostSnapshot({
        ...validSnapshot(),
        unexpectedField: 5,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CanvasHostRuntimeContractError>>({
        code: 'invalid-canvas-host-runtime-payload',
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
      [
        'intent.execute',
        'material-actions.resolve',
        'projection.event',
        'snapshot.get',
        'text-file-preview.read',
      ].sort(),
    );
  });
});

function validSnapshot() {
  return {
    identity,
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
      generationKinds: ['prompt', 'image', 'audio', 'video'],
      generationModels: [
        {
          binding: {
            purpose: 'image.generate',
            providerId: 'provider-1',
            modelId: 'image-model-1',
          },
          label: 'Image Model',
          providerLabel: 'Provider One',
          isDefault: true,
        },
      ],
    },
    generationNodes: [],
  };
}
