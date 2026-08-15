import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_CANVAS_CHANNELS } from '../shared/canvas-bridge-contract';

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

describe('Desktop Canvas text preview IPC', () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.removeHandler.mockReset();
  });

  it('delegates the exact sender identity and payload through one channel', async () => {
    const readCanvasTextFilePreview = vi.fn(async () => ({ status: 'unsupported' }));
    const dispose = registerDesktopIpc({ readCanvasTextFilePreview } as never, {
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage: vi.fn(),
      readCharacterPackage: vi.fn(),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(DESKTOP_CANVAS_CHANNELS.textFilePreviewRead);
    if (!handler) throw new Error('Canvas text preview IPC handler was not registered.');
    const payload = { requestId: 'request-1' };
    const event = {
      sender: { id: 42 },
      senderFrame: { url: 'file:///desktop/index.html' },
    };

    await expect(handler(event, payload)).resolves.toEqual({ status: 'unsupported' });
    expect(readCanvasTextFilePreview).toHaveBeenCalledWith(
      { webContentsId: 42, frameUrl: 'file:///desktop/index.html' },
      payload,
    );

    dispose();
    expect(electron.removeHandler).toHaveBeenCalledWith(
      DESKTOP_CANVAS_CHANNELS.textFilePreviewRead,
    );
  });

  it('rejects a request without a sender frame before delegation', async () => {
    const readCanvasTextFilePreview = vi.fn();
    registerDesktopIpc({ readCanvasTextFilePreview } as never, {
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage: vi.fn(),
      readCharacterPackage: vi.fn(),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(DESKTOP_CANVAS_CHANNELS.textFilePreviewRead);
    if (!handler) throw new Error('Canvas text preview IPC handler was not registered.');

    expect(() => handler({ sender: { id: 42 } }, {})).toThrow('no sender frame URL');
    expect(readCanvasTextFilePreview).not.toHaveBeenCalled();
  });
});
