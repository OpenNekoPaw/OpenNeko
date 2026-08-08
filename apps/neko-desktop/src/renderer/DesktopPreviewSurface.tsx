import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import { usePreviewViewerSnapshotStore } from '@neko/preview-webview/presentation-snapshot';
import { createPreviewRuntimeBootstrap } from '@neko/preview-webview/runtime-bootstrap';
import type {
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import type { DesktopWorkbenchViewRef } from '@neko/host/desktop-workbench-contract';
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
  const snapshotStore = usePreviewViewerSnapshotStore();
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
        viewInstanceId: view.viewInstanceId,
        documentId: view.documentId,
        sessionId: view.ownerId,
        rendererSessionId: projection.rendererSessionId,
      },
    });
  }, [
    project.projectId,
    project.workspaceId,
    projection.rendererSessionId,
    projection.window.windowId,
    view.documentId,
    view.ownerId,
    view.viewInstanceId,
    view.viewId,
  ]);
  const bootstrap = useMemo(() => createPreviewRuntimeBootstrap(runtime), [runtime]);
  const bootstrapLifetime = useMemo(() => ({ bootstrap, mounted: false }), [bootstrap]);
  useEffect(() => {
    bootstrapLifetime.mounted = true;
    bootstrapLifetime.bootstrap.prepare();
    return () => {
      bootstrapLifetime.mounted = false;
      queueMicrotask(() => {
        if (!bootstrapLifetime.mounted) bootstrapLifetime.bootstrap.dispose();
      });
    };
  }, [bootstrapLifetime]);

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
        <PreviewRoot
          bootstrap={bootstrap}
          chrome="content-only"
          lifecyclePresentation="active"
          locale={locale}
          snapshotStore={snapshotStore}
        />
      </Suspense>
    </section>
  );
}
