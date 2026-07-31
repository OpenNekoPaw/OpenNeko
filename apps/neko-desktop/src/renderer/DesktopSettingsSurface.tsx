import {
  ArrowLeftIcon,
  FolderIcon,
  GridIcon,
  PackageIcon,
  SearchIcon,
  SettingsIcon,
} from '@neko/ui';
import { useTranslation } from '@neko/shared/i18n/react';
import { useMemo, useState, type ReactNode } from 'react';
import type { DesktopApplicationPreferences } from '../shared/application-settings-contract';
import { useDesktopApplicationSettings } from './application-settings-context';
import {
  DesktopApplicationBrand,
  DesktopApplicationNavigationButton,
  DesktopApplicationSidebarFrame,
} from './DesktopApplicationSidebar';
import type { ControlledWorkbenchResizeBinding } from '@neko/ui';

type SettingsCategory = 'general' | 'appearance' | 'creative' | 'agent';

const categories: readonly SettingsCategory[] = ['general', 'appearance', 'creative', 'agent'];

const categoryMessageKeys = {
  general: {
    title: 'settings.category.general',
    description: 'settings.category.general.description',
  },
  appearance: {
    title: 'settings.category.appearance',
    description: 'settings.category.appearance.description',
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

export function DesktopSettingsSurface({
  onBack,
  sidebarResize,
  sidebarWidth,
}: {
  readonly onBack: () => void;
  readonly sidebarResize?: ControlledWorkbenchResizeBinding;
  readonly sidebarWidth: number;
}): JSX.Element {
  const { t } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const [category, setCategory] = useState<SettingsCategory>('general');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [diagnostic, setDiagnostic] = useState<string>();
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
  const activeCategories = query.trim() ? visibleCategories : [category];

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
    <main className="desktop-settings home-layout" aria-labelledby="desktop-settings-title">
      <DesktopApplicationSidebarFrame
        compact={false}
        expandedWidth={sidebarWidth}
        resize={sidebarResize}
      >
        <aside
          className="desktop-settings__navigation home-navigation project-primary-sidebar"
          data-primary-sidebar="application"
        >
          <div className="desktop-settings__navigation-control">
            <DesktopApplicationBrand />
            <button
              className="desktop-settings__back home-nav-button"
              type="button"
              onClick={onBack}
            >
              <ArrowLeftIcon size={16} />
              <span>{t('settings.back')}</span>
            </button>
            <label className="desktop-settings__search home-search-field">
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
              {categories.map((item) => (
                <DesktopApplicationNavigationButton
                  key={item}
                  active={item === category && !query.trim()}
                  icon={categoryIcon(item)}
                  label={t(categoryMessageKeys[item].title)}
                  onClick={() => {
                    setQuery('');
                    setCategory(item);
                  }}
                />
              ))}
            </nav>
          </div>
        </aside>
      </DesktopApplicationSidebarFrame>
      <section className="desktop-settings__content home-main">
        <div className="desktop-settings__overview">
          <header className="desktop-settings__title home-launchpad-heading">
            <span className="desktop-settings__title-icon home-launchpad-heading-icon">
              <SettingsIcon size={18} />
            </span>
            <div>
              <h1 id="desktop-settings-title">{t('settings.title')}</h1>
              <p>{t('settings.description')}</p>
            </div>
          </header>
          {diagnostic ? (
            <div className="desktop-settings__diagnostic" role="alert">
              {diagnostic}
            </div>
          ) : null}
          {visibleCategories.length === 0 ? (
            <div className="desktop-settings__empty">{t('settings.noResults')}</div>
          ) : null}
          {activeCategories.includes('general') ? (
            <SettingsGroup
              description={t('settings.category.general.description')}
              title={t('settings.category.general')}
            >
              <SettingsSelect
                disabled={pending}
                label={t('settings.startup.label')}
                description={t('settings.startup.description')}
                value={settings.projection.preferences.startupTarget}
                options={[
                  { value: 'restore', label: t('settings.startup.restore') },
                  { value: 'home', label: t('settings.startup.home') },
                ]}
                onChange={(value) =>
                  update({
                    ...settings.projection.preferences,
                    startupTarget: value,
                  })
                }
              />
            </SettingsGroup>
          ) : null}
          {activeCategories.includes('appearance') ? (
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
            </SettingsGroup>
          ) : null}
          {activeCategories.includes('creative') ? (
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
          {activeCategories.includes('agent') ? (
            <SettingsGroup
              description={t('settings.category.agent.description')}
              title={t('settings.category.agent')}
            >
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
                    setDiagnostic(undefined);
                    void settings
                      .openAgentAdvanced()
                      .catch((error: unknown) =>
                        setDiagnostic(error instanceof Error ? error.message : String(error)),
                      )
                      .finally(() => setPending(false));
                  }}
                >
                  {t('settings.agent.openConfig')}
                </button>
              </div>
              <p className="desktop-settings__authority">{t('settings.agent.authority')}</p>
            </SettingsGroup>
          ) : null}
        </div>
      </section>
    </main>
  );
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

function categoryIcon(category: SettingsCategory): JSX.Element {
  switch (category) {
    case 'general':
      return <SettingsIcon size={16} />;
    case 'appearance':
      return <GridIcon size={16} />;
    case 'creative':
      return <FolderIcon size={16} />;
    case 'agent':
      return <PackageIcon size={16} />;
  }
}
