import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_BROWSER_CONTRACT_VERSION,
  createResourceBrowserRecoveryPlanRequest,
  createResourceBrowserSnapshotRequest,
} from '@neko/assets-domain/resource-browser/contract';
import { DESKTOP_RESOURCE_BROWSER_CHANNELS } from '../shared/resource-browser-bridge-contract';
import {
  DESKTOP_PROJECT_PORTABILITY_CHANNELS,
  createDesktopProjectPortabilityRequest,
} from '@neko/assets-domain/contracts';

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

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewEpoch: 1,
  endpointEpoch: 'application-1:window-1:1',
} as const;
const portabilityIdentity = {
  projectId: identity.projectId,
  workspaceId: identity.workspaceId,
  windowId: identity.windowId,
  endpointEpoch: identity.endpointEpoch,
} as const;

describe('Desktop Resource Browser recovery preload bridge', () => {
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
        window: { windowId: 'window-1', rendererEpoch: 1 },
        host: { id: 'electron', kind: 'electron', ui: 'graphical' },
        runtime: { platform: 'darwin' },
        status: 'foundation-ready',
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.bootstrap.get();
    electron.invoke.mockReset();
  });

  it('sends only target-free recovery identity and intent fields', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        if (channel === DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet) {
          return projection();
        }
        if (channel === DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryPlan) {
          return {
            schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
            requestId: request.requestId,
            identity,
            resourceId: 'library-1',
            status: 'planned',
            plan: {
              contractVersion: 1,
              planId: 'media-library-recovery:plan-1',
              workspaceId: identity.workspaceId,
              libraryName: 'Footage',
              requirementRevision: 'requirements-1',
              operationRevision: 'sha256:operation',
              candidate: {
                kind: 'global-alias',
                name: 'Footage',
                locationKind: 'local',
              },
              referencedCount: 1,
              validatedCount: 1,
            },
          };
        }
        throw new Error(`Unexpected Resource Browser channel '${channel}'.`);
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.resources.getSnapshot(
      createResourceBrowserSnapshotRequest({ requestId: 'snapshot-1', identity }),
    );
    await expect(
      bridge.resources.planRecovery(
        createResourceBrowserRecoveryPlanRequest({
          requestId: 'recover-1',
          identity,
          resourceId: 'library-1',
          expectedRevision: 0,
          expectedOperationRevision: 'sha256:operation',
          candidate: 'existing-global',
        }),
      ),
    ).resolves.toMatchObject({
      status: 'planned',
      plan: { libraryName: 'Footage', candidate: { kind: 'global-alias' } },
    });

    const recoveryRequest = electron.invoke.mock.calls.find(
      ([channel]) => channel === DESKTOP_RESOURCE_BROWSER_CHANNELS.recoveryPlan,
    )?.[1];
    const serialized = JSON.stringify(recoveryRequest);
    expect(serialized).not.toContain('/Users/');
    expect(serialized).not.toContain('file:');
    expect(serialized).not.toContain('globalLibraryId');
    expect(serialized).not.toContain('registryRoot');
    expect(serialized).not.toContain('sourceDirectory');
  });

  it('rejects a Host recovery plan that contains a physical target', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        if (channel === DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet) return projection();
        return {
          schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
          requestId: request.requestId,
          identity,
          resourceId: 'library-1',
          status: 'planned',
          plan: {
            contractVersion: 1,
            planId: 'media-library-recovery:plan-1',
            workspaceId: identity.workspaceId,
            libraryName: 'Footage',
            requirementRevision: 'requirements-1',
            operationRevision: 'sha256:operation',
            candidate: {
              kind: 'global-alias',
              name: 'Footage',
              locationKind: 'local',
              targetPath: '/Users/private/Footage',
            },
            referencedCount: 1,
            validatedCount: 1,
          },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.resources.getSnapshot(
      createResourceBrowserSnapshotRequest({ requestId: 'snapshot-2', identity }),
    );

    await expect(
      bridge.resources.planRecovery(
        createResourceBrowserRecoveryPlanRequest({
          requestId: 'recover-2',
          identity,
          resourceId: 'library-1',
          expectedRevision: 0,
          expectedOperationRevision: 'sha256:operation',
          candidate: 'existing-global',
        }),
      ),
    ).rejects.toThrow('unsupported fields');
  });

  it('keeps portable snapshot destination and staging paths inside Main', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        if (channel !== DESKTOP_PROJECT_PORTABILITY_CHANNELS.plan) {
          throw new Error(`Unexpected project portability channel '${channel}'.`);
        }
        return {
          version: 1,
          requestId: request.requestId,
          identity: portabilityIdentity,
          status: 'planned',
          plan: {
            version: 1,
            snapshotId: 'snapshot-a',
            workspaceId: portabilityIdentity.workspaceId,
            requirementRevision: 'requirements:abc',
            operationRevision: 'sha256:abc',
            entryCount: 1,
            totalByteLength: 12,
            libraries: [{ libraryName: 'Footage', entryCount: 1, totalByteLength: 12 }],
          },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.projectPortability.plan(
        createDesktopProjectPortabilityRequest({
          requestId: 'portable-plan-1',
          identity: portabilityIdentity,
        }),
      ),
    ).resolves.toMatchObject({ status: 'planned', plan: { snapshotId: 'snapshot-a' } });

    const request = electron.invoke.mock.calls[0]?.[1];
    expect(JSON.stringify(request)).not.toMatch(
      /destination|staging|sourcePath|target|file:|\/Users\//u,
    );
  });

  it('rejects a target-bearing portable snapshot result from Main', async () => {
    electron.invoke.mockImplementation(
      async (_channel: string, request: { readonly requestId: string }) => ({
        version: 1,
        requestId: request.requestId,
        identity: portabilityIdentity,
        status: 'planned',
        plan: {
          version: 1,
          snapshotId: 'snapshot-a',
          workspaceId: portabilityIdentity.workspaceId,
          requirementRevision: 'requirements:abc',
          operationRevision: 'sha256:abc',
          entryCount: 0,
          totalByteLength: 0,
          libraries: [],
          destinationPath: '/Users/private/Portable',
        },
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.projectPortability.plan(
        createDesktopProjectPortabilityRequest({
          requestId: 'portable-plan-2',
          identity: portabilityIdentity,
        }),
      ),
    ).rejects.toThrow('unsupported fields');
  });
});

function projection() {
  return {
    schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
    identity,
    revision: 0,
    facet: 'media' as const,
    query: '',
    items: [
      {
        resourceId: 'library-1',
        facet: 'media' as const,
        role: 'library-root' as const,
        depth: 0,
        kind: 'directory' as const,
        label: 'Footage',
        libraryName: 'Footage',
        locator: { kind: 'workspace-file' as const, path: 'neko/assets/Footage' },
        capabilities: [],
        libraryStatus: {
          libraryName: 'Footage',
          state: 'required-unlinked' as const,
          referenceCount: 1,
          missingCount: 1,
          operationRevision: 'sha256:operation',
        },
      },
    ],
  };
}
