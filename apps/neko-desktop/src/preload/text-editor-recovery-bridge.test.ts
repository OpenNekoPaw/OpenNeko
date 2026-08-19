import {
  TEXT_EDITOR_HOST_CHANNELS,
  TEXT_EDITOR_HOST_ROUTES,
  type TextDocumentProjection,
  type TextEditorProjectionEvent,
  type TextEditorRuntimeIdentity,
} from '@neko/text-editor-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  listeners: new Map<string, (_event: unknown, value: unknown) => void>(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: (channel: string, request: unknown) => electron.invoke(channel, request),
    on: (channel: string, listener: (_event: unknown, value: unknown) => void) => {
      electron.listeners.set(channel, listener);
    },
    removeListener: vi.fn(),
  },
}));

await import('./index');

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

describe('Desktop Text Editor recovery preload bridge', () => {
  beforeEach(() => {
    electron.invoke.mockReset();
  });

  it('accepts only projection recovery and rebinds events to the new exact session', async () => {
    const restoredIdentity = { ...originalIdentity, sessionId: 'text-document:new' };
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        return {
          requestId: request.requestId,
          identity: restoredIdentity,
          status: 'ready',
          projection: projection(restoredIdentity.sessionId),
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    const listener = vi.fn();
    bridge.textEditor.subscribe(originalIdentity, listener);

    await expect(
      bridge.textEditor.execute({
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: 'projection-1',
        identity: originalIdentity,
      }),
    ).resolves.toMatchObject({ identity: restoredIdentity, status: 'ready' });
    expect(electron.invoke).toHaveBeenCalledWith(
      TEXT_EDITOR_HOST_CHANNELS.execute,
      expect.objectContaining({ requestId: 'projection-1' }),
    );

    const event: TextEditorProjectionEvent = {
      sequence: 1,
      identity: restoredIdentity,
      projection: projection(restoredIdentity.sessionId),
    };
    electron.listeners.get(TEXT_EDITOR_HOST_CHANNELS.projectionEvent)?.({}, event);
    expect(listener).toHaveBeenCalledWith(event);

    await expect(
      bridge.textEditor.execute({
        route: TEXT_EDITOR_HOST_ROUTES.editsApply,
        requestId: 'edit-old-session',
        identity: originalIdentity,
        expectedEditSequence: 0,
        changes: [{ from: 0, to: 0, insert: '# ' }],
      }),
    ).rejects.toThrow('result identity does not match');
  });

  it('rejects projection recovery that changes the authoritative document owner', async () => {
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        identity: {
          ...originalIdentity,
          documentId: 'notes/other.md',
          sessionId: 'text-document:other',
        },
        status: 'ready',
        projection: projection('text-document:other', 'notes/other.md'),
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(
      bridge.textEditor.execute({
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: 'projection-wrong-document',
        identity: originalIdentity,
      }),
    ).rejects.toThrow('result identity does not match');
  });
});

function projection(sessionId: string, documentId = 'notes/readme.md'): TextDocumentProjection {
  return {
    identity: {
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId,
      locator: { file: { authority: 'workspace', path: documentId } },
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
