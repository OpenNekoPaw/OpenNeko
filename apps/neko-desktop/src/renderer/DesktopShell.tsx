import {
  CheckIcon,
  CloseIcon,
  ControlledWorkbenchShell,
  FolderIcon,
  GridIcon,
  IconButton,
  InfoIcon,
  LeftPanelIcon,
  PackageIcon,
  PlusIcon,
  Popover,
  RightPanelIcon,
  SearchIcon,
  SettingsIcon,
  StorylineIcon,
  Tooltip,
  TooltipProvider,
  TrashIcon,
  WarningIcon,
  WorkbenchEditorTabs,
  type ControlledWorkbenchResizeBinding,
  type ControlledWorkbenchShellProps,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  DesktopAgentHomeConversationSummary,
  DesktopConversationNavigationGroup,
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  DESKTOP_WORKBENCH_LIMITS,
  closeMainView,
  openOrFocusMainView,
  reorderMainView,
  resizeMainSplit,
  setWorkbenchDisplayMode,
  splitMainView,
  type DesktopWorkbenchLayoutProjection,
  type DesktopWorkbenchMainGroup,
} from '@neko/host/desktop-workbench-contract';
import {
  DESKTOP_APPLICATION_SIDEBAR_WIDTH_LIMITS,
  type DesktopApplicationSidebarProjection,
  type DesktopSceneTransitionIntent,
} from '@neko/host/desktop-scene-contract';
import { DesktopAgentSurface } from './DesktopAgentSurface';
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

type ShellState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: DesktopShellProjection }
  | { readonly kind: 'error'; readonly message: string };

type HomeSection = 'create' | 'assets' | 'extensions' | 'projects';
type TranslationFunction = ReturnType<typeof useTranslation>['t'];

interface ShellActions {
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onDeleteConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onRemoveRecentProject: (project: DesktopProjectCatalogItem) => void;
  readonly onUpdateWorkbench: (workbench: DesktopWorkbenchLayoutProjection) => void;
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
  const endpointEpoch = useRef<string>();
  const projectionRevision = useRef(-1);

  const refresh = useCallback(async (): Promise<void> => {
    const projection = await window.openNekoDesktop.shell.getSnapshot();
    if (
      endpointEpoch.current === projection.endpointEpoch &&
      projection.projectionRevision < projectionRevision.current
    ) {
      return;
    }
    endpointEpoch.current = projection.endpointEpoch;
    projectionRevision.current = projection.projectionRevision;
    lastSequence.current = null;
    setState({ kind: 'ready', projection });
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.openNekoDesktop.shell.subscribe((event) => {
      if (!active) return;
      if (endpointEpoch.current && event.projection.endpointEpoch !== endpointEpoch.current) {
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
      endpointEpoch.current = event.projection.endpointEpoch;
      lastSequence.current = event.sequence;
      if (event.projection.projectionRevision >= projectionRevision.current) {
        projectionRevision.current = event.projection.projectionRevision;
        setState({ kind: 'ready', projection: event.projection });
      }
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
        const projection = await operation();
        if (endpointEpoch.current !== projection.endpointEpoch) {
          throw new Error(t('shell.staleCommand'));
        }
        if (projection.projectionRevision >= projectionRevision.current) {
          projectionRevision.current = projection.projectionRevision;
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
  const transitionScene = (intent: DesktopSceneTransitionIntent): void => {
    setPending(true);
    setDiagnostic(undefined);
    void window.openNekoDesktop.scenes
      .transition(
        projection.window.windowId,
        intent,
        projection.window.revision,
        projection.window.scene.revision,
      )
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
      void runMutation(() =>
        window.openNekoDesktop.conversations.delete(
          conversation.navigation,
          projection.window.revision,
          projection.agentHome.revision,
        ),
      );
    },
    onRemoveRecentProject: (project) => {
      if (
        !globalThis.confirm(t('shell.removeRecentProjectConfirm', { project: project.displayName }))
      ) {
        return;
      }
      void runMutation(() =>
        window.openNekoDesktop.projects.removeRecent(
          project.projectId,
          projection.window.revision,
          projection.catalog.revision,
        ),
      );
    },
    onUpdateWorkbench: (workbench) =>
      void runMutation(() =>
        window.openNekoDesktop.workbench.update(
          workbench,
          projection.window.revision,
          projection.window.workbench.revision,
        ),
      ),
    onUpdateApplicationSidebar: (sidebar) =>
      void runMutation(() =>
        window.openNekoDesktop.applicationSidebar.update(
          sidebar.windowId,
          sidebar.visible,
          sidebar.width,
          projection.window.applicationSidebar.revision,
        ),
      ),
    onTransitionScene: transitionScene,
    onChooseWorkspace: () => {
      setPending(true);
      setDiagnostic(undefined);
      void window.openNekoDesktop.workspaceGrants
        .choose(projection.window.windowId, projection.window.revision)
        .then(async (result) => {
          if (result.status === 'cancelled') return;
          const transition = await window.openNekoDesktop.scenes.transition(
            projection.window.windowId,
            { kind: 'open-workspace', workspaceGrantId: result.grant.workspaceGrantId },
            projection.window.revision,
            projection.window.scene.revision,
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
        {diagnostic ? (
          <div className="shell-diagnostic" role="alert">
            <WarningIcon size={15} />
            <span>{diagnostic}</span>
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
  const scene = projection.window.scene;
  const assetCenter = useDesktopAssetCenterScene({
    scene,
    endpointEpoch: projection.endpointEpoch,
    viewMode: settings.projection.preferences.resourceBrowserView,
  });
  const extensionManagement = useDesktopExtensionManagementScene(scene, projection.endpointEpoch);
  const projectManagement = useDesktopProjectManagementScene(scene, projection.catalog.projects);
  const [managementSplitRatio, setManagementSplitRatio] = useState(0.34);
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
  const workspaceProject = resolveWorkspaceSceneProject(projection);
  const workspaceSlots = useContentProjectWorkbenchSlots({
    actions,
    pending,
    projection,
    project: workspaceProject,
  });
  const launchContext =
    scene.context.kind === 'agent' && scene.context.scope.kind !== 'workspace'
      ? { ...scene.context, scope: scene.context.scope }
      : undefined;
  const launchScope = launchContext?.scope;
  const assistantScope = launchScope?.kind === 'assistant' ? launchScope : undefined;
  const assistantPreviewRef =
    assistantScope && scene.slots.main?.kind === 'assistant-preview' ? scene.slots.main : undefined;
  const settingsSection =
    scene.context.kind === 'settings'
      ? parseDesktopSettingsSection(scene.context.settingsSectionId)
      : undefined;
  const launchAgent =
    launchScope && launchContext ? (
      <div className="project-dock-panel" data-dock-owner="agent">
        <section
          className="agent-workspace desktop-assistant-agent"
          data-agent-scope={launchScope.kind}
          data-primary-surface="agent"
        >
          <DesktopAgentSurface
            binding="launch"
            composerWorkspace={{
              kind: 'assistant',
              onChoose: actions.onChooseWorkspace,
              disabled: pending || !interactive,
            }}
            viewId={launchContext.agentViewId}
            agentPresentation={createLaunchAgentPresentation(launchScope)}
          />
        </section>
      </div>
    ) : undefined;
  const assistantPreview =
    assistantPreviewRef && assistantScope?.conversationId ? (
      <DesktopAssistantPreviewSurface
        assistantSpaceId={assistantScope.assistantSpaceId}
        conversationId={assistantScope.conversationId}
        endpointEpoch={projection.endpointEpoch}
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
        endpointEpoch={projection.endpointEpoch}
        projection={assetCenter.projection}
      />
    ) : undefined;
  const managementDetailVisible = Boolean(assetPreview);
  const mainContent =
    settingsSection !== undefined ? (
      <DesktopSettingsMainSurface section={settingsSection} />
    ) : scene.context.kind === 'asset-center' ? (
      assetCenter.runtime ? (
        <DesktopAssetManagementSurface interactive={interactive} runtime={assetCenter.runtime} />
      ) : null
    ) : scene.context.kind === 'extensions' ? (
      extensionManagement ? (
        <DesktopExtensionManagementSurface
          interactive={interactive}
          runtime={extensionManagement}
        />
      ) : null
    ) : scene.context.kind === 'project-management' ? (
      <DesktopProjectCatalogSurface
        interactive={interactive}
        onOpen={actions.onSelectProject}
        onSelect={projectManagement.select}
        projects={projection.catalog.projects}
        selectedProjectId={projectManagement.project?.projectId}
        sessionId={scene.context.projectManagementSessionId}
      />
    ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace' ? (
      workspaceSlots.main
    ) : assistantScope ? (
      (assistantPreview ?? null)
    ) : launchScope?.kind === 'unbound' ? null : (
      <SceneSurfaceUnavailable owner="agent" />
    );
  const main =
    scene.context.kind === 'asset-center' ? (
      <StaticWorkbenchMainPanelSurface
        label={t('home.mediaLibrary')}
        panelId="asset-management"
        role="management"
        size={managementDetailVisible ? 'compact' : 'full'}
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
        size="full"
      >
        {mainContent}
      </StaticWorkbenchMainPanelSurface>
    ) : (
      mainContent
    );
  const leftDock =
    settingsSection !== undefined ? (
      <DesktopSettingsNavigationSurface
        activeSection={settingsSection}
        onSectionChange={(section) =>
          actions.onTransitionScene({ kind: 'open-settings', sectionId: section })
        }
      />
    ) : launchScope ? (
      launchAgent
    ) : scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace' ? (
      workspaceSlots.leftDock
    ) : undefined;
  const workspaceScene = scene.context.kind === 'agent' && scene.context.scope.kind === 'workspace';
  const managementSplitScene = scene.context.kind === 'asset-center';
  const rightDock = workspaceScene ? workspaceSlots.rightDock : undefined;
  const secondaryMainContent =
    scene.context.kind === 'asset-center'
      ? assetPreview
      : workspaceScene
        ? workspaceSlots.secondaryMain
        : undefined;
  const secondaryMain = assetPreview ? (
    <StaticWorkbenchMainPanelSurface
      label={t('workspace.preview')}
      panelId="asset-preview"
      role="detail"
    >
      {secondaryMainContent}
    </StaticWorkbenchMainPanelSurface>
  ) : (
    secondaryMainContent
  );
  const sceneShape = launchScope
    ? assistantPreview
      ? 'assistant'
      : 'agent-only'
    : workspaceScene
      ? 'workspace'
      : 'management';

  return (
    <ControlledWorkbenchShell
      {...workspaceSlots}
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
              <WorkbenchDisplayMenu actions={actions} disabled={pending} projection={projection} />
            ) : undefined
          }
          lifecycleControl={
            workspaceProject && projectPortabilityPort ? (
              <ProjectPortabilityControl
                disabled={pending}
                endpointEpoch={projection.endpointEpoch}
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
      main={main}
      secondaryMain={secondaryMain}
      mainComposition={managementDetailVisible ? 'independent-shells' : 'continuous'}
      mainSplit={managementDetailVisible ? 'columns' : workspaceSlots.mainSplit}
      mainSplitRatio={managementSplitScene ? managementSplitRatio : workspaceSlots.mainSplitRatio}
      mainSplitResize={
        managementDetailVisible
          ? {
              label: t('workspace.resizeMainSplit'),
              minSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.min,
              maxSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.max,
              onResizeEnd: setManagementSplitRatio,
            }
          : workspaceSlots.mainSplitResize
      }
      leftDock={leftDock}
      leftDockPresentation={
        settingsSection !== undefined || launchScope
          ? 'docked'
          : workspaceSlots.leftDockPresentation
      }
      leftDockWidth={
        settingsSection !== undefined
          ? 300
          : launchScope
            ? projection.window.workbench.display.chatWidth
            : workspaceSlots.leftDockWidth
      }
      leftDockResize={
        settingsSection !== undefined || launchScope ? undefined : workspaceSlots.leftDockResize
      }
      rightDock={rightDock}
      rightDockPresentation={workspaceScene ? workspaceSlots.rightDockPresentation : 'hidden'}
    />
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
  actions,
  active,
  children,
  mainGroupId,
  label,
  panelId,
  role = 'workspace',
  size = 'full',
  tabs,
}: {
  readonly actions?: ReactNode;
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
      {tabs || actions ? (
        <header className="project-main-group__tabs">
          {tabs}
          {actions ? <div className="project-main-group__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="project-main-group__content">{children}</div>
    </section>
  );
}

function createLaunchAgentPresentation(
  scope: Extract<
    DesktopShellProjection['window']['scene']['context'],
    { readonly kind: 'agent' }
  >['scope'],
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

export function resolveAssetCenterPreviewSession(
  scene: DesktopShellProjection['window']['scene'],
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
): DesktopProjectCatalogItem | undefined {
  const { context, slots } = projection.window.scene;
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
  if (!project) {
    throw new Error('Workspace Scene has no matching Project catalog identity.');
  }
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
    const mainView = projection.window.workbench.main.views.find(
      (candidate) =>
        candidate.viewId === workspaceMain.viewId &&
        candidate.viewEpoch === workspaceMain.viewEpoch &&
        candidate.workspaceId === workspaceScope.workspaceId &&
        candidate.projectId === project.projectId,
    );
    if (!mainView) throw new Error('Workspace Scene Main Surface has no exact Workbench View.');
  } else if (projection.window.workbench.main.views.length > 0) {
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
  readonly scene: DesktopShellProjection['window']['scene'];
  readonly endpointEpoch: string;
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
    if (!assetCenterSessionId || typeof window === 'undefined') return undefined;
    return new DesktopAssetCenterRuntime(
      { assetCenterSessionId, windowId: input.scene.windowId },
      input.endpointEpoch,
      input.viewMode,
      window.openNekoDesktop,
    );
  }, [assetCenterSessionId, input.endpointEpoch, input.scene.windowId, input.viewMode]);
  const [sessionProjection, setSessionProjection] = useState<AssetCenterSessionProjection>();
  useDisposeRuntime(runtime);
  useEffect(() => {
    setSessionProjection(undefined);
    if (!runtime) return;
    let active = true;
    const unsubscribe = runtime.subscribe((next) => {
      if (active) setSessionProjection(next);
    });
    void runtime.getSnapshot().then((next) => {
      if (active) setSessionProjection(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);
  return {
    ...(runtime ? { runtime } : {}),
    ...(sessionProjection ? { projection: sessionProjection } : {}),
  };
}

function useDesktopExtensionManagementScene(
  scene: DesktopShellProjection['window']['scene'],
  endpointEpoch: string,
): DesktopExtensionManagementRuntime | undefined {
  const sessionId =
    scene.context.kind === 'extensions' ? scene.context.extensionManagementSessionId : undefined;
  const runtime = useMemo(() => {
    if (!sessionId || typeof window === 'undefined') return undefined;
    return new DesktopExtensionManagementRuntime(
      { extensionManagementSessionId: sessionId, windowId: scene.windowId },
      endpointEpoch,
      window.openNekoDesktop,
    );
  }, [endpointEpoch, scene.windowId, sessionId]);
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
  scene: DesktopShellProjection['window']['scene'],
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
  | 'main'
  | 'secondaryMain'
  | 'mainSplit'
  | 'mainSplitRatio'
  | 'mainSplitResize'
  | 'leftDock'
  | 'leftDockPresentation'
  | 'leftDockWidth'
  | 'leftDockResize'
  | 'rightDock'
  | 'rightDockPresentation'
  | 'rightDockWidth'
  | 'rightDockResize'
  | 'timeline'
  | 'timelineVisible'
  | 'timelineHeight'
  | 'timelineResize'
>;

function useContentProjectWorkbenchSlots({
  actions,
  initialConversation,
  initialInput,
  pending,
  projection,
  project,
}: {
  readonly actions: ShellActions;
  readonly initialConversation?: { readonly id: string; readonly title: string };
  readonly initialInput?: { readonly id: string; readonly value: string };
  readonly pending: boolean;
  readonly projection: DesktopShellProjection;
  readonly project?: DesktopProjectCatalogItem;
}): ContentProjectWorkbenchSlots {
  const { t } = useTranslation();
  const [cutTimelineTarget, setCutTimelineTarget] = useState<HTMLDivElement | null>(null);
  const workbench = projection.window.workbench;
  const resourceDockPresentation = useResourceDockPresentation(workbench.resourceDock.presentation);
  if (!project) {
    return { main: <SceneSurfaceUnavailable owner="workspace-authority" /> };
  }
  const agentCapability = projection.domains.find((candidate) => candidate.surface === 'agent');
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
  const agentMain = workbench.display.mode === 'chat-only';
  const agentDock = (
    <AgentWorkspaceSurface
      agentReady={agentCapability?.status === 'ready'}
      agentPresentation={createWorkspaceAgentPresentation(projection)}
      initialConversation={initialConversation}
      initialInput={initialInput}
      project={project}
      tab={tab}
    />
  );
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
                    setResourceDockPresentationWorkbench(workbench, 'hidden'),
                  )
                }
              />
            </header>
            <div className="project-resource-dock__content">
              {assetsCapability?.status === 'ready' ? (
                <DesktopResourceBrowserSurface
                  onOpenCanvasDocument={(documentId, presentation) =>
                    actions.onUpdateWorkbench(
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
  const effectiveAgentPosition =
    resourceDock && workbench.display.mode === 'chat-main'
      ? ('left' as const)
      : workbench.display.chatPosition;
  const leftDock = createAgentDock(workbench, 'left', effectiveAgentPosition, agentDock);
  const rightAgentDock = createAgentDock(workbench, 'right', effectiveAgentPosition, agentDock);
  const rightDock = resourceDock ?? rightAgentDock;
  const resourceControl = (
    <WorkbenchIconButton
      active={workbench.resourceDock.presentation !== 'hidden'}
      disabled={pending}
      icon={<RightPanelIcon size={15} />}
      label={t('workspace.projectResources')}
      onClick={() =>
        actions.onUpdateWorkbench(
          setResourceDockPresentationWorkbench(
            workbench,
            workbench.resourceDock.presentation === 'hidden' ? 'docked' : 'hidden',
          ),
        )
      }
    />
  );
  const mainSurface = agentMain ? (
    <div className="project-main-chat-host">
      {agentDock}
      <div className="project-main-chat-host__controls">{resourceControl}</div>
    </div>
  ) : (
    <MainViewGroupSurface
      actions={actions}
      allowCutRuntime
      canvasCapability={canvasCapability}
      cutCapability={cutCapability}
      group={primaryGroup}
      pending={pending}
      previewCapability={previewCapability}
      project={project}
      projection={projection}
      timelineOwnerViewId={
        timelineOwnerGroup?.groupId === primaryGroup.groupId ? timelineOwner?.viewId : undefined
      }
      timelineTarget={cutTimelineTarget ?? undefined}
      workbench={workbench}
      resourceControl={resourceControl}
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
    secondaryMain:
      !agentMain && secondaryGroup ? (
        <MainViewGroupSurface
          actions={actions}
          allowCutRuntime={false}
          canvasCapability={canvasCapability}
          cutCapability={cutCapability}
          group={secondaryGroup}
          pending={pending}
          previewCapability={previewCapability}
          project={project}
          projection={projection}
          timelineOwnerViewId={
            timelineOwnerGroup?.groupId === secondaryGroup.groupId
              ? timelineOwner?.viewId
              : undefined
          }
          timelineTarget={cutTimelineTarget ?? undefined}
          workbench={workbench}
        />
      ) : undefined,
    mainSplit: workbench.main.split?.axis ?? 'none',
    mainSplitRatio: workbench.main.split?.ratio,
    mainSplitResize:
      pending || !workbench.main.split
        ? undefined
        : {
            label: t('workspace.resizeMainSplit'),
            minSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.min,
            maxSize: DESKTOP_WORKBENCH_LIMITS.mainSplitRatio.max,
            onResizeEnd: (ratio) => {
              if (ratio === workbench.main.split?.ratio) return;
              actions.onUpdateWorkbench(resizeMainSplit(workbench, ratio));
            },
          },
    leftDock: leftDock?.content,
    leftDockPresentation: leftDock?.presentation,
    leftDockWidth: leftDock?.width,
    leftDockResize:
      pending || !leftDock
        ? undefined
        : createProjectDockResizeBinding({
            actions,
            dock: leftDock,
            label: t('workspace.resizeLeftDock'),
            workbench,
          }),
    rightDock: rightDock?.content,
    rightDockPresentation: rightDock?.presentation,
    rightDockWidth: rightDock?.width,
    rightDockResize:
      pending || !rightDock
        ? undefined
        : createProjectDockResizeBinding({
            actions,
            dock: rightDock,
            label: t('workspace.resizeRightDock'),
            workbench,
          }),
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
    timelineVisible: workbench.timeline.presentation === 'docked',
    timelineHeight: workbench.timeline.height,
    timelineResize: pending
      ? undefined
      : {
          label: t('workspace.resizeTimeline'),
          minSize: DESKTOP_WORKBENCH_LIMITS.timelineHeight.min,
          maxSize: DESKTOP_WORKBENCH_LIMITS.timelineHeight.max,
          onResizeEnd: (height) => {
            if (height === workbench.timeline.height) return;
            actions.onUpdateWorkbench(resizeTimelineWorkbench(workbench, height));
          },
        },
  };
}

function createWorkspaceAgentPresentation(
  projection: DesktopShellProjection,
): AgentRootPresentation | undefined {
  const context = projection.window.scene.context;
  if (context.kind !== 'agent' || context.scope.kind !== 'workspace') return undefined;
  const conversationId = context.scope.conversationId;
  const authorityScope = {
    kind: 'workspace' as const,
    workspaceId: context.scope.workspaceId,
    workspaceGrantId: context.scope.workspaceGrantId,
  };
  return conversationId === undefined
    ? createAgentDraftPresentation(context.scope.draftId, authorityScope)
    : createAgentSessionPresentation(authorityScope, conversationId);
}

function MainViewGroupSurface({
  actions,
  allowCutRuntime,
  canvasCapability,
  cutCapability,
  group,
  pending,
  previewCapability,
  project,
  projection,
  timelineOwnerViewId,
  timelineTarget,
  workbench,
  resourceControl,
}: {
  readonly actions: ShellActions;
  readonly allowCutRuntime: boolean;
  readonly canvasCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly cutCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly group: DesktopWorkbenchMainGroup;
  readonly pending: boolean;
  readonly previewCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly timelineOwnerViewId?: string;
  readonly timelineTarget?: Element;
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly resourceControl?: JSX.Element;
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
  const canSplit = Boolean(activeView && activeView.kind !== 'cut' && group.viewIds.length > 1);
  return (
    <WorkbenchMainPanelSurface
      active={workbench.main.activeGroupId === group.groupId}
      actions={
        <>
          {resourceControl}
          <WorkbenchIconButton
            disabled={pending || !canSplit}
            icon={<RightPanelIcon size={15} />}
            label={t('workspace.mainTabs.splitRight')}
            onClick={() => {
              if (!activeView) throw new Error('Desktop Main split requires an active View.');
              actions.onUpdateWorkbench(splitMainView(workbench, activeView.viewId, 'columns'));
            }}
          />
          <WorkbenchIconButton
            disabled={pending || !canSplit}
            icon={<GridIcon size={15} />}
            label={t('workspace.mainTabs.splitDown')}
            onClick={() => {
              if (!activeView) throw new Error('Desktop Main split requires an active View.');
              actions.onUpdateWorkbench(splitMainView(workbench, activeView.viewId, 'rows'));
            }}
          />
        </>
      }
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
            actions.onUpdateWorkbench(closeMainView(workbench, viewId));
          }}
          onReorder={(sourceViewId, targetViewId) => {
            actions.onUpdateWorkbench(
              reorderMainView(workbench, group.groupId, sourceViewId, targetViewId),
            );
          }}
          onSelect={(viewId) => {
            const view = views.find((candidate) => candidate.viewId === viewId);
            if (!view) throw new Error(`Desktop Main Tab '${viewId}' is unavailable.`);
            actions.onUpdateWorkbench(openOrFocusMainView(workbench, view));
          }}
        />
      }
    >
      {views.length === 0 ? (
        <EmptyMainSurface />
      ) : (
        views.map((view) => {
          const active = view.viewId === activeView?.viewId;
          return (
            <div
              className="project-main-view-stack__item"
              data-active={active ? 'true' : 'false'}
              data-main-view-id={view.viewId}
              hidden={!active}
              key={`${view.viewId}:${view.viewEpoch}`}
            >
              {renderWorkbenchMainView({
                allowCutRuntime,
                canvasCapability,
                previewCapability,
                cutCapability,
                project,
                projection,
                timelineTarget: view.viewId === timelineOwnerViewId ? timelineTarget : undefined,
                view,
              })}
            </div>
          );
        })
      )}
    </WorkbenchMainPanelSurface>
  );
}

function renderWorkbenchMainView({
  allowCutRuntime,
  canvasCapability,
  previewCapability,
  cutCapability,
  project,
  projection,
  timelineTarget,
  view,
}: {
  readonly allowCutRuntime: boolean;
  readonly canvasCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly previewCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly cutCapability: DesktopShellProjection['domains'][number] | undefined;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly timelineTarget?: Element;
  readonly view: DesktopWorkbenchLayoutProjection['main']['views'][number];
}): JSX.Element {
  if (view.kind === 'preview' && previewCapability?.status === 'ready') {
    return <DesktopPreviewSurface project={project} projection={projection} view={view} />;
  }
  if (view.kind === 'canvas' && canvasCapability?.status === 'ready') {
    return <DesktopCanvasSurface project={project} projection={projection} view={view} />;
  }
  if (view.kind === 'cut' && cutCapability?.status === 'ready') {
    if (!allowCutRuntime) {
      return (
        <CreativeMainPlaceholder
          canvasDiagnostic="desktop-cut-inactive-session-not-rendered"
          project={project}
        />
      );
    }
    return (
      <DesktopCutSurface
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

function WorkbenchIconButton({
  active,
  disabled,
  icon,
  label,
  onClick,
}: {
  readonly active?: boolean;
  readonly disabled: boolean;
  readonly icon: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className="project-layout-icon-button"
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

type WorkbenchDisplayMode = 'chat-main-left' | 'chat-main-right' | 'chat-only' | 'main-only';

function WorkbenchDisplayMenu({
  actions,
  disabled,
  projection,
}: {
  readonly actions: ShellActions;
  readonly disabled: boolean;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const workbench = projection.window.workbench;
  const mode = getWorkbenchDisplayMode(workbench);
  const hasCreativeMain = workbench.main.views.length > 0;
  const selectMode = (nextMode: WorkbenchDisplayMode): void => {
    actions.onUpdateWorkbench(applyWorkbenchDisplayMode(workbench, nextMode));
    setOpen(false);
  };
  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={setOpen}
      side="right"
      trigger={
        <IconButton
          className="project-display-menu-trigger"
          data-workbench-display-control="primary-sidebar"
          disabled={disabled}
          icon={<RightPanelIcon size={16} />}
          label={t('workspace.displayMode')}
          title={t('workspace.displayMode')}
          aria-expanded={open}
        />
      }
    >
      <div className="project-display-menu" role="menu" aria-label={t('workspace.displayMode')}>
        <strong>{t('workspace.displayMode')}</strong>
        <DisplayMenuButton
          checked={mode === 'chat-main-left' || mode === 'chat-main-right'}
          label={t('workspace.chatAndMain')}
          onClick={() =>
            selectMode(mode === 'chat-main-right' ? 'chat-main-right' : 'chat-main-left')
          }
        />
        <div className="project-display-menu__nested">
          <DisplayMenuButton
            checked={mode === 'chat-main-left'}
            label={t('workspace.chatLeft')}
            onClick={() => selectMode('chat-main-left')}
          />
          <DisplayMenuButton
            checked={mode === 'chat-main-right'}
            label={t('workspace.chatRight')}
            onClick={() => selectMode('chat-main-right')}
          />
        </div>
        <DisplayMenuButton
          checked={mode === 'chat-only'}
          label={t('workspace.chatOnly')}
          onClick={() => selectMode('chat-only')}
        />
        <DisplayMenuButton
          checked={mode === 'main-only'}
          disabled={!hasCreativeMain}
          label={t('workspace.mainOnly')}
          onClick={() => selectMode('main-only')}
        />
      </div>
    </Popover>
  );
}

function DisplayMenuButton({
  checked,
  disabled = false,
  label,
  onClick,
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="project-display-menu__item"
      role="menuitemradio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
    >
      <RightPanelIcon size={16} />
      <span>{label}</span>
      {checked ? <CheckIcon size={15} /> : <span aria-hidden="true" />}
    </button>
  );
}

function createAgentDock(
  workbench: DesktopWorkbenchLayoutProjection,
  position: 'left' | 'right',
  effectivePosition: 'left' | 'right',
  agent: JSX.Element,
):
  | {
      readonly content: JSX.Element;
      readonly owner: 'agent';
      readonly presentation: 'docked' | 'overlay';
      readonly width: number;
    }
  | undefined {
  if (workbench.display.mode !== 'chat-main' || effectivePosition !== position) {
    return undefined;
  }
  return {
    content: (
      <div className="project-dock-panel" data-dock-owner="agent">
        {agent}
      </div>
    ),
    owner: 'agent',
    presentation: 'docked',
    width: workbench.display.chatWidth,
  };
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
}: {
  readonly actions: ShellActions;
  readonly dock:
    NonNullable<ReturnType<typeof createAgentDock>> | ReturnType<typeof createResourceDock>;
  readonly label: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}) {
  return {
    label,
    minSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.min,
    maxSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.max,
    onResizeEnd: (width: number) => {
      const currentWidth =
        dock.owner === 'agent' ? workbench.display.chatWidth : workbench.resourceDock.width;
      if (currentWidth === width) return;
      actions.onUpdateWorkbench(resizeProjectDockWorkbench(workbench, dock.owner, width));
    },
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
    revision: workbench.revision + 1,
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
    revision: workbench.revision + 1,
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
    revision: workbench.revision + 1,
    resourceDock: {
      ...workbench.resourceDock,
      presentation,
    },
    display:
      presentation !== 'hidden' &&
      workbench.display.mode === 'chat-main' &&
      workbench.display.chatPosition === 'right'
        ? {
            ...workbench.display,
            chatPosition: 'left',
          }
        : workbench.display,
  };
}

export function activateWorkbenchMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  view: DesktopWorkbenchLayoutProjection['main']['views'][number],
): DesktopWorkbenchLayoutProjection {
  return openOrFocusMainView(workbench, view);
}

function getWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
): WorkbenchDisplayMode {
  if (workbench.display.mode === 'chat-only') return 'chat-only';
  if (workbench.display.mode === 'main-only') return 'main-only';
  return workbench.display.chatPosition === 'left' ? 'chat-main-left' : 'chat-main-right';
}

export function applyWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
  mode: WorkbenchDisplayMode,
): DesktopWorkbenchLayoutProjection {
  if (mode === 'chat-only') return setWorkbenchDisplayMode(workbench, 'chat-only');
  if (mode === 'main-only') return setWorkbenchDisplayMode(workbench, 'main-only');
  const requestedPosition = mode === 'chat-main-left' ? 'left' : 'right';
  const chatPosition =
    workbench.resourceDock.presentation === 'hidden' ? requestedPosition : 'left';
  return setWorkbenchDisplayMode(workbench, 'chat-main', chatPosition);
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
      viewEpoch: tab.viewEpoch,
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

function AgentWorkspaceSurface({
  agentReady,
  agentPresentation,
  initialConversation,
  initialInput,
  project,
  tab,
}: {
  readonly agentReady: boolean;
  readonly agentPresentation?: AgentRootPresentation;
  readonly initialConversation?: { readonly id: string; readonly title: string };
  readonly initialInput?: { readonly id: string; readonly value: string };
  readonly project: DesktopProjectCatalogItem;
  readonly tab: DesktopShellProjection['window']['tabs'][number];
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <section
      className="agent-workspace"
      data-agent-scope={agentPresentation?.scope.kind}
      data-primary-surface="agent"
      aria-label={`${t('workspace.agent')} · ${project.displayName}`}
    >
      {agentReady ? (
        <DesktopAgentSurface
          agentPresentation={agentPresentation}
          binding="workspace"
          composerWorkspace={{ kind: 'workspace', label: project.displayName }}
          initialConversation={initialConversation}
          initialInput={initialInput}
          tab={tab}
        />
      ) : (
        <div className="agent-unavailable-card">
          <InfoIcon size={18} />
          <strong>{t('workspace.agent.unavailable')}</strong>
          <p>{t('workspace.agent.unavailableDetail')}</p>
          <code>desktop-domain-surface-unavailable</code>
        </div>
      )}
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
  const activeConversationId =
    projection.window.scene.context.kind === 'agent' &&
    projection.window.scene.context.scope.kind !== 'unbound'
      ? projection.window.scene.context.scope.conversationId
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
            <div className="primary-conversation-group__children">
              {conversations.map((conversation) => (
                <ConversationNavigationRow
                  active={conversation.navigation.conversationId === activeConversationId}
                  conversation={conversation}
                  disabled={disabled}
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
        {layoutControl}
        <IconButton
          className="primary-sidebar-toggle"
          disabled={disabled}
          icon={<LeftPanelIcon size={17} />}
          label={compact ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')}
          title={compact ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')}
          onClick={onToggle}
        />
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
