import {
  CloseIcon,
  ControlledWorkbenchShell,
  FolderIcon,
  GridIcon,
  IconButton,
  PackageIcon,
  PlusIcon,
  RetainedSurfaceDeck,
  SearchIcon,
  SettingsIcon,
  StorylineIcon,
  Tooltip,
  TooltipProvider,
  TrashIcon,
  WarningIcon,
  WorkbenchEditorTabs,
  toCodiconClassName,
  type ControlledWorkbenchResizeBinding,
  type ControlledWorkbenchShellProps,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  DesktopAgentHomeConversationSummary,
  DesktopConversationNavigationGroup,
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { resolveActiveDesktopWindowWorkbench } from '@neko/host/desktop-shell-contract';
import {
  DESKTOP_WORKBENCH_LIMITS,
  closeMainView,
  openOrFocusMainView,
  reorderMainView,
  resolveDesktopWorkbenchViewLifecycle,
  resizeMainSplit,
  setWorkbenchDisplayMode,
  type DesktopWorkbenchLayoutProjection,
  type DesktopWorkbenchMainGroup,
} from '@neko/host/desktop-workbench-contract';
import {
  DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS,
  type DesktopApplicationSidebarProjection,
  type DesktopSceneTransitionIntent,
  type DesktopWorkbenchSceneProjection,
} from '@neko/host/desktop-scene-contract';
import {
  RetainedDesktopAgentSurfaceDeck,
  type DesktopAgentSurfaceProps,
} from './DesktopAgentSurface';
import { DesktopResourceBrowserSurface } from './DesktopResourceBrowserSurface';
import { DesktopPreviewSurface } from './DesktopPreviewSurface';
import { DesktopCanvasSurface } from './DesktopCanvasSurface';
import { DesktopCutSurface } from './DesktopCutSurface';
import {
  DesktopSettingsMainSurface,
  DesktopSettingsNavigationSurface,
  parseDesktopSettingsSection,
} from './DesktopSettingsSurface';
import { DesktopAssetManagementSurface } from './DesktopAssetManagementSurface';
import { DesktopExtensionManagementSurface } from './DesktopExtensionManagementSurface';
import { DesktopExtensionManagementRuntime } from './desktop-extension-management-runtime';
import { DesktopProjectCatalogSurface } from './DesktopProjectManagementSurface';
import { DesktopAssetCenterMainSurface } from './DesktopAssetCenterMainSurface';
import { DesktopAssistantPreviewSurface } from './DesktopAssistantPreviewSurface';
import { DesktopAssetCenterRuntime } from './desktop-asset-center-runtime';
import type { AssetCenterSessionProjection } from '@neko/assets-domain/asset-center/contract';
import { useDesktopApplicationSettings } from './application-settings-context';
import { ProjectPortabilityControl } from '@neko/assets-webview/project-portability/control';
import type { OpenNekoDesktopProjectPortabilityBridge } from '@neko/assets-domain/contracts';
import {
  DesktopApplicationBrand,
  DesktopApplicationNavigationButton,
} from './DesktopApplicationSidebar';
import {
  createAgentDraftPresentation,
  createAgentSessionPresentation,
  type AgentRootPresentation,
} from '@neko/agent-contracts';
import type {
  DesktopAgentSurfaceProjection,
  DesktopWorkbenchInstanceProjection,
} from '@neko/host/desktop-workbench-instance-contract';
import { DesktopSurfaceErrorBoundary } from './DesktopSurfaceErrorBoundary';

type ShellState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: DesktopShellProjection }
  | { readonly kind: 'error'; readonly message: string };

type HomeSection = 'create' | 'assets' | 'extensions' | 'projects';
type TranslationFunction = ReturnType<typeof useTranslation>['t'];

export const MANAGEMENT_MAIN_SPLIT_DEFAULT_RATIO = 0.5;
export const MANAGEMENT_MAIN_SPLIT_MIN_RATIO = 0.5;

interface ShellActions {
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onDeleteConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onRemoveRecentProject: (project: DesktopProjectCatalogItem) => void;
  readonly onUpdateWorkbench: (
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ) => void;
  readonly onUpdateApplicationSidebar: (sidebar: DesktopApplicationSidebarProjection) => void;
  readonly onTransitionScene: (intent: DesktopSceneTransitionIntent) => void;
  readonly onChooseWorkspace: () => void;
}

export function DesktopApplication(): JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<ShellState>({ kind: 'loading' });
  const [pending, setPending] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string>();
  const lastSequence = useRef<number | null>(null);
  const rendererSessionId = useRef<string>();
  const pendingProjectionRequest = useRef<object>();

  const refresh = useCallback(async (): Promise<void> => {
    const request = {};
    pendingProjectionRequest.current = request;
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    if (pendingProjectionRequest.current !== request) return;
    rendererSessionId.current = projection.rendererSessionId;
    pendingProjectionRequest.current = undefined;
    lastSequence.current = null;
    setState({ kind: 'ready', projection });
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.openNekoDesktop.shell.subscribe((event) => {
      if (!active) return;
      pendingProjectionRequest.current = undefined;
      if (
        rendererSessionId.current &&
        event.projection.rendererSessionId !== rendererSessionId.current
      ) {
        setState({ kind: 'error', message: t('shell.endpointChanged') });
        void refresh().catch((error: unknown) => {
          if (active) setState({ kind: 'error', message: describeError(error) });
        });
        return;
      }
      const previousSequence = lastSequence.current;
      if (previousSequence !== null && event.sequence !== previousSequence + 1) {
        setState({ kind: 'error', message: t('shell.sequenceChanged') });
        void refresh().catch((error: unknown) => {
          if (active) setState({ kind: 'error', message: describeError(error) });
        });
        return;
      }
      rendererSessionId.current = event.projection.rendererSessionId;
      lastSequence.current = event.sequence;
      setState({ kind: 'ready', projection: event.projection });
    });
    void refresh().catch((error: unknown) => {
      if (active) setState({ kind: 'error', message: describeError(error) });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [refresh, t]);

  const runMutation = useCallback(
    async (operation: () => Promise<DesktopShellProjection>): Promise<void> => {
      setPending(true);
      setDiagnostic(undefined);
      try {
        const request = {};
        pendingProjectionRequest.current = request;
        const projection = await operation();
        if (rendererSessionId.current !== projection.rendererSessionId) {
          throw new Error(t('shell.staleCommand'));
        }
        if (pendingProjectionRequest.current === request) {
          pendingProjectionRequest.current = undefined;
          setState({ kind: 'ready', projection });
        }
      } catch (error: unknown) {
        setDiagnostic(describeError(error));
        await refresh();
      } finally {
        setPending(false);
      }
    },
    [refresh, t],
  );

  if (state.kind === 'loading') {
    return <ShellStatus title={t('app.name')} message={t('shell.connecting')} />;
  }
  if (state.kind === 'error') {
    return <ShellStatus title={t('shell.unavailable')} message={state.message} error />;
  }

  const projection = state.projection;
  const persistedStateDiagnostic = projection.stateDiagnostics?.[0];
  const persistedConversationDiagnostic = projection.agentHome.diagnostics?.[0];
  const persistedConversationMessage = persistedConversationDiagnostic
    ? persistedConversationDiagnostic.conversationId
      ? t('shell.conversationRecordInvalid', {
          conversationId: persistedConversationDiagnostic.conversationId,
        })
      : t('shell.conversationRecordInvalidUnknown')
    : undefined;
  const visibleDiagnostic =
    diagnostic ??
    (persistedStateDiagnostic
      ? persistedStateDiagnostic.code === 'desktop-shell-component-invalid'
        ? t('shell.projectCatalogInvalid')
        : persistedStateDiagnostic.code === 'desktop-stored-state-metadata-retained'
          ? t(
              persistedStateDiagnostic.authorityKey === 'desktop.application-settings'
                ? 'shell.settingsMetadataRetained'
                : 'shell.workspaceMetadataRetained',
              {
                fields: persistedStateDiagnostic.fieldNames.join(', '),
              },
            )
          : persistedStateDiagnostic.code === 'desktop-stored-window-invalid'
            ? t('shell.storedWindowInvalid', { windowId: persistedStateDiagnostic.windowId })
            : persistedStateDiagnostic.authorityKey === 'desktop.application-settings'
              ? t('shell.storedSettingsInvalid')
              : t('shell.storedStateInvalid')
      : persistedConversationMessage);
  const activeWorkbench = resolveActiveDesktopWindowWorkbench(projection.window);
  const transitionScene = (intent: DesktopSceneTransitionIntent): void => {
    setPending(true);
    setDiagnostic(undefined);
    void window.openNekoDesktop.scenes
      .transition(projection.window.windowId, intent, activeWorkbench.scene.sceneId)
      .then(async (result) => {
        if (result.status !== 'transitioned') {
          setDiagnostic(result.diagnostic.message);
          return;
        }
        await refresh();
      })
      .catch(async (error: unknown) => {
        setDiagnostic(describeError(error));
        await refresh();
      })
      .finally(() => setPending(false));
  };
  const actions: ShellActions = {
    onSelectProject: (projectId) => transitionScene({ kind: 'open-project-workspace', projectId }),
    onOpenConversation: (conversation) =>
      transitionScene({
        kind: 'restore-conversation',
        navigation: conversation.navigation,
      }),
    onDeleteConversation: (conversation) => {
      if (
        !globalThis.confirm(
          t('shell.deleteConversationConfirm', { conversation: conversation.title }),
        )
      ) {
        return;
      }
      void runMutation(() => window.openNekoDesktop.conversations.delete(conversation.navigation));
    },
    onRemoveRecentProject: (project) => {
      if (
        !globalThis.confirm(t('shell.removeRecentProjectConfirm', { project: project.displayName }))
      ) {
        return;
      }
      void runMutation(() => window.openNekoDesktop.projects.removeRecent(project.projectId));
    },
    onUpdateWorkbench: (workbenchInstanceId, workbench) => {
      const instance = projection.window.workbenches.instances.find(
        (candidate) => candidate.workbenchInstanceId === workbenchInstanceId,
      );
      if (!instance) {
        throw new Error(`Desktop Workbench '${workbenchInstanceId}' is unavailable.`);
      }
      void runMutation(() =>
        window.openNekoDesktop.workbench.update(workbenchInstanceId, workbench),
      );
    },
    onUpdateApplicationSidebar: (sidebar) =>
      void runMutation(() =>
        window.openNekoDesktop.applicationSidebar.update(
          sidebar.windowId,
          sidebar.visible,
          sidebar.width,
        ),
      ),
    onTransitionScene: transitionScene,
    onChooseWorkspace: () => {
      setPending(true);
      setDiagnostic(undefined);
      void window.openNekoDesktop.workspaceGrants
        .choose(projection.window.windowId)
        .then(async (result) => {
          if (result.status === 'cancelled') return;
          const transition = await window.openNekoDesktop.scenes.transition(
            projection.window.windowId,
            { kind: 'open-workspace', workspaceGrantId: result.grant.workspaceGrantId },
            activeWorkbench.scene.sceneId,
          );
          if (transition.status !== 'transitioned') {
            setDiagnostic(transition.diagnostic.message);
            return;
          }
          await refresh();
        })
        .catch(async (error: unknown) => {
          setDiagnostic(describeError(error));
          await refresh();
        })
        .finally(() => setPending(false));
    },
  };

  return (
    <TooltipProvider>
      <div className="desktop-shell">
        {visibleDiagnostic ? (
          <div
            className="shell-diagnostic"
            role="alert"
            title={
              diagnostic === undefined
                ? (persistedStateDiagnostic?.message ?? persistedConversationDiagnostic?.message)
                : undefined
            }
          >
            <WarningIcon size={15} />
            <span>{visibleDiagnostic}</span>
          </div>
        ) : null}
        <DesktopSceneWorkbench
          actions={actions}
          pending={pending}
          projection={projection}
          projectPortabilityPort={window.openNekoDesktop.projectPortability}
        />
      </div>
    </TooltipProvider>
  );
}

export function DesktopShellView({
  projection,
}: {
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const actions: ShellActions = {
    onSelectProject: () => undefined,
    onOpenConversation: () => undefined,
    onDeleteConversation: () => undefined,
    onRemoveRecentProject: () => undefined,
    onUpdateWorkbench: () => undefined,
    onUpdateApplicationSidebar: () => undefined,
    onTransitionScene: () => undefined,
    onChooseWorkspace: () => undefined,
  };
  return (
    <DesktopSceneWorkbench
      actions={actions}
      pending={false}
      projection={projection}
      interactive={false}
    />
  );
}

function DesktopSceneWorkbench({
  actions,
  interactive = true,
  pending,
  projection,
  projectPortabilityPort,
}: {
  readonly actions: ShellActions;
  readonly interactive?: boolean;
  readonly pending: boolean;
  readonly projection: DesktopShellProjection;
  readonly projectPortabilityPort?: OpenNekoDesktopProjectPortabilityBridge['projectPortability'];
}): JSX.Element {
  const { t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const activeWorkbench = resolveActiveDesktopWindowWorkbench(projection.window);
  const scene = activeWorkbench.scene;
  const [managementSplitRatios, setManagementSplitRatios] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [portalTargets, setPortalTargets] = useState<ReadonlyMap<string, HTMLDivElement>>(
    () => new Map(),
  );
  const registerPortalTarget = useCallback(
    (
      workbenchInstanceId: string,
      slot: DesktopWorkbenchPortalSlot,
      target: HTMLDivElement | null,
    ) => {
      const key = createDesktopWorkbenchPortalTargetKey(workbenchInstanceId, slot);
      setPortalTargets((current) => {
        if (target && current.get(key) === target) return current;
        if (!target && !current.has(key)) return current;
        const next = new Map(current);
        if (target) next.set(key, target);
        else next.delete(key);
        return next;
      });
    },
    [],
  );
  const sidebar = projection.window.applicationSidebar;
  const compact = !sidebar.visible;
  const activeSection: HomeSection =
    scene.context.kind === 'asset-center'
      ? 'assets'
      : scene.context.kind === 'extensions'
        ? 'extensions'
        : scene.context.kind === 'project-management'
          ? 'projects'
          : 'create';
  const workspaceProject = resolveWorkspaceSceneProject(projection, activeWorkbench);
  const workspaceScene = scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace';
  const launchScope =
    scene.context.kind === 'agent' && scene.context.scope.kind !== 'workspace'
      ? scene.context.scope
      : undefined;
  const assistantPreviewVisible =
    launchScope?.kind === 'assistant' && scene.slots.main?.kind === 'assistant-preview';
  const assetPreviewVisible =
    scene.context.kind === 'asset-center' && scene.slots.secondaryMain?.kind === 'asset-preview';
  const activeResourcePresentation = useResourceDockPresentation(
    activeWorkbench.layout.resourceDock.presentation,
  );
  const workspaceAgentVisible =
    workspaceScene && activeWorkbench.layout.display.mode !== 'main-only';
  const interactionVisible = Boolean(launchScope) || workspaceAgentVisible;
  const interactionPresentation = launchScope
    ? assistantPreviewVisible
      ? ('docked' as const)
      : ('main' as const)
    : workspaceScene && activeWorkbench.layout.display.mode === 'chat-only'
      ? ('main' as const)
      : workspaceAgentVisible
        ? ('docked' as const)
        : ('hidden' as const);
  const interactionPosition =
    workspaceScene &&
    activeResourcePresentation !== 'hidden' &&
    activeWorkbench.layout.display.chatPosition === 'right'
      ? ('left' as const)
      : activeWorkbench.layout.display.chatPosition;
  const requestedActiveAgentSurfaceId =
    scene.context.kind === 'agent' ? requireActiveAgentSurfaceId(activeWorkbench) : undefined;
  const allAgentSurfaces = projection.window.workbenches.instances.flatMap((instance) =>
    instance.agentSurfaces.flatMap((surface) => {
      const surfaceProps = createDesktopAgentSurfaceProps({
        projection,
        workbenchInstanceId: instance.workbenchInstanceId,
        surface,
        onChooseWorkspace: actions.onChooseWorkspace,
        workspaceSelectionDisabled: pending || !interactive,
      });
      return surfaceProps
        ? [
            {
              agentSurfaceId: surface.agentSurfaceId,
              lifecycle: surface.lifecycle,
              surface: surfaceProps,
            },
          ]
        : [];
    }),
  );
  const activeAgentSurfaceId = allAgentSurfaces.some(
    (surface) => surface.agentSurfaceId === requestedActiveAgentSurfaceId,
  )
    ? requestedActiveAgentSurfaceId
    : undefined;
  const projectCatalogUnavailable = hasProjectCatalogDiagnostic(projection);
  const interaction = (
    <DesktopSurfaceErrorBoundary surfaceIdentity="agent-interaction">
      <div className="project-dock-panel" data-dock-owner="agent">
        <section
          className="agent-workspace desktop-assistant-agent"
          data-agent-scope={scene.context.kind === 'agent' ? scene.context.scope.kind : undefined}
          data-primary-surface="agent"
        >
          {projectCatalogUnavailable && allAgentSurfaces.length === 0 ? (
            <SceneSurfaceUnavailable owner="workspace-authority" />
          ) : (
            <RetainedDesktopAgentSurfaceDeck
              activeAgentSurfaceId={activeAgentSurfaceId}
              surfaces={allAgentSurfaces}
              visible={interactionVisible}
            />
          )}
        </section>
      </div>
    </DesktopSurfaceErrorBoundary>
  );
  const sceneShape = launchScope
    ? assistantPreviewVisible
      ? 'assistant'
      : 'agent-only'
    : workspaceScene
      ? 'workspace'
      : 'management';
  const managementSplitRatio =
    managementSplitRatios.get(activeWorkbench.workbenchInstanceId) ??
    MANAGEMENT_MAIN_SPLIT_DEFAULT_RATIO;
  const mainSplit = assetPreviewVisible
    ? ('columns' as const)
    : workspaceScene
      ? (activeWorkbench.layout.main.split?.axis ?? 'none')
      : 'none';
  const secondaryMainVisible =
    assetPreviewVisible || Boolean(workspaceScene && activeWorkbench.layout.main.groups[1]);
  const mainSplitResize: ControlledWorkbenchResizeBinding | undefined = assetPreviewVisible
    ? createManagementMainSplitResizeBinding({
        label: t('workspace.resizeMainSplit'),
        onResizeEnd: (ratio) => {
          setManagementSplitRatios((current) => {
            const next = new Map(current);
            next.set(activeWorkbench.workbenchInstanceId, ratio);
            return next;
          });
        },
      })
    : workspaceScene && activeWorkbench.layout.main.split && !pending
      ? {
          label: t('workspace.resizeMainSplit'),
          minSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.min,
          maxSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.max,
          onResizeEnd: (ratio) => {
            if (ratio === activeWorkbench.layout.main.split?.ratio) return;
            actions.onUpdateWorkbench(
              activeWorkbench.workbenchInstanceId,
              resizeMainSplit(activeWorkbench.layout, ratio),
            );
          },
        }
      : undefined;
  const resourceDockVisible = workspaceScene && activeResourcePresentation !== 'hidden';
  const interactionResize =
    workspaceScene && interactionPresentation === 'docked' && !pending
      ? createProjectDockResizeBinding({
          actions,
          dock: {
            owner: 'agent',
            presentation: 'docked',
            width: activeWorkbench.layout.display.chatWidth,
            content: <></>,
          },
          workbenchInstanceId: activeWorkbench.workbenchInstanceId,
          label: t('workspace.resizeAgent'),
          workbench: activeWorkbench.layout,
        })
      : undefined;
  const resourceDockResize =
    resourceDockVisible && !pending
      ? createProjectDockResizeBinding({
          actions,
          dock: {
            owner: 'resources',
            presentation: activeResourcePresentation,
            width: activeWorkbench.layout.resourceDock.width,
            content: <></>,
          },
          workbenchInstanceId: activeWorkbench.workbenchInstanceId,
          label: t('workspace.resizeRightDock'),
          workbench: activeWorkbench.layout,
        })
      : undefined;
  const portalDeck = (slot: DesktopWorkbenchPortalSlot, visible = true): JSX.Element => (
    <DesktopWorkbenchPortalTargetDeck
      activeWorkbenchInstanceId={activeWorkbench.workbenchInstanceId}
      instances={projection.window.workbenches.instances}
      onTarget={registerPortalTarget}
      slot={slot}
      visible={visible}
    />
  );

  return (
    <>
      <ControlledWorkbenchShell
        className={`project-workspace desktop-scene-workbench desktop-scene-workbench--${sceneShape}`}
        primarySidebar={
          <ApplicationPrimarySidebar
            activeSection={activeSection}
            compact={compact}
            disabled={pending}
            activeProjectId={workspaceProject?.projectId}
            onDeleteConversation={actions.onDeleteConversation}
            onNavigate={(section) => actions.onTransitionScene(sceneIntentForSection(section))}
            onOpenConversation={actions.onOpenConversation}
            onOpenRecent={actions.onSelectProject}
            onRemoveRecentProject={actions.onRemoveRecentProject}
            onOpenSettings={() => actions.onTransitionScene({ kind: 'open-settings' })}
            onToggle={() => actions.onUpdateApplicationSidebar(toggleApplicationSidebar(sidebar))}
            projection={projection}
            layoutControl={
              workspaceProject ? (
                <WorkspaceRegionControls
                  actions={actions}
                  disabled={pending}
                  projection={projection}
                />
              ) : undefined
            }
            lifecycleControl={
              workspaceProject && projectPortabilityPort ? (
                <ProjectPortabilityControl
                  disabled={pending}
                  rendererSessionId={projection.rendererSessionId}
                  project={workspaceProject}
                  port={projectPortabilityPort}
                  windowId={projection.window.windowId}
                />
              ) : undefined
            }
          />
        }
        primarySidebarVisible
        primarySidebarWidth={compact ? 64 : sidebar.width}
        primarySidebarResize={createApplicationPrimarySidebarResizeBinding({
          actions,
          disabled: pending || compact,
          t,
          sidebar,
        })}
        interaction={interaction}
        interactionPresentation={interactionPresentation}
        interactionPosition={interactionPosition}
        interactionWidth={activeWorkbench.layout.display.chatWidth}
        interactionResize={interactionResize}
        main={portalDeck('main')}
        secondaryMain={portalDeck('secondaryMain', secondaryMainVisible)}
        secondaryMainVisible={secondaryMainVisible}
        mainComposition={assetPreviewVisible ? 'independent-shells' : 'continuous'}
        mainSplit={mainSplit}
        mainSplitRatio={
          assetPreviewVisible ? managementSplitRatio : activeWorkbench.layout.main.split?.ratio
        }
        mainSplitResize={mainSplitResize}
        leftDock={portalDeck('leftDock', scene.context.kind === 'settings')}
        leftDockPresentation={scene.context.kind === 'settings' ? 'docked' : 'hidden'}
        leftDockWidth={scene.context.kind === 'settings' ? 300 : undefined}
        rightDock={portalDeck('rightDock', resourceDockVisible)}
        rightDockPresentation={resourceDockVisible ? activeResourcePresentation : 'hidden'}
        rightDockWidth={activeWorkbench.layout.resourceDock.width}
        rightDockResize={resourceDockResize}
        timeline={portalDeck(
          'timeline',
          workspaceScene && activeWorkbench.layout.timeline.presentation === 'docked',
        )}
        timelineVisible={
          workspaceScene && activeWorkbench.layout.timeline.presentation === 'docked'
        }
        timelineHeight={activeWorkbench.layout.timeline.height}
        timelineResize={
          workspaceScene && !pending
            ? {
                label: t('workspace.resizeTimeline'),
                minSize: DESKTOP_WORKBENCH_LIMITS.timelineHeight.min,
                maxSize: DESKTOP_WORKBENCH_LIMITS.timelineHeight.max,
                onResizeEnd: (height) => {
                  if (height === activeWorkbench.layout.timeline.height) return;
                  actions.onUpdateWorkbench(
                    activeWorkbench.workbenchInstanceId,
                    resizeTimelineWorkbench(activeWorkbench.layout, height),
                  );
                },
              }
            : undefined
        }
      />
      {projection.window.workbenches.instances.map((instance) => (
        <DesktopSurfaceErrorBoundary
          key={instance.workbenchInstanceId}
          surfaceIdentity={`workbench:${instance.workbenchInstanceId}`}
        >
          <DesktopWorkbenchRuntimePortals
            active={instance.workbenchInstanceId === activeWorkbench.workbenchInstanceId}
            actions={actions}
            instance={instance}
            interactive={interactive}
            pending={pending}
            portalTargets={portalTargets}
            projection={projection}
            resourceBrowserView={settings.projection.preferences.resourceBrowserView}
          />
        </DesktopSurfaceErrorBoundary>
      ))}
    </>
  );
}

type DesktopWorkbenchPortalSlot = 'main' | 'secondaryMain' | 'leftDock' | 'rightDock' | 'timeline';

function createDesktopWorkbenchPortalTargetKey(
  workbenchInstanceId: string,
  slot: DesktopWorkbenchPortalSlot,
): string {
  return `${workbenchInstanceId}:${slot}`;
}

function DesktopWorkbenchPortalTargetDeck({
  activeWorkbenchInstanceId,
  instances,
  onTarget,
  slot,
  visible,
}: {
  readonly activeWorkbenchInstanceId: string;
  readonly instances: readonly DesktopWorkbenchInstanceProjection[];
  readonly onTarget: (
    workbenchInstanceId: string,
    slot: DesktopWorkbenchPortalSlot,
    target: HTMLDivElement | null,
  ) => void;
  readonly slot: DesktopWorkbenchPortalSlot;
  readonly visible: boolean;
}): JSX.Element {
  return (
    <RetainedSurfaceDeck
      activeId={activeWorkbenchInstanceId}
      className="desktop-workbench-slot-deck"
      getId={(instance) => instance.workbenchInstanceId}
      getLifecycle={() => 'hot-retained'}
      items={instances}
      itemClassName="desktop-workbench-slot-deck__item"
      itemIdentityAttribute="data-workbench-instance-id"
      renderItem={(instance) => (
        <DesktopWorkbenchPortalTarget
          instanceId={instance.workbenchInstanceId}
          onTarget={onTarget}
          slot={slot}
        />
      )}
      visible={visible}
    />
  );
}

function DesktopWorkbenchPortalTarget({
  instanceId,
  onTarget,
  slot,
}: {
  readonly instanceId: string;
  readonly onTarget: (
    workbenchInstanceId: string,
    slot: DesktopWorkbenchPortalSlot,
    target: HTMLDivElement | null,
  ) => void;
  readonly slot: DesktopWorkbenchPortalSlot;
}): JSX.Element {
  const setTarget = useCallback(
    (target: HTMLDivElement | null) => onTarget(instanceId, slot, target),
    [instanceId, onTarget, slot],
  );
  return (
    <div ref={setTarget} className="desktop-workbench-slot-target" data-workbench-slot={slot} />
  );
}

function DesktopWorkbenchRuntimePortals({
  active,
  actions,
  instance,
  interactive,
  pending,
  portalTargets,
  projection,
  resourceBrowserView,
}: {
  readonly active: boolean;
  readonly actions: ShellActions;
  readonly instance: DesktopWorkbenchInstanceProjection;
  readonly interactive: boolean;
  readonly pending: boolean;
  readonly portalTargets: ReadonlyMap<string, HTMLDivElement>;
  readonly projection: DesktopShellProjection;
  readonly resourceBrowserView: 'list' | 'grid';
}): JSX.Element {
  const { t } = useTranslation();
  const scene = instance.scene;
  const assetCenter = useDesktopAssetCenterScene({
    active,
    scene,
    viewMode: resourceBrowserView,
  });
  const extensionManagement = useDesktopExtensionManagementScene(scene);
  const projectManagement = useDesktopProjectManagementScene(scene, projection.catalog.projects);
  const workspaceProject = resolveWorkspaceSceneProject(projection, instance);
  const workspaceSlots = useContentProjectWorkbenchSlots({
    active,
    actions,
    instance,
    pending,
    projection,
    project: workspaceProject,
  });
  const settingsSection =
    scene.context.kind === 'settings'
      ? parseDesktopSettingsSection(scene.context.settingsSectionId)
      : undefined;
  const assistantScope =
    scene.context.kind === 'agent' && scene.context.scope.kind === 'assistant'
      ? scene.context.scope
      : undefined;
  const assistantPreviewRef =
    assistantScope && scene.slots.main?.kind === 'assistant-preview' ? scene.slots.main : undefined;
  const assistantPreview =
    assistantPreviewRef && assistantScope?.conversationId ? (
      <DesktopAssistantPreviewSurface
        assistantSpaceId={assistantScope.assistantSpaceId}
        conversationId={assistantScope.conversationId}
        lifecyclePresentation={active ? 'active' : 'suspended'}
        previewSessionId={assistantPreviewRef.previewSessionId}
        scratchArtifactId={assistantPreviewRef.scratchArtifactId}
        windowId={scene.windowId}
      />
    ) : undefined;
  const assetPreviewSession =
    scene.context.kind === 'asset-center' && assetCenter.projection
      ? resolveAssetCenterPreviewSession(scene, assetCenter.projection)
      : undefined;
  const assetPreview =
    typeof assetPreviewSession === 'string' && assetCenter.projection ? (
      <DesktopAssetCenterMainSurface
        lifecyclePresentation={active ? 'active' : 'suspended'}
        projection={assetCenter.projection}
      />
    ) : undefined;
  const mainContent =
    settingsSection !== undefined ? (
      <DesktopSettingsMainSurface section={settingsSection} />
    ) : scene.context.kind === 'asset-center' ? (
      assetCenter.runtime ? (
        <DesktopAssetManagementSurface
          interactive={interactive && active}
          runtime={assetCenter.runtime}
        />
      ) : null
    ) : scene.context.kind === 'extensions' ? (
      extensionManagement ? (
        <DesktopExtensionManagementSurface
          interactive={interactive && active}
          runtime={extensionManagement}
        />
      ) : null
    ) : scene.context.kind === 'project-management' ? (
      <DesktopProjectCatalogSurface
        interactive={interactive}
        onOpen={actions.onSelectProject}
        onRemove={actions.onRemoveRecentProject}
        onSelect={projectManagement.select}
        projects={projection.catalog.projects}
        selectedProjectId={projectManagement.project?.projectId}
        sessionId={scene.context.projectManagementSessionId}
      />
    ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace' ? (
      workspaceSlots.main
    ) : assistantScope ? (
      (assistantPreview ?? null)
    ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'unbound' ? null : (
      <SceneSurfaceUnavailable owner="agent" />
    );
  const main =
    scene.context.kind === 'asset-center' ? (
      <StaticWorkbenchMainPanelSurface
        label={t('home.mediaLibrary')}
        panelId="asset-management"
        role="management"
        size={assetPreview ? 'compact' : 'full'}
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : scene.context.kind === 'extensions' ? (
      <StaticWorkbenchMainPanelSurface
        label={t('home.capabilities')}
        panelId="extension-management"
        role="management"
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : scene.context.kind === 'project-management' ? (
      <StaticWorkbenchMainPanelSurface
        label={t('home.allProjects')}
        panelId="project-management"
        role="management"
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : (
      mainContent
    );
  const secondaryMain = assetPreview ? (
    <StaticWorkbenchMainPanelSurface
      label={t('workspace.preview')}
      panelId="asset-preview"
      role="detail"
    >
      {assetPreview}
    </StaticWorkbenchMainPanelSurface>
  ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace' ? (
    workspaceSlots.secondaryMain
  ) : undefined;
  const leftDock =
    settingsSection === undefined ? undefined : (
      <DesktopSettingsNavigationSurface
        activeSection={settingsSection}
        onSectionChange={(section) =>
          actions.onTransitionScene({ kind: 'open-settings', sectionId: section })
        }
      />
    );
  const rightDock =
    scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace'
      ? workspaceSlots.rightDock
      : undefined;
  const timeline =
    scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace'
      ? workspaceSlots.timeline
      : undefined;
  const contentBySlot: Readonly<Record<DesktopWorkbenchPortalSlot, ReactNode>> = {
    main,
    secondaryMain,
    leftDock,
    rightDock,
    timeline,
  };

  return (
    <>
      {(Object.entries(contentBySlot) as readonly [DesktopWorkbenchPortalSlot, ReactNode][]).map(
        ([slot, content]) => {
          const target = portalTargets.get(
            createDesktopWorkbenchPortalTargetKey(instance.workbenchInstanceId, slot),
          );
          return target
            ? createPortal(
                <DesktopSurfaceErrorBoundary
                  key={`${scene.sceneId}:${slot}`}
                  surfaceIdentity={`${instance.workbenchInstanceId}:${slot}`}
                >
                  {content}
                </DesktopSurfaceErrorBoundary>,
                target,
                slot,
              )
            : null;
        },
      )}
    </>
  );
}

function StaticWorkbenchMainPanelSurface({
  children,
  label,
  panelId,
  role,
  size = 'full',
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly panelId: string;
  readonly role: 'management' | 'detail';
  readonly size?: 'compact' | 'full';
}): JSX.Element {
  return (
    <WorkbenchMainPanelSurface label={label} panelId={panelId} role={role} size={size}>
      {children}
    </WorkbenchMainPanelSurface>
  );
}

function WorkbenchMainPanelSurface({
  active,
  children,
  mainGroupId,
  label,
  panelId,
  role = 'workspace',
  size = 'full',
  tabs,
}: {
  readonly active?: boolean;
  readonly children: ReactNode;
  readonly mainGroupId?: string;
  readonly label?: string;
  readonly panelId: string;
  readonly role?: 'workspace' | 'management' | 'detail';
  readonly size?: 'compact' | 'full';
  readonly tabs?: ReactNode;
}): JSX.Element {
  return (
    <section
      className="project-main-group desktop-workbench-main-panel"
      data-active={active === undefined ? undefined : active ? 'true' : 'false'}
      data-main-group={mainGroupId}
      data-panel-role={role}
      data-panel-size={size}
      data-workbench-main-panel={panelId}
      aria-label={label}
    >
      {tabs ? <header className="project-main-group__tabs">{tabs}</header> : null}
      <div className="project-main-group__content">{children}</div>
    </section>
  );
}

function createLaunchAgentPresentation(
  scope: Extract<DesktopWorkbenchSceneProjection['context'], { readonly kind: 'agent' }>['scope'],
): AgentRootPresentation {
  if (scope.kind === 'workspace') {
    throw new Error('Launch Agent presentation cannot use Workspace scope.');
  }
  if (scope.kind === 'unbound') {
    return createAgentDraftPresentation(scope.draftId, {
      kind: 'unbound',
      draftId: scope.draftId,
    });
  }
  const authorityScope = { kind: 'assistant' as const, assistantSpaceId: scope.assistantSpaceId };
  return scope.conversationId
    ? createAgentSessionPresentation(authorityScope, scope.conversationId)
    : createAgentDraftPresentation(scope.draftId, authorityScope);
}

function requireActiveAgentSurfaceId(instance: DesktopWorkbenchInstanceProjection): string {
  if (!instance.activeAgentSurfaceId) {
    throw new Error(
      `Desktop Workbench '${instance.workbenchInstanceId}' has no active Agent Surface.`,
    );
  }
  return instance.activeAgentSurfaceId;
}

function createDesktopAgentSurfaceProps(input: {
  readonly projection: DesktopShellProjection;
  readonly workbenchInstanceId: string;
  readonly project?: DesktopProjectCatalogItem;
  readonly surface: DesktopAgentSurfaceProjection;
  readonly onChooseWorkspace?: () => void;
  readonly workspaceSelectionDisabled?: boolean;
}): DesktopAgentSurfaceProps | undefined {
  const { interaction } = input.surface;
  const scope = interaction.scope;
  if (scope.kind === 'workspace') {
    const project =
      input.project ??
      input.projection.catalog.projects.find(
        (candidate) => candidate.workspaceId === scope.workspaceId,
      );
    if (!project) {
      if (hasProjectCatalogDiagnostic(input.projection)) return undefined;
      throw new Error(`Agent Surface '${input.surface.agentSurfaceId}' has no Workspace Project.`);
    }
    const tab = input.projection.window.tabs.find(
      (candidate) => candidate.projectId === project.projectId,
    );
    if (!tab || tab.viewId !== interaction.agentViewId) {
      throw new Error(
        `Agent Surface '${input.surface.agentSurfaceId}' has no exact Workspace View.`,
      );
    }
    const authorityScope = {
      kind: 'workspace' as const,
      workspaceId: scope.workspaceId,
      workspaceGrantId: scope.workspaceGrantId,
    };
    const agentPresentation = scope.conversationId
      ? createAgentSessionPresentation(authorityScope, scope.conversationId)
      : createAgentDraftPresentation(scope.draftId, authorityScope);
    return {
      binding: 'workspace',
      workbenchInstanceId: input.workbenchInstanceId,
      agentSurfaceId: input.surface.agentSurfaceId,
      tab,
      agentPresentation,
      composerWorkspace: { kind: 'workspace', label: project.displayName },
    };
  }
  if (!input.onChooseWorkspace) {
    throw new Error(`Agent Surface '${input.surface.agentSurfaceId}' has no Workspace chooser.`);
  }
  return {
    binding: 'launch',
    workbenchInstanceId: input.workbenchInstanceId,
    agentSurfaceId: input.surface.agentSurfaceId,
    viewId: interaction.agentViewId,
    agentPresentation: createLaunchAgentPresentation(scope),
    composerWorkspace: {
      kind: 'assistant',
      onChoose: input.onChooseWorkspace,
      ...(input.workspaceSelectionDisabled === undefined
        ? {}
        : { disabled: input.workspaceSelectionDisabled }),
    },
  };
}

function hasProjectCatalogDiagnostic(projection: DesktopShellProjection): boolean {
  return Boolean(
    projection.stateDiagnostics?.some(
      (diagnostic) =>
        diagnostic.code === 'desktop-shell-component-invalid' &&
        diagnostic.component === 'project-catalog',
    ),
  );
}

export function resolveAssetCenterPreviewSession(
  scene: DesktopWorkbenchSceneProjection,
  projection: AssetCenterSessionProjection,
): string | undefined | null {
  if (
    scene.context.kind !== 'asset-center' ||
    scene.context.assetCenterSessionId !== projection.identity.assetCenterSessionId ||
    scene.windowId !== projection.identity.windowId
  ) {
    throw new Error('Asset Center management projection does not match its Scene.');
  }
  if (projection.preview.status !== 'ready') return undefined;
  if (
    scene.slots.secondaryMain?.kind !== 'asset-preview' ||
    scene.slots.secondaryMain.assetCenterSessionId !== projection.identity.assetCenterSessionId ||
    scene.slots.secondaryMain.previewSessionId !== projection.preview.previewSessionId
  ) {
    return null;
  }
  return projection.preview.previewSessionId;
}

function resolveWorkspaceSceneProject(
  projection: DesktopShellProjection,
  instance: DesktopWorkbenchInstanceProjection,
): DesktopProjectCatalogItem | undefined {
  const { context, slots } = instance.scene;
  if (context.kind !== 'agent' || context.scope.kind !== 'workspace') return undefined;
  if (slots.main && slots.main.kind !== 'workspace-main') {
    throw new Error('Workspace Scene Main Surface must use its exact Workspace View ref.');
  }
  const workspaceMain = slots.main;
  const workspaceScope = context.scope;
  if (workspaceMain && workspaceMain.workspaceId !== workspaceScope.workspaceId) {
    throw new Error('Workspace Scene Main Surface does not match its scope.');
  }
  const project = projection.catalog.projects.find(
    (candidate) => candidate.workspaceId === workspaceScope.workspaceId,
  );
  if (!project) return undefined;
  const tab = projection.window.tabs.find((candidate) => candidate.projectId === project.projectId);
  if (!tab) {
    throw new Error('Workspace Scene has no matching Agent Window View.');
  }
  if (
    context.agentViewId !== tab.viewId ||
    slots.interaction?.kind !== 'agent' ||
    slots.interaction.agentViewId !== tab.viewId
  ) {
    throw new Error('Workspace Scene Agent Surface does not match its exact Window View.');
  }
  if (workspaceMain) {
    const mainView = instance.layout.main.views.find(
      (candidate) =>
        candidate.viewId === workspaceMain.viewId &&
        candidate.viewInstanceId === workspaceMain.viewInstanceId &&
        candidate.workspaceId === workspaceScope.workspaceId &&
        candidate.projectId === project.projectId,
    );
    if (!mainView) throw new Error('Workspace Scene Main Surface has no exact Workbench View.');
  } else if (instance.layout.main.views.length > 0) {
    throw new Error('Workspace Scene without Main cannot retain Workbench Views.');
  }
  return project;
}

function sceneIntentForSection(section: HomeSection): DesktopSceneTransitionIntent {
  switch (section) {
    case 'create':
      return { kind: 'open-agent-entry' };
    case 'assets':
      return { kind: 'open-asset-center' };
    case 'extensions':
      return { kind: 'open-extensions' };
    case 'projects':
      return { kind: 'open-project-management' };
  }
}

function SceneSurfaceUnavailable({ owner }: { readonly owner: string }): JSX.Element {
  return (
    <section className="scene-surface-unavailable" data-scene-surface-unavailable={owner}>
      <WarningIcon size={18} />
      <span>{owner}</span>
    </section>
  );
}

function useDesktopAssetCenterScene(input: {
  readonly active: boolean;
  readonly scene: DesktopWorkbenchSceneProjection;
  readonly viewMode: 'list' | 'grid';
}): {
  readonly runtime?: DesktopAssetCenterRuntime;
  readonly projection?: AssetCenterSessionProjection;
} {
  const assetCenterSessionId =
    input.scene.context.kind === 'asset-center'
      ? input.scene.context.assetCenterSessionId
      : undefined;
  const runtime = useMemo(() => {
    if (!input.active || !assetCenterSessionId || typeof window === 'undefined') return undefined;
    return new DesktopAssetCenterRuntime(
      { assetCenterSessionId, windowId: input.scene.windowId },
      input.viewMode,
      window.openNekoDesktop,
    );
  }, [assetCenterSessionId, input.active, input.scene.windowId, input.viewMode]);
  const [sessionState, setSessionState] = useState<{
    readonly runtime: DesktopAssetCenterRuntime;
    readonly projection: AssetCenterSessionProjection;
  }>();
  useDisposeRuntime(runtime);
  useEffect(() => {
    setSessionState(undefined);
    if (!runtime) return;
    let active = true;
    const unsubscribe = runtime.subscribe((next) => {
      if (active) setSessionState({ runtime, projection: next });
    });
    void runtime.getSnapshot().then((next) => {
      if (active) setSessionState({ runtime, projection: next });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);
  const projection =
    sessionState && sessionState.runtime === runtime ? sessionState.projection : undefined;
  return {
    ...(runtime ? { runtime } : {}),
    ...(projection ? { projection } : {}),
  };
}

function useDesktopExtensionManagementScene(
  scene: DesktopWorkbenchSceneProjection,
): DesktopExtensionManagementRuntime | undefined {
  const sessionId =
    scene.context.kind === 'extensions' ? scene.context.extensionManagementSessionId : undefined;
  const runtime = useMemo(() => {
    if (!sessionId || typeof window === 'undefined') return undefined;
    return new DesktopExtensionManagementRuntime(
      { extensionManagementSessionId: sessionId, windowId: scene.windowId },
      window.openNekoDesktop,
    );
  }, [scene.windowId, sessionId]);
  useDisposeRuntime(runtime);
  return runtime;
}

function useDisposeRuntime<T extends { dispose(): void }>(runtime: T | undefined): void {
  const disposalTokens = useRef(new Map<T, symbol>());
  useEffect(() => {
    if (!runtime) return;
    const tokens = disposalTokens.current;
    const token = Symbol('desktop-runtime-disposal');
    tokens.set(runtime, token);
    return () => {
      // StrictMode remounts effects without recreating the memoized runtime.
      queueMicrotask(() => {
        if (!Object.is(tokens.get(runtime), token)) return;
        tokens.delete(runtime);
        runtime.dispose();
      });
    };
  }, [runtime]);
}

function useDesktopProjectManagementScene(
  scene: DesktopWorkbenchSceneProjection,
  projects: readonly DesktopProjectCatalogItem[],
): {
  readonly project?: DesktopProjectCatalogItem;
  readonly select: (projectId: string) => void;
} {
  const [selection, setSelection] = useState<{
    readonly projectManagementSessionId: string;
    readonly projectId: string;
  }>();
  const sessionId =
    scene.context.kind === 'project-management'
      ? scene.context.projectManagementSessionId
      : undefined;
  const project =
    sessionId && selection?.projectManagementSessionId === sessionId
      ? projects.find((candidate) => candidate.projectId === selection.projectId)
      : undefined;
  return {
    ...(project ? { project } : {}),
    select: (projectId) => {
      if (!sessionId) throw new Error('Project Management Scene is unavailable.');
      if (!projects.some((candidate) => candidate.projectId === projectId)) {
        throw new Error(`Project Management item '${projectId}' is unavailable.`);
      }
      setSelection({ projectManagementSessionId: sessionId, projectId });
    },
  };
}

type ContentProjectWorkbenchSlots = Pick<
  ControlledWorkbenchShellProps,
  'main' | 'secondaryMain' | 'rightDock' | 'timeline'
>;

function useContentProjectWorkbenchSlots({
  active,
  actions,
  instance,
  pending,
  projection,
  project,
}: {
  readonly active: boolean;
  readonly actions: ShellActions;
  readonly instance: DesktopWorkbenchInstanceProjection;
  readonly pending: boolean;
  readonly projection: DesktopShellProjection;
  readonly project?: DesktopProjectCatalogItem;
}): ContentProjectWorkbenchSlots {
  const { t } = useTranslation();
  const [cutTimelineTarget, setCutTimelineTarget] = useState<HTMLDivElement | null>(null);
  const workbench = instance.layout;
  const resourceDockPresentation = useResourceDockPresentation(workbench.resourceDock.presentation);
  if (!project) {
    return { main: <SceneSurfaceUnavailable owner="workspace-authority" /> };
  }
  const canvasCapability = projection.domains.find((candidate) => candidate.surface === 'canvas');
  const assetsCapability = projection.domains.find(
    (candidate) => candidate.surface === 'media-library',
  );
  const previewCapability = projection.domains.find((candidate) => candidate.surface === 'preview');
  const cutCapability = projection.domains.find((candidate) => candidate.surface === 'cut');
  const tab = projection.window.tabs.find((candidate) => candidate.projectId === project.projectId);
  if (!tab) {
    throw new Error(`Content Project '${project.projectId}' has no Window-owned View.`);
  }
  const primaryGroup = workbench.main.groups[0];
  if (!primaryGroup) {
    throw new Error('Desktop Workbench requires a primary Main Group.');
  }
  const secondaryGroup = workbench.main.groups[1];
  const timelineOwner = workbench.main.views.find(
    (candidate) => candidate.viewId === workbench.timeline.ownerViewId,
  );
  const timelineOwnerGroup = timelineOwner
    ? workbench.main.groups.find((group) => group.viewIds.includes(timelineOwner.viewId))
    : undefined;
  if (timelineOwner && !timelineOwnerGroup) {
    throw new Error(
      `Desktop Timeline owner '${timelineOwner.viewId}' is not attached to a Main group.`,
    );
  }
  const resourceDock =
    resourceDockPresentation === 'hidden'
      ? undefined
      : createResourceDock(
          workbench,
          resourceDockPresentation,
          <div className="project-resource-dock">
            <header className="project-resource-dock__header">
              <span>
                <FolderIcon size={15} />
                <strong>{t('workspace.projectResources')}</strong>
              </span>
              <IconButton
                disabled={pending}
                icon={<CloseIcon size={15} />}
                label={t('workspace.closeProjectResources')}
                title={t('workspace.closeProjectResources')}
                onClick={() =>
                  actions.onUpdateWorkbench(
                    instance.workbenchInstanceId,
                    setResourceDockPresentationWorkbench(workbench, 'hidden'),
                  )
                }
              />
            </header>
            <div className="project-resource-dock__content">
              {assetsCapability?.status === 'ready' ? (
                <DesktopResourceBrowserSurface
                  lifecyclePresentation={active ? 'active' : 'suspended'}
                  onOpenCanvasDocument={(documentId, presentation) =>
                    actions.onUpdateWorkbench(
                      instance.workbenchInstanceId,
                      openCanvasDocumentWorkbench({
                        documentId,
                        presentation,
                        projection,
                        project,
                        workbench,
                      }),
                    )
                  }
                  project={project}
                  projection={projection}
                  tab={tab}
                />
              ) : (
                <ResourceBrowserUnavailable
                  diagnostic={
                    assetsCapability?.status === 'unavailable'
                      ? assetsCapability.diagnosticCode
                      : 'desktop-media-library-not-mounted'
                  }
                />
              )}
            </div>
          </div>,
        );
  const mainSurface = (
    <MainViewGroupSurface
      visible={active && workbench.display.mode !== 'chat-only'}
      actions={actions}
      canvasCapability={canvasCapability}
      cutCapability={cutCapability}
      group={primaryGroup}
      previewCapability={previewCapability}
      project={project}
      projection={projection}
      workbenchInstanceId={instance.workbenchInstanceId}
      timelineOwnerViewId={
        timelineOwnerGroup?.groupId === primaryGroup.groupId ? timelineOwner?.viewId : undefined
      }
      timelineTarget={cutTimelineTarget ?? undefined}
      workbench={workbench}
    />
  );
  const timelineOwnerRenderedInMain =
    timelineOwner?.kind === 'cut' && timelineOwnerGroup?.groupId === primaryGroup.groupId;

  return {
    main: (
      <div className="project-main-host">
        <div className="project-main-host__content">{mainSurface}</div>
      </div>
    ),
    secondaryMain: secondaryGroup ? (
      <MainViewGroupSurface
        visible={active && workbench.display.mode !== 'chat-only'}
        actions={actions}
        canvasCapability={canvasCapability}
        cutCapability={cutCapability}
        group={secondaryGroup}
        previewCapability={previewCapability}
        project={project}
        projection={projection}
        workbenchInstanceId={instance.workbenchInstanceId}
        timelineOwnerViewId={
          timelineOwnerGroup?.groupId === secondaryGroup.groupId ? timelineOwner?.viewId : undefined
        }
        timelineTarget={cutTimelineTarget ?? undefined}
        workbench={workbench}
      />
    ) : undefined,
    rightDock: resourceDock?.content,
    timeline:
      timelineOwner?.kind === 'cut' && cutCapability?.status === 'ready' ? (
        timelineOwnerRenderedInMain ? (
          <div
            className="desktop-cut-timeline-slot"
            data-testid="desktop-cut-timeline-slot"
            ref={setCutTimelineTarget}
          />
        ) : (
          <TimelinePlaceholder diagnostic="desktop-cut-timeline-owner-not-mounted-in-primary-main" />
        )
      ) : (
        <TimelinePlaceholder
          diagnostic={
            projection.domains.find((candidate) => candidate.surface === 'cut')?.status ===
            'unavailable'
              ? 'desktop-domain-surface-unavailable'
              : 'desktop-cut-timeline-not-mounted'
          }
        />
      ),
  };
}

function MainViewGroupSurface({
  actions,
  canvasCapability,
  cutCapability,
  group,
  previewCapability,
  project,
  projection,
  workbenchInstanceId,
  timelineOwnerViewId,
  timelineTarget,
  visible,
  workbench,
}: {
  readonly actions: ShellActions;
  readonly canvasCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly cutCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly group: DesktopWorkbenchMainGroup;
  readonly previewCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly workbenchInstanceId: string;
  readonly timelineOwnerViewId?: string;
  readonly timelineTarget?: Element;
  readonly visible: boolean;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const views = group.viewIds.map((viewId) => {
    const view = workbench.main.views.find((candidate) => candidate.viewId === viewId);
    if (!view) {
      throw new Error(`Desktop Main Group references missing View '${viewId}'.`);
    }
    return view;
  });
  const activeView = views.find((view) => view.viewId === group.activeViewId);
  return (
    <WorkbenchMainPanelSurface
      active={workbench.main.activeGroupId === group.groupId}
      mainGroupId={group.groupId}
      panelId={`workspace:${group.groupId}`}
      tabs={
        <WorkbenchEditorTabs
          activeId={group.activeViewId}
          emptyLabel={t('workspace.mainTabs.empty')}
          label={t('workspace.mainTabs.label')}
          tabs={views.map((view) => ({
            id: view.viewId,
            label: view.displayLabel,
            closeLabel: t('workspace.mainTabs.close', { name: view.displayLabel }),
          }))}
          onClose={(viewId) => {
            actions.onUpdateWorkbench(workbenchInstanceId, closeMainView(workbench, viewId));
          }}
          onReorder={(sourceViewId, targetViewId) => {
            actions.onUpdateWorkbench(
              workbenchInstanceId,
              reorderMainView(workbench, group.groupId, sourceViewId, targetViewId),
            );
          }}
          onSelect={(viewId) => {
            const view = views.find((candidate) => candidate.viewId === viewId);
            if (!view) throw new Error(`Desktop Main Tab '${viewId}' is unavailable.`);
            actions.onUpdateWorkbench(workbenchInstanceId, openOrFocusMainView(workbench, view));
          }}
        />
      }
    >
      {views.length === 0 ? (
        <EmptyMainSurface />
      ) : (
        <RetainedSurfaceDeck
          visible={visible}
          items={views}
          activeId={activeView?.viewId}
          getId={(view) => view.viewId}
          getLifecycle={resolveDesktopWorkbenchViewLifecycle}
          itemClassName="project-main-view-stack__item"
          itemIdentityAttribute="data-main-view-id"
          renderItem={(view, presentation) =>
            renderWorkbenchMainView({
              canvasCapability,
              previewCapability,
              cutCapability,
              project,
              projection,
              timelineTarget: view.viewId === timelineOwnerViewId ? timelineTarget : undefined,
              view,
              lifecyclePresentation: presentation.suspended ? 'suspended' : 'active',
            })
          }
        />
      )}
    </WorkbenchMainPanelSurface>
  );
}

function renderWorkbenchMainView({
  canvasCapability,
  previewCapability,
  cutCapability,
  project,
  projection,
  timelineTarget,
  view,
  lifecyclePresentation,
}: {
  readonly canvasCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly previewCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly cutCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly timelineTarget?: Element;
  readonly view: DesktopWorkbenchLayoutProjection['main']['views'][number];
  readonly lifecyclePresentation: 'active' | 'suspended';
}): JSX.Element {
  if (view.kind === 'preview' && previewCapability?.status === 'ready') {
    return (
      <DesktopPreviewSurface
        lifecyclePresentation={lifecyclePresentation}
        project={project}
        projection={projection}
        view={view}
      />
    );
  }
  if (view.kind === 'canvas' && canvasCapability?.status === 'ready') {
    return (
      <DesktopCanvasSurface
        lifecyclePresentation={lifecyclePresentation}
        project={project}
        projection={projection}
        view={view}
      />
    );
  }
  if (view.kind === 'cut' && cutCapability?.status === 'ready') {
    return (
      <DesktopCutSurface
        lifecyclePresentation={lifecyclePresentation}
        project={project}
        projection={projection}
        timelineTarget={timelineTarget}
        view={view}
      />
    );
  }
  return (
    <CreativeMainPlaceholder
      canvasDiagnostic={
        canvasCapability?.status === 'unavailable'
          ? canvasCapability.diagnosticCode
          : 'desktop-canvas-not-mounted'
      }
      project={project}
    />
  );
}

type WorkbenchDisplayMode = 'chat-main-left' | 'chat-main-right' | 'chat-only' | 'main-only';

function WorkspaceRegionControls({
  actions,
  disabled,
  projection,
}: {
  readonly actions: ShellActions;
  readonly disabled: boolean;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const instance = resolveActiveDesktopWindowWorkbench(projection.window);
  const workbench = instance.layout;
  const agentVisible = isWorkbenchRegionVisible(workbench, 'agent');
  const mainVisible = isWorkbenchRegionVisible(workbench, 'main');
  const managementVisible = isWorkbenchRegionVisible(workbench, 'management');
  return (
    <div
      className="workspace-region-controls"
      role="group"
      aria-label={t('workspace.layoutControls')}
    >
      <IconButton
        className="workbench-region-toggle"
        data-workbench-region-control="agent"
        disabled={disabled || (agentVisible && !mainVisible)}
        icon={<span className={toCodiconClassName('layout')} aria-hidden="true" />}
        label={t('workspace.agent')}
        size="xs"
        title={t('workspace.agent')}
        aria-pressed={agentVisible}
        onClick={() =>
          actions.onUpdateWorkbench(
            instance.workbenchInstanceId,
            toggleWorkbenchRegion(workbench, 'agent'),
          )
        }
      />
      <IconButton
        className="workbench-region-toggle"
        data-workbench-region-control="main"
        disabled={disabled || workbench.main.views.length === 0 || (mainVisible && !agentVisible)}
        icon={<span className={toCodiconClassName('layout-panel')} aria-hidden="true" />}
        label={t('workspace.mainPanel')}
        size="xs"
        title={t('workspace.mainPanel')}
        aria-pressed={mainVisible}
        onClick={() =>
          actions.onUpdateWorkbench(
            instance.workbenchInstanceId,
            toggleWorkbenchRegion(workbench, 'main'),
          )
        }
      />
      <IconButton
        className="workbench-region-toggle"
        data-workbench-region-control="management"
        disabled={disabled}
        icon={<span className={toCodiconClassName('layout-sidebar-right')} aria-hidden="true" />}
        label={t('workspace.projectResources')}
        size="xs"
        title={t('workspace.projectResources')}
        aria-pressed={managementVisible}
        onClick={() =>
          actions.onUpdateWorkbench(
            instance.workbenchInstanceId,
            toggleWorkbenchRegion(workbench, 'management'),
          )
        }
      />
    </div>
  );
}

function createResourceDock(
  workbench: DesktopWorkbenchLayoutProjection,
  presentation: 'docked' | 'overlay',
  resources: JSX.Element,
): {
  readonly content: JSX.Element;
  readonly owner: 'resources';
  readonly presentation: 'docked' | 'overlay';
  readonly width: number;
} {
  return {
    content: (
      <div className="project-dock-panel" data-dock-owner="resources">
        {resources}
      </div>
    ),
    owner: 'resources',
    presentation,
    width: workbench.resourceDock.width,
  };
}

function useResourceDockPresentation(
  presentation: 'hidden' | 'docked' | 'overlay',
): 'hidden' | 'docked' | 'overlay' {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1100,
  );
  useEffect(() => {
    const update = (): void => setCompact(window.innerWidth < 1100);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return presentation === 'docked' && compact ? 'overlay' : presentation;
}

function createProjectDockResizeBinding({
  actions,
  dock,
  label,
  workbench,
  workbenchInstanceId,
}: {
  readonly actions: ShellActions;
  readonly dock: {
    readonly owner: 'agent' | 'resources';
    readonly presentation: 'docked' | 'overlay';
    readonly width: number;
    readonly content: JSX.Element;
  };
  readonly label: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly workbenchInstanceId: string;
}) {
  return {
    label,
    minSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.min,
    maxSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.max,
    onResizeEnd: (width: number) => {
      const currentWidth =
        dock.owner === 'agent' ? workbench.display.chatWidth : workbench.resourceDock.width;
      if (currentWidth === width) return;
      actions.onUpdateWorkbench(
        workbenchInstanceId,
        resizeProjectDockWorkbench(workbench, dock.owner, width),
      );
    },
  };
}

export function createManagementMainSplitResizeBinding({
  label,
  onResizeEnd,
}: {
  readonly label: string;
  readonly onResizeEnd: (ratio: number) => void;
}): ControlledWorkbenchResizeBinding {
  return {
    label,
    minSize: MANAGEMENT_MAIN_SPLIT_MIN_RATIO,
    maxSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.max,
    onResizeEnd,
  };
}

export function resizeApplicationSidebar(
  sidebar: DesktopApplicationSidebarProjection,
  width: number,
): DesktopApplicationSidebarProjection {
  return {
    ...sidebar,
    width,
  };
}

function createApplicationPrimarySidebarResizeBinding({
  actions,
  disabled,
  t,
  sidebar,
}: {
  readonly actions: ShellActions;
  readonly disabled: boolean;
  readonly t: TranslationFunction;
  readonly sidebar: DesktopApplicationSidebarProjection;
}): ControlledWorkbenchResizeBinding | undefined {
  if (disabled) return undefined;
  return {
    label: t('workspace.resizePrimarySidebar'),
    minSize: DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.min,
    maxSize: DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS.max,
    onResizeEnd: (width) => {
      if (width === sidebar.width) return;
      actions.onUpdateApplicationSidebar(resizeApplicationSidebar(sidebar, width));
    },
  };
}

function toggleApplicationSidebar(
  sidebar: DesktopApplicationSidebarProjection,
): DesktopApplicationSidebarProjection {
  return {
    ...sidebar,
    visible: !sidebar.visible,
  };
}

export function resizeTimelineWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  height: number,
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    timeline: {
      ...workbench.timeline,
      height,
    },
  };
}

export function resizeProjectDockWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  owner: 'agent' | 'resources',
  width: number,
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    display:
      owner === 'agent'
        ? {
            ...workbench.display,
            chatWidth: width,
          }
        : workbench.display,
    resourceDock:
      owner === 'resources'
        ? {
            ...workbench.resourceDock,
            width,
          }
        : workbench.resourceDock,
  };
}

export function setResourceDockPresentationWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  presentation: 'hidden' | 'docked' | 'overlay',
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    resourceDock: {
      ...workbench.resourceDock,
      presentation,
    },
  };
}

export function activateWorkbenchMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  view: DesktopWorkbenchLayoutProjection['main']['views'][number],
): DesktopWorkbenchLayoutProjection {
  return openOrFocusMainView(workbench, view);
}

type WorkbenchRegion = 'agent' | 'main' | 'management';

function isWorkbenchRegionVisible(
  workbench: DesktopWorkbenchLayoutProjection,
  region: WorkbenchRegion,
): boolean {
  if (region === 'agent') return workbench.display.mode !== 'main-only';
  if (region === 'main') {
    return workbench.main.views.length > 0 && workbench.display.mode !== 'chat-only';
  }
  return workbench.resourceDock.presentation !== 'hidden';
}

export function toggleWorkbenchRegion(
  workbench: DesktopWorkbenchLayoutProjection,
  region: WorkbenchRegion,
): DesktopWorkbenchLayoutProjection {
  const agentVisible = isWorkbenchRegionVisible(workbench, 'agent');
  const mainVisible = isWorkbenchRegionVisible(workbench, 'main');
  if (region === 'agent') {
    if (agentVisible && !mainVisible) {
      throw new Error('Desktop Workbench cannot hide Agent while Main is unavailable.');
    }
    return setWorkbenchDisplayMode(
      workbench,
      agentVisible ? 'main-only' : 'chat-main',
      workbench.display.chatPosition,
    );
  }
  if (region === 'main') {
    if (mainVisible && !agentVisible) {
      throw new Error('Desktop Workbench cannot hide Main while Agent is unavailable.');
    }
    return setWorkbenchDisplayMode(
      workbench,
      mainVisible ? 'chat-only' : 'chat-main',
      workbench.display.chatPosition,
    );
  }
  return setResourceDockPresentationWorkbench(
    workbench,
    isWorkbenchRegionVisible(workbench, 'management') ? 'hidden' : 'docked',
  );
}

export function applyWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
  mode: WorkbenchDisplayMode,
): DesktopWorkbenchLayoutProjection {
  if (mode === 'chat-only') return setWorkbenchDisplayMode(workbench, 'chat-only');
  if (mode === 'main-only') return setWorkbenchDisplayMode(workbench, 'main-only');
  const requestedPosition = mode === 'chat-main-left' ? 'left' : 'right';
  return setWorkbenchDisplayMode(workbench, 'chat-main', requestedPosition);
}

export function openCanvasDocumentWorkbench(input: {
  readonly documentId: string;
  readonly presentation: 'main' | 'side';
  readonly projection: DesktopShellProjection;
  readonly project: DesktopProjectCatalogItem;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}): DesktopWorkbenchLayoutProjection {
  const { documentId, presentation, projection, project, workbench } = input;
  if (!documentId.toLocaleLowerCase().endsWith('.nkc')) {
    throw new Error('Desktop Canvas View requires an .nkc document.');
  }
  const existing = workbench.main.views.find(
    (view) =>
      view.kind === 'canvas' &&
      view.projectId === project.projectId &&
      view.workspaceId === project.workspaceId &&
      view.documentId === documentId,
  );
  const tab = requireProjectTab(projection, project.projectId);
  const canvasView =
    existing ??
    ({
      viewId: `canvas:${tab.viewId}:${stableViewSuffix(documentId)}`,
      viewInstanceId: tab.viewInstanceId,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'canvas' as const,
      ownerId: `canvas:${project.projectId}`,
      displayLabel: documentId.split(/[\\/]/u).at(-1) ?? documentId,
      documentId,
    } satisfies DesktopWorkbenchLayoutProjection['main']['views'][number]);
  return openOrFocusMainView(workbench, canvasView, {
    ...(presentation === 'side' ? { splitAxis: 'columns' as const } : {}),
  });
}

function stableViewSuffix(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function requireProjectTab(
  projection: DesktopShellProjection,
  projectId: string,
): DesktopShellProjection['window']['tabs'][number] {
  const tab = projection.window.tabs.find((candidate) => candidate.projectId === projectId);
  if (!tab) throw new Error(`Desktop Project '${projectId}' has no attached Window View.`);
  return tab;
}

function CreativeMainPlaceholder({
  canvasDiagnostic,
  project,
}: {
  readonly canvasDiagnostic: string;
  readonly project: DesktopProjectCatalogItem;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="creative-main-placeholder dotted-surface">
      <div>
        <GridIcon size={24} />
        <h2>{t('workspace.creativeMain')}</h2>
        <p>{t('workspace.creativeMainDetail', { project: project.displayName })}</p>
        <code>{canvasDiagnostic}</code>
      </div>
    </section>
  );
}

function EmptyMainSurface(): JSX.Element {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('workspace.mainTabs.empty')}
      className="creative-main-placeholder dotted-surface"
      data-empty-main="true"
    >
      <div>
        <GridIcon size={24} />
        <h2>{t('workspace.mainTabs.empty')}</h2>
        <p>{t('workspace.mainTabs.emptyDetail')}</p>
      </div>
    </section>
  );
}

function ResourceBrowserUnavailable({ diagnostic }: { readonly diagnostic: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="resource-browser-unavailable" aria-label={t('workspace.resources')}>
      <header>
        <div>
          <FolderIcon size={15} />
          <strong>{t('workspace.resources')}</strong>
        </div>
        <span>{t('home.unavailable')}</span>
      </header>
      <div className="resource-dock-tabs" role="tablist" aria-label={t('workspace.resourceFacets')}>
        <span role="tab" aria-selected="true">
          {t('workspace.files')}
        </span>
        <span role="tab" aria-selected="false">
          {t('workspace.media')}
        </span>
        <span role="tab" aria-selected="false">
          {t('workspace.entities')}
        </span>
      </div>
      <div className="resource-dock-empty">
        <FolderIcon size={23} />
        <strong>{t('workspace.assets.unavailable')}</strong>
        <p>{t('workspace.assets.detail')}</p>
        <code>{diagnostic}</code>
      </div>
    </section>
  );
}

function TimelinePlaceholder({ diagnostic }: { readonly diagnostic: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="timeline-placeholder" aria-label={t('workspace.timeline')}>
      <header>
        <strong>{t('workspace.timeline')}</strong>
        <span>{t('home.unavailable')}</span>
      </header>
      <div>
        <GridIcon size={18} />
        <span>{t('workspace.timelineDetail')}</span>
        <code>{diagnostic}</code>
      </div>
    </section>
  );
}

function ApplicationPrimarySidebar({
  activeProjectId,
  activeSection,
  compact,
  disabled = false,
  onDeleteConversation,
  onNavigate,
  onOpenConversation,
  onOpenRecent,
  onRemoveRecentProject,
  onOpenSettings,
  onToggle,
  projection,
  layoutControl,
  lifecycleControl,
}: {
  readonly activeProjectId?: string;
  readonly activeSection?: HomeSection;
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly onDeleteConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onNavigate: (section: HomeSection) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRemoveRecentProject: (project: DesktopProjectCatalogItem) => void;
  readonly onOpenSettings: () => void;
  readonly onToggle: () => void;
  readonly projection: DesktopShellProjection;
  readonly layoutControl?: JSX.Element;
  readonly lifecycleControl?: JSX.Element;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <aside
      className={`home-navigation project-primary-sidebar ${
        compact ? 'home-navigation--compact project-primary-sidebar--compact' : ''
      }`}
      data-primary-sidebar="application"
    >
      <PrimarySidebarBrand
        compact={compact}
        disabled={disabled}
        layoutControl={layoutControl}
        onToggle={onToggle}
      />
      <nav className="home-primary-navigation" aria-label={t('workspace.primaryNavigation')}>
        <DesktopApplicationNavigationButton
          active={activeSection === 'create'}
          disabled={disabled}
          label={t('home.overview')}
          icon={<PlusIcon size={17} />}
          onClick={() => onNavigate('create')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'assets'}
          disabled={disabled}
          label={t('home.mediaLibrary')}
          icon={<SearchIcon size={17} />}
          onClick={() => onNavigate('assets')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'extensions'}
          disabled={disabled}
          label={t('home.capabilities')}
          icon={<PackageIcon size={17} />}
          onClick={() => onNavigate('extensions')}
        />
        <DesktopApplicationNavigationButton
          active={activeSection === 'projects'}
          disabled={disabled}
          label={t('home.allProjects')}
          icon={<FolderIcon size={17} />}
          onClick={() => onNavigate('projects')}
        />
      </nav>
      <PrimaryRecentNavigation
        activeProjectId={activeProjectId}
        disabled={disabled}
        onDeleteConversation={onDeleteConversation}
        onOpenConversation={onOpenConversation}
        onOpenRecent={onOpenRecent}
        onRemoveRecentProject={onRemoveRecentProject}
        projection={projection}
      />
      <PrimarySidebarFooter
        lifecycleControl={lifecycleControl}
        onOpenSettings={onOpenSettings}
        projection={projection}
      />
    </aside>
  );
}

function PrimaryRecentNavigation({
  activeProjectId,
  disabled = false,
  onDeleteConversation,
  onOpenConversation,
  onOpenRecent,
  onRemoveRecentProject,
  projection,
}: {
  readonly activeProjectId?: string;
  readonly disabled?: boolean;
  readonly onDeleteConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRemoveRecentProject: (project: DesktopProjectCatalogItem) => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const activeScene = resolveActiveDesktopWindowWorkbench(projection.window).scene;
  const activeConversationId =
    activeScene.context.kind === 'agent' && activeScene.context.scope.kind !== 'unbound'
      ? activeScene.context.scope.conversationId
      : undefined;
  const toggleExpanded = (group: DesktopConversationNavigationGroup) => {
    const key = conversationGroupKey(group);
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return (
    <div className="home-recent-navigation">
      <div className="home-sidebar-heading">
        <span>{t('home.conversationGroups')}</span>
        <span>{projection.conversationNavigation.groups.length}</span>
      </div>
      {projection.conversationNavigation.groups.map((group) => {
        const key = conversationGroupKey(group);
        const expanded = expandedGroups.has(key);
        const conversations = expanded
          ? group.conversations
          : group.conversations.slice(0, INITIAL_CONVERSATIONS_PER_GROUP);
        const project =
          group.kind === 'project'
            ? projection.catalog.projects.find(
                (candidate) => candidate.projectId === group.projectId,
              )
            : undefined;
        if (group.kind === 'project' && !project) {
          throw new Error(
            `Conversation navigation references missing Project '${group.projectId}'.`,
          );
        }
        return (
          <section className="primary-conversation-group" data-group-kind={group.kind} key={key}>
            {group.kind === 'project' && project ? (
              <div
                className="primary-recent-project-row primary-conversation-group__header"
                data-active={project.projectId === activeProjectId ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="home-project-link"
                  disabled={disabled}
                  onClick={() => onOpenRecent(project.projectId)}
                >
                  <FolderIcon size={15} />
                  <span>{project.displayName}</span>
                </button>
                <IconButton
                  disabled={disabled}
                  size="xs"
                  label={t('shell.removeRecentProject', { project: project.displayName })}
                  icon={<TrashIcon size={13} />}
                  onClick={() => onRemoveRecentProject(project)}
                />
              </div>
            ) : (
              <div className="primary-conversation-group__standalone-heading">
                <StorylineIcon size={14} />
                <span>{formatStandaloneConversationGroup(group, t)}</span>
                <span>{group.conversations.length}</span>
              </div>
            )}
            {group.kind === 'workspace' ? (
              <div className="primary-conversation-group__diagnostic" role="status">
                <WarningIcon size={13} />
                <span>{group.fieldNames.join(', ')}</span>
              </div>
            ) : null}
            <div className="primary-conversation-group__children">
              {conversations.map((conversation) => (
                <ConversationNavigationRow
                  active={conversation.navigation.conversationId === activeConversationId}
                  conversation={conversation}
                  disabled={disabled || group.kind === 'workspace'}
                  key={conversation.navigation.conversationId}
                  onDelete={onDeleteConversation}
                  onOpen={onOpenConversation}
                />
              ))}
              {group.conversations.length > INITIAL_CONVERSATIONS_PER_GROUP ? (
                <button
                  type="button"
                  className="primary-conversation-group__expand"
                  disabled={disabled}
                  onClick={() => toggleExpanded(group)}
                >
                  {expanded ? t('home.collapseConversations') : t('home.expandConversations')}
                </button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const INITIAL_CONVERSATIONS_PER_GROUP = 5;

function ConversationNavigationRow({
  active,
  conversation,
  disabled,
  onDelete,
  onOpen,
}: {
  readonly active: boolean;
  readonly conversation: DesktopAgentHomeConversationSummary;
  readonly disabled: boolean;
  readonly onDelete: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpen: (conversation: DesktopAgentHomeConversationSummary) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className="primary-recent-project-row primary-recent-conversation-row"
      data-active={active ? 'true' : 'false'}
    >
      <button
        type="button"
        className="home-project-link home-conversation-link"
        disabled={disabled}
        onClick={() => onOpen(conversation)}
      >
        <StorylineIcon size={13} />
        <span>{conversation.title}</span>
        {conversation.attention !== 'none' ? (
          <span
            className={`home-conversation-attention is-${conversation.attention}`}
            aria-label={formatAttention(conversation.attention, t)}
          />
        ) : null}
      </button>
      <IconButton
        disabled={disabled}
        size="xs"
        label={t('shell.deleteConversation', { conversation: conversation.title })}
        icon={<TrashIcon size={13} />}
        onClick={() => onDelete(conversation)}
      />
    </div>
  );
}

function conversationGroupKey(group: DesktopConversationNavigationGroup): string {
  switch (group.kind) {
    case 'project':
      return `project:${group.projectId}`;
    case 'workspace':
      return `workspace:${group.workspaceId}`;
    case 'assistant':
      return `assistant:${group.assistantSpaceId}`;
    case 'character':
      return `character:${group.characterId}`;
    case 'room':
      return `room:${group.roomId}`;
  }
}

function formatStandaloneConversationGroup(
  group: DesktopConversationNavigationGroup,
  t: TranslationFunction,
): string {
  switch (group.kind) {
    case 'project':
      return group.displayName;
    case 'workspace':
      return t('home.unavailableWorkspace');
    case 'assistant':
      return t('home.personalAssistant');
    case 'character':
      return t('home.characterConversations');
    case 'room':
      return t('home.roomConversations');
  }
}

function PrimarySidebarBrand({
  compact,
  disabled = false,
  layoutControl,
  onToggle,
}: {
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly layoutControl?: JSX.Element;
  readonly onToggle: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="primary-sidebar-brand">
      <DesktopApplicationBrand showMark={compact} />
      <div className="primary-sidebar-brand__controls">
        <IconButton
          className="primary-sidebar-toggle workbench-region-toggle"
          data-workbench-region-control="primary-sidebar"
          disabled={disabled}
          icon={<span className={toCodiconClassName('layout-sidebar-left')} aria-hidden="true" />}
          label={compact ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')}
          size="xs"
          title={compact ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')}
          aria-pressed={!compact}
          onClick={onToggle}
        />
        {layoutControl}
      </div>
    </div>
  );
}

function PrimarySidebarFooter({
  lifecycleControl,
  onOpenSettings,
  projection,
}: {
  readonly lifecycleControl?: JSX.Element;
  readonly onOpenSettings: () => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="home-navigation-footer">
      <AttentionSummary projection={projection} />
      <div className="home-navigation-footer__actions">
        {lifecycleControl}
        <Tooltip content={t('shell.settingsLabel')}>
          <IconButton
            label={t('shell.settingsLabel')}
            icon={<SettingsIcon size={16} />}
            onClick={onOpenSettings}
          />
        </Tooltip>
      </div>
    </div>
  );
}

function AttentionSummary({
  projection,
}: {
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const total =
    projection.agentHome.attention.needsInput +
    projection.agentHome.attention.needsReview +
    projection.agentHome.attention.running;
  return (
    <Tooltip content={t('shell.activityAttention')}>
      <div className="attention-summary" aria-label={t('shell.attentionItems', { count: total })}>
        <span className={total > 0 ? 'has-attention' : ''} />
        <span>{total}</span>
      </div>
    </Tooltip>
  );
}

function formatAttention(
  attention: DesktopAgentHomeConversationSummary['attention'],
  t: TranslationFunction,
): string {
  return t(`attention.${attention === 'none' ? 'none' : camelCase(attention)}`);
}

function camelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_match, character: string) => character.toUpperCase());
}

function ShellStatus({
  title,
  message,
  error = false,
}: {
  readonly title: string;
  readonly message: string;
  readonly error?: boolean;
}): JSX.Element {
  return (
    <main className="shell-status">
      <span className="brand-mark" aria-hidden="true">
        N
      </span>
      <h1>{title}</h1>
      <p className={error ? 'is-error' : ''}>{message}</p>
    </main>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
