import type {
  ResourceBrowserContentItem,
  ResourceBrowserIdentity,
} from '@neko/assets-domain/resource-browser/contract';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import type { DesktopShellService } from '@neko/host/desktop-shell-service';
import { resolveDesktopWindowWorkspaceWorkbench } from '@neko/host/desktop-shell-contract';
import { openOrFocusMainView } from '@neko/host/desktop-workbench-contract';

export async function openDesktopCanvasDocument(input: {
  readonly shell: Pick<
    DesktopShellService,
    'getProjection' | 'resolveAgentWorkspace' | 'updateWorkbench'
  >;
  readonly identity: ResourceBrowserIdentity;
  readonly item: ResourceBrowserContentItem;
  readonly absolutePath: string;
}): Promise<void> {
  const locator = input.item.locator;
  if (
    input.item.source !== 'files' ||
    locator.kind !== 'workspace-file' ||
    !locator.path.toLocaleLowerCase('en-US').endsWith('.nkc')
  ) {
    throw new Error('Desktop Canvas requires a Workspace-file NKC ContentLocator.');
  }
  const current = await input.shell.getProjection(input.identity.windowId);
  const project = current.catalog.projects.find(
    (candidate) =>
      candidate.projectId === input.identity.projectId &&
      candidate.workspaceId === input.identity.workspaceId,
  );
  const tab = current.window.tabs.find(
    (candidate) => candidate.projectId === input.identity.projectId,
  );
  if (
    !project ||
    !tab ||
    current.rendererSessionId !== input.identity.rendererSessionId ||
    tab.viewInstanceId !== input.identity.viewInstanceId
  ) {
    throw new Error('Desktop Canvas Resource owner is stale.');
  }
  const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
    current.window,
    project.workspaceId,
  );
  const workspace = await input.shell.resolveAgentWorkspace(project.workspaceId);
  const resolvedPath = await resolveWorkspaceContentLocator(workspace, locator);
  if (resolvedPath !== input.absolutePath) {
    throw new Error('Desktop Canvas Resource path does not match its authorized ContentLocator.');
  }
  const existing = workspaceWorkbench.layout.main.views.find(
    (view) =>
      view.kind === 'canvas' &&
      view.projectId === project.projectId &&
      view.workspaceId === project.workspaceId &&
      view.documentId === locator.path,
  );
  const view = existing ?? {
    viewId: `canvas:${tab.viewId}:${stableViewSuffix(locator.path)}`,
    viewInstanceId: tab.viewInstanceId,
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    kind: 'canvas' as const,
    ownerId: `canvas:${project.projectId}`,
    displayLabel: input.item.label,
    documentId: locator.path,
  };
  await input.shell.updateWorkbench(
    input.identity.windowId,
    current.rendererSessionId,
    workspaceWorkbench.workbenchInstanceId,
    openOrFocusMainView(workspaceWorkbench.layout, view),
  );
}

function stableViewSuffix(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
