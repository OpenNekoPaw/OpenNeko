import { FolderIcon, GridIcon, PackageIcon, SearchIcon, SettingsIcon } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { Dialog } from '@neko/ui/primitives';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { DesktopApplicationPreferences } from '@neko/host/application-settings';
import type {
  DesktopAiModelView,
  DesktopAiModelProtocol,
  DesktopAiModelSettingsProjection,
  DesktopAiProviderView,
} from '@neko/host/ai-model-settings';
import type { ModelType } from '@neko/ai-contracts';
import type { DesktopStorageSettingsProjection } from '@neko/host/desktop-storage-settings-contract';
import { useDesktopApplicationSettings } from './application-settings-context';
import { DesktopApplicationNavigationButton } from './DesktopApplicationSidebar';

export type DesktopSettingsSection = 'general' | 'appearance' | 'storage' | 'creative' | 'agent';

const categories: readonly DesktopSettingsSection[] = [
  'general',
  'appearance',
  'storage',
  'creative',
  'agent',
];

const categoryMessageKeys = {
  general: {
    title: 'settings.category.general',
    description: 'settings.category.general.description',
  },
  appearance: {
    title: 'settings.category.appearance',
    description: 'settings.category.appearance.description',
  },
  storage: {
    title: 'settings.category.storage',
    description: 'settings.category.storage.description',
  },
  creative: {
    title: 'settings.category.creative',
    description: 'settings.category.creative.description',
  },
  agent: {
    title: 'settings.category.agent',
    description: 'settings.category.agent.description',
  },
} as const;

export function DesktopSettingsNavigationSurface({
  activeSection,
  onSectionChange,
}: {
  readonly activeSection: DesktopSettingsSection;
  readonly onSectionChange: (section: DesktopSettingsSection) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const visibleCategories = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return categories;
    return categories.filter((candidate) => {
      const keys = categoryMessageKeys[candidate];
      return [t(keys.title), t(keys.description)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [query, t]);

  return (
    <aside
      className="desktop-settings__navigation"
      data-settings-surface="navigation"
      aria-label={t('settings.navigation')}
    >
      <label className="desktop-settings__search management-search-field">
        <SearchIcon size={15} />
        <input
          aria-label={t('settings.search')}
          placeholder={t('settings.search')}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <nav className="home-primary-navigation" aria-label={t('settings.navigation')}>
        {visibleCategories.map((item) => (
          <DesktopApplicationNavigationButton
            key={item}
            active={item === activeSection}
            icon={categoryIcon(item)}
            label={t(categoryMessageKeys[item].title)}
            onClick={() => {
              setQuery('');
              onSectionChange(item);
            }}
          />
        ))}
      </nav>
      {visibleCategories.length === 0 ? (
        <div className="desktop-settings__empty">{t('settings.noResults')}</div>
      ) : null}
    </aside>
  );
}

export function DesktopSettingsMainSurface({
  section,
  showTitle = true,
}: {
  readonly section: DesktopSettingsSection;
  readonly showTitle?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const [pending, setPending] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string>();

  const update = async (preferences: DesktopApplicationPreferences): Promise<void> => {
    setPending(true);
    setDiagnostic(undefined);
    try {
      await settings.update(preferences);
    } catch (error: unknown) {
      setDiagnostic(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      className="desktop-settings__content"
      data-settings-surface="main"
      aria-label={showTitle ? undefined : t('settings.title')}
      aria-labelledby={showTitle ? 'desktop-settings-title' : undefined}
    >
      <div className="desktop-settings__overview">
        {showTitle ? (
          <header className="desktop-settings__title">
            <div>
              <h1 id="desktop-settings-title">{t('settings.title')}</h1>
              <p>{t('settings.description')}</p>
            </div>
          </header>
        ) : null}
        {diagnostic ? (
          <div className="desktop-settings__diagnostic" role="alert">
            {diagnostic}
          </div>
        ) : null}
        {section === 'general' ? (
          <SettingsGroup
            description={t('settings.category.general.description')}
            title={t('settings.category.general')}
          >
            <div className="desktop-settings__row">
              <span>
                <strong>{t('settings.startup.label')}</strong>
                <small>{t('settings.startup.description')}</small>
              </span>
            </div>
          </SettingsGroup>
        ) : null}
        {section === 'appearance' ? (
          <SettingsGroup
            description={t('settings.category.appearance.description')}
            title={t('settings.category.appearance')}
          >
            <SettingsSelect
              disabled={pending}
              label={t('settings.theme.label')}
              description={t('settings.theme.description')}
              value={settings.projection.preferences.theme}
              options={[
                { value: 'system', label: t('settings.theme.system') },
                { value: 'light', label: t('settings.theme.light') },
                { value: 'dark', label: t('settings.theme.dark') },
              ]}
              onChange={(value) =>
                update({
                  ...settings.projection.preferences,
                  theme: value,
                })
              }
            />
            <SettingsSelect
              disabled={pending}
              label={t('settings.locale.label')}
              description={t('settings.locale.description')}
              value={settings.projection.preferences.locale}
              options={[
                { value: 'system', label: t('settings.locale.system') },
                { value: 'en', label: 'English' },
                { value: 'zh-cn', label: '简体中文' },
              ]}
              onChange={(value) =>
                update({
                  ...settings.projection.preferences,
                  locale: value,
                })
              }
            />
            <SettingsSelect
              disabled={pending}
              label={t('settings.fontSize.label')}
              description={t('settings.fontSize.description')}
              value={settings.projection.preferences.fontSize}
              options={[
                { value: 'small', label: t('settings.fontSize.small') },
                { value: 'default', label: t('settings.fontSize.default') },
                { value: 'large', label: t('settings.fontSize.large') },
              ]}
              onChange={(value) =>
                update({
                  ...settings.projection.preferences,
                  fontSize: value,
                })
              }
            />
          </SettingsGroup>
        ) : null}
        {section === 'creative' ? (
          <SettingsGroup
            description={t('settings.category.creative.description')}
            title={t('settings.category.creative')}
          >
            <SettingsSelect
              disabled={pending}
              label={t('settings.resources.label')}
              description={t('settings.resources.description')}
              value={settings.projection.preferences.resourceBrowserView}
              options={[
                { value: 'list', label: t('settings.resources.list') },
                { value: 'grid', label: t('settings.resources.grid') },
              ]}
              onChange={(value) =>
                update({
                  ...settings.projection.preferences,
                  resourceBrowserView: value,
                })
              }
            />
          </SettingsGroup>
        ) : null}
        {section === 'storage' ? <StorageSettingsGroup onDiagnostic={setDiagnostic} /> : null}
        {section === 'agent' ? (
          <AgentModelSettingsGroup
            onDiagnostic={setDiagnostic}
            onOpenAdvanced={() => {
              setPending(true);
              setDiagnostic(undefined);
              return settings.openAgentAdvanced().finally(() => setPending(false));
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function StorageSettingsGroup({
  onDiagnostic,
}: {
  readonly onDiagnostic: (diagnostic: string | undefined) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const port = settings.storageSettings;
  const [projection, setProjection] = useState<DesktopStorageSettingsProjection>();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!port) {
      onDiagnostic(t('settings.storage.unavailable'));
      return;
    }
    let active = true;
    setPending(true);
    port
      .get()
      .then((next) => {
        if (active) setProjection(next);
      })
      .catch((error: unknown) => {
        if (active) onDiagnostic(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [onDiagnostic, port, t]);
  return (
    <SettingsGroup
      description={t('settings.category.storage.description')}
      title={t('settings.category.storage')}
    >
      <div className="desktop-settings__storage-list">
        {projection?.entries.map((entry) => (
          <div key={entry.id} className="desktop-settings__storage-row">
            <span>
              <strong>{storageLabel(entry.kind, entry.label, t)}</strong>
              <small>{entry.locator}</small>
              {entry.diagnostic ? (
                <small className="desktop-settings__storage-error">{entry.diagnostic}</small>
              ) : null}
            </span>
            <span className="desktop-settings__storage-actions">
              <span>{entry.bytes === undefined ? '—' : formatBytes(entry.bytes)}</span>
              <button
                className="desktop-settings__action"
                disabled={pending || !port}
                type="button"
                onClick={() => {
                  if (!port) return;
                  setPending(true);
                  onDiagnostic(undefined);
                  void port
                    .open(entry.id)
                    .then(setProjection)
                    .catch((error: unknown) =>
                      onDiagnostic(error instanceof Error ? error.message : String(error)),
                    )
                    .finally(() => setPending(false));
                }}
              >
                {t('settings.storage.open')}
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="desktop-settings__row">
        <div>
          <strong>{t('settings.storage.defaultWorkspace')}</strong>
          <p>{t('settings.storage.defaultWorkspaceDescription')}</p>
        </div>
        <button
          className="desktop-settings__action"
          disabled={pending || !port}
          type="button"
          onClick={() => {
            if (!port) return;
            setPending(true);
            onDiagnostic(undefined);
            void port
              .selectDefaultWorkspace()
              .then((response) => setProjection(response.projection))
              .catch((error: unknown) =>
                onDiagnostic(error instanceof Error ? error.message : String(error)),
              )
              .finally(() => setPending(false));
          }}
        >
          {t('settings.storage.change')}
        </button>
      </div>
      <p className="desktop-settings__authority">{t('settings.storage.authority')}</p>
    </SettingsGroup>
  );
}

function storageLabel(
  kind: 'application-data' | 'project' | 'media-library' | 'default-workspace',
  projectedLabel: string,
  t: (key: string) => string,
): string {
  if (kind === 'application-data') return t('settings.storage.applicationData');
  if (kind === 'media-library') return t('settings.storage.mediaLibraries');
  if (kind === 'default-workspace') return t('settings.storage.newProjects');
  return `${t('settings.storage.project')}: ${projectedLabel}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function AgentModelSettingsGroup({
  onDiagnostic,
  onOpenAdvanced,
}: {
  readonly onDiagnostic: (diagnostic: string | undefined) => void;
  readonly onOpenAdvanced: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const port = settings.aiModelSettings;
  const [projection, setProjection] = useState<DesktopAiModelSettingsProjection>();
  const [pending, setPending] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [editingProvider, setEditingProvider] = useState<DesktopAiProviderView>();
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providersExpanded, setProvidersExpanded] = useState(false);

  useEffect(() => {
    if (!port) {
      onDiagnostic(t('settings.agent.unavailable'));
      return;
    }
    let active = true;
    setPending(true);
    port
      .get()
      .then((next) => {
        if (active) setProjection(next);
      })
      .catch((error: unknown) => {
        if (active) onDiagnostic(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [onDiagnostic, port, t]);

  const execute = async (
    action: () => Promise<{
      readonly projection: DesktopAiModelSettingsProjection;
      readonly restartRequired: boolean;
    }>,
  ): Promise<boolean> => {
    setPending(true);
    onDiagnostic(undefined);
    try {
      const response = await action();
      setProjection(response.projection);
      setRestartRequired((current) => current || response.restartRequired);
      return true;
    } catch (error: unknown) {
      onDiagnostic(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setPending(false);
    }
  };

  const toggleProviders = (): void => {
    setProvidersExpanded((current) => !current);
    setEditingProvider(undefined);
    setShowProviderForm(false);
  };

  return (
    <SettingsGroup
      description={t('settings.category.agent.description')}
      title={t('settings.category.agent')}
    >
      {restartRequired ? (
        <div className="desktop-settings__notice" role="status">
          {t('settings.agent.restartRequired')}
        </div>
      ) : null}
      <div className="desktop-settings__subsection">
        <button
          aria-expanded={providersExpanded}
          className="desktop-settings__management-summary"
          type="button"
          onClick={toggleProviders}
        >
          <div>
            <strong>{t('settings.agent.providers')}</strong>
            <small>{t('settings.agent.providersDescription')}</small>
          </div>
          <span>
            <span className="desktop-settings__count">{projection?.providers.length ?? 0}</span>
            {t(providersExpanded ? 'settings.agent.collapse' : 'settings.agent.manage')}
          </span>
        </button>
        {providersExpanded ? (
          <div className="desktop-settings__management-panel">
            <div className="desktop-settings__management-actions">
              <button
                className="desktop-settings__action"
                disabled={pending || !port}
                type="button"
                onClick={() => {
                  setEditingProvider(undefined);
                  setShowProviderForm(true);
                }}
              >
                {t('settings.agent.addProvider')}
              </button>
            </div>
            <div className="desktop-settings__provider-list">
              {projection?.providers.map((provider) => (
                <button
                  key={provider.id}
                  className="desktop-settings__provider-card"
                  type="button"
                  onClick={() => {
                    setEditingProvider(provider);
                    setShowProviderForm(true);
                  }}
                >
                  <span>
                    <strong>{provider.displayName}</strong>
                    <small>{provider.apiUrl}</small>
                  </span>
                  <span
                    className={`desktop-settings__credential desktop-settings__credential--${provider.credentialStatus}`}
                  >
                    {t(`settings.agent.credential.${provider.credentialStatus}`)}
                  </span>
                </button>
              ))}
            </div>
            {showProviderForm && port ? (
              <ProviderForm
                disabled={pending}
                initial={editingProvider}
                models={
                  editingProvider
                    ? (projection?.models.filter(
                        (model) => model.providerId === editingProvider.id,
                      ) ?? [])
                    : []
                }
                defaults={projection?.defaults ?? {}}
                onCancel={() => setShowProviderForm(false)}
                onSaveModel={(model) => execute(() => port.saveModel(model))}
                onSetDefault={(model) =>
                  execute(() =>
                    port.setDefault(model.type, {
                      providerId: model.providerId,
                      modelId: model.id,
                    }),
                  )
                }
                onSave={(provider, apiKey) =>
                  execute(() => port.saveProvider(provider, apiKey)).then((saved) => {
                    if (saved) setShowProviderForm(false);
                  })
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="desktop-settings__row">
        <div>
          <strong>{t('settings.agent.advanced')}</strong>
          <p>{t('settings.agent.advancedDescription')}</p>
        </div>
        <button
          className="desktop-settings__action"
          disabled={pending}
          type="button"
          onClick={() => {
            setPending(true);
            onDiagnostic(undefined);
            void onOpenAdvanced()
              .catch((error: unknown) =>
                onDiagnostic(error instanceof Error ? error.message : String(error)),
              )
              .finally(() => setPending(false));
          }}
        >
          {t('settings.agent.openConfig')}
        </button>
      </div>
      <p className="desktop-settings__authority">{t('settings.agent.authority')}</p>
    </SettingsGroup>
  );
}

function ProviderForm({
  disabled,
  defaults,
  initial,
  models,
  onCancel,
  onSave,
  onSaveModel,
  onSetDefault,
}: {
  readonly disabled: boolean;
  readonly defaults: DesktopAiModelSettingsProjection['defaults'];
  readonly initial?: DesktopAiProviderView;
  readonly models: readonly DesktopAiModelView[];
  readonly onCancel: () => void;
  readonly onSave: (
    provider: {
      readonly id: string;
      readonly displayName: string;
      readonly apiUrl: string;
      readonly protocol: DesktopAiModelProtocol;
      readonly enabled: boolean;
    },
    apiKey?: string,
  ) => Promise<void>;
  readonly onSaveModel: (model: {
    readonly id: string;
    readonly providerId: string;
    readonly apiName: string;
    readonly displayName: string;
    readonly type: ModelType;
    readonly enabled: boolean;
  }) => Promise<boolean>;
  readonly onSetDefault: (model: DesktopAiModelView) => Promise<boolean>;
}): JSX.Element {
  const { t } = useTranslation();
  const [id, setId] = useState(initial?.id ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [apiUrl, setApiUrl] = useState(initial?.apiUrl ?? '');
  const [protocol, setProtocol] = useState<DesktopAiModelProtocol>(
    initial?.protocol ?? 'openai-chat',
  );
  const [apiKey, setApiKey] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(!initial);
  const [showModelForm, setShowModelForm] = useState(false);
  const canSave = Boolean(id.trim() && displayName.trim() && apiUrl.trim());
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void onSave(
      { id, displayName, apiUrl, protocol, enabled: true },
      apiKey.trim() ? apiKey : undefined,
    );
  };
  return (
    <form className="desktop-settings__editor" onSubmit={submit}>
      <header className="desktop-settings__editor-heading">
        <div>
          <strong>
            {initial ? t('settings.agent.providerSettings') : t('settings.agent.customProvider')}
          </strong>
          <small>
            {initial
              ? t('settings.agent.providerSettingsDescription')
              : t('settings.agent.customProviderDescription')}
          </small>
        </div>
        {initial ? (
          <span
            className={`desktop-settings__credential desktop-settings__credential--${initial.credentialStatus}`}
          >
            {t(`settings.agent.credential.${initial.credentialStatus}`)}
          </span>
        ) : null}
      </header>

      <div className="desktop-settings__form-grid">
        {!initial ? (
          <>
            <label>
              <span>{t('settings.agent.providerId')}</span>
              <input
                disabled={disabled}
                placeholder={t('settings.agent.providerIdPlaceholder')}
                required
                value={id}
                onChange={(e) => setId(e.currentTarget.value)}
              />
              <small>{t('settings.agent.providerIdHelp')}</small>
            </label>
            <label>
              <span>{t('settings.agent.providerName')}</span>
              <input
                disabled={disabled}
                placeholder={t('settings.agent.providerNamePlaceholder')}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.currentTarget.value)}
              />
            </label>
          </>
        ) : null}

        {initial ? (
          <label>
            <span>{t('settings.agent.apiKey')}</span>
            <input
              autoComplete="off"
              disabled={disabled}
              placeholder={t('settings.agent.apiKeyKeep')}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
            />
          </label>
        ) : null}
      </div>

      {initial ? (
        <button
          aria-expanded={advancedOpen}
          className="desktop-settings__editor-disclosure"
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          <span aria-hidden="true">{advancedOpen ? '⌄' : '›'}</span>
          {t('settings.agent.advancedProviderSettings')}
        </button>
      ) : null}

      {advancedOpen ? (
        <div className="desktop-settings__form-grid desktop-settings__advanced-fields">
          {initial ? (
            <label>
              <span>{t('settings.agent.providerName')}</span>
              <input
                disabled={disabled}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.currentTarget.value)}
              />
            </label>
          ) : null}
          <label>
            <span>{t('settings.agent.apiUrl')}</span>
            <input
              disabled={disabled}
              placeholder={t('settings.agent.apiUrlPlaceholder')}
              required
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.currentTarget.value)}
            />
          </label>
          <label className="desktop-settings__field-compact">
            <span>{t('settings.agent.protocol')}</span>
            <select
              disabled={disabled}
              value={protocol}
              onChange={(e) => setProtocol(e.currentTarget.value as DesktopAiModelProtocol)}
            >
              <option value="openai-chat">OpenAI Chat compatible</option>
              <option value="openai-responses">OpenAI Responses</option>
              <option value="anthropic">Anthropic Messages</option>
            </select>
          </label>
          {!initial ? (
            <label>
              <span>{t('settings.agent.apiKey')}</span>
              <input
                autoComplete="off"
                disabled={disabled}
                placeholder={t('settings.agent.apiKeyPlaceholder')}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.currentTarget.value)}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <section className="desktop-settings__provider-models">
        <div className="desktop-settings__provider-models-heading">
          <div>
            <strong>{t('settings.agent.modelCatalog')}</strong>
            <small>{t('settings.agent.modelCatalogDescription')}</small>
          </div>
          {initial ? (
            <button
              className="desktop-settings__action desktop-settings__action--quiet"
              disabled={disabled}
              type="button"
              onClick={() => setShowModelForm((current) => !current)}
            >
              {showModelForm ? t('common.cancel') : t('settings.agent.addModel')}
            </button>
          ) : null}
        </div>
        {initial ? (
          <ProviderModelCatalog
            defaults={defaults}
            disabled={disabled}
            models={models}
            onSetDefault={onSetDefault}
          />
        ) : (
          <div className="desktop-settings__model-empty">
            {t('settings.agent.saveProviderBeforeModels')}
          </div>
        )}
        {initial && showModelForm ? (
          <ModelForm
            disabled={disabled}
            providerId={initial.id}
            onCancel={() => setShowModelForm(false)}
            onSave={(model) =>
              onSaveModel(model).then((saved) => {
                if (saved) setShowModelForm(false);
              })
            }
          />
        ) : null}
      </section>

      <div className="desktop-settings__editor-actions">
        <button type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="desktop-settings__action" disabled={disabled || !canSave} type="submit">
          {t('common.save')}
        </button>
      </div>
    </form>
  );
}

function ModelForm({
  disabled,
  onCancel,
  onSave,
  providerId,
}: {
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSave: (model: {
    readonly id: string;
    readonly providerId: string;
    readonly apiName: string;
    readonly displayName: string;
    readonly type: ModelType;
    readonly enabled: boolean;
  }) => Promise<void>;
  readonly providerId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const [id, setId] = useState('');
  const [apiName, setApiName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [type, setType] = useState<ModelType>('llm');
  const canSave = Boolean(id.trim() && apiName.trim() && displayName.trim());
  const save = (): void => {
    if (disabled || !canSave) return;
    void onSave({ id, providerId, apiName, displayName, type, enabled: true });
  };
  return (
    <div
      aria-label={t('settings.agent.addModel')}
      className="desktop-settings__model-editor"
      role="group"
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        save();
      }}
    >
      <div className="desktop-settings__form-grid">
        <label>
          <span>{t('settings.agent.modelType')}</span>
          <select
            disabled={disabled}
            value={type}
            onChange={(e) => setType(e.currentTarget.value as ModelType)}
          >
            {(['llm', 'image', 'video', 'audio'] as const).map((candidate) => (
              <option key={candidate} value={candidate}>
                {t(`settings.agent.modelType.${candidate}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('settings.agent.modelId')}</span>
          <input
            disabled={disabled}
            required
            value={id}
            onChange={(e) => setId(e.currentTarget.value)}
          />
        </label>
        <label>
          <span>{t('settings.agent.apiModelName')}</span>
          <input
            disabled={disabled}
            required
            value={apiName}
            onChange={(e) => setApiName(e.currentTarget.value)}
          />
        </label>
        <label className="desktop-settings__form-wide">
          <span>{t('settings.agent.modelName')}</span>
          <input
            disabled={disabled}
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
          />
        </label>
      </div>
      <div className="desktop-settings__editor-actions">
        <button type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          className="desktop-settings__action"
          disabled={disabled || !canSave}
          type="button"
          onClick={save}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

function ProviderModelCatalog({
  defaults,
  disabled,
  models,
  onSetDefault,
}: {
  readonly defaults: DesktopAiModelSettingsProjection['defaults'];
  readonly disabled: boolean;
  readonly models: readonly DesktopAiModelView[];
  readonly onSetDefault: (model: DesktopAiModelView) => Promise<boolean>;
}): JSX.Element {
  const { t } = useTranslation();
  if (models.length === 0) {
    return <div className="desktop-settings__model-empty">{t('settings.agent.noModels')}</div>;
  }
  const renderGroup = (kind: 'dialogue' | 'generation'): JSX.Element | null => {
    const grouped = models.filter((model) =>
      kind === 'dialogue' ? model.type === 'llm' : model.type !== 'llm',
    );
    if (grouped.length === 0) return null;
    return (
      <section className="desktop-settings__model-group">
        <div className="desktop-settings__model-group-heading">
          <strong>
            {t(
              kind === 'dialogue'
                ? 'settings.agent.dialogueModels'
                : 'settings.agent.generationModels',
            )}
          </strong>
        </div>
        <div className="desktop-settings__model-list">
          {grouped.map((model) => {
            const isDefault =
              modelRefValue(defaults[model.type]) === `${model.providerId}:${model.id}`;
            return (
              <div
                key={`${model.providerId}:${model.id}`}
                className="desktop-settings__model-chip"
                data-default={isDefault}
              >
                <span className="desktop-settings__model-copy">
                  <strong>{model.displayName}</strong>
                  <span>
                    {t(`settings.agent.modelType.${model.type}`)} · {model.apiName}
                  </span>
                </span>
                {isDefault ? (
                  <span className="desktop-settings__model-default-badge">
                    {t('settings.agent.defaultModel')}
                  </span>
                ) : (
                  <button
                    className="desktop-settings__model-default-action"
                    disabled={disabled || !model.enabled}
                    type="button"
                    onClick={() => void onSetDefault(model)}
                  >
                    {t('settings.agent.setAsDefault')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };
  return (
    <div className="desktop-settings__model-groups">
      {renderGroup('dialogue')}
      {renderGroup('generation')}
    </div>
  );
}

function modelRefValue(
  ref: { readonly providerId: string; readonly modelId: string } | undefined,
): string {
  return ref ? `${ref.providerId}:${ref.modelId}` : '';
}

export function DesktopSettingsOverlaySurface({
  onClose,
  onSectionChange,
  section,
}: {
  readonly onClose: () => void;
  readonly onSectionChange: (section: DesktopSettingsSection) => void;
  readonly section: DesktopSettingsSection;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog
      className="desktop-settings-overlay"
      closeLabel={t('settings.close')}
      description={t('settings.description')}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
      title={t('settings.title')}
    >
      <div className="desktop-settings-overlay__layout" data-settings-overlay="true">
        <DesktopSettingsNavigationSurface
          activeSection={section}
          onSectionChange={onSectionChange}
        />
        <DesktopSettingsMainSurface section={section} showTitle={false} />
      </div>
    </Dialog>
  );
}

export function parseDesktopSettingsSection(value: string): DesktopSettingsSection {
  const section = categories.find((candidate) => candidate === value);
  if (!section) throw new Error(`Unknown Desktop Settings section '${value}'.`);
  return section;
}

function SettingsGroup({
  children,
  description,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}): JSX.Element {
  return (
    <section className="desktop-settings__group">
      <div className="desktop-settings__group-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="desktop-settings__card">{children}</div>
    </section>
  );
}

function SettingsSelect<T extends string>({
  description,
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  readonly description: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
}): JSX.Element {
  return (
    <label className="desktop-settings__row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const option = options.find((candidate) => candidate.value === event.currentTarget.value);
          if (!option) {
            throw new Error(`Unknown Desktop setting option '${event.currentTarget.value}'.`);
          }
          onChange(option.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function categoryIcon(category: DesktopSettingsSection): JSX.Element {
  switch (category) {
    case 'general':
      return <SettingsIcon size={16} />;
    case 'appearance':
      return <GridIcon size={16} />;
    case 'storage':
      return <FolderIcon size={16} />;
    case 'creative':
      return <FolderIcon size={16} />;
    case 'agent':
      return <PackageIcon size={16} />;
  }
}
