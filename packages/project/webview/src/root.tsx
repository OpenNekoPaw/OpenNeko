import {
  CubeIcon,
  FolderIcon,
  GridIcon,
  LoadingIcon,
  MoreHorizontalIcon,
  OpenIcon,
  PackageIcon,
  RemoveIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { EmptyState, Popover } from '@neko/ui/primitives';
import type {
  OpenNekoDesktopProjectAuthoringBridge,
  ProjectAuthoringNavigationBinding,
  ProjectCatalogItem,
  ProjectContentGroup,
  ProjectContentProjection,
} from '@neko/project-domain/contracts';
import { useEffect, useMemo, useState } from 'react';

export * from './authoring-workbench';
export * from './project-workspace';

export type ProjectCatalogSort =
  'updated-descending' | 'updated-ascending' | 'name-ascending' | 'name-descending';

export interface ProjectContentRootProps {
  readonly binding: ProjectAuthoringNavigationBinding;
  readonly chrome?: 'standalone' | 'embedded';
  readonly host: OpenNekoDesktopProjectAuthoringBridge['projectAuthoring'];
  readonly initialProjection?: ProjectContentProjection;
  readonly onOpenCharacter?: (characterProjectId: string, label: string) => void;
  readonly onOpenWorld?: (worldProjectId: string, label: string) => void;
  readonly windowId: string;
}

export function ProjectContentRoot({
  binding,
  chrome = 'standalone',
  host,
  initialProjection,
  onOpenCharacter,
  onOpenWorld,
  windowId,
}: ProjectContentRootProps): JSX.Element {
  const { t } = useTranslation();
  const loadFailedLabel = t('projectContent.loadFailed');
  const { workspaceId, workspaceGrantId, projectId } = binding;
  const [state, setState] = useState<
    | { readonly status: 'loading'; readonly projectId: string }
    | {
        readonly status: 'ready';
        readonly projectId: string;
        readonly projection: ProjectContentProjection;
      }
    | { readonly status: 'failed'; readonly projectId: string; readonly message: string }
  >(
    initialProjection?.projectId === projectId
      ? { status: 'ready', projectId, projection: initialProjection }
      : { status: 'loading', projectId },
  );

  useEffect(() => {
    if (initialProjection?.projectId === projectId) {
      setState({ status: 'ready', projectId, projection: initialProjection });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', projectId });
    void host.getContent(windowId, { workspaceId, workspaceGrantId, projectId }).then(
      (result) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', projectId, projection: result.projection });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'failed',
            projectId,
            message: describeProjectAuthoringError(error, loadFailedLabel),
          });
        }
      },
    );
    return () => controller.abort();
  }, [
    projectId,
    host,
    initialProjection,
    loadFailedLabel,
    windowId,
    workspaceGrantId,
    workspaceId,
  ]);

  const visibleState = state.projectId === projectId ? state : undefined;
  if (!visibleState || visibleState.status === 'loading') {
    return (
      <section className="project-content-root is-loading" aria-label={t('projectContent.title')}>
        <LoadingIcon size={20} />
        <span>{t('projectContent.loading')}</span>
      </section>
    );
  }
  if (visibleState.status === 'failed') {
    return (
      <section className="project-content-root" aria-label={t('projectContent.title')}>
        <EmptyState
          fill
          icon={<WarningIcon size={24} />}
          title={t('projectContent.unavailable')}
          description={visibleState.message}
        />
      </section>
    );
  }
  const projection = visibleState.projection;
  return (
    <section className={`project-content-root is-${chrome}`} aria-label={t('projectContent.title')}>
      {chrome === 'standalone' ? (
        <header className="project-content-header">
          <h2>{t('projectContent.title')}</h2>
        </header>
      ) : null}
      <div className="project-content-groups">
        <ProjectContentGroupSection
          group="characters"
          icon={<UsersIcon size={17} />}
          items={projection.characters.map((item) => ({
            identity: `character:${item.characterProjectId}`,
            label: item.label ?? item.characterProjectId,
            metadata: item.characterProjectId,
            availability: item.availability,
            diagnostic: item.diagnostic,
            ...(onOpenCharacter && item.availability === 'available'
              ? {
                  activate: () =>
                    onOpenCharacter(item.characterProjectId, item.label ?? item.characterProjectId),
                }
              : {}),
          }))}
          projection={projection}
        />
        <ProjectContentGroupSection
          group="worlds"
          icon={<FolderIcon size={17} />}
          items={projection.worlds.map((item) => ({
            identity: `world:${item.worldProjectId}`,
            label: item.label ?? item.worldProjectId,
            metadata: item.worldProjectId,
            availability: item.availability,
            diagnostic: item.diagnostic,
            ...(onOpenWorld && item.availability === 'available'
              ? {
                  activate: () =>
                    onOpenWorld(item.worldProjectId, item.label ?? item.worldProjectId),
                }
              : {}),
          }))}
          projection={projection}
        />
        <ProjectContentGroupSection
          group="elements"
          icon={<CubeIcon size={17} />}
          items={projection.elements.map((item) => ({
            identity: `project-entity:${item.entityId}`,
            label: item.label,
            metadata: t(`projectContent.kinds.${item.entityKind}`),
            availability: item.availability,
            diagnostic: item.diagnostic,
          }))}
          projection={projection}
        />
        <ProjectContentGroupSection
          group="candidates"
          icon={<UserIcon size={17} />}
          items={projection.candidates.map((item) => ({
            identity: `entity-candidate:${item.candidateId}`,
            label: item.label,
            metadata: `${t(`projectContent.kinds.${item.entityKind}`)} · ${t(`projectContent.freshness.${item.freshness}`)}`,
            availability: 'available',
          }))}
          projection={projection}
        />
      </div>
    </section>
  );
}

function describeProjectAuthoringError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (!message.startsWith("Error invoking remote method '")) return message;
  const boundary = message.indexOf("':");
  if (boundary < 0) return message;
  const detail = message.slice(boundary + 2).trimStart();
  return detail.startsWith('Error:') ? detail.slice('Error:'.length).trimStart() : detail;
}

function ProjectContentGroupSection({
  group,
  icon,
  items,
  projection,
}: {
  readonly group: ProjectContentGroup;
  readonly icon: JSX.Element;
  readonly items: readonly {
    readonly identity: string;
    readonly label: string;
    readonly metadata: string;
    readonly availability: string;
    readonly diagnostic?: string;
    readonly activate?: () => void;
  }[];
  readonly projection: ProjectContentProjection;
}): JSX.Element {
  const { t } = useTranslation();
  const diagnostics = projection.diagnostics.filter((item) => item.group === group);
  return (
    <section className="project-content-group" data-project-content-group={group}>
      <header>
        {icon}
        <h3>{t(`projectContent.groups.${group}`)}</h3>
        <span>{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="project-content-empty">{t(`projectContent.empty.${group}`)}</p>
      ) : (
        <div className="project-content-list">
          {items.map((item) => (
            <ProjectContentRow icon={icon} item={item} key={item.identity} />
          ))}
        </div>
      )}
      {diagnostics.map((diagnostic, index) => (
        <p
          className="project-content-diagnostic"
          key={`${diagnostic.recordId ?? group}:${index}`}
          role="status"
        >
          <WarningIcon size={14} />
          <span>{diagnostic.message}</span>
        </p>
      ))}
    </section>
  );
}

function ProjectContentRow({
  icon,
  item,
}: {
  readonly icon: JSX.Element;
  readonly item: {
    readonly identity: string;
    readonly label: string;
    readonly metadata: string;
    readonly availability: string;
    readonly diagnostic?: string;
    readonly activate?: () => void;
  };
}): JSX.Element {
  const { t } = useTranslation();
  const content = (
    <>
      <span className="project-content-row-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="project-content-row-copy">
        <strong>{item.label}</strong>
        <small>{item.metadata}</small>
      </span>
      {item.availability !== 'available' ? (
        <span className="project-content-status">
          {item.availability === 'needs-attention'
            ? t('projectContent.availability.needs-attention')
            : t('projectContent.availability.inactive')}
        </span>
      ) : null}
      {item.diagnostic ? (
        <span className="project-content-row-diagnostic" role="status">
          {item.diagnostic}
        </span>
      ) : null}
    </>
  );
  return item.activate ? (
    <button
      className="project-content-row is-actionable"
      data-availability={item.availability}
      data-owner-identity={item.identity}
      onClick={item.activate}
      type="button"
    >
      {content}
    </button>
  ) : (
    <div
      className="project-content-row"
      data-availability={item.availability}
      data-owner-identity={item.identity}
    >
      {content}
    </div>
  );
}

export type ProjectCatalogTemplateId = 'storyboard' | 'video-plan';

export interface ProjectCatalogRootProps {
  readonly associatedConversationCounts: Readonly<Record<string, number>>;
  readonly interactive: boolean;
  readonly projects: readonly ProjectCatalogItem[];
  readonly onOpenDirectory: () => void;
  readonly onOpen: (projectId: string) => void;
  readonly onStartFromTemplate: (template: ProjectCatalogTemplateId) => void;
  readonly onArchiveAssociatedConversations: (projects: readonly ProjectCatalogItem[]) => void;
  readonly onRemove: (projects: readonly ProjectCatalogItem[]) => void;
}

export function ProjectCatalogRoot({
  associatedConversationCounts,
  interactive,
  onArchiveAssociatedConversations,
  onOpenDirectory,
  onOpen,
  onRemove,
  onStartFromTemplate,
  projects,
}: ProjectCatalogRootProps): JSX.Element {
  const { locale, t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectCatalogSort>('updated-descending');
  const visible = useMemo(
    () => filterAndSortProjectCatalog(projects, query, sort),
    [projects, query, sort],
  );
  return (
    <section
      aria-label={t('home.allProjects')}
      className="project-management-catalog"
      data-project-catalog-root
    >
      <div className="project-management-catalog__content">
        <header className="project-catalog-hero">
          <div className="project-catalog-hero__copy">
            <h1>{t('home.allProjects')}</h1>
            <p>{t('home.projects.description')}</p>
            <button type="button" disabled={!interactive} onClick={onOpenDirectory}>
              <FolderIcon size={15} />
              <span>{t('home.projects.openExisting')}</span>
            </button>
          </div>
          <div className="project-catalog-hero__visual" aria-hidden="true">
            <span className="project-catalog-hero__connector" />
            <span className="project-catalog-hero__tile is-folder">
              <FolderIcon size={25} />
            </span>
            <span className="project-catalog-hero__tile is-team">
              <UsersIcon size={23} />
            </span>
            <span className="project-catalog-hero__tile is-content">
              <GridIcon size={21} />
            </span>
          </div>
        </header>
        <section className="project-catalog-collection" aria-labelledby="my-projects-heading">
          <header className="project-catalog-collection__header">
            <div className="project-catalog-collection__title">
              <h2 id="my-projects-heading">{t('home.projects.mine')}</h2>
              <span aria-label={t('home.projects.count', { count: visible.length })}>
                {visible.length}
              </span>
            </div>
            <div className="project-catalog-controls">
              <label className="management-search-field">
                <SearchIcon size={16} />
                <input
                  aria-label={t('home.projects.search')}
                  placeholder={t('home.projects.search')}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <select
                aria-label={t('home.projects.sort')}
                value={sort}
                onChange={(event) => setSort(parseProjectCatalogSort(event.currentTarget.value))}
              >
                <option value="updated-descending">{t('home.sort.newest')}</option>
                <option value="updated-ascending">{t('home.sort.oldest')}</option>
                <option value="name-ascending">{t('home.sort.nameAscending')}</option>
                <option value="name-descending">{t('home.sort.nameDescending')}</option>
              </select>
            </div>
          </header>
          <div
            aria-label={t('home.allProjects')}
            className="management-surface-list is-grid"
            data-empty={visible.length === 0}
            role="region"
            tabIndex={0}
          >
            {visible.length === 0 ? (
              <EmptyState
                fill
                icon={<FolderIcon size={24} />}
                title={t('home.projects.noResults')}
              />
            ) : null}
            {visible.map((project) => (
              <ProjectCatalogCard
                associatedConversationCount={associatedConversationCounts[project.projectId] ?? 0}
                interactive={interactive}
                key={project.projectId}
                locale={locale}
                onArchiveAssociatedConversations={onArchiveAssociatedConversations}
                onOpen={onOpen}
                onRemove={onRemove}
                project={project}
              />
            ))}
          </div>
        </section>
        <section
          className="project-template-quick-starts"
          aria-labelledby="project-templates-heading"
        >
          <h2 id="project-templates-heading">{t('home.projects.fromTemplates')}</h2>
          <div className="project-template-grid">
            {(
              [
                {
                  id: 'storyboard',
                  icon: <GridIcon size={26} />,
                  title: t('home.start.template.storyboard.title'),
                  description: t('home.start.template.storyboard.description'),
                },
                {
                  id: 'video-plan',
                  icon: <OpenIcon size={26} />,
                  title: t('home.start.template.video.title'),
                  description: t('home.start.template.video.description'),
                },
              ] as const
            ).map((template) => (
              <button
                type="button"
                className="project-template-card"
                data-project-template-id={template.id}
                disabled={!interactive}
                key={template.id}
                onClick={() => onStartFromTemplate(template.id)}
              >
                <span className="project-template-card__preview" aria-hidden="true">
                  <span className="project-template-card__preview-pattern">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="project-template-card__preview-icon">{template.icon}</span>
                </span>
                <span className="project-template-card__body">
                  <span className="project-template-card__copy">
                    <strong>{template.title}</strong>
                    <small>{template.description}</small>
                  </span>
                  <span className="project-template-card__action">
                    {t('home.projects.startFromTemplate')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ProjectCatalogCard({
  associatedConversationCount,
  interactive,
  locale,
  onArchiveAssociatedConversations,
  onOpen,
  onRemove,
  project,
}: {
  readonly associatedConversationCount: number;
  readonly interactive: boolean;
  readonly locale: string;
  readonly onArchiveAssociatedConversations: (projects: readonly ProjectCatalogItem[]) => void;
  readonly onOpen: (projectId: string) => void;
  readonly onRemove: (projects: readonly ProjectCatalogItem[]) => void;
  readonly project: ProjectCatalogItem;
}): JSX.Element {
  const { t } = useTranslation();
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <div
      className="management-surface-row"
      data-project-id={project.projectId}
      data-workspace-open-disabled={project.unavailable !== undefined}
    >
      <button
        type="button"
        className="management-surface-row__open"
        disabled={!interactive || project.unavailable !== undefined}
        onClick={() => onOpen(project.projectId)}
      >
        <span className="management-surface-project-icon">
          <FolderIcon size={18} />
        </span>
        <span className="management-surface-copy">
          <strong>{project.displayName}</strong>
          <small>{formatProjectDate(project.updatedAt, locale)}</small>
          {project.unavailable ? (
            <small className="management-surface-row__diagnostic" role="status">
              <WarningIcon size={13} />
              <span>{project.unavailable.message}</span>
            </small>
          ) : null}
        </span>
      </button>
      <Popover
        align="end"
        contentClassName="project-catalog-card-menu"
        onOpenChange={setActionsOpen}
        open={actionsOpen}
        trigger={
          <button
            type="button"
            className="project-catalog-card__more"
            aria-label={t('home.projects.moreActions', {
              project: project.displayName,
            })}
            disabled={!interactive}
          >
            <MoreHorizontalIcon size={17} />
          </button>
        }
      >
        <div
          aria-label={t('home.projects.moreActions', { project: project.displayName })}
          className="project-catalog-card-menu__items"
          role="menu"
        >
          <button
            type="button"
            disabled={!interactive || associatedConversationCount === 0}
            onClick={() => {
              setActionsOpen(false);
              onArchiveAssociatedConversations([project]);
            }}
            role="menuitem"
          >
            <PackageIcon size={15} />
            <span>{t('home.projects.archiveConversations')}</span>
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={!interactive}
            onClick={() => {
              setActionsOpen(false);
              onRemove([project]);
            }}
            role="menuitem"
          >
            <RemoveIcon size={15} />
            <span>{t('home.projects.removeFromList')}</span>
          </button>
        </div>
      </Popover>
    </div>
  );
}

export function filterAndSortProjectCatalog(
  projects: readonly ProjectCatalogItem[],
  query: string,
  sort: ProjectCatalogSort,
): readonly ProjectCatalogItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  return [...projects]
    .filter((project) => project.displayName.toLocaleLowerCase().includes(normalized))
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

export function parseProjectCatalogSort(value: string): ProjectCatalogSort {
  if (
    value === 'updated-descending' ||
    value === 'updated-ascending' ||
    value === 'name-ascending' ||
    value === 'name-descending'
  ) {
    return value;
  }
  throw new Error(`Unknown Project catalog sort option: ${value}`);
}

function formatProjectDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}
