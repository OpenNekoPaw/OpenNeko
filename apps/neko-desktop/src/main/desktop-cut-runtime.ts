import { randomUUID } from 'node:crypto';
import * as nodePath from 'node:path';

import {
  createCutHostSessionId,
  type CutDocumentStorage,
  type CutHostRuntimeIdentity,
  type CutHostRuntimeProjectionEvent,
  type CutHostRuntimeRequest,
  type CutHostRuntimeResult,
  type CutHostRuntimeSnapshot,
} from '@neko/cut-domain';
import { CutApplicationRuntime, type CutApplicationRuntimeOptions } from '@neko/cut-node';
import type { NekoHostPorts } from '@neko/host/ports';
import type {
  ResourceBrowserContentItem,
  ResourceBrowserIdentity,
  ResourceBrowserItem,
} from '@neko/assets-domain/resource-browser/contract';
import {
  normalizeWorkspaceContentPath,
  type AuthorizedWorkspaceWriter,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import { NodeAuthorizedWorkspaceWriter } from '@neko/content/node';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';

import type { DesktopShellService } from '@neko/host/desktop-shell-service';
import { resolveDesktopWindowWorkspaceWorkbench } from '@neko/host/desktop-shell-contract';
import type { DesktopResourceRegistry } from './desktop-resource-registry';
import {
  getActiveMainView,
  openOrFocusMainView,
  showWorkbenchTimeline,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';

type DesktopCutOpenResourceItem = ResourceBrowserContentItem & {
  readonly locator: WorkspaceFileContentLocator;
};

export interface DesktopCutRuntimeOptions {
  readonly shell: Pick<
    DesktopShellService,
    | 'getProjection'
    | 'updateWorkbench'
    | 'resolveAgentWorkspace'
    | 'resolveCutViewGrant'
    | 'resolveCutCreationGrant'
  >;
  readonly host: NekoHostPorts;
  readonly resources?: Pick<DesktopResourceRegistry, 'createMediaPublisher'>;
  readonly createMediaAdapter?: CutApplicationRuntimeOptions['createMediaAdapter'];
  readonly createAuthoringMediaAdapter?: CutApplicationRuntimeOptions['createAuthoringMediaAdapter'];
  readonly createPreviewMediaAdapter?: CutApplicationRuntimeOptions['createPreviewMediaAdapter'];
  readonly createExportMediaAdapter?: CutApplicationRuntimeOptions['createExportMediaAdapter'];
  readonly selectExportDestination?: CutApplicationRuntimeOptions['selectExportDestination'];
  readonly selectMediaFiles?: CutApplicationRuntimeOptions['selectMediaFiles'];
}

export class DesktopCutRuntime {
  private readonly application: CutApplicationRuntime;
  private disposed = false;

  constructor(private readonly options: DesktopCutRuntimeOptions) {
    const resources = options.resources;
    this.application = new CutApplicationRuntime({
      authorizeSession: async (windowId, identity) => {
        const grant = await options.shell.resolveCutViewGrant(windowId, identity);
        const documentPath = await resolveWorkspaceContentLocator(grant.workspace, {
          kind: 'workspace-file',
          path: identity.documentId,
        });
        return {
          documentPath,
          workspacePath: grant.workspace.workspacePath,
          storage: createCutDocumentStorage(
            options.host,
            documentPath,
            identity.documentId,
            new NodeAuthorizedWorkspaceWriter({
              workspaceRoot: grant.workspace.workspacePath,
            }),
          ),
        };
      },
      authorizeNewSession: async (windowId, identity) => {
        const grant = await options.shell.resolveCutCreationGrant(windowId, identity);
        const documentId = normalizeWorkspaceContentPath(identity.documentId);
        if (documentId !== identity.documentId || !documentId.endsWith('.otio')) {
          throw new Error('Desktop Cut creation requires a normalized workspace OTIO target.');
        }
        const documentPath = nodePath.join(grant.workspace.workspacePath, ...documentId.split('/'));
        return {
          documentPath,
          workspacePath: grant.workspace.workspacePath,
          storage: createCutDocumentStorage(
            options.host,
            documentPath,
            documentId,
            new NodeAuthorizedWorkspaceWriter({ workspaceRoot: grant.workspace.workspacePath }),
          ),
        };
      },
      resolveResourcePath: async (workspaceId, item) => {
        const workspace = await options.shell.resolveAgentWorkspace(workspaceId);
        return resolveWorkspaceContentLocator(workspace, item.locator);
      },
      readText: (absolutePath) => options.host.files.readText(absolutePath),
      ...(resources === undefined
        ? {}
        : {
            createMediaPublisher: (input) =>
              resources.createMediaPublisher({
                windowId: input.windowId,
                viewId: input.viewId,
                sessionId: input.sessionId,
                rendererSessionId: input.rendererSessionId,
                revision: input.requestId,
              }),
          }),
      ...(options.createMediaAdapter === undefined
        ? {}
        : { createMediaAdapter: options.createMediaAdapter }),
      ...(options.createAuthoringMediaAdapter === undefined
        ? {}
        : { createAuthoringMediaAdapter: options.createAuthoringMediaAdapter }),
      ...(options.createPreviewMediaAdapter === undefined
        ? {}
        : { createPreviewMediaAdapter: options.createPreviewMediaAdapter }),
      ...(options.createExportMediaAdapter === undefined
        ? {}
        : { createExportMediaAdapter: options.createExportMediaAdapter }),
      ...(options.selectExportDestination === undefined
        ? {}
        : { selectExportDestination: options.selectExportDestination }),
      ...(options.selectMediaFiles === undefined
        ? {}
        : { selectMediaFiles: options.selectMediaFiles }),
      reportExportFailure: ({
        identity,
        sourceSnapshotId,
        outputWorkspaceRelativePath,
        error,
      }) => {
        options.host.diagnostics?.report({
          code: 'desktop-cut-export-failed',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          metadata: {
            documentId: identity.documentId,
            sourceSnapshotId,
            outputWorkspaceRelativePath,
          },
        });
      },
    });
  }

  supportsOpen(item: ResourceBrowserItem): item is DesktopCutOpenResourceItem {
    this.requireActive();
    if (item.facet !== 'files' && item.facet !== 'media') return false;
    return (
      item.locator.kind === 'workspace-file' &&
      item.locator.path.toLocaleLowerCase().endsWith('.otio')
    );
  }

  async open(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
  }): Promise<void> {
    this.requireActive();
    if (!this.supportsOpen(input.item)) {
      throw new Error('Desktop Cut requires a workspace-file OTIO ContentLocator.');
    }
    const locator = input.item.locator;
    const current = await this.options.shell.getProjection(input.identity.windowId);
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
      throw new Error('Desktop Cut Resource owner is stale.');
    }
    const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      current.window,
      project.workspaceId,
    );
    const workspace = await this.options.shell.resolveAgentWorkspace(project.workspaceId);
    const resolvedPath = await resolveWorkspaceContentLocator(workspace, locator);
    if (resolvedPath !== input.absolutePath) {
      throw new Error('Desktop Cut Resource path does not match its authorized ContentLocator.');
    }
    const existing = workspaceWorkbench.layout.main.views.find(
      (view) =>
        view.kind === 'cut' &&
        view.projectId === project.projectId &&
        view.workspaceId === project.workspaceId &&
        view.documentId === locator.path,
    );
    const viewId = existing?.viewId ?? `cut:${tab.viewId}:${randomUUID()}`;
    const ownerId = existing?.ownerId ?? createCutHostSessionId(viewId, tab.viewInstanceId);
    const view = existing ?? {
      viewId,
      viewInstanceId: tab.viewInstanceId,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'cut' as const,
      ownerId,
      displayLabel: input.item.label,
      documentId: locator.path,
    };
    const activeBeforeOpen = getActiveMainView(workspaceWorkbench.layout);
    let workbench = openOrFocusMainView(workspaceWorkbench.layout, view);
    if (activeBeforeOpen?.kind === 'canvas') {
      workbench = openOrFocusMainView(workbench, activeBeforeOpen);
    }
    workbench = showWorkbenchTimeline(workbench, view.viewId);
    await this.options.shell.updateWorkbench(
      input.identity.windowId,
      current.rendererSessionId,
      workspaceWorkbench.workbenchInstanceId,
      workbench,
    );
  }

  addResource(input: {
    readonly resourceIdentity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly target: {
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly documentId: string;
      readonly sessionId: string;
    };
  }): Promise<CutHostRuntimeSnapshot> {
    this.requireActive();
    return this.application.addResource(input);
  }

  getSnapshot(windowId: string, identity: CutHostRuntimeIdentity): Promise<CutHostRuntimeSnapshot> {
    this.requireActive();
    return this.application.getSnapshot(windowId, identity);
  }

  execute(
    windowId: string,
    request: CutHostRuntimeRequest | unknown,
  ): Promise<CutHostRuntimeResult> {
    this.requireActive();
    return this.application.execute(windowId, request);
  }

  subscribe(
    windowId: string,
    identity: CutHostRuntimeIdentity,
    listener: (event: CutHostRuntimeProjectionEvent) => void,
  ): Promise<() => void> {
    this.requireActive();
    return this.application.subscribe(windowId, identity, listener);
  }

  detachWindow(windowId: string): void {
    if (this.disposed) return;
    this.application.detachWindow(windowId);
  }

  reconcileWindow(
    windowId: string,
    workbenches: readonly DesktopWorkbenchLayoutProjection[],
  ): void {
    this.requireActive();
    this.application.reconcileSessions(
      windowId,
      workbenches
        .flatMap((workbench) => workbench.main.views)
        .filter((view) => view.kind === 'cut')
        .map((view) => view.ownerId),
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.application.dispose();
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Cut runtime is disposed.');
  }
}

function createCutDocumentStorage(
  host: NekoHostPorts,
  documentPath: string,
  documentId: string,
  writer: AuthorizedWorkspaceWriter,
): CutDocumentStorage {
  return {
    async read(documentUri) {
      assertOtioDocument(documentUri);
      return {
        bytes: await host.files.readBytes(documentPath),
        fingerprint: await readFileFingerprint(host, documentPath),
      };
    },
    async write(documentUri, bytes, options) {
      assertOtioDocument(documentUri);
      const result = await writer.write({ kind: 'workspace-file', path: documentId }, bytes, {
        conflict: options.expectedFingerprint === undefined ? 'fail-if-exists' : 'replace',
        ...(options.expectedFingerprint === undefined
          ? {}
          : {
              expectedFingerprint: {
                strategy: 'mtime-size' as const,
                value: options.expectedFingerprint,
              },
            }),
      });
      if (result.status !== 'written') {
        throw new Error(`Desktop Cut authorized project write failed: ${result.diagnostic.code}`);
      }
      if (result.fingerprint === undefined) {
        throw new Error('Desktop Cut authorized project write returned no content fingerprint.');
      }
      return { fingerprint: result.fingerprint.value };
    },
  };
}

function assertOtioDocument(documentUri: string): void {
  if (!documentUri.toLocaleLowerCase().endsWith('.otio')) {
    throw new Error('Desktop Cut storage only accepts OTIO documents.');
  }
}

async function readFileFingerprint(host: NekoHostPorts, documentPath: string): Promise<string> {
  const stat = await host.files.stat(documentPath);
  if (stat.type !== 'file') throw new Error('Desktop Cut document is not a file.');
  return `${stat.modifiedAtMs ?? 0}:${stat.sizeBytes ?? 0}`;
}
