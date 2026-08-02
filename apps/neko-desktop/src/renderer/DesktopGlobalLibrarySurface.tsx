import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import { createDesktopGlobalLibraryRuntime } from './desktop-global-library-runtime';
import { useDesktopApplicationSettings } from './application-settings-context';

const GlobalLibraryBrowserRoot = lazy(async () => {
  const module = await import('@neko-assets/webview/global-library/root');
  return { default: module.GlobalLibraryBrowserRoot };
});

export function DesktopGlobalLibrarySurface({
  interactive,
}: {
  readonly interactive: boolean;
}): JSX.Element {
  const { locale } = useTranslation();
  const settings = useDesktopApplicationSettings();
  const runtime = useMemo(
    () =>
      typeof window === 'undefined'
        ? undefined
        : createDesktopGlobalLibraryRuntime(window.openNekoDesktop),
    [],
  );
  if (!runtime) return <div className="desktop-global-library-root" />;
  return (
    <div className="desktop-global-library-root">
      <Suspense fallback={null}>
        <GlobalLibraryBrowserRoot
          runtime={runtime}
          locale={locale}
          interactive={interactive}
          defaultViewMode={settings.projection.preferences.resourceBrowserView}
          confirmAction={(message) => window.confirm(message)}
          onViewModeChange={(resourceBrowserView) =>
            settings.update({
              ...settings.projection.preferences,
              resourceBrowserView,
            })
          }
        />
      </Suspense>
    </div>
  );
}
