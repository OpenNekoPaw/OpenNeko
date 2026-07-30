import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_HOME_MANAGEMENT_CHANNELS,
  DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
} from '../shared/home-management-contract';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: vi.fn(),
  },
}));

beforeAll(async () => {
  await import('./index');
});

describe('Desktop Home management preload bridge', () => {
  it('routes strict global media-library mutations without exposing absolute paths', async () => {
    electron.invoke.mockImplementation(
      async (
        channel: string,
        request: { readonly requestId: string; readonly libraryId?: string },
      ) => {
        if (channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsAddLibrary) {
          return {
            schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
            requestId: request.requestId,
            status: 'added',
            libraryId: 'library:Footage',
          };
        }
        const status =
          channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRemoveLibrary ? 'removed' : 'revealed';
        return {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: request.requestId,
          status,
          libraryId: request.libraryId,
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.home.assets.addLibrary()).resolves.toMatchObject({
      status: 'added',
      libraryId: 'library:Footage',
    });
    await expect(bridge.home.assets.removeLibrary('library:Footage')).resolves.toMatchObject({
      status: 'removed',
    });
    await expect(bridge.home.assets.revealLibrary('library:Footage')).resolves.toMatchObject({
      status: 'revealed',
    });

    expect(electron.invoke.mock.calls).toEqual([
      [
        DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsAddLibrary,
        expect.not.objectContaining({ absolutePath: expect.anything() }),
      ],
      [
        DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRemoveLibrary,
        expect.objectContaining({ libraryId: 'library:Footage' }),
      ],
      [
        DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRevealLibrary,
        expect.objectContaining({ libraryId: 'library:Footage' }),
      ],
    ]);
  });
});
