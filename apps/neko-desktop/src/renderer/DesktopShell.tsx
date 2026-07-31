import {
  CameraIcon,
  CheckIcon,
  ControlledWorkbenchShell,
  FolderIcon,
  GridIcon,
  IconButton,
  InfoIcon,
  LayersIcon,
  PackageIcon,
  PlusIcon,
  Popover,
  RightPanelIcon,
  ScissorsIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  StorylineIcon,
  TrashIcon,
  Tooltip,
  TooltipProvider,
  WarningIcon,
  WorkbenchEditorTabs,
  type ControlledWorkbenchResizeBinding,
} from '@neko/ui';
import { useTranslation } from '@neko/shared/i18n/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DesktopAgentHomeConversationSummary,
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '../shared/shell-contract';
import type {
  DesktopHomeAssetSearchResult,
  DesktopHomeMediaLibraryItem,
  DesktopHomeMediaLibraryLocationKind,
  DesktopHomeMediaLibrarySearchResult,
  DesktopHomePluginItem,
  DesktopHomePluginsResult,
  DesktopHomeSkillItem,
} from '../shared/home-management-contract';
import {
  DESKTOP_WORKBENCH_LIMITS,
  closeMainView,
  getActiveMainView,
  openOrFocusMainView,
  reorderMainView,
  resizeMainSplit,
  setWorkbenchDisplayMode,
  splitMainView,
  type DesktopWorkbenchLayoutProjection,
  type DesktopWorkbenchMainGroup,
} from '../shared/workbench-contract';
import { DesktopAgentSurface } from './DesktopAgentSurface';
import { DesktopResourceBrowserSurface } from './DesktopResourceBrowserSurface';
import { DesktopPreviewSurface } from './DesktopPreviewSurface';
import { DesktopCanvasSurface } from './DesktopCanvasSurface';
import { DesktopCutSurface } from './DesktopCutSurface';
import { DesktopSettingsSurface } from './DesktopSettingsSurface';
import {
  DesktopApplicationBrand,
  DesktopApplicationNavigationButton,
  DesktopApplicationSidebarFrame,
} from './DesktopApplicationSidebar';

type ShellState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: DesktopShellProjection }
  | { readonly kind: 'error'; readonly message: string };

type HomeSection = 'create' | 'assets' | 'plugins' | 'projects';
type TranslationFunction = ReturnType<typeof useTranslation>['t'];

interface ShellActions {
  readonly onHome: (section?: HomeSection) => void;
  readonly onOpenProject: () => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onDeleteConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onStartConversation: (projectId: string | undefined, input: string) => void;
  readonly onRemoveRecentProject: (project: DesktopProjectCatalogItem) => void;
  readonly onUpdateWorkbench: (workbench: DesktopWorkbenchLayoutProjection) => void;
  readonly onOpenSettings: () => void;
}

export function DesktopApplication(): JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<ShellState>({ kind: 'loading' });
  const [homeSection, setHomeSection] = useState<HomeSection>('create');
  const [applicationSurface, setApplicationSurface] = useState<'workspace' | 'settings'>(
    'workspace',
  );
  const [pending, setPending] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string>();
  const [agentNavigationTarget, setAgentNavigationTarget] =
    useState<DesktopAgentHomeConversationSummary>();
  const [agentInitialInput, setAgentInitialInput] = useState<{
    readonly handoffId: string;
    readonly projectId: string;
    readonly value: string;
  }>();
  const nextAgentHandoffId = useRef(0);
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
  const activeProject = resolveActiveProject(projection);
  const actions: ShellActions = {
    onHome: (section = 'create') => {
      setApplicationSurface('workspace');
      setHomeSection(section);
      setAgentNavigationTarget(undefined);
      setAgentInitialInput(undefined);
      void runMutation(() => window.openNekoDesktop.tabs.activateHome(projection.window.revision));
    },
    onOpenProject: () => {
      setApplicationSurface('workspace');
      setAgentNavigationTarget(undefined);
      setAgentInitialInput(undefined);
      void runMutation(async () => {
        const result = await window.openNekoDesktop.projects.openContent();
        return result.projection;
      });
    },
    onOpenRecent: (projectId) => {
      setApplicationSurface('workspace');
      const tab = projection.window.tabs.find((candidate) => candidate.projectId === projectId);
      if (tab) {
        setAgentNavigationTarget(undefined);
        setAgentInitialInput(undefined);
        void runMutation(() =>
          window.openNekoDesktop.tabs.activate(tab.tabId, projection.window.revision),
        );
        return;
      }
      setAgentNavigationTarget(undefined);
      setAgentInitialInput(undefined);
      void runMutation(async () => {
        const result = await window.openNekoDesktop.projects.open(projectId);
        return result.projection;
      });
    },
    onOpenConversation: (conversation) => {
      setApplicationSurface('workspace');
      const { navigation } = conversation;
      const tab = projection.window.tabs.find(
        (candidate) =>
          candidate.projectId === navigation.projectId &&
          projection.catalog.projects.some(
            (project) =>
              project.projectId === candidate.projectId &&
              project.workspaceId === navigation.workspaceId,
          ),
      );
      setAgentNavigationTarget(conversation);
      setAgentInitialInput(undefined);
      if (tab) {
        void runMutation(() =>
          window.openNekoDesktop.tabs.activate(tab.tabId, projection.window.revision),
        );
        return;
      }
      void runMutation(async () => {
        const result = await window.openNekoDesktop.projects.open(navigation.projectId);
        const project = result.projection.catalog.projects.find(
          (candidate) =>
            candidate.projectId === navigation.projectId &&
            candidate.workspaceId === navigation.workspaceId,
        );
        const openedTab = result.projection.window.tabs.find(
          (candidate) => candidate.projectId === navigation.projectId,
        );
        if (!project || !openedTab) {
          setAgentNavigationTarget(undefined);
          throw new Error(
            t('shell.conversationDetached', {
              conversationId: navigation.conversationId,
            }),
          );
        }
        return result.projection;
      });
    },
    onDeleteConversation: (conversation) => {
      if (
        !globalThis.confirm(
          t('shell.deleteConversationConfirm', {
            conversation: conversation.title,
          }),
        )
      ) {
        return;
      }
      void runMutation(async () => {
        const nextProjection = await window.openNekoDesktop.conversations.delete(
          conversation.navigation,
          projection.window.revision,
          projection.agentHome.revision,
        );
        if (
          agentNavigationTarget?.navigation.conversationId ===
            conversation.navigation.conversationId &&
          agentNavigationTarget.navigation.workspaceId === conversation.navigation.workspaceId
        ) {
          setAgentNavigationTarget(undefined);
        }
        return nextProjection;
      });
    },
    onStartConversation: (projectId, input) => {
      const value = input.trim();
      if (!value) return;
      setAgentNavigationTarget(undefined);
      void runMutation(async () => {
        nextAgentHandoffId.current += 1;
        const handoffId = `home-agent-input:${nextAgentHandoffId.current}`;
        if (projectId) {
          const tab = projection.window.tabs.find((candidate) => candidate.projectId === projectId);
          const nextProjection = tab
            ? await window.openNekoDesktop.tabs.activate(tab.tabId, projection.window.revision)
            : (await window.openNekoDesktop.projects.open(projectId)).projection;
          setAgentInitialInput({
            handoffId,
            projectId,
            value,
          });
          return nextProjection;
        }
        const result = await window.openNekoDesktop.projects.openContent();
        if (result.status === 'opened') {
          const activeTarget = result.projection.window.activeTarget;
          const openedTab =
            activeTarget.kind === 'project'
              ? result.projection.window.tabs.find(
                  (candidate) => candidate.tabId === activeTarget.tabId,
                )
              : undefined;
          if (!openedTab) {
            throw new Error(t('home.start.projectHandoffFailed'));
          }
          setAgentInitialInput({
            handoffId,
            projectId: openedTab.projectId,
            value,
          });
        }
        return result.projection;
      });
    },
    onRemoveRecentProject: (project) => {
      if (
        !globalThis.confirm(
          t('shell.removeRecentProjectConfirm', {
            project: project.displayName,
          }),
        )
      ) {
        return;
      }
      void runMutation(async () => {
        const nextProjection = await window.openNekoDesktop.projects.removeRecent(
          project.projectId,
          projection.window.revision,
          projection.catalog.revision,
        );
        if (activeProject?.projectId === project.projectId) {
          setAgentNavigationTarget(undefined);
          setAgentInitialInput(undefined);
        }
        return nextProjection;
      });
    },
    onUpdateWorkbench: (workbench) =>
      void runMutation(() =>
        window.openNekoDesktop.workbench.update(
          workbench,
          projection.window.revision,
          projection.window.workbench.revision,
        ),
      ),
    onOpenSettings: () => {
      setDiagnostic(undefined);
      setApplicationSurface('settings');
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
        {applicationSurface === 'settings' ? (
          <DesktopSettingsSurface
            onBack={() => setApplicationSurface('workspace')}
            sidebarResize={createApplicationPrimarySidebarResizeBinding({
              actions,
              disabled: pending,
              t,
              workbench: projection.window.workbench,
            })}
            sidebarWidth={projection.window.workbench.primarySidebar.width}
          />
        ) : activeProject ? (
          <ContentProjectWorkspace
            actions={actions}
            pending={pending}
            projection={projection}
            project={activeProject}
            initialConversation={
              agentNavigationTarget?.navigation.projectId === activeProject.projectId &&
              agentNavigationTarget.navigation.workspaceId === activeProject.workspaceId
                ? {
                    id: agentNavigationTarget.navigation.conversationId,
                    title: agentNavigationTarget.title,
                  }
                : undefined
            }
            initialInput={
              agentInitialInput?.projectId === activeProject.projectId
                ? {
                    id: agentInitialInput.handoffId,
                    value: agentInitialInput.value,
                  }
                : undefined
            }
          />
        ) : (
          <HomeWorkspace
            projection={projection}
            section={homeSection}
            pending={pending}
            actions={actions}
            onSectionChange={setHomeSection}
            onOpenRecent={actions.onOpenRecent}
            onOpenConversation={actions.onOpenConversation}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export function DesktopShellView({
  projection,
  homeSection = 'create',
}: {
  readonly projection: DesktopShellProjection;
  readonly homeSection?: HomeSection;
}): JSX.Element {
  const activeProject = resolveActiveProject(projection);
  const actions: ShellActions = {
    onHome: () => undefined,
    onOpenProject: () => undefined,
    onOpenRecent: () => undefined,
    onOpenConversation: () => undefined,
    onDeleteConversation: () => undefined,
    onStartConversation: () => undefined,
    onRemoveRecentProject: () => undefined,
    onUpdateWorkbench: () => undefined,
    onOpenSettings: () => undefined,
  };
  return activeProject ? (
    <ContentProjectWorkspace
      actions={actions}
      pending={false}
      projection={projection}
      project={activeProject}
    />
  ) : (
    <HomeWorkspace
      actions={actions}
      projection={projection}
      section={homeSection}
      pending={false}
      onSectionChange={() => undefined}
      onOpenRecent={() => undefined}
      onOpenConversation={() => undefined}
      interactive={false}
    />
  );
}

function HomeWorkspace({
  actions,
  interactive = true,
  projection,
  section,
  pending,
  onSectionChange,
  onOpenRecent,
  onOpenConversation,
}: {
  readonly actions: ShellActions;
  readonly interactive?: boolean;
  readonly projection: DesktopShellProjection;
  readonly section: HomeSection;
  readonly pending: boolean;
  readonly onSectionChange: (section: HomeSection) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const workbench = projection.window.workbench;
  const navigationCollapsed = !workbench.primarySidebar.visible;
  return (
    <div className="home-layout" data-navigation-collapsed={navigationCollapsed ? 'true' : 'false'}>
      <DesktopApplicationSidebarFrame
        compact={navigationCollapsed}
        expandedWidth={workbench.primarySidebar.width}
        resize={createApplicationPrimarySidebarResizeBinding({
          actions,
          disabled: pending || navigationCollapsed,
          t,
          workbench,
        })}
      >
        <ApplicationPrimarySidebar
          activeSection={section}
          compact={navigationCollapsed}
          onNavigate={onSectionChange}
          onDeleteConversation={actions.onDeleteConversation}
          onOpenConversation={onOpenConversation}
          onOpenRecent={onOpenRecent}
          onRemoveRecentProject={actions.onRemoveRecentProject}
          onOpenSettings={actions.onOpenSettings}
          onToggle={() => actions.onUpdateWorkbench(togglePrimarySidebarWorkbench(workbench))}
          projection={projection}
        />
      </DesktopApplicationSidebarFrame>
      <main className="home-main" data-home-surface="application">
        {section === 'create' ? (
          <HomeStartCreating actions={actions} pending={pending} projection={projection} />
        ) : section === 'assets' ? (
          <HomeAssetCenter interactive={interactive} />
        ) : section === 'plugins' ? (
          <HomePlugins interactive={interactive} />
        ) : (
          <HomeAllProjects onOpenRecent={onOpenRecent} projection={projection} />
        )}
      </main>
    </div>
  );
}

function HomeStartCreating({
  actions,
  projection,
  pending,
}: {
  readonly actions: ShellActions;
  readonly projection: DesktopShellProjection;
  readonly pending: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(projection.catalog.projects[0]?.projectId ?? '');
  const [input, setInput] = useState('');
  return (
    <div className="home-overview">
      <section
        className="home-start"
        aria-labelledby="home-start-title"
        data-home-composition="task-launchpad"
      >
        <header className="home-launchpad-heading">
          <span className="home-launchpad-heading-icon" aria-hidden="true">
            <StorylineIcon size={24} />
          </span>
          <div>
            <h1 id="home-start-title">{t('home.start.title')}</h1>
            <p>{t('home.start.subtitle')}</p>
          </div>
        </header>
        <form
          className="home-task-composer"
          data-agent-entry="project-handoff"
          data-home-agent-panel="composer"
          onSubmit={(event) => {
            event.preventDefault();
            actions.onStartConversation(projectId || undefined, input);
          }}
        >
          <textarea
            aria-label={t('home.start.inputLabel')}
            placeholder={t('home.start.inputPlaceholder')}
            rows={1}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
          <div className="home-task-composer-footer">
            <div className="home-task-composer-scope">
              {projection.catalog.projects.length === 0 ? (
                <button
                  type="button"
                  className="home-project-handoff home-project-handoff-button"
                  onClick={actions.onOpenProject}
                  disabled={pending}
                >
                  <FolderIcon size={16} />
                  {t('home.openProject')}
                </button>
              ) : (
                <label className="home-project-handoff">
                  <FolderIcon size={16} />
                  <select
                    aria-label={t('home.start.projectLabel')}
                    value={projectId}
                    disabled={pending}
                    onChange={(event) => {
                      const nextProjectId = event.currentTarget.value;
                      if (nextProjectId.length === 0) {
                        actions.onOpenProject();
                        return;
                      }
                      setProjectId(nextProjectId);
                    }}
                  >
                    <option value="">{t('home.openProject')}</option>
                    {projection.catalog.projects.map((project) => (
                      <option key={project.projectId} value={project.projectId}>
                        {project.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <IconButton
              className="home-agent-submit"
              disabled={pending || input.trim().length === 0}
              label={t('home.start.submit')}
              icon={<SendIcon size={16} />}
              size="md"
              type="submit"
              variant="default"
            />
          </div>
        </form>
        <section className="home-common-intents" aria-labelledby="home-common-intents-title">
          <h2 id="home-common-intents-title">{t('home.start.commonTasks')}</h2>
          <div className="home-intent-actions">
            <HomeIntentButton
              icon={<StorylineIcon size={16} />}
              label={t('home.start.shortcut.plan')}
              onClick={() => setInput(t('home.start.prompt.plan'))}
              pending={pending}
            />
            <HomeIntentButton
              icon={<PackageIcon size={16} />}
              label={t('home.start.shortcut.assets')}
              onClick={() => setInput(t('home.start.prompt.assets'))}
              pending={pending}
            />
            <HomeIntentButton
              icon={<LayersIcon size={16} />}
              label={t('home.start.shortcut.character')}
              onClick={() => setInput(t('home.start.prompt.character'))}
              pending={pending}
            />
            <HomeIntentButton
              icon={<ScissorsIcon size={16} />}
              label={t('home.start.shortcut.video')}
              onClick={() => setInput(t('home.start.prompt.video'))}
              pending={pending}
            />
          </div>
        </section>
        <section className="home-quick-starts" aria-labelledby="home-quick-starts-title">
          <header>
            <div>
              <h2 id="home-quick-starts-title">{t('home.start.quickStarts')}</h2>
              <p>{t('home.start.quickStartsDescription')}</p>
            </div>
          </header>
          <div className="home-template-grid">
            <HomeTemplateButton
              description={t('home.start.template.storyboard.description')}
              icon={<CameraIcon size={18} />}
              label={t('home.start.template.storyboard.title')}
              onClick={() => setInput(t('home.start.prompt.storyboard'))}
              pending={pending}
            />
            <HomeTemplateButton
              description={t('home.start.template.character.description')}
              icon={<LayersIcon size={18} />}
              label={t('home.start.template.character.title')}
              onClick={() => setInput(t('home.start.prompt.characterKit'))}
              pending={pending}
            />
            <HomeTemplateButton
              description={t('home.start.template.video.description')}
              icon={<ScissorsIcon size={18} />}
              label={t('home.start.template.video.title')}
              onClick={() => setInput(t('home.start.prompt.videoPlan'))}
              pending={pending}
            />
          </div>
        </section>
      </section>
    </div>
  );
}

function HomeIntentButton({
  icon,
  label,
  onClick,
  pending,
}: {
  readonly icon: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
  readonly pending: boolean;
}): JSX.Element {
  return (
    <button type="button" onClick={onClick} disabled={pending}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function HomeTemplateButton({
  description,
  icon,
  label,
  onClick,
  pending,
}: {
  readonly description: string;
  readonly icon: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
  readonly pending: boolean;
}): JSX.Element {
  return (
    <button type="button" onClick={onClick} disabled={pending}>
      <span className="home-template-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

type HomeAssetSortOption = 'name-ascending' | 'name-descending' | 'modified-descending';
type HomeNamedSortOption = 'name-ascending' | 'name-descending';
type HomeProjectSortOption =
  'updated-descending' | 'updated-ascending' | 'name-ascending' | 'name-descending';

function HomeAssetCenter({ interactive }: { readonly interactive: boolean }): JSX.Element {
  const { locale, t } = useTranslation();
  const [catalog, setCatalog] = useState<'mediaLibraries' | 'assets'>('mediaLibraries');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HomeAssetSortOption>('name-ascending');
  const [locationKind, setLocationKind] =
    useState<DesktopHomeMediaLibraryLocationKind>('local');
  const [selectedLibrary, setSelectedLibrary] = useState<DesktopHomeMediaLibraryItem>();
  const [relativePath, setRelativePath] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [assetResult, setAssetResult] = useState<DesktopHomeAssetSearchResult>();
  const [mediaLibraryResult, setMediaLibraryResult] =
    useState<DesktopHomeMediaLibrarySearchResult>();
  const [error, setError] = useState<string>();
  const [mutationDiagnostic, setMutationDiagnostic] = useState<string>();
  const [mutationNotice, setMutationNotice] = useState<string>();
  const [pendingAction, setPendingAction] = useState<string>();
  useEffect(() => {
    if (!interactive) return;
    let active = true;
    setError(undefined);
    setAssetResult(undefined);
    setMediaLibraryResult(undefined);
    const timeout = window.setTimeout(() => {
      const sortInput = {
        sortBy: sort === 'modified-descending' ? ('modifiedAt' as const) : ('name' as const),
        sortDirection:
          sort === 'name-descending' || sort === 'modified-descending'
            ? ('descending' as const)
            : ('ascending' as const),
        limit: 120,
      };
      const request =
        catalog === 'assets'
          ? window.openNekoDesktop.home.assets
              .search({ query, ...sortInput })
              .then((value) => {
                if (active) setAssetResult(value);
              })
          : selectedLibrary && query.length === 0
            ? window.openNekoDesktop.home.mediaLibraries
                .children({
                  libraryId: selectedLibrary.libraryId,
                  relativePath,
                  ...sortInput,
                })
                .then((value) => {
                  if (active) setMediaLibraryResult(value);
                })
            : window.openNekoDesktop.home.mediaLibraries
                .search({ query, ...sortInput })
                .then((value) => {
                  if (active) setMediaLibraryResult(value);
                });
      void request
        .catch((reason: unknown) => {
          if (active) setError(describeError(reason));
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [catalog, catalogRevision, interactive, query, relativePath, selectedLibrary, sort]);

  const addLibrary = useCallback(async (): Promise<void> => {
    setMutationDiagnostic(undefined);
    setMutationNotice(undefined);
    setPendingAction('add');
    try {
      const mutation =
        await window.openNekoDesktop.home.mediaLibraries.addLibrary(locationKind);
      if (mutation.status === 'cancelled') {
        setMutationNotice(t('home.assets.addCancelled'));
        return;
      }
      setMutationNotice(t('home.assets.added'));
      setCatalogRevision((revision) => revision + 1);
    } catch (reason: unknown) {
      setMutationDiagnostic(describeError(reason));
    } finally {
      setPendingAction(undefined);
    }
  }, [locationKind, t]);

  const removeLibrary = useCallback(
    async (item: DesktopHomeMediaLibraryItem) => {
      if (!window.confirm(t('home.assets.removeConfirm', { name: item.label }))) return;
      setMutationDiagnostic(undefined);
      setMutationNotice(undefined);
      setPendingAction(`remove:${item.id}`);
      try {
        await window.openNekoDesktop.home.mediaLibraries.removeLibrary(item.libraryId);
        setMutationNotice(t('home.assets.removed'));
        setSelectedLibrary(undefined);
        setRelativePath('');
        setCatalogRevision((revision) => revision + 1);
      } catch (reason: unknown) {
        setMutationDiagnostic(describeError(reason));
      } finally {
        setPendingAction(undefined);
      }
    },
    [t],
  );

  const revealLibrary = useCallback(
    async (item: DesktopHomeMediaLibraryItem) => {
      setMutationDiagnostic(undefined);
      setMutationNotice(undefined);
      setPendingAction(`reveal:${item.id}`);
      try {
        await window.openNekoDesktop.home.mediaLibraries.revealLibrary(item.libraryId);
        setMutationNotice(t('home.assets.revealed'));
      } catch (reason: unknown) {
        setMutationDiagnostic(describeError(reason));
      } finally {
        setPendingAction(undefined);
      }
    },
    [t],
  );
  const activeResult = catalog === 'assets' ? assetResult : mediaLibraryResult;
  const leaveDirectory = (): void => {
    if (relativePath) {
      const segments = relativePath.split('/');
      segments.pop();
      setRelativePath(segments.join('/'));
      return;
    }
    setSelectedLibrary(undefined);
  };
  return (
    <div className="home-management-page">
      <header className="home-management-header">
        <div>
          <p className="section-label">{t('home.assets.eyebrow')}</p>
          <h1>
            {catalog === 'mediaLibraries'
              ? t('home.mediaLibraries.title')
              : t('home.assetLibrary.title')}
          </h1>
          <p>
            {catalog === 'mediaLibraries'
              ? t('home.mediaLibraries.description')
              : t('home.assetLibrary.description')}
          </p>
        </div>
        <div className="home-management-header-actions">
          <button
            type="button"
            className="home-management-refresh"
            disabled={!interactive || pendingAction !== undefined}
            onClick={() => setCatalogRevision((revision) => revision + 1)}
          >
            {t('home.assets.refresh')}
          </button>
          {catalog === 'mediaLibraries' ? (
            <>
              <label className="home-sort-control">
                <span>{t('home.mediaLibraries.locationType')}</span>
                <select
                  aria-label={t('home.mediaLibraries.locationType')}
                  value={locationKind}
                  onChange={(event) =>
                    setLocationKind(
                      parseMediaLibraryLocationKind(event.currentTarget.value),
                    )
                  }
                >
                  <option value="local">{t('home.mediaLibraries.local')}</option>
                  <option value="nas">{t('home.mediaLibraries.nas')}</option>
                  <option value="cloud">{t('home.mediaLibraries.cloud')}</option>
                </select>
              </label>
              <button
                type="button"
                className="home-management-primary-action"
                disabled={!interactive || pendingAction !== undefined}
                onClick={() => void addLibrary()}
              >
                <PlusIcon size={14} />
                {pendingAction === 'add' ? t('home.assets.adding') : t('home.assets.add')}
              </button>
            </>
          ) : null}
        </div>
      </header>
      <div className="home-management-toolbar">
        <label className="home-search-field">
          <SearchIcon size={16} />
          <input
            key={catalog}
            aria-label={
              catalog === 'mediaLibraries'
                ? t('home.mediaLibraries.search')
                : t('home.assetLibrary.search')
            }
            placeholder={
              catalog === 'mediaLibraries'
                ? t('home.mediaLibraries.search')
                : t('home.assetLibrary.search')
            }
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="home-management-toolbar-actions">
          <label className="home-sort-control">
            <span>{t('home.sort.label')}</span>
            <select
              aria-label={t('home.assets.sort')}
              value={sort}
              onChange={(event) => setSort(parseHomeAssetSortOption(event.currentTarget.value))}
            >
              <option value="name-ascending">{t('home.sort.nameAscending')}</option>
              <option value="name-descending">{t('home.sort.nameDescending')}</option>
              <option value="modified-descending">{t('home.sort.newest')}</option>
            </select>
          </label>
          <div className="home-segmented-control" aria-label={t('home.assets.facets')}>
            {(['mediaLibraries', 'assets'] as const).map((value) => (
              <button
                type="button"
                className={catalog === value ? 'is-active' : ''}
                key={value}
                onClick={() => {
                  setCatalog(value);
                  setQuery('');
                  setSelectedLibrary(undefined);
                  setRelativePath('');
                }}
              >
                {value === 'mediaLibraries'
                  ? t('home.mediaLibraries.title')
                  : t('home.assetLibrary.title')}
              </button>
            ))}
          </div>
        </div>
      </div>
      {catalog === 'mediaLibraries' && selectedLibrary ? (
        <div className="home-management-path">
          <button type="button" onClick={leaveDirectory}>
            {t('home.mediaLibraries.back')}
          </button>
          <span>
            {selectedLibrary.label}
            {relativePath ? ` / ${relativePath}` : ''}
          </span>
        </div>
      ) : null}
      {mutationDiagnostic ? (
        <div className="home-management-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{mutationDiagnostic}</span>
        </div>
      ) : mutationNotice ? (
        <div className="home-management-notice" role="status">
          <CheckIcon size={17} />
          <span>{mutationNotice}</span>
        </div>
      ) : null}
      {error || activeResult?.status === 'error' ? (
        <div className="home-management-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>
            {error ??
              (activeResult?.status === 'error' ? activeResult.diagnostic.message : '')}
          </span>
        </div>
      ) : (
        <div className="home-management-grid">
          {(activeResult?.status === 'ready' ? activeResult.items : []).map((item) => (
            <article className="home-management-card" key={item.id}>
              <span className="home-management-card-icon">
                {item.kind === 'library' || item.kind === 'directory' ? (
                  <FolderIcon size={18} />
                ) : (
                  <GridIcon size={18} />
                )}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>
                  {item.description ?? item.mediaType ?? item.kind}
                  {item.modifiedAt ? ` · ${formatProjectDate(item.modifiedAt, locale)}` : ''}
                </small>
              </span>
              {catalog === 'mediaLibraries' && item.kind === 'library' ? (
                <span className="home-management-card-actions">
                  <button
                    type="button"
                    disabled={item.availability !== 'available'}
                    onClick={() => {
                      setSelectedLibrary(item);
                      setRelativePath('');
                    }}
                  >
                    {t('home.mediaLibraries.browse')}
                  </button>
                  <button
                    type="button"
                    disabled={pendingAction !== undefined}
                    onClick={() => void revealLibrary(item)}
                  >
                    {pendingAction === `reveal:${item.id}`
                      ? t('home.assets.revealing')
                      : t('home.assets.reveal')}
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={pendingAction !== undefined}
                    onClick={() => void removeLibrary(item)}
                  >
                    <TrashIcon size={13} />
                    {pendingAction === `remove:${item.id}`
                      ? t('home.assets.removing')
                      : t('home.assets.remove')}
                  </button>
                </span>
              ) : catalog === 'mediaLibraries' && item.kind === 'directory' ? (
                <span className="home-management-card-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLibrary(item);
                      setRelativePath(item.relativePath);
                    }}
                  >
                    {t('home.mediaLibraries.openFolder')}
                  </button>
                </span>
              ) : null}
            </article>
          ))}
          {activeResult?.status === 'ready' && activeResult.items.length === 0 ? (
            <HomeManagementEmpty
              icon={<SearchIcon size={22} />}
              label={
                catalog === 'mediaLibraries'
                  ? t('home.mediaLibraries.noResults')
                  : t('home.assetLibrary.noResults')
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function HomePlugins({ interactive }: { readonly interactive: boolean }): JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'skills' | 'plugins'>('skills');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HomeNamedSortOption>('name-ascending');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [result, setResult] = useState<DesktopHomePluginsResult>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!interactive) return;
    let active = true;
    setError(undefined);
    void window.openNekoDesktop.home.plugins
      .list()
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(describeError(reason));
      });
    return () => {
      active = false;
    };
  }, [catalogRevision, interactive]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const skills = useMemo(
    () => filterAndSortHomeSkills(result?.skills ?? [], normalizedQuery, sort),
    [normalizedQuery, result?.skills, sort],
  );
  const plugins = useMemo(
    () => filterAndSortHomePlugins(result?.plugins ?? [], normalizedQuery, sort),
    [normalizedQuery, result?.plugins, sort],
  );
  const discoveryIssueCount =
    (result?.skillDiscovery.diagnostics.reduce(
      (total, diagnostic) => total + diagnostic.count,
      0,
    ) ?? 0) + (result?.skillDiscovery.duplicateCount ?? 0);
  return (
    <div className="home-management-page">
      <header className="home-management-header">
        <div>
          <p className="section-label">{t('home.plugins.eyebrow')}</p>
          <h1>{t('home.plugins')}</h1>
          <p>{t('home.plugins.description')}</p>
        </div>
        <div className="home-management-header-actions">
          <button
            type="button"
            className="home-management-refresh"
            disabled={!interactive}
            onClick={() => setCatalogRevision((revision) => revision + 1)}
          >
            {t('home.plugins.refresh')}
          </button>
        </div>
      </header>
      <div className="home-management-toolbar">
        <label className="home-search-field">
          <SearchIcon size={16} />
          <input
            aria-label={t('home.plugins.search')}
            placeholder={t('home.plugins.search')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="home-management-toolbar-actions">
          <label className="home-sort-control">
            <span>{t('home.sort.label')}</span>
            <select
              aria-label={t('home.plugins.sort')}
              value={sort}
              onChange={(event) => setSort(parseHomeNamedSortOption(event.currentTarget.value))}
            >
              <option value="name-ascending">{t('home.sort.nameAscending')}</option>
              <option value="name-descending">{t('home.sort.nameDescending')}</option>
            </select>
          </label>
          <div className="home-segmented-control" aria-label={t('home.plugins.tabs')}>
            <button
              type="button"
              className={tab === 'skills' ? 'is-active' : ''}
              onClick={() => setTab('skills')}
            >
              {t('home.plugins.skills')}
            </button>
            <button
              type="button"
              className={tab === 'plugins' ? 'is-active' : ''}
              onClick={() => setTab('plugins')}
            >
              {t('home.plugins.plugins')}
            </button>
          </div>
        </div>
      </div>
      {error ? (
        <div className="home-management-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{error}</span>
        </div>
      ) : (
        <>
          {discoveryIssueCount > 0 ? (
            <div className="home-management-diagnostic" role="alert">
              <WarningIcon size={17} />
              <span>{t('home.plugins.discoveryIssues', { count: discoveryIssueCount })}</span>
            </div>
          ) : null}
          {tab === 'skills' ? (
            <div className="home-management-grid">
              {skills.map((skill) => (
                <article className="home-management-card" key={`${skill.source}:${skill.name}`}>
                  <span className="home-management-card-icon">
                    <PackageIcon size={18} />
                  </span>
                  <span>
                    <strong>{skill.name}</strong>
                    <small>{skill.description || skill.source}</small>
                  </span>
                  <span className="home-status-badge">
                    {t(`home.plugins.source.${skill.source}`)}
                  </span>
                </article>
              ))}
              {result && skills.length === 0 ? (
                <HomeManagementEmpty
                  icon={<PackageIcon size={22} />}
                  label={t('home.plugins.noSkills')}
                />
              ) : null}
            </div>
          ) : (
            <>
              <div className="home-management-grid">
                {plugins.map((plugin) => (
                  <article className="home-management-card" key={plugin.id}>
                    <span className="home-management-card-icon">
                      <GridIcon size={18} />
                    </span>
                    <span>
                      <strong>{plugin.name}</strong>
                      <small>{t('home.plugins.builtin')}</small>
                    </span>
                    <span className={`home-status-badge is-${plugin.status}`}>
                      {plugin.status === 'ready' ? t('home.available') : t('home.unavailable')}
                    </span>
                  </article>
                ))}
                {result && plugins.length === 0 ? (
                  <HomeManagementEmpty
                    icon={<PackageIcon size={22} />}
                    label={t('home.plugins.noPlugins')}
                  />
                ) : null}
              </div>
              <div className="home-plugin-host-notice">
                <InfoIcon size={17} />
                <span>{t('home.plugins.externalUnavailable')}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function HomeAllProjects({
  onOpenRecent,
  projection,
}: {
  readonly onOpenRecent: (projectId: string) => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HomeProjectSortOption>('updated-descending');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const projects = useMemo(
    () => filterAndSortHomeProjects(projection.catalog.projects, normalizedQuery, sort),
    [normalizedQuery, projection.catalog.projects, sort],
  );
  return (
    <div className="home-management-page">
      <header className="home-management-header">
        <div>
          <p className="section-label">{t('home.projects.eyebrow')}</p>
          <h1>{t('home.allProjects')}</h1>
          <p>{t('home.projects.description')}</p>
        </div>
      </header>
      <div className="home-management-toolbar">
        <label className="home-search-field">
          <SearchIcon size={16} />
          <input
            aria-label={t('home.projects.search')}
            placeholder={t('home.projects.search')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="home-management-toolbar-actions">
          <label className="home-sort-control">
            <span>{t('home.sort.label')}</span>
            <select
              aria-label={t('home.projects.sort')}
              value={sort}
              onChange={(event) => setSort(parseHomeProjectSortOption(event.currentTarget.value))}
            >
              <option value="updated-descending">{t('home.sort.newest')}</option>
              <option value="updated-ascending">{t('home.sort.oldest')}</option>
              <option value="name-ascending">{t('home.sort.nameAscending')}</option>
              <option value="name-descending">{t('home.sort.nameDescending')}</option>
            </select>
          </label>
          <div className="home-segmented-control" aria-label={t('home.projects.view')}>
            <button
              type="button"
              className={view === 'grid' ? 'is-active' : ''}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              {t('home.view.grid')}
            </button>
            <button
              type="button"
              className={view === 'list' ? 'is-active' : ''}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              {t('home.view.list')}
            </button>
          </div>
        </div>
      </div>
      {projects.length === 0 ? (
        <HomeManagementEmpty icon={<FolderIcon size={22} />} label={t('home.projects.noResults')} />
      ) : view === 'list' ? (
        <div className="recent-projects home-project-list">
          {projects.map((project) => (
            <button
              type="button"
              className="recent-project-row"
              key={project.projectId}
              onClick={() => onOpenRecent(project.projectId)}
            >
              <FolderIcon size={17} />
              <span className="recent-project-name">{project.displayName}</span>
              <span className="recent-project-kind">{t('home.content')}</span>
              <span className="recent-project-date">
                {formatProjectDate(project.updatedAt, locale)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="home-management-grid home-project-grid">
          {projects.map((project) => (
            <button
              type="button"
              className="home-management-card home-project-card"
              key={project.projectId}
              onClick={() => onOpenRecent(project.projectId)}
            >
              <span className="home-management-card-icon">
                <FolderIcon size={18} />
              </span>
              <span>
                <strong>{project.displayName}</strong>
                <small>
                  {t('home.content')} · {formatProjectDate(project.updatedAt, locale)}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function filterAndSortHomeSkills(
  skills: readonly DesktopHomeSkillItem[],
  query: string,
  sort: HomeNamedSortOption,
): readonly DesktopHomeSkillItem[] {
  return filterAndSortHomeNamedItems(
    skills,
    query,
    sort,
    (skill) => `${skill.name} ${skill.description} ${skill.source}`,
  );
}

export function filterAndSortHomePlugins(
  plugins: readonly DesktopHomePluginItem[],
  query: string,
  sort: HomeNamedSortOption,
): readonly DesktopHomePluginItem[] {
  return filterAndSortHomeNamedItems(
    plugins,
    query,
    sort,
    (plugin) => `${plugin.name} ${plugin.description} ${plugin.status}`,
  );
}

export function filterAndSortHomeProjects(
  projects: readonly DesktopProjectCatalogItem[],
  query: string,
  sort: HomeProjectSortOption,
): readonly DesktopProjectCatalogItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...projects]
    .filter((project) => project.displayName.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      if (sort === 'name-ascending' || sort === 'name-descending') {
        const compared =
          left.displayName.localeCompare(right.displayName) ||
          left.projectId.localeCompare(right.projectId);
        return sort === 'name-ascending' ? compared : -compared;
      }
      const compared =
        Date.parse(left.updatedAt) - Date.parse(right.updatedAt) ||
        left.projectId.localeCompare(right.projectId);
      return sort === 'updated-ascending' ? compared : -compared;
    });
}

function filterAndSortHomeNamedItems<T extends { readonly name: string }>(
  items: readonly T[],
  query: string,
  sort: HomeNamedSortOption,
  searchableText: (item: T) => string,
): readonly T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...items]
    .filter((item) => searchableText(item).toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      const compared = left.name.localeCompare(right.name);
      return sort === 'name-ascending' ? compared : -compared;
    });
}

export function parseHomeAssetSortOption(value: string): HomeAssetSortOption {
  switch (value) {
    case 'name-ascending':
    case 'name-descending':
    case 'modified-descending':
      return value;
    default:
      throw new Error(`Unknown Home asset sort option: ${value}`);
  }
}

function parseMediaLibraryLocationKind(
  value: string,
): DesktopHomeMediaLibraryLocationKind {
  switch (value) {
    case 'local':
    case 'nas':
    case 'cloud':
      return value;
    default:
      throw new Error(`Unknown Media Library location kind: ${value}`);
  }
}

export function parseHomeNamedSortOption(value: string): HomeNamedSortOption {
  switch (value) {
    case 'name-ascending':
    case 'name-descending':
      return value;
    default:
      throw new Error(`Unknown Home catalog sort option: ${value}`);
  }
}

export function parseHomeProjectSortOption(value: string): HomeProjectSortOption {
  switch (value) {
    case 'updated-descending':
    case 'updated-ascending':
    case 'name-ascending':
    case 'name-descending':
      return value;
    default:
      throw new Error(`Unknown Home project sort option: ${value}`);
  }
}

function HomeManagementEmpty({
  icon,
  label,
}: {
  readonly icon: JSX.Element;
  readonly label: string;
}): JSX.Element {
  return (
    <div className="home-management-empty">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ContentProjectWorkspace({
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
  readonly project: DesktopProjectCatalogItem;
}): JSX.Element {
  const { t } = useTranslation();
  const [cutTimelineTarget, setCutTimelineTarget] = useState<HTMLDivElement | null>(null);
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
  const workbench = projection.window.workbench;
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
      initialConversation={initialConversation}
      initialInput={initialInput}
      project={project}
      tab={tab}
    />
  );
  const resourceDock =
    assetsCapability?.status === 'ready' ? (
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
      <ResourceDockUnavailable
        diagnostic={
          assetsCapability?.status === 'unavailable'
            ? assetsCapability.diagnosticCode
            : 'desktop-media-library-not-mounted'
        }
      />
    );
  const leftDock = createProjectDock(workbench, 'left', agentDock, resourceDock);
  const rightDock = createProjectDock(workbench, 'right', agentDock, resourceDock);
  const mainSurface = agentMain ? (
    agentDock
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
    />
  );
  const timelineOwnerRenderedInMain =
    timelineOwner?.kind === 'cut' && timelineOwnerGroup?.groupId === primaryGroup.groupId;

  return (
    <ControlledWorkbenchShell
      className="project-workspace"
      primarySidebar={
        <ProjectPrimarySidebar
          actions={actions}
          pending={pending}
          project={project}
          projection={projection}
          compact={!workbench.primarySidebar.visible}
        />
      }
      primarySidebarVisible
      primarySidebarWidth={workbench.primarySidebar.visible ? workbench.primarySidebar.width : 64}
      primarySidebarResize={createApplicationPrimarySidebarResizeBinding({
        actions,
        disabled: pending || !workbench.primarySidebar.visible,
        t,
        workbench,
      })}
      main={
        <div className="project-main-host">
          <div className="project-main-host__content">{mainSurface}</div>
        </div>
      }
      secondaryMain={
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
        ) : undefined
      }
      mainSplit={workbench.main.split?.axis ?? 'none'}
      mainSplitRatio={workbench.main.split?.ratio}
      mainSplitResize={
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
            }
      }
      leftDock={leftDock?.content}
      leftDockPresentation={leftDock?.presentation}
      leftDockWidth={leftDock?.width}
      leftDockResize={
        pending || !leftDock
          ? undefined
          : createProjectDockResizeBinding({
              actions,
              dock: leftDock,
              label: t('workspace.resizeLeftDock'),
              workbench,
            })
      }
      rightDock={rightDock?.content}
      rightDockPresentation={rightDock?.presentation}
      rightDockWidth={rightDock?.width}
      rightDockResize={
        pending || !rightDock
          ? undefined
          : createProjectDockResizeBinding({
              actions,
              dock: rightDock,
              label: t('workspace.resizeRightDock'),
              workbench,
            })
      }
      timeline={
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
        )
      }
      timelineVisible={workbench.timeline.presentation === 'docked'}
      timelineHeight={workbench.timeline.height}
      timelineResize={
        pending
          ? undefined
          : {
              label: t('workspace.resizeTimeline'),
              minSize: DESKTOP_WORKBENCH_LIMITS.timelineHeight.min,
              maxSize: DESKTOP_WORKBENCH_LIMITS.timelineHeight.max,
              onResizeEnd: (height) => {
                if (height === workbench.timeline.height) return;
                actions.onUpdateWorkbench(resizeTimelineWorkbench(workbench, height));
              },
            }
      }
    />
  );
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
    <section
      className="project-main-group"
      data-main-group={group.groupId}
      data-active={workbench.main.activeGroupId === group.groupId ? 'true' : 'false'}
    >
      <header className="project-main-group__tabs">
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
        <div className="project-main-group__actions">
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
        </div>
      </header>
      <div className="project-main-group__content">
        {views.length === 0
          ? renderWorkbenchMainView({
              allowCutRuntime,
              canvasCapability,
              previewCapability,
              cutCapability,
              project,
              projection,
              view: undefined,
            })
          : views.map((view) => {
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
                    timelineTarget:
                      view.viewId === timelineOwnerViewId ? timelineTarget : undefined,
                    view,
                  })}
                </div>
              );
            })}
      </div>
    </section>
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
  readonly view: DesktopWorkbenchLayoutProjection['main']['views'][number] | undefined;
}): JSX.Element {
  if (view?.kind === 'preview' && previewCapability?.status === 'ready') {
    return <DesktopPreviewSurface project={project} projection={projection} view={view} />;
  }
  if (view?.kind === 'canvas' && canvasCapability?.status === 'ready') {
    return <DesktopCanvasSurface project={project} projection={projection} view={view} />;
  }
  if (view?.kind === 'cut' && cutCapability?.status === 'ready') {
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
          disabled={!hasCreativeMain}
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

function ProjectPrimarySidebar({
  actions,
  pending,
  project,
  projection,
  compact,
}: {
  readonly actions: ShellActions;
  readonly pending: boolean;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly compact: boolean;
}): JSX.Element {
  const workbench = projection.window.workbench;
  const togglePrimarySidebar = (): void => {
    actions.onUpdateWorkbench(togglePrimarySidebarWorkbench(workbench));
  };
  return (
    <DesktopApplicationSidebarFrame
      compact={compact}
      expandedWidth={workbench.primarySidebar.width}
    >
      <ApplicationPrimarySidebar
        activeProjectId={project.projectId}
        compact={compact}
        disabled={pending}
        onNavigate={actions.onHome}
        onDeleteConversation={actions.onDeleteConversation}
        onOpenConversation={actions.onOpenConversation}
        onOpenRecent={actions.onOpenRecent}
        onRemoveRecentProject={actions.onRemoveRecentProject}
        onOpenSettings={actions.onOpenSettings}
        onToggle={togglePrimarySidebar}
        projection={projection}
        layoutControl={
          <WorkbenchDisplayMenu actions={actions} disabled={pending} projection={projection} />
        }
      />
    </DesktopApplicationSidebarFrame>
  );
}

function createProjectDock(
  workbench: DesktopWorkbenchLayoutProjection,
  position: 'left' | 'right',
  agent: JSX.Element,
  resources: JSX.Element,
):
  | {
      readonly content: JSX.Element;
      readonly owner: 'agent' | 'resources';
      readonly presentation: 'docked' | 'overlay';
      readonly width: number;
    }
  | undefined {
  const agentPresentation =
    workbench.display.mode === 'chat-main' ? ('docked' as const) : ('hidden' as const);
  const agentPosition =
    workbench.display.mode === 'chat-main' ? workbench.display.chatPosition : undefined;
  const resourcePresentation = workbench.resourceDock.presentation;
  const resourcePosition =
    resourcePresentation === 'hidden'
      ? undefined
      : agentPosition === workbench.resourceDock.position
        ? oppositeDockPosition(agentPosition)
        : workbench.resourceDock.position;

  if (agentPosition === position) {
    return {
      content: (
        <div className="project-dock-panel" data-dock-owner="agent">
          {agent}
        </div>
      ),
      owner: 'agent',
      presentation: requireVisibleDockPresentation(agentPresentation, 'Agent'),
      width: workbench.display.chatWidth,
    };
  }
  if (resourcePosition !== position) return undefined;
  return {
    content: (
      <div className="project-dock-panel" data-dock-owner="resources">
        {resources}
      </div>
    ),
    owner: 'resources',
    presentation:
      resourcePresentation === 'overlay' && !isPreviewMainActive(workbench)
        ? 'docked'
        : requireVisibleDockPresentation(resourcePresentation, 'Resources'),
    width: workbench.resourceDock.width,
  };
}

function createProjectDockResizeBinding({
  actions,
  dock,
  label,
  workbench,
}: {
  readonly actions: ShellActions;
  readonly dock: NonNullable<ReturnType<typeof createProjectDock>>;
  readonly label: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}) {
  return {
    label,
    minSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.min,
    maxSize: DESKTOP_WORKBENCH_LIMITS.dockWidth.max,
    onResizeEnd: (width: number) => {
      const agentChanged = dock.owner === 'agent' && workbench.display.chatWidth !== width;
      const resourcesChanged = dock.owner === 'resources' && workbench.resourceDock.width !== width;
      if (!agentChanged && !resourcesChanged) return;
      actions.onUpdateWorkbench(resizeProjectDockWorkbench(workbench, dock.owner, width));
    },
  };
}

export function resizePrimarySidebarWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  width: number,
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    revision: workbench.revision + 1,
    primarySidebar: {
      ...workbench.primarySidebar,
      width,
    },
  };
}

function createApplicationPrimarySidebarResizeBinding({
  actions,
  disabled,
  t,
  workbench,
}: {
  readonly actions: ShellActions;
  readonly disabled: boolean;
  readonly t: TranslationFunction;
  readonly workbench: DesktopWorkbenchLayoutProjection;
}): ControlledWorkbenchResizeBinding | undefined {
  if (disabled) return undefined;
  return {
    label: t('workspace.resizePrimarySidebar'),
    minSize: DESKTOP_WORKBENCH_LIMITS.primarySidebarWidth.min,
    maxSize: DESKTOP_WORKBENCH_LIMITS.primarySidebarWidth.max,
    onResizeEnd: (width) => {
      if (width === workbench.primarySidebar.width) return;
      actions.onUpdateWorkbench(resizePrimarySidebarWorkbench(workbench, width));
    },
  };
}

function togglePrimarySidebarWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchLayoutProjection {
  return {
    ...workbench,
    revision: workbench.revision + 1,
    primarySidebar: {
      ...workbench.primarySidebar,
      visible: !workbench.primarySidebar.visible,
    },
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

export function nextResourceDockPresentation(
  workbench: DesktopWorkbenchLayoutProjection,
): 'hidden' | 'docked' | 'overlay' {
  if (workbench.resourceDock.presentation !== 'hidden') return 'hidden';
  return isPreviewMainActive(workbench) ? 'overlay' : 'docked';
}

export function setResourceDockPresentationWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  presentation: 'hidden' | 'docked' | 'overlay',
): DesktopWorkbenchLayoutProjection {
  const agentPosition =
    workbench.display.mode === 'chat-main' ? workbench.display.chatPosition : undefined;
  return {
    ...workbench,
    revision: workbench.revision + 1,
    resourceDock: {
      ...workbench.resourceDock,
      presentation,
      position:
        presentation !== 'hidden' && agentPosition
          ? oppositeDockPosition(agentPosition)
          : workbench.resourceDock.position,
    },
  };
}

function oppositeDockPosition(position: 'left' | 'right'): 'left' | 'right' {
  return position === 'left' ? 'right' : 'left';
}

function requireVisibleDockPresentation(
  presentation: 'hidden' | 'docked' | 'overlay',
  owner: 'Agent' | 'Resources',
): 'docked' | 'overlay' {
  if (presentation === 'hidden') {
    throw new Error(`${owner} cannot own a visible Desktop dock while hidden.`);
  }
  return presentation;
}

function isPreviewMainActive(workbench: DesktopWorkbenchLayoutProjection): boolean {
  return getActiveMainView(workbench)?.kind === 'preview';
}

export function activateWorkbenchMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  view: DesktopWorkbenchLayoutProjection['main']['views'][number],
): DesktopWorkbenchLayoutProjection {
  const activated = openOrFocusMainView(workbench, view);
  return {
    ...activated,
    resourceDock: {
      ...activated.resourceDock,
      presentation:
        view.kind !== 'preview' && activated.resourceDock.presentation === 'overlay'
          ? 'docked'
          : activated.resourceDock.presentation,
    },
  };
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
  const chatPosition = mode === 'chat-main-left' ? 'left' : 'right';
  const displayed = setWorkbenchDisplayMode(workbench, 'chat-main', chatPosition);
  return displayed.resourceDock.presentation === 'hidden'
    ? displayed
    : {
        ...displayed,
        resourceDock: {
          ...displayed.resourceDock,
          position: oppositeDockPosition(chatPosition),
        },
      };
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

function ResourceDockUnavailable({ diagnostic }: { readonly diagnostic: string }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className="resource-dock" aria-label={t('workspace.resources')}>
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
  initialConversation,
  initialInput,
  project,
  tab,
}: {
  readonly agentReady: boolean;
  readonly initialConversation?: { readonly id: string; readonly title: string };
  readonly initialInput?: { readonly id: string; readonly value: string };
  readonly project: DesktopProjectCatalogItem;
  readonly tab: DesktopShellProjection['window']['tabs'][number];
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <section
      className="agent-workspace"
      data-primary-surface="agent"
      aria-label={`${t('workspace.agent')} · ${project.displayName}`}
    >
      {agentReady ? (
        <DesktopAgentSurface
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
}: {
  readonly activeProjectId?: string;
  readonly activeSection?: HomeSection;
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly onNavigate: (section: HomeSection) => void;
  readonly onDeleteConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRemoveRecentProject: (project: DesktopProjectCatalogItem) => void;
  readonly onOpenSettings: () => void;
  readonly onToggle: () => void;
  readonly projection: DesktopShellProjection;
  readonly layoutControl?: JSX.Element;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <aside
      className={`home-navigation project-primary-sidebar ${
        compact ? 'home-navigation--compact project-primary-sidebar--compact' : ''
      }`}
      data-primary-sidebar="application"
    >
      <PrimarySidebarBrand compact={compact} disabled={disabled} onToggle={onToggle} />
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
          active={activeSection === 'plugins'}
          disabled={disabled}
          label={t('home.plugins')}
          icon={<PackageIcon size={17} />}
          onClick={() => onNavigate('plugins')}
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
        layoutControl={layoutControl}
        onOpenSettings={onOpenSettings}
        projection={projection}
      />
    </aside>
  );
}

function PrimarySidebarBrand({
  compact,
  disabled = false,
  onToggle,
}: {
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <DesktopApplicationBrand
      control={
        <IconButton
          className="home-brand-toggle"
          disabled={disabled}
          label={compact ? t('workspace.expandSidebar') : t('workspace.collapseSidebar')}
          icon={<RightPanelIcon size={16} />}
          onClick={onToggle}
        />
      }
    />
  );
}

function PrimarySidebarFooter({
  layoutControl,
  onOpenSettings,
  projection,
}: {
  readonly layoutControl?: JSX.Element;
  readonly onOpenSettings: () => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="home-navigation-footer">
      <AttentionSummary projection={projection} />
      <div className="home-navigation-footer__actions">
        {layoutControl}
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
  return (
    <div className="home-recent-navigation">
      <div className="home-sidebar-heading">
        <span>{t('home.recentProjects')}</span>
        <span>{projection.catalog.projects.length}</span>
      </div>
      {projection.catalog.projects.slice(0, 6).map((project) => {
        return (
          <div
            className="primary-recent-project-row"
            data-active={project.projectId === activeProjectId ? 'true' : 'false'}
            key={project.projectId}
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
              label={t('shell.removeRecentProject', {
                project: project.displayName,
              })}
              icon={<TrashIcon size={13} />}
              onClick={() => onRemoveRecentProject(project)}
            />
          </div>
        );
      })}
      <div className="home-sidebar-heading home-sidebar-conversation-heading">
        <span>{t('home.recentConversations')}</span>
        <span>{projection.agentHome.conversations.length}</span>
      </div>
      {projection.agentHome.conversations.slice(0, 8).map((conversation) => (
        <div
          className="primary-recent-project-row primary-recent-conversation-row"
          key={`${conversation.navigation.workspaceId}:${conversation.navigation.conversationId}`}
        >
          <button
            type="button"
            className="home-project-link home-conversation-link"
            disabled={disabled}
            onClick={() => onOpenConversation(conversation)}
          >
            <StorylineIcon size={15} />
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
            label={t('shell.deleteConversation', {
              conversation: conversation.title,
            })}
            icon={<TrashIcon size={13} />}
            onClick={() => onDeleteConversation(conversation)}
          />
        </div>
      ))}
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
  attention: DesktopShellProjection['agentHome']['conversations'][number]['attention'],
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

function resolveActiveProject(
  projection: DesktopShellProjection,
): DesktopProjectCatalogItem | undefined {
  const activeTarget = projection.window.activeTarget;
  if (activeTarget.kind === 'home') return undefined;
  const tab = projection.window.tabs.find((candidate) => candidate.tabId === activeTarget.tabId);
  if (!tab) throw new Error('Desktop Shell active Tab is missing from its projection.');
  const project = projection.catalog.projects.find(
    (candidate) => candidate.projectId === tab.projectId,
  );
  if (!project) throw new Error('Desktop Shell active Project is missing from its catalog.');
  return project;
}

function formatProjectDate(value: string, locale: 'en' | 'zh-cn'): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale === 'zh-cn' ? 'zh-CN' : 'en', {
        month: 'short',
        day: 'numeric',
      }).format(date);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
