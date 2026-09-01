import type {
  OpenNekoDesktopTextEditorBridge,
  TextDocumentProjection,
  TextEditorHostRequest,
  TextEditorRuntimeIdentity,
} from '@neko/text-editor-domain';
import { describe, expect, it, vi } from 'vitest';
import { createElectronTextEditorHostRuntime } from './desktop-text-editor-host-runtime';

const originalIdentity: TextEditorRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'text-editor-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'notes/readme.md',
  sessionId: 'text-document:old',
  rendererSessionId: 'renderer-1',
};

describe('Desktop Text Editor renderer host runtime', () => {
  it('adopts a restored projection identity for every subsequent command', async () => {
    const restoredIdentity = { ...originalIdentity, sessionId: 'text-document:new' };
    const execute = vi.fn(async (request: TextEditorHostRequest) => ({
      requestId: request.requestId,
      identity: restoredIdentity,
      status: 'ready' as const,
      projection: projection(restoredIdentity.sessionId),
    }));
    const bridge = {
      textEditor: {
        execute,
        executeClipboardCommand: vi.fn(async (request) => ({ ...request, status: 'executed' })),
        subscribe: vi.fn(() => () => undefined),
      },
    } satisfies OpenNekoDesktopTextEditorBridge;
    const runtime = createElectronTextEditorHostRuntime({ bridge, identity: originalIdentity });

    await expect(runtime.project()).resolves.toMatchObject({
      sessionId: restoredIdentity.sessionId,
    });
    await runtime.applyEdits({
      identity: projection(restoredIdentity.sessionId).identity,
      sessionId: restoredIdentity.sessionId,
      requestId: 'edit-1',
      expectedEditSequence: 0,
      changes: [{ from: 0, to: 0, insert: '# ' }],
    });
    await runtime.executeClipboardCommand('copy');

    expect(execute.mock.calls[0]?.[0].identity).toEqual(originalIdentity);
    expect(execute.mock.calls[1]?.[0].identity).toEqual(restoredIdentity);
    expect(bridge.textEditor.executeClipboardCommand).toHaveBeenCalledWith({
      identity: restoredIdentity,
      command: 'copy',
    });
    expect(() =>
      runtime.applyEdits({
        identity: projection(originalIdentity.sessionId).identity,
        sessionId: originalIdentity.sessionId,
        requestId: 'edit-stale',
        expectedEditSequence: 0,
        changes: [{ from: 0, to: 0, insert: 'stale' }],
      }),
    ).toThrow('command session identity is stale');
  });
});

function projection(sessionId: string): TextDocumentProjection {
  return {
    identity: {
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId: 'notes/readme.md',
      locator: { file: { authority: 'workspace', path: 'notes/readme.md' } },
    },
    sessionId,
    editSequence: 0,
    mode: 'markdown',
    source: '# Draft\n',
    dirty: false,
    conflict: false,
    diagnostics: [],
  };
}
