import {
  FolderIcon,
  GridIcon,
  LayersIcon,
  OpenIcon,
  SearchIcon,
  TrashIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { EmptyState } from '@neko/ui/primitives';
import { useMemo, useState } from 'react';
import type { DesktopProjectCatalogItem } from '@neko/host/desktop-shell-contract';

export type DesktopProjectManagementSort =
  'updated-descending' | 'updated-ascending' | 'name-ascending' | 'name-descending';

export function DesktopProjectCatalogSurface({
  interactive,
  onOpen,
  onRemove,
  onSelect,
  projects,
  selectedProjectId,
}: {
  readonly interactive: boolean;
  readonly onOpen: (projectId: string) => void;
  readonly onRemove: (project: DesktopProjectCatalogItem) => void;
  readonly onSelect: (projectId: string) => void;
  readonly projects: readonly DesktopProjectCatalogItem[];
  readonly selectedProjectId?: string;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DesktopProjectManagementSort>('updated-descending');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const visible = useMemo(
    () => filterAndSortProjectCatalog(projects, query, sort),
    [projects, query, sort],
  );
  return (
    <section className="project-management-catalog">
      <header className="management-surface-header">
        <div>
          <p className="section-label">{t('home.projects.eyebrow')}</p>
          <h2>{t('home.allProjects')}</h2>
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
          onChange={(event) => setSort(parseProjectManagementSort(event.currentTarget.value))}
        >
          <option value="updated-descending">{t('home.sort.newest')}</option>
          <option value="updated-ascending">{t('home.sort.oldest')}</option>
          <option value="name-ascending">{t('home.sort.nameAscending')}</option>
          <option value="name-descending">{t('home.sort.nameDescending')}</option>
        </select>
        <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
          <GridIcon size={15} />
        </button>
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
          <LayersIcon size={15} />
        </button>
      </div>
      <div
        aria-label={t('home.allProjects')}
        className={`management-surface-list is-${view}`}
        data-empty={visible.length === 0}
        onKeyDown={(event) => {
          if (event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          event.currentTarget.scrollTop =
            event.key === 'Home' ? 0 : event.currentTarget.scrollHeight;
        }}
        role="region"
        tabIndex={0}
      >
        {visible.length === 0 ? (
          <EmptyState fill icon={<FolderIcon size={24} />} title={t('home.projects.noResults')} />
        ) : null}
        {visible.map((project) => (
          <div
            className="management-surface-row"
            data-selected={project.projectId === selectedProjectId}
            key={project.projectId}
          >
            <button
              type="button"
              className="management-surface-row__select"
              aria-pressed={project.projectId === selectedProjectId}
              disabled={!interactive}
              onClick={() => onSelect(project.projectId)}
            >
              <FolderIcon size={17} />
              <span className="management-surface-copy">
                <strong>{project.displayName}</strong>
                <small>{formatProjectDate(project.updatedAt, locale)}</small>
                {project.unavailable ? (
                  <small className="management-surface-row__diagnostic" role="status">
                    <WarningIcon size={13} />
                    <span>
                      {project.unavailable.fieldNames.join(', ')}: {project.unavailable.message}
                    </span>
                  </small>
                ) : null}
              </span>
            </button>
            <span className="management-surface-row-actions">
              <button
                type="button"
                aria-label={`${t('home.openProject')}: ${project.displayName}`}
                disabled={!interactive || project.unavailable !== undefined}
                title={t('home.openProject')}
                onClick={() => onOpen(project.projectId)}
              >
                <OpenIcon size={15} />
              </button>
              <button
                type="button"
                aria-label={t('shell.removeRecentProject', { project: project.displayName })}
                disabled={!interactive}
                title={t('shell.removeRecentProject', { project: project.displayName })}
                onClick={() => onRemove(project)}
              >
                <TrashIcon size={15} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function filterAndSortProjectCatalog(
  projects: readonly DesktopProjectCatalogItem[],
  query: string,
  sort: DesktopProjectManagementSort,
): readonly DesktopProjectCatalogItem[] {
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

export function parseProjectManagementSort(value: string): DesktopProjectManagementSort {
  if (
    value === 'updated-descending' ||
    value === 'updated-ascending' ||
    value === 'name-ascending' ||
    value === 'name-descending'
  ) {
    return value;
  }
  throw new Error(`Unknown Project Management sort option: ${value}`);
}

function formatProjectDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}
