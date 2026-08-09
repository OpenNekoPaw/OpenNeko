import {
  CloseIcon,
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
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type {
  DesktopAgentHomeConversationSummary,
  DesktopProjectCatalogItem,
} from '@neko/host/desktop-shell-contract';

export type DesktopProjectManagementSort =
  'updated-descending' | 'updated-ascending' | 'name-ascending' | 'name-descending';

export function DesktopProjectCatalogSurface({
  conversations,
  interactive,
  onDeleteConversations,
  onOpen,
  onRemove,
  projects,
}: {
  readonly conversations: readonly DesktopAgentHomeConversationSummary[];
  readonly interactive: boolean;
  readonly onDeleteConversations: (projects: readonly DesktopProjectCatalogItem[]) => void;
  readonly onOpen: (projectId: string) => void;
  readonly onRemove: (projects: readonly DesktopProjectCatalogItem[]) => void;
  readonly projects: readonly DesktopProjectCatalogItem[];
}): JSX.Element {
  const { locale, t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DesktopProjectManagementSort>('updated-descending');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [selectedProjectIds, setSelectedProjectIds] = useState<ReadonlySet<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState<string>();
  const visible = useMemo(
    () => filterAndSortProjectCatalog(projects, query, sort),
    [projects, query, sort],
  );
  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedProjectIds.has(project.projectId)),
    [projects, selectedProjectIds],
  );
  const conversationCounts = useMemo(
    () => countProjectWorkspaceConversations(projects, conversations),
    [conversations, projects],
  );
  const selectedConversationCount = selectedProjects.reduce(
    (count, project) => count + (conversationCounts.get(project.projectId) ?? 0),
    0,
  );
  useEffect(() => {
    setSelectedProjectIds((current) => {
      const reconciled = reconcileProjectSelection(current, projects);
      return setsEqual(current, reconciled) ? current : reconciled;
    });
    setSelectionAnchorId((current) =>
      current && projects.some((project) => project.projectId === current) ? current : undefined,
    );
  }, [projects]);
  const clearSelection = (): void => {
    setSelectedProjectIds(new Set());
    setSelectionAnchorId(undefined);
  };
  const selectProject = (
    projectId: string,
    event: Pick<ReactMouseEvent<HTMLButtonElement>, 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  ): void => {
    const selection = applyProjectSelection({
      projectIds: visible.map((project) => project.projectId),
      selectedProjectIds,
      anchorId: selectionAnchorId,
      projectId,
      toggle: event.metaKey || event.ctrlKey,
      range: event.shiftKey,
    });
    setSelectedProjectIds(selection.selectedProjectIds);
    setSelectionAnchorId(selection.anchorId);
  };
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
      {selectedProjects.length > 0 ? (
        <div
          className="project-management-batch-toolbar"
          role="toolbar"
          aria-label={t('home.projects.selectedCount', { count: selectedProjects.length })}
        >
          <strong>{t('home.projects.selectedCount', { count: selectedProjects.length })}</strong>
          <span className="project-management-batch-toolbar__spacer" />
          <button type="button" disabled={!interactive} onClick={() => onRemove(selectedProjects)}>
            <RemoveIcon size={14} />
            <span>{t('home.projects.removeSelected')}</span>
          </button>
          <button
            type="button"
            disabled={!interactive || selectedConversationCount === 0}
            onClick={() => onDeleteConversations(selectedProjects)}
          >
            <TrashIcon size={14} />
            <span>{t('home.projects.deleteConversationsSelected')}</span>
          </button>
          <button
            type="button"
            aria-label={t('home.projects.clearSelection')}
            disabled={!interactive}
            title={t('home.projects.clearSelection')}
            onClick={clearSelection}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ) : null}
      <div
        aria-label={t('home.allProjects')}
        className={`management-surface-list is-${view}`}
        data-empty={visible.length === 0}
        onKeyDown={(event) => {
          if (isTextEntryTarget(event.target)) return;
          if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'a') {
            event.preventDefault();
            setSelectedProjectIds(selectAllProjectIds(visible));
            setSelectionAnchorId(visible[0]?.projectId);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            clearSelection();
            return;
          }
          if (
            interactive &&
            selectedProjects.length > 0 &&
            (event.key === 'Delete' || event.key === 'Backspace')
          ) {
            event.preventDefault();
            onRemove(selectedProjects);
            return;
          }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            event.currentTarget.scrollTop =
              event.key === 'Home' ? 0 : event.currentTarget.scrollHeight;
          }
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
            data-project-id={project.projectId}
            data-selected={selectedProjectIds.has(project.projectId)}
            data-workspace-open-disabled={project.unavailable !== undefined}
            key={project.projectId}
          >
            <button
              type="button"
              className="management-surface-row__select"
              aria-pressed={selectedProjectIds.has(project.projectId)}
              disabled={!interactive}
              onClick={(event) => selectProject(project.projectId, event)}
              onDoubleClick={project.unavailable ? undefined : () => onOpen(project.projectId)}
            >
              <FolderIcon size={17} />
              <span className="management-surface-copy">
                <strong>{project.displayName}</strong>
                <small>{formatProjectDate(project.updatedAt, locale)}</small>
                {project.unavailable ? (
                  <small
                    className="management-surface-row__diagnostic"
                    role="status"
                    title={`${project.unavailable.fieldNames.join(', ')}: ${project.unavailable.message}`}
                  >
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
                aria-label={t('shell.deleteProjectConversations', {
                  project: project.displayName,
                })}
                disabled={!interactive || (conversationCounts.get(project.projectId) ?? 0) === 0}
                title={t('shell.deleteProjectConversations', { project: project.displayName })}
                onClick={() => onDeleteConversations([project])}
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

function countProjectWorkspaceConversations(
  projects: readonly DesktopProjectCatalogItem[],
  conversations: readonly DesktopAgentHomeConversationSummary[],
): ReadonlyMap<string, number> {
  const projectIdsByWorkspace = new Map(
    projects.map((project) => [project.workspaceId, project.projectId] as const),
  );
  const counts = new Map<string, number>();
  for (const conversation of conversations) {
    if (conversation.navigation.owner.kind !== 'workspace') continue;
    const projectId = projectIdsByWorkspace.get(conversation.navigation.owner.workspaceId);
    if (!projectId) continue;
    counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  }
  return counts;
}

export interface ProjectSelectionUpdate {
  readonly selectedProjectIds: ReadonlySet<string>;
  readonly anchorId: string | undefined;
}

export function applyProjectSelection(input: {
  readonly projectIds: readonly string[];
  readonly selectedProjectIds: ReadonlySet<string>;
  readonly anchorId: string | undefined;
  readonly projectId: string;
  readonly toggle: boolean;
  readonly range: boolean;
}): ProjectSelectionUpdate {
  if (!input.projectIds.includes(input.projectId)) {
    throw new Error(`Project Management item '${input.projectId}' is unavailable.`);
  }
  if (input.range && input.anchorId) {
    const anchorIndex = input.projectIds.indexOf(input.anchorId);
    const projectIndex = input.projectIds.indexOf(input.projectId);
    if (anchorIndex >= 0) {
      const rangeIds = input.projectIds.slice(
        Math.min(anchorIndex, projectIndex),
        Math.max(anchorIndex, projectIndex) + 1,
      );
      return {
        selectedProjectIds: input.toggle
          ? new Set([...input.selectedProjectIds, ...rangeIds])
          : new Set(rangeIds),
        anchorId: input.anchorId,
      };
    }
  }
  if (input.toggle) {
    const selectedProjectIds = new Set(input.selectedProjectIds);
    if (selectedProjectIds.has(input.projectId)) selectedProjectIds.delete(input.projectId);
    else selectedProjectIds.add(input.projectId);
    return { selectedProjectIds, anchorId: input.projectId };
  }
  return { selectedProjectIds: new Set([input.projectId]), anchorId: input.projectId };
}

export function selectAllProjectIds(
  projects: readonly DesktopProjectCatalogItem[],
): ReadonlySet<string> {
  return new Set(projects.map((project) => project.projectId));
}

export function reconcileProjectSelection(
  selectedProjectIds: ReadonlySet<string>,
  projects: readonly DesktopProjectCatalogItem[],
): ReadonlySet<string> {
  const projectIds = new Set(projects.map((project) => project.projectId));
  return new Set([...selectedProjectIds].filter((projectId) => projectIds.has(projectId)));
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

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
