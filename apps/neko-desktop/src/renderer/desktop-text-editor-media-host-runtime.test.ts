import {
  TEXT_EDITOR_HOST_ROUTES,
  type OpenNekoDesktopTextEditorBridge,
  type TextDocumentProjection,
  type TextEditorHostRequest,
  type TextEditorRuntimeIdentity,
} from '@neko/text-editor-domain';
import { describe, expect, it, vi } from 'vitest';
import { createElectronTextEditorHostRuntime } from './desktop-text-editor-host-runtime';

const identity: TextEditorRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'text-editor-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'notes/readme.md',
  sessionId: 'text-document-1',
  rendererSessionId: 'renderer-1',
};

describe('Desktop Text Editor Markdown media host runtime', () => {
  it('releases a prepared lease when its visible surface is cancelled before attachment', async () => {
    const controller = new AbortController();
    const media = mediaRequest();
    const execute = vi.fn(async (request: TextEditorHostRequest) => {
      if (request.route === TEXT_EDITOR_HOST_ROUTES.mediaPrepare) {
        controller.abort();
        return {
          requestId: request.requestId,
          identity,
          status: 'media-ready' as const,
          projection: {
            ...media,
            status: 'ready' as const,
            descriptor: {
              leaseId: 'lease-1',
              kind: 'image' as const,
              renderUri: `openneko://resource/${'a'.repeat(32)}`,
              contentType: 'image/png',
              displayName: 'cover.png',
            },
          },
        };
      }
      if (request.route === TEXT_EDITOR_HOST_ROUTES.mediaRelease) {
        return {
          requestId: request.requestId,
          identity,
          status: 'media-released' as const,
          surfaceId: request.media.surfaceId,
          leaseId: request.media.leaseId,
        };
      }
      throw new Error(`Unexpected route '${request.route}'.`);
    });
    const bridge = {
      textEditor: {
        execute,
        executeClipboardCommand: vi.fn(async (request) => ({ ...request, status: 'executed' })),
        subscribe: vi.fn(() => () => undefined),
      },
    } satisfies OpenNekoDesktopTextEditorBridge;
    const runtime = createElectronTextEditorHostRuntime({ bridge, identity });

    await expect(runtime.prepareMarkdownMedia(media, controller.signal)).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-stale-surface' },
    });
    expect(execute.mock.calls.map(([request]) => request.route)).toEqual([
      TEXT_EDITOR_HOST_ROUTES.mediaPrepare,
      TEXT_EDITOR_HOST_ROUTES.mediaRelease,
    ]);
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      route: TEXT_EDITOR_HOST_ROUTES.mediaRelease,
      media: {
        identity: media.identity,
        sessionId: media.sessionId,
        surfaceId: media.surfaceId,
        leaseId: 'lease-1',
      },
    });
  });
});

function mediaRequest() {
  return {
    requestId: 'media-1',
    identity: projection().identity,
    sessionId: identity.sessionId,
    editSequence: 0,
    surfaceId: 'surface-1',
    token: {
      kind: 'resource-embed' as const,
      from: 0,
      to: 21,
      target: 'assets/cover.png',
    },
  };
}

function projection(): TextDocumentProjection {
  return {
    identity: {
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId: 'notes/readme.md',
      locator: { file: { authority: 'workspace', path: 'notes/readme.md' } },
    },
    sessionId: identity.sessionId,
    editSequence: 0,
    mode: 'markdown',
    source: '![[assets/cover.png]]',
    dirty: false,
    conflict: false,
    diagnostics: [],
  };
}
