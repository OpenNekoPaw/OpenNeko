import { CanvasWebviewRoot } from '@neko-canvas/webview/root';
import { useMemo } from 'react';
import type { DesktopProjectCatalogItem, DesktopShellProjection } from '../shared/shell-contract';
import type { DesktopWorkbenchViewRef } from '../shared/workbench-contract';
import { createCanvasHostSessionId } from '@neko-canvas/domain';
import { createElectronCanvasHostRuntime } from './desktop-canvas-host-runtime';
import { createDesktopCanvasWebviewDelegate } from './desktop-canvas-webview-delegate';

export function DesktopCanvasSurface({
  project,
  projection,
  view,
}: {
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly view: DesktopWorkbenchViewRef;
}): JSX.Element {
  const documentId = requireCanvasDocumentId(view);
  const identity = useMemo(
    () => ({
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId: projection.window.windowId,
      viewId: view.viewId,
      viewEpoch: view.viewEpoch,
      documentId,
      sessionId: createCanvasHostSessionId(view.viewId, view.viewEpoch),
      endpointEpoch: projection.endpointEpoch,
    }),
    [
      project.projectId,
      project.workspaceId,
      projection.endpointEpoch,
      projection.window.windowId,
      documentId,
      view.viewEpoch,
      view.viewId,
    ],
  );
  const runtime = useMemo(() => createElectronCanvasHostRuntime(identity), [identity]);
  const delegate = useMemo(() => createDesktopCanvasWebviewDelegate(identity), [identity]);
  return (
    <section
      className="desktop-canvas-surface"
      data-owner-root="canvas"
      data-owner-view-id={view.viewId}
      aria-label="Canvas"
    >
      <CanvasWebviewRoot delegate={delegate} locale="zh-cn" runtime={runtime} />
    </section>
  );
}

function requireCanvasDocumentId(view: DesktopWorkbenchViewRef): string {
  if (view.kind !== 'canvas' || !view.documentId) {
    throw new Error('Desktop Canvas surface requires an explicit Canvas document View.');
  }
  return view.documentId;
}
