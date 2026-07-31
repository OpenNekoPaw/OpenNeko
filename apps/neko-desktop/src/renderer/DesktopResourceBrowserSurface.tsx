import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from '@neko/shared/i18n/react';
import type {
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '../shared/shell-contract';
import type { DesktopWorkbenchViewRef } from '../shared/workbench-contract';
import { createDesktopResourceBrowserIdentity } from '../shared/resource-browser-bridge-contract';
import { createElectronResourceBrowserHostRuntime } from './desktop-resource-browser-host-runtime';
import { useDesktopApplicationSettings } from './application-settings-context';

const ResourceBrowserRoot = lazy(async () => {
  const module = await import('neko-assets/resource-browser/root');
  return { default: module.ResourceBrowserRoot };
});

const QuickPreviewSurface = lazy(async () => {
  const module = await import('@neko/preview-webview/root');
  return { default: module.QuickPreviewSurface };
});

export function DesktopResourceBrowserSurface({
  onOpenCanvasDocument,
  project,
  projection,
  view,
}: {
  readonly onOpenCanvasDocument: (documentId: string, presentation: 'main' | 'side') => void;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly view: DesktopWorkbenchViewRef;
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
          viewId: view.viewId,
          viewEpoch: view.viewEpoch,
          endpointEpoch: projection.endpointEpoch,
        }),
      }),
    [
      project.projectId,
      project.workspaceId,
      projection.endpointEpoch,
      projection.window.windowId,
      view.viewEpoch,
      view.viewId,
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
          runtime={runtime}
          locale={locale}
          defaultViewMode={applicationSettings.projection.preferences.resourceBrowserView}
          previewTarget={{
            viewId: `preview:${view.viewId}:temporary`,
            presentation: 'temporary',
            expectedWorkbenchRevision: projection.window.workbench.revision,
          }}
          onOpenCanvas={(item, presentation) => {
            if (item.facet === 'entities' || item.locator.kind !== 'workspace-file') {
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
