import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DSH_RUNTIME_HOST_CHANNEL } from '@neko/agent-contracts/dsh-runtime-host';

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

describe('Desktop DSH runtime IPC', () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.removeHandler.mockReset();
  });

  it('routes only through the typed sender-bound runtime Host and unregisters the channel', async () => {
    const execute = vi.fn(async () => ({
      requestId: 'request-1',
      projection: { status: 'running' as const },
    }));
    const dispose = registerDesktopIpc({} as never, {
      dshRuntime: { execute } as never,
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage: vi.fn(),
      readCharacterPackage: vi.fn(),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(DSH_RUNTIME_HOST_CHANNEL);
    if (!handler) throw new Error('DSH runtime IPC handler was not registered.');
    const event = {
      sender: { id: 42 },
      senderFrame: { url: 'file:///desktop/index.html' },
    };
    const request = {
      requestId: 'request-1',
      operation: 'restart',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
    };

    await expect(handler(event, request)).resolves.toMatchObject({ projection: { status: 'running' } });
    expect(execute).toHaveBeenCalledWith(
      { webContentsId: 42, frameUrl: 'file:///desktop/index.html' },
      request,
    );
    dispose();
    expect(electron.removeHandler).toHaveBeenCalledWith(DSH_RUNTIME_HOST_CHANNEL);
  });
});
