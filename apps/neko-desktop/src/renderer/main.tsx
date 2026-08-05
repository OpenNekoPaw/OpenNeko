import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@neko/ui/i18n/react';
import { DesktopApplication } from './DesktopShell';
import { startDesktopTheme, type DesktopThemeController } from './desktop-theme';
import { applyDesktopLocale, createDesktopI18n, resolveDesktopLocalePreference } from './i18n';
import { DesktopApplicationSettingsProvider } from './application-settings-context';
import type {
  DesktopApplicationPreferences,
  DesktopApplicationSettingsProjection,
} from '@neko/host/application-settings';
import type { WebviewI18nAdapter } from '@neko/ui/i18n/webview';
import { initializeDesktopRendererBridge } from './desktop-renderer-startup';
import { DesktopRootErrorBoundary } from './DesktopSurfaceErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('OpenNeko Desktop renderer root is missing.');
}

void startRenderer(rootElement).catch((error: unknown) => {
  rootElement.textContent = error instanceof Error ? error.message : String(error);
  rootElement.setAttribute('role', 'alert');
  throw error;
});

async function startRenderer(container: HTMLElement): Promise<void> {
  const initialSettings = await initializeDesktopRendererBridge(window.openNekoDesktop);
  const initialLocale = resolveDesktopLocalePreference(initialSettings.preferences.locale);
  const themeController = startDesktopTheme(document, initialSettings.preferences.theme);
  const desktopI18n = createDesktopI18n(initialLocale);
  applyDesktopLocale(document, initialLocale);

  const disposeTheme = (): void => themeController.dispose();
  window.addEventListener('pagehide', disposeTheme, { once: true });
  import.meta.hot?.dispose(disposeTheme);
  createRoot(container).render(
    <StrictMode>
      <DesktopRootErrorBoundary
        title={desktopI18n.t('shell.rootRenderFailure')}
        description={desktopI18n.t('shell.rootRenderFailureDetail')}
        retryLabel={desktopI18n.t('shell.retrySurface')}
      >
        <DesktopRendererRoot
          i18n={desktopI18n}
          initialSettings={initialSettings}
          themeController={themeController}
        />
      </DesktopRootErrorBoundary>
    </StrictMode>,
  );
}

function DesktopRendererRoot({
  i18n,
  initialSettings,
  themeController,
}: {
  readonly i18n: WebviewI18nAdapter;
  readonly initialSettings: DesktopApplicationSettingsProjection;
  readonly themeController: DesktopThemeController;
}): JSX.Element {
  const [settings, setSettings] = useState(initialSettings);
  const applyProjection = useCallback(
    (projection: DesktopApplicationSettingsProjection): void => {
      const locale = resolveDesktopLocalePreference(projection.preferences.locale);
      themeController.update(projection.preferences.theme);
      i18n.setLocale(locale);
      applyDesktopLocale(document, locale);
      setSettings(projection);
    },
    [i18n, themeController],
  );
  useEffect(
    () =>
      window.openNekoDesktop.settings.subscribe((event) => {
        applyProjection(event.projection);
      }),
    [applyProjection],
  );
  const runtime = useMemo(
    () => ({
      projection: settings,
      async update(preferences: DesktopApplicationPreferences) {
        applyProjection(await window.openNekoDesktop.settings.update(preferences));
      },
      openAgentAdvanced: () => window.openNekoDesktop.settings.openAgentAdvanced(),
    }),
    [applyProjection, settings],
  );
  return (
    <I18nProvider service={i18n.i18nService}>
      <DesktopApplicationSettingsProvider value={runtime}>
        <DesktopApplication />
      </DesktopApplicationSettingsProvider>
    </I18nProvider>
  );
}
