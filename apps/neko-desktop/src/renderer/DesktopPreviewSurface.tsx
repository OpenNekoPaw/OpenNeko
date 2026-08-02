import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import type { DesktopProjectCatalogItem, DesktopShellProjection } from '../shared/shell-contract';
import type { DesktopWorkbenchViewRef } from '../shared/workbench-contract';
import { createElectronPreviewHostRuntime } from './desktop-preview-host-runtime';

const PreviewRoot = lazy(async () => {
  const module = await import('@neko/preview-webview/root');
  return { default: module.PreviewRoot };
});

export function DesktopPreviewSurface({
  project,
  projection,
  view,
}: {
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly view: DesktopWorkbenchViewRef;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const runtime = useMemo(() => {
    if (!view.documentId) {
      throw new Error(`Desktop Preview View '${view.viewId}' has no document identity.`);
    }
    return createElectronPreviewHostRuntime({
      bridge: window.openNekoDesktop,
      identity: {
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        windowId: projection.window.windowId,
        viewId: view.viewId,
        viewEpoch: view.viewEpoch,
        documentId: view.documentId,
        sessionId: view.ownerId,
        endpointEpoch: projection.endpointEpoch,
        revision: 0,
      },
    });
  }, [
    project.projectId,
    project.workspaceId,
    projection.endpointEpoch,
    projection.window.windowId,
    view.documentId,
    view.ownerId,
    view.viewEpoch,
    view.viewId,
  ]);

  return (
    <section
      className="desktop-preview-surface"
      data-owner-root="preview"
      data-owner-view-id={view.viewId}
      aria-label="Preview"
    >
      <Suspense
        fallback={
          <div className="preview-main-loading" role="status">
            {t('workspace.preview.loading')}
          </div>
        }
      >
        <PreviewRoot runtime={runtime} locale={locale} />
      </Suspense>
    </section>
  );
}
