import {
  GridIcon,
  LayersIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { EmptyState, Switch } from '@neko/ui/primitives';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgentExtensionCatalogItem } from '@neko/agent-contracts';
import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementRuntime,
  AgentManagedSkillItem,
} from '@neko/agent-contracts/extension-management';

export type AgentExtensionManagementTab = 'skills' | 'extensions';
export type AgentExtensionManagementView = 'grid' | 'list';

export interface AgentExtensionManagementDetailRenderInput {
  readonly content: ReactNode;
  readonly selectedItemId: string | undefined;
  readonly tab: AgentExtensionManagementTab;
}

export function AgentExtensionManagementRoot({
  confirmAction,
  interactive,
  onDetailVisibilityChange,
  renderDetail,
  runtime,
}: {
  readonly confirmAction: (message: string) => boolean | Promise<boolean>;
  readonly interactive: boolean;
  readonly onDetailVisibilityChange?: (visible: boolean) => void;
  readonly renderDetail?: (input: AgentExtensionManagementDetailRenderInput) => ReactNode;
  readonly runtime: AgentExtensionManagementRuntime;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const [tab, setTab] = useState<AgentExtensionManagementTab>('skills');
  const [view, setView] = useState<AgentExtensionManagementView>('grid');
  const [query, setQuery] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string>();
  const [selectedExtensionId, setSelectedExtensionId] = useState<string>();
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
      () => {
        if (active) setError(t('home.capabilities.operationFailed'));
      },
    );
    return () => {
      active = false;
    };
  }, [interactive, refreshRequestId, runtime, t]);

  useEffect(() => {
    const skills = projection?.skills ?? [];
    setSelectedSkillId((current) =>
      current && skills.some((item) => item.id === current) ? current : undefined,
    );
    const extensions = projection?.extensions ?? [];
    setSelectedExtensionId((current) =>
      current && extensions.some((item) => item.id === current) ? current : undefined,
    );
  }, [projection?.extensions, projection?.skills]);

  const skills = useMemo(
    () => searchAndOrderAgentSkills(projection?.skills ?? [], query),
    [projection?.skills, query],
  );
  const extensions = useMemo(
    () => searchAndOrderAgentExtensions(projection?.extensions ?? [], query, locale),
    [locale, projection?.extensions, query],
  );
  const selectedSkill = projection?.skills.find((item) => item.id === selectedSkillId);
  const selectedExtension = projection?.extensions.find((item) => item.id === selectedExtensionId);
  const selectedItem = tab === 'skills' ? selectedSkill : selectedExtension;
  const detailVisible = selectedItem !== undefined;

  useEffect(() => {
    onDetailVisibilityChange?.(detailVisible);
  }, [detailVisible, onDetailVisibilityChange]);

  useEffect(
    () => () => {
      onDetailVisibilityChange?.(false);
    },
    [onDetailVisibilityChange],
  );

  const runMutation = useCallback(
    async (key: string, operation: () => Promise<void>): Promise<void> => {
      if (operationKey) return;
      setOperationKey(key);
      setError(undefined);
      try {
        await operation();
        setRefreshRequestId(crypto.randomUUID());
      } catch {
        setError(t('home.capabilities.operationFailed'));
      } finally {
        setOperationKey(undefined);
      }
    },
    [operationKey, t],
  );
  const requestExtensionEnablementChange = (
    extension: AgentExtensionCatalogItem,
    checked: boolean,
  ): void => {
    if (!checked) {
      void runMutation(`disable:${extension.id}`, () => runtime.disablePlugin(extension.id));
      return;
    }
    void Promise.resolve(
      confirmAction(
        t('home.capabilities.confirmEnablePlugin', {
          name: extension.displayName,
        }),
      ),
    ).then((confirmed) => {
      if (confirmed) {
        void runMutation(`enable:${extension.id}`, () => runtime.enablePlugin(extension.id));
      }
    });
  };
  const issueCount =
    (projection?.skillDiscovery.diagnostics.reduce((total, item) => total + item.count, 0) ?? 0) +
    (projection?.skillDiscovery.duplicateCount ?? 0) +
    (projection?.extensionDiscovery.diagnostics.reduce((total, item) => total + item.count, 0) ??
      0);
  const visibleEntries =
    tab === 'skills'
      ? skills.map((item) => ({ kind: 'skill' as const, item }))
      : extensions.map((item) => ({ kind: 'extension' as const, item }));
  const selectedItemId = selectedItem?.id;
  const detail = selectedItem ? (
    <AgentExtensionConfigurationRoot
      confirmAction={confirmAction}
      interactive={interactive}
      operationKey={operationKey}
      runMutation={runMutation}
      runtime={runtime}
      selectedExtension={tab === 'extensions' ? selectedExtension : undefined}
      selectedSkill={tab === 'skills' ? selectedSkill : undefined}
      tab={tab}
    />
  ) : undefined;

  return (
    <>
      <section className="agent-extension-management-root" data-catalog-view={view}>
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
              onClick={() => void runMutation('refresh', () => runtime.rescanSources())}
            >
              {t('home.capabilities.refresh')}
            </button>
            {tab === 'skills' ? (
              <button
                type="button"
                disabled={!interactive || !projection || operationKey !== undefined}
                onClick={() =>
                  void runMutation('skill-install', () => runtime.installPersonalSkill())
                }
              >
                <PlusIcon size={14} />
                <span>{t('home.capabilities.addSkill')}</span>
              </button>
            ) : (
              <button
                type="button"
                data-local-plugin-install="true"
                disabled={!interactive || !projection || operationKey !== undefined}
                onClick={() =>
                  void runMutation('plugin-install', () => runtime.installLocalPlugin())
                }
              >
                <PlusIcon size={14} />
                <span>{t('home.capabilities.addLocalPlugin')}</span>
              </button>
            )}
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
            <button
              type="button"
              aria-pressed={tab === 'skills'}
              data-extension-catalog-tab="skills"
              onClick={() => setTab('skills')}
            >
              {t('home.capabilities.skills')}
            </button>
            <button
              type="button"
              aria-pressed={tab === 'extensions'}
              data-extension-catalog-tab="extensions"
              onClick={() => setTab('extensions')}
            >
              {t('home.capabilities.extensions')}
            </button>
          </div>
          <button
            type="button"
            aria-label={t('home.capabilities.view.grid')}
            aria-pressed={view === 'grid'}
            data-catalog-view-control="grid"
            title={t('home.capabilities.view.grid')}
            onClick={() => setView('grid')}
          >
            <GridIcon size={15} />
          </button>
          <button
            type="button"
            aria-label={t('home.capabilities.view.list')}
            aria-pressed={view === 'list'}
            data-catalog-view-control="list"
            title={t('home.capabilities.view.list')}
            onClick={() => setView('list')}
          >
            <LayersIcon size={15} />
          </button>
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
          aria-label={t(
            tab === 'skills' ? 'home.capabilities.skills' : 'home.capabilities.extensions',
          )}
          className={`management-surface-list is-${view}`}
          data-empty={visibleEntries.length === 0}
          role="list"
        >
          {visibleEntries.length === 0 ? (
            <EmptyState
              fill
              icon={<PackageIcon size={24} />}
              title={t(
                tab === 'skills' ? 'home.capabilities.noSkills' : 'home.capabilities.noExtensions',
              )}
            />
          ) : null}
          {visibleEntries.map((entry) => {
            const selected = entry.item.id === selectedItemId;
            const name = entry.kind === 'skill' ? entry.item.name : entry.item.displayName;
            const description =
              entry.kind === 'skill'
                ? entry.item.description
                : resolveAgentExtensionDescription(entry.item, locale);
            return (
              <article
                aria-label={name}
                className="management-surface-row agent-extension-catalog-row"
                data-selected={selected}
                data-extension-card-id={entry.kind === 'extension' ? entry.item.id : undefined}
                key={entry.item.id}
                role="listitem"
              >
                <button
                  type="button"
                  aria-expanded={selected}
                  className="management-surface-row__select"
                  onClick={() => {
                    if (entry.kind === 'skill') setSelectedSkillId(entry.item.id);
                    else setSelectedExtensionId(entry.item.id);
                  }}
                >
                  <span className="management-surface-icon">
                    {entry.kind === 'extension' && entry.item.iconDataUrl ? (
                      <img alt="" src={entry.item.iconDataUrl} />
                    ) : (
                      <PackageIcon size={18} />
                    )}
                  </span>
                  <span className="management-surface-copy">
                    <strong>{name}</strong>
                    <small>{description || entry.item.id}</small>
                    <small>
                      {entry.kind === 'skill'
                        ? t(`home.capabilities.source.${entry.item.source}`)
                        : `${entry.item.version} · ${t(
                            `home.capabilities.agentStatus.${entry.item.agentStatus}`,
                          )}`}
                    </small>
                  </span>
                </button>
                {entry.kind === 'extension' ? (
                  <span className="management-surface-row-actions">
                    <Switch
                      aria-label={t('home.capabilities.enablement', {
                        name: entry.item.displayName,
                      })}
                      checked={entry.item.enabled}
                      className="extension-catalog-enablement"
                      disabled={
                        !interactive ||
                        operationKey !== undefined ||
                        (entry.item.enabled ? !entry.item.canDisable : !entry.item.canEnable)
                      }
                      id={`extension-enablement:${entry.item.id}`}
                      onCheckedChange={(checked) =>
                        requestExtensionEnablementChange(entry.item, checked)
                      }
                    />
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      {detail && selectedItemId
        ? renderDetail
          ? renderDetail({ content: detail, selectedItemId, tab })
          : detail
        : null}
    </>
  );
}

function AgentExtensionConfigurationRoot({
  confirmAction,
  interactive,
  operationKey,
  runMutation,
  runtime,
  selectedExtension,
  selectedSkill,
  tab,
}: {
  readonly confirmAction: (message: string) => boolean | Promise<boolean>;
  readonly interactive: boolean;
  readonly operationKey: string | undefined;
  readonly runMutation: (key: string, operation: () => Promise<void>) => Promise<void>;
  readonly runtime: AgentExtensionManagementRuntime;
  readonly selectedExtension: AgentExtensionCatalogItem | undefined;
  readonly selectedSkill: AgentManagedSkillItem | undefined;
  readonly tab: AgentExtensionManagementTab;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const item = tab === 'skills' ? selectedSkill : selectedExtension;
  if (!item) {
    throw new Error('Extension configuration requires an exact selected catalog item.');
  }

  const name = selectedSkill?.name ?? selectedExtension?.displayName ?? item.id;
  const description = selectedExtension
    ? resolveAgentExtensionDescription(selectedExtension, locale)
    : item.description;
  const mutationsDisabled = !interactive || operationKey !== undefined;
  return (
    <section className="agent-extension-configuration-root" data-configuration-kind={tab}>
      <header className="extension-configuration-header">
        <span className="management-surface-icon">
          {selectedExtension?.iconDataUrl ? (
            <img alt="" src={selectedExtension.iconDataUrl} />
          ) : (
            <PackageIcon size={20} />
          )}
        </span>
        <div>
          <p className="section-label">{t('home.capabilities.configuration')}</p>
          <h2>{name}</h2>
          <p>{description || item.id}</p>
        </div>
      </header>

      {selectedSkill ? (
        <div className="extension-configuration-facts">
          <Definition label={t('home.capabilities.detail.source')}>
            {t(`home.capabilities.source.${selectedSkill.source}`)}
          </Definition>
          <Definition label={t('home.capabilities.detail.identifier')}>
            {selectedSkill.id}
          </Definition>
        </div>
      ) : null}

      {selectedExtension ? (
        <>
          <div className="extension-configuration-facts">
            <Definition label={t('home.capabilities.detail.version')}>
              {selectedExtension.version}
            </Definition>
            <Definition label={t('home.capabilities.detail.developer')}>
              {selectedExtension.developer || selectedExtension.id}
            </Definition>
            <Definition label={t('home.capabilities.detail.contributions')}>
              {describeExtensionContributions(selectedExtension, t)}
            </Definition>
            <Definition label={t('home.capabilities.detail.agentStatus')}>
              {t(`home.capabilities.agentStatus.${selectedExtension.agentStatus}`)}
              {selectedExtension.runtimeDiagnosticCode
                ? ` · ${describeRuntimeDiagnostic(selectedExtension.runtimeDiagnosticCode, t)}`
                : ''}
            </Definition>
          </div>
        </>
      ) : null}

      {selectedSkill?.canRemove || selectedExtension?.canRemove ? (
        <div className="extension-configuration-actions">
          <button
            type="button"
            disabled={mutationsDisabled}
            onClick={() => {
              const message = selectedSkill
                ? t('home.capabilities.confirmRemoveSkill', { name })
                : t('home.capabilities.confirmRemovePlugin', { name });
              void Promise.resolve(confirmAction(message)).then((confirmed) => {
                if (!confirmed) return;
                void runMutation(`remove:${item.id}`, () => {
                  if (selectedSkill) {
                    return runtime.removePersonalSkill(selectedSkill.managementId);
                  }
                  if (!selectedExtension) {
                    throw new Error('Extension management selection is invalid.');
                  }
                  return runtime.removePlugin(selectedExtension.id);
                });
              });
            }}
          >
            <TrashIcon size={14} />
            <span>{t('home.capabilities.remove')}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Definition({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <div className="extension-configuration-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
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
  locale = 'en',
): readonly AgentExtensionCatalogItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  return [...extensions]
    .filter((item) =>
      [item.id, item.displayName, resolveAgentExtensionDescription(item, locale), item.developer]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized),
    )
    .sort((left, right) => {
      return left.displayName.localeCompare(right.displayName);
    });
}

export function resolveAgentExtensionDescription(
  extension: AgentExtensionCatalogItem,
  locale: string,
): string {
  return extension.localization[locale]?.description ?? extension.description;
}

function describeExtensionContributions(
  extension: AgentExtensionCatalogItem,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const contributions = [
    ...(extension.componentReadiness.mcp.status === 'absent'
      ? []
      : [
          `${t('home.capabilities.extensionMcp', {
            ids: extension.mcpServerIds.join(', ') || '—',
          })} (${t(`home.capabilities.agentStatus.${extension.componentReadiness.mcp.status}`)})`,
        ]),
    ...(extension.componentReadiness.skills.status === 'absent'
      ? []
      : [
          `${t('home.capabilities.extensionSkills')} (${t(
            `home.capabilities.agentStatus.${extension.componentReadiness.skills.status}`,
          )})`,
        ]),
    ...(extension.componentReadiness.apps.status === 'absent'
      ? []
      : [
          `${t('home.capabilities.extensionApps', {
            ids: extension.appIds.join(', ') || '—',
          })} (${t(`home.capabilities.agentStatus.${extension.componentReadiness.apps.status}`)})`,
        ]),
  ];
  return contributions.join(' · ') || t('home.capabilities.extensionNoContributions');
}

function describeRuntimeDiagnostic(
  code: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  return t('home.capabilities.runtimeDiagnostic.other', { code });
}
