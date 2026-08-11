import {
  FolderIcon,
  GridIcon,
  LayersIcon,
  RemoveIcon,
  SearchIcon,
  TrashIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { EmptyState } from '@neko/ui/primitives';
import type { ProjectCatalogItem } from '@neko/project/contracts';
import { useMemo, useState } from 'react';

export * from './authoring-workbench';

export type ProjectCatalogSort =
  'updated-descending' | 'updated-ascending' | 'name-ascending' | 'name-descending';

export interface ProjectCatalogRootProps {
  readonly associatedConversationCounts: Readonly<Record<string, number>>;
  readonly interactive: boolean;
  readonly projects: readonly ProjectCatalogItem[];
  readonly onOpenDirectory: () => void;
  readonly onOpen: (projectId: string) => void;
  readonly onDeleteAssociatedConversations: (projects: readonly ProjectCatalogItem[]) => void;
  readonly onRemove: (projects: readonly ProjectCatalogItem[]) => void;
}

export function ProjectCatalogRoot({
  associatedConversationCounts,
  interactive,
  onDeleteAssociatedConversations,
  onOpenDirectory,
  onOpen,
  onRemove,
  projects,
}: ProjectCatalogRootProps): JSX.Element {
  const { locale, t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectCatalogSort>('updated-descending');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const visible = useMemo(
    () => filterAndSortProjectCatalog(projects, query, sort),
    [projects, query, sort],
  );
  return (
    <section className="project-management-catalog" data-project-catalog-root>
      <header className="management-surface-header">
        <div>
          <p className="section-label">{t('home.projects.eyebrow')}</p>
          <h2>{t('home.allProjects')}</h2>
        </div>
        <div className="management-surface-actions">
          <button type="button" disabled={!interactive} onClick={onOpenDirectory}>
            <FolderIcon size={15} />
            <span>{t('home.projects.openDirectory')}</span>
          </button>
        </div>
      </header>
      <div className="management-surface-toolbar">
        <label className="management-search-field">
          <SearchIcon size={16} />
          <input
            aria-label={t('home.projects.search')}
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
        <button
          type="button"
          aria-label={t('home.projects.gridView')}
          aria-pressed={view === 'grid'}
          title={t('home.projects.gridView')}
          onClick={() => setView('grid')}
        >
          <GridIcon size={15} />
        </button>
        <button
          type="button"
          aria-label={t('home.projects.listView')}
          aria-pressed={view === 'list'}
          title={t('home.projects.listView')}
          onClick={() => setView('list')}
        >
          <LayersIcon size={15} />
        </button>
      </div>
      <div
        aria-label={t('home.allProjects')}
        className={`management-surface-list is-${view}`}
        data-empty={visible.length === 0}
        data-view-mode={view}
        role="region"
        tabIndex={0}
      >
        {visible.length === 0 ? (
          <EmptyState fill icon={<FolderIcon size={24} />} title={t('home.projects.noResults')} />
        ) : null}
        {visible.map((project) => (
          <div
            className="management-surface-row"
            data-project-id={project.projectId}
            data-workspace-open-disabled={project.unavailable !== undefined}
            key={project.projectId}
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
            <span className="management-surface-row-actions">
              <button
                type="button"
                aria-label={t('shell.deleteProjectConversations', {
                  project: project.displayName,
                })}
                disabled={
                  !interactive || (associatedConversationCounts[project.projectId] ?? 0) === 0
                }
                title={t('shell.deleteProjectConversations', { project: project.displayName })}
                onClick={() => onDeleteAssociatedConversations([project])}
              >
                <TrashIcon size={15} />
              </button>
              <button
                type="button"
                aria-label={t('shell.removeProject', { project: project.displayName })}
                disabled={!interactive}
                title={t('shell.removeProject', { project: project.displayName })}
                onClick={() => onRemove([project])}
              >
                <RemoveIcon size={15} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
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
