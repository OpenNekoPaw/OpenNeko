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
    locator.file.authority !== 'workspace' ||
    locator.selector !== undefined ||
    !locator.file.path.toLocaleLowerCase('en-US').endsWith('.nkc')
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
  const workspace = await input.shell.resolveAgentWorkspace(project.workspaceId);
  const resolvedPath = await resolveWorkspaceContentLocator(workspace, { file: locator.file });
  if (resolvedPath !== input.absolutePath) {
    throw new Error('Desktop Canvas Resource path does not match its authorized ContentLocator.');
  }
  await openDesktopWorkspaceCanvasDocument({
    shell: input.shell,
    windowId: input.identity.windowId,
    rendererSessionId: input.identity.rendererSessionId,
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    documentId: locator.file.path,
    displayLabel: input.item.label,
  });
}

export async function openDesktopWorkspaceCanvasDocument(input: {
  readonly shell: Pick<DesktopShellService, 'getProjection' | 'updateWorkbench'>;
  readonly windowId: string;
  readonly rendererSessionId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly documentId: string;
  readonly displayLabel: string;
}): Promise<void> {
  const current = await input.shell.getProjection(input.windowId);
  if (current.rendererSessionId !== input.rendererSessionId) {
    throw new Error('Desktop Canvas renderer session is stale.');
  }
  const project = current.catalog.projects.find(
    (candidate) =>
      candidate.projectId === input.projectId && candidate.workspaceId === input.workspaceId,
  );
  const tab = current.window.tabs.find((candidate) => candidate.projectId === input.projectId);
  if (!project || !tab) {
    throw new Error('Desktop Canvas Workspace owner is stale.');
  }
  const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
    current.window,
    project.workspaceId,
  );
  const existing = workspaceWorkbench.layout.main.views.find(
    (view) =>
      view.kind === 'canvas' &&
      view.projectId === project.projectId &&
      view.workspaceId === project.workspaceId &&
      view.documentId === input.documentId,
  );
  const view = existing ?? {
    viewId: `canvas:${tab.viewId}:${stableViewSuffix(input.documentId)}`,
    viewInstanceId: tab.viewInstanceId,
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    kind: 'canvas' as const,
    ownerId: `canvas:${project.projectId}`,
    displayLabel: input.displayLabel,
    documentId: input.documentId,
  };
  await input.shell.updateWorkbench(
    input.windowId,
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
