import type {
  ProjectCreativeWorkspaceBinding,
  ProjectCreativeWorkspaceHostPort,
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
  FolderIcon,
  LoadingIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  WarningIcon,
} from '@neko/ui';
import type { SupportedLocale } from '@neko/ui/i18n';
import { useEffect, useMemo, useState } from 'react';

type ProjectWorkspaceState =
  | { readonly kind: 'loading'; readonly projectId: string }
  | {
      readonly kind: 'ready';
      readonly projectId: string;
      readonly projection: ProjectCreativeWorkspaceProjection;
    }
  | { readonly kind: 'failed'; readonly projectId: string; readonly message: string };

export interface ProjectWorkspaceRootProps {
  readonly binding: ProjectCreativeWorkspaceBinding;
  readonly host: ProjectCreativeWorkspaceHostPort;
  readonly locale: SupportedLocale;
  readonly onOpenTarget: (item: ProjectMixedDomainTargetItem) => Promise<void> | void;
  readonly windowId: string;
}

export function ProjectWorkspaceRoot({
  binding,
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
  const [state, setState] = useState<ProjectWorkspaceState>({
    kind: 'loading',
    projectId: binding.projectId,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading', projectId: binding.projectId });
    setActionError(undefined);
    void host.getCreativeWorkspace(windowId, workspaceBinding).then(
      (result) => {
        if (cancelled) return;
        if (
          result.projectId !== binding.projectId ||
          result.projection.composition.projectId !== binding.projectId
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
        setState({ kind: 'ready', projectId: binding.projectId, projection: result.projection });
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
      setState({ kind: 'ready', projectId: binding.projectId, projection: result.projection });
    });
  };
  const mutateObject = async (
    mutation: Parameters<typeof host.mutateCreativeWorkspaceObject>[2],
  ): Promise<void> => {
    await runAction(async () => {
      const result = await host.mutateCreativeWorkspaceObject(windowId, workspaceBinding, mutation);
      setState({ kind: 'ready', projectId: binding.projectId, projection: result.projection });
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

  const composition = state.projection.composition;
  return (
    <section className="project-workspace-root" data-project-workspace-root="true">
      <WorkspaceTargetGroup
        icon={<FolderIcon size={14} />}
        items={composition.content}
        label={text(locale, '内容', 'Content')}
        locale={locale}
        disabled={busy}
        onOpenTarget={(item) => void runAction(() => onOpenTarget(item))}
      />
      <WorkspaceTargetGroup
        icon={<UserIcon size={14} />}
        items={composition.characters}
        label={text(locale, '工作区角色', 'Workspace Characters')}
        locale={locale}
        disabled={busy}
        onOpenTarget={(item) => void runAction(() => onOpenTarget(item))}
        onSynchronize={(item, conflictChoice) =>
          item.target.kind === 'character-project'
            ? mutateObject({
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
              })
            : Promise.resolve()
        }
      />
      <GlobalReferenceGroup
        availableItems={composition.availableGlobalCharacters}
        icon={<UserIcon size={14} />}
        items={composition.globalCharacters}
        label={text(locale, '全局角色', 'Global Characters')}
        locale={locale}
        disabled={busy}
        onAdd={(reference) => mutateReference({ kind: 'add', reference })}
        onRemove={(reference) => mutateReference({ kind: 'remove', reference })}
        onUpdate={(previousReference, reference) =>
          mutateReference({ kind: 'update', previousReference, reference })
        }
        onCopy={(reference, label) => {
          if (reference.kind !== 'character-version') {
            throw new Error('Character copy requires an exact CharacterVersion reference.');
          }
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
        }}
      />
      <WorkspaceTargetGroup
        icon={<CubeIcon size={14} />}
        items={composition.worlds}
        label={text(locale, '工作区世界', 'Workspace Worlds')}
        locale={locale}
        disabled={busy}
        onOpenTarget={(item) => void runAction(() => onOpenTarget(item))}
        onSynchronize={(item, conflictChoice) =>
          item.target.kind === 'world-project'
            ? mutateObject({
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
              })
            : Promise.resolve()
        }
      />
      <GlobalReferenceGroup
        availableItems={composition.availableGlobalWorlds}
        icon={<CubeIcon size={14} />}
        items={composition.globalWorlds}
        label={text(locale, '全局世界', 'Global Worlds')}
        locale={locale}
        disabled={busy}
        onAdd={(reference) => mutateReference({ kind: 'add', reference })}
        onRemove={(reference) => mutateReference({ kind: 'remove', reference })}
        onUpdate={(previousReference, reference) =>
          mutateReference({ kind: 'update', previousReference, reference })
        }
        onCopy={(reference) => {
          if (reference.kind !== 'world-version') {
            throw new Error('World copy requires an exact WorldVersion reference.');
          }
          return mutateObject({
            kind: 'copy-world-reference',
            reference,
            worldProjectId: `world-project:${globalThis.crypto.randomUUID()}`,
          });
        }}
      />

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

function WorkspaceTargetGroup({
  disabled,
  icon,
  items,
  label,
  locale,
  onOpenTarget,
  onSynchronize,
}: {
  readonly disabled: boolean;
  readonly icon: JSX.Element;
  readonly items: readonly ProjectMixedDomainTargetItem[];
  readonly label: string;
  readonly locale: SupportedLocale;
  readonly onOpenTarget: (item: ProjectMixedDomainTargetItem) => void;
  readonly onSynchronize?: (
    item: ProjectMixedDomainTargetItem,
    conflictChoice?: 'base-on-current' | 'save-as-new',
  ) => Promise<void> | void;
}): JSX.Element {
  return (
    <section className="project-workspace-root__section" data-project-workspace-group={label}>
      <header>
        {icon}
        <h3>{label}</h3>
        <span>{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p>—</p>
      ) : (
        <div className="project-workspace-root__targets">
          {items.map((item) => (
            <div className="project-workspace-root__reference" key={item.identity}>
              <button
                disabled={disabled || item.diagnostic !== undefined}
                title={item.diagnostic ?? item.label}
                type="button"
                onClick={() => onOpenTarget(item)}
              >
                <span>{item.label}</span>
                {item.diagnostic ? <small>{item.diagnostic}</small> : null}
              </button>
              {onSynchronize ? (
                item.synchronization &&
                item.synchronization.currentVersionId !==
                  item.synchronization.lastSyncedVersionId ? (
                  <>
                    <button
                      disabled={disabled || item.diagnostic !== undefined}
                      title={text(
                        locale,
                        '基于当前全局版本同步',
                        'Synchronize based on current global version',
                      )}
                      type="button"
                      onClick={() => void onSynchronize(item, 'base-on-current')}
                    >
                      <RefreshIcon size={14} />
                    </button>
                    <button
                      disabled={disabled || item.diagnostic !== undefined}
                      title={text(locale, '另存为新全局对象', 'Save as new global object')}
                      type="button"
                      onClick={() => void onSynchronize(item, 'save-as-new')}
                    >
                      <PlusIcon size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    disabled={disabled || item.diagnostic !== undefined}
                    title={text(locale, '同步到全局', 'Synchronize to global')}
                    type="button"
                    onClick={() => void onSynchronize(item)}
                  >
                    <UploadIcon size={14} />
                  </button>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GlobalReferenceGroup({
  availableItems,
  disabled,
  icon,
  items,
  label,
  locale,
  onAdd,
  onCopy,
  onRemove,
  onUpdate,
}: {
  readonly availableItems: readonly ProjectGlobalReferenceItem[];
  readonly disabled: boolean;
  readonly icon: JSX.Element;
  readonly items: readonly ProjectGlobalReferenceItem[];
  readonly label: string;
  readonly locale: SupportedLocale;
  readonly onAdd: (reference: ProjectGlobalReference) => Promise<void> | void;
  readonly onCopy: (
    reference: ProjectGlobalReferenceItem['reference'],
    label: string,
  ) => Promise<void> | void;
  readonly onRemove: (reference: ProjectGlobalReference) => Promise<void> | void;
  readonly onUpdate: (
    previousReference: ProjectGlobalReference,
    reference: ProjectGlobalReference,
  ) => Promise<void> | void;
}): JSX.Element {
  const referencedObjects = new Set(items.map((item) => projectGlobalObjectKey(item.reference)));
  const addable = availableItems.filter(
    (item) => !referencedObjects.has(projectGlobalObjectKey(item.reference)),
  );
  return (
    <section className="project-workspace-root__section" data-project-workspace-group={label}>
      <header>
        {icon}
        <h3>{label}</h3>
        <span>{items.length}</span>
      </header>
      <GlobalReferenceAddControl
        disabled={disabled}
        items={addable}
        label={label}
        locale={locale}
        onAdd={onAdd}
      />
      {items.length === 0 ? (
        <p>—</p>
      ) : (
        <div className="project-workspace-root__targets">
          {items.map((item) => (
            <GlobalReferenceRow
              availableItems={availableItems.filter(
                (candidate) =>
                  projectGlobalObjectKey(candidate.reference) ===
                    projectGlobalObjectKey(item.reference) &&
                  projectGlobalReferenceKey(candidate.reference) !==
                    projectGlobalReferenceKey(item.reference),
              )}
              disabled={disabled}
              item={item}
              key={item.identity}
              locale={locale}
              onRemove={onRemove}
              onUpdate={onUpdate}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
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
      <select
        aria-label={text(locale, `添加${label}`, `Add ${label}`)}
        disabled={disabled}
        value={selected?.identity ?? ''}
        onChange={(event) => setSelectedIdentity(event.currentTarget.value)}
      >
        {items.map((item) => (
          <option key={item.identity} value={item.identity}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        disabled={disabled}
        title={text(locale, '添加精确版本引用', 'Add exact version reference')}
        type="button"
        onClick={() => void onAdd(selected.reference)}
      >
        <PlusIcon size={14} />
      </button>
    </div>
  );
}

function GlobalReferenceRow({
  availableItems,
  disabled,
  item,
  locale,
  onRemove,
  onCopy,
  onUpdate,
}: {
  readonly availableItems: readonly ProjectGlobalReferenceItem[];
  readonly disabled: boolean;
  readonly item: ProjectGlobalReferenceItem;
  readonly locale: SupportedLocale;
  readonly onRemove: (reference: ProjectGlobalReference) => Promise<void> | void;
  readonly onCopy: (
    reference: ProjectGlobalReferenceItem['reference'],
    label: string,
  ) => Promise<void> | void;
  readonly onUpdate: (
    previousReference: ProjectGlobalReference,
    reference: ProjectGlobalReference,
  ) => Promise<void> | void;
}): JSX.Element {
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const selected = availableItems.find((candidate) => candidate.identity === selectedIdentity);
  return (
    <div className="project-workspace-root__reference">
      <span>{item.label}</span>
      {item.diagnostic ? <small>{item.diagnostic}</small> : null}
      {availableItems.length > 0 ? (
        <select
          aria-label={text(locale, '选择更新版本', 'Select replacement version')}
          disabled={disabled || item.diagnostic !== undefined}
          value={selectedIdentity}
          onChange={(event) => setSelectedIdentity(event.currentTarget.value)}
        >
          <option value="">{text(locale, '选择版本', 'Select version')}</option>
          {availableItems.map((candidate) => (
            <option key={candidate.identity} value={candidate.identity}>
              {candidate.label}
            </option>
          ))}
        </select>
      ) : null}
      <div className="project-workspace-root__reference-actions">
        <button
          disabled={disabled || item.diagnostic !== undefined}
          title={text(locale, '复制到工作区', 'Copy to Workspace')}
          type="button"
          onClick={() => onCopy(item.reference, item.label)}
        >
          <CopyIcon size={14} />
        </button>
        <button
          disabled={disabled || !selected || item.diagnostic !== undefined}
          title={text(locale, '更新精确版本引用', 'Update exact version reference')}
          type="button"
          onClick={() => selected && onUpdate(item.reference, selected.reference)}
        >
          <RefreshIcon size={14} />
        </button>
        <button
          disabled={disabled}
          title={text(locale, '从项目移除引用', 'Remove reference from Project')}
          type="button"
          onClick={() => onRemove(item.reference)}
        >
          <TrashIcon size={14} />
        </button>
      </div>
    </div>
  );
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
