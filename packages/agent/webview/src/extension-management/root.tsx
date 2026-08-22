import { GridIcon, LayersIcon, PackageIcon, SearchIcon, WarningIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { EmptyState } from '@neko/ui/primitives';
import { useEffect, useMemo, useState } from 'react';
import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementRuntime,
  AgentManagedMcpItem,
  AgentManagedSkillItem,
} from '@neko/agent-contracts/extension-management';

export type AgentExtensionManagementTab = 'skills' | 'mcp';
export type AgentExtensionManagementView = 'grid' | 'list';

export function AgentExtensionManagementRoot({
  interactive,
  runtime,
}: {
  readonly interactive: boolean;
  readonly runtime: AgentExtensionManagementRuntime;
}): JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AgentExtensionManagementTab>('skills');
  const [view, setView] = useState<AgentExtensionManagementView>('grid');
  const [query, setQuery] = useState('');
  const [projection, setProjection] = useState<AgentExtensionManagementProjection>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!interactive) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    void runtime
      .getSnapshot()
      .then((next) => {
        if (active) setProjection(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [interactive, runtime]);

  const entries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const values =
      tab === 'skills'
        ? (projection?.skills ?? []).map((item) => ({ kind: 'skill' as const, item }))
        : (projection?.mcp ?? []).map((item) => ({ kind: 'mcp' as const, item }));
    return values
      .filter(({ item }) =>
        `${item.name} ${item.description} ${item.id}`.toLocaleLowerCase().includes(normalized),
      )
      .sort((left, right) => left.item.name.localeCompare(right.item.name));
  }, [projection, query, tab]);

  const refresh = (): void => {
    if (!interactive || loading) return;
    setLoading(true);
    setError(undefined);
    void runtime
      .getSnapshot()
      .then(setProjection)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setLoading(false));
  };

  const diagnosticCount = projection?.diagnostics.reduce((sum, item) => sum + item.count, 0) ?? 0;
  return (
    <section className="agent-extension-management-root" data-catalog-view={view}>
      <header className="management-surface-header">
        <div>
          <p className="section-label">{t('home.capabilities.eyebrow')}</p>
          <h2>{t('home.capabilities')}</h2>
          <p>{t('home.capabilities.description')}</p>
        </div>
        <div className="management-surface-actions">
          <button type="button" disabled={!interactive || loading} onClick={refresh}>
            {t('home.capabilities.refresh')}
          </button>
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
            aria-pressed={tab === 'mcp'}
            data-extension-catalog-tab="mcp"
            onClick={() => setTab('mcp')}
          >
            MCP
          </button>
        </div>
        <button
          type="button"
          aria-label={t('home.capabilities.view.grid')}
          aria-pressed={view === 'grid'}
          data-catalog-view-control="grid"
          onClick={() => setView('grid')}
        >
          <GridIcon size={15} />
        </button>
        <button
          type="button"
          aria-label={t('home.capabilities.view.list')}
          aria-pressed={view === 'list'}
          data-catalog-view-control="list"
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
      ) : diagnosticCount > 0 ? (
        <div className="management-surface-diagnostic" role="alert">
          <WarningIcon size={17} />
          <span>{t('home.capabilities.discoveryIssues', { count: diagnosticCount })}</span>
        </div>
      ) : null}
      <div
        aria-label={tab === 'skills' ? t('home.capabilities.skills') : 'MCP'}
        className={`management-surface-list is-${view}`}
        data-empty={entries.length === 0}
        role="list"
      >
        {entries.length === 0 ? (
          <EmptyState
            fill
            icon={<PackageIcon size={24} />}
            title={loading ? t('home.capabilities.loading') : t('home.capabilities.noEntries')}
          />
        ) : null}
        {entries.map(({ kind, item }) => (
          <article
            aria-label={item.name}
            className="management-surface-row agent-extension-catalog-row"
            key={`${kind}:${item.id}`}
            role="listitem"
          >
            <span className="management-surface-icon">
              <PackageIcon size={18} />
            </span>
            <span className="management-surface-copy">
              <strong>{item.name}</strong>
              <small>{item.description || item.id}</small>
              <small>{kind === 'skill' ? describeSkill(item) : describeMcp(item)}</small>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function describeSkill(item: AgentManagedSkillItem): string {
  return `${item.provider} · ${item.userInvocable ? 'user' : 'model-only'}${item.modelInvocable ? ' · model' : ''}`;
}

function describeMcp(item: AgentManagedMcpItem): string {
  return item.status === 'ready'
    ? 'ready'
    : `${item.status}${item.diagnosticCode ? ` · ${item.diagnosticCode}` : ''}`;
}
