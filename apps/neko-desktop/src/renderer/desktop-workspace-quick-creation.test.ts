import { describe, expect, it, vi, type Mocked } from 'vitest';
import {
  RESOURCE_BROWSER_ROUTES,
  type ResourceBrowserIdentity,
  type ResourceBrowserProjection,
} from '@neko/assets-domain/resource-browser/contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import {
  activateWorkspaceMainGroup,
  createWorkspaceQuickCreationRequest,
  executeDesktopWorkspaceQuickCreation,
  type DesktopWorkspaceQuickCreationPorts,
} from './desktop-workspace-quick-creation';

const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:project-view-1',
  viewInstanceId: 'project-view-instance-1',
  rendererSessionId: 'renderer-1',
};

describe('Desktop Workspace quick creation', () => {
  it('activates the exact originating Main Group before canonical Resources creation', async () => {
    const workbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      main: {
        views: [],
        groups: [
          { groupId: 'main:primary', viewIds: [] },
          { groupId: 'main:secondary', viewIds: [] },
        ],
        activeGroupId: 'main:primary',
        split: { axis: 'columns' as const, ratio: 0.5 },
      },
    };
    const calls: string[] = [];
    const ports = createPorts({
      getResourceSnapshot: vi.fn(async () => {
        calls.push('resources:snapshot');
        return resourcesProjection;
      }),
      updateWorkbench: vi.fn(async (_workbenchInstanceId, next) => {
        calls.push(`workbench:${next.main.activeGroupId}`);
        return shellProjection;
      }),
      search: vi.fn(async (request) => {
        calls.push(`search:${request.source}:${request.query}`);
        return resourcesProjection;
      }),
      execute: vi.fn(async (request) => {
        calls.push(`execute:${request.route}:${request.documentKind}`);
        return {
          requestId: request.requestId,
          identity,
          status: 'completed' as const,
          projection: resourcesProjection,
        };
      }),
      getShellSnapshot: vi.fn(async () => {
        calls.push('shell:snapshot');
        return shellProjection;
      }),
    });

    const outcome = await executeDesktopWorkspaceQuickCreation(
      {
        requestId: 'quick-create-1',
        identity,
        workbenchInstanceId: 'workbench-1',
        workbench,
        mainGroupId: 'main:secondary',
        kind: 'canvas',
        name: 'Board',
      },
      ports,
    );

    expect(calls).toEqual([
      'workbench:main:secondary',
      'resources:snapshot',
      'search:files:',
      'execute:creative-document.create:canvas',
      'shell:snapshot',
    ]);
    expect(outcome.createdDocumentId).toBe('Board.nkc');
    expect(ports.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
        entryName: 'Board.nkc',
        documentKind: 'canvas',
      }),
    );
  });

  it('does not publish a redundant Workbench update for the current group', async () => {
    const workbench = createDefaultDesktopWorkbenchLayout('window-1');
    const ports = createPorts();
    await executeDesktopWorkspaceQuickCreation(
      {
        requestId: 'quick-create-2',
        identity,
        workbenchInstanceId: 'workbench-1',
        workbench,
        mainGroupId: 'main:primary',
        kind: 'file',
        name: 'notes.md',
      },
      ports,
    );
    expect(ports.updateWorkbench).not.toHaveBeenCalled();
    expect(ports.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        route: RESOURCE_BROWSER_ROUTES.createFile,
        entryName: 'notes.md',
      }),
    );
  });

  it('preserves a committed creative document diagnostic without retrying creation', async () => {
    const ports = createPorts({
      execute: vi.fn(async (request) => ({
        requestId: request.requestId,
        identity,
        status: 'completed' as const,
        projection: {
          ...resourcesProjection,
          diagnostics: [
            {
              code: 'creative-document-open-failed',
              message: "Created 'Board.nkc', but its editor could not open.",
            },
          ],
        },
      })),
    });
    const outcome = await executeDesktopWorkspaceQuickCreation(
      {
        requestId: 'quick-create-3',
        identity,
        workbenchInstanceId: 'workbench-1',
        workbench: createDefaultDesktopWorkbenchLayout('window-1'),
        mainGroupId: 'main:primary',
        kind: 'canvas',
        name: 'Board',
      },
      ports,
    );
    expect(outcome.retainedDiagnostic?.code).toBe('creative-document-open-failed');
    expect(ports.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale Main Group before Resources participates', () => {
    expect(() =>
      activateWorkspaceMainGroup(createDefaultDesktopWorkbenchLayout('window-1'), 'main:missing'),
    ).toThrow("Main Group 'main:missing' is unavailable");
  });

  it('builds fixed creative suffixes and leaves ordinary names unchanged', () => {
    expect(
      createWorkspaceQuickCreationRequest({
        requestId: 'canvas',
        identity,
        kind: 'canvas',
        name: 'Board.NKC',
      }).entryName,
    ).toBe('Board.NKC');
    expect(
      createWorkspaceQuickCreationRequest({
        requestId: 'cut',
        identity,
        kind: 'cut',
        name: 'Rough Cut',
      }).entryName,
    ).toBe('Rough Cut.otio');
    expect(
      createWorkspaceQuickCreationRequest({
        requestId: 'directory',
        identity,
        kind: 'directory',
        name: 'References',
      }).entryName,
    ).toBe('References');
  });
});

function createPorts(
  overrides: Partial<Mocked<DesktopWorkspaceQuickCreationPorts>> = {},
): Mocked<DesktopWorkspaceQuickCreationPorts> {
  return {
    getResourceSnapshot: vi.fn<DesktopWorkspaceQuickCreationPorts['getResourceSnapshot']>(
      async () => resourcesProjection,
    ),
    updateWorkbench: vi.fn<DesktopWorkspaceQuickCreationPorts['updateWorkbench']>(async () =>
      Promise.resolve(shellProjection),
    ),
    search: vi.fn<DesktopWorkspaceQuickCreationPorts['search']>(async () =>
      Promise.resolve(resourcesProjection),
    ),
    execute: vi.fn<DesktopWorkspaceQuickCreationPorts['execute']>(async (request) =>
      Promise.resolve({
        requestId: request.requestId,
        identity,
        status: 'completed' as const,
        projection: resourcesProjection,
      }),
    ),
    getShellSnapshot: vi.fn<DesktopWorkspaceQuickCreationPorts['getShellSnapshot']>(async () =>
      Promise.resolve(shellProjection),
    ),
    ...overrides,
  };
}

const resourcesProjection: ResourceBrowserProjection = {
  identity,
  source: 'files',
  query: '',
  items: [],
};

const shellProjection = {
  rendererSessionId: 'renderer-1',
} as unknown as import('@neko/host/desktop-shell-contract').DesktopShellProjection;
