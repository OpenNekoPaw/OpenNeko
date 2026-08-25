import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_SHELL_CHANNELS } from '@neko/host/desktop-shell-contract';

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

describe('Desktop Conversation archive IPC', () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.removeHandler.mockReset();
  });

  it('always registers and unregisters the typed sender-bound archive channel', async () => {
    const archiveConversations = vi.fn(async () => ({
      requestId: 'request-1',
      projection: { applicationInstanceId: 'application-1' },
    }));
    const dispose = registerDesktopIpc({ archiveConversations } as never, {
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage: vi.fn(),
      readCharacterPackage: vi.fn(),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(DESKTOP_SHELL_CHANNELS.conversationArchive);
    if (!handler) throw new Error('Desktop Conversation archive IPC handler was not registered.');
    const event = {
      sender: { id: 42 },
      senderFrame: { url: 'file:///desktop/index.html' },
    };
    const request = {
      requestId: 'request-1',
      rendererSessionId: 'renderer-session-1',
      navigations: [
        {
          conversationId: 'conversation:workspace-1',
          owner: { kind: 'workspace', workspaceId: 'workspace-1' },
        },
      ],
    };

    await expect(handler(event, request)).resolves.toMatchObject({ requestId: 'request-1' });
    expect(archiveConversations).toHaveBeenCalledWith(
      { webContentsId: 42, frameUrl: 'file:///desktop/index.html' },
      request,
    );

    dispose();
    expect(electron.removeHandler).toHaveBeenCalledWith(DESKTOP_SHELL_CHANNELS.conversationArchive);
  });

  it('exposes archive channels without retaining the retired delete routes', () => {
    const channels = Object.values(DESKTOP_SHELL_CHANNELS);

    expect(channels).toContain('openneko:desktop:home:conversation:archive');
    expect(channels).toContain('openneko:desktop:project:conversation:archive');
    expect(channels).toContain('openneko:desktop:home:conversation:delete-unavailable');
    expect(channels).not.toContain('openneko:desktop:home:conversation:delete');
    expect(channels).not.toContain('openneko:desktop:project:conversation:delete');
  });

  it('binds unavailable Conversation delete to the exact sender and request', async () => {
    const deleteUnavailableConversation = vi.fn(async () => ({
      requestId: 'request-delete',
      projection: { applicationInstanceId: 'application-1' },
    }));
    registerDesktopIpc({ deleteUnavailableConversation } as never, {
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage: vi.fn(),
      readCharacterPackage: vi.fn(),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(DESKTOP_SHELL_CHANNELS.conversationDeleteUnavailable);
    if (!handler) throw new Error('Unavailable Conversation delete IPC was not registered.');
    const event = {
      sender: { id: 43 },
      senderFrame: { url: 'file:///desktop/index.html' },
    };
    const request = {
      requestId: 'request-delete',
      rendererSessionId: 'renderer-session-1',
      navigation: {
        conversationId: 'conversation:unavailable',
        owner: { kind: 'assistant', assistantSpaceId: 'assistant:local' },
      },
    };

    await expect(handler(event, request)).resolves.toMatchObject({
      requestId: 'request-delete',
    });
    expect(deleteUnavailableConversation).toHaveBeenCalledWith(
      { webContentsId: 43, frameUrl: 'file:///desktop/index.html' },
      request,
    );
  });
});
