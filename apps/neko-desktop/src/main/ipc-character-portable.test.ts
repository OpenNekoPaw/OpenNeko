import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_PORTABLE_HOST_CHANNELS,
  createCharacterPortableHostRequest,
  type CharacterPortableHostBinding,
} from '@neko/chara-domain/contracts';

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

describe('Desktop Character portable IPC', () => {
  const event = {
    sender: { id: 42 },
    senderFrame: { url: 'file:///desktop/index.html' },
  };
  const context = {
    requestId: 'request-1',
    rendererSessionId: 'renderer-1',
    windowId: 'window-1',
  };
  const binding: CharacterPortableHostBinding = {
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority: { kind: 'project', projectId: 'project-1' },
  };

  beforeEach(() => {
    electron.handlers.clear();
    electron.removeHandler.mockReset();
  });

  it('selects the destination before producing and never returns a file path', async () => {
    const archiveBytes = new Uint8Array([1, 2, 3]);
    const createCharacterPortableExport = vi.fn(async () => ({
      result: { requestId: context.requestId, status: 'exported' as const },
      archiveBytes,
    }));
    const saveCharacterPackage = vi.fn(
      async (_event: unknown, produce: () => Promise<Uint8Array>) => {
        expect(createCharacterPortableExport).not.toHaveBeenCalled();
        expect(await produce()).toEqual(archiveBytes);
        return true;
      },
    );
    registerDesktopIpc({ createCharacterPortableExport } as never, {
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage,
      readCharacterPackage: vi.fn(),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(CHARACTER_PORTABLE_HOST_CHANNELS.exportPackage);
    if (!handler) throw new Error('Character export IPC handler was not registered.');
    const request = createCharacterPortableHostRequest(context, binding, {
      kind: 'export',
      characterProjectId: 'character-1',
      selection: {
        characterVersionId: 'character-version-1',
        embeddedRepresentationIds: [],
      },
    });

    const result = await handler(event, request);
    expect(result).toEqual({ requestId: context.requestId, status: 'exported' });
    expect(result).not.toHaveProperty('filePath');
    expect(createCharacterPortableExport).toHaveBeenCalledWith(
      { webContentsId: 42, frameUrl: 'file:///desktop/index.html' },
      request,
    );
  });

  it('delegates export scope projection without invoking a native file picker', async () => {
    const getCharacterPortableExportScope = vi.fn(async () => ({
      requestId: context.requestId,
      status: 'scope-ready' as const,
      scope: {
        characterProjectId: 'character-1',
        displayName: 'Lin',
        characterVersionIds: [],
        branchHeadCharacterVersionIds: [],
        unlinkedCharacterVersionIds: [],
        characterStorylines: [],
        authoringTestSnapshotIds: [],
        representations: [],
      },
    }));
    const saveCharacterPackage = vi.fn();
    registerDesktopIpc({ getCharacterPortableExportScope } as never, {
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage,
      readCharacterPackage: vi.fn(),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(CHARACTER_PORTABLE_HOST_CHANNELS.exportScope);
    if (!handler) throw new Error('Character export scope IPC handler was not registered.');
    const request = createCharacterPortableHostRequest(context, binding, {
      kind: 'export-scope',
      characterProjectId: 'character-1',
    });

    await expect(handler(event, request)).resolves.toMatchObject({ status: 'scope-ready' });
    expect(getCharacterPortableExportScope).toHaveBeenCalledWith(
      { webContentsId: 42, frameUrl: 'file:///desktop/index.html' },
      request,
    );
    expect(saveCharacterPackage).not.toHaveBeenCalled();
  });

  it('imports directly and does not allocate Host receipt state when source selection is cancelled', async () => {
    const importCharacterPortablePackage = vi.fn();
    registerDesktopIpc({ importCharacterPortablePackage } as never, {
      selectContentWorkspace: vi.fn(),
      selectWorkspaceGrant: vi.fn(),
      saveCharacterPackage: vi.fn(),
      readCharacterPackage: vi.fn(async () => undefined),
      saveWorldPackage: vi.fn(),
      readWorldPackage: vi.fn(),
    });
    const handler = electron.handlers.get(CHARACTER_PORTABLE_HOST_CHANNELS.importPackage);
    if (!handler) throw new Error('Character import IPC handler was not registered.');
    const request = createCharacterPortableHostRequest(context, undefined, {
      kind: 'import',
    });

    await expect(handler(event, request)).resolves.toEqual({
      requestId: context.requestId,
      status: 'cancelled',
    });
    expect(importCharacterPortablePackage).not.toHaveBeenCalled();
  });
});
