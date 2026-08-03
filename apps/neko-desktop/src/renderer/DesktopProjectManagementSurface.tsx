import { FolderIcon, GridIcon, LayersIcon, SearchIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { useMemo, useState } from 'react';
import type { DesktopProjectCatalogItem } from '@neko/host/desktop-shell-contract';

export type DesktopProjectManagementSort =
  'updated-descending' | 'updated-ascending' | 'name-ascending' | 'name-descending';

export function DesktopProjectCatalogSurface({
  interactive,
  onSelect,
  projects,
  selectedProjectId,
  sessionId,
}: {
  readonly interactive: boolean;
  readonly onSelect: (projectId: string) => void;
  readonly projects: readonly DesktopProjectCatalogItem[];
  readonly selectedProjectId?: string;
  readonly sessionId: string;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DesktopProjectManagementSort>('updated-descending');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const visible = useMemo(
    () => filterAndSortProjectCatalog(projects, query, sort),
    [projects, query, sort],
  );
  return (
    <section className="project-management-catalog" data-project-management-session={sessionId}>
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
      <div className={`management-surface-list is-${view}`}>
        {visible.length === 0 ? (
          <div className="management-surface-empty">
            <FolderIcon size={24} />
            <span>{t('home.projects.noResults')}</span>
          </div>
        ) : null}
        {visible.map((project) => (
          <button
            type="button"
            className="management-surface-row"
            aria-pressed={project.projectId === selectedProjectId}
            disabled={!interactive}
            key={project.projectId}
            onClick={() => onSelect(project.projectId)}
          >
            <FolderIcon size={17} />
            <span className="management-surface-copy">
              <strong>{project.displayName}</strong>
              <small>{formatProjectDate(project.updatedAt, locale)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DesktopProjectDetailSurface({
  interactive,
  onOpen,
  project,
  sessionId,
}: {
  readonly interactive: boolean;
  readonly onOpen: (projectId: string) => void;
  readonly project?: DesktopProjectCatalogItem;
  readonly sessionId: string;
}): JSX.Element {
  const { locale, t } = useTranslation();
  return (
    <section className="project-management-detail" data-project-management-session={sessionId}>
      {project ? (
        <div className="project-management-detail__content">
          <FolderIcon size={26} />
          <h2>{project.displayName}</h2>
          <dl>
            <dt>{t('home.projects.updated')}</dt>
            <dd>{formatProjectDate(project.updatedAt, locale)}</dd>
            <dt>{t('home.projects.created')}</dt>
            <dd>{formatProjectDate(project.createdAt, locale)}</dd>
          </dl>
          <button type="button" disabled={!interactive} onClick={() => onOpen(project.projectId)}>
            {t('home.openProject')}
          </button>
        </div>
      ) : (
        <div className="management-surface-empty">
          <FolderIcon size={24} />
          <span>{t('home.projects.select')}</span>
        </div>
      )}
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
