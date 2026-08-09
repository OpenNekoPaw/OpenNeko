// @vitest-environment jsdom

import { I18nProvider } from '@neko/ui/i18n/react';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DesktopApplicationSettingsProjection } from '@neko/host/application-settings';
import {
  DesktopSettingsMainSurface,
  DesktopSettingsNavigationSurface,
  type DesktopSettingsSection,
} from './DesktopSettingsSurface';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { createDesktopI18n } from './i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Desktop Settings scene surfaces', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('keeps navigation and settings mutations in separate Workbench slots', async () => {
    const update = vi.fn(async () => undefined);
    const openAgentAdvanced = vi.fn(async () => undefined);
    const { container, root } = await renderSettings({ update, openAgentAdvanced });

    expect(container.querySelector('[data-settings-surface="navigation"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-surface="main"]')).not.toBeNull();
    expect(container.querySelector('[data-primary-sidebar="application"]')).toBeNull();
    expect(container.querySelector('[data-primary-sidebar-frame="application"]')).toBeNull();
    expect(container.textContent).toContain('Application entry');
    expect(container.textContent).toContain('always starts with a new Entry Draft');
    expect(container.querySelector('select')).toBeNull();
    expect(update).not.toHaveBeenCalled();

    await act(async () => findButton(container, 'Agent').click());
    expect(container.textContent).toContain(
      'Desktop preferences are stored separately and never written to that file.',
    );
    await act(async () => findButton(container, 'Open Agent config').click());
    expect(openAgentAdvanced).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('renders the settings heading without a decorative icon', async () => {
    const { container, root } = await renderSettings();
    const heading = container.querySelector('.desktop-settings__title');

    expect(heading?.querySelector('svg')).toBeNull();
    expect(heading?.textContent).toContain('Settings');
    await act(async () => root.unmount());
  });

  it('filters only the navigation catalog without changing the active Main section', async () => {
    const { container, root } = await renderSettings();
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Settings fixture requires a search field.');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!setValue) throw new Error('HTMLInputElement value setter is unavailable.');
      setValue.call(search, 'theme');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.querySelector('[data-settings-surface="navigation"]')?.textContent).toContain(
      'Appearance',
    );
    expect(container.querySelector('[data-settings-surface="main"]')?.textContent).toContain(
      'Application entry',
    );
    await act(async () => root.unmount());
  });

  it('restores only the Host-owned section and resets transient search on remount', async () => {
    const first = await renderSettings();
    const search = first.container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Settings fixture requires a search field.');
    await act(async () => {
      search.value = 'theme';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => first.root.unmount());

    const restored = await renderSettings({ initialSection: 'appearance' });
    expect(restored.container.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe(
      '',
    );
    expect(
      restored.container.querySelector('[data-settings-surface="main"]')?.textContent,
    ).toContain('Theme');
    await act(async () => restored.root.unmount());
  });
});

async function renderSettings({
  openAgentAdvanced = vi.fn(async () => undefined),
  initialSection = 'general',
  update = vi.fn(async () => undefined),
}: {
  readonly openAgentAdvanced?: () => Promise<void>;
  readonly initialSection?: DesktopSettingsSection;
  readonly update?: (
    preferences: DesktopApplicationSettingsProjection['preferences'],
  ) => Promise<void>;
} = {}) {
  const i18n = createDesktopI18n('en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Fixture(): JSX.Element {
    const [section, setSection] = useState<DesktopSettingsSection>(initialSection);
    return (
      <>
        <DesktopSettingsNavigationSurface activeSection={section} onSectionChange={setSection} />
        <DesktopSettingsMainSurface section={section} />
      </>
    );
  }
  await act(async () => {
    root.render(
      <I18nProvider service={i18n.i18nService}>
        <DesktopApplicationSettingsProvider
          value={{
            projection: {
              eventSequence: 2,
              preferences: {
                theme: 'system',
                locale: 'system',
                resourceBrowserView: 'list',
              },
            },
            update,
            openAgentAdvanced,
          }}
        >
          <Fixture />
        </DesktopApplicationSettingsProvider>
      </I18nProvider>,
    );
  });
  return { container, root };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Settings fixture requires button '${label}'.`);
  return button;
}
