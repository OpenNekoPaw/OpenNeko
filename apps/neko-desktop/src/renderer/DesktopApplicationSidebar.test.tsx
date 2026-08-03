// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import { DesktopApplicationBrand } from './DesktopApplicationSidebar';
import { createDesktopI18n } from './i18n';

describe('DesktopApplicationBrand', () => {
  it('uses the text-only OpenNeko title as the existing sidebar action', () => {
    const onClick = vi.fn();
    const i18n = createDesktopI18n('en');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <DesktopApplicationBrand
            showMark={false}
            titleAction={{ label: 'Collapse sidebar', onClick }}
          />
        </I18nProvider>,
      );
    });

    const title = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse sidebar"]',
    );
    if (!title) throw new Error('Expected the OpenNeko title action.');
    expect(title.textContent).toBe('OpenNeko');
    expect(container.querySelector('.brand-mark')).toBeNull();
    expect(title.querySelector('svg')).toBeNull();

    act(() => title.click());
    expect(onClick).toHaveBeenCalledOnce();

    act(() => root.unmount());
    container.remove();
  });

  it('keeps the compact brand mark inside the sidebar action hit target', () => {
    const onClick = vi.fn();
    const i18n = createDesktopI18n('en');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <DesktopApplicationBrand
            showMark
            titleAction={{ label: 'Expand sidebar', onClick }}
          />
        </I18nProvider>,
      );
    });

    const title = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand sidebar"]',
    );
    if (!title) throw new Error('Expected the compact OpenNeko title action.');
    expect(title.querySelector('.brand-mark')?.textContent).toBe('N');
    expect(container.querySelector('.home-brand > .brand-mark')).toBeNull();

    act(() => title.click());
    expect(onClick).toHaveBeenCalledOnce();

    act(() => root.unmount());
    container.remove();
  });
});
