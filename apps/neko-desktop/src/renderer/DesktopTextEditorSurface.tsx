import type {
  DesktopProjectCatalogItem,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import type { DesktopWorkbenchViewRef } from '@neko/host/desktop-workbench-contract';
import { useTranslation } from '@neko/ui/i18n/react';
import { lazy, Suspense, useCallback, useMemo, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { createElectronTextEditorHostRuntime } from './desktop-text-editor-host-runtime';

const TextEditorRoot = lazy(async () => {
  const module = await import('@neko/text-editor-webview/root');
  return { default: module.TextEditorRoot };
});

function readRendererCspNonce(): string {
  const nonce = document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce;
  if (!nonce) throw new Error('Desktop renderer CSP nonce is unavailable.');
  return nonce;
}

export function DesktopTextEditorSurface({
  contextActionsTarget,
  project,
  projection,
  view,
}: {
  readonly contextActionsTarget: HTMLDivElement | null;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly view: DesktopWorkbenchViewRef;
}): JSX.Element {
  const { locale } = useTranslation();
  const runtime = useMemo(() => {
    if (!view.documentId || !view.editorSessionId) {
      throw new Error(`Desktop Text Editor View '${view.viewId}' has incomplete identity.`);
    }
    return createElectronTextEditorHostRuntime({
      bridge: window.openNekoDesktop,
      identity: {
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        windowId: projection.window.windowId,
        viewId: view.viewId,
        viewInstanceId: view.viewInstanceId,
        documentId: view.documentId,
        sessionId: view.editorSessionId,
        rendererSessionId: projection.rendererSessionId,
      },
    });
  }, [
    project.projectId,
    project.workspaceId,
    projection.rendererSessionId,
    projection.window.windowId,
    view.documentId,
    view.editorSessionId,
    view.viewId,
    view.viewInstanceId,
  ]);
  const renderContextActions = useCallback(
    (actions: ReactElement) =>
      contextActionsTarget ? createPortal(actions, contextActionsTarget) : null,
    [contextActionsTarget],
  );

  return (
    <section
      className="desktop-text-editor-surface"
      data-owner-root="text-editor"
      data-owner-view-id={view.viewId}
    >
      <Suspense fallback={<div className="preview-main-loading" role="status" />}>
        <TextEditorRoot
          key={view.viewId}
          runtime={runtime}
          locale={locale}
          cspNonce={readRendererCspNonce()}
          renderContextActions={renderContextActions}
        />
      </Suspense>
    </section>
  );
}
