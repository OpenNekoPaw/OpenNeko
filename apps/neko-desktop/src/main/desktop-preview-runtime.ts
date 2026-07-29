import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import {
  PREVIEW_HOST_RUNTIME_VERSION,
  PREVIEW_HOST_RUNTIME_ROUTES,
  assertPreviewRuntimeIdentity,
  detectPreviewContentKind,
  getPreviewMediaType,
  parsePreviewProjection,
  parsePreviewRuntimeRequest,
  type PreviewProjection,
  type PreviewRuntimeRequest,
  type PreviewRuntimeIdentity,
  type PreviewViewPresentation,
} from '@neko-preview/contracts';
import type {
  ResourceBrowserIdentity,
  ResourceBrowserItem,
} from 'neko-assets/resource-browser/contract';
import {
  closeMainView,
  findMainGroupForView,
  openOrFocusMainView,
  type DesktopWorkbenchLayoutProjection,
} from '../shared/workbench-contract';
import {
  parseDesktopPreviewBootstrapRequest,
  type DesktopPreviewBootstrapRequest,
} from '../shared/preview-bridge-contract';
import type { DesktopMediaDescriptorRegistry } from './desktop-media-protocol';

interface DesktopPreviewShellProjection {
  readonly endpointEpoch: string;
  readonly catalog: {
    readonly projects: readonly {
      readonly projectId: string;
      readonly workspaceId: string;
    }[];
  };
  readonly window: {
    readonly windowId: string;
    readonly revision: number;
    readonly tabs: readonly {
      readonly projectId: string;
      readonly viewId: string;
      readonly viewEpoch: number;
    }[];
    readonly workbench: DesktopWorkbenchLayoutProjection;
  };
}

export interface DesktopPreviewShellPort {
  getProjection(windowId: string): Promise<DesktopPreviewShellProjection>;
  updateWorkbench(
    windowId: string,
    expectedEndpointEpoch: string,
    expectedWindowRevision: number,
    expectedWorkbenchRevision: number,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<unknown>;
}

export interface DesktopPreviewRuntimeOptions {
  readonly shell: DesktopPreviewShellPort;
  readonly mediaRegistry: DesktopMediaDescriptorRegistry;
  readonly resolveWebContentsId: (windowId: string) => number;
  readonly createIdentity?: () => string;
}

interface DesktopPreviewSession {
  identity: PreviewRuntimeIdentity;
  projection: PreviewProjection;
}

export class DesktopPreviewRuntime {
  private readonly sessions = new Map<string, DesktopPreviewSession>();
  private readonly createIdentity: () => string;
  private disposed = false;

  constructor(private readonly options: DesktopPreviewRuntimeOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
  }

  async open(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
    readonly target?: {
      readonly viewId: string;
      readonly presentation: 'temporary' | 'side';
      readonly expectedWorkbenchRevision: number;
    };
  }): Promise<PreviewProjection> {
    this.requireActive();
    const shellProjection = await this.options.shell.getProjection(input.identity.windowId);
    const project = shellProjection.catalog.projects.find(
      (candidate) =>
        candidate.projectId === input.identity.projectId &&
        candidate.workspaceId === input.identity.workspaceId,
    );
    const tab = shellProjection.window.tabs.find(
      (candidate) => candidate.projectId === input.identity.projectId,
    );
    if (
      !project ||
      !tab ||
      shellProjection.endpointEpoch !== input.identity.endpointEpoch ||
      input.identity.viewEpoch !== tab.viewEpoch
    ) {
      throw new Error('Desktop Preview Resource owner is stale.');
    }
    const presentation = input.target?.presentation ?? 'temporary';
    const expectedViewId = `preview:${tab.viewId}:${presentation}`;
    const viewId = input.target?.viewId ?? expectedViewId;
    if (
      viewId !== expectedViewId ||
      (input.target &&
        input.target.expectedWorkbenchRevision !== shellProjection.window.workbench.revision)
    ) {
      throw new Error('Desktop Preview target View or workbench revision is stale.');
    }
    const sessionId = `preview-session:${this.createIdentity()}`;
    const runtimeIdentity: PreviewRuntimeIdentity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId: input.identity.windowId,
      viewId,
      viewEpoch: tab.viewEpoch,
      documentId: input.item.resourceId,
      sessionId,
      endpointEpoch: shellProjection.endpointEpoch,
      revision: 0,
    };
    const contentKind = detectPreviewContentKind(input.item.label);
    const mediaType = getPreviewMediaType(input.item.label);
    let projection: PreviewProjection;
    if (!contentKind || !mediaType) {
      projection = parsePreviewProjection({
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        identity: runtimeIdentity,
        presentation,
        status: 'unsupported',
        diagnostic: {
          code: 'preview-unsupported-kind',
          message: `Desktop Preview does not support '${input.item.label}'.`,
        },
      });
    } else {
      const file = await stat(input.absolutePath);
      if (!file.isFile()) throw new Error('Desktop Preview source is not a file.');
      const revision = `${file.mtimeMs}:${file.size}`;
      const descriptorId = this.options.mediaRegistry.register({
        webContentsId: this.options.resolveWebContentsId(input.identity.windowId),
        windowId: input.identity.windowId,
        viewId,
        sessionId,
        revision,
        absolutePath: input.absolutePath,
        mediaType,
      });
      projection = parsePreviewProjection({
        schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
        identity: runtimeIdentity,
        presentation,
        status: 'ready',
        descriptor: {
          descriptorId,
          revision,
          contentKind,
          mediaType,
          displayName: input.item.label,
          byteLength: file.size,
        },
      });
    }
    this.sessions.set(sessionId, {
      identity: runtimeIdentity,
      projection,
    });
    const currentWorkbench = shellProjection.window.workbench;
    const previewView: DesktopWorkbenchLayoutProjection['main']['views'][number] = {
      viewId,
      viewEpoch: tab.viewEpoch,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'preview',
      ownerId: sessionId,
      displayLabel: input.item.label,
      documentId: input.item.resourceId,
      previewPresentation: presentation,
      ...(contentKind === undefined ? {} : { previewContentKind: contentKind }),
    };
    let workbench: DesktopWorkbenchLayoutProjection;
    try {
      workbench = openOrFocusMainView(currentWorkbench, previewView, {
        ...(presentation === 'side' ? { splitAxis: 'columns' as const } : {}),
        replaceTemporaryPreview: presentation === 'temporary',
      });
      workbench = {
        ...workbench,
        revision: currentWorkbench.revision + 1,
      };
    } catch (error) {
      this.sessions.delete(sessionId);
      this.options.mediaRegistry.releaseSession(sessionId);
      throw error;
    }
    try {
      await this.options.shell.updateWorkbench(
        input.identity.windowId,
        shellProjection.endpointEpoch,
        shellProjection.window.revision,
        currentWorkbench.revision,
        workbench,
      );
      this.releasePresentationSession(
        input.identity.windowId,
        input.identity.projectId,
        presentation,
        sessionId,
      );
      return projection;
    } catch (error) {
      this.sessions.delete(sessionId);
      this.options.mediaRegistry.releaseSession(sessionId);
      throw error;
    }
  }

  async getSnapshot(
    windowId: string,
    value: DesktopPreviewBootstrapRequest | unknown,
  ): Promise<PreviewProjection> {
    this.requireActive();
    const request = parseDesktopPreviewBootstrapRequest(value);
    const session = this.sessions.get(request.sessionId);
    if (!session) throw new Error(`Desktop Preview session '${request.sessionId}' is unavailable.`);
    const projection = await this.options.shell.getProjection(windowId);
    const view = projection.window.workbench.main.views.find(
      (candidate) =>
        candidate.kind === 'preview' &&
        candidate.viewId === request.viewId &&
        candidate.ownerId === request.sessionId,
    );
    if (!view) throw new Error('Desktop Preview View is no longer attached.');
    if (request.endpointEpoch !== projection.endpointEpoch) {
      throw new Error('Desktop Preview bootstrap endpoint is stale.');
    }
    const requestedIdentity = {
      ...session.identity,
      projectId: request.projectId,
      workspaceId: request.workspaceId,
      windowId,
      viewId: request.viewId,
      viewEpoch: request.viewEpoch,
      sessionId: request.sessionId,
      endpointEpoch: session.identity.endpointEpoch,
    };
    assertPreviewRuntimeIdentity(session.identity, requestedIdentity);
    if (session.identity.endpointEpoch !== request.endpointEpoch) {
      const identity: PreviewRuntimeIdentity = {
        ...session.identity,
        endpointEpoch: request.endpointEpoch,
        revision: session.identity.revision + 1,
      };
      session.identity = identity;
      session.projection = parsePreviewProjection({
        ...session.projection,
        identity,
      });
    }
    return session.projection;
  }

  async execute(
    windowId: string,
    value: PreviewRuntimeRequest | unknown,
  ): Promise<PreviewProjection> {
    this.requireActive();
    const request = parsePreviewRuntimeRequest(value);
    if (request.identity.windowId !== windowId) {
      throw new Error('Desktop Preview request belongs to another Window.');
    }
    const session = this.sessions.get(request.identity.sessionId);
    if (!session) {
      throw new Error(`Desktop Preview session '${request.identity.sessionId}' is unavailable.`);
    }
    assertPreviewRuntimeIdentity(session.identity, request.identity);
    const shellProjection = await this.options.shell.getProjection(windowId);
    const currentWorkbench = shellProjection.window.workbench;
    const view = currentWorkbench.main.views.find(
      (candidate) =>
        candidate.kind === 'preview' &&
        candidate.viewId === session.identity.viewId &&
        candidate.ownerId === session.identity.sessionId,
    );
    if (!view) throw new Error('Desktop Preview View is no longer attached.');
    switch (request.route) {
      case PREVIEW_HOST_RUNTIME_ROUTES.snapshotGet:
        return session.projection;
      case PREVIEW_HOST_RUNTIME_ROUTES.viewPin:
        return this.updatePresentation(session, shellProjection, view, 'pinned');
      case PREVIEW_HOST_RUNTIME_ROUTES.viewOpen:
        return this.updatePresentation(session, shellProjection, view, 'side');
      case PREVIEW_HOST_RUNTIME_ROUTES.viewClose:
        return this.closeSession(session, shellProjection, view);
      case PREVIEW_HOST_RUNTIME_ROUTES.contentResolve:
        throw new Error(
          'Desktop Preview content is resolved only through its Host-authorized descriptor.',
        );
    }
  }

  detachWindow(windowId: string): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.identity.windowId !== windowId) continue;
      this.options.mediaRegistry.releaseSession(sessionId);
      this.sessions.delete(sessionId);
    }
  }

  reconcileWorkbench(windowId: string, workbench: DesktopWorkbenchLayoutProjection): void {
    const attachedSessionIds = new Set(
      workbench.main.views.filter((view) => view.kind === 'preview').map((view) => view.ownerId),
    );
    for (const [sessionId, session] of this.sessions) {
      if (session.identity.windowId !== windowId || attachedSessionIds.has(sessionId)) {
        continue;
      }
      this.options.mediaRegistry.releaseSession(sessionId);
      this.sessions.delete(sessionId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const sessionId of this.sessions.keys()) {
      this.options.mediaRegistry.releaseSession(sessionId);
    }
    this.sessions.clear();
  }

  private releasePresentationSession(
    windowId: string,
    projectId: string,
    presentation: 'temporary' | 'side',
    retainedSessionId?: string,
  ): void {
    for (const [sessionId, session] of this.sessions) {
      if (
        sessionId === retainedSessionId ||
        session.identity.windowId !== windowId ||
        session.identity.projectId !== projectId ||
        session.projection.presentation !== presentation
      ) {
        continue;
      }
      this.options.mediaRegistry.releaseSession(sessionId);
      this.sessions.delete(sessionId);
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Preview runtime is disposed.');
  }

  private async updatePresentation(
    session: DesktopPreviewSession,
    shellProjection: DesktopPreviewShellProjection,
    view: DesktopWorkbenchLayoutProjection['main']['views'][number],
    presentation: Exclude<PreviewViewPresentation, 'temporary'>,
  ): Promise<PreviewProjection> {
    if (session.projection.presentation === presentation) return session.projection;
    const currentWorkbench = shellProjection.window.workbench;
    const nextViewId =
      session.projection.presentation === 'temporary'
        ? `preview:${view.viewId.split(':')[1] ?? view.viewId}:${session.identity.sessionId}`
        : view.viewId;
    const nextIdentity: PreviewRuntimeIdentity = {
      ...session.identity,
      viewId: nextViewId,
      revision: session.identity.revision + 1,
    };
    const nextProjection = parsePreviewProjection({
      ...session.projection,
      identity: nextIdentity,
      presentation,
    });
    const nextView: DesktopWorkbenchLayoutProjection['main']['views'][number] = {
      ...view,
      viewId: nextViewId,
      previewPresentation: presentation,
    };
    const sourceGroup = findMainGroupForView(currentWorkbench, view.viewId);
    if (!sourceGroup) {
      throw new Error('Desktop Preview View has no Main Group.');
    }
    let workbench = closeMainView(currentWorkbench, view.viewId);
    workbench = openOrFocusMainView(workbench, nextView, {
      groupId: workbench.main.groups.some((group) => group.groupId === sourceGroup.groupId)
        ? sourceGroup.groupId
        : workbench.main.activeGroupId,
      ...(presentation === 'side' && workbench.main.groups.length === 1
        ? { splitAxis: 'columns' as const }
        : {}),
    });
    workbench = {
      ...workbench,
      revision: currentWorkbench.revision + 1,
    };
    const previousIdentity = session.identity;
    const previousProjection = session.projection;
    session.identity = nextIdentity;
    session.projection = nextProjection;
    try {
      await this.options.shell.updateWorkbench(
        session.identity.windowId,
        shellProjection.endpointEpoch,
        shellProjection.window.revision,
        currentWorkbench.revision,
        workbench,
      );
      return nextProjection;
    } catch (error) {
      session.identity = previousIdentity;
      session.projection = previousProjection;
      throw error;
    }
  }

  private async closeSession(
    session: DesktopPreviewSession,
    shellProjection: DesktopPreviewShellProjection,
    view: DesktopWorkbenchLayoutProjection['main']['views'][number],
  ): Promise<PreviewProjection> {
    const currentWorkbench = shellProjection.window.workbench;
    const workbench = closeMainView(currentWorkbench, view.viewId);
    const closedProjection = parsePreviewProjection({
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      identity: {
        ...session.identity,
        revision: session.identity.revision + 1,
      },
      presentation: session.projection.presentation,
      status: 'unavailable',
      diagnostic: {
        code: 'preview-descriptor-released',
        message: 'Desktop Preview View was closed.',
      },
    });
    await this.options.shell.updateWorkbench(
      session.identity.windowId,
      shellProjection.endpointEpoch,
      shellProjection.window.revision,
      currentWorkbench.revision,
      workbench,
    );
    this.sessions.delete(session.identity.sessionId);
    this.options.mediaRegistry.releaseSession(session.identity.sessionId);
    return closedProjection;
  }
}
