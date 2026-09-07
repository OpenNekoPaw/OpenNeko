import {
  TEXT_EDITOR_HOST_CHANNELS,
  type TextEditorRuntimeIdentity,
} from '@neko/text-editor-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  removeHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
      electron.handlers.set(channel, handler);
    },
    removeHandler: electron.removeHandler,
  },
}));

import { registerDesktopIpc } from './ipc';

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

describe('Desktop Text Editor clipboard IPC', () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.removeHandler.mockReset();
  });

  it.each(['cut', 'copy', 'paste'] as const)(
    'authorizes and executes one exact %s command on its sender',
    async (command) => {
      const authorizeTextEditorClipboardCommand = vi.fn(
        (_sender: unknown, payload: unknown) =>
          payload as { identity: TextEditorRuntimeIdentity; command: typeof command },
      );
      const dispose = registerDesktopIpc({ authorizeTextEditorClipboardCommand } as never, {
        selectContentWorkspace: vi.fn(),
        selectWorkspaceGrant: vi.fn(),
        saveCharacterPackage: vi.fn(),
        readCharacterPackage: vi.fn(),
        saveWorldPackage: vi.fn(),
        readWorldPackage: vi.fn(),
      });
      const handler = electron.handlers.get(TEXT_EDITOR_HOST_CHANNELS.clipboardExecute);
      if (!handler) throw new Error('Text Editor clipboard IPC handler was not registered.');
      const sender = {
        id: 42,
        cut: vi.fn(),
        copy: vi.fn(),
        paste: vi.fn(),
      };
      const payload = { identity, command };

      expect(
        handler({ sender, senderFrame: { url: 'file:///desktop/index.html' } }, payload),
      ).toEqual({ ...payload, status: 'executed' });
      expect(authorizeTextEditorClipboardCommand).toHaveBeenCalledWith(
        { webContentsId: 42, frameUrl: 'file:///desktop/index.html' },
        payload,
      );
      expect(sender.cut).toHaveBeenCalledTimes(command === 'cut' ? 1 : 0);
      expect(sender.copy).toHaveBeenCalledTimes(command === 'copy' ? 1 : 0);
      expect(sender.paste).toHaveBeenCalledTimes(command === 'paste' ? 1 : 0);

      dispose();
      expect(electron.removeHandler).toHaveBeenCalledWith(
        TEXT_EDITOR_HOST_CHANNELS.clipboardExecute,
      );
    },
  );
});
