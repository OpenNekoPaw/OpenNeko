import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  GridIcon,
  PackageIcon,
  Popover,
  SearchIcon,
  SettingsIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import { Dialog } from '@neko/ui/primitives';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { DesktopApplicationPreferences } from '@neko/host/application-settings';
import {
  defaultDesktopAiModelCapabilities,
  type DesktopAiModelCapability,
  type DesktopAiModelTemplate,
  type DesktopAiModelType,
  type DesktopAiModelView,
  type DesktopAiModelProtocol,
  type DesktopAiModelSettingsProjection,
  type DesktopAiProviderModelFamily,
  type DesktopAiProviderType,
  type DesktopAiProviderView,
} from '@neko/host/ai-model-settings';
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

const MODEL_CAPABILITY_OPTIONS = {
  llm: [
    { id: 'vision', capabilities: ['vision'] },
    { id: 'tools', capabilities: ['function_calling'] },
    { id: 'streaming', capabilities: ['streaming'] },
    { id: 'structuredOutput', capabilities: ['json_mode'] },
    { id: 'code', capabilities: ['code'] },
    { id: 'reasoning', capabilities: ['reasoning'] },
  ],
  image: [
    { id: 'textToImage', capabilities: ['text_to_image'] },
    { id: 'imageToImage', capabilities: ['image_to_image'] },
    { id: 'imageEdit', capabilities: ['image_edit', 'image.edit'] },
  ],
  video: [
    { id: 'textToVideo', capabilities: ['text_to_video'] },
    { id: 'imageToVideo', capabilities: ['image_to_video'] },
    { id: 'videoToVideo', capabilities: ['video_to_video'] },
    { id: 'videoEdit', capabilities: ['video_edit'] },
  ],
  audio: [
    { id: 'textToAudio', capabilities: ['text_to_audio'] },
    { id: 'tts', capabilities: ['audio.tts'] },
    { id: 'asr', capabilities: ['audio.asr'] },
    { id: 'music', capabilities: ['text_to_music', 'audio.music.generate'] },
  ],
} as const satisfies Record<
  DesktopAiModelType,
  readonly {
    readonly id: string;
    readonly capabilities: readonly DesktopAiModelCapability[];
  }[]
>;

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
            onOpenConfig={() => {
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
  onOpenConfig,
}: {
  readonly onDiagnostic: (diagnostic: string | undefined) => void;
  readonly onOpenConfig: () => Promise<void>;
}): JSX.Element {
  const { t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const port = settings.aiModelSettings;
  const [projection, setProjection] = useState<DesktopAiModelSettingsProjection>();
  const [pending, setPending] = useState(false);
  const [runtimeRefreshPending, setRuntimeRefreshPending] = useState(false);
  const [editingProvider, setEditingProvider] = useState<DesktopAiProviderView>();
  const [creatingProviderFamily, setCreatingProviderFamily] =
    useState<DesktopAiProviderModelFamily>();
  const [confirmingProviderDeleteId, setConfirmingProviderDeleteId] = useState<string>();
  const providerGroups = useMemo(
    () => groupProvidersByCapability(projection?.providers ?? []),
    [projection],
  );

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
      readonly runtimeEffect: 'unchanged' | 'applied' | 'pending';
    }>,
  ): Promise<boolean> => {
    setPending(true);
    onDiagnostic(undefined);
    try {
      const response = await action();
      setProjection(response.projection);
      if (response.runtimeEffect === 'pending') setRuntimeRefreshPending(true);
      if (response.runtimeEffect === 'applied') setRuntimeRefreshPending(false);
      return true;
    } catch (error: unknown) {
      onDiagnostic(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingsGroup
      action={
        <button
          className="desktop-settings__action desktop-settings__group-action"
          disabled={pending}
          type="button"
          onClick={() => {
            setPending(true);
            onDiagnostic(undefined);
            void onOpenConfig()
              .catch((error: unknown) =>
                onDiagnostic(error instanceof Error ? error.message : String(error)),
              )
              .finally(() => setPending(false));
          }}
        >
          {t('settings.agent.openConfig')}
        </button>
      }
      description={t('settings.category.agent.description')}
      title={t('settings.category.agent')}
      unframed
    >
      {runtimeRefreshPending ? (
        <div className="desktop-settings__notice" role="status">
          {t('settings.agent.runtimeRefreshPending')}
        </div>
      ) : null}
      <div className="desktop-settings__provider-directories">
        <div className="desktop-settings__provider-groups">
          {providerGroups.map((group) => (
            <section
              key={group.kind}
              className="desktop-settings__provider-group"
              data-provider-group={group.kind}
            >
              <div className="desktop-settings__provider-group-heading">
                <div>
                  <strong>{t(`settings.agent.providerGroup.${group.kind}`)}</strong>
                  <small>{t(`settings.agent.providerGroup.${group.kind}.description`)}</small>
                </div>
                <span className="desktop-settings__provider-group-actions">
                  <span className="desktop-settings__count">{group.providers.length}</span>
                  <button
                    className="desktop-settings__action desktop-settings__action--quiet"
                    disabled={
                      pending ||
                      !port ||
                      (group.kind === 'dialogue' &&
                        !hasDialogueProviderCreationCapability(projection?.dialogueCapabilities))
                    }
                    type="button"
                    onClick={() => {
                      setEditingProvider(undefined);
                      setCreatingProviderFamily(group.kind);
                    }}
                  >
                    {t(`settings.agent.addProvider.${group.kind}`)}
                  </button>
                </span>
              </div>
              {group.kind === 'dialogue' && projection?.dialogueCapabilities.diagnostics.length ? (
                <p className="desktop-settings__provider-empty" role="status">
                  {projection.dialogueCapabilities.diagnostics.join(' ')}
                </p>
              ) : null}
              {group.providers.length > 0 ? (
                <div className="desktop-settings__provider-list">
                  {group.providers.map((provider) => (
                    <article
                      key={`${group.kind}:${provider.id}`}
                      className="desktop-settings__provider-card"
                      data-selected={editingProvider?.id === provider.id}
                    >
                      <button
                        aria-pressed={editingProvider?.id === provider.id}
                        className="desktop-settings__provider-card-main"
                        type="button"
                        onClick={() => {
                          setEditingProvider(provider);
                          setCreatingProviderFamily(undefined);
                          setConfirmingProviderDeleteId(undefined);
                        }}
                      >
                        <span>
                          <strong>{provider.displayName}</strong>
                          <small>
                            {provider.connectionKind === 'local'
                              ? t('settings.agent.source.local')
                              : t('settings.agent.source.remote')}{' '}
                            · {provider.apiUrl || t('settings.agent.apiUrl.catalogDefault')}
                          </small>
                        </span>
                        <span
                          className={`desktop-settings__credential desktop-settings__credential--${provider.credentialStatus}`}
                        >
                          {t(`settings.agent.credential.${provider.credentialStatus}`)}
                        </span>
                      </button>
                      {port ? (
                        <span className="desktop-settings__provider-card-actions">
                          {confirmingProviderDeleteId === provider.id ? (
                            <>
                              <button
                                className="desktop-settings__provider-card-delete desktop-settings__provider-card-delete--confirm"
                                disabled={pending}
                                type="button"
                                onClick={() => {
                                  void execute(() => port.deleteProvider(provider.id)).then(
                                    (deleted) => {
                                      if (deleted) setConfirmingProviderDeleteId(undefined);
                                    },
                                  );
                                }}
                              >
                                {t('settings.agent.confirmDelete')}
                              </button>
                              <button
                                className="desktop-settings__provider-card-delete"
                                disabled={pending}
                                type="button"
                                onClick={() => setConfirmingProviderDeleteId(undefined)}
                              >
                                {t('common.cancel')}
                              </button>
                            </>
                          ) : (
                            <button
                              className="desktop-settings__provider-card-delete"
                              disabled={pending}
                              type="button"
                              onClick={() => setConfirmingProviderDeleteId(provider.id)}
                            >
                              {t('settings.agent.deleteProvider')}
                            </button>
                          )}
                        </span>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="desktop-settings__provider-empty">
                  {t('settings.agent.providerGroup.empty')}
                </p>
              )}
            </section>
          ))}
        </div>
        {(editingProvider || creatingProviderFamily) && port ? (
          <ProviderForm
            key={
              editingProvider
                ? `provider:${editingProvider.id}`
                : `new-provider:${creatingProviderFamily}`
            }
            disabled={pending}
            initial={editingProvider}
            modelFamily={
              editingProvider?.supportedModelFamilies ??
              (creatingProviderFamily ? [creatingProviderFamily] : ['dialogue'])
            }
            models={
              editingProvider
                ? (projection?.models.filter((model) => model.providerId === editingProvider.id) ??
                  [])
                : []
            }
            defaults={projection?.defaults ?? {}}
            dialogueCapabilities={projection?.dialogueCapabilities}
            generationCapabilities={projection?.generationCapabilities ?? []}
            onCancel={() => {
              setEditingProvider(undefined);
              setCreatingProviderFamily(undefined);
            }}
            onDeleteModel={(modelId) => execute(() => port.deleteModel(modelId))}
            onDeleteProvider={(providerId) =>
              execute(() => port.deleteProvider(providerId)).then((deleted) => {
                if (deleted) {
                  setEditingProvider(undefined);
                  setCreatingProviderFamily(undefined);
                }
                return deleted;
              })
            }
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
                if (saved) {
                  setEditingProvider(undefined);
                  setCreatingProviderFamily(undefined);
                }
              })
            }
          />
        ) : null}
      </div>
    </SettingsGroup>
  );
}

type ProviderCapabilityGroupKind = DesktopAiProviderModelFamily;

interface ProviderCapabilityGroup {
  readonly kind: ProviderCapabilityGroupKind;
  readonly providers: readonly DesktopAiProviderView[];
}

function groupProvidersByCapability(
  providers: readonly DesktopAiProviderView[],
): readonly ProviderCapabilityGroup[] {
  const grouped: Record<ProviderCapabilityGroupKind, DesktopAiProviderView[]> = {
    dialogue: [],
    generation: [],
  };
  for (const provider of providers) {
    for (const family of provider.supportedModelFamilies) grouped[family].push(provider);
  }
  return (['dialogue', 'generation'] as const).map((kind) => ({
    kind,
    providers: grouped[kind],
  }));
}

function hasDialogueProviderCreationCapability(
  capabilities: DesktopAiModelSettingsProjection['dialogueCapabilities'] | undefined,
): boolean {
  return Boolean(
    capabilities?.status === 'available' &&
    (capabilities.protocols.length > 0 ||
      capabilities.providers.some((provider) => provider.source === 'catalog')),
  );
}

interface ProviderCreationOption {
  readonly id: string;
  readonly kind: 'dsh-catalog' | 'dsh-custom' | 'product-preset';
  readonly suggestedProviderId: string;
  readonly displayName: string;
  readonly providerType: DesktopAiProviderType;
  readonly defaultApiUrl: string;
  readonly protocol?: DesktopAiModelProtocol;
  readonly presetId?: string;
  readonly requiresApiKey: boolean;
  readonly requiresApiUrl: boolean;
}

function createProviderCreationOptions(
  family: DesktopAiProviderModelFamily | undefined,
  dialogueCapabilities: DesktopAiModelSettingsProjection['dialogueCapabilities'] | undefined,
  generationCapabilities: DesktopAiModelSettingsProjection['generationCapabilities'],
  customLabel: string,
): readonly ProviderCreationOption[] {
  if (family === 'dialogue') {
    if (dialogueCapabilities?.status !== 'available') return [];
    return [
      ...dialogueCapabilities.providers
        .filter((provider) => provider.source === 'catalog')
        .map((provider) => ({
          id: `dsh-catalog:${provider.providerId}`,
          kind: 'dsh-catalog' as const,
          suggestedProviderId: provider.providerId,
          displayName: provider.displayName,
          providerType: provider.providerType,
          defaultApiUrl: provider.defaultApiUrl,
          requiresApiKey: provider.requiresApiKey,
          requiresApiUrl: false,
        })),
      ...(dialogueCapabilities.protocols.length === 0
        ? []
        : [
            {
              id: 'dsh-custom',
              kind: 'dsh-custom' as const,
              suggestedProviderId: '',
              displayName: customLabel,
              providerType: 'generic' as const,
              defaultApiUrl: '',
              protocol: dialogueCapabilities.protocols[0],
              requiresApiKey: true,
              requiresApiUrl: true,
            },
          ]),
    ];
  }
  return generationCapabilities.map((capability) => ({
    id: `product-preset:${capability.id}`,
    kind: 'product-preset' as const,
    suggestedProviderId: capability.suggestedProviderId,
    displayName: capability.displayName,
    providerType: capability.providerType,
    defaultApiUrl: capability.defaultApiUrl,
    presetId: capability.id,
    requiresApiKey: capability.requiresApiKey,
    requiresApiUrl: capability.requiresApiUrl,
  }));
}

function ProviderForm({
  disabled,
  defaults,
  dialogueCapabilities,
  generationCapabilities,
  initial,
  modelFamily,
  models,
  onCancel,
  onDeleteModel,
  onDeleteProvider,
  onSave,
  onSaveModel,
  onSetDefault,
}: {
  readonly disabled: boolean;
  readonly defaults: DesktopAiModelSettingsProjection['defaults'];
  readonly dialogueCapabilities?: DesktopAiModelSettingsProjection['dialogueCapabilities'];
  readonly generationCapabilities: DesktopAiModelSettingsProjection['generationCapabilities'];
  readonly initial?: DesktopAiProviderView;
  readonly modelFamily: readonly DesktopAiProviderModelFamily[];
  readonly models: readonly DesktopAiModelView[];
  readonly onCancel: () => void;
  readonly onDeleteModel: (modelId: string) => Promise<boolean>;
  readonly onDeleteProvider: (providerId: string) => Promise<boolean>;
  readonly onSave: (
    provider: {
      readonly id: string;
      readonly displayName: string;
      readonly type: DesktopAiProviderType;
      readonly apiUrl: string;
      readonly protocol?: DesktopAiModelProtocol;
      readonly presetId?: string;
      readonly supportedModelFamilies: readonly DesktopAiProviderModelFamily[];
      readonly enabled: boolean;
    },
    apiKey?: string,
  ) => Promise<void>;
  readonly onSaveModel: (model: {
    readonly existingId?: string;
    readonly providerId: string;
    readonly apiName: string;
    readonly displayName: string;
    readonly type: DesktopAiModelType;
    readonly capabilities: readonly DesktopAiModelCapability[];
    readonly enabled: boolean;
    readonly templateId?: string;
  }) => Promise<boolean>;
  readonly onSetDefault: (model: DesktopAiModelView) => Promise<boolean>;
}): JSX.Element {
  const { t } = useTranslation();
  const creationFamily = modelFamily.length === 1 ? modelFamily[0] : undefined;
  const creationOptions = createProviderCreationOptions(
    creationFamily,
    dialogueCapabilities,
    generationCapabilities,
    t('settings.agent.customProvider'),
  );
  const initialOption = initial ? undefined : creationOptions[0];
  if (!initial && !initialOption) {
    throw new Error(`No Provider capability is available for ${String(creationFamily)} settings.`);
  }
  const [creationOptionId, setCreationOptionId] = useState(initialOption?.id);
  const selectedOption = creationOptions.find((option) => option.id === creationOptionId);
  const [id, setId] = useState(initial?.id ?? initialOption?.suggestedProviderId ?? '');
  const [displayName, setDisplayName] = useState(
    initial?.displayName ?? initialOption?.displayName ?? '',
  );
  const [apiUrl, setApiUrl] = useState(initial?.apiUrl ?? initialOption?.defaultApiUrl ?? '');
  const [providerType, setProviderType] = useState<DesktopAiProviderType>(
    initial?.type ?? initialOption?.providerType ?? 'generic',
  );
  const [protocol, setProtocol] = useState<DesktopAiModelProtocol | undefined>(
    initial?.protocol ?? initialOption?.protocol,
  );
  const [apiKey, setApiKey] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(!initial);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<DesktopAiModelView>();
  const [confirmProviderDelete, setConfirmProviderDelete] = useState(false);
  const requiresApiKey =
    selectedOption?.requiresApiKey ?? initial?.credentialStatus !== 'not-required';
  const generationCapability = generationCapabilities.find(
    (capability) => capability.providerType === (initial?.type ?? providerType),
  );
  const requiresApiUrl = selectedOption?.requiresApiUrl ?? generationCapability?.requiresApiUrl;
  const isCatalogueProvider =
    modelFamily.includes('dialogue') &&
    (selectedOption?.kind === 'dsh-catalog' ||
      (dialogueCapabilities?.status === 'available' &&
        dialogueCapabilities.providers.some(
          (provider) => provider.source === 'catalog' && provider.providerId === id,
        )));
  const isCatalogueRoute = isCatalogueProvider && protocol === undefined;
  const canSave = Boolean(
    /^[a-z0-9][a-z0-9._:-]*$/iu.test(id.trim()) &&
    displayName.trim() &&
    (isCatalogueRoute || requiresApiUrl === false || apiUrl.trim()) &&
    (!requiresApiKey || initial !== undefined || apiKey.trim()),
  );
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    void onSave(
      {
        id: id.trim(),
        displayName: displayName.trim(),
        type: providerType,
        apiUrl: apiUrl.trim(),
        ...(protocol === undefined ? {} : { protocol }),
        ...(initial || selectedOption?.presetId === undefined
          ? {}
          : { presetId: selectedOption.presetId }),
        supportedModelFamilies: modelFamily,
        enabled: true,
      },
      apiKey.trim() || undefined,
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
            <label className="desktop-settings__form-wide">
              <span>{t('settings.agent.providerPreset')}</span>
              <select
                disabled={disabled}
                value={creationOptionId}
                onChange={(event) => {
                  const next = creationOptions.find(
                    (option) => option.id === event.currentTarget.value,
                  );
                  if (!next) {
                    throw new Error(
                      `Provider capability '${event.currentTarget.value}' is unavailable.`,
                    );
                  }
                  setCreationOptionId(next.id);
                  setId(next.suggestedProviderId);
                  setDisplayName(next.displayName);
                  setApiUrl(next.defaultApiUrl);
                  setProviderType(next.providerType);
                  setProtocol(next.protocol);
                }}
              >
                {creationOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.displayName}
                  </option>
                ))}
              </select>
              <small>{t(`settings.agent.providerPreset.${creationFamily}.description`)}</small>
            </label>
            <label>
              <span>{t('settings.agent.providerId')}</span>
              <input
                disabled={disabled || isCatalogueProvider}
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

        {initial && requiresApiKey ? (
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
            <span>{t('settings.agent.providerType')}</span>
            <input disabled readOnly value={providerType} />
          </label>
          <label>
            <span>{t('settings.agent.apiUrl')}</span>
            <input
              disabled={disabled}
              placeholder={t('settings.agent.apiUrlPlaceholder')}
              required={!isCatalogueRoute && requiresApiUrl !== false}
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.currentTarget.value)}
            />
          </label>
          {modelFamily.includes('dialogue') ? (
            <label className="desktop-settings__field-compact">
              <span>{t('settings.agent.protocol')}</span>
              <select
                disabled={disabled}
                value={protocol ?? ''}
                onChange={(e) =>
                  setProtocol(
                    e.currentTarget.value.length === 0 ? undefined : e.currentTarget.value,
                  )
                }
              >
                {isCatalogueProvider || protocol === undefined ? (
                  <option value="">{t('settings.agent.protocol.catalogDefault')}</option>
                ) : null}
                {protocol !== undefined &&
                !(
                  dialogueCapabilities?.status === 'available' &&
                  dialogueCapabilities.protocols.includes(protocol)
                ) ? (
                  <option value={protocol}>{protocol}</option>
                ) : null}
                {dialogueCapabilities?.status === 'available'
                  ? dialogueCapabilities.protocols.map((candidate) => (
                      <option key={candidate} value={candidate}>
                        {candidate}
                      </option>
                    ))
                  : null}
              </select>
            </label>
          ) : null}
          {!initial && requiresApiKey ? (
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
              onClick={() => {
                setEditingModel(undefined);
                setShowModelForm((current) => !current);
              }}
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
            onDeleteModel={onDeleteModel}
            onEditModel={(model) => {
              setEditingModel(model);
              setShowModelForm(true);
            }}
            onSetDefault={onSetDefault}
          />
        ) : (
          <div className="desktop-settings__model-empty">
            {t('settings.agent.saveProviderBeforeModels')}
          </div>
        )}
        {initial && showModelForm ? (
          <ModelForm
            key={editingModel ? `edit:${editingModel.id}` : 'new-model'}
            allowCustomModels={providerAllowsCustomModels(generationCapability)}
            disabled={disabled}
            initial={editingModel}
            modelTemplates={generationCapability?.modelTemplates ?? []}
            supportedTypes={modelTypesForFamilies(
              modelFamily,
              protocol,
              generationCapability?.supportedModelTypes,
            )}
            providerId={initial.id}
            onCancel={() => {
              setEditingModel(undefined);
              setShowModelForm(false);
            }}
            onSave={(model) =>
              onSaveModel(model).then((saved) => {
                if (saved) {
                  setEditingModel(undefined);
                  setShowModelForm(false);
                }
              })
            }
          />
        ) : null}
      </section>

      <div className="desktop-settings__editor-actions">
        {initial ? (
          confirmProviderDelete ? (
            <span className="desktop-settings__delete-confirmation">
              <span>
                {models.length > 0
                  ? t('settings.agent.deleteProviderModelsFirst')
                  : t('settings.agent.confirmDeleteProvider')}
              </span>
              {models.length === 0 ? (
                <button
                  className="desktop-settings__danger-action"
                  disabled={disabled}
                  type="button"
                  onClick={() => void onDeleteProvider(initial.id)}
                >
                  {t('settings.agent.confirmDelete')}
                </button>
              ) : null}
              <button type="button" onClick={() => setConfirmProviderDelete(false)}>
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <button
              className="desktop-settings__danger-action"
              disabled={disabled}
              type="button"
              onClick={() => setConfirmProviderDelete(true)}
            >
              {t('settings.agent.deleteProvider')}
            </button>
          )
        ) : null}
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
  allowCustomModels = true,
  disabled,
  initial,
  modelTemplates = [],
  onCancel,
  onSave,
  providerId,
  supportedTypes = ['llm', 'image', 'video', 'audio'],
}: {
  readonly allowCustomModels?: boolean;
  readonly disabled: boolean;
  readonly initial?: DesktopAiModelView;
  readonly modelTemplates?: readonly DesktopAiModelTemplate[];
  readonly onCancel: () => void;
  readonly onSave: (model: {
    readonly existingId?: string;
    readonly providerId: string;
    readonly apiName: string;
    readonly displayName: string;
    readonly type: DesktopAiModelType;
    readonly capabilities: readonly DesktopAiModelCapability[];
    readonly enabled: boolean;
    readonly templateId?: string;
  }) => Promise<void>;
  readonly providerId: string;
  readonly supportedTypes?: readonly DesktopAiModelType[];
}): JSX.Element {
  const { t } = useTranslation();
  const initialType = supportedTypes[0];
  if (!initialType) throw new Error(`Provider ${providerId} has no supported model types.`);
  const defaultTemplate = modelTemplates[0];
  if (!allowCustomModels && !defaultTemplate) {
    throw new Error(`Provider ${providerId} requires a builtin model template.`);
  }
  const initialTemplate = initial
    ? modelTemplates.find(
        (template) => template.apiName === initial.apiName && template.type === initial.type,
      )
    : defaultTemplate;
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? 'custom');
  const [apiName, setApiName] = useState(initial?.apiName ?? defaultTemplate?.apiName ?? '');
  const [displayName, setDisplayName] = useState(
    initial
      ? initial.displayName === initial.apiName
        ? ''
        : initial.displayName
      : (defaultTemplate?.displayName ?? ''),
  );
  const [type, setType] = useState<DesktopAiModelType>(
    initial?.type ?? defaultTemplate?.type ?? initialType,
  );
  const [capabilities, setCapabilities] = useState<readonly DesktopAiModelCapability[]>(
    initialTemplate?.capabilities ??
      initial?.capabilities ??
      defaultDesktopAiModelCapabilities(initialType),
  );
  const [capabilityMenuOpen, setCapabilityMenuOpen] = useState(false);
  const selectedTemplate = modelTemplates.find((template) => template.id === templateId);
  const capabilityOptions = MODEL_CAPABILITY_OPTIONS[type];
  const selectedCapabilityOptions = capabilityOptions.filter((option) =>
    option.capabilities.every((capability) => capabilities.includes(capability)),
  );
  const selectedCapabilityLabels = selectedCapabilityOptions.map((option) =>
    t(`settings.agent.modelCapability.${option.id}`),
  );
  const capabilitySummary =
    selectedCapabilityLabels.length === 0
      ? t('settings.agent.modelCapabilities.noneSelected')
      : selectedCapabilityLabels.length <= 2
        ? selectedCapabilityLabels.join(' · ')
        : `${selectedCapabilityLabels.slice(0, 2).join(' · ')} +${selectedCapabilityLabels.length - 2}`;
  const canSave = Boolean(apiName.trim());
  const save = (): void => {
    if (disabled || !canSave) return;
    const normalizedApiName = apiName.trim();
    void onSave({
      ...(initial ? { existingId: initial.id } : {}),
      providerId,
      apiName: normalizedApiName,
      displayName: displayName.trim() || normalizedApiName,
      type,
      capabilities,
      enabled: true,
      ...(selectedTemplate === undefined ? {} : { templateId: selectedTemplate.id }),
    });
  };
  return (
    <div
      aria-label={t('settings.agent.addModel')}
      className="desktop-settings__model-editor"
      role="group"
      onKeyDown={(event) => {
        if (
          event.key !== 'Enter' ||
          !(event.target instanceof HTMLInputElement) ||
          event.target.type === 'checkbox'
        ) {
          return;
        }
        event.preventDefault();
        save();
      }}
    >
      <div className="desktop-settings__form-grid">
        {modelTemplates.length > 0 ? (
          <label className="desktop-settings__form-wide">
            <span>{t('settings.agent.modelTemplate')}</span>
            <select
              disabled={disabled || initial !== undefined}
              value={templateId}
              onChange={(event) => {
                const nextId = event.currentTarget.value;
                setTemplateId(nextId);
                const next = modelTemplates.find((template) => template.id === nextId);
                if (!next) {
                  if (!allowCustomModels) {
                    throw new Error(`Provider ${providerId} does not allow custom models.`);
                  }
                  setApiName('');
                  setDisplayName('');
                  setType(initialType);
                  setCapabilities(defaultDesktopAiModelCapabilities(initialType));
                  return;
                }
                setApiName(next.apiName);
                setDisplayName(next.displayName);
                setType(next.type);
                setCapabilities(next.capabilities);
              }}
            >
              {modelTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.displayName} · {template.apiName}
                </option>
              ))}
              {allowCustomModels ? (
                <option value="custom">{t('settings.agent.customModel')}</option>
              ) : null}
            </select>
          </label>
        ) : null}
        <label data-model-field="type">
          <span>{t('settings.agent.modelType')}</span>
          <select
            disabled={disabled || initial !== undefined || selectedTemplate !== undefined}
            value={type}
            onChange={(e) => {
              const nextType = e.currentTarget.value as DesktopAiModelType;
              setType(nextType);
              setCapabilities(defaultDesktopAiModelCapabilities(nextType));
            }}
          >
            {supportedTypes.map((candidate) => (
              <option key={candidate} value={candidate}>
                {t(`settings.agent.modelType.${candidate}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="desktop-settings__model-capability-field" data-model-field="capabilities">
          <span>{t('settings.agent.modelCapabilities')}</span>
          <Popover
            align="end"
            contentClassName="desktop-settings__model-capability-popover"
            open={capabilityMenuOpen}
            onOpenChange={setCapabilityMenuOpen}
            trigger={
              <button
                aria-label={`${t('settings.agent.modelCapabilities')}: ${capabilitySummary}`}
                aria-expanded={capabilityMenuOpen}
                aria-haspopup="menu"
                className="desktop-settings__model-capability-trigger"
                data-model-capability-trigger="true"
                disabled={disabled}
                title={selectedCapabilityLabels.join(' · ') || capabilitySummary}
                type="button"
              >
                <span>{capabilitySummary}</span>
                <span aria-hidden="true">
                  <ChevronDownIcon size={13} />
                </span>
              </button>
            }
          >
            <div
              aria-label={t('settings.agent.modelCapabilities')}
              className="desktop-settings__model-capability-menu"
              role="menu"
            >
              <small>
                {selectedTemplate
                  ? t('settings.agent.modelCapabilities.templateDescription')
                  : t('settings.agent.modelCapabilities.customDescription')}
              </small>
              <div className="desktop-settings__model-capability-menu-options">
                {capabilityOptions.map((option) => {
                  const checked = option.capabilities.every((capability) =>
                    capabilities.includes(capability),
                  );
                  return (
                    <button
                      aria-checked={checked}
                      className="desktop-settings__model-capability-option"
                      data-model-capability={option.id}
                      disabled={disabled || selectedTemplate !== undefined}
                      key={option.id}
                      role="menuitemcheckbox"
                      type="button"
                      onClick={() => {
                        const next = new Set(capabilities);
                        for (const capability of option.capabilities) {
                          if (checked) next.delete(capability);
                          else next.add(capability);
                        }
                        setCapabilities([...next]);
                      }}
                    >
                      <span className="desktop-settings__model-capability-check" aria-hidden="true">
                        {checked ? <CheckIcon size={12} /> : null}
                      </span>
                      <span>{t(`settings.agent.modelCapability.${option.id}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Popover>
        </div>
        <label data-model-field="api-name">
          <span>{t('settings.agent.apiModelName')}</span>
          <input
            disabled={disabled || selectedTemplate !== undefined}
            required
            value={apiName}
            onChange={(e) => setApiName(e.currentTarget.value)}
          />
        </label>
        <label data-model-field="display-name">
          <span>{t('settings.agent.modelName')}</span>
          <input
            disabled={disabled}
            placeholder={t('settings.agent.modelNamePlaceholder')}
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

function modelTypesForFamilies(
  families: readonly DesktopAiProviderModelFamily[],
  protocol: DesktopAiModelProtocol | undefined,
  generationModelTypes: readonly Exclude<DesktopAiModelType, 'llm'>[] | undefined,
): readonly DesktopAiModelType[] {
  if (protocol === 'ollama') return ['llm'];
  return [
    ...(families.includes('dialogue') ? (['llm'] as const) : []),
    ...(families.includes('generation') ? (generationModelTypes ?? []) : []),
  ];
}

function providerAllowsCustomModels(
  generationCapability:
    DesktopAiModelSettingsProjection['generationCapabilities'][number] | undefined,
): boolean {
  return generationCapability?.allowCustomModels ?? true;
}

function ProviderModelCatalog({
  defaults,
  disabled,
  models,
  onDeleteModel,
  onEditModel,
  onSetDefault,
}: {
  readonly defaults: DesktopAiModelSettingsProjection['defaults'];
  readonly disabled: boolean;
  readonly models: readonly DesktopAiModelView[];
  readonly onDeleteModel: (modelId: string) => Promise<boolean>;
  readonly onEditModel: (model: DesktopAiModelView) => void;
  readonly onSetDefault: (model: DesktopAiModelView) => Promise<boolean>;
}): JSX.Element {
  const { t } = useTranslation();
  const [confirmingModelId, setConfirmingModelId] = useState<string>();
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
                <span className="desktop-settings__model-actions">
                  <button
                    className="desktop-settings__model-edit-action"
                    disabled={disabled}
                    type="button"
                    onClick={() => onEditModel(model)}
                  >
                    {t('settings.agent.editModel')}
                  </button>
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
                  {confirmingModelId === model.id ? (
                    <>
                      <button
                        className="desktop-settings__model-delete-action desktop-settings__model-delete-action--confirm"
                        disabled={disabled || isDefault}
                        title={
                          isDefault ? t('settings.agent.deleteDefaultModelBlocked') : undefined
                        }
                        type="button"
                        onClick={() =>
                          void onDeleteModel(model.id).then((deleted) => {
                            if (deleted) setConfirmingModelId(undefined);
                          })
                        }
                      >
                        {t('settings.agent.confirmDelete')}
                      </button>
                      <button
                        className="desktop-settings__model-delete-action"
                        type="button"
                        onClick={() => setConfirmingModelId(undefined)}
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      className="desktop-settings__model-delete-action"
                      disabled={disabled || isDefault}
                      title={isDefault ? t('settings.agent.deleteDefaultModelBlocked') : undefined}
                      type="button"
                      onClick={() => setConfirmingModelId(model.id)}
                    >
                      {t('settings.agent.deleteModel')}
                    </button>
                  )}
                </span>
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

function SettingsGroup({
  action,
  children,
  description,
  title,
  unframed = false,
}: {
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
  readonly unframed?: boolean;
}): JSX.Element {
  return (
    <section className="desktop-settings__group">
      <div className="desktop-settings__group-heading">
        <div className="desktop-settings__group-heading-copy">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {action}
      </div>
      {unframed ? children : <div className="desktop-settings__card">{children}</div>}
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
