import {
  CANVAS_DEFAULT_DOCUMENT_PATH,
  type CanvasWorkspaceContextCatalog,
} from '@neko/canvas-domain';
import type { DesktopShellProjection } from '@neko/host/desktop-shell-contract';
import {
  openOrFocusMainView,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';
import type {
  DesktopCanvasWorkspaceDocumentOpenRequest,
  DesktopCanvasWorkspaceDocumentOpenResult,
  DesktopCanvasWorkspaceIndexCatalogRequest,
  DesktopCanvasWorkspaceIndexCatalogResult,
} from '../shared/canvas-bridge-contract';
import type { WorkspaceMainSuggestion } from './WorkspaceEmptyMainSuggestions';

export interface DesktopWorkspaceQuickOpenInput {
  readonly requestId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly workspaceGrantId: string;
  readonly workbenchInstanceId: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly mainGroupId: string;
  readonly suggestion: WorkspaceMainSuggestion;
  readonly createId?: () => string;
}

export interface DesktopWorkspaceQuickOpenPorts {
  updateWorkbench(
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<DesktopShellProjection>;
  readCanvasCatalog(
    request: DesktopCanvasWorkspaceIndexCatalogRequest,
  ): Promise<DesktopCanvasWorkspaceIndexCatalogResult>;
  openCanvasDocument(
    request: DesktopCanvasWorkspaceDocumentOpenRequest,
  ): Promise<DesktopCanvasWorkspaceDocumentOpenResult>;
  getShellSnapshot(): Promise<DesktopShellProjection>;
}

export async function executeDesktopWorkspaceQuickOpen(
  input: DesktopWorkspaceQuickOpenInput,
  ports: DesktopWorkspaceQuickOpenPorts,
): Promise<DesktopShellProjection> {
  if (input.suggestion.kind === 'default-canvas') {
    const viewId = `canvas:${input.projectId}:workspace`;
    const existing = input.workbench.main.views.find((view) => view.viewId === viewId);
    if (
      existing &&
      (existing.kind !== 'canvas' ||
        existing.projectId !== input.projectId ||
        existing.workspaceId !== input.workspaceId ||
        existing.documentId !== CANVAS_DEFAULT_DOCUMENT_PATH)
    ) {
      throw new Error(`Default Workspace Canvas View '${viewId}' has an invalid identity.`);
    }
    const targetWorkbench = openOrFocusMainView(
      input.workbench,
      existing ?? {
        viewId,
        viewInstanceId: `view-instance:${(input.createId ?? (() => globalThis.crypto.randomUUID()))()}`,
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        kind: 'canvas',
        ownerId: `canvas:${input.projectId}`,
        displayLabel: input.suggestion.label,
        documentId: CANVAS_DEFAULT_DOCUMENT_PATH,
      },
      { groupId: input.mainGroupId },
    );
    return ports.updateWorkbench(input.workbenchInstanceId, targetWorkbench);
  }

  const catalogResult = await ports.readCanvasCatalog({
    requestId: `${input.requestId}:resolve`,
    workspaceId: input.workspaceId,
    workspaceGrantId: input.workspaceGrantId,
  });
  requireCurrentCanvasSuggestion(catalogResult.catalog, input.workspaceId, input.suggestion);
  await ports.openCanvasDocument({
    requestId: input.requestId,
    workspaceId: input.workspaceId,
    workspaceGrantId: input.workspaceGrantId,
    canvasId: input.suggestion.canvasId,
  });
  return ports.getShellSnapshot();
}

function requireCurrentCanvasSuggestion(
  catalog: CanvasWorkspaceContextCatalog,
  workspaceId: string,
  suggestion: Extract<WorkspaceMainSuggestion, { readonly kind: 'canvas-document' }>,
): void {
  if (catalog.workspaceId !== workspaceId) {
    throw new Error('Workspace Canvas catalog does not match its requested Workspace.');
  }
  const option = catalog.options.find(
    (candidate) =>
      candidate.target.workspaceId === workspaceId &&
      candidate.target.canvasId === suggestion.canvasId,
  );
  if (!option) {
    throw new Error(`Workspace Canvas '${suggestion.canvasId}' is no longer available.`);
  }
  if (option.disabled) {
    throw new Error(
      option.diagnostic ?? `Workspace Canvas '${suggestion.canvasId}' is unavailable.`,
    );
  }
}
