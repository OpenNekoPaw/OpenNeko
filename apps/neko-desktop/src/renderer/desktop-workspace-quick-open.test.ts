import { describe, expect, it, vi, type Mocked } from 'vitest';
import {
  createCanvasWorkspaceContextCatalog,
  createCanvasWorkspaceContextCatalogOption,
  createCanvasWorkspaceTarget,
  createDefaultCanvasWorkspaceTarget,
} from '@neko/canvas-domain';
import {
  createDefaultDesktopWorkbenchLayout,
  openOrFocusMainView,
} from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from '@neko/host/desktop-scene-contract';
import {
  projectDesktopConversationNavigation,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';
import {
  executeDesktopWorkspaceQuickOpen,
  type DesktopWorkspaceQuickOpenPorts,
} from './desktop-workspace-quick-open';

describe('Desktop Workspace quick open', () => {
  it('opens the canonical default Canvas in the exact empty Main Group without file lookup', async () => {
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
    const ports = createPorts();
    await executeDesktopWorkspaceQuickOpen(
      {
        requestId: 'quick-open-default',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
        workbenchInstanceId: 'workbench-1',
        workbench,
        mainGroupId: 'main:secondary',
        suggestion: {
          kind: 'default-canvas',
          canvasId: 'neko/boards/workspace.nkc',
          label: 'workspace.nkc',
        },
        createId: () => 'default-view-1',
      },
      ports,
    );

    const opened = ports.updateWorkbench.mock.calls[0]?.[1];
    expect(opened?.main.activeGroupId).toBe('main:secondary');
    expect(opened?.main.views).toEqual([
      expect.objectContaining({
        viewInstanceId: 'view-instance:default-view-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        displayLabel: 'workspace.nkc',
        documentId: 'neko/boards/workspace.nkc',
      }),
    ]);
    expect(ports.readCanvasCatalog).not.toHaveBeenCalled();
    expect(ports.openCanvasDocument).not.toHaveBeenCalled();
  });

  it('re-resolves an indexed Canvas before opening it through the Canvas owner', async () => {
    const calls: string[] = [];
    const ports = createPorts({
      readCanvasCatalog: vi.fn(async (request) => {
        calls.push(`catalog:${request.workspaceId}`);
        return { requestId: request.requestId, catalog: canvasCatalog('workspace-1', true) };
      }),
      openCanvasDocument: vi.fn(async (request) => {
        calls.push(`open:${request.canvasId}`);
        return { requestId: request.requestId, status: 'opened' as const };
      }),
      getShellSnapshot: vi.fn(async () => {
        calls.push('shell:snapshot');
        return shellProjection;
      }),
    });

    await executeDesktopWorkspaceQuickOpen(
      {
        requestId: 'quick-open-story',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
        workbenchInstanceId: 'workbench-1',
        workbench: createDefaultDesktopWorkbenchLayout('window-1'),
        mainGroupId: 'main:primary',
        suggestion: {
          kind: 'canvas-document',
          canvasId: 'boards/story.nkc',
          label: 'story.nkc',
        },
      },
      ports,
    );

    expect(calls).toEqual(['catalog:workspace-1', 'open:boards/story.nkc', 'shell:snapshot']);
    expect(ports.updateWorkbench).not.toHaveBeenCalled();
  });

  it('rejects a colliding default Canvas View from another Workspace', async () => {
    const workbench = openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-1'), {
      viewId: 'canvas:project-1:workspace',
      viewInstanceId: 'view-instance:other-workspace',
      projectId: 'project-1',
      workspaceId: 'workspace-2',
      kind: 'canvas',
      ownerId: 'canvas:project-1',
      displayLabel: 'workspace.nkc',
      documentId: 'neko/boards/workspace.nkc',
    });
    const ports = createPorts();

    await expect(
      executeDesktopWorkspaceQuickOpen(
        {
          requestId: 'quick-open-default-collision',
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant-1',
          workbenchInstanceId: 'workbench-1',
          workbench,
          mainGroupId: 'main:primary',
          suggestion: {
            kind: 'default-canvas',
            canvasId: 'neko/boards/workspace.nkc',
            label: 'workspace.nkc',
          },
        },
        ports,
      ),
    ).rejects.toThrow('has an invalid identity');
    expect(ports.updateWorkbench).not.toHaveBeenCalled();
  });

  it('fails locally when the suggested Canvas is stale', async () => {
    const ports = createPorts({
      readCanvasCatalog: vi.fn(async (request) => ({
        requestId: request.requestId,
        catalog: canvasCatalog('workspace-1', false),
      })),
    });
    await expect(
      executeDesktopWorkspaceQuickOpen(
        {
          requestId: 'quick-open-stale',
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant-1',
          workbenchInstanceId: 'workbench-1',
          workbench: createDefaultDesktopWorkbenchLayout('window-1'),
          mainGroupId: 'main:primary',
          suggestion: {
            kind: 'canvas-document',
            canvasId: 'boards/story.nkc',
            label: 'story.nkc',
          },
        },
        ports,
      ),
    ).rejects.toThrow("'boards/story.nkc' is no longer available");
    expect(ports.openCanvasDocument).not.toHaveBeenCalled();
  });
});

function createPorts(
  overrides: Partial<Mocked<DesktopWorkspaceQuickOpenPorts>> = {},
): Mocked<DesktopWorkspaceQuickOpenPorts> {
  return {
    updateWorkbench: vi.fn<DesktopWorkspaceQuickOpenPorts['updateWorkbench']>(async () =>
      Promise.resolve(shellProjection),
    ),
    readCanvasCatalog: vi.fn<DesktopWorkspaceQuickOpenPorts['readCanvasCatalog']>(async (request) =>
      Promise.resolve({
        requestId: request.requestId,
        catalog: canvasCatalog('workspace-1', true),
      }),
    ),
    openCanvasDocument: vi.fn<DesktopWorkspaceQuickOpenPorts['openCanvasDocument']>(
      async (request) => Promise.resolve({ requestId: request.requestId, status: 'opened' }),
    ),
    getShellSnapshot: vi.fn<DesktopWorkspaceQuickOpenPorts['getShellSnapshot']>(async () =>
      Promise.resolve(shellProjection),
    ),
    ...overrides,
  };
}

function canvasCatalog(workspaceId: string, includeStory: boolean) {
  return createCanvasWorkspaceContextCatalog({
    workspaceId,
    options: [
      createCanvasWorkspaceContextCatalogOption({
        target: createDefaultCanvasWorkspaceTarget(workspaceId),
        label: 'workspace.nkc',
      }),
      ...(includeStory
        ? [
            createCanvasWorkspaceContextCatalogOption({
              target: createCanvasWorkspaceTarget(workspaceId, 'boards/story.nkc'),
              label: 'story.nkc',
            }),
          ]
        : []),
    ],
  });
}

const shellProjection = createShellProjection();

function createShellProjection(): DesktopShellProjection {
  const catalog = { projects: [] } as const;
  const agentHome = {
    conversations: [],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  } as const;
  const scene = createDefaultDesktopAgentScene('window-1', 'draft:test');
  return {
    applicationInstanceId: 'app-1',
    rendererSessionId: 'app-1:window-1:1',
    catalog,
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: createDesktopWindowComposition({
        workbenchInstanceId: 'workbench:window-1:entry',
        layout: createDefaultDesktopWorkbenchLayout('window-1'),
        scene,
      }),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome,
    conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome, []),
    domains: [],
  };
}
