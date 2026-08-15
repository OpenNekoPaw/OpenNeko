import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import { createCanvasWebviewHost } from '@neko/canvas-webview/host-runtime';
import type {
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import type { DesktopWorkbenchViewRef } from '@neko/host/desktop-workbench-contract';
import { createCanvasHostSessionId } from '@neko/canvas-domain';
import { createElectronCanvasHostRuntime } from './desktop-canvas-host-runtime';
import { createDesktopCanvasWebviewDelegate } from './desktop-canvas-webview-delegate';

const CanvasWebviewRoot = lazy(async () => {
  const module = await import('@neko/canvas-webview/root');
  return { default: module.CanvasWebviewRoot };
});

export function DesktopCanvasSurface({
  project,
  projection,
  view,
}: {
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly view: DesktopWorkbenchViewRef;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const documentId = requireCanvasDocumentId(view);
  const identity = useMemo(
    () => ({
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId: projection.window.windowId,
      viewId: view.viewId,
      viewInstanceId: view.viewInstanceId,
      documentId,
      sessionId: createCanvasHostSessionId(view.viewId, view.viewInstanceId),
      rendererSessionId: projection.rendererSessionId,
    }),
    [
      project.projectId,
      project.workspaceId,
      projection.rendererSessionId,
      projection.window.windowId,
      documentId,
      view.viewInstanceId,
      view.viewId,
    ],
  );
  const runtime = useMemo(() => createElectronCanvasHostRuntime(identity), [identity]);
  const delegate = useMemo(() => createDesktopCanvasWebviewDelegate(identity), [identity]);
  const hostLifetime = useMemo(
    () => ({ host: createCanvasWebviewHost(runtime, delegate), mounted: false }),
    [delegate, runtime],
  );
  const host = hostLifetime.host;
  useEffect(() => {
    hostLifetime.mounted = true;
    host.prepare();
    return () => {
      hostLifetime.mounted = false;
      queueMicrotask(() => {
        if (!hostLifetime.mounted) host.dispose();
      });
    };
  }, [host, hostLifetime]);
  return (
    <section
      className="desktop-canvas-surface"
      data-owner-root="canvas"
      data-owner-view-id={view.viewId}
      aria-label="Canvas"
    >
      <Suspense
        fallback={
          <div className="creative-main-placeholder" role="status">
            {t('workspace.canvas.loading')}
          </div>
        }
      >
        <CanvasWebviewRoot host={host} lifecyclePresentation="active" locale={locale} />
      </Suspense>
    </section>
  );
}

function requireCanvasDocumentId(view: DesktopWorkbenchViewRef): string {
  if (view.kind !== 'canvas' || !view.documentId) {
    throw new Error('Desktop Canvas surface requires an explicit Canvas document View.');
  }
  return view.documentId;
}
