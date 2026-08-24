import {
  BotIcon,
  ChevronRightIcon,
  CodeIcon,
  PackageIcon,
  SearchIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { Dialog, EmptyState } from '@neko/ui/primitives';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  AgentExtensionManagementProjection,
  AgentExtensionManagementRuntime,
  AgentManagedMcpItem,
  AgentManagedSkillItem,
} from '@neko/agent-contracts/extension-management';

export type AgentExtensionManagementTab = 'skills' | 'mcp';

export function AgentExtensionManagementRoot({
  compactHeading = false,
  interactive,
  runtime,
  selectedTab,
  showTabControls = true,
  onTabChange,
  toolbarControls,
}: {
  readonly compactHeading?: boolean;
  readonly interactive: boolean;
  readonly runtime: AgentExtensionManagementRuntime;
  readonly selectedTab?: AgentExtensionManagementTab;
  readonly showTabControls?: boolean;
  readonly onTabChange?: (tab: AgentExtensionManagementTab) => void;
  readonly toolbarControls?: ReactNode;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const [localTab, setLocalTab] = useState<AgentExtensionManagementTab>('skills');
  const tab = selectedTab ?? localTab;
  const setTab = (next: AgentExtensionManagementTab): void => {
    if (selectedTab === undefined) setLocalTab(next);
    onTabChange?.(next);
  };
  const [query, setQuery] = useState('');
  const [projection, setProjection] = useState<AgentExtensionManagementProjection>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [selectedEntryIdentity, setSelectedEntryIdentity] = useState<string>();

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

  const catalogEntries = useMemo(() => {
    return (
      tab === 'skills'
        ? (projection?.skills ?? []).map((item) => ({
            kind: 'skill' as const,
            item,
            presentation: presentSkill(item, t),
          }))
        : (projection?.mcp ?? []).map((item) => ({
            kind: 'mcp' as const,
            item,
            presentation: { name: item.name, summary: item.description },
          }))
    ) satisfies readonly AgentExtensionCatalogEntry[];
  }, [projection, t, tab]);

  const entries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return catalogEntries
      .filter(({ item, presentation }) =>
        `${presentation.name} ${presentation.summary} ${item.name} ${item.description} ${item.id}`
          .toLocaleLowerCase()
          .includes(normalized),
      )
      .sort((left, right) => left.presentation.name.localeCompare(right.presentation.name, locale));
  }, [catalogEntries, locale, query]);

  const selectedEntry = catalogEntries.find(
    ({ kind, item }) => `${kind}:${item.id}` === selectedEntryIdentity,
  );

  useEffect(() => {
    setSelectedEntryIdentity(undefined);
  }, [tab]);

  const diagnosticCount = projection?.diagnostics.reduce((sum, item) => sum + item.count, 0) ?? 0;
  return (
    <section className="agent-extension-management-root">
      {compactHeading ? null : (
        <header className="management-surface-header">
          <div>
            <p className="section-label">{t('home.capabilities.eyebrow')}</p>
            <h2>{t('home.capabilities')}</h2>
            <p>{t('home.capabilities.description')}</p>
          </div>
        </header>
      )}
      <div className="management-surface-toolbar">
        <label className="management-search-field">
          <SearchIcon size={16} />
          <input
            aria-label={t('home.capabilities.search')}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        {toolbarControls ??
          (showTabControls ? (
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
          ) : null)}
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
      <ul
        aria-label={tab === 'skills' ? t('home.capabilities.skills') : 'MCP'}
        className="management-surface-list is-grid"
        data-empty={entries.length === 0}
        role="list"
      >
        {entries.length === 0 ? (
          <EmptyState
            fill
            icon={<PackageIcon size={24} />}
            title={
              loading
                ? t('home.capabilities.loading')
                : tab === 'mcp' &&
                    catalogEntries.length === 0 &&
                    query.trim().length === 0 &&
                    error === undefined
                  ? t('extension.empty.mcpUnconfigured')
                  : t('home.capabilities.noEntries')
            }
          />
        ) : null}
        {entries.map(({ kind, item, presentation }) => (
          <li
            aria-label={presentation.name}
            className="management-surface-row agent-extension-catalog-row"
            data-extension-kind={kind}
            data-selected={selectedEntryIdentity === `${kind}:${item.id}`}
            key={`${kind}:${item.id}`}
          >
            <button
              aria-pressed={selectedEntryIdentity === `${kind}:${item.id}`}
              className="agent-extension-catalog-row__open"
              type="button"
              onClick={() => setSelectedEntryIdentity(`${kind}:${item.id}`)}
            >
              <span className="agent-extension-catalog-row__heading">
                <span className="management-surface-icon">
                  {kind === 'skill' ? <CodeIcon size={19} /> : <BotIcon size={19} />}
                </span>
                <strong>{presentation.name}</strong>
                <span className="agent-extension-catalog-row__affordance" aria-hidden="true">
                  <ChevronRightIcon size={14} />
                </span>
              </span>
              <small className="agent-extension-catalog-row__summary">
                {presentation.summary || item.id}
              </small>
              {kind === 'mcp' && item.status !== 'ready' ? (
                <small className="agent-extension-catalog-row__diagnostic" role="alert">
                  {describeMcp(item)}
                </small>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {selectedEntry ? (
        <AgentExtensionDetailOverlay
          entry={selectedEntry}
          onClose={() => setSelectedEntryIdentity(undefined)}
        />
      ) : null}
    </section>
  );
}

function AgentExtensionDetailOverlay({
  entry,
  onClose,
}: {
  readonly entry: AgentExtensionCatalogEntry;
  readonly onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { item, kind, presentation } = entry;
  return (
    <Dialog
      className="extension-detail-overlay agent-extension-detail-overlay"
      closeLabel={t('extension.detail.close')}
      description={presentation.summary || item.description}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      title={presentation.name}
    >
      <div className="extension-detail-overlay__content" data-extension-detail-kind={kind}>
        <header className="extension-detail-overlay__identity">
          <span className="extension-detail-overlay__avatar">
            {kind === 'skill' ? <CodeIcon size={24} /> : <BotIcon size={24} />}
          </span>
          <div>
            <div className="extension-detail-overlay__tags">
              <span>{kind === 'skill' ? 'Skill' : 'MCP'}</span>
              {kind === 'skill' ? <span>{item.source}</span> : <span>{item.status}</span>}
            </div>
          </div>
        </header>
        {kind === 'skill' && item.whenToUse && item.whenToUse !== presentation.summary ? (
          <section className="extension-detail-overlay__section">
            <h3>{t('extension.detail.whenToUse')}</h3>
            <p className="extension-detail-overlay__long-copy">{item.whenToUse}</p>
          </section>
        ) : null}
        <section className="extension-detail-overlay__section">
          <h3>{t('extension.detail.capabilityInfo')}</h3>
          <dl className="extension-detail-overlay__facts">
            <div>
              <dt>{t('extension.detail.identity')}</dt>
              <dd>{item.id}</dd>
            </div>
            {kind === 'skill' ? (
              <>
                <div>
                  <dt>{t('extension.detail.source')}</dt>
                  <dd>{item.source}</dd>
                </div>
                <div>
                  <dt>{t('extension.detail.provider')}</dt>
                  <dd>{item.provider}</dd>
                </div>
                <div>
                  <dt>{t('extension.detail.invocation')}</dt>
                  <dd>
                    {item.userInvocable
                      ? t('extension.detail.userInvocable')
                      : t('extension.detail.notUserInvocable')}
                    {' · '}
                    {item.modelInvocable
                      ? t('extension.detail.modelInvocable')
                      : t('extension.detail.notModelInvocable')}
                  </dd>
                </div>
              </>
            ) : (
              <div>
                <dt>{t('extension.detail.status')}</dt>
                <dd>{describeMcp(item)}</dd>
              </div>
            )}
          </dl>
        </section>
        {kind === 'mcp' && item.status !== 'ready' ? (
          <div className="management-surface-diagnostic" role="alert">
            <WarningIcon size={17} />
            <span>{describeMcp(item)}</span>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface AgentExtensionCatalogPresentation {
  readonly name: string;
  readonly summary: string;
}

type AgentExtensionCatalogEntry =
  | {
      readonly kind: 'skill';
      readonly item: AgentManagedSkillItem;
      readonly presentation: AgentExtensionCatalogPresentation;
    }
  | {
      readonly kind: 'mcp';
      readonly item: AgentManagedMcpItem;
      readonly presentation: AgentExtensionCatalogPresentation;
    };

const BUILTIN_SKILL_PRESENTATION_NAMES = new Set([
  'audio-mixing',
  'character-creator',
  'color-grading',
  'content-authoring',
  'image',
  'media-production',
  'media-quality-review',
  'scene-to-music',
  'script-generation',
  'script-to-timeline',
  'skill-creator',
  'storyboard',
  'subtitle-assistant',
  'video',
  'video-editing',
  'world-creator',
]);

function presentSkill(
  item: AgentManagedSkillItem,
  t: Translate,
): AgentExtensionCatalogPresentation {
  if (item.source !== 'bundled' || !BUILTIN_SKILL_PRESENTATION_NAMES.has(item.name)) {
    return { name: item.name, summary: (item.whenToUse ?? item.description) || item.id };
  }
  return {
    name: t(`skill.catalog.${item.name}.title`),
    summary: t(`skill.catalog.${item.name}.summary`),
  };
}

function describeMcp(item: AgentManagedMcpItem): string {
  return `${item.status}${item.diagnosticCode ? ` · ${item.diagnosticCode}` : ''}`;
}
