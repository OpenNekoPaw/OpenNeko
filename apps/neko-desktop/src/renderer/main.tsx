import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@neko/shared/i18n/react';
import { DesktopApplication } from './DesktopShell';
import { startDesktopSystemTheme } from './desktop-theme';
import {
  applyDesktopLocale,
  createDesktopI18n,
  detectDesktopLocale,
} from './i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('OpenNeko Desktop renderer root is missing.');
}

const locale = detectDesktopLocale();
const stopDesktopSystemTheme = startDesktopSystemTheme(document);
window.addEventListener('pagehide', stopDesktopSystemTheme, { once: true });
import.meta.hot?.dispose(stopDesktopSystemTheme);
applyDesktopLocale(document, locale);
const desktopI18n = createDesktopI18n(locale);

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider service={desktopI18n.i18nService}>
      <DesktopApplication />
    </I18nProvider>
  </StrictMode>,
);
