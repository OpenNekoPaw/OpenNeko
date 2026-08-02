// @vitest-environment jsdom

import { I18nProvider } from '@neko/ui/i18n/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
  type DesktopApplicationSettingsProjection,
} from '@neko/host/application-settings';
import { DesktopSettingsSurface } from './DesktopSettingsSurface';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import { createDesktopI18n } from './i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('DesktopSettingsSurface', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    expect(container.querySelector('.desktop-settings')?.classList).toContain('home-layout');
    expect(
      container
        .querySelector('[data-primary-sidebar-frame="application"]')
        ?.getAttribute('data-primary-sidebar-default-width'),
    ).toBe('240');
    expect(
      container
        .querySelector('[data-primary-sidebar-frame="application"]')
        ?.getAttribute('data-primary-sidebar-width'),
    ).toBe('288');
    expect(container.querySelector('.desktop-settings__navigation')?.classList).toContain(
      'home-navigation',
    );
    expect(container.querySelector('.desktop-settings__navigation-control')).not.toBeNull();
    expect(container.querySelector('.desktop-settings__content')?.classList).toContain('home-main');
    expect(container.querySelector('.home-brand')?.textContent).toContain('OpenNeko');
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

  it('uses the Home heading typography instead of a Settings-only font hierarchy', async () => {
    const { container, root } = await renderSettings();

    expect(container.querySelector('.desktop-settings__title')?.classList).toContain(
      'home-launchpad-heading',
    );

    await act(async () => root.unmount());
  });

  it('exposes the application primary-sidebar resize control', async () => {
    const { container, root } = await renderSettings();

    expect(container.querySelector('[aria-label="Resize application navigation"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('commits the final application sidebar width through the shared resize binding', async () => {
    const onResizeEnd = vi.fn();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { container, root } = await renderSettings({ onResizeEnd });
    const frame = container.querySelector<HTMLElement>(
      '[data-primary-sidebar-frame="application"]',
    );
    const handle = container.querySelector<HTMLElement>(
      '[aria-label="Resize application navigation"]',
    );
    if (!frame || !handle) throw new Error('Settings fixture requires a resizable sidebar.');
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      bottom: 800,
      height: 800,
      left: 0,
      right: 288,
      top: 0,
      width: 288,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      dispatchPointer(handle, 'pointerdown', 1, 288);
      dispatchPointer(handle, 'pointermove', 1, 320);
      dispatchPointer(handle, 'pointerup', 1, 320);
    });

    expect(onResizeEnd).toHaveBeenCalledOnce();
    expect(onResizeEnd).toHaveBeenCalledWith(320);
    expect(frame.getAttribute('data-primary-sidebar-width')).toBe('320');

    await act(async () => root.unmount());
  });

  it('filters settings categories using localized labels', async () => {
    const { container, root } = await renderSettings();
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('Settings fixture requires a search field.');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
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
  onResizeEnd = vi.fn(),
  openAgentAdvanced = vi.fn(async () => undefined),
  update = vi.fn(async () => undefined),
}: {
  readonly onBack?: () => void;
  readonly onResizeEnd?: (width: number) => void;
  readonly openAgentAdvanced?: () => Promise<void>;
  readonly update?: (
    preferences: DesktopApplicationSettingsProjection['preferences'],
  ) => Promise<void>;
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
          <DesktopSettingsSurface
            onBack={onBack}
            sidebarResize={{
              label: 'Resize application navigation',
              minSize: 208,
              maxSize: 360,
              onResizeEnd,
            }}
            sidebarWidth={288}
          />
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

function dispatchPointer(
  target: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  clientX: number,
): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: 200 },
    pointerId: { value: pointerId },
  });
  target.dispatchEvent(event);
}
