import type {
  CharacterFoundationCommand,
  CharacterFoundationSnapshot,
  CharacterAuthoringCommand,
  CharacterAuthoringSnapshot,
  CharacterAuthoringBinding,
  OpenNekoDesktopCharacterAuthoringBridge,
  OpenNekoDesktopCharacterBridge,
} from '@neko/chara/contracts';
import {
  EmptyState,
  MessageIcon,
  PackageIcon,
  RefreshIcon,
  SearchIcon,
  StorylineIcon,
  UserIcon,
  WarningIcon,
} from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterAuthoringEditor } from './character-panel';
import {
  CharacterManagementDetailSurface,
  type CharacterManagementDetailActions,
} from './character-management-detail';
import { describeError, FoundationDiagnostic } from './foundation-ui';
import { foundationLabel } from './labels';

export {
  CharacterRoomInteractionFeed,
  CharacterRoomTimelineSurface,
  projectCharacterRoomIdentity,
  useCharacterRoomWorkbenchRuntime,
  type CharacterRoomIdentityProjection,
  type CharacterRoomWorkbenchLoadState,
} from './room-workbench';
export { CharacterStorylineTimelineSurface } from './storyline-timeline';
export {
  CharacterPortableExportScopeSurface,
  CharacterPortableImportSurface,
  type CharacterPortableExportRepresentation,
  type CharacterPortableExportScopePresentation,
  type CharacterPortableExportSelection,
} from './character-portable-package-surface';
export { CharacterCompanionContinuitySurface } from './companion-continuity';
export {
  CharacterManagementDetailSurface,
  type CharacterManagementDetailActions,
} from './character-management-detail';

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

export type CharacterDetailSelection = {
  readonly kind: 'global';
  readonly globalCharacterId: string;
};

export function useCharacterManagementRuntime(input: {
  readonly active: boolean;
  readonly host?: OpenNekoDesktopCharacterBridge['characterFoundation'];
  readonly reloadToken?: number;
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
  }, [input.active, input.reloadToken, reload]);

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
  onImport,
  onSelect,
  onStartFromTemplate,
  runtime,
  selectedGlobalCharacterId,
}: {
  readonly locale: SupportedLocale;
  readonly onImport?: () => void;
  readonly onSelect: (globalCharacterId: string) => void;
  readonly onStartFromTemplate: () => void;
  readonly runtime: CharacterManagementRuntime;
  readonly selectedGlobalCharacterId?: string;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const snapshot = runtime.loadState.kind === 'ready' ? runtime.loadState.snapshot : undefined;
  const characters = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return [...(snapshot?.character.globalCharacters ?? [])]
      .filter((character) => character.displayName.toLocaleLowerCase().includes(normalized))
      .sort((left, right) =>
        sort === 'name'
          ? left.displayName.localeCompare(right.displayName) ||
            left.globalCharacterId.localeCompare(right.globalCharacterId)
          : right.updatedAt.localeCompare(left.updatedAt) ||
            left.globalCharacterId.localeCompare(right.globalCharacterId),
      );
  }, [query, snapshot?.character.globalCharacters, sort]);

  return (
    <section
      className="character-management character-management--catalog"
      data-character-management-catalog="true"
    >
      <div className="character-management__content">
        <header className="character-management__hero">
          <div className="character-management__hero-copy">
            <h1>{foundationLabel(locale, '角色', 'Characters')}</h1>
            <p>
              {foundationLabel(
                locale,
                '管理用于创作、对话和互动的角色。',
                'Manage characters used in creation, dialogue, and interaction.',
              )}
            </p>
            {onImport ? (
              <button type="button" onClick={onImport}>
                <PackageIcon size={15} />
                <span>{foundationLabel(locale, '导入角色包', 'Import package')}</span>
              </button>
            ) : null}
          </div>
          <div className="character-management__hero-visual" aria-hidden="true">
            <span className="character-management__hero-connector" />
            <span className="character-management__hero-tile is-identity">
              <UserIcon size={25} />
            </span>
            <span className="character-management__hero-tile is-dialogue">
              <MessageIcon size={22} />
            </span>
            <span className="character-management__hero-tile is-storyline">
              <StorylineIcon size={22} />
            </span>
          </div>
        </header>

        <section
          className="character-management__collection"
          aria-labelledby="my-characters-heading"
        >
          <header className="character-management__collection-header">
            <div className="character-management__collection-title">
              <h2 id="my-characters-heading">
                {foundationLabel(locale, '我的角色', 'My Characters')}
              </h2>
              <span
                aria-label={foundationLabel(
                  locale,
                  `${characters.length} 个角色`,
                  `${characters.length} characters`,
                )}
              >
                {characters.length}
              </span>
            </div>
            <div className="character-management__controls">
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
                onChange={(event) =>
                  setSort(event.currentTarget.value === 'name' ? 'name' : 'updated')
                }
              >
                <option value="updated">
                  {foundationLabel(locale, '最近更新', 'Recently updated')}
                </option>
                <option value="name">{foundationLabel(locale, '名称', 'Name')}</option>
              </select>
              <button
                aria-label={foundationLabel(locale, '刷新角色', 'Refresh characters')}
                disabled={runtime.loadState.kind === 'loading'}
                title={foundationLabel(locale, '刷新', 'Refresh')}
                type="button"
                onClick={() => void runtime.reload()}
              >
                <RefreshIcon size={16} />
              </button>
            </div>
          </header>
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
            <div
              className={`character-management__catalog${characters.length === 0 ? ' is-empty' : ''}`}
            >
              {snapshot?.diagnostics.map((item) => (
                <FoundationDiagnostic key={`${item.owner}:${item.recordKind}:${item.recordId}`}>
                  {`${item.recordKind} / ${item.recordId}: ${item.message}`}
                </FoundationDiagnostic>
              ))}
              {characters.length === 0 ? (
                <EmptyState
                  fill
                  icon={<UserIcon size={24} />}
                  title={
                    query
                      ? foundationLabel(locale, '没有匹配的角色', 'No matching characters')
                      : foundationLabel(
                          locale,
                          '尚无角色，请导入第一个角色包。',
                          'No characters yet. Import the first package.',
                        )
                  }
                />
              ) : null}
              {characters.map((character) => {
                const publicationCount = character.characterVersionIds.length;
                const diagnostic = snapshot?.diagnostics.find(
                  (item) =>
                    item.owner === 'character' && item.recordId === character.globalCharacterId,
                );
                return (
                  <button
                    aria-pressed={selectedGlobalCharacterId === character.globalCharacterId}
                    className="character-management__catalog-item"
                    key={character.globalCharacterId}
                    type="button"
                    onClick={() => onSelect(character.globalCharacterId)}
                  >
                    <span className="character-management__avatar-placeholder">
                      <UserIcon size={20} />
                    </span>
                    <span className="character-management__catalog-copy">
                      <strong>{character.displayName}</strong>
                      <small>
                        {snapshot?.character.versions.find(
                          (version) =>
                            version.characterVersionId === character.currentCharacterVersionId,
                        )?.definition.summary || foundationLabel(locale, '暂无概述', 'No summary')}
                      </small>
                      <span>
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

        <section
          className="character-management__templates"
          aria-labelledby="character-templates-heading"
        >
          <h2 id="character-templates-heading">
            {foundationLabel(locale, '从角色模板创建', 'Create from a Character template')}
          </h2>
          <div className="character-management__template-grid">
            <button
              className="character-management__template-card"
              data-character-template="character-kit"
              type="button"
              onClick={onStartFromTemplate}
            >
              <span className="character-management__template-preview" aria-hidden="true">
                <span className="character-management__template-pattern">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="character-management__template-icon">
                  <UserIcon size={26} />
                </span>
              </span>
              <span className="character-management__template-body">
                <span className="character-management__template-copy">
                  <strong>
                    {foundationLabel(locale, '建立角色创作包', 'Build a character kit')}
                  </strong>
                  <small>
                    {foundationLabel(
                      locale,
                      '整理人设、关系、视觉参考与声音。',
                      'Shape identity, relationships, visual references, and voice.',
                    )}
                  </small>
                </span>
                <span className="character-management__template-action">
                  {foundationLabel(locale, '开始创作', 'Start creating')}
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

export function CharacterDetailSurface({
  actions,
  locale,
  runtime,
  selection,
}: {
  readonly actions?: CharacterManagementDetailActions;
  readonly locale: SupportedLocale;
  readonly runtime: CharacterManagementRuntime;
  readonly selection?: CharacterDetailSelection;
}): JSX.Element {
  const detailActions = actions ?? {};
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
      ) : selection?.kind === 'global' ? (
        (() => {
          const character = runtime.loadState.snapshot.character.globalCharacters.find(
            (candidate) => candidate.globalCharacterId === selection.globalCharacterId,
          );
          return character ? (
            <CharacterManagementDetailSurface
              actions={detailActions}
              locale={locale}
              character={character}
              snapshot={runtime.loadState.snapshot}
            />
          ) : (
            <div className="character-management__detail-empty" role="status">
              {foundationLabel(
                locale,
                '所选角色不可用。',
                'The selected character is unavailable.',
              )}
            </div>
          );
        })()
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

type AuthoringLoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly snapshot: CharacterAuthoringSnapshot };

export function CharacterAuthoringSurface({
  binding,
  host,
  initialSnapshot,
  locale,
  onFinalizeAndStartConversation,
  windowId,
}: {
  readonly binding: CharacterAuthoringBinding;
  readonly host?: OpenNekoDesktopCharacterAuthoringBridge['characterAuthoring'];
  readonly initialSnapshot?: CharacterAuthoringSnapshot;
  readonly locale: SupportedLocale;
  readonly onFinalizeAndStartConversation?: (input: {
    readonly characterProjectId: string;
    readonly characterVersionId: string;
    readonly label: string;
  }) => Promise<void>;
  readonly windowId: string;
}): JSX.Element {
  const [loadState, setLoadState] = useState<AuthoringLoadState>(() =>
    initialSnapshot ? { kind: 'ready', snapshot: initialSnapshot } : { kind: 'loading' },
  );
  const initialSnapshotConsumed = useRef(initialSnapshot !== undefined);
  const [pendingOperation, setPendingOperation] = useState<string>();
  const [diagnostic, setDiagnostic] = useState<string>();

  const reload = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    setDiagnostic(undefined);
    try {
      if (!host) throw new Error('Character authoring Host port is unavailable.');
      setLoadState({ kind: 'ready', snapshot: await host.getSnapshot(windowId, binding) });
    } catch (error) {
      setLoadState({ kind: 'failed', message: describeError(error) });
    }
  }, [binding, host, windowId]);

  useEffect(() => {
    if (initialSnapshotConsumed.current) {
      initialSnapshotConsumed.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const execute = useCallback(
    async (command: CharacterAuthoringCommand): Promise<CharacterAuthoringSnapshot> => {
      setPendingOperation(command.operation);
      setDiagnostic(undefined);
      try {
        if (!host) throw new Error('Character authoring Host port is unavailable.');
        const snapshot = await host.execute(
          windowId,
          binding,
          command as CharacterAuthoringCommand,
        );
        setLoadState({ kind: 'ready', snapshot });
        return snapshot;
      } catch (error) {
        setDiagnostic(describeError(error));
        throw error;
      } finally {
        setPendingOperation(undefined);
      }
    },
    [binding, host, windowId],
  );
  const finalizeAndStartConversation = useCallback(
    async (input: {
      readonly characterProjectId: string;
      readonly characterVersionId: string;
      readonly label: string;
    }) => {
      setDiagnostic(undefined);
      try {
        if (!onFinalizeAndStartConversation) {
          throw new Error('Finalize-and-start Conversation handoff is unavailable.');
        }
        await onFinalizeAndStartConversation(input);
      } catch (error) {
        setDiagnostic(describeError(error));
        throw error;
      }
    },
    [onFinalizeAndStartConversation],
  );

  if (loadState.kind === 'loading') {
    return (
      <div className="character-management__status" role="status">
        {foundationLabel(locale, '正在读取角色创作目标...', 'Loading character target...')}
      </div>
    );
  }
  if (loadState.kind === 'failed') {
    return (
      <div className="character-management__status is-error">
        <FoundationDiagnostic role="alert">{loadState.message}</FoundationDiagnostic>
        <button type="button" onClick={() => void reload()}>
          {foundationLabel(locale, '重试', 'Retry')}
        </button>
      </div>
    );
  }
  return (
    <section className="character-authoring-surface" data-character-authoring-surface="true">
      {diagnostic ? <FoundationDiagnostic role="alert">{diagnostic}</FoundationDiagnostic> : null}
      <CharacterAuthoringEditor
        execute={execute}
        locale={locale}
        onFinalizeAndStartConversation={
          onFinalizeAndStartConversation ? finalizeAndStartConversation : undefined
        }
        pendingOperation={pendingOperation}
        selectedProjectId={binding.characterProjectId}
        snapshot={loadState.snapshot}
      />
    </section>
  );
}
