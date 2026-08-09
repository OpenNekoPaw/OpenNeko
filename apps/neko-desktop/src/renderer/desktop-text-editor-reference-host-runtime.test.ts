import type {
  OpenNekoDesktopTextEditorBridge,
  TextDocumentProjection,
  TextEditorHostRequest,
  TextEditorRuntimeIdentity,
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

describe('Desktop Text Editor reference Host runtime', () => {
  it('delegates exact searches and discards a request cancelled by the visible Root', async () => {
    const execute = vi.fn(async (request: TextEditorHostRequest) => {
      if (request.route !== 'references.search') {
        throw new Error('Expected a reference search request.');
      }
      return {
        requestId: request.requestId,
        identity,
        status: 'references-ready' as const,
        projection: {
          requestId: request.search.requestId,
          identity: request.search.identity,
          sessionId: request.search.sessionId,
          editSequence: request.search.editSequence,
          kind: request.search.kind,
          query: request.search.query,
          candidates: [],
          diagnostics: [],
        },
      };
    });
    const bridge = {
      textEditor: { execute, subscribe: vi.fn(() => () => undefined) },
    } satisfies OpenNekoDesktopTextEditorBridge;
    const runtime = createElectronTextEditorHostRuntime({ bridge, identity });
    const request = {
      requestId: 'references-1',
      identity: projection().identity,
      sessionId: identity.sessionId,
      editSequence: 0,
      kind: 'mention' as const,
      query: '小',
      limit: 30,
    };

    await expect(
      runtime.searchMarkdownReferences(request, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'ready', projection: { requestId: 'references-1' } });
    expect(execute).toHaveBeenCalledWith({
      route: 'references.search',
      requestId: 'references-1',
      identity,
      search: request,
    });

    const cancelled = new AbortController();
    cancelled.abort();
    await expect(runtime.searchMarkdownReferences(request, cancelled.signal)).resolves.toEqual({
      status: 'discarded',
      reason: 'cancelled',
    });
    expect(execute).toHaveBeenCalledOnce();
  });
});

function projection(): TextDocumentProjection {
  return {
    identity: {
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId: 'notes/readme.md',
      locator: { kind: 'workspace-file', path: 'notes/readme.md' },
    },
    sessionId: identity.sessionId,
    editSequence: 0,
    mode: 'markdown',
    source: '@小',
    dirty: false,
    conflict: false,
    diagnostics: [],
  };
}
