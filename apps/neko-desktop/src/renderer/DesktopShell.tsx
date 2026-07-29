import {
  CheckIcon,
  ControlledWorkbenchShell,
  FolderIcon,
  GridIcon,
  IconButton,
  InfoIcon,
  PackageIcon,
  PlusIcon,
  Popover,
  RightPanelIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  StorylineIcon,
  Tooltip,
  TooltipProvider,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/shared/i18n/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DesktopAgentHomeConversationSummary,
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '../shared/shell-contract';
import type {
  DesktopHomeAssetFacet,
  DesktopHomeAssetSearchResult,
  DesktopHomePluginsResult,
} from '../shared/home-management-contract';
import {
  DESKTOP_WORKBENCH_LIMITS,
  type DesktopWorkbenchLayoutProjection,
} from '../shared/workbench-contract';
import { DesktopAgentSurface } from './DesktopAgentSurface';
import { DesktopResourceBrowserSurface } from './DesktopResourceBrowserSurface';
import { DesktopPreviewSurface } from './DesktopPreviewSurface';
import { DesktopCanvasSurface } from './DesktopCanvasSurface';
import { DesktopCutSurface } from './DesktopCutSurface';
import { DESKTOP_DEFAULT_CANVAS_DOCUMENT_ID } from '../shared/canvas-bridge-contract';

type ShellState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: DesktopShellProjection }
  | { readonly kind: 'error'; readonly message: string };

type HomeSection = 'create' | 'assets' | 'plugins' | 'creations';
type TranslationFunction = ReturnType<typeof useTranslation>['t'];

interface ShellActions {
  readonly onHome: (section?: HomeSection) => void;
  readonly onOpenProject: () => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onOpenConversation: (
    conversation: DesktopAgentHomeConversationSummary,
  ) => void;
  readonly onStartConversation: (projectId: string | undefined, input: string) => void;
  readonly onCloseTab: (tabId: string) => void;
  readonly onUpdateWorkbench: (workbench: DesktopWorkbenchLayoutProjection) => void;
  readonly onOpenSettings: () => void;
}

export function DesktopApplication(): JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<ShellState>({ kind: 'loading' });
  const [homeSection, setHomeSection] = useState<HomeSection>('create');
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
      setHomeSection(section);
      setAgentNavigationTarget(undefined);
      setAgentInitialInput(undefined);
      void runMutation(() =>
        window.openNekoDesktop.tabs.activateHome(projection.window.revision),
      );
    },
    onOpenProject: () => {
      setAgentNavigationTarget(undefined);
      setAgentInitialInput(undefined);
      void runMutation(async () => {
        const result = await window.openNekoDesktop.projects.openContent();
        return result.projection;
      });
    },
    onOpenRecent: (projectId) => {
      const tab = projection.window.tabs.find(
        (candidate) => candidate.projectId === projectId,
      );
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
    onStartConversation: (projectId, input) => {
      const value = input.trim();
      if (!value) return;
      setAgentNavigationTarget(undefined);
      void runMutation(async () => {
        nextAgentHandoffId.current += 1;
        const handoffId = `home-agent-input:${nextAgentHandoffId.current}`;
        if (projectId) {
          const tab = projection.window.tabs.find(
            (candidate) => candidate.projectId === projectId,
          );
          const nextProjection = tab
            ? await window.openNekoDesktop.tabs.activate(
                tab.tabId,
                projection.window.revision,
              )
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
    onCloseTab: (tabId) =>
      void runMutation(() =>
        window.openNekoDesktop.tabs.close(tabId, projection.window.revision),
      ),
    onUpdateWorkbench: (workbench) =>
      void runMutation(() =>
        window.openNekoDesktop.workbench.update(
          workbench,
          projection.window.revision,
          projection.window.workbench.revision,
        ),
      ),
    onOpenSettings: () => {
      const activeTarget = projection.window.activeTarget;
      const activeTab =
        activeTarget.kind === 'project'
          ? projection.window.tabs.find(
              (tab) => tab.tabId === activeTarget.tabId,
            )
          : projection.window.tabs[0];
      if (!activeTab) {
        setDiagnostic(t('shell.settingsNeedProject'));
        return;
      }
      setDiagnostic(undefined);
      void window.openNekoDesktop.agent
        .getBootstrap(activeTab.projectId, activeTab.viewId, activeTab.viewEpoch)
        .then((bootstrap) => {
          if (bootstrap.status === 'unavailable') {
            throw new Error(bootstrap.diagnostic.message);
          }
          window.openNekoDesktop.agent.send({ type: 'openUserConfigFile' });
        })
        .catch((error: unknown) => setDiagnostic(describeError(error)));
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
        {activeProject ? (
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
    onStartConversation: () => undefined,
    onCloseTab: () => undefined,
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
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  return (
    <div
      className="home-layout"
      data-navigation-collapsed={navigationCollapsed ? 'true' : 'false'}
    >
      <aside
        className={`home-navigation ${navigationCollapsed ? 'home-navigation--compact' : ''}`}
      >
        <PrimarySidebarBrand
          compact={navigationCollapsed}
          onToggle={() => setNavigationCollapsed((value) => !value)}
        />
        <nav className="home-primary-navigation" aria-label={t('home.label')}>
          <HomeNavigationButton
            active={section === 'create'}
            label={t('home.overview')}
            icon={<PlusIcon size={17} />}
            onClick={() => onSectionChange('create')}
          />
          <HomeNavigationButton
            active={section === 'assets'}
            label={t('home.mediaLibrary')}
            icon={<SearchIcon size={17} />}
            onClick={() => onSectionChange('assets')}
          />
          <HomeNavigationButton
            active={section === 'plugins'}
            label={t('home.plugins')}
            icon={<PackageIcon size={17} />}
            onClick={() => onSectionChange('plugins')}
          />
          <HomeNavigationButton
            active={section === 'creations'}
            label={t('home.allCreations')}
            icon={<FolderIcon size={17} />}
            onClick={() => onSectionChange('creations')}
          />
        </nav>
        {navigationCollapsed ? null : (
          <PrimaryRecentNavigation
            onOpenConversation={onOpenConversation}
            onOpenRecent={onOpenRecent}
            projection={projection}
          />
        )}
        <div className="home-navigation-footer">
          {navigationCollapsed ? null : <AttentionSummary projection={projection} />}
          <Tooltip
            content={
              projection.window.tabs.length > 0
                ? t('shell.settingsLabel')
                : t('shell.settingsNeedProject')
            }
          >
            <IconButton
              disabled={projection.window.tabs.length === 0}
              label={t('shell.settingsLabel')}
              icon={<SettingsIcon size={16} />}
              onClick={actions.onOpenSettings}
            />
          </Tooltip>
        </div>
      </aside>
      <main className="home-main dotted-surface">
        {section === 'create' ? (
          <HomeStartCreating actions={actions} pending={pending} projection={projection} />
        ) : section === 'assets' ? (
          <HomeAssetCenter
            interactive={interactive}
            onOpenProject={onOpenRecent}
            projection={projection}
          />
        ) : section === 'plugins' ? (
          <HomePlugins interactive={interactive} projection={projection} />
        ) : (
          <HomeAllCreations
            onOpenConversation={onOpenConversation}
            onOpenRecent={onOpenRecent}
            projection={projection}
          />
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
  const [projectId, setProjectId] = useState(
    projection.catalog.projects[0]?.projectId ?? '',
  );
  const [input, setInput] = useState('');
  return (
    <div className="home-overview">
      <section className="home-start" aria-labelledby="home-start-title">
        <div className="home-hero">
          <span className="home-hero-mark" aria-hidden="true">N</span>
          <div>
            <h1 id="home-start-title">{t('home.start.title')}</h1>
            <p>{t('home.start.subtitle')}</p>
          </div>
        </div>
        <form
          className="home-agent-composer"
          onSubmit={(event) => {
            event.preventDefault();
            actions.onStartConversation(projectId || undefined, input);
          }}
        >
          <textarea
            aria-label={t('home.start.inputLabel')}
            placeholder={t('home.start.inputPlaceholder')}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
          />
          <div className="home-agent-composer-footer">
            <label>
              <FolderIcon size={16} />
              <select
                aria-label={t('home.start.projectLabel')}
                value={projectId}
                onChange={(event) => setProjectId(event.currentTarget.value)}
              >
                <option value="">{t('home.start.chooseWorkspace')}</option>
                {projection.catalog.projects.map((project) => (
                  <option key={project.projectId} value={project.projectId}>
                    {project.displayName}
                  </option>
                ))}
              </select>
            </label>
            <IconButton
              disabled={pending || input.trim().length === 0}
              label={t('home.start.submit')}
              icon={<SendIcon size={16} />}
              type="submit"
            />
          </div>
        </form>
        <div className="home-start-shortcuts">
          <button type="button" onClick={actions.onOpenProject} disabled={pending}>
            <PlusIcon size={16} />
            {t('home.openProject')}
          </button>
          <button
            type="button"
            onClick={() => setInput(t('home.start.prompt.plan'))}
            disabled={pending}
          >
            {t('home.start.shortcut.plan')}
          </button>
          <button
            type="button"
            onClick={() => setInput(t('home.start.prompt.assets'))}
            disabled={pending}
          >
            {t('home.start.shortcut.assets')}
          </button>
        </div>
      </section>
    </div>
  );
}

function HomeAssetCenter({
  interactive,
  onOpenProject,
  projection,
}: {
  readonly interactive: boolean;
  readonly onOpenProject: (projectId: string) => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(
    projection.catalog.projects[0]?.projectId ?? '',
  );
  const [facet, setFacet] = useState<DesktopHomeAssetFacet>('files');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<DesktopHomeAssetSearchResult>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!interactive || !projectId) return;
    let active = true;
    setError(undefined);
    setResult(undefined);
    const timeout = window.setTimeout(() => {
      void window.openNekoDesktop.home.assets
        .search({ projectId, facet, query, limit: 80 })
        .then((value) => {
          if (active) setResult(value);
        })
        .catch((reason: unknown) => {
          if (active) setError(describeError(reason));
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [facet, interactive, projectId, query]);
  return (
    <div className="home-management-page">
      <header className="home-management-header">
        <div>
          <p className="section-label">{t('home.assets.eyebrow')}</p>
          <h1>{t('home.mediaLibrary')}</h1>
          <p>{t('home.assets.description')}</p>
        </div>
        <ProjectSelector
          projectId={projectId}
          projects={projection.catalog.projects}
          onChange={setProjectId}
        />
      </header>
      <div className="home-management-toolbar">
        <label className="home-search-field">
          <SearchIcon size={16} />
          <input
            aria-label={t('home.assets.search')}
            placeholder={t('home.assets.search')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="home-segmented-control" aria-label={t('home.assets.facets')}>
          {(['files', 'media', 'entities'] as const).map((value) => (
            <button
              type="button"
              className={facet === value ? 'is-active' : ''}
              key={value}
              onClick={() => setFacet(value)}
            >
              {t(`home.assets.${value}`)}
            </button>
          ))}
        </div>
      </div>
      {!projectId ? (
        <HomeManagementEmpty
          icon={<FolderIcon size={22} />}
          label={t('home.assets.noProject')}
        />
      ) : error || result?.status === 'error' ? (
        <div className="home-management-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{error ?? (result?.status === 'error' ? result.diagnostic.message : '')}</span>
        </div>
      ) : (
        <div className="home-management-grid">
          {(result?.status === 'ready' ? result.items : []).map((item) => (
            <button
              type="button"
              className="home-management-card"
              key={item.id}
              onClick={() => onOpenProject(projectId)}
            >
              <span className="home-management-card-icon">
                {item.kind === 'entity' ? (
                  <StorylineIcon size={18} />
                ) : item.kind === 'directory' ? (
                  <FolderIcon size={18} />
                ) : (
                  <GridIcon size={18} />
                )}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description ?? item.mediaType ?? item.kind}</small>
              </span>
            </button>
          ))}
          {result?.status === 'ready' && result.items.length === 0 ? (
            <HomeManagementEmpty
              icon={<SearchIcon size={22} />}
              label={t('home.assets.noResults')}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function HomePlugins({
  interactive,
  projection,
}: {
  readonly interactive: boolean;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState(
    projection.catalog.projects[0]?.projectId ?? '',
  );
  const [tab, setTab] = useState<'skills' | 'extensions'>('skills');
  const [result, setResult] = useState<DesktopHomePluginsResult>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!interactive || !projectId) return;
    let active = true;
    setError(undefined);
    void window.openNekoDesktop.home.plugins
      .list(projectId)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(describeError(reason));
      });
    return () => {
      active = false;
    };
  }, [interactive, projectId]);
  const extensions = result?.extensions ?? projection.domains;
  return (
    <div className="home-management-page">
      <header className="home-management-header">
        <div>
          <p className="section-label">{t('home.plugins.eyebrow')}</p>
          <h1>{t('home.plugins')}</h1>
          <p>{t('home.plugins.description')}</p>
        </div>
        <ProjectSelector
          projectId={projectId}
          projects={projection.catalog.projects}
          onChange={setProjectId}
        />
      </header>
      <div className="home-segmented-control home-management-tabs">
        <button
          type="button"
          className={tab === 'skills' ? 'is-active' : ''}
          onClick={() => setTab('skills')}
        >
          {t('home.plugins.skills')}
        </button>
        <button
          type="button"
          className={tab === 'extensions' ? 'is-active' : ''}
          onClick={() => setTab('extensions')}
        >
          {t('home.plugins.extensions')}
        </button>
      </div>
      {error ? (
        <div className="home-management-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{error}</span>
        </div>
      ) : tab === 'skills' ? (
        <div className="home-management-grid">
          {(result?.skills ?? []).map((skill) => (
            <article className="home-management-card" key={`${skill.source}:${skill.name}`}>
              <span className="home-management-card-icon"><PackageIcon size={18} /></span>
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.description || skill.source}</small>
              </span>
              <span className="home-status-badge">{t(`home.plugins.source.${skill.source}`)}</span>
            </article>
          ))}
          {result && result.skills.length === 0 ? (
            <HomeManagementEmpty
              icon={<PackageIcon size={22} />}
              label={t('home.plugins.noSkills')}
            />
          ) : null}
        </div>
      ) : (
        <>
          <div className="home-management-grid">
            {extensions.map((extension) => (
              <article className="home-management-card" key={extension.surface}>
                <span className="home-management-card-icon"><GridIcon size={18} /></span>
                <span>
                  <strong>{extension.surface}</strong>
                  <small>{t('home.plugins.builtin')}</small>
                </span>
                <span className={`home-status-badge is-${extension.status}`}>
                  {extension.status === 'ready'
                    ? t('home.available')
                    : t('home.unavailable')}
                </span>
              </article>
            ))}
          </div>
          <div className="home-plugin-host-notice">
            <InfoIcon size={17} />
            <span>{t('home.plugins.externalUnavailable')}</span>
          </div>
        </>
      )}
    </div>
  );
}

function HomeAllCreations({
  onOpenConversation,
  onOpenRecent,
  projection,
}: {
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { locale, t } = useTranslation();
  return (
    <div className="home-management-page">
      <header className="home-management-header">
        <div>
          <p className="section-label">{t('home.creations.eyebrow')}</p>
          <h1>{t('home.allCreations')}</h1>
          <p>{t('home.creations.description')}</p>
        </div>
      </header>
      <div className="home-summary-grid home-creations-grid">
        <section className="project-section" aria-labelledby="all-projects-title">
          <div className="section-heading">
            <h2 id="all-projects-title">{t('home.recentContentProjects')}</h2>
            <span>{projection.catalog.projects.length}</span>
          </div>
          <div className="recent-projects">
            {projection.catalog.projects.map((project) => (
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
        </section>
        <AgentConversationSummaryList
          limit={false}
          projection={projection}
          onOpenConversation={onOpenConversation}
        />
      </div>
    </div>
  );
}

function ProjectSelector({
  onChange,
  projectId,
  projects,
}: {
  readonly onChange: (projectId: string) => void;
  readonly projectId: string;
  readonly projects: readonly DesktopProjectCatalogItem[];
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <label className="home-project-selector">
      <FolderIcon size={16} />
      <select
        aria-label={t('home.start.projectLabel')}
        value={projectId}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">{t('home.assets.noProject')}</option>
        {projects.map((project) => (
          <option key={project.projectId} value={project.projectId}>
            {project.displayName}
          </option>
        ))}
      </select>
    </label>
  );
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
  const [cutTimelineTarget, setCutTimelineTarget] =
    useState<HTMLDivElement | null>(null);
  const agentCapability = projection.domains.find(
    (candidate) => candidate.surface === 'agent',
  );
  const canvasCapability = projection.domains.find(
    (candidate) => candidate.surface === 'canvas',
  );
  const assetsCapability = projection.domains.find(
    (candidate) => candidate.surface === 'media-library',
  );
  const previewCapability = projection.domains.find(
    (candidate) => candidate.surface === 'preview',
  );
  const cutCapability = projection.domains.find(
    (candidate) => candidate.surface === 'cut',
  );
  const tab = projection.window.tabs.find(
    (candidate) => candidate.projectId === project.projectId,
  );
  if (!tab) {
    throw new Error(`Content Project '${project.projectId}' has no Window-owned View.`);
  }
  const workbench = projection.window.workbench;
  const activeMainView = workbench.main.views.find(
    (candidate) => candidate.viewId === workbench.main.activeViewId,
  );
  const sideMainView = workbench.main.views.find(
    (candidate) => candidate.viewId === workbench.main.sideViewId,
  );
  const agentMain =
    workbench.agent.presentation === 'main' && activeMainView?.kind !== 'preview';
  const agentDock = (
    <AgentWorkspaceSurface
      agentReady={agentCapability?.status === 'ready'}
      initialConversation={initialConversation}
      initialInput={initialInput}
      project={project}
      tab={tab}
    />
  );
  const resourceDock = (
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
    )
  );
  const leftDock = createProjectDock(
    workbench,
    'left',
    agentDock,
    resourceDock,
  );
  const rightDock = createProjectDock(
    workbench,
    'right',
    agentDock,
    resourceDock,
  );

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
      primarySidebarWidth={
        workbench.primarySidebar.visible ? workbench.primarySidebar.width : 64
      }
      primarySidebarResize={
        pending || !workbench.primarySidebar.visible
          ? undefined
          : {
              label: t('workspace.resizePrimarySidebar'),
              minSize: DESKTOP_WORKBENCH_LIMITS.primarySidebarWidth.min,
              maxSize: DESKTOP_WORKBENCH_LIMITS.primarySidebarWidth.max,
              onResizeEnd: (width) => {
                if (width === workbench.primarySidebar.width) return;
                actions.onUpdateWorkbench(resizePrimarySidebarWorkbench(workbench, width));
              },
            }
      }
      main={renderWorkbenchMainView({
        allowCutRuntime: true,
        agentMain,
        agentSurface: agentDock,
        canvasCapability,
        previewCapability,
        cutCapability,
        project,
        projection,
        timelineTarget: cutTimelineTarget ?? undefined,
        view: activeMainView,
      })}
      secondaryMain={
        sideMainView
          ? renderWorkbenchMainView({
              allowCutRuntime: false,
              agentMain: false,
              agentSurface: agentDock,
              canvasCapability,
              previewCapability,
              cutCapability,
              project,
              projection,
              timelineTarget: undefined,
              view: sideMainView,
            })
          : undefined
      }
      mainSplit={workbench.main.split}
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
        activeMainView?.kind === 'cut' && cutCapability?.status === 'ready' ? (
          <div
            className="desktop-cut-timeline-slot"
            data-testid="desktop-cut-timeline-slot"
            ref={setCutTimelineTarget}
          />
        ) : (
          <TimelinePlaceholder
            diagnostic={
              projection.domains.find((candidate) => candidate.surface === 'cut')
                ?.status === 'unavailable'
                ? 'desktop-domain-surface-unavailable'
                : 'desktop-cut-timeline-not-mounted'
            }
          />
        )
      }
      timelineVisible={workbench.timeline.visible && activeMainView?.kind === 'cut'}
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

function renderWorkbenchMainView({
  allowCutRuntime,
  agentMain,
  agentSurface,
  canvasCapability,
  previewCapability,
  cutCapability,
  project,
  projection,
  timelineTarget,
  view,
}: {
  readonly allowCutRuntime: boolean;
  readonly agentMain: boolean;
  readonly agentSurface: JSX.Element;
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
  if (agentMain) return agentSurface;
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

function ProjectSidebarControls({
  actions,
  compact,
  pending,
  project,
  projection,
}: {
  readonly actions: ShellActions;
  readonly compact: boolean;
  readonly pending: boolean;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const workbench = projection.window.workbench;
  return (
    <div
      className="home-navigation-footer project-layout-controls"
      aria-label={t('workspace.layoutControls')}
    >
      {compact ? null : <AttentionSummary projection={projection} />}
      <div className="project-layout-control-group">
        <WorkbenchDisplayMenu
          actions={actions}
          disabled={pending}
          project={project}
          projection={projection}
        />
        <WorkbenchIconButton
          disabled={pending}
          active={workbench.timeline.visible}
          icon={<GridIcon size={16} />}
          label={t('workspace.timeline')}
          onClick={() =>
            actions.onUpdateWorkbench({
              ...workbench,
              revision: workbench.revision + 1,
              timeline: {
                ...workbench.timeline,
                visible: !workbench.timeline.visible,
              },
            })
          }
        />
        <WorkbenchIconButton
          disabled={pending}
          icon={<SettingsIcon size={16} />}
          label={t('shell.settingsLabel')}
          onClick={actions.onOpenSettings}
        />
      </div>
    </div>
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

type WorkbenchDisplayMode =
  | 'chat-main-left'
  | 'chat-main-right'
  | 'chat-only'
  | 'main-only';

type WorkbenchMainComposition =
  | 'canvas'
  | 'timeline'
  | 'model'
  | 'canvas-timeline'
  | 'canvas-model';

function WorkbenchDisplayMenu({
  actions,
  disabled,
  project,
  projection,
}: {
  readonly actions: ShellActions;
  readonly disabled: boolean;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const workbench = projection.window.workbench;
  const mode = getWorkbenchDisplayMode(workbench);
  const composition = getWorkbenchMainComposition(workbench);
  const canvasReady = projection.domains.some(
    (domain) => domain.surface === 'canvas' && domain.status === 'ready',
  );
  const cutReady = projection.domains.some(
    (domain) => domain.surface === 'cut' && domain.status === 'ready',
  );
  const previewReady = projection.domains.some(
    (domain) => domain.surface === 'preview' && domain.status === 'ready',
  );
  const hasCreativeMain = workbench.main.views.some((view) => view.kind !== 'agent');
  const hasCutView =
    cutReady && workbench.main.views.some((view) => view.kind === 'cut');
  const hasModelView =
    previewReady && workbench.main.views.some(isModelPreviewView);
  const selectMode = (nextMode: WorkbenchDisplayMode): void => {
    actions.onUpdateWorkbench(
      applyWorkbenchDisplayMode(workbench, project, projection, nextMode),
    );
    setOpen(false);
  };
  const selectComposition = (nextComposition: WorkbenchMainComposition): void => {
    actions.onUpdateWorkbench(
      applyWorkbenchMainComposition(
        workbench,
        project,
        projection,
        nextComposition,
      ),
    );
    setOpen(false);
  };
  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className="project-layout-icon-button"
          disabled={disabled}
          aria-label={t('workspace.displayMode')}
          aria-expanded={open}
        >
          <RightPanelIcon size={16} />
        </button>
      }
    >
      <div
        className="project-display-menu"
        role="menu"
        aria-label={t('workspace.displayMode')}
      >
        <strong>{t('workspace.displayMode')}</strong>
        <DisplayMenuButton
          checked={mode === 'chat-main-left' || mode === 'chat-main-right'}
          disabled={!hasCreativeMain && !canvasReady}
          label={t('workspace.chatAndMain')}
          onClick={() =>
            selectMode(
              mode === 'chat-main-right' ? 'chat-main-right' : 'chat-main-left',
            )
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
          disabled={!hasCreativeMain && !canvasReady}
          label={t('workspace.mainOnly')}
          onClick={() => selectMode('main-only')}
        />
        <div className="project-display-menu__separator" />
        <strong>{t('workspace.mainPanel')}</strong>
        <DisplayMenuButton
          checked={composition === 'canvas'}
          disabled={!canvasReady}
          label={t('workspace.canvas')}
          onClick={() => selectComposition('canvas')}
        />
        <DisplayMenuButton
          checked={composition === 'timeline'}
          disabled={!hasCutView}
          label={t('workspace.timeline')}
          onClick={() => selectComposition('timeline')}
        />
        <DisplayMenuButton
          checked={composition === 'model'}
          disabled={!hasModelView}
          label={t('workspace.model')}
          onClick={() => selectComposition('model')}
        />
        <DisplayMenuButton
          checked={composition === 'canvas-timeline'}
          disabled={!canvasReady || !hasCutView}
          label={t('workspace.canvasAndTimeline')}
          onClick={() => selectComposition('canvas-timeline')}
        />
        <DisplayMenuButton
          checked={composition === 'canvas-model'}
          disabled={!canvasReady || !hasModelView}
          label={t('workspace.canvasAndModel')}
          onClick={() => selectComposition('canvas-model')}
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
  const { t } = useTranslation();
  const workbench = projection.window.workbench;
  const togglePrimarySidebar = (): void => {
    actions.onUpdateWorkbench({
      ...workbench,
      revision: workbench.revision + 1,
      primarySidebar: {
        ...workbench.primarySidebar,
        visible: !workbench.primarySidebar.visible,
      },
    });
  };
  return (
    <aside
      className={`home-navigation project-primary-sidebar ${
        compact ? 'home-navigation--compact project-primary-sidebar--compact' : ''
      }`}
    >
      <PrimarySidebarBrand
        compact={compact}
        disabled={pending}
        onToggle={togglePrimarySidebar}
        subtitle={project.displayName}
      />
      <nav
        className="home-primary-navigation"
        aria-label={t('workspace.primaryNavigation')}
      >
        <HomeNavigationButton
          active={false}
          label={t('home.overview')}
          icon={<PlusIcon size={17} />}
          onClick={() => actions.onHome('create')}
        />
        <HomeNavigationButton
          active={false}
          label={t('home.mediaLibrary')}
          icon={<SearchIcon size={17} />}
          onClick={() => actions.onHome('assets')}
        />
        <HomeNavigationButton
          active={false}
          label={t('home.plugins')}
          icon={<PackageIcon size={17} />}
          onClick={() => actions.onHome('plugins')}
        />
        <HomeNavigationButton
          active={false}
          label={t('home.allCreations')}
          icon={<FolderIcon size={17} />}
          onClick={() => actions.onHome('creations')}
        />
      </nav>
      {compact ? null : (
        <PrimaryRecentNavigation
          activeProjectId={project.projectId}
          onCloseTab={actions.onCloseTab}
          onOpenConversation={actions.onOpenConversation}
          onOpenRecent={actions.onOpenRecent}
          projection={projection}
        />
      )}
      <ProjectSidebarControls
        actions={actions}
        compact={compact}
        pending={pending}
        project={project}
        projection={projection}
      />
    </aside>
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
  const agentPresentation = workbench.agent.dockPresentation;
  const agentPosition =
    workbench.agent.presentation === 'dock' &&
    agentPresentation !== 'hidden'
      ? workbench.agent.dockPosition
      : undefined;
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
      width: workbench.agent.width,
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
      resourcePresentation === 'overlay' &&
      !isPreviewMainActive(workbench)
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
      const agentChanged =
        dock.owner === 'agent' && workbench.agent.width !== width;
      const resourcesChanged =
        dock.owner === 'resources' && workbench.resourceDock.width !== width;
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
    agent: owner === 'agent'
      ? {
          ...workbench.agent,
          width,
        }
      : workbench.agent,
    resourceDock: owner === 'resources'
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
    workbench.agent.presentation === 'dock' &&
    workbench.agent.dockPresentation !== 'hidden'
      ? workbench.agent.dockPosition
      : undefined;
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
  return workbench.main.views.some(
    (view) =>
      view.viewId === workbench.main.activeViewId &&
      view.kind === 'preview',
  );
}

export function activateWorkbenchMainView(
  workbench: DesktopWorkbenchLayoutProjection,
  view: DesktopWorkbenchLayoutProjection['main']['views'][number],
  views: ReadonlyArray<DesktopWorkbenchLayoutProjection['main']['views'][number]> =
    workbench.main.views,
): DesktopWorkbenchLayoutProjection {
  const preset =
    view.kind === 'agent'
      ? 'agent-focus'
      : view.kind === 'preview'
        ? 'preview-focus'
        : view.kind === 'cut'
          ? 'cut-focus'
          : 'canvas-focus';
  return {
    ...workbench,
    revision: workbench.revision + 1,
    preset,
    agent: {
      ...workbench.agent,
      presentation: view.kind === 'agent' ? 'main' : 'dock',
    },
    resourceDock: {
      ...workbench.resourceDock,
      presentation:
        view.kind !== 'preview' && workbench.resourceDock.presentation === 'overlay'
          ? 'docked'
          : workbench.resourceDock.presentation,
    },
    main: {
      views,
      activeViewId: view.viewId,
      split: 'none',
    },
    timeline: {
      ...workbench.timeline,
      visible: view.kind === 'cut',
    },
  };
}

function getWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
): WorkbenchDisplayMode {
  if (workbench.agent.presentation === 'main') return 'chat-only';
  if (workbench.agent.dockPresentation === 'hidden') return 'main-only';
  return workbench.agent.dockPosition === 'left'
    ? 'chat-main-left'
    : 'chat-main-right';
}

export function applyWorkbenchDisplayMode(
  workbench: DesktopWorkbenchLayoutProjection,
  project: DesktopProjectCatalogItem,
  projection: DesktopShellProjection,
  mode: WorkbenchDisplayMode,
): DesktopWorkbenchLayoutProjection {
  if (mode === 'chat-only') {
    return createAgentMainWorkbench(workbench, project, projection);
  }
  const mainWorkbench = ensureCreativeMainWorkbench(workbench, project, projection);
  if (mode === 'main-only') {
    return {
      ...mainWorkbench,
      agent: {
        ...mainWorkbench.agent,
        presentation: 'dock',
        dockPresentation: 'hidden',
      },
    };
  }
  const agentPosition = mode === 'chat-main-left' ? 'left' : 'right';
  return {
    ...mainWorkbench,
    agent: {
      ...mainWorkbench.agent,
      presentation: 'dock',
      dockPresentation: 'docked',
      dockPosition: agentPosition,
    },
    resourceDock:
      mainWorkbench.resourceDock.presentation === 'hidden'
        ? mainWorkbench.resourceDock
        : {
            ...mainWorkbench.resourceDock,
            position: oppositeDockPosition(agentPosition),
          },
  };
}

function ensureCreativeMainWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  project: DesktopProjectCatalogItem,
  projection: DesktopShellProjection,
): DesktopWorkbenchLayoutProjection {
  const activeView = workbench.main.views.find(
    (view) => view.viewId === workbench.main.activeViewId,
  );
  if (activeView && activeView.kind !== 'agent') {
    return {
      ...workbench,
      revision: workbench.revision + 1,
    };
  }
  return createCanvasMainWorkbench(workbench, project, projection);
}

function getWorkbenchMainComposition(
  workbench: DesktopWorkbenchLayoutProjection,
): WorkbenchMainComposition | undefined {
  const activeView = workbench.main.views.find(
    (view) => view.viewId === workbench.main.activeViewId,
  );
  const sideView = workbench.main.views.find(
    (view) => view.viewId === workbench.main.sideViewId,
  );
  if (
    activeView?.kind === 'cut' &&
    sideView?.kind === 'canvas' &&
    workbench.timeline.visible
  ) {
    return 'canvas-timeline';
  }
  if (
    activeView?.kind === 'canvas' &&
    sideView !== undefined &&
    isModelPreviewView(sideView)
  ) {
    return 'canvas-model';
  }
  if (activeView?.kind === 'cut' && workbench.timeline.visible) return 'timeline';
  if (activeView?.kind === 'canvas') return 'canvas';
  if (activeView !== undefined && isModelPreviewView(activeView)) return 'model';
  return undefined;
}

export function applyWorkbenchMainComposition(
  workbench: DesktopWorkbenchLayoutProjection,
  project: DesktopProjectCatalogItem,
  projection: DesktopShellProjection,
  composition: WorkbenchMainComposition,
): DesktopWorkbenchLayoutProjection {
  const agent = {
    ...workbench.agent,
    presentation: 'dock' as const,
    dockPresentation:
      workbench.agent.presentation === 'main'
        ? ('docked' as const)
        : workbench.agent.dockPresentation,
  };
  if (composition === 'canvas') {
    const canvasWorkbench = createCanvasMainWorkbench(workbench, project, projection);
    return {
      ...canvasWorkbench,
      agent,
      timeline: {
        ...canvasWorkbench.timeline,
        visible: false,
      },
    };
  }

  const requiredView = findRequiredCompositionView(workbench, composition);
  if (composition === 'timeline') {
    return {
      ...workbench,
      revision: workbench.revision + 1,
      preset: 'cut-focus',
      agent,
      main: {
        views: workbench.main.views,
        activeViewId: requiredView.viewId,
        split: 'none',
      },
      timeline: {
        ...workbench.timeline,
        visible: true,
      },
    };
  }
  if (composition === 'model') {
    return {
      ...workbench,
      revision: workbench.revision + 1,
      preset: 'preview-focus',
      agent,
      main: {
        views: workbench.main.views,
        activeViewId: requiredView.viewId,
        split: 'none',
      },
      timeline: {
        ...workbench.timeline,
        visible: false,
      },
    };
  }

  const canvasWorkbench = createCanvasMainWorkbench(workbench, project, projection);
  const canvasView = findLastWorkbenchView(canvasWorkbench, 'canvas');
  if (!canvasView) {
    throw new Error('Desktop Main composition requires an open Canvas View.');
  }
  if (composition === 'canvas-timeline') {
    return {
      ...canvasWorkbench,
      preset: 'canvas-cut',
      agent,
      main: {
        ...canvasWorkbench.main,
        activeViewId: requiredView.viewId,
        sideViewId: canvasView.viewId,
        split: 'horizontal',
      },
      timeline: {
        ...canvasWorkbench.timeline,
        visible: true,
      },
    };
  }
  return {
    ...canvasWorkbench,
    preset: 'canvas-preview',
    agent,
    main: {
      ...canvasWorkbench.main,
      activeViewId: canvasView.viewId,
      sideViewId: requiredView.viewId,
      split: 'horizontal',
    },
    timeline: {
      ...canvasWorkbench.timeline,
      visible: false,
    },
  };
}

function findRequiredCompositionView(
  workbench: DesktopWorkbenchLayoutProjection,
  composition: Exclude<WorkbenchMainComposition, 'canvas'>,
): DesktopWorkbenchLayoutProjection['main']['views'][number] {
  const view =
    composition === 'timeline' || composition === 'canvas-timeline'
      ? findLastWorkbenchView(workbench, 'cut')
      : findLastModelPreviewView(workbench);
  if (!view) {
    throw new Error(
      `Desktop Main composition '${composition}' requires an open owning View.`,
    );
  }
  return view;
}

function findLastWorkbenchView(
  workbench: DesktopWorkbenchLayoutProjection,
  kind: DesktopWorkbenchLayoutProjection['main']['views'][number]['kind'],
): DesktopWorkbenchLayoutProjection['main']['views'][number] | undefined {
  for (let index = workbench.main.views.length - 1; index >= 0; index -= 1) {
    const view = workbench.main.views[index];
    if (view?.kind === kind) return view;
  }
  return undefined;
}

function findLastModelPreviewView(
  workbench: DesktopWorkbenchLayoutProjection,
): DesktopWorkbenchLayoutProjection['main']['views'][number] | undefined {
  for (let index = workbench.main.views.length - 1; index >= 0; index -= 1) {
    const view = workbench.main.views[index];
    if (view !== undefined && isModelPreviewView(view)) return view;
  }
  return undefined;
}

function isModelPreviewView(
  view: DesktopWorkbenchLayoutProjection['main']['views'][number],
): boolean {
  return view.kind === 'preview' && view.previewContentKind === 'model';
}

function createCanvasMainWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  project: DesktopProjectCatalogItem,
  projection: DesktopShellProjection,
): DesktopWorkbenchLayoutProjection {
  const tab = requireProjectTab(projection, project.projectId);
  const canvasView = {
    viewId: `canvas:${tab.viewId}`,
    viewEpoch: tab.viewEpoch,
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    kind: 'canvas' as const,
    ownerId: `canvas:${project.projectId}`,
    documentId: DESKTOP_DEFAULT_CANVAS_DOCUMENT_ID,
  };
  const views = upsertOpenWorkbenchView(workbench.main.views, canvasView);
  return {
    ...workbench,
    revision: workbench.revision + 1,
    preset: 'canvas-agent',
    agent: {
      ...workbench.agent,
      presentation: 'dock',
      dockPresentation: 'docked',
    },
    main: {
      views,
      activeViewId: canvasView.viewId,
      split: 'none',
    },
  };
}

function createAgentMainWorkbench(
  workbench: DesktopWorkbenchLayoutProjection,
  project: DesktopProjectCatalogItem,
  projection: DesktopShellProjection,
): DesktopWorkbenchLayoutProjection {
  const tab = requireProjectTab(projection, project.projectId);
  const agentView = {
    viewId: tab.viewId,
    viewEpoch: tab.viewEpoch,
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    kind: 'agent' as const,
    ownerId: tab.viewId,
  };
  return {
    ...workbench,
    revision: workbench.revision + 1,
    preset: 'agent-focus',
    agent: {
      ...workbench.agent,
      presentation: 'main',
      dockPresentation: 'hidden',
    },
    main: {
      views: upsertOpenWorkbenchView(workbench.main.views, agentView),
      activeViewId: agentView.viewId,
      split: 'none',
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
      documentId,
    } satisfies DesktopWorkbenchLayoutProjection['main']['views'][number]);
  const views = upsertOpenWorkbenchView(workbench.main.views, canvasView);
  if (presentation === 'side') {
    const active = views.find((view) => view.viewId === workbench.main.activeViewId);
    if (!active || active.kind !== 'canvas' || active.viewId === canvasView.viewId) {
      throw new Error(
        'Opening a Canvas to the side requires a different active Canvas View.',
      );
    }
    return {
      ...workbench,
      revision: workbench.revision + 1,
      preset: 'canvas-preview',
      agent: {
        ...workbench.agent,
        presentation: 'dock',
      },
      main: {
        views,
        activeViewId: active.viewId,
        sideViewId: canvasView.viewId,
        split: 'horizontal',
      },
    };
  }
  return {
    ...workbench,
    revision: workbench.revision + 1,
    preset: 'canvas-focus',
    agent: {
      ...workbench.agent,
      presentation: 'dock',
    },
    main: {
      views,
      activeViewId: canvasView.viewId,
      split: 'none',
    },
  };
}

function upsertOpenWorkbenchView(
  views: DesktopWorkbenchLayoutProjection['main']['views'],
  next: DesktopWorkbenchLayoutProjection['main']['views'][number],
): readonly DesktopWorkbenchLayoutProjection['main']['views'][number][] {
  return [...views.filter((view) => view.viewId !== next.viewId), next].slice(-8);
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

function ResourceDockUnavailable({
  diagnostic,
}: {
  readonly diagnostic: string;
}): JSX.Element {
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
        <span role="tab" aria-selected="true">{t('workspace.files')}</span>
        <span role="tab" aria-selected="false">{t('workspace.media')}</span>
        <span role="tab" aria-selected="false">{t('workspace.entities')}</span>
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

function TimelinePlaceholder({
  diagnostic,
}: {
  readonly diagnostic: string;
}): JSX.Element {
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

function AgentConversationSummaryList({
  limit = true,
  projection,
  onOpenConversation,
}: {
  readonly limit?: boolean;
  readonly projection: DesktopShellProjection;
  readonly onOpenConversation: (conversation: DesktopAgentHomeConversationSummary) => void;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const conversations = limit
    ? projection.agentHome.conversations.slice(0, 5)
    : projection.agentHome.conversations;
  return (
    <section className="project-section" aria-labelledby="agent-conversations-title">
      <div className="section-heading">
        <h2 id="agent-conversations-title">{t('home.recentConversations')}</h2>
        <span>{projection.agentHome.conversations.length}</span>
      </div>
      {conversations.length > 0 ? (
        <div className="recent-projects">
          {conversations.map((conversation) => (
            <button
              type="button"
              className="recent-project-row"
              key={`${conversation.navigation.workspaceId}:${conversation.navigation.conversationId}`}
              onClick={() => onOpenConversation(conversation)}
            >
              <StorylineIcon size={17} />
              <span className="recent-project-name">{conversation.title}</span>
              <span className="recent-project-kind">
                {formatAttention(conversation.attention, t)}
              </span>
              <span className="recent-project-date">
                {formatProjectDate(conversation.updatedAt, locale)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptySummary
          icon={<StorylineIcon size={22} />}
          label={t('home.noConversations')}
        />
      )}
    </section>
  );
}

function EmptySummary({
  icon,
  label,
}: {
  readonly icon: JSX.Element;
  readonly label: string;
}): JSX.Element {
  return (
    <div className="empty-projects">
      {icon}
      <p>{label}</p>
    </div>
  );
}

function PrimarySidebarBrand({
  compact,
  disabled = false,
  onToggle,
  subtitle,
}: {
  readonly compact: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
  readonly subtitle?: string;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="home-brand">
      <span className="brand-mark" aria-hidden="true">N</span>
      {compact ? null : subtitle ? (
        <span className="project-primary-brand-copy">
          <strong>{t('app.name')}</strong>
          <small>{subtitle}</small>
        </span>
      ) : (
        <strong>{t('app.name')}</strong>
      )}
      <IconButton
        disabled={disabled}
        label={
          compact
            ? t('workspace.expandSidebar')
            : t('workspace.collapseSidebar')
        }
        icon={<RightPanelIcon size={16} />}
        onClick={onToggle}
      />
    </div>
  );
}

function HomeNavigationButton({
  active,
  disabled = false,
  label,
  icon,
  onClick,
}: {
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly icon: JSX.Element;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`home-nav-button ${active ? 'is-active' : ''}`}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PrimaryRecentNavigation({
  activeProjectId,
  onCloseTab,
  onOpenConversation,
  onOpenRecent,
  projection,
}: {
  readonly activeProjectId?: string;
  readonly onCloseTab?: (tabId: string) => void;
  readonly onOpenConversation: (
    conversation: DesktopAgentHomeConversationSummary,
  ) => void;
  readonly onOpenRecent: (projectId: string) => void;
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
        const tab = projection.window.tabs.find(
          (candidate) => candidate.projectId === project.projectId,
        );
        return (
          <div
            className="primary-recent-project-row"
            data-active={project.projectId === activeProjectId ? 'true' : 'false'}
            key={project.projectId}
          >
            <button
              type="button"
              className="home-project-link"
              onClick={() => onOpenRecent(project.projectId)}
            >
              <FolderIcon size={15} />
              <span>{project.displayName}</span>
            </button>
            {tab && onCloseTab ? (
              <IconButton
                size="xs"
                label={t('shell.closeProjectTab')}
                icon={<span aria-hidden="true">×</span>}
                onClick={() => onCloseTab(tab.tabId)}
              />
            ) : null}
          </div>
        );
      })}
      <div className="home-sidebar-heading home-sidebar-conversation-heading">
        <span>{t('home.recentConversations')}</span>
        <span>{projection.agentHome.conversations.length}</span>
      </div>
      {projection.agentHome.conversations.slice(0, 8).map((conversation) => (
        <button
          type="button"
          className="home-project-link home-conversation-link"
          key={`${conversation.navigation.workspaceId}:${conversation.navigation.conversationId}`}
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
      <div
        className="attention-summary"
        aria-label={t('shell.attentionItems', { count: total })}
      >
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
  return value.replace(/-([a-z])/g, (_match, character: string) =>
    character.toUpperCase(),
  );
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
      <span className="brand-mark" aria-hidden="true">N</span>
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
  const tab = projection.window.tabs.find(
    (candidate) => candidate.tabId === activeTarget.tabId,
  );
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
