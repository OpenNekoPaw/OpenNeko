import { randomUUID } from 'node:crypto';
import * as nodePath from 'node:path';

import {
  CUT_HOST_RUNTIME_ROUTES,
  CUT_DRAFT_DOCUMENT_ID_PREFIX,
  createCutHostSessionId,
  isCutDraftDocumentId,
  parseCutHostRuntimeRequest,
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
  type ContentLocator,
  type AuthorizedWorkspaceWriter,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import { NodeAuthorizedWorkspaceWriter } from '@neko/content/node';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';

import type { DesktopShellService } from '@neko/host/desktop-shell-service';
import {
  resolveDesktopWindowWorkspaceWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import type { DesktopResourceRegistry } from './desktop-resource-registry';
import {
  closeCutView,
  getActiveCutView,
  openOrFocusCutView,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';

type DesktopCutOpenResourceItem = ResourceBrowserContentItem & {
  readonly locator: WorkspaceFileContentLocator;
};

interface DesktopCutOpenInput {
  readonly identity: ResourceBrowserIdentity;
  readonly item: ResourceBrowserItem;
  readonly absolutePath: string;
}

export interface DesktopCutCanvasSourceIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly rendererSessionId: string;
}

export type DesktopCutCanvasHandoffTarget =
  | {
      readonly kind: 'existing-cut';
      readonly workbenchInstanceId: string;
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly documentId: string;
      readonly sessionId: string;
    }
  | {
      readonly kind: 'new-cut-draft';
      readonly workbenchInstanceId: string;
    };

export function createDesktopCutCanvasHandoffPayload(
  target: DesktopCutCanvasHandoffTarget,
): Readonly<Record<string, unknown>> {
  return { target };
}

export function parseDesktopCutCanvasHandoffPayload(
  value: Readonly<Record<string, unknown>>,
): DesktopCutCanvasHandoffTarget {
  const payloadKeys = Object.keys(value);
  if (payloadKeys.length !== 1 || payloadKeys[0] !== 'target') {
    throw new Error('Desktop Cut Canvas handoff payload is invalid.');
  }
  const target = value['target'];
  if (!isRecord(target)) throw new Error('Desktop Cut Canvas handoff target is required.');
  const kind = target['kind'];
  if (kind === 'new-cut-draft') {
    requireExactTargetKeys(target, ['kind', 'workbenchInstanceId']);
    return {
      kind,
      workbenchInstanceId: requireTargetIdentity(target['workbenchInstanceId']),
    };
  }
  if (kind !== 'existing-cut') {
    throw new Error('Desktop Cut Canvas handoff target kind is invalid.');
  }
  requireExactTargetKeys(target, [
    'kind',
    'workbenchInstanceId',
    'viewId',
    'viewInstanceId',
    'documentId',
    'sessionId',
  ]);
  return {
    kind,
    workbenchInstanceId: requireTargetIdentity(target['workbenchInstanceId']),
    viewId: requireTargetIdentity(target['viewId']),
    viewInstanceId: requireTargetIdentity(target['viewInstanceId']),
    documentId: requireTargetIdentity(target['documentId']),
    sessionId: requireTargetIdentity(target['sessionId']),
  };
}

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
  readonly selectDraftDestination?: (input: {
    readonly identity: CutHostRuntimeIdentity;
    readonly workspacePath: string;
    readonly defaultName: string;
  }) => Promise<string | undefined>;
  readonly confirmDiscardDraft?: (input: {
    readonly identity: CutHostRuntimeIdentity;
    readonly label: string;
  }) => Promise<boolean>;
  readonly draftLabel?: string;
}

export class DesktopCutRuntime {
  private readonly application: CutApplicationRuntime;
  private readonly draftOpenings = new Map<string, Promise<DesktopShellProjection>>();
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
      resolveResourcePath: async (workspaceId, locator) => {
        const workspace = await options.shell.resolveAgentWorkspace(workspaceId);
        return resolveWorkspaceContentLocator(workspace, locator);
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
      reportExportFailure: ({ identity, sourceSnapshotId, outputWorkspaceRelativePath, error }) => {
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

  open(input: DesktopCutOpenInput): Promise<void> {
    return this.openDocument(input);
  }

  openAlongsideCanvas(input: DesktopCutOpenInput): Promise<void> {
    return this.openDocument(input);
  }

  async createDraft(input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly workbenchInstanceId: string;
  }): Promise<DesktopShellProjection> {
    const key = `${input.windowId}:${input.workbenchInstanceId}`;
    const pending = this.draftOpenings.get(key);
    if (pending) return pending;
    const opening = this.createDraftOwned(input);
    this.draftOpenings.set(key, opening);
    try {
      return await opening;
    } finally {
      if (this.draftOpenings.get(key) === opening) this.draftOpenings.delete(key);
    }
  }

  async resolveCanvasHandoffTarget(
    identity: DesktopCutCanvasSourceIdentity,
  ): Promise<DesktopCutCanvasHandoffTarget> {
    this.requireActive();
    const current = await this.options.shell.getProjection(identity.windowId);
    if (current.rendererSessionId !== identity.rendererSessionId) {
      throw new Error('Desktop Cut Canvas handoff renderer identity is stale.');
    }
    const project = current.catalog.projects.find(
      (candidate) =>
        candidate.projectId === identity.projectId &&
        candidate.workspaceId === identity.workspaceId,
    );
    const tab = current.window.tabs.find(
      (candidate) =>
        candidate.projectId === identity.projectId &&
        candidate.viewInstanceId === identity.viewInstanceId,
    );
    if (!project || !tab) {
      throw new Error('Desktop Cut Canvas handoff has no exact Project View owner.');
    }
    const workbench = resolveDesktopWindowWorkspaceWorkbench(current.window, identity.workspaceId);
    const canvasView = workbench.layout.main.views.find(
      (candidate) =>
        candidate.kind === 'canvas' &&
        candidate.viewId === identity.viewId &&
        candidate.viewInstanceId === identity.viewInstanceId &&
        candidate.projectId === identity.projectId &&
        candidate.workspaceId === identity.workspaceId,
    );
    if (!canvasView) {
      throw new Error('Desktop Cut Canvas handoff source View is stale.');
    }
    const activeCut =
      workbench.layout.cutPanel?.presentation === 'docked'
        ? getActiveCutView(workbench.layout)
        : undefined;
    if (!activeCut) {
      return {
        kind: 'new-cut-draft',
        workbenchInstanceId: workbench.workbenchInstanceId,
      };
    }
    if (
      activeCut.kind !== 'cut' ||
      !activeCut.documentId ||
      activeCut.projectId !== identity.projectId ||
      activeCut.workspaceId !== identity.workspaceId ||
      activeCut.viewInstanceId !== identity.viewInstanceId
    ) {
      throw new Error('Desktop Cut Canvas handoff target is outside the exact Workspace View.');
    }
    const sessionId = createCutHostSessionId(activeCut.viewId, activeCut.viewInstanceId);
    if (activeCut.ownerId !== sessionId) {
      throw new Error('Desktop Cut Canvas handoff target session identity is invalid.');
    }
    return {
      kind: 'existing-cut',
      workbenchInstanceId: workbench.workbenchInstanceId,
      viewId: activeCut.viewId,
      viewInstanceId: activeCut.viewInstanceId,
      documentId: activeCut.documentId,
      sessionId,
    };
  }

  async addCanvasMaterial(input: {
    readonly identity: DesktopCutCanvasSourceIdentity;
    readonly nodeId: string;
    readonly label: string;
    readonly locator: ContentLocator;
    readonly target: DesktopCutCanvasHandoffTarget;
  }): Promise<CutHostRuntimeSnapshot> {
    const currentTarget = await this.resolveCanvasHandoffTarget(input.identity);
    if (!sameCanvasHandoffTarget(currentTarget, input.target)) {
      throw new Error('Desktop Cut Canvas handoff target changed before execution.');
    }
    const target =
      currentTarget.kind === 'existing-cut'
        ? currentTarget
        : await this.createDraft({
            windowId: input.identity.windowId,
            rendererSessionId: input.identity.rendererSessionId,
            workbenchInstanceId: currentTarget.workbenchInstanceId,
          }).then((projection) => {
            const workbench = resolveDesktopWindowWorkspaceWorkbench(
              projection.window,
              input.identity.workspaceId,
            );
            const activeCut = getActiveCutView(workbench.layout);
            if (
              workbench.workbenchInstanceId !== currentTarget.workbenchInstanceId ||
              workbench.layout.cutPanel?.presentation !== 'docked' ||
              !activeCut ||
              activeCut.kind !== 'cut' ||
              !activeCut.documentId ||
              activeCut.projectId !== input.identity.projectId ||
              activeCut.workspaceId !== input.identity.workspaceId
            ) {
              throw new Error('Desktop Cut draft did not produce the exact Canvas handoff target.');
            }
            return {
              kind: 'existing-cut' as const,
              workbenchInstanceId: workbench.workbenchInstanceId,
              viewId: activeCut.viewId,
              viewInstanceId: activeCut.viewInstanceId,
              documentId: activeCut.documentId,
              sessionId: createCutHostSessionId(activeCut.viewId, activeCut.viewInstanceId),
            };
          });
    return this.addResource({
      resourceIdentity: {
        projectId: input.identity.projectId,
        workspaceId: input.identity.workspaceId,
        windowId: input.identity.windowId,
        viewId: input.identity.viewId,
        viewInstanceId: input.identity.viewInstanceId,
        rendererSessionId: input.identity.rendererSessionId,
      },
      item: {
        resourceId: `canvas-material:${input.nodeId}`,
        facet: 'files',
        role: 'content',
        depth: 0,
        kind: 'file',
        label: input.label,
        locator: input.locator,
        capabilities: ['add-to-cut'],
      },
      target,
    });
  }

  private async createDraftOwned(input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly workbenchInstanceId: string;
  }): Promise<DesktopShellProjection> {
    this.requireActive();
    const current = await this.options.shell.getProjection(input.windowId);
    if (current.rendererSessionId !== input.rendererSessionId) {
      throw new Error('Desktop Cut draft renderer identity is stale.');
    }
    const scene = current.window.workbench.scene;
    if (scene.context.kind !== 'agent' || scene.context.scope.kind !== 'workspace') {
      throw new Error('Desktop Cut draft requires an exact Workspace Scene.');
    }
    const workspaceId = scene.context.scope.workspaceId;
    const workbench = resolveDesktopWindowWorkspaceWorkbench(current.window, workspaceId);
    if (workbench.workbenchInstanceId !== input.workbenchInstanceId) {
      throw new Error('Desktop Cut draft Workbench identity is stale.');
    }
    const project = current.catalog.projects.find(
      (candidate) => candidate.workspaceId === workspaceId,
    );
    const tab = project
      ? current.window.tabs.find((candidate) => candidate.projectId === project.projectId)
      : undefined;
    if (!project || !tab) throw new Error('Desktop Cut draft has no exact Project View owner.');
    const workspace = await this.options.shell.resolveAgentWorkspace(workspaceId);
    const draftId = randomUUID();
    const viewId = `cut:${tab.viewId}:${draftId}`;
    const documentId = `${CUT_DRAFT_DOCUMENT_ID_PREFIX}${draftId}`;
    const identity: CutHostRuntimeIdentity = {
      projectId: project.projectId,
      workspaceId,
      windowId: input.windowId,
      viewId,
      viewInstanceId: tab.viewInstanceId,
      documentId,
      sessionId: createCutHostSessionId(viewId, tab.viewInstanceId),
      rendererSessionId: input.rendererSessionId,
    };
    const baseLabel = this.options.draftLabel ?? 'Untitled Cut';
    const existingLabels = new Set(
      workbench.layout.cutPanel?.views.map((view) => view.displayLabel) ?? [],
    );
    let label = baseLabel;
    for (let suffix = 2; existingLabels.has(label); suffix += 1) {
      label = `${baseLabel} ${String(suffix)}`;
    }
    this.application.createDraft({
      identity,
      name: label,
      documentPath: nodePath.join(workspace.workspacePath, `${label}.otio`),
      workspacePath: workspace.workspacePath,
      storage: unavailableDraftStorage(),
    });
    try {
      return await this.options.shell.updateWorkbench(
        input.windowId,
        input.rendererSessionId,
        input.workbenchInstanceId,
        openOrFocusCutView(workbench.layout, {
          viewId,
          viewInstanceId: tab.viewInstanceId,
          projectId: project.projectId,
          workspaceId,
          kind: 'cut',
          ownerId: identity.sessionId,
          displayLabel: label,
          documentId,
        }),
      );
    } catch (error) {
      this.application.discardSession(input.windowId, identity);
      throw error;
    }
  }

  async closeView(input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly workbenchInstanceId: string;
    readonly identity: CutHostRuntimeIdentity;
  }): Promise<{
    readonly status: 'updated' | 'cancelled';
    readonly projection: DesktopShellProjection;
  }> {
    this.requireActive();
    const current = await this.options.shell.getProjection(input.windowId);
    if (current.rendererSessionId !== input.rendererSessionId) {
      throw new Error('Desktop Cut close renderer identity is stale.');
    }
    const workbench = current.window.workbench;
    if (workbench.workbenchInstanceId !== input.workbenchInstanceId) {
      throw new Error('Desktop Cut close Workbench identity is stale.');
    }
    const view = workbench.layout.cutPanel?.views.find(
      (candidate) => candidate.viewId === input.identity.viewId,
    );
    if (!view || view.documentId !== input.identity.documentId) {
      throw new Error('Desktop Cut close View identity is stale.');
    }
    if (
      isCutDraftDocumentId(input.identity.documentId) &&
      !this.application.hasSession(input.identity)
    ) {
      const projection = await this.options.shell.updateWorkbench(
        input.windowId,
        input.rendererSessionId,
        input.workbenchInstanceId,
        closeCutView(workbench.layout, input.identity.viewId),
      );
      this.options.host.diagnostics?.report({
        code: 'desktop-cut-draft-presentation-reset',
        severity: 'warning',
        message:
          'Expired unnamed Cut draft presentation was removed without resolving it as a Workspace file.',
        metadata: {
          windowId: input.windowId,
          viewId: input.identity.viewId,
          documentId: input.identity.documentId,
        },
      });
      return { status: 'updated', projection };
    }
    if (isCutDraftDocumentId(input.identity.documentId)) {
      const snapshot = await this.application.getSnapshot(input.windowId, input.identity);
      if (snapshot.dirty) {
        if (!this.options.confirmDiscardDraft) {
          throw new Error('Desktop Cut draft discard confirmation is unavailable.');
        }
        const confirmed = await this.options.confirmDiscardDraft({
          identity: input.identity,
          label: view.displayLabel,
        });
        if (confirmed !== true) return { status: 'cancelled', projection: current };
      }
    }
    const projection = await this.options.shell.updateWorkbench(
      input.windowId,
      input.rendererSessionId,
      input.workbenchInstanceId,
      closeCutView(workbench.layout, input.identity.viewId),
    );
    if (isCutDraftDocumentId(input.identity.documentId)) {
      this.application.discardSession(input.windowId, input.identity);
    } else {
      this.reconcileWindow(input.windowId, [projection.window.workbench.layout]);
    }
    return { status: 'updated', projection };
  }

  private async openDocument(input: DesktopCutOpenInput): Promise<void> {
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
    const existing = workspaceWorkbench.layout.cutPanel?.views.find(
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
    const workbench = openOrFocusCutView(workspaceWorkbench.layout, view);
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
    const parsed = parseCutHostRuntimeRequest(request);
    if (
      parsed.route === CUT_HOST_RUNTIME_ROUTES.save &&
      isCutDraftDocumentId(parsed.identity.documentId)
    ) {
      return this.saveDraft(windowId, parsed);
    }
    return this.application.execute(windowId, parsed);
  }

  private async saveDraft(
    windowId: string,
    request: CutHostRuntimeRequest,
  ): Promise<CutHostRuntimeResult> {
    const current = await this.application.getSnapshot(windowId, request.identity);
    const shellProjection = await this.options.shell.getProjection(windowId);
    const draftView = shellProjection.window.workbench.layout.cutPanel?.views.find(
      (candidate) =>
        candidate.viewId === request.identity.viewId &&
        candidate.documentId === request.identity.documentId,
    );
    if (!draftView) throw new Error('Desktop Cut draft Save As View identity is stale.');
    const workspace = await this.options.shell.resolveAgentWorkspace(request.identity.workspaceId);
    if (!this.options.selectDraftDestination) {
      throw new Error('Desktop Cut draft Save As is unavailable.');
    }
    const documentId = await this.options.selectDraftDestination({
      identity: request.identity,
      workspacePath: workspace.workspacePath,
      defaultName: `${draftView.displayLabel}.otio`,
    });
    if (documentId === undefined) return { snapshot: current };
    const normalized = normalizeWorkspaceContentPath(documentId);
    if (normalized !== documentId || !normalized.toLocaleLowerCase('en-US').endsWith('.otio')) {
      throw new Error('Desktop Cut Save As requires a normalized Workspace OTIO target.');
    }
    const authorizedProjection = await this.options.shell.getProjection(windowId);
    if (authorizedProjection.rendererSessionId !== request.identity.rendererSessionId) {
      throw new Error('Desktop Cut draft Save As renderer identity changed during selection.');
    }
    const authorizedWorkbench = authorizedProjection.window.workbench;
    if (
      authorizedWorkbench.workbenchInstanceId !==
      shellProjection.window.workbench.workbenchInstanceId
    ) {
      throw new Error('Desktop Cut draft Save As Workbench identity changed during selection.');
    }
    const authorizedView = authorizedWorkbench.layout.cutPanel?.views.find(
      (candidate) =>
        candidate.viewId === request.identity.viewId &&
        candidate.viewInstanceId === request.identity.viewInstanceId &&
        candidate.documentId === request.identity.documentId,
    );
    if (!authorizedView) {
      throw new Error('Desktop Cut draft View changed during Save As selection.');
    }
    const documentPath = nodePath.join(workspace.workspacePath, ...normalized.split('/'));
    const nextIdentity = { ...request.identity, documentId: normalized };
    const result = await this.application.saveDraftAs({
      windowId,
      identity: request.identity,
      nextIdentity,
      documentPath,
      storage: createCutDocumentStorage(
        this.options.host,
        documentPath,
        normalized,
        new NodeAuthorizedWorkspaceWriter({ workspaceRoot: workspace.workspacePath }),
      ),
    });
    try {
      const projection = await this.options.shell.getProjection(windowId);
      if (projection.rendererSessionId !== request.identity.rendererSessionId) {
        throw new Error('Desktop Cut renderer identity changed after Save As committed.');
      }
      const workbench = projection.window.workbench;
      if (workbench.workbenchInstanceId !== authorizedWorkbench.workbenchInstanceId) {
        throw new Error('Desktop Cut Workbench identity changed after Save As committed.');
      }
      const view = workbench.layout.cutPanel?.views.find(
        (candidate) =>
          candidate.viewId === request.identity.viewId &&
          candidate.viewInstanceId === request.identity.viewInstanceId &&
          candidate.documentId === request.identity.documentId,
      );
      if (!view) throw new Error('Desktop Cut draft View changed after Save As committed.');
      await this.options.shell.updateWorkbench(
        windowId,
        request.identity.rendererSessionId,
        workbench.workbenchInstanceId,
        openOrFocusCutView(workbench.layout, {
          ...view,
          documentId: normalized,
          displayLabel: nodePath.posix.basename(normalized),
        }),
      );
    } catch (error) {
      this.releaseCommittedSaveAsSession(windowId, nextIdentity, normalized);
      throw new Error(
        `Cut was saved as '${normalized}', but its View could not be updated. Reopen the saved file from Resources.`,
        { cause: error },
      );
    }
    return result;
  }

  private releaseCommittedSaveAsSession(
    windowId: string,
    identity: CutHostRuntimeIdentity,
    documentId: string,
  ): void {
    this.application.discardSession(windowId, identity);
    this.options.host.diagnostics?.report({
      code: 'desktop-cut-save-as-presentation-stale',
      severity: 'warning',
      message: `Cut was saved as '${documentId}', but its stale View could not be rebound. Reopen the saved file from Resources.`,
      metadata: {
        windowId,
        viewId: identity.viewId,
        documentId,
      },
    });
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
        .flatMap((workbench) => workbench.cutPanel?.views ?? [])
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

function sameCanvasHandoffTarget(
  left: DesktopCutCanvasHandoffTarget,
  right: DesktopCutCanvasHandoffTarget,
): boolean {
  if (left.kind !== right.kind || left.workbenchInstanceId !== right.workbenchInstanceId) {
    return false;
  }
  if (left.kind === 'new-cut-draft' || right.kind === 'new-cut-draft') return true;
  return (
    left.viewId === right.viewId &&
    left.viewInstanceId === right.viewInstanceId &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireExactTargetKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error('Desktop Cut Canvas handoff target fields are invalid.');
  }
}

function requireTargetIdentity(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Desktop Cut Canvas handoff target identity is invalid.');
  }
  return value;
}

function unavailableDraftStorage(): CutDocumentStorage {
  return {
    read: async () => {
      throw new Error('Unnamed Cut draft has no persisted document.');
    },
    write: async () => {
      throw new Error('Unnamed Cut draft requires Save As before persistence.');
    },
  };
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
