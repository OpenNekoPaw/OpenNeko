import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import type {
  DesktopProjectCatalogItem,
  DesktopProjectTabProjection,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { createDesktopResourceBrowserIdentity } from '../shared/resource-browser-bridge-contract';
import { createElectronResourceBrowserHostRuntime } from './desktop-resource-browser-host-runtime';
import { useDesktopApplicationSettings } from './application-settings-context';

const ResourceBrowserRoot = lazy(async () => {
  const module = await import('@neko/assets-webview/resource-browser/root');
  return { default: module.ResourceBrowserRoot };
});

const QuickPreviewSurface = lazy(async () => {
  const module = await import('@neko/preview-webview/quick-preview');
  return { default: module.QuickPreviewSurface };
});

export function DesktopResourceBrowserSurface({
  onOpenCanvasDocument,
  project,
  projection,
  tab,
}: {
  readonly onOpenCanvasDocument: (documentId: string, presentation: 'main' | 'side') => void;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly tab: DesktopProjectTabProjection;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const applicationSettings = useDesktopApplicationSettings();
  const runtime = useMemo(
    () =>
      createElectronResourceBrowserHostRuntime({
        bridge: window.openNekoDesktop,
        identity: createDesktopResourceBrowserIdentity({
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          windowId: projection.window.windowId,
          projectViewId: tab.viewId,
          projectViewInstanceId: tab.viewInstanceId,
          rendererSessionId: projection.rendererSessionId,
        }),
      }),
    [
      project.projectId,
      project.workspaceId,
      projection.rendererSessionId,
      projection.window.windowId,
      tab.viewInstanceId,
      tab.viewId,
    ],
  );
  return (
    <div className="desktop-resource-browser-root" data-owner-root="assets">
      <Suspense
        fallback={
          <div className="resource-dock-loading" role="status">
            {t('workspace.assets.loading')}
          </div>
        }
      >
        <ResourceBrowserRoot
          chrome="embedded"
          runtime={runtime}
          locale={locale}
          lifecyclePresentation="active"
          refreshControl="hidden"
          defaultViewMode={applicationSettings.projection.preferences.resourceBrowserView}
          previewTarget={{
            viewId: `preview:${tab.viewId}:temporary`,
            presentation: 'temporary',
          }}
          onOpenCanvas={(item, presentation) => {
            if (
              (item.facet !== 'files' && item.facet !== 'media') ||
              item.locator.kind !== 'workspace-file'
            ) {
              throw new Error('Canvas documents require a workspace-file ContentLocator.');
            }
            onOpenCanvasDocument(item.locator.path, presentation);
          }}
          renderQuickPreview={(descriptor) => (
            <Suspense fallback={null}>
              <QuickPreviewSurface descriptor={descriptor} locale={locale} />
            </Suspense>
          )}
        />
      </Suspense>
    </div>
  );
}
