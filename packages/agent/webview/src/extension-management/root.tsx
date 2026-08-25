import {
  BotIcon,
  ChevronRightIcon,
  CodeIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  WarningIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { Button, Dialog, EmptyState } from '@neko/ui/primitives';
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
  const [pendingIdentity, setPendingIdentity] = useState<string>();
  const [selectedEntryIdentity, setSelectedEntryIdentity] = useState<string>();
  const [addMcpOpen, setAddMcpOpen] = useState(false);
  const [removeEntry, setRemoveEntry] = useState<AgentExtensionCatalogEntry>();
  const [mcpDraft, setMcpDraft] = useState({
    serverName: '',
    description: '',
    transport: 'stdio' as 'stdio' | 'streamable-http',
    command: '',
    args: '',
    url: '',
  });

  const runMutation = (
    identity: string,
    mutation: () => Promise<AgentExtensionManagementProjection>,
    after?: () => void,
  ): void => {
    setPendingIdentity(identity);
    setError(undefined);
    void mutation()
      .then((next) => {
        setProjection(next);
        after?.();
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setPendingIdentity(undefined));
  };

  const addCurrent = (): void => {
    if (tab === 'skills') {
      runMutation('skill:add', () => runtime.addSkill());
    } else {
      setAddMcpOpen(true);
    }
  };

  const addMcp = (): void => {
    const common = {
      serverName: mcpDraft.serverName.trim(),
      description: mcpDraft.description.trim(),
    };
    runMutation(
      'mcp:add',
      () =>
        mcpDraft.transport === 'stdio'
          ? runtime.addMcp({
              ...common,
              transport: 'stdio',
              command: mcpDraft.command.trim(),
              args: mcpDraft.args
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean),
            })
          : runtime.addMcp({
              ...common,
              transport: 'streamable-http',
              url: mcpDraft.url.trim(),
            }),
      () => {
        setAddMcpOpen(false);
        setMcpDraft({
          serverName: '',
          description: '',
          transport: 'stdio',
          command: '',
          args: '',
          url: '',
        });
      },
    );
  };

  const setEnabled = (entry: AgentExtensionCatalogEntry, enabled: boolean): void => {
    runMutation(`${entry.kind}:${entry.item.id}`, () =>
      entry.kind === 'skill'
        ? runtime.setSkillEnabled({
            name: entry.item.name,
            source: entry.item.source,
            enabled,
          })
        : runtime.setMcpEnabled({ id: entry.item.id, enabled }),
    );
  };

  const remove = (entry: AgentExtensionCatalogEntry): void => {
    runMutation(
      `${entry.kind}:${entry.item.id}`,
      () =>
        entry.kind === 'skill'
          ? runtime.removeSkill({ name: entry.item.name, source: entry.item.source })
          : runtime.removeMcp(entry.item.id),
      () => {
        setRemoveEntry(undefined);
        setSelectedEntryIdentity(undefined);
      },
    );
  };

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
        <Button
          data-extension-add-action={tab}
          disabled={!interactive || loading || pendingIdentity !== undefined}
          onClick={addCurrent}
          size="sm"
        >
          <PlusIcon size={14} />
          {tab === 'skills' ? t('extension.skill.add') : t('extension.mcp.add')}
        </Button>
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
            data-lifecycle-state={item.enabled ? 'enabled' : 'disabled'}
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
              <small
                className="agent-extension-catalog-row__status"
                data-extension-lifecycle-state={item.enabled ? 'enabled' : 'disabled'}
              >
                {item.enabled
                  ? t('extension.lifecycle.enabled')
                  : t('extension.lifecycle.disabled')}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {selectedEntry ? (
        <AgentExtensionDetailOverlay
          entry={selectedEntry}
          onClose={() => setSelectedEntryIdentity(undefined)}
          onRemove={() => setRemoveEntry(selectedEntry)}
          onSetEnabled={(enabled) => setEnabled(selectedEntry, enabled)}
          pending={pendingIdentity === `${selectedEntry.kind}:${selectedEntry.item.id}`}
        />
      ) : null}
      <McpAddDialog
        draft={mcpDraft}
        onAdd={addMcp}
        onChange={setMcpDraft}
        onOpenChange={setAddMcpOpen}
        open={addMcpOpen}
        pending={pendingIdentity === 'mcp:add'}
      />
      <Dialog
        closeLabel={t('extension.lifecycle.cancel')}
        description={
          removeEntry?.kind === 'skill'
            ? t('extension.lifecycle.removeSkillDescription')
            : t('extension.lifecycle.removeMcpDescription')
        }
        onOpenChange={(open) => {
          if (!open) setRemoveEntry(undefined);
        }}
        open={removeEntry !== undefined}
        title={t('extension.lifecycle.removeTitle')}
      >
        <div className="extension-lifecycle-confirm-actions">
          <Button onClick={() => setRemoveEntry(undefined)} variant="secondary">
            {t('extension.lifecycle.cancel')}
          </Button>
          <Button
            disabled={!removeEntry || pendingIdentity !== undefined}
            onClick={() => removeEntry && remove(removeEntry)}
          >
            <TrashIcon size={14} />
            {t('extension.lifecycle.remove')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

function AgentExtensionDetailOverlay({
  entry,
  onClose,
  onRemove,
  onSetEnabled,
  pending,
}: {
  readonly entry: AgentExtensionCatalogEntry;
  readonly onClose: () => void;
  readonly onRemove: () => void;
  readonly onSetEnabled: (enabled: boolean) => void;
  readonly pending: boolean;
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
        <section className="extension-detail-overlay__section">
          <h3>{t('extension.lifecycle.management')}</h3>
          <div className="extension-detail-overlay__actions">
            {kind === 'mcp' || item.manageable ? (
              <Button
                disabled={pending}
                onClick={() => onSetEnabled(!item.enabled)}
                size="sm"
                variant="secondary"
              >
                {item.enabled ? t('extension.lifecycle.disable') : t('extension.lifecycle.enable')}
              </Button>
            ) : (
              <span>{t('extension.lifecycle.readOnly')}</span>
            )}
            {kind === 'mcp' || item.removable ? (
              <Button disabled={pending} onClick={onRemove} size="sm" variant="secondary">
                <TrashIcon size={14} />
                {t('extension.lifecycle.remove')}
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

function McpAddDialog({
  draft,
  onAdd,
  onChange,
  onOpenChange,
  open,
  pending,
}: {
  readonly draft: {
    readonly serverName: string;
    readonly description: string;
    readonly transport: 'stdio' | 'streamable-http';
    readonly command: string;
    readonly args: string;
    readonly url: string;
  };
  readonly onAdd: () => void;
  readonly onChange: (value: {
    readonly serverName: string;
    readonly description: string;
    readonly transport: 'stdio' | 'streamable-http';
    readonly command: string;
    readonly args: string;
    readonly url: string;
  }) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const valid =
    draft.serverName.trim().length > 0 &&
    (draft.transport === 'stdio' ? draft.command.trim().length > 0 : draft.url.trim().length > 0);
  return (
    <Dialog
      closeLabel={t('extension.lifecycle.cancel')}
      description={t('extension.mcp.addDescription')}
      onOpenChange={onOpenChange}
      open={open}
      title={t('extension.mcp.add')}
    >
      <div className="extension-mcp-add-form">
        <label>
          <span>{t('extension.mcp.serverName')}</span>
          <input
            value={draft.serverName}
            onChange={(event) => onChange({ ...draft, serverName: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>{t('extension.mcp.description')}</span>
          <input
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>{t('extension.mcp.transport')}</span>
          <select
            value={draft.transport}
            onChange={(event) =>
              onChange({
                ...draft,
                transport: event.currentTarget.value as 'stdio' | 'streamable-http',
              })
            }
          >
            <option value="stdio">stdio</option>
            <option value="streamable-http">streamable-http</option>
          </select>
        </label>
        {draft.transport === 'stdio' ? (
          <>
            <label>
              <span>{t('extension.mcp.command')}</span>
              <input
                value={draft.command}
                onChange={(event) => onChange({ ...draft, command: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>{t('extension.mcp.args')}</span>
              <textarea
                value={draft.args}
                onChange={(event) => onChange({ ...draft, args: event.currentTarget.value })}
              />
            </label>
          </>
        ) : (
          <label>
            <span>URL</span>
            <input
              value={draft.url}
              onChange={(event) => onChange({ ...draft, url: event.currentTarget.value })}
            />
          </label>
        )}
        <div className="extension-lifecycle-confirm-actions">
          <Button onClick={() => onOpenChange(false)} variant="secondary">
            {t('extension.lifecycle.cancel')}
          </Button>
          <Button disabled={!valid || pending} onClick={onAdd}>
            <PlusIcon size={14} />
            {t('extension.mcp.add')}
          </Button>
        </div>
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
