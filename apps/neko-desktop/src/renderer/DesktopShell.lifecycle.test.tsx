// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
} from '@neko/host/application-settings';
import {
  projectDesktopConversationNavigation,
  resolveActiveDesktopWindowWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  createDefaultDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import {
  closeDesktopAgentSurface,
  createDesktopWorkbenchInstanceFromScene,
  parseDesktopWindowWorkbenchCatalog,
  putDesktopAgentSurface,
} from '@neko/host/desktop-workbench-instance-contract';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { DesktopShellView } from './DesktopShell';
import { createDesktopI18n } from './i18n';

const cutLifecycle = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
}));
const canvasLifecycle = vi.hoisted(() => ({
  mounts: new Map<string, number>(),
  unmounts: new Map<string, number>(),
}));
const agentLifecycle = vi.hoisted(() => ({
  mounts: new Map<string, number>(),
  unmounts: new Map<string, number>(),
}));

vi.mock('./DesktopAgentSurface', async () => {
  const { useEffect } = await import('react');
  const AgentSurface = ({ id, active }: { readonly id: string; readonly active: boolean }) => {
    useEffect(() => {
      agentLifecycle.mounts.set(id, (agentLifecycle.mounts.get(id) ?? 0) + 1);
      return () => {
        agentLifecycle.unmounts.set(id, (agentLifecycle.unmounts.get(id) ?? 0) + 1);
      };
    }, [id]);
    return <div data-agent-surface-id={id} hidden={!active} />;
  };
  return {
    DesktopAgentSurface: () => <div data-testid="desktop-agent-surface" />,
    RetainedDesktopAgentSurfaceDeck: ({
      activeAgentSurfaceId,
      surfaces,
    }: {
      readonly activeAgentSurfaceId?: string;
      readonly surfaces: readonly { readonly agentSurfaceId: string }[];
    }) => (
      <div data-testid="desktop-agent-surface-deck">
        {surfaces.map((surface) => (
          <AgentSurface
            key={surface.agentSurfaceId}
            active={surface.agentSurfaceId === activeAgentSurfaceId}
            id={surface.agentSurfaceId}
          />
        ))}
      </div>
    ),
  };
});

vi.mock('./DesktopCanvasSurface', async () => {
  const { useEffect } = await import('react');
  return {
    DesktopCanvasSurface: ({
      lifecyclePresentation,
      view,
    }: {
      readonly lifecyclePresentation: 'active' | 'suspended';
      readonly view: { readonly viewId: string };
    }) => {
      useEffect(() => {
        canvasLifecycle.mounts.set(view.viewId, (canvasLifecycle.mounts.get(view.viewId) ?? 0) + 1);
        return () => {
          canvasLifecycle.unmounts.set(
            view.viewId,
            (canvasLifecycle.unmounts.get(view.viewId) ?? 0) + 1,
          );
        };
      }, [view.viewId]);
      return (
        <div
          data-testid="desktop-canvas-surface"
          data-canvas-view-id={view.viewId}
          data-lifecycle-presentation={lifecyclePresentation}
        />
      );
    },
  };
});

vi.mock('@neko/assets-webview/project-portability/control', () => ({
  ProjectPortabilityControl: () => null,
}));

vi.mock('./DesktopCutSurface', async () => {
  const { useEffect } = await import('react');
  return {
    DesktopCutSurface: ({
      presentation = 'editor',
      timelineTarget,
    }: {
      readonly presentation?: 'editor' | 'timeline-only';
      readonly timelineTarget?: Element;
    }) => {
      useEffect(() => {
        cutLifecycle.mounts += 1;
        return () => {
          cutLifecycle.unmounts += 1;
        };
      }, []);
      return (
        <div
          data-testid="desktop-cut-surface"
          data-presentation={presentation}
          data-timeline-target={timelineTarget ? 'attached' : 'missing'}
        />
      );
    },
  };
});

describe('DesktopShell creative view lifecycle', () => {
  beforeEach(() => {
    cutLifecycle.mounts = 0;
    cutLifecycle.unmounts = 0;
    canvasLifecycle.mounts.clear();
    canvasLifecycle.unmounts.clear();
    agentLifecycle.mounts.clear();
    agentLifecycle.unmounts.clear();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps one Cut editor runtime mounted and attached to Timeline while another tab is active', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const initial = projectProjection('cut:view-1:story');

    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={initial} />));
    });
    const cutSurface = container.querySelector<HTMLElement>('[data-testid="desktop-cut-surface"]');

    expect(cutSurface?.dataset.presentation).toBe('editor');
    expect(cutSurface?.dataset.timelineTarget).toBe('attached');
    expect(cutLifecycle).toEqual({ mounts: 1, unmounts: 0 });

    const switched = projectProjection(
      'canvas:view-1:board',
      resolveActiveDesktopWindowWorkbench(initial.window).layout,
    );
    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={switched} />));
    });

    expect(container.querySelector('[data-testid="desktop-canvas-surface"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="desktop-cut-surface"]')).toHaveLength(1);
    expect(container.querySelector('[data-presentation="timeline-only"]')).toBeNull();
    expect(container.querySelector('[data-testid="desktop-cut-surface"]')).toBe(cutSurface);
    expect(cutSurface?.closest('[data-main-view-id]')?.hasAttribute('hidden')).toBe(true);
    expect(cutSurface?.dataset.timelineTarget).toBe('attached');
    expect(cutLifecycle).toEqual({ mounts: 1, unmounts: 0 });

    await act(async () => {
      root.render(
        renderShell(
          <DesktopShellView
            projection={projectProjection(
              'canvas:view-1:board',
              resolveActiveDesktopWindowWorkbench(switched.window).layout,
              false,
            )}
          />,
        ),
      );
    });

    expect(container.querySelector('[data-testid="desktop-cut-surface"]')).toBeNull();
    expect(cutLifecycle).toEqual({ mounts: 1, unmounts: 1 });

    await act(async () => root.unmount());
    container.remove();
  });

  it('retains two Workspace trees and releases only the exact closed instance', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const initial = addSecondWorkspace(projectProjection('canvas:view-1:board'));

    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={initial} />));
    });

    expect(container.querySelectorAll('[data-canvas-view-id]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-agent-surface-id]')).toHaveLength(2);
    expect(canvasLifecycle.mounts).toEqual(
      new Map([
        ['canvas:view-1:board', 1],
        ['canvas:view-2:board', 1],
      ]),
    );
    expect(
      container
        .querySelector('[data-canvas-view-id="canvas:view-1:board"]')
        ?.getAttribute('data-lifecycle-presentation'),
    ).toBe('active');
    expect(
      container
        .querySelector('[data-canvas-view-id="canvas:view-2:board"]')
        ?.getAttribute('data-lifecycle-presentation'),
    ).toBe('suspended');

    const switched = activateWorkbench(initial, 'workbench:workspace-2', 'tab-2');
    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={switched} />));
    });

    expect(canvasLifecycle.mounts.get('canvas:view-1:board')).toBe(1);
    expect(canvasLifecycle.mounts.get('canvas:view-2:board')).toBe(1);
    expect(canvasLifecycle.unmounts.size).toBe(0);
    expect(
      container
        .querySelector('[data-canvas-view-id="canvas:view-1:board"]')
        ?.getAttribute('data-lifecycle-presentation'),
    ).toBe('suspended');
    expect(
      container
        .querySelector('[data-canvas-view-id="canvas:view-2:board"]')
        ?.getAttribute('data-lifecycle-presentation'),
    ).toBe('active');

    const closed = {
      ...switched,
      window: {
        ...switched.window,
        activeTarget: { kind: 'project' as const, tabId: 'tab-1' },
        tabs: switched.window.tabs.filter((tab) => tab.tabId !== 'tab-2'),
        workbenches: parseDesktopWindowWorkbenchCatalog({
          ...switched.window.workbenches,
          activeWorkbenchInstanceId: 'workbench:workspace-1',
          instances: switched.window.workbenches.instances.filter(
            (instance) => instance.workbenchInstanceId !== 'workbench:workspace-2',
          ),
        }),
      },
    };
    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={closed} />));
    });

    expect(canvasLifecycle.unmounts.get('canvas:view-2:board')).toBe(1);
    expect(canvasLifecycle.unmounts.get('canvas:view-1:board')).toBeUndefined();
    expect(agentLifecycle.unmounts.get('agent-surface:workspace-2:draft')).toBe(1);
    expect(agentLifecycle.unmounts.get('agent-surface:workspace-1:draft')).toBeUndefined();
    expect(container.querySelectorAll('[data-agent-surface-id]')).toHaveLength(1);

    await act(async () => root.unmount());
    expect(canvasLifecycle.unmounts.get('canvas:view-1:board')).toBe(1);
    expect(canvasLifecycle.unmounts.get('canvas:view-2:board')).toBe(1);
    expect(agentLifecycle.unmounts.get('agent-surface:workspace-1:draft')).toBe(1);
    expect(agentLifecycle.unmounts.get('agent-surface:workspace-2:draft')).toBe(1);
    container.remove();
  });

  it('retains multiple Agent Surfaces in one Workspace and closes only the exact conversation', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const initial = projectProjection('canvas:view-1:board');
    const secondActive = addSecondWorkspaceConversation(initial);

    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={secondActive} />));
    });

    expect(container.querySelectorAll('[data-agent-surface-id]')).toHaveLength(2);
    expect(agentLifecycle.mounts).toEqual(
      new Map([
        ['agent-surface:workspace-1:draft', 1],
        ['agent-surface:workspace-1:conversation-2', 1],
      ]),
    );

    const firstActive = activateFirstWorkspaceConversation(secondActive, initial);
    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={firstActive} />));
    });

    expect(agentLifecycle.mounts.get('agent-surface:workspace-1:draft')).toBe(1);
    expect(agentLifecycle.mounts.get('agent-surface:workspace-1:conversation-2')).toBe(1);
    expect(agentLifecycle.unmounts.size).toBe(0);

    const closed = closeSecondWorkspaceConversation(firstActive);
    await act(async () => {
      root.render(renderShell(<DesktopShellView projection={closed} />));
    });

    expect(agentLifecycle.unmounts.get('agent-surface:workspace-1:conversation-2')).toBe(1);
    expect(agentLifecycle.unmounts.get('agent-surface:workspace-1:draft')).toBeUndefined();
    expect(container.querySelectorAll('[data-agent-surface-id]')).toHaveLength(1);

    await act(async () => root.unmount());
    expect(agentLifecycle.unmounts.get('agent-surface:workspace-1:draft')).toBe(1);
    expect(agentLifecycle.unmounts.get('agent-surface:workspace-1:conversation-2')).toBe(1);
    container.remove();
  });
});

function renderShell(node: JSX.Element): JSX.Element {
  const i18n = createDesktopI18n('en');
  return (
    <I18nProvider service={i18n.i18nService}>
      <DesktopApplicationSettingsProvider
        value={{
          projection: {
            eventSequence: 0,
            preferences: DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
          },
          update: async () => undefined,
          openAgentAdvanced: async () => undefined,
        }}
      >
        {node}
      </DesktopApplicationSettingsProvider>
    </I18nProvider>
  );
}

function projectProjection(
  activeViewId: 'cut:view-1:story' | 'canvas:view-1:board',
  previous?: DesktopWorkbenchLayoutProjection,
  includeCut = true,
): DesktopShellProjection {
  const project = {
    projectId: 'content:workspace-1',
    workspaceId: 'workspace-1',
    profile: 'content' as const,
    displayName: 'Fixture',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  };
  const base = previous ?? createDefaultDesktopWorkbenchLayout('window-1');
  const allViews: DesktopWorkbenchLayoutProjection['main']['views'] = [
    {
      viewId: 'cut:view-1:story',
      viewInstanceId: 'view-instance-1',
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'cut',
      ownerId: 'cut-session:story',
      displayLabel: 'story.otio',
      documentId: 'cuts/story.otio',
    },
    {
      viewId: 'canvas:view-1:board',
      viewInstanceId: 'view-instance-1',
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'canvas',
      ownerId: 'canvas-session:board',
      displayLabel: 'board.nkc',
      documentId: 'boards/board.nkc',
    },
  ];
  const views = includeCut ? allViews : allViews.filter((view) => view.kind !== 'cut');
  const workbench: DesktopWorkbenchLayoutProjection = {
    ...base,
    display: {
      ...base.display,
      mode: 'main-only',
    },
    main: {
      views,
      groups: [
        {
          groupId: 'main:primary',
          viewIds: views.map((view) => view.viewId),
          activeViewId,
        },
      ],
      activeGroupId: 'main:primary',
    },
    timeline: {
      presentation: includeCut ? 'docked' : 'hidden',
      ...(includeCut ? { ownerViewId: 'cut:view-1:story' } : {}),
      height: 280,
    },
  };
  const catalog = { revision: 1, projects: [project] };
  const agentHome = {
    revision: 0,
    conversations: [],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  } as const;
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId: 'scene:window-1:workspace-1',
    windowId: 'window-1',
    context: {
      kind: 'agent',
      agentViewId: 'view-1',
      scope: {
        kind: 'workspace',
        draftId: 'draft-workspace-1',
        workspaceId: project.workspaceId,
        workspaceGrantId: 'workspace-grant-1',
      },
    },
    slots: {
      interaction: {
        kind: 'agent',
        agentViewId: 'view-1',
        phase: 'draft',
        scope: {
          kind: 'workspace',
          draftId: 'draft-workspace-1',
          workspaceId: project.workspaceId,
          workspaceGrantId: 'workspace-grant-1',
        },
      },
      main: {
        kind: 'workspace-main',
        workspaceId: project.workspaceId,
        viewId: activeViewId,
        viewInstanceId: 'view-instance-1',
      },
      timeline: {
        kind: 'workspace-timeline',
        workspaceId: project.workspaceId,
        viewId: 'cut:view-1:story',
        viewInstanceId: 'view-instance-1',
        ownerId: 'cut-session:story',
      },
      status: {
        kind: 'scene-status',
        sceneId: 'scene:window-1:workspace-1',
      },
    },
  });
  const workbenchInstance = createDesktopWorkbenchInstanceFromScene({
    workbenchInstanceId: 'workbench:workspace-1',
    agentSurfaceId: 'agent-surface:workspace-1:draft',
    layout: workbench,
    scene,
  });
  return {
    applicationInstanceId: 'app-1',
    rendererSessionId: 'app-1:window-1:1',
    catalog,
    window: {
      windowId: 'window-1',
      revision: 1,
      activeTarget: { kind: 'project', tabId: 'tab-1' },
      tabs: [
        {
          tabId: 'tab-1',
          projectId: project.projectId,
          viewId: 'view-1',
          viewInstanceId: 'view-instance-1',
        },
      ],
      workbenches: parseDesktopWindowWorkbenchCatalog({
        windowId: 'window-1',
        activeWorkbenchInstanceId: workbenchInstance.workbenchInstanceId,
        instances: [workbenchInstance],
      }),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome,
    conversationNavigation: projectDesktopConversationNavigation(catalog, agentHome),
    domains: [
      { surface: 'agent', status: 'ready', ownerSlice: 'P1.3' },
      { surface: 'canvas', status: 'ready', ownerSlice: 'P1.4' },
      { surface: 'cut', status: 'ready', ownerSlice: 'P1.5' },
    ],
  };
}

function addSecondWorkspace(projection: DesktopShellProjection): DesktopShellProjection {
  const project = {
    projectId: 'content:workspace-2',
    workspaceId: 'workspace-2',
    profile: 'content' as const,
    displayName: 'Fixture 2',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  };
  const layout = {
    ...createDefaultDesktopWorkbenchLayout('window-1'),
    display: { mode: 'main-only' as const, chatPosition: 'left' as const, chatWidth: 360 },
    main: {
      views: [
        {
          viewId: 'canvas:view-2:board',
          viewInstanceId: 'view-instance-1',
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          kind: 'canvas' as const,
          ownerId: 'canvas-session:board-2',
          displayLabel: 'board-2.nkc',
          documentId: 'boards/board-2.nkc',
        },
      ],
      groups: [
        {
          groupId: 'main:primary' as const,
          viewIds: ['canvas:view-2:board'],
          activeViewId: 'canvas:view-2:board',
        },
      ],
      activeGroupId: 'main:primary' as const,
    },
  };
  const scope = {
    kind: 'workspace' as const,
    draftId: 'draft-workspace-2',
    workspaceId: project.workspaceId,
    workspaceGrantId: 'workspace-grant-2',
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    sceneId: 'scene:window-1:workspace-2',
    windowId: 'window-1',
    context: { kind: 'agent', agentViewId: 'view-2', scope },
    slots: {
      interaction: { kind: 'agent', agentViewId: 'view-2', phase: 'draft', scope },
      main: {
        kind: 'workspace-main',
        workspaceId: project.workspaceId,
        viewId: 'canvas:view-2:board',
        viewInstanceId: 'view-instance-1',
      },
      status: { kind: 'scene-status', sceneId: 'scene:window-1:workspace-2' },
    },
  });
  const second = createDesktopWorkbenchInstanceFromScene({
    workbenchInstanceId: 'workbench:workspace-2',
    agentSurfaceId: 'agent-surface:workspace-2:draft',
    layout,
    scene,
  });
  return {
    ...projection,
    catalog: {
      ...projection.catalog,
      projects: [...projection.catalog.projects, project],
    },
    window: {
      ...projection.window,
      tabs: [
        ...projection.window.tabs,
        {
          tabId: 'tab-2',
          projectId: project.projectId,
          viewId: 'view-2',
          viewInstanceId: 'view-instance-1',
        },
      ],
      workbenches: parseDesktopWindowWorkbenchCatalog({
        ...projection.window.workbenches,
        instances: [...projection.window.workbenches.instances, second],
      }),
    },
  };
}

function activateWorkbench(
  projection: DesktopShellProjection,
  workbenchInstanceId: string,
  tabId: string,
): DesktopShellProjection {
  return {
    ...projection,
    window: {
      ...projection.window,
      activeTarget: { kind: 'project', tabId },
      workbenches: parseDesktopWindowWorkbenchCatalog({
        ...projection.window.workbenches,
        activeWorkbenchInstanceId: workbenchInstanceId,
      }),
    },
  };
}

function addSecondWorkspaceConversation(
  projection: DesktopShellProjection,
): DesktopShellProjection {
  const instance = resolveActiveDesktopWindowWorkbench(projection.window);
  if (
    instance.scene.context.kind !== 'agent' ||
    instance.scene.context.scope.kind !== 'workspace'
  ) {
    throw new Error('Workspace fixture is required.');
  }
  const scope = {
    ...instance.scene.context.scope,
    conversationId: 'conversation-2',
  };
  const scene = parseDesktopWorkbenchSceneProjection({
    ...instance.scene,
    context: { ...instance.scene.context, scope },
    slots: {
      ...instance.scene.slots,
      interaction: {
        kind: 'agent',
        agentViewId: instance.scene.context.agentViewId,
        phase: 'session',
        scope,
      },
    },
  });
  const interaction = scene.slots.interaction;
  if (!interaction) throw new Error('Workspace Agent interaction fixture is required.');
  return {
    ...projection,
    window: {
      ...projection.window,
      workbenches: putDesktopAgentSurface({
        catalog: projection.window.workbenches,
        workbenchInstanceId: instance.workbenchInstanceId,
        surface: {
          agentSurfaceId: 'agent-surface:workspace-1:conversation-2',
          lifecycle: 'hot-retained',
          interaction,
        },
        scene,
      }),
    },
  };
}

function activateFirstWorkspaceConversation(
  projection: DesktopShellProjection,
  initial: DesktopShellProjection,
): DesktopShellProjection {
  const initialInstance = resolveActiveDesktopWindowWorkbench(initial.window);
  const initialSurface = initialInstance.agentSurfaces[0];
  if (!initialSurface) throw new Error('Initial Agent Surface fixture is required.');
  return {
    ...projection,
    window: {
      ...projection.window,
      workbenches: putDesktopAgentSurface({
        catalog: projection.window.workbenches,
        workbenchInstanceId: initialInstance.workbenchInstanceId,
        surface: initialSurface,
        scene: initialInstance.scene,
      }),
    },
  };
}

function closeSecondWorkspaceConversation(
  projection: DesktopShellProjection,
): DesktopShellProjection {
  return {
    ...projection,
    window: {
      ...projection.window,
      workbenches: closeDesktopAgentSurface({
        catalog: projection.window.workbenches,
        workbenchInstanceId: 'workbench:workspace-1',
        agentSurfaceId: 'agent-surface:workspace-1:conversation-2',
      }),
    },
  };
}
