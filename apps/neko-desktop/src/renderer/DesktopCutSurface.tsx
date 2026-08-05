import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import { createCutHostRuntimeWebviewBridge } from '@neko/cut-webview/runtime-bridge';
import type {
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import type { DesktopWorkbenchViewRef } from '@neko/host/desktop-workbench-contract';
import { createCutHostSessionId } from '@neko/cut-domain';
import { createElectronCutHostRuntime } from './desktop-cut-host-runtime';

const CutWebviewRoot = lazy(async () => {
  const module = await import('@neko/cut-webview/root');
  return { default: module.CutWebviewRoot };
});

export function DesktopCutSurface({
  project,
  projection,
  lifecyclePresentation,
  timelineTarget,
  view,
}: {
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly lifecyclePresentation: 'active' | 'suspended';
  readonly timelineTarget?: Element;
  readonly view: DesktopWorkbenchViewRef;
}): JSX.Element {
  const { locale, t } = useTranslation();
  if (!view.documentId) {
    throw new Error('Desktop Cut View requires an OTIO document identity.');
  }
  const documentId = view.documentId;
  const runtime = useMemo(
    () =>
      createElectronCutHostRuntime({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        windowId: projection.window.windowId,
        viewId: view.viewId,
        viewInstanceId: view.viewInstanceId,
        documentId,
        sessionId: createCutHostSessionId(view.viewId, view.viewInstanceId),
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
  const bridge = useMemo(() => createCutHostRuntimeWebviewBridge(runtime), [runtime]);
  return (
    <section
      className="desktop-cut-surface"
      data-owner-root="cut"
      data-owner-view-id={view.viewId}
      aria-label="Cut"
    >
      <Suspense
        fallback={
          <div className="creative-main-placeholder" role="status">
            {t('workspace.cut.loading')}
          </div>
        }
      >
        <CutWebviewRoot
          bridge={bridge}
          lifecyclePresentation={lifecyclePresentation}
          locale={locale}
          timelineTarget={timelineTarget}
        />
      </Suspense>
    </section>
  );
}
