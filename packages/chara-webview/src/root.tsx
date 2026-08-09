import type {
  CharacterFoundationCommand,
  CharacterFoundationSnapshot,
  OpenNekoDesktopCharacterBridge,
} from '@neko/chara/contracts';
import {
  GridIcon,
  LayersIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  UserIcon,
  WarningIcon,
} from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CharacterPanel } from './character-panel';
import { describeError, FoundationDiagnostic, FoundationEmpty } from './foundation-ui';
import { foundationLabel } from './labels';

export {
  CharacterRoomInteractionFeed,
  CharacterRoomTimelineSurface,
  useCharacterRoomWorkbenchRuntime,
  type CharacterRoomWorkbenchLoadState,
} from './room-workbench';

type LoadState =
  | { readonly kind: 'idle' | 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly snapshot: CharacterFoundationSnapshot };

export interface CharacterManagementRuntime {
  readonly loadState: LoadState;
  readonly pendingOperation?: string;
  readonly diagnostic?: string;
  readonly reload: () => Promise<void>;
  readonly execute: (command: CharacterFoundationCommand) => Promise<CharacterFoundationSnapshot>;
}

export type CharacterDetailSelection =
  { readonly kind: 'create' } | { readonly kind: 'project'; readonly characterProjectId: string };

export function useCharacterManagementRuntime(input: {
  readonly active: boolean;
  readonly host?: OpenNekoDesktopCharacterBridge['characterFoundation'];
}): CharacterManagementRuntime {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'idle' });
  const [pendingOperation, setPendingOperation] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<string>();

  const reload = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    setDiagnostic(undefined);
    try {
      if (!input.host) throw new Error('Character Management Host port is unavailable.');
      setLoadState({ kind: 'ready', snapshot: await input.host.getSnapshot() });
    } catch (error) {
      setLoadState({ kind: 'failed', message: describeError(error) });
    }
  }, [input.host]);

  useEffect(() => {
    if (!input.active) {
      setLoadState({ kind: 'idle' });
      setDiagnostic(undefined);
      return;
    }
    void reload();
  }, [input.active, reload]);

  const execute = useCallback(
    async (command: CharacterFoundationCommand): Promise<CharacterFoundationSnapshot> => {
      setPendingOperation(command.operation);
      setDiagnostic(undefined);
      try {
        if (!input.host) throw new Error('Character Management Host port is unavailable.');
        const snapshot = await input.host.execute(command);
        setLoadState({ kind: 'ready', snapshot });
        return snapshot;
      } catch (error) {
        setDiagnostic(describeError(error));
        throw error;
      } finally {
        setPendingOperation(undefined);
      }
    },
    [input.host],
  );

  return { loadState, pendingOperation, diagnostic, reload, execute };
}

export function CharacterCatalogSurface({
  locale,
  onCreate,
  onSelect,
  runtime,
  selectedProjectId,
}: {
  readonly locale: SupportedLocale;
  readonly onCreate: () => void;
  readonly onSelect: (characterProjectId: string) => void;
  readonly runtime: CharacterManagementRuntime;
  readonly selectedProjectId?: string;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const snapshot = runtime.loadState.kind === 'ready' ? runtime.loadState.snapshot : undefined;
  const projects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return [...(snapshot?.character.projects ?? [])]
      .filter((project) => project.displayName.toLocaleLowerCase().includes(normalized))
      .sort((left, right) =>
        sort === 'name'
          ? left.displayName.localeCompare(right.displayName) ||
            left.characterProjectId.localeCompare(right.characterProjectId)
          : right.updatedAt.localeCompare(left.updatedAt) ||
            left.characterProjectId.localeCompare(right.characterProjectId),
      );
  }, [query, snapshot?.character.projects, sort]);

  return (
    <section
      className="character-management character-management--catalog"
      data-character-management-catalog="true"
    >
      <header className="character-management__header">
        <div>
          <span>{foundationLabel(locale, '角色管理', 'Character management')}</span>
          <h1>{foundationLabel(locale, '角色', 'Characters')}</h1>
        </div>
        <div className="character-management__header-actions">
          <button
            aria-label={foundationLabel(locale, '刷新角色', 'Refresh characters')}
            disabled={runtime.loadState.kind === 'loading'}
            title={foundationLabel(locale, '刷新', 'Refresh')}
            type="button"
            onClick={() => void runtime.reload()}
          >
            <RefreshIcon size={16} />
          </button>
          <button type="button" onClick={onCreate}>
            <PlusIcon size={15} />
            <span>{foundationLabel(locale, '新建角色', 'New character')}</span>
          </button>
        </div>
      </header>
      <div className="character-management__toolbar">
        <label className="character-management__search">
          <SearchIcon size={16} />
          <input
            aria-label={foundationLabel(locale, '搜索角色', 'Search characters')}
            placeholder={foundationLabel(locale, '搜索角色', 'Search characters')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <select
          aria-label={foundationLabel(locale, '角色排序', 'Character sort')}
          value={sort}
          onChange={(event) => setSort(event.currentTarget.value === 'name' ? 'name' : 'updated')}
        >
          <option value="updated">{foundationLabel(locale, '最近更新', 'Recently updated')}</option>
          <option value="name">{foundationLabel(locale, '名称', 'Name')}</option>
        </select>
        <button
          aria-label={foundationLabel(locale, '网格视图', 'Grid view')}
          aria-pressed={view === 'grid'}
          title={foundationLabel(locale, '网格视图', 'Grid view')}
          type="button"
          onClick={() => setView('grid')}
        >
          <GridIcon size={15} />
        </button>
        <button
          aria-label={foundationLabel(locale, '列表视图', 'List view')}
          aria-pressed={view === 'list'}
          title={foundationLabel(locale, '列表视图', 'List view')}
          type="button"
          onClick={() => setView('list')}
        >
          <LayersIcon size={15} />
        </button>
      </div>
      {runtime.loadState.kind === 'loading' || runtime.loadState.kind === 'idle' ? (
        <div className="character-management__status" role="status">
          {foundationLabel(locale, '正在读取角色...', 'Loading characters...')}
        </div>
      ) : runtime.loadState.kind === 'failed' ? (
        <div className="character-management__status is-error">
          <FoundationDiagnostic role="alert">{runtime.loadState.message}</FoundationDiagnostic>
          <button type="button" onClick={() => void runtime.reload()}>
            {foundationLabel(locale, '重试', 'Retry')}
          </button>
        </div>
      ) : (
        <div className={`character-management__catalog is-${view}`}>
          {snapshot?.diagnostics.map((item) => (
            <FoundationDiagnostic key={`${item.owner}:${item.recordKind}:${item.recordId}`}>
              {`${item.recordKind} / ${item.recordId}: ${item.message}`}
            </FoundationDiagnostic>
          ))}
          {projects.length === 0 ? (
            <FoundationEmpty>
              {query
                ? foundationLabel(locale, '没有匹配的角色', 'No matching characters')
                : foundationLabel(
                    locale,
                    '尚无角色，创建第一个角色。',
                    'No characters yet. Create the first one.',
                  )}
            </FoundationEmpty>
          ) : null}
          {projects.map((project) => {
            const publicationCount =
              snapshot?.character.versions.filter(
                (publication) => publication.characterProjectId === project.characterProjectId,
              ).length ?? 0;
            const diagnostic = snapshot?.diagnostics.find(
              (item) => item.owner === 'character' && item.recordId === project.characterProjectId,
            );
            return (
              <button
                aria-pressed={selectedProjectId === project.characterProjectId}
                className="character-management__catalog-item"
                key={project.characterProjectId}
                type="button"
                onClick={() => onSelect(project.characterProjectId)}
              >
                <span className="character-management__avatar-placeholder">
                  <UserIcon size={20} />
                </span>
                <span className="character-management__catalog-copy">
                  <strong>{project.displayName}</strong>
                  <small>
                    {project.draft.summary || foundationLabel(locale, '暂无概述', 'No summary')}
                  </small>
                  <span>
                    {foundationLabel(
                      locale,
                      reviewLabelZh(project.reviewStatus),
                      project.reviewStatus,
                    )}
                    {' · '}
                    {foundationLabel(
                      locale,
                      `${publicationCount} 个版本`,
                      `${publicationCount} versions`,
                    )}
                  </span>
                </span>
                {diagnostic ? <WarningIcon aria-label={diagnostic.message} size={15} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CharacterDetailSurface({
  locale,
  onCreated,
  runtime,
  selection,
}: {
  readonly locale: SupportedLocale;
  readonly onCreated: (characterProjectId: string) => void;
  readonly runtime: CharacterManagementRuntime;
  readonly selection?: CharacterDetailSelection;
}): JSX.Element {
  return (
    <section
      className="character-management character-management--detail"
      data-character-management-detail="true"
    >
      {runtime.diagnostic ? (
        <FoundationDiagnostic role="alert">{runtime.diagnostic}</FoundationDiagnostic>
      ) : null}
      {runtime.loadState.kind !== 'ready' ? (
        <div className="character-management__status" role="status">
          {runtime.loadState.kind === 'failed'
            ? runtime.loadState.message
            : foundationLabel(locale, '正在读取角色详情...', 'Loading character details...')}
        </div>
      ) : selection ? (
        <CharacterPanel
          creating={selection.kind === 'create'}
          execute={runtime.execute}
          locale={locale}
          onCreated={onCreated}
          pendingOperation={runtime.pendingOperation}
          selectedProjectId={
            selection.kind === 'project' ? selection.characterProjectId : undefined
          }
          snapshot={runtime.loadState.snapshot}
        />
      ) : (
        <div className="character-management__detail-empty">
          <UserIcon size={26} />
          <strong>{foundationLabel(locale, '选择一个角色', 'Select a character')}</strong>
          <span>
            {foundationLabel(locale, '角色详情会显示在这里。', 'Character details appear here.')}
          </span>
        </div>
      )}
    </section>
  );
}

function reviewLabelZh(status: 'draft' | 'ready' | 'blocked'): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'ready':
      return '可发布';
    case 'blocked':
      return '阻塞';
  }
}
