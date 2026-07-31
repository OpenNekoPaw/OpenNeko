import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

await import('./index');

describe('Desktop Home management preload bridge', () => {
  beforeEach(async () => {
    electron.invoke.mockReset();
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        schemaVersion: 1,
        requestId: request.requestId,
        application: {
          schemaVersion: 1,
          applicationId: 'neko-desktop',
          instanceId: 'application-1',
          version: '0.0.1',
        },
        window: {
          windowId: 'window-1',
          rendererEpoch: 1,
        },
        host: {
          id: 'electron',
          kind: 'electron',
          ui: 'graphical',
        },
        runtime: {
          platform: 'darwin',
        },
        status: 'foundation-ready',
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.bootstrap.get();
    electron.invoke.mockReset();
  });

  afterEach(() => {
    for (const [, request] of electron.invoke.mock.calls) {
      expect(request).toMatchObject({
        endpointEpoch: 'application-1:window-1:1',
      });
    }
  });

  it('routes the extension catalog through the canonical extensions channel', async () => {
    electron.invoke.mockImplementation(async (channel: string, request: { requestId: string }) => {
      expect(channel).toBe(DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionsList);
      return {
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        requestId: request.requestId,
        skills: [],
        skillDiscovery: { diagnostics: [], duplicateCount: 0 },
        extensions: [
          {
            id: 'computer-use@openai-bundled',
            name: 'computer-use',
            displayName: 'Computer Use',
            description: 'Control Mac apps.',
            version: '1.0.2',
            developer: 'OpenAI',
            marketplace: 'openai-bundled',
            mcpServerIds: ['computer-use'],
            hasSkills: true,
            appIds: [],
          },
        ],
        extensionDiscovery: { diagnostics: [] },
      };
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.home.extensions.list()).resolves.toMatchObject({
      extensions: [
        {
          id: 'computer-use@openai-bundled',
          mcpServerIds: ['computer-use'],
          hasSkills: true,
        },
      ],
    });
    expect(electron.invoke).toHaveBeenCalledWith(
      DESKTOP_HOME_MANAGEMENT_CHANNELS.extensionsList,
      expect.objectContaining({
        schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
        endpointEpoch: 'application-1:window-1:1',
      }),
    );
    expect(JSON.stringify(electron.invoke.mock.calls)).not.toContain('capabilities');
  });

  it('routes strict global media-library mutations without exposing absolute paths', async () => {
    electron.invoke.mockImplementation(
      async (
        channel: string,
        request: {
          readonly requestId: string;
          readonly libraryId?: string;
          readonly locationKind?: string;
          readonly expectedRevision?: number;
        },
      ) => {
        if (channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesAdd) {
          return {
            schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
            requestId: request.requestId,
            status: 'added',
            libraryId: 'media-library:nas:Footage',
            revision: 4,
          };
        }
        const status =
          channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRemove
            ? 'removed'
            : 'revealed';
        return {
          schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
          requestId: request.requestId,
          status,
          libraryId: request.libraryId,
          revision: 4,
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.home.mediaLibraries.addLibrary('nas', 3)).resolves.toMatchObject({
      status: 'added',
      libraryId: 'media-library:nas:Footage',
    });
    await expect(
      bridge.home.mediaLibraries.removeLibrary('media-library:nas:Footage', 4),
    ).resolves.toMatchObject({ status: 'removed' });
    await expect(
      bridge.home.mediaLibraries.revealLibrary('media-library:nas:Footage', 4),
    ).resolves.toMatchObject({ status: 'revealed' });

    expect(electron.invoke.mock.calls).toEqual([
      [
        DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesAdd,
        expect.objectContaining({
          locationKind: 'nas',
          expectedRevision: 3,
        }),
      ],
      [
        DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRemove,
        expect.objectContaining({
          libraryId: 'media-library:nas:Footage',
          expectedRevision: 4,
        }),
      ],
      [
        DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesReveal,
        expect.objectContaining({
          libraryId: 'media-library:nas:Footage',
          expectedRevision: 4,
        }),
      ],
    ]);
    expect(JSON.stringify(electron.invoke.mock.calls)).not.toContain('absolutePath');
  });

  it('routes Asset lifecycle, thumbnail, and relink through distinct exact channels', async () => {
    electron.invoke.mockImplementation(
      async (
        channel: string,
        request: {
          readonly requestId: string;
          readonly assetId?: string;
          readonly libraryId?: string;
          readonly itemId?: string;
          readonly expectedRevision?: number;
          readonly expectedCatalogRevision?: number;
          readonly descriptorId?: string;
          readonly thumbnailRevision?: string;
          readonly variant?: string;
        },
      ) => {
        if (channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsImport) {
          return {
            schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
            requestId: request.requestId,
            status: 'completed',
            revision: 3,
            outcomes: [
              {
                status: 'added',
                label: 'hero.png',
                assetId: 'asset-library:abc123',
              },
            ],
          };
        }
        if (channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRemove) {
          return {
            schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
            requestId: request.requestId,
            status: 'removed',
            assetId: request.assetId,
            revision: 4,
          };
        }
        if (channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.libraryThumbnailResolve) {
          return {
            schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
            requestId: request.requestId,
            owner: 'asset-library',
            itemId: request.itemId,
            expectedCatalogRevision: request.expectedCatalogRevision,
            descriptorId: request.descriptorId,
            thumbnailRevision: request.thumbnailRevision,
            variant: request.variant,
            dataUrl: 'data:image/png;base64,AA==',
          };
        }
        if (channel === DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRelink) {
          return {
            schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
            requestId: request.requestId,
            status: 'relinked',
            libraryId: request.libraryId,
            revision: 5,
          };
        }
        throw new Error(`Unexpected Desktop Home channel '${channel}'.`);
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.home.assets.importFiles(2)).resolves.toMatchObject({
      status: 'completed',
      revision: 3,
    });
    await expect(bridge.home.assets.remove('asset-library:abc123', 3)).resolves.toMatchObject({
      status: 'removed',
      revision: 4,
    });
    await expect(
      bridge.home.libraryThumbnails.resolve({
        owner: 'asset-library',
        itemId: 'asset-library:abc123',
        expectedCatalogRevision: 4,
        descriptorId: 'asset-library:def456',
        thumbnailRevision: 'revision:4',
        variant: 'hover',
      }),
    ).resolves.toMatchObject({
      itemId: 'asset-library:abc123',
      variant: 'hover',
    });
    await expect(
      bridge.home.mediaLibraries.relinkLibrary('media-library:local:Footage', 4),
    ).resolves.toMatchObject({ status: 'relinked', revision: 5 });

    expect(electron.invoke.mock.calls.map(([channel]) => channel)).toEqual([
      DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsImport,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.assetsRemove,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.libraryThumbnailResolve,
      DESKTOP_HOME_MANAGEMENT_CHANNELS.mediaLibrariesRelink,
    ]);
    const serialized = JSON.stringify(electron.invoke.mock.calls);
    expect(serialized).not.toContain('absolutePath');
    expect(serialized).not.toContain('sourcePath');
    expect(serialized).not.toContain('trashPath');
  });

  it('rejects a mismatched result request identity', async () => {
    electron.invoke.mockResolvedValue({
      schemaVersion: DESKTOP_HOME_MANAGEMENT_CONTRACT_VERSION,
      requestId: 'different-request',
      status: 'cancelled',
      revision: 0,
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.home.assets.importFiles(0)).rejects.toThrow('does not match');
  });
});
