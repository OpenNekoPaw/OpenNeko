// @vitest-environment jsdom

import { I18nProvider } from '@neko/shared/i18n/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
  type DesktopApplicationSettingsProjection,
} from '../shared/application-settings-contract';
import { DesktopSettingsSurface } from './DesktopSettingsSurface';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { createDesktopI18n } from './i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('DesktopSettingsSurface', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('updates Desktop-owned preferences without treating Agent config as their authority', async () => {
    const update = vi.fn(async () => undefined);
    const openAgentAdvanced = vi.fn(async () => undefined);
    const onBack = vi.fn();
    const { container, root } = await renderSettings({
      update,
      openAgentAdvanced,
      onBack,
    });

    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('Startup destination');
    const startup = container.querySelector<HTMLSelectElement>('select');
    if (!startup) throw new Error('Settings fixture requires the startup select.');
    await act(async () => {
      startup.value = 'home';
      startup.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(update).toHaveBeenCalledWith({
      theme: 'system',
      locale: 'system',
      startupTarget: 'home',
      resourceBrowserView: 'list',
    });

    const agentCategory = findButton(container, 'Agent');
    await act(async () => agentCategory.click());
    expect(container.textContent).toContain(
      'Desktop preferences are stored separately and never written to that file.',
    );
    await act(async () => findButton(container, 'Open Agent config').click());
    expect(openAgentAdvanced).toHaveBeenCalledTimes(1);

    await act(async () => findButton(container, 'Back to OpenNeko').click());
    expect(onBack).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('filters settings categories using localized labels', async () => {
    const { container, root } = await renderSettings();
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Settings fixture requires a search field.');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      if (!setValue) throw new Error('HTMLInputElement value setter is unavailable.');
      setValue.call(search, 'theme');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('Theme');
    expect(container.textContent).not.toContain('Startup destination');
    await act(async () => root.unmount());
  });
});

async function renderSettings({
  onBack = vi.fn(),
  openAgentAdvanced = vi.fn(async () => undefined),
  update = vi.fn(async () => undefined),
}: {
  readonly onBack?: () => void;
  readonly openAgentAdvanced?: () => Promise<void>;
  readonly update?: (preferences: DesktopApplicationSettingsProjection['preferences']) => Promise<void>;
} = {}) {
  const i18n = createDesktopI18n('en');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <I18nProvider service={i18n.i18nService}>
        <DesktopApplicationSettingsProvider
          value={{
            projection: {
              schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
              revision: 3,
              eventSequence: 2,
              preferences: {
                theme: 'system',
                locale: 'system',
                startupTarget: 'restore',
                resourceBrowserView: 'list',
              },
            },
            update,
            openAgentAdvanced,
          }}
        >
          <DesktopSettingsSurface onBack={onBack} />
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
