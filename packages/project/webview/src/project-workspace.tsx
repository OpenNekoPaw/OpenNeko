import type {
  OpenNekoDesktopProjectAuthoringBridge,
  ProjectCreativeWorkspaceBinding,
  ProjectContentProjection,
  ProjectCreativeWorkspaceProjection,
  ProjectGlobalReferenceItem,
  ProjectMixedDomainTargetItem,
} from '@neko/project-domain/contracts';
import {
  projectGlobalObjectKey,
  projectGlobalReferenceKey,
  type ProjectGlobalReference,
} from '@neko/project-domain/contracts';
import {
  CubeIcon,
  CopyIcon,
  EyeIcon,
  FolderIcon,
  LoadingIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  WarningIcon,
} from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { EmptyState } from '@neko/ui/primitives';
import { useEffect, useId, useMemo, useState } from 'react';

type ProjectWorkspaceState =
  | { readonly kind: 'loading'; readonly projectId: string }
  | {
      readonly kind: 'ready';
      readonly projectId: string;
      readonly workspaceProjection: ProjectCreativeWorkspaceProjection;
      readonly contentProjection: ProjectContentProjection;
    }
  | { readonly kind: 'failed'; readonly projectId: string; readonly message: string };

export type ProjectCreativeCatalogKind = 'content' | 'character' | 'world' | 'entity' | 'candidate';
export type ProjectCreativeCatalogScope = 'workspace' | 'global-reference';
export type ProjectCreativeCatalogSort = 'recent' | 'name' | 'type';

const PROJECT_CREATIVE_CATALOG_KIND_ORDER = [
  'content',
  'character',
  'world',
  'entity',
  'candidate',
] as const satisfies readonly ProjectCreativeCatalogKind[];

export interface ProjectCreativeCatalogItem {
  readonly identity: string;
  readonly kind: ProjectCreativeCatalogKind;
  readonly scope: ProjectCreativeCatalogScope;
  readonly label: string;
  readonly summary?: string;
  readonly updatedAt?: string;
  readonly versionLabel?: string;
  readonly detailLabel?: string;
  readonly statusLabel?: string;
  readonly diagnostic?: string;
  readonly target?: ProjectMixedDomainTargetItem;
  readonly reference?: ProjectGlobalReferenceItem;
}

export interface ProjectWorkspaceRootProps {
  readonly binding: ProjectCreativeWorkspaceBinding;
  readonly experimentalCreativeCapabilitiesReady: boolean;
  readonly host: Pick<
    OpenNekoDesktopProjectAuthoringBridge['projectAuthoring'],
    | 'getContent'
    | 'getCreativeWorkspace'
    | 'mutateCreativeWorkspaceObject'
    | 'mutateCreativeWorkspaceReference'
  >;
  readonly locale: SupportedLocale;
  readonly onOpenTarget: (item: ProjectMixedDomainTargetItem) => Promise<void> | void;
  readonly windowId: string;
}

export function ProjectWorkspaceRoot({
  binding,
  experimentalCreativeCapabilitiesReady,
  host,
  locale,
  onOpenTarget,
  windowId,
}: ProjectWorkspaceRootProps): JSX.Element {
  const workspaceBinding = useMemo(
    () => ({
      workspaceId: binding.workspaceId,
      workspaceGrantId: binding.workspaceGrantId,
      projectId: binding.projectId,
    }),
    [binding.projectId, binding.workspaceGrantId, binding.workspaceId],
  );
  const [reloadOrdinal, setReloadOrdinal] = useState(0);
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ProjectCreativeCatalogKind | 'all'>('all');
  const [scopeFilter, setScopeFilter] = useState<ProjectCreativeCatalogScope | 'all'>('all');
  const [sort, setSort] = useState<ProjectCreativeCatalogSort>('recent');
  const [showReferenceAdd, setShowReferenceAdd] = useState(false);
  const [state, setState] = useState<ProjectWorkspaceState>({
    kind: 'loading',
    projectId: binding.projectId,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading', projectId: binding.projectId });
    setActionError(undefined);
    void Promise.all([
      host.getCreativeWorkspace(windowId, workspaceBinding),
      host.getContent(windowId, workspaceBinding),
    ]).then(
      ([workspaceResult, contentResult]) => {
        if (cancelled) return;
        if (
          workspaceResult.projectId !== binding.projectId ||
          workspaceResult.projection.composition.projectId !== binding.projectId ||
          contentResult.projectId !== binding.projectId ||
          contentResult.projection.projectId !== binding.projectId
        ) {
          setState({
            kind: 'failed',
            projectId: binding.projectId,
            message: text(
              locale,
              '工作区返回了其他项目的数据。',
              'The Workspace returned data for another Project.',
            ),
          });
          return;
        }
        setState({
          kind: 'ready',
          projectId: binding.projectId,
          workspaceProjection: workspaceResult.projection,
          contentProjection: contentResult.projection,
        });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'failed',
            projectId: binding.projectId,
            message: describeError(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [binding.projectId, host, locale, reloadOrdinal, windowId, workspaceBinding]);

  const runAction = async (action: () => Promise<void> | void, reload = false): Promise<void> => {
    setBusy(true);
    setActionError(undefined);
    try {
      await action();
      if (reload) setReloadOrdinal((current) => current + 1);
    } catch (error: unknown) {
      setActionError(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const mutateReference = async (
    mutation: Parameters<typeof host.mutateCreativeWorkspaceReference>[2],
  ): Promise<void> => {
    await runAction(async () => {
      const result = await host.mutateCreativeWorkspaceReference(
        windowId,
        workspaceBinding,
        mutation,
      );
      setState((current) =>
        current.kind === 'ready' && current.projectId === binding.projectId
          ? { ...current, workspaceProjection: result.projection }
          : current,
      );
    });
  };
  const mutateObject = async (
    mutation: Parameters<typeof host.mutateCreativeWorkspaceObject>[2],
  ): Promise<void> => {
    await runAction(async () => {
      const result = await host.mutateCreativeWorkspaceObject(windowId, workspaceBinding, mutation);
      setState((current) =>
        current.kind === 'ready' && current.projectId === binding.projectId
          ? { ...current, workspaceProjection: result.projection }
          : current,
      );
      setReloadOrdinal((current) => current + 1);
    });
  };

  const catalogItems = useMemo(
    () =>
      state.kind === 'ready'
        ? createProjectCreativeCatalogItems(
            state.workspaceProjection,
            state.contentProjection,
            locale,
          )
        : [],
    [locale, state],
  );
  const visibleItems = useMemo(
    () =>
      filterAndSortProjectCreativeCatalog(catalogItems, {
        query,
        kind: kindFilter,
        scope: scopeFilter,
        sort,
      }),
    [catalogItems, kindFilter, query, scopeFilter, sort],
  );
  const availableKindFilters = useMemo(
    () => projectCreativeCatalogKinds(catalogItems),
    [catalogItems],
  );
  const synchronizeTarget = (
    item: ProjectMixedDomainTargetItem,
    conflictChoice?: 'base-on-current' | 'save-as-new',
  ): Promise<void> => {
    if (item.target.kind === 'character-project') {
      return mutateObject({
        kind: 'synchronize-character',
        characterProjectId: item.target.characterProjectId,
        globalCharacterId:
          conflictChoice === 'save-as-new' || !item.synchronization
            ? `global-character:${globalThis.crypto.randomUUID()}`
            : item.synchronization.globalObjectId,
        characterVersionId: `character-version:${globalThis.crypto.randomUUID()}`,
        label: item.label,
        ...(item.synchronization && conflictChoice !== 'save-as-new'
          ? { lastSyncedCharacterVersionId: item.synchronization.lastSyncedVersionId }
          : {}),
        ...(conflictChoice === 'base-on-current' ? { conflictChoice } : {}),
      });
    }
    if (item.target.kind === 'world-project') {
      return mutateObject({
        kind: 'synchronize-world',
        worldProjectId: item.target.worldProjectId,
        globalWorldId:
          conflictChoice === 'save-as-new' || !item.synchronization
            ? `global-world:${globalThis.crypto.randomUUID()}`
            : item.synchronization.globalObjectId,
        worldVersionId: `world-version:${globalThis.crypto.randomUUID()}`,
        label: item.label,
        ...(item.synchronization && conflictChoice !== 'save-as-new'
          ? { lastSyncedWorldVersionId: item.synchronization.lastSyncedVersionId }
          : {}),
        ...(conflictChoice === 'base-on-current' ? { conflictChoice } : {}),
      });
    }
    throw new Error(`Creative target '${item.target.kind}' does not support synchronization.`);
  };
  const copyReference = (
    reference: ProjectGlobalReferenceItem['reference'],
    label: string,
  ): Promise<void> => {
    if (reference.kind === 'character-version') {
      return mutateObject({
        kind: 'copy-character-reference',
        reference,
        characterProjectId: `character-project:${globalThis.crypto.randomUUID()}`,
        entity: {
          kind: 'create',
          entityId: `entity:${globalThis.crypto.randomUUID()}`,
          name: label,
        },
      });
    }
    return mutateObject({
      kind: 'copy-world-reference',
      reference,
      worldProjectId: `world-project:${globalThis.crypto.randomUUID()}`,
    });
  };

  if (state.projectId !== binding.projectId || state.kind === 'loading') {
    return (
      <section className="project-workspace-root is-loading" aria-live="polite">
        <LoadingIcon size={16} />
        <span>{text(locale, '正在读取工作区...', 'Loading Workspace...')}</span>
      </section>
    );
  }
  if (state.kind === 'failed') {
    return (
      <section className="project-workspace-root is-failed" role="alert">
        <WarningIcon size={16} />
        <span>{state.message}</span>
        <button type="button" onClick={() => setReloadOrdinal((current) => current + 1)}>
          {text(locale, '重试', 'Retry')}
        </button>
      </section>
    );
  }

  const composition = state.workspaceProjection.composition;
  return (
    <section className="project-workspace-root" data-project-workspace-root="true">
      <header className="project-workspace-root__catalog-header">
        <label className="project-workspace-root__search">
          <SearchIcon size={14} />
          <input
            aria-label={text(locale, '搜索创作内容', 'Search creative content')}
            placeholder={text(locale, '搜索名称、类型或描述', 'Search name, type, or summary')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        {experimentalCreativeCapabilitiesReady ? (
          <button
            aria-expanded={showReferenceAdd}
            className="project-workspace-root__add-reference"
            disabled={busy}
            title={text(locale, '添加全局引用', 'Add global reference')}
            type="button"
            onClick={() => setShowReferenceAdd((current) => !current)}
          >
            <PlusIcon size={14} />
          </button>
        ) : null}
      </header>

      <div
        className="project-workspace-root__kind-filters"
        role="group"
        aria-label={text(locale, '类型筛选', 'Type filter')}
      >
        {(['all', ...availableKindFilters] as const).map((kind) => (
          <button
            aria-pressed={kindFilter === kind}
            key={kind}
            type="button"
            onClick={() => setKindFilter(kind)}
          >
            {catalogKindLabel(locale, kind)}
          </button>
        ))}
      </div>

      <div className="project-workspace-root__catalog-controls">
        <select
          aria-label={text(locale, '范围筛选', 'Scope filter')}
          value={scopeFilter}
          onChange={(event) => setScopeFilter(parseCatalogScopeFilter(event.currentTarget.value))}
        >
          <option value="all">{text(locale, '全部范围', 'All scopes')}</option>
          <option value="workspace">{text(locale, '工作区', 'Workspace')}</option>
          <option value="global-reference">{text(locale, '全局引用', 'Global references')}</option>
        </select>
        <select
          aria-label={text(locale, '排序方式', 'Sort order')}
          value={sort}
          onChange={(event) => setSort(parseCatalogSort(event.currentTarget.value))}
        >
          <option value="recent">{text(locale, '最近更新', 'Recently updated')}</option>
          <option value="name">{text(locale, '名称', 'Name')}</option>
          <option value="type">{text(locale, '类型', 'Type')}</option>
        </select>
        <span className="project-workspace-root__catalog-count">
          {visibleItems.length === catalogItems.length
            ? catalogItems.length
            : `${visibleItems.length}/${catalogItems.length}`}
        </span>
      </div>

      {experimentalCreativeCapabilitiesReady && showReferenceAdd ? (
        <GlobalReferenceAddPanel
          characterItems={composition.availableGlobalCharacters.filter(
            (candidate) =>
              !composition.globalCharacters.some(
                (item) =>
                  projectGlobalObjectKey(item.reference) ===
                  projectGlobalObjectKey(candidate.reference),
              ),
          )}
          disabled={busy}
          locale={locale}
          worldItems={composition.availableGlobalWorlds.filter(
            (candidate) =>
              !composition.globalWorlds.some(
                (item) =>
                  projectGlobalObjectKey(item.reference) ===
                  projectGlobalObjectKey(candidate.reference),
              ),
          )}
          onAdd={(reference) => mutateReference({ kind: 'add', reference })}
        />
      ) : null}

      <div className="project-workspace-root__catalog" data-empty={visibleItems.length === 0}>
        {visibleItems.length === 0 ? (
          <EmptyState
            className="project-workspace-root__empty"
            fill
            icon={<CubeIcon size={20} />}
            title={
              catalogItems.length === 0
                ? text(locale, '暂无创作内容', 'No creative content yet')
                : text(locale, '没有符合条件的内容', 'No matching creative content')
            }
            action={
              catalogItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setKindFilter('all');
                    setScopeFilter('all');
                  }}
                >
                  {text(locale, '清除筛选', 'Clear filters')}
                </button>
              ) : undefined
            }
          />
        ) : null}
        {visibleItems.map((item) => (
          <CreativeCatalogCard
            availableGlobalItems={
              item.kind === 'character'
                ? composition.availableGlobalCharacters
                : item.kind === 'world'
                  ? composition.availableGlobalWorlds
                  : []
            }
            busy={busy}
            experimentalCreativeCapabilitiesReady={experimentalCreativeCapabilitiesReady}
            item={item}
            key={item.identity}
            locale={locale}
            onCopyReference={copyReference}
            onOpenTarget={(target) => void runAction(() => onOpenTarget(target))}
            onRemoveReference={(reference) => mutateReference({ kind: 'remove', reference })}
            onSynchronize={synchronizeTarget}
            onUpdateReference={(previousReference, reference) =>
              mutateReference({ kind: 'update', previousReference, reference })
            }
          />
        ))}
      </div>

      {actionError ? (
        <p className="project-workspace-root__diagnostic" role="alert">
          <WarningIcon size={13} />
          <span>{actionError}</span>
        </p>
      ) : null}
      {composition.diagnostics.map((diagnostic) => (
        <p
          className="project-workspace-root__diagnostic"
          key={`${diagnostic.code}:${diagnostic.message}`}
          role="status"
        >
          <WarningIcon size={13} />
          <span>{diagnostic.message}</span>
        </p>
      ))}
    </section>
  );
}

export function createProjectCreativeCatalogItems(
  workspace: ProjectCreativeWorkspaceProjection,
  content: ProjectContentProjection,
  locale: SupportedLocale,
): readonly ProjectCreativeCatalogItem[] {
  if (workspace.composition.projectId !== content.projectId) {
    throw new Error('Project creative catalog projections belong to different Projects.');
  }
  const composition = workspace.composition;
  const contentCharacters = new Map(
    content.characters.map((item) => [item.characterProjectId, item]),
  );
  const contentWorlds = new Map(content.worlds.map((item) => [item.worldProjectId, item]));
  const items: ProjectCreativeCatalogItem[] = [
    ...composition.content.map((item) => ({
      identity: item.identity,
      kind: 'content' as const,
      scope: 'workspace' as const,
      label: item.label,
      ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
      detailLabel: item.target.documentId,
      statusLabel: item.diagnostic
        ? text(locale, '不可用', 'Unavailable')
        : text(locale, '可用', 'Available'),
      ...(item.diagnostic ? { diagnostic: item.diagnostic } : {}),
      target: item,
    })),
    ...composition.characters.map((item) => {
      const semantic = contentCharacters.get(item.target.characterProjectId);
      return {
        identity: item.identity,
        kind: 'character' as const,
        scope: 'workspace' as const,
        label: item.label,
        ...(item.summary ? { summary: item.summary } : {}),
        ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
        detailLabel: text(locale, '角色卡', 'Character card'),
        statusLabel: availabilityLabel(locale, semantic?.availability, item.diagnostic),
        ...((item.diagnostic ?? semantic?.diagnostic)
          ? { diagnostic: item.diagnostic ?? semantic?.diagnostic }
          : {}),
        target: item,
      };
    }),
    ...composition.worlds.map((item) => {
      const semantic = contentWorlds.get(item.target.worldProjectId);
      return {
        identity: item.identity,
        kind: 'world' as const,
        scope: 'workspace' as const,
        label: item.label,
        ...(item.summary ? { summary: item.summary } : {}),
        ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
        detailLabel: text(locale, '世界卡', 'World card'),
        statusLabel: availabilityLabel(locale, semantic?.availability, item.diagnostic),
        ...((item.diagnostic ?? semantic?.diagnostic)
          ? { diagnostic: item.diagnostic ?? semantic?.diagnostic }
          : {}),
        target: item,
      };
    }),
    ...content.elements.map((item) => ({
      identity: `project-entity:${item.entityId}`,
      kind: 'entity' as const,
      scope: 'workspace' as const,
      label: item.label,
      updatedAt: item.updatedAt,
      detailLabel: entityKindLabel(locale, item.entityKind),
      statusLabel: availabilityLabel(locale, item.availability, item.diagnostic),
      ...(item.diagnostic ? { diagnostic: item.diagnostic } : {}),
    })),
    ...content.candidates.map((item) => ({
      identity: `entity-candidate:${item.candidateId}`,
      kind: 'candidate' as const,
      scope: 'workspace' as const,
      label: item.label,
      ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
      detailLabel: `${entityKindLabel(locale, item.entityKind)} · ${candidateFreshnessLabel(locale, item.freshness)}`,
      statusLabel: candidateFreshnessLabel(locale, item.freshness),
      summary: candidateEvidenceLabel(locale, item.evidenceCount, item.confidence),
    })),
    ...composition.globalCharacters.map((item) =>
      globalReferenceCatalogItem(item, 'character', locale),
    ),
    ...composition.globalWorlds.map((item) => globalReferenceCatalogItem(item, 'world', locale)),
  ];

  const characterIds = new Set(
    composition.characters.map((item) => item.target.characterProjectId),
  );
  for (const item of content.characters) {
    if (characterIds.has(item.characterProjectId)) continue;
    items.push({
      identity: `character-project:${item.characterProjectId}`,
      kind: 'character',
      scope: 'workspace',
      label: item.label ?? item.characterProjectId,
      detailLabel: text(locale, '角色卡', 'Character card'),
      statusLabel: availabilityLabel(locale, item.availability, item.diagnostic),
      ...(item.diagnostic ? { diagnostic: item.diagnostic } : {}),
    });
  }
  const worldIds = new Set(composition.worlds.map((item) => item.target.worldProjectId));
  for (const item of content.worlds) {
    if (worldIds.has(item.worldProjectId)) continue;
    items.push({
      identity: `world-project:${item.worldProjectId}`,
      kind: 'world',
      scope: 'workspace',
      label: item.label ?? item.worldProjectId,
      detailLabel: text(locale, '世界卡', 'World card'),
      statusLabel: availabilityLabel(locale, item.availability, item.diagnostic),
      ...(item.diagnostic ? { diagnostic: item.diagnostic } : {}),
    });
  }
  return items;
}

function globalReferenceCatalogItem(
  item: ProjectGlobalReferenceItem,
  kind: 'character' | 'world',
  locale: SupportedLocale,
): ProjectCreativeCatalogItem {
  return {
    identity: item.identity,
    kind,
    scope: 'global-reference',
    label: item.label,
    versionLabel: item.versionLabel,
    ...(item.summary ? { summary: item.summary } : {}),
    ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
    statusLabel: item.diagnostic
      ? text(locale, '引用不可用', 'Reference unavailable')
      : text(locale, '精确版本引用', 'Exact version reference'),
    ...(item.diagnostic ? { diagnostic: item.diagnostic } : {}),
    reference: item,
  };
}

export function filterAndSortProjectCreativeCatalog(
  items: readonly ProjectCreativeCatalogItem[],
  options: {
    readonly query: string;
    readonly kind: ProjectCreativeCatalogKind | 'all';
    readonly scope: ProjectCreativeCatalogScope | 'all';
    readonly sort: ProjectCreativeCatalogSort;
  },
): readonly ProjectCreativeCatalogItem[] {
  const query = options.query.trim().toLocaleLowerCase();
  return items
    .filter((item) => options.kind === 'all' || item.kind === options.kind)
    .filter((item) => options.scope === 'all' || item.scope === options.scope)
    .filter((item) =>
      [
        item.label,
        item.summary,
        item.detailLabel,
        item.statusLabel,
        item.versionLabel,
        item.diagnostic,
        item.kind,
        item.scope,
      ].some((value) => value?.toLocaleLowerCase().includes(query)),
    )
    .sort((left, right) => compareCatalogItems(left, right, options.sort));
}

export function projectCreativeCatalogKinds(
  items: readonly ProjectCreativeCatalogItem[],
): readonly ProjectCreativeCatalogKind[] {
  return PROJECT_CREATIVE_CATALOG_KIND_ORDER.filter((kind) =>
    items.some((item) => item.kind === kind),
  );
}

function compareCatalogItems(
  left: ProjectCreativeCatalogItem,
  right: ProjectCreativeCatalogItem,
  sort: ProjectCreativeCatalogSort,
): number {
  if (sort === 'recent') {
    if (left.updatedAt && !right.updatedAt) return -1;
    if (!left.updatedAt && right.updatedAt) return 1;
    const recent = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    if (recent !== 0) return recent;
  }
  if (sort === 'type') {
    const kind = left.kind.localeCompare(right.kind);
    if (kind !== 0) return kind;
  }
  return left.label.localeCompare(right.label) || left.identity.localeCompare(right.identity);
}

function CreativeCatalogCard({
  availableGlobalItems,
  busy,
  experimentalCreativeCapabilitiesReady,
  item,
  locale,
  onCopyReference,
  onOpenTarget,
  onRemoveReference,
  onSynchronize,
  onUpdateReference,
}: {
  readonly availableGlobalItems: readonly ProjectGlobalReferenceItem[];
  readonly busy: boolean;
  readonly experimentalCreativeCapabilitiesReady: boolean;
  readonly item: ProjectCreativeCatalogItem;
  readonly locale: SupportedLocale;
  readonly onCopyReference: (
    reference: ProjectGlobalReference,
    label: string,
  ) => Promise<void> | void;
  readonly onOpenTarget: (target: ProjectMixedDomainTargetItem) => void;
  readonly onRemoveReference: (reference: ProjectGlobalReference) => Promise<void> | void;
  readonly onSynchronize: (
    target: ProjectMixedDomainTargetItem,
    conflictChoice?: 'base-on-current' | 'save-as-new',
  ) => Promise<void> | void;
  readonly onUpdateReference: (
    previousReference: ProjectGlobalReference,
    reference: ProjectGlobalReference,
  ) => Promise<void> | void;
}): JSX.Element {
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const target = item.target;
  const reference = item.reference;
  const capabilityReady =
    experimentalCreativeCapabilitiesReady || (item.kind !== 'character' && item.kind !== 'world');
  const alternatives = reference
    ? availableGlobalItems.filter(
        (candidate) =>
          projectGlobalObjectKey(candidate.reference) ===
            projectGlobalObjectKey(reference.reference) &&
          projectGlobalReferenceKey(candidate.reference) !==
            projectGlobalReferenceKey(reference.reference),
      )
    : [];
  const selected = alternatives.find((candidate) => candidate.identity === selectedIdentity);
  const toggleDetailsLabel = detailsOpen
    ? text(locale, `收起“${item.label}”详情`, `Hide details for ${item.label}`)
    : text(locale, `查看“${item.label}”详情`, `View details for ${item.label}`);
  const readOnlyNote =
    !capabilityReady && (item.kind === 'character' || item.kind === 'world')
      ? text(
          locale,
          '该实验能力在发行版本中隐藏；项目记录保持只读且不会被删除。',
          'This experimental capability is hidden in Release; the Project record remains read-only and is not deleted.',
        )
      : catalogReadOnlyNote(item, locale);
  const content = (
    <>
      <span className="project-workspace-root__card-icon" aria-hidden="true">
        {catalogIcon(item.kind)}
      </span>
      <span className="project-workspace-root__card-copy">
        <span className="project-workspace-root__card-title">
          <strong>{item.label}</strong>
          <span className="project-workspace-root__badge">
            {catalogKindLabel(locale, item.kind)}
          </span>
          <span className="project-workspace-root__badge is-scope">
            {item.scope === 'workspace'
              ? text(locale, '工作区', 'Workspace')
              : text(locale, '全局引用', 'Global reference')}
          </span>
        </span>
        {item.summary ? (
          <span className="project-workspace-root__card-summary">{item.summary}</span>
        ) : null}
        <span className="project-workspace-root__card-meta">
          {item.versionLabel ? <span>{item.versionLabel}</span> : null}
          {item.detailLabel ? <span>{item.detailLabel}</span> : null}
          {item.updatedAt ? (
            <time dateTime={item.updatedAt}>{formatCatalogDate(item.updatedAt, locale)}</time>
          ) : null}
          {item.kind === 'candidate' ? (
            <span>{text(locale, '待确认', 'Pending review')}</span>
          ) : null}
        </span>
        {item.diagnostic ? (
          <span className="project-workspace-root__card-diagnostic" role="status">
            <WarningIcon size={12} />
            <span>{item.diagnostic}</span>
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <article
      className="project-workspace-root__card"
      data-creative-kind={item.kind}
      data-creative-scope={item.scope}
      data-owner-identity={item.identity}
    >
      {target && !item.diagnostic && capabilityReady ? (
        <button
          className="project-workspace-root__card-main is-actionable"
          disabled={busy}
          title={item.label}
          type="button"
          onClick={() => onOpenTarget(target)}
        >
          {content}
        </button>
      ) : (
        <button
          aria-controls={detailsId}
          aria-expanded={detailsOpen}
          className="project-workspace-root__card-main is-actionable"
          title={toggleDetailsLabel}
          type="button"
          onClick={() => setDetailsOpen((current) => !current)}
        >
          {content}
        </button>
      )}
      <div className="project-workspace-root__details-toolbar">
        <button
          aria-controls={detailsId}
          aria-expanded={detailsOpen}
          title={toggleDetailsLabel}
          type="button"
          onClick={() => setDetailsOpen((current) => !current)}
        >
          <EyeIcon size={13} />
          <span>
            {text(
              locale,
              detailsOpen ? '收起详情' : '查看详情',
              detailsOpen ? 'Hide details' : 'View details',
            )}
          </span>
        </button>
      </div>
      {detailsOpen ? (
        <section
          aria-label={text(locale, `${item.label}详情`, `${item.label} details`)}
          className="project-workspace-root__card-details"
          id={detailsId}
        >
          {item.summary ? <p>{item.summary}</p> : null}
          <dl>
            {catalogDetailRows(item, locale).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          {readOnlyNote ? (
            <p className="project-workspace-root__card-details-note">{readOnlyNote}</p>
          ) : null}
        </section>
      ) : null}
      {capabilityReady && target && (item.kind === 'character' || item.kind === 'world') ? (
        <div className="project-workspace-root__card-actions">
          {target.synchronization &&
          target.synchronization.currentVersionId !== target.synchronization.lastSyncedVersionId ? (
            <>
              <button
                disabled={busy || Boolean(item.diagnostic)}
                title={text(
                  locale,
                  '基于当前全局版本同步',
                  'Synchronize based on current global version',
                )}
                type="button"
                onClick={() => void onSynchronize(target, 'base-on-current')}
              >
                <RefreshIcon size={13} />
              </button>
              <button
                disabled={busy || Boolean(item.diagnostic)}
                title={text(locale, '另存为新全局对象', 'Save as new global object')}
                type="button"
                onClick={() => void onSynchronize(target, 'save-as-new')}
              >
                <PlusIcon size={13} />
              </button>
            </>
          ) : (
            <button
              disabled={busy || Boolean(item.diagnostic)}
              title={text(locale, '同步到全局', 'Synchronize to global')}
              type="button"
              onClick={() => void onSynchronize(target)}
            >
              <UploadIcon size={13} />
            </button>
          )}
        </div>
      ) : null}
      {capabilityReady && reference ? (
        <div className="project-workspace-root__reference-tools">
          {alternatives.length > 0 ? (
            <select
              aria-label={text(locale, '选择更新版本', 'Select replacement version')}
              disabled={busy || Boolean(item.diagnostic)}
              value={selectedIdentity}
              onChange={(event) => setSelectedIdentity(event.currentTarget.value)}
            >
              <option value="">{text(locale, '选择版本', 'Select version')}</option>
              {alternatives.map((candidate) => (
                <option key={candidate.identity} value={candidate.identity}>
                  {candidate.versionLabel}
                </option>
              ))}
            </select>
          ) : null}
          <div className="project-workspace-root__card-actions">
            <button
              disabled={busy || Boolean(item.diagnostic)}
              title={text(locale, '复制到工作区', 'Copy to Workspace')}
              type="button"
              onClick={() => void onCopyReference(reference.reference, item.label)}
            >
              <CopyIcon size={13} />
            </button>
            <button
              disabled={busy || !selected || Boolean(item.diagnostic)}
              title={text(locale, '更新精确版本引用', 'Update exact version reference')}
              type="button"
              onClick={() =>
                selected && void onUpdateReference(reference.reference, selected.reference)
              }
            >
              <RefreshIcon size={13} />
            </button>
            <button
              disabled={busy}
              title={text(locale, '从项目移除引用', 'Remove reference from Project')}
              type="button"
              onClick={() => void onRemoveReference(reference.reference)}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function GlobalReferenceAddPanel({
  characterItems,
  disabled,
  locale,
  onAdd,
  worldItems,
}: {
  readonly characterItems: readonly ProjectGlobalReferenceItem[];
  readonly disabled: boolean;
  readonly locale: SupportedLocale;
  readonly onAdd: (reference: ProjectGlobalReference) => Promise<void> | void;
  readonly worldItems: readonly ProjectGlobalReferenceItem[];
}): JSX.Element {
  return (
    <section
      className="project-workspace-root__add-panel"
      aria-label={text(locale, '添加全局引用', 'Add global reference')}
    >
      {characterItems.length === 0 && worldItems.length === 0 ? (
        <p>
          {text(
            locale,
            '没有可添加的全局角色或世界版本。',
            'No global Character or World versions are available to add.',
          )}
        </p>
      ) : null}
      <GlobalReferenceAddControl
        disabled={disabled}
        items={characterItems}
        label={text(locale, '角色', 'Character')}
        locale={locale}
        onAdd={onAdd}
      />
      <GlobalReferenceAddControl
        disabled={disabled}
        items={worldItems}
        label={text(locale, '世界', 'World')}
        locale={locale}
        onAdd={onAdd}
      />
    </section>
  );
}

function GlobalReferenceAddControl({
  disabled,
  items,
  label,
  locale,
  onAdd,
}: {
  readonly disabled: boolean;
  readonly items: readonly ProjectGlobalReferenceItem[];
  readonly label: string;
  readonly locale: SupportedLocale;
  readonly onAdd: (reference: ProjectGlobalReference) => Promise<void> | void;
}): JSX.Element | null {
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const firstItem = items[0];
  if (!firstItem) return null;
  const selected = items.find((item) => item.identity === selectedIdentity) ?? firstItem;
  return (
    <div className="project-workspace-root__reference-command">
      <span>{label}</span>
      <select
        aria-label={text(locale, `添加${label}`, `Add ${label}`)}
        disabled={disabled}
        value={selected.identity}
        onChange={(event) => setSelectedIdentity(event.currentTarget.value)}
      >
        {items.map((item) => (
          <option key={item.identity} value={item.identity}>
            {item.label} · {item.versionLabel}
          </option>
        ))}
      </select>
      <button
        disabled={disabled}
        title={text(locale, '添加精确版本引用', 'Add exact version reference')}
        type="button"
        onClick={() => void onAdd(selected.reference)}
      >
        <PlusIcon size={13} />
      </button>
    </div>
  );
}

function catalogIcon(kind: ProjectCreativeCatalogKind): JSX.Element {
  if (kind === 'content') return <FolderIcon size={16} />;
  if (kind === 'character') return <UserIcon size={16} />;
  return <CubeIcon size={16} />;
}

function catalogKindLabel(
  locale: SupportedLocale,
  kind: ProjectCreativeCatalogKind | 'all',
): string {
  const labels = {
    all: ['全部', 'All'],
    content: ['内容', 'Content'],
    character: ['角色', 'Character'],
    world: ['世界', 'World'],
    entity: ['实体', 'Entity'],
    candidate: ['待确认', 'Pending'],
  } as const;
  const label = labels[kind];
  return text(locale, label[0], label[1]);
}

function entityKindLabel(locale: SupportedLocale, kind: string): string {
  const labels: Readonly<Record<string, readonly [string, string]>> = {
    character: ['角色', 'Character'],
    scene: ['场景', 'Scene'],
    object: ['物件', 'Object'],
    location: ['地点', 'Location'],
    style: ['风格', 'Style'],
  };
  const label = labels[kind];
  return label ? text(locale, label[0], label[1]) : kind;
}

function candidateFreshnessLabel(locale: SupportedLocale, freshness: string): string {
  const labels: Readonly<Record<string, readonly [string, string]>> = {
    fresh: ['新发现', 'Fresh'],
    building: ['分析中', 'Building'],
    partial: ['部分结果', 'Partial'],
    stale: ['需更新', 'Stale'],
    failed: ['分析失败', 'Failed'],
  };
  const label = labels[freshness];
  return label ? text(locale, label[0], label[1]) : freshness;
}

function candidateEvidenceLabel(
  locale: SupportedLocale,
  evidenceCount: number,
  confidence: number | undefined,
): string {
  const evidence = text(locale, `${evidenceCount} 条来源证据`, `${evidenceCount} evidence sources`);
  return confidence === undefined
    ? evidence
    : `${evidence} · ${text(locale, '置信度', 'Confidence')} ${Math.round(confidence * 100)}%`;
}

function availabilityLabel(
  locale: SupportedLocale,
  availability: string | undefined,
  diagnostic: string | undefined,
): string {
  if (diagnostic) return text(locale, '需处理', 'Needs attention');
  if (availability === 'needs-attention') return text(locale, '需处理', 'Needs attention');
  if (availability === 'deprecated') return text(locale, '已弃用', 'Deprecated');
  return text(locale, '可用', 'Available');
}

function catalogDetailRows(
  item: ProjectCreativeCatalogItem,
  locale: SupportedLocale,
): readonly { readonly label: string; readonly value: string }[] {
  return [
    {
      label: text(locale, '类型', 'Type'),
      value: catalogKindLabel(locale, item.kind),
    },
    {
      label: text(locale, '范围', 'Scope'),
      value:
        item.scope === 'workspace'
          ? text(locale, '工作区', 'Workspace')
          : text(locale, '全局引用', 'Global reference'),
    },
    ...(item.statusLabel
      ? [{ label: text(locale, '状态', 'Status'), value: item.statusLabel }]
      : []),
    ...(item.detailLabel
      ? [{ label: text(locale, '分类', 'Category'), value: item.detailLabel }]
      : []),
    ...(item.versionLabel
      ? [{ label: text(locale, '精确版本', 'Exact version'), value: item.versionLabel }]
      : []),
    ...(item.updatedAt
      ? [
          {
            label: text(locale, '最近更新', 'Last updated'),
            value: formatCatalogDateTime(item.updatedAt, locale),
          },
        ]
      : []),
    {
      label: text(locale, '标识', 'Identity'),
      value: item.identity,
    },
  ];
}

function catalogReadOnlyNote(
  item: ProjectCreativeCatalogItem,
  locale: SupportedLocale,
): string | undefined {
  if (item.scope === 'global-reference') {
    return text(
      locale,
      '这是精确版本引用；复制到工作区后才能编辑。',
      'This is an exact version reference. Copy it to the Workspace before editing.',
    );
  }
  if (item.kind === 'candidate') {
    return text(
      locale,
      '候选在此只读展示；确认与合并仍由实体所有者处理。',
      'This candidate is read-only here; confirmation and merging remain Entity-owned.',
    );
  }
  if (item.kind === 'entity') {
    return text(
      locale,
      '实体在此只读展示；编辑仍由实体所有者处理。',
      'This Entity is read-only here; editing remains Entity-owned.',
    );
  }
  if (!item.target) {
    return text(
      locale,
      '当前记录没有可用的编辑目标。',
      'This record does not currently have an available editing target.',
    );
  }
  return undefined;
}

function parseCatalogScopeFilter(value: string): ProjectCreativeCatalogScope | 'all' {
  if (value === 'all' || value === 'workspace' || value === 'global-reference') return value;
  throw new Error(`Unknown Project creative catalog scope: ${value}`);
}

function parseCatalogSort(value: string): ProjectCreativeCatalogSort {
  if (value === 'recent' || value === 'name' || value === 'type') return value;
  throw new Error(`Unknown Project creative catalog sort: ${value}`);
}

function formatCatalogDate(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function formatCatalogDateTime(value: string, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.startsWith("Error invoking remote method '")) return message;
  const boundary = message.indexOf("':");
  if (boundary < 0) return message;
  const detail = message.slice(boundary + 2).trimStart();
  return detail.startsWith('Error:') ? detail.slice('Error:'.length).trimStart() : detail;
}

function text(locale: SupportedLocale, chinese: string, english: string): string {
  return locale === 'zh-cn' ? chinese : english;
}
