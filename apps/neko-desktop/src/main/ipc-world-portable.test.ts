import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORLD_PORTABLE_HOST_CHANNELS,
  createWorldPortableHostRequest,
  type WorldPortableHostBinding,
} from '@neko/world-domain/contracts';

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

describe('Desktop World portable IPC', () => {
  const event = {
    sender: { id: 42 },
    senderFrame: { url: 'file:///desktop/index.html' },
  };
  const context = {
    requestId: 'request-1',
    rendererSessionId: 'renderer-1',
    windowId: 'window-1',
  };
  const binding: WorldPortableHostBinding = {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority: { kind: 'project', projectId: 'project-1' },
  };

  beforeEach(() => {
    electron.handlers.clear();
    electron.removeHandler.mockReset();
  });

  it('selects the native destination before producing and returns no path or bytes', async () => {
    const archiveBytes = new Uint8Array([1, 2, 3]);
    const result = {
      kind: 'export-completed' as const,
      worldProjectId: 'world-1',
      worldVersionId: 'version-1',
      archiveByteLength: archiveBytes.byteLength,
    };
    const createWorldPortableExport = vi.fn(async () => ({
      result: { requestId: context.requestId, status: 'completed' as const, result },
      archiveBytes,
    }));
    const saveWorldPackage = vi.fn(
      async (_event: unknown, produce: () => Promise<Uint8Array>) => {
        expect(createWorldPortableExport).not.toHaveBeenCalled();
        expect(await produce()).toEqual(archiveBytes);
        return true;
      },
    );
    registerDesktopIpc({ createWorldPortableExport } as never, options({ saveWorldPackage }));
    const handler = electron.handlers.get(WORLD_PORTABLE_HOST_CHANNELS.exportPackage);
    if (!handler) throw new Error('World export IPC handler was not registered.');
    const request = createWorldPortableHostRequest({
      ...context,
      operation: 'export',
      binding,
      selection: {
        worldProjectId: 'world-1',
        worldVersionId: 'version-1',
        embeddedResourceIds: [],
      },
    });

    const response = await handler(event, request);
    expect(response).toEqual({ requestId: context.requestId, status: 'completed', result });
    expect(response).not.toHaveProperty('archiveBytes');
    expect(response).not.toHaveProperty('filePath');
  });

  it('does not allocate an import receipt when native source selection is cancelled', async () => {
    const importWorldPortablePackage = vi.fn();
    registerDesktopIpc(
      { importWorldPortablePackage } as never,
      options({ readWorldPackage: vi.fn(async () => undefined) }),
    );
    const handler = electron.handlers.get(WORLD_PORTABLE_HOST_CHANNELS.importPackage);
    if (!handler) throw new Error('World import IPC handler was not registered.');
    const request = createWorldPortableHostRequest({
      ...context,
      operation: 'import',
    });

    await expect(handler(event, request)).resolves.toEqual({
      requestId: context.requestId,
      status: 'cancelled',
    });
    expect(importWorldPortablePackage).not.toHaveBeenCalled();
  });
});

function options(overrides?: {
  readonly saveWorldPackage?: (
    event: unknown,
    produce: () => Promise<Uint8Array>,
  ) => Promise<boolean>;
  readonly readWorldPackage?: () => Promise<Uint8Array | undefined>;
}) {
  return {
    selectContentWorkspace: vi.fn(),
    selectWorkspaceGrant: vi.fn(),
    saveCharacterPackage: vi.fn(),
    readCharacterPackage: vi.fn(),
    saveWorldPackage: overrides?.saveWorldPackage ?? vi.fn(),
    readWorldPackage: overrides?.readWorldPackage ?? vi.fn(),
  };
}
