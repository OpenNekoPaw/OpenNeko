// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@neko/ui/i18n/react';
import { DesktopApplicationBrand } from './DesktopApplicationSidebar';
import { createDesktopI18n } from './i18n';

describe('DesktopApplicationBrand', () => {
  it('renders the expanded text-only OpenNeko brand as presentation', () => {
    const i18n = createDesktopI18n('en');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <DesktopApplicationBrand showMark={false} />
        </I18nProvider>,
      );
    });

    expect(container.querySelector('.home-brand')?.textContent).toBe('OpenNeko');
    expect(container.querySelector('.brand-mark')).toBeNull();
    expect(container.querySelector('button')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('keeps the compact brand mark in the brand presentation', () => {
    const i18n = createDesktopI18n('en');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <I18nProvider service={i18n.i18nService}>
          <DesktopApplicationBrand showMark />
        </I18nProvider>,
      );
    });

    expect(container.querySelector('.home-brand > .brand-mark')?.textContent).toBe('N');
    expect(container.querySelector('button')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
