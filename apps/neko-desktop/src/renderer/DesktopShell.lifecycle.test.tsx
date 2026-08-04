// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import { AGENT_HOME_PROJECTION_VERSION } from '@neko/agent-contracts';
import {
  DEFAULT_DESKTOP_APPLICATION_PREFERENCES,
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
} from '@neko/host/application-settings';
import {
  DESKTOP_SHELL_CONTRACT_VERSION,
  projectDesktopConversationNavigation,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  createDefaultDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';
import {
  DESKTOP_SCENE_CONTRACT_VERSION,
  createDefaultDesktopApplicationSidebar,
  parseDesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { DesktopShellView } from './DesktopShell';
import { createDesktopI18n } from './i18n';

const cutLifecycle = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
}));

vi.mock('./DesktopAgentSurface', () => ({
  DesktopAgentSurface: () => <div data-testid="desktop-agent-surface" />,
}));

vi.mock('./DesktopCanvasSurface', () => ({
  DesktopCanvasSurface: () => <div data-testid="desktop-canvas-surface" />,
}));

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

    const switched = projectProjection('canvas:view-1:board', initial.window.workbench);
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
            projection={projectProjection('canvas:view-1:board', switched.window.workbench, false)}
          />,
        ),
      );
    });

    expect(container.querySelector('[data-testid="desktop-cut-surface"]')).toBeNull();
    expect(cutLifecycle).toEqual({ mounts: 1, unmounts: 1 });

    await act(async () => root.unmount());
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
            schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
            revision: 0,
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
      viewEpoch: 1,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'cut',
      ownerId: 'cut-session:story',
      displayLabel: 'story.otio',
      documentId: 'cuts/story.otio',
    },
    {
      viewId: 'canvas:view-1:board',
      viewEpoch: 1,
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
    revision: base.revision + 1,
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
    schemaVersion: AGENT_HOME_PROJECTION_VERSION,
    revision: 0,
    conversations: [],
    attention: { needsInput: 0, needsReview: 0, running: 0 },
  } as const;
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 2,
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
          viewEpoch: 1,
        },
      ],
      workbench,
      scene: parseDesktopWorkbenchSceneProjection({
        schemaVersion: DESKTOP_SCENE_CONTRACT_VERSION,
        sceneId: 'scene:window-1:workspace-1',
        windowId: 'window-1',
        revision: 1,
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
            viewEpoch: 1,
          },
          timeline: {
            kind: 'workspace-timeline',
            workspaceId: project.workspaceId,
            viewId: 'cut:view-1:story',
            viewEpoch: 1,
            ownerId: 'cut-session:story',
          },
          status: {
            kind: 'scene-status',
            sceneId: 'scene:window-1:workspace-1',
          },
        },
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
