import {
  Button,
  CloseIcon,
  FolderIcon,
  IconButton,
  InfoIcon,
  LayersIcon,
  PlusIcon,
  RightPanelIcon,
  ScissorsIcon,
  SearchIcon,
  SettingsIcon,
  StorylineIcon,
  Tooltip,
  TooltipProvider,
  WarningIcon,
} from '@neko/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DesktopDomainCapabilityProjection,
  DesktopProjectCatalogItem,
  DesktopShellProjection,
  DesktopUnavailableProjectProfile,
} from '../shared/shell-contract';

type ShellState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projection: DesktopShellProjection }
  | { readonly kind: 'error'; readonly message: string };

type HomeSection = 'overview' | 'activity' | 'library';

export function DesktopApplication(): JSX.Element {
  const [state, setState] = useState<ShellState>({ kind: 'loading' });
  const [homeSection, setHomeSection] = useState<HomeSection>('overview');
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
        setState({
          kind: 'error',
          message: 'Desktop Shell endpoint changed. Reloading the authoritative projection.',
        });
        void refresh().catch((error: unknown) => {
          if (active) setState({ kind: 'error', message: describeError(error) });
        });
        return;
      }
      const previousSequence = lastSequence.current;
      if (previousSequence !== null && event.sequence !== previousSequence + 1) {
        setState({
          kind: 'error',
          message: 'Desktop Shell projection sequence changed. Reloading the authoritative state.',
        });
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
  }, [refresh]);

  const runMutation = useCallback(
    async (operation: () => Promise<DesktopShellProjection>): Promise<void> => {
      setPending(true);
      setDiagnostic(undefined);
      try {
        const projection = await operation();
        if (endpointEpoch.current !== projection.endpointEpoch) {
          throw new Error('Desktop Shell command returned a stale endpoint projection.');
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
    [refresh],
  );

  if (state.kind === 'loading') {
    return <ShellStatus title="OpenNeko" message="Connecting to Desktop Shell..." />;
  }
  if (state.kind === 'error') {
    return <ShellStatus title="Desktop Shell unavailable" message={state.message} error />;
  }

  const projection = state.projection;
  const activeProject = resolveActiveProject(projection);

  return (
    <TooltipProvider>
      <div className="desktop-shell">
        <ShellTitlebar
          projection={projection}
          pending={pending}
          onHome={() =>
            void runMutation(() =>
              window.openNekoDesktop.tabs.activateHome(projection.window.revision),
            )
          }
          onOpenProject={() =>
            void runMutation(async () => {
              const result = await window.openNekoDesktop.projects.openContent();
              return result.projection;
            })
          }
          onActivateTab={(tabId) =>
            void runMutation(() =>
              window.openNekoDesktop.tabs.activate(tabId, projection.window.revision),
            )
          }
          onCloseTab={(tabId) =>
            void runMutation(() =>
              window.openNekoDesktop.tabs.close(tabId, projection.window.revision),
            )
          }
        />
        {diagnostic && (
          <div className="shell-diagnostic" role="alert">
            <WarningIcon size={15} />
            <span>{diagnostic}</span>
          </div>
        )}
        {activeProject ? (
          <ContentProjectWorkspace projection={projection} project={activeProject} />
        ) : (
          <HomeWorkspace
            projection={projection}
            section={homeSection}
            pending={pending}
            onSectionChange={setHomeSection}
            onOpenProject={() =>
              void runMutation(async () => {
                const result = await window.openNekoDesktop.projects.openContent();
                return result.projection;
              })
            }
            onOpenRecent={(projectId) => {
              const tab = projection.window.tabs.find(
                (candidate) => candidate.projectId === projectId,
              );
              if (tab) {
                void runMutation(() =>
                  window.openNekoDesktop.tabs.activate(
                    tab.tabId,
                    projection.window.revision,
                  ),
                );
                return;
              }
              setDiagnostic(
                'This project is not attached to the current Window. Re-open its workspace to continue.',
              );
            }}
            onRequestProfile={(profile) => {
              setPending(true);
              setDiagnostic(undefined);
              void window.openNekoDesktop.projects
                .requestProfile(profile)
                .then((result) => {
                  setState({ kind: 'ready', projection: result.projection });
                  setDiagnostic(result.diagnostic.message);
                })
                .catch((error: unknown) => {
                  setDiagnostic(describeError(error));
                })
                .finally(() => setPending(false));
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export function DesktopShellView({
  projection,
}: {
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const activeProject = resolveActiveProject(projection);
  return activeProject ? (
    <ContentProjectWorkspace projection={projection} project={activeProject} />
  ) : (
    <HomeWorkspace
      projection={projection}
      section="overview"
      pending={false}
      onSectionChange={() => undefined}
      onOpenProject={() => undefined}
      onOpenRecent={() => undefined}
      onRequestProfile={() => undefined}
    />
  );
}

function ShellTitlebar({
  projection,
  pending,
  onHome,
  onOpenProject,
  onActivateTab,
  onCloseTab,
}: {
  readonly projection: DesktopShellProjection;
  readonly pending: boolean;
  readonly onHome: () => void;
  readonly onOpenProject: () => void;
  readonly onActivateTab: (tabId: string) => void;
  readonly onCloseTab: (tabId: string) => void;
}): JSX.Element {
  return (
    <header className="shell-titlebar">
      <button
        type="button"
        className={`brand-tab ${projection.window.activeTarget.kind === 'home' ? 'is-active' : ''}`}
        onClick={onHome}
      >
        <span className="brand-mark" aria-hidden="true">
          N
        </span>
        <span>OpenNeko</span>
      </button>
      <nav className="project-tabs" aria-label="Open projects">
        {projection.window.tabs.map((tab) => {
          const project = projection.catalog.projects.find(
            (candidate) => candidate.projectId === tab.projectId,
          );
          const active =
            projection.window.activeTarget.kind === 'project' &&
            projection.window.activeTarget.tabId === tab.tabId;
          return (
            <div className={`project-tab ${active ? 'is-active' : ''}`} key={tab.tabId}>
              <button type="button" onClick={() => onActivateTab(tab.tabId)}>
                {project?.displayName ?? tab.projectId}
              </button>
              <Tooltip content="Close project tab">
                <IconButton
                  size="xs"
                  label="Close project tab"
                  icon={<CloseIcon size={13} />}
                  onClick={() => onCloseTab(tab.tabId)}
                />
              </Tooltip>
            </div>
          );
        })}
      </nav>
      <Tooltip content="Open content project">
        <IconButton
          className="open-project-button"
          disabled={pending}
          label="Open content project"
          icon={<PlusIcon size={16} />}
          onClick={onOpenProject}
        />
      </Tooltip>
      <div className="titlebar-spacer" />
      <AttentionSummary projection={projection} />
      <Tooltip content="Settings will be connected in P1.6">
        <IconButton
          disabled
          label="Settings unavailable"
          icon={<SettingsIcon size={16} />}
        />
      </Tooltip>
    </header>
  );
}

function HomeWorkspace({
  projection,
  section,
  pending,
  onSectionChange,
  onOpenProject,
  onOpenRecent,
  onRequestProfile,
}: {
  readonly projection: DesktopShellProjection;
  readonly section: HomeSection;
  readonly pending: boolean;
  readonly onSectionChange: (section: HomeSection) => void;
  readonly onOpenProject: () => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRequestProfile: (profile: DesktopUnavailableProjectProfile) => void;
}): JSX.Element {
  return (
    <div className="home-layout">
      <aside className="home-navigation">
        <p className="section-label">Home</p>
        <HomeNavigationButton
          active={section === 'overview'}
          label="Overview"
          icon={<LayersIcon size={16} />}
          onClick={() => onSectionChange('overview')}
        />
        <HomeNavigationButton
          active={section === 'activity'}
          label="Activity"
          icon={<StorylineIcon size={16} />}
          onClick={() => onSectionChange('activity')}
        />
        <HomeNavigationButton
          active={section === 'library'}
          label="Media Library"
          icon={<SearchIcon size={16} />}
          onClick={() => onSectionChange('library')}
        />
      </aside>
      <main className="home-main">
        {section === 'overview' ? (
          <>
            <div className="workspace-heading">
              <div>
                <p className="section-label">Workspace</p>
                <h1>Projects</h1>
              </div>
              <Button
                disabled={pending}
                leadingIcon={<FolderIcon size={16} />}
                onClick={onOpenProject}
              >
                Open project
              </Button>
            </div>
            <section className="project-section" aria-labelledby="recent-projects-title">
              <div className="section-heading">
                <h2 id="recent-projects-title">Recent content projects</h2>
                <span>{projection.catalog.projects.length}</span>
              </div>
              {projection.catalog.projects.length > 0 ? (
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
                      <span className="recent-project-kind">Content</span>
                      <span className="recent-project-date">
                        {formatProjectDate(project.updatedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-projects">
                  <FolderIcon size={22} />
                  <p>No content projects</p>
                </div>
              )}
            </section>
            <section className="project-section" aria-labelledby="project-profiles-title">
              <div className="section-heading">
                <h2 id="project-profiles-title">Project profiles</h2>
              </div>
              <div className="profile-list">
                <button type="button" onClick={onOpenProject} disabled={pending}>
                  <span className="profile-icon profile-icon--content">
                    <LayersIcon size={18} />
                  </span>
                  <span>
                    <strong>Content</strong>
                    <small>Available</small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRequestProfile('character')}
                  disabled={pending}
                >
                  <span className="profile-icon profile-icon--character">
                    <InfoIcon size={18} />
                  </span>
                  <span>
                    <strong>Character</strong>
                    <small>Unavailable</small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRequestProfile('world')}
                  disabled={pending}
                >
                  <span className="profile-icon profile-icon--world">
                    <StorylineIcon size={18} />
                  </span>
                  <span>
                    <strong>World</strong>
                    <small>Unavailable</small>
                  </span>
                </button>
              </div>
            </section>
          </>
        ) : (
          <UnavailableHomeSection section={section} projection={projection} />
        )}
      </main>
    </div>
  );
}

function ContentProjectWorkspace({
  projection,
  project,
}: {
  readonly projection: DesktopShellProjection;
  readonly project: DesktopProjectCatalogItem;
}): JSX.Element {
  const surfaceEntries: readonly {
    label: string;
    surface: DesktopDomainCapabilityProjection['surface'];
    icon: JSX.Element;
  }[] = [
    { label: 'Canvas', surface: 'canvas', icon: <LayersIcon size={16} /> },
    { label: 'Cut', surface: 'cut', icon: <ScissorsIcon size={16} /> },
    { label: 'Preview', surface: 'preview', icon: <RightPanelIcon size={16} /> },
  ];
  return (
    <div className="project-workspace">
      <aside className="project-navigation">
        <div className="project-identity">
          <span className="project-avatar">{project.displayName.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{project.displayName}</strong>
            <small>Content project</small>
          </span>
        </div>
        <p className="section-label">Surfaces</p>
        {surfaceEntries.map((entry) => {
          const capability = projection.domains.find(
            (candidate) => candidate.surface === entry.surface,
          );
          return (
            <button type="button" className="surface-entry" disabled key={entry.surface}>
              {entry.icon}
              <span>{entry.label}</span>
              <small>{capability?.ownerSlice ?? 'Unavailable'}</small>
            </button>
          );
        })}
      </aside>
      <main className="project-surface">
        <div className="surface-toolbar">
          <span>{project.displayName}</span>
          <span>Project shell</span>
        </div>
        <div className="surface-unavailable">
          <LayersIcon size={24} />
          <h1>Creative surface unavailable</h1>
          <p>Canvas and Media Library are owned by P1.4 and are not connected.</p>
          <code>desktop-domain-surface-unavailable</code>
        </div>
      </main>
      <aside className="context-dock">
        <div className="context-dock-heading">
          <RightPanelIcon size={16} />
          <strong>Context</strong>
        </div>
        <dl>
          <div>
            <dt>Profile</dt>
            <dd>Content</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd>{shortIdentity(project.workspaceId)}</dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>{shortIdentity(project.projectId)}</dd>
          </div>
          <div>
            <dt>Window revision</dt>
            <dd>{projection.window.revision}</dd>
          </div>
        </dl>
        <div className="context-diagnostic">
          <InfoIcon size={15} />
          <span>Agent context is unavailable until P1.3.</span>
        </div>
      </aside>
    </div>
  );
}

function UnavailableHomeSection({
  section,
  projection,
}: {
  readonly section: Exclude<HomeSection, 'overview'>;
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const capability = projection.domains.find((candidate) =>
    section === 'activity' ? candidate.surface === 'agent' : candidate.surface === 'media-library',
  );
  return (
    <div className="home-unavailable">
      {section === 'activity' ? <StorylineIcon size={24} /> : <SearchIcon size={24} />}
      <h1>{section === 'activity' ? 'Activity unavailable' : 'Media Library unavailable'}</h1>
      <p>
        {section === 'activity'
          ? 'Conversation and Activity projections are owned by P1.3.'
          : 'The Assets-owned Media Library root is owned by P1.4.'}
      </p>
      <code>{capability?.diagnosticCode ?? 'desktop-domain-surface-unavailable'}</code>
    </div>
  );
}

function HomeNavigationButton({
  active,
  label,
  icon,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: JSX.Element;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`home-nav-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function AttentionSummary({
  projection,
}: {
  readonly projection: DesktopShellProjection;
}): JSX.Element {
  const total =
    projection.attention.needsInput +
    projection.attention.needsReview +
    projection.attention.running;
  return (
    <Tooltip content="Activity attention">
      <div className="attention-summary" aria-label={`${total} attention items`}>
        <span className={total > 0 ? 'has-attention' : ''} />
        <span>{total}</span>
      </div>
    </Tooltip>
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

function shortIdentity(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 14)}...`;
}

function formatProjectDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
