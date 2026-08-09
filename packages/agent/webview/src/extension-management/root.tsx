import { PackageIcon, PlusIcon, SearchIcon, TrashIcon, WarningIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { EmptyState, Switch } from '@neko/ui/primitives';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentExtensionCatalogItem } from '@neko/agent-contracts';
import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementRuntime,
  AgentManagedSkillItem,
} from '@neko/agent-contracts/extension-management';

export function AgentExtensionManagementRoot({
  confirmAction,
  interactive,
  runtime,
}: {
  readonly confirmAction: (message: string) => boolean | Promise<boolean>;
  readonly interactive: boolean;
  readonly runtime: AgentExtensionManagementRuntime;
}): JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'skills' | 'extensions'>('skills');
  const [query, setQuery] = useState('');
  const [refreshRequestId, setRefreshRequestId] = useState('initial');
  const [projection, setProjection] = useState<AgentExtensionManagementProjection>();
  const [error, setError] = useState<string>();
  const [operationKey, setOperationKey] = useState<string>();

  useEffect(() => {
    if (!interactive) return;
    let active = true;
    setError(undefined);
    void runtime.getSnapshot().then(
      (next) => {
        if (active) setProjection(next);
      },
      (reason: unknown) => {
        if (active) setError(describeError(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [interactive, refreshRequestId, runtime]);

  const skills = useMemo(
    () => searchAndOrderAgentSkills(projection?.skills ?? [], query),
    [projection?.skills, query],
  );
  const extensions = useMemo(
    () => searchAndOrderAgentExtensions(projection?.extensions ?? [], query),
    [projection?.extensions, query],
  );
  const runMutation = useCallback(
    async (key: string, operation: () => Promise<void>): Promise<void> => {
      if (operationKey) return;
      setOperationKey(key);
      setError(undefined);
      try {
        await operation();
        setRefreshRequestId(crypto.randomUUID());
      } catch (reason: unknown) {
        setError(describeError(reason));
      } finally {
        setOperationKey(undefined);
      }
    },
    [operationKey],
  );
  const issueCount =
    (projection?.skillDiscovery.diagnostics.reduce((total, item) => total + item.count, 0) ?? 0) +
    (projection?.skillDiscovery.duplicateCount ?? 0) +
    (projection?.extensionDiscovery.diagnostics.reduce((total, item) => total + item.count, 0) ??
      0);

  return (
    <section className="agent-extension-management-root">
      <header className="management-surface-header">
        <div>
          <p className="section-label">{t('home.capabilities.eyebrow')}</p>
          <h2>{t('home.capabilities')}</h2>
          <p>{t('home.capabilities.description')}</p>
        </div>
        <div className="management-surface-actions">
          <button
            type="button"
            disabled={!interactive || !projection || operationKey !== undefined}
            onClick={() => {
              void runMutation('refresh', () => runtime.refreshMarketplaces());
            }}
          >
            {t('home.capabilities.refresh')}
          </button>
          {tab === 'skills' ? (
            <button
              type="button"
              disabled={!interactive || !projection || operationKey !== undefined}
              onClick={() => {
                void runMutation('skill-install', () => runtime.installPersonalSkill());
              }}
            >
              <PlusIcon size={14} />
              {t('home.capabilities.addSkill')}
            </button>
          ) : null}
        </div>
      </header>
      <div className="management-surface-toolbar">
        <label className="management-search-field">
          <SearchIcon size={16} />
          <input
            aria-label={t('home.capabilities.search')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <div className="management-segmented-control" aria-label={t('home.capabilities.tabs')}>
          <button type="button" aria-pressed={tab === 'skills'} onClick={() => setTab('skills')}>
            {t('home.capabilities.skills')}
          </button>
          <button
            type="button"
            aria-pressed={tab === 'extensions'}
            onClick={() => setTab('extensions')}
          >
            {t('home.capabilities.extensions')}
          </button>
        </div>
      </div>
      {error ? (
        <div className="management-surface-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{error}</span>
        </div>
      ) : issueCount > 0 ? (
        <div className="management-surface-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{t('home.capabilities.discoveryIssues', { count: issueCount })}</span>
        </div>
      ) : null}
      <div
        className="management-surface-list"
        data-empty={tab === 'skills' ? skills.length === 0 : extensions.length === 0}
      >
        {(tab === 'skills' ? skills.length === 0 : extensions.length === 0) ? (
          <EmptyState
            fill
            icon={<PackageIcon size={24} />}
            title={t(
              tab === 'skills' ? 'home.capabilities.noSkills' : 'home.capabilities.noExtensions',
            )}
          />
        ) : null}
        {(tab === 'skills'
          ? skills.map((item) => ({ kind: 'skill' as const, item }))
          : extensions.map((item) => ({ kind: 'extension' as const, item }))
        ).map((entry) => {
          const skill = entry.kind === 'skill' ? entry.item : undefined;
          const extension = entry.kind === 'extension' ? entry.item : undefined;
          const item = entry.item;
          return (
            <article className="management-surface-row" key={item.id}>
              <span className="management-surface-icon">
                {extension?.iconDataUrl ? (
                  <img alt="" src={extension.iconDataUrl} />
                ) : (
                  <PackageIcon size={18} />
                )}
              </span>
              <span className="management-surface-copy">
                <strong>{skill?.name ?? extension?.displayName}</strong>
                <small>{skill?.description || extension?.description || item.id}</small>
                {extension ? (
                  <small>
                    {t(`home.capabilities.agentStatus.${extension.agentStatus}`)}
                    {extension.declaredPermissions.length > 0
                      ? ` · ${t('home.capabilities.permissions', {
                          permissions: extension.declaredPermissions.join(', '),
                        })}`
                      : ''}
                  </small>
                ) : null}
              </span>
              <span className="management-surface-row-actions">
                {extension?.canInstall ? (
                  <button
                    type="button"
                    disabled={!projection || operationKey !== undefined}
                    onClick={() => {
                      void Promise.resolve(
                        confirmAction(
                          t('home.capabilities.confirmInstallPlugin', {
                            name: extension.displayName,
                          }),
                        ),
                      ).then((confirmed) => {
                        if (confirmed) {
                          void runMutation(`install:${extension.id}`, () =>
                            runtime.installPlugin(extension.id),
                          );
                        }
                      });
                    }}
                  >
                    <PlusIcon size={13} />
                  </button>
                ) : null}
                {extension?.installed ? (
                  <Switch
                    aria-label={t('home.capabilities.enablement', {
                      name: extension.displayName,
                    })}
                    checked={extension.enabled}
                    disabled={
                      !projection ||
                      operationKey !== undefined ||
                      (!extension.canEnable && !extension.canDisable)
                    }
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        void runMutation(`disable:${extension.id}`, () =>
                          runtime.disablePlugin(extension.id),
                        );
                        return;
                      }
                      void Promise.resolve(
                        confirmAction(
                          t('home.capabilities.confirmEnablePlugin', {
                            name: extension.displayName,
                            permissions:
                              extension.declaredPermissions.join(', ') ||
                              t('home.capabilities.permissions.none'),
                          }),
                        ),
                      ).then((confirmed) => {
                        if (confirmed) {
                          void runMutation(`enable:${extension.id}`, () =>
                            runtime.enablePlugin(extension.id),
                          );
                        }
                      });
                    }}
                  />
                ) : null}
                {skill?.canRemove || extension?.canRemove ? (
                  <button
                    type="button"
                    disabled={!projection || operationKey !== undefined}
                    onClick={() => {
                      const name = skill?.name ?? extension?.displayName ?? item.id;
                      void Promise.resolve(confirmAction(name)).then((confirmed) => {
                        if (!confirmed) return;
                        void runMutation(`remove:${item.id}`, () => {
                          if (skill) {
                            return runtime.removePersonalSkill(skill.managementId);
                          }
                          if (!extension) throw new Error('Extension management item is invalid.');
                          return runtime.removePlugin(extension.id);
                        });
                      });
                    }}
                  >
                    <TrashIcon size={13} />
                  </button>
                ) : null}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function searchAndOrderAgentSkills(
  skills: readonly AgentManagedSkillItem[],
  query: string,
): readonly AgentManagedSkillItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  return [...skills]
    .filter((item) =>
      `${item.name} ${item.description} ${item.source}`.toLocaleLowerCase().includes(normalized),
    )
    .sort((left, right) => {
      if (left.source !== right.source) return left.source === 'personal' ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

export function searchAndOrderAgentExtensions(
  extensions: readonly AgentExtensionCatalogItem[],
  query: string,
): readonly AgentExtensionCatalogItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  return [...extensions]
    .filter((item) =>
      [item.id, item.displayName, item.description, item.developer, item.marketplace]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized),
    )
    .sort((left, right) => {
      if (left.installed !== right.installed) return left.installed ? -1 : 1;
      return left.displayName.localeCompare(right.displayName);
    });
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
