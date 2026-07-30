import { DEFAULT_CANVAS_DATA } from '@neko/shared';
import {
  CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
  parseCanvasHostIntentRequest,
  type CanvasHostIntentResult,
} from '@neko-canvas/domain';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopCanvasSessionId } from '../shared/canvas-bridge-contract';
import type { DesktopWorkbenchViewRef } from '../shared/workbench-contract';
import {
  createDesktopResourceToCanvasInteraction,
  type DesktopResourceBrowserRuntimeOptions,
} from './desktop-resource-browser-runtime';

const resourceIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewEpoch: 1,
  endpointEpoch: 'endpoint-1',
} as const;
const canvasView: DesktopWorkbenchViewRef = {
  viewId: 'canvas:board-a',
  viewEpoch: 1,
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  kind: 'canvas',
  ownerId: 'canvas:board-a',
  displayLabel: 'a.nkc',
  documentId: 'boards/a.nkc',
};

describe('createDesktopResourceToCanvasInteraction', () => {
  it('routes a stable ContentLocator to the exact revisioned Canvas session', async () => {
    const executeIntent = vi.fn<DesktopResourceBrowserRuntimeOptions['canvas']['executeIntent']>(
      async (_windowId, payload) => accepted(payload),
    );
    const addToCanvas = createDesktopResourceToCanvasInteraction({
      shell: shellWithViews([canvasView]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await addToCanvas({
      identity: resourceIdentity,
      item: {
        resourceId: 'content:cat',
        facet: 'media',
        role: 'content',
        depth: 0,
        kind: 'image',
        label: 'cat.png',
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
        capabilities: ['preview', 'reveal', 'add-to-canvas'],
      },
      target: {
        documentId: 'boards/a.nkc',
        sessionId: createDesktopCanvasSessionId(canvasView.viewId, canvasView.viewEpoch),
        expectedRevision: 4,
      },
    });

    expect(executeIntent).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({
        expectedRevision: 4,
        identity: expect.objectContaining({
          viewId: canvasView.viewId,
          documentId: 'boards/a.nkc',
          sessionId: createDesktopCanvasSessionId(canvasView.viewId, canvasView.viewEpoch),
        }),
        intent: {
          type: 'author-material',
          request: {
            kind: 'direct-reference',
            identity: {
              projectId: 'project-1',
              canvasId: 'boards/a.nkc',
              canvasSessionId: createDesktopCanvasSessionId(
                canvasView.viewId,
                canvasView.viewEpoch,
              ),
            },
            locator: { kind: 'workspace-file', path: 'media/cat.png' },
            mediaKind: 'image',
            title: 'cat.png',
          },
        },
      }),
    );
  });

  it('rejects a stale target instead of falling back to another active Canvas', async () => {
    const executeIntent = vi.fn<DesktopResourceBrowserRuntimeOptions['canvas']['executeIntent']>();
    const addToCanvas = createDesktopResourceToCanvasInteraction({
      shell: shellWithViews([
        {
          ...canvasView,
          viewId: 'canvas:active',
          documentId: 'boards/active.nkc',
        },
      ]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await expect(
      addToCanvas({
        identity: resourceIdentity,
        item: {
          resourceId: 'content:cat',
          facet: 'media',
          role: 'content',
          depth: 0,
          kind: 'image',
          label: 'cat.png',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
          capabilities: ['add-to-canvas'],
        },
        target: {
          documentId: 'boards/missing.nkc',
          sessionId: 'canvas-session:missing',
          expectedRevision: 0,
        },
      }),
    ).rejects.toThrow('stale or not attached');
    expect(executeIntent).not.toHaveBeenCalled();
  });

  it('retains stable Entity and active representation evidence in Canvas authoring', async () => {
    const executeIntent = vi.fn<DesktopResourceBrowserRuntimeOptions['canvas']['executeIntent']>(
      async (_windowId, payload) => accepted(payload),
    );
    const addToCanvas = createDesktopResourceToCanvasInteraction({
      shell: shellWithViews([canvasView]),
      canvas: { executeIntent },
      windowId: 'window-1',
    });

    await addToCanvas({
      identity: resourceIdentity,
      item: {
        resourceId: 'entity:character-neko',
        facet: 'entities',
        role: 'entity',
        depth: 0,
        kind: 'character',
        label: 'Neko',
        entityRef: { entityId: 'character-neko', entityKind: 'character' },
        entityStatus: 'confirmed',
        representationAvailability: 'active',
        representationLocator: {
          kind: 'workspace-file',
          path: 'characters/neko.png',
        },
        representationBindingId: 'binding-neko-portrait',
        representationRole: 'portrait',
        capabilities: ['preview', 'add-to-canvas', 'add-to-agent'],
      },
      target: {
        documentId: 'boards/a.nkc',
        sessionId: createDesktopCanvasSessionId(canvasView.viewId, canvasView.viewEpoch),
        expectedRevision: 7,
      },
    });

    expect(executeIntent).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({
        intent: {
          type: 'author-material',
          request: expect.objectContaining({
            kind: 'direct-reference',
            locator: {
              kind: 'workspace-file',
              path: 'characters/neko.png',
            },
            entity: {
              entityId: 'character-neko',
              bindingId: 'binding-neko-portrait',
              role: 'portrait',
            },
          }),
        },
      }),
    );
  });
});

function shellWithViews(views: readonly DesktopWorkbenchViewRef[]) {
  return {
    getProjection: async () => ({
      window: { workbench: { main: { views } } },
    }),
  };
}

function accepted(value: unknown): CanvasHostIntentResult {
  const request = parseCanvasHostIntentRequest(value);
  return {
    schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
    requestId: request.requestId,
    commandId: request.commandId,
    status: 'accepted',
    snapshot: {
      schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
      identity: request.identity,
      revision: request.expectedRevision + 1,
      dirty: true,
      canvas: DEFAULT_CANVAS_DATA,
      presentation: {
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        selectedNodeIds: [],
      },
      authoringCapabilities: {
        sourceModes: ['import', 'reference'],
        generationMediaKinds: [],
      },
    },
  };
}
