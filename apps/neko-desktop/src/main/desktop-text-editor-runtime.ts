import { randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import * as path from 'node:path';
import type {
  ResourceBrowserContentItem,
  ResourceBrowserIdentity,
} from '@neko/assets-domain/resource-browser/contract';
import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content/node';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type { NodeTextEditorMarkdownMediaService } from '@neko/text-editor-node';
import {
  TEXT_EDITOR_HOST_ROUTES,
  TextDocumentError,
  TextDocumentSession,
  parseTextEditorHostRequest,
  sameTextEditorRuntimeIdentity,
  type TextEditorMarkdownReferenceCatalog,
  type TextEditorHostResult,
  type TextEditorProjectionEvent,
  type TextEditorRuntimeIdentity,
} from '@neko/text-editor-domain';
import {
  closeMainView,
  openOrFocusMainView,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';
import {
  resolveDesktopWindowWorkspaceWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';

type TextEditorShellProjection = Pick<
  DesktopShellProjection,
  'rendererSessionId' | 'catalog' | 'window'
>;

export interface DesktopTextEditorShellPort {
  getProjection(windowId: string): Promise<TextEditorShellProjection>;
  resolveAgentWorkspace(workspaceId: string): Promise<AssetWorkspaceResolution>;
  updateWorkbench(
    windowId: string,
    rendererSessionId: string,
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<unknown>;
}

export interface DesktopTextEditorRuntimeOptions {
  readonly shell: DesktopTextEditorShellPort;
  readonly referenceCatalog: Pick<TextEditorMarkdownReferenceCatalog, 'search'>;
  readonly media: Pick<
    NodeTextEditorMarkdownMediaService,
    'prepare' | 'release' | 'releaseSession' | 'releaseWindow' | 'dispose'
  >;
  readonly createIdentity?: () => string;
  readonly watchFile?: DesktopTextEditorWatchFile;
}

export interface DesktopTextEditorFileWatcher {
  close(): void;
}

export type DesktopTextEditorWatchFile = (
  directory: string,
  fileName: string,
  onChange: () => Promise<void>,
) => DesktopTextEditorFileWatcher;

interface TextEditorBinding {
  runtimeIdentity: TextEditorRuntimeIdentity;
  readonly session: TextDocumentSession;
  readonly listeners: Set<(event: TextEditorProjectionEvent) => void>;
  watcher?: DesktopTextEditorFileWatcher;
  externalChangeQueue: Promise<void>;
  eventSequence: number;
  closed: boolean;
}

export class DesktopTextEditorRuntime {
  private readonly bindings = new Map<string, TextEditorBinding>();
  private readonly pendingCleanRestores = new Map<string, Promise<TextEditorBinding>>();
  private readonly createIdentity: () => string;
  private readonly watchFile: DesktopTextEditorWatchFile;
  private disposed = false;

  constructor(private readonly options: DesktopTextEditorRuntimeOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
    this.watchFile = options.watchFile ?? watchWorkspaceFile;
  }

  async open(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserContentItem;
  }): Promise<TextEditorHostResult> {
    this.requireActive();
    const locator = input.item.locator;
    if (locator.kind !== 'workspace-file' || !input.item.capabilities.includes('edit-text')) {
      throw new Error('Desktop Text Editor requires an admitted Workspace File.');
    }
    const shell = await this.options.shell.getProjection(input.identity.windowId);
    const owner = requireResourceBrowserOwner(shell, input.identity);
    const workbenchOwner = resolveDesktopWindowWorkspaceWorkbench(
      shell.window,
      input.identity.workspaceId,
    );
    const existing = [...this.bindings.values()].find(
      (binding) =>
        binding.runtimeIdentity.windowId === input.identity.windowId &&
        binding.runtimeIdentity.workspaceId === input.identity.workspaceId &&
        binding.runtimeIdentity.documentId === locator.path,
    );
    if (existing) {
      const workbench = openOrFocusMainView(
        workbenchOwner.layout,
        requireTextEditorView(workbenchOwner.layout, existing.runtimeIdentity.viewId),
      );
      await this.options.shell.updateWorkbench(
        input.identity.windowId,
        shell.rendererSessionId,
        workbenchOwner.workbenchInstanceId,
        workbench,
      );
      return readyResult(`text-editor-open:${this.createIdentity()}`, existing);
    }

    const documentId = locator.path;
    const workspace = await this.options.shell.resolveAgentWorkspace(input.identity.workspaceId);
    const binding = await this.createBinding({
      projectId: input.identity.projectId,
      workspaceId: input.identity.workspaceId,
      windowId: input.identity.windowId,
      viewInstanceId: owner.viewInstanceId,
      documentId,
      rendererSessionId: shell.rendererSessionId,
      workspacePath: workspace.workspacePath,
    });
    const runtimeIdentity = binding.runtimeIdentity;
    const sessionId = runtimeIdentity.sessionId;
    const view = {
      viewId: runtimeIdentity.viewId,
      viewInstanceId: runtimeIdentity.viewInstanceId,
      projectId: runtimeIdentity.projectId,
      workspaceId: runtimeIdentity.workspaceId,
      kind: 'text-editor' as const,
      ownerId: sessionId,
      displayLabel: input.item.label,
      documentId,
      editorSessionId: sessionId,
    };
    const workbench = openOrFocusMainView(workbenchOwner.layout, view);
    try {
      await this.options.shell.updateWorkbench(
        input.identity.windowId,
        shell.rendererSessionId,
        workbenchOwner.workbenchInstanceId,
        workbench,
      );
    } catch (error) {
      this.releaseBinding(binding);
      throw error;
    }
    this.bindings.set(sessionId, binding);
    return readyResult(`text-editor-open:${this.createIdentity()}`, binding);
  }

  async execute(windowId: string, value: unknown): Promise<TextEditorHostResult> {
    this.requireActive();
    const request = parseTextEditorHostRequest(value);
    let binding = this.bindings.get(request.identity.sessionId);
    if (!binding && request.route === TEXT_EDITOR_HOST_ROUTES.projectionGet) {
      binding = await this.restoreReleasedCleanSession(windowId, request.identity);
      return readyResult(request.requestId, binding);
    }
    if (!binding && request.route === TEXT_EDITOR_HOST_ROUTES.close) {
      await this.closeReleasedCleanView(windowId, request.identity);
      return {
        requestId: request.requestId,
        identity: request.identity,
        status: 'closed',
      };
    }
    if (!binding || request.identity.windowId !== windowId) {
      throw new Error('Desktop Text Editor session is unavailable.');
    }
    await this.attachCurrentRenderer(binding, request.identity);
    const session = binding.session;
    try {
      switch (request.route) {
        case TEXT_EDITOR_HOST_ROUTES.projectionGet:
          return readyResult(request.requestId, binding);
        case TEXT_EDITOR_HOST_ROUTES.editsApply:
          session.applyEdits({
            identity: session.identity,
            sessionId: session.sessionId,
            requestId: request.requestId,
            expectedEditSequence: request.expectedEditSequence,
            changes: request.changes,
          });
          return readyResult(request.requestId, binding);
        case TEXT_EDITOR_HOST_ROUTES.jsonFormat:
          session.formatJson(request.requestId, request.expectedEditSequence);
          return readyResult(request.requestId, binding);
        case TEXT_EDITOR_HOST_ROUTES.save:
          await session.save(request.expectedEditSequence);
          return readyResult(request.requestId, binding);
        case TEXT_EDITOR_HOST_ROUTES.reload:
          await session.reload(request.confirmDirty);
          return readyResult(request.requestId, binding);
        case TEXT_EDITOR_HOST_ROUTES.referencesSearch: {
          const result = await this.options.referenceCatalog.search(request.search, {
            signal: new AbortController().signal,
            isCurrent: () => referenceSearchOwnsBinding(request.search, binding),
          });
          return result.status === 'ready'
            ? {
                requestId: request.requestId,
                identity: binding.runtimeIdentity,
                status: 'references-ready',
                projection: result.projection,
              }
            : {
                requestId: request.requestId,
                identity: binding.runtimeIdentity,
                status: 'references-discarded',
                reason: result.reason,
              };
        }
        case TEXT_EDITOR_HOST_ROUTES.mediaPrepare: {
          const projection = session.project();
          const mediaProjection = await this.options.media.prepare({
            request: request.media,
            source: projection.source,
            resourceOwner: {
              windowId: binding.runtimeIdentity.windowId,
              viewId: binding.runtimeIdentity.viewId,
              sessionId: binding.runtimeIdentity.sessionId,
              rendererSessionId: binding.runtimeIdentity.rendererSessionId,
            },
            isCurrent: () => mediaRequestOwnsBinding(request.media, binding),
          });
          return {
            requestId: request.requestId,
            identity: binding.runtimeIdentity,
            status: 'media-ready',
            projection: mediaProjection,
          };
        }
        case TEXT_EDITOR_HOST_ROUTES.mediaRelease:
          this.options.media.release(request.media);
          return {
            requestId: request.requestId,
            identity: binding.runtimeIdentity,
            status: 'media-released',
            surfaceId: request.media.surfaceId,
            leaseId: request.media.leaseId,
          };
        case TEXT_EDITOR_HOST_ROUTES.close: {
          const status = await session.close(request.decision);
          if (status === 'closed') await this.closeBinding(binding);
          return {
            requestId: request.requestId,
            identity: binding.runtimeIdentity,
            status,
          };
        }
      }
    } catch (error) {
      if (!(error instanceof TextDocumentError)) throw error;
      return {
        requestId: request.requestId,
        identity: binding.runtimeIdentity,
        status: 'rejected',
        diagnostic: error.diagnostic,
      };
    }
  }

  async subscribe(
    windowId: string,
    identity: TextEditorRuntimeIdentity,
    listener: (event: TextEditorProjectionEvent) => void,
  ): Promise<() => void> {
    this.requireActive();
    const binding = this.bindings.get(identity.sessionId);
    if (!binding || identity.windowId !== windowId) {
      throw new Error('Desktop Text Editor session is unavailable.');
    }
    await this.attachCurrentRenderer(binding, identity);
    binding.listeners.add(listener);
    return () => binding.listeners.delete(listener);
  }

  detachWindow(windowId: string): void {
    this.options.media.releaseWindow(windowId);
    for (const binding of this.bindings.values()) {
      if (binding.runtimeIdentity.windowId !== windowId) continue;
      binding.runtimeIdentity = { ...binding.runtimeIdentity, rendererSessionId: 'detached' };
    }
  }

  hasDirtySessions(windowId?: string): boolean {
    this.requireActive();
    return [...this.bindings.values()].some(
      (binding) =>
        (windowId === undefined || binding.runtimeIdentity.windowId === windowId) &&
        binding.session.project().dirty,
    );
  }

  async closeWindow(
    windowId: string,
    decision: import('@neko/text-editor-domain').TextDocumentCloseDecision,
  ): Promise<'closed' | 'cancelled'> {
    this.requireActive();
    const bindings = [...this.bindings.values()].filter(
      (binding) => binding.runtimeIdentity.windowId === windowId,
    );
    if (decision === 'cancel' && bindings.some((binding) => binding.session.project().dirty)) {
      return 'cancelled';
    }
    if (decision === 'save') {
      for (const binding of bindings) {
        const projection = binding.session.project();
        if (projection.dirty) await binding.session.save(projection.editSequence);
      }
    }
    for (const binding of bindings) await this.closeBinding(binding);
    return 'closed';
  }

  reconcileWindow(
    windowId: string,
    workbenches: readonly DesktopWorkbenchLayoutProjection[],
  ): void {
    const attachedSessionIds = new Set(
      workbenches.flatMap((workbench) =>
        workbench.main.views.flatMap((view) =>
          view.kind === 'text-editor' && view.editorSessionId ? [view.editorSessionId] : [],
        ),
      ),
    );
    for (const [sessionId, binding] of this.bindings) {
      if (
        binding.runtimeIdentity.windowId === windowId &&
        !attachedSessionIds.has(sessionId) &&
        !binding.session.project().dirty
      ) {
        this.releaseBinding(binding);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const binding of this.bindings.values()) this.releaseBinding(binding);
    this.options.media.dispose();
  }

  private async restoreReleasedCleanSession(
    windowId: string,
    requested: TextEditorRuntimeIdentity,
  ): Promise<TextEditorBinding> {
    if (requested.windowId !== windowId) {
      throw new Error('Desktop Text Editor session is unavailable.');
    }
    const key = JSON.stringify([
      windowId,
      requested.projectId,
      requested.workspaceId,
      requested.viewId,
      requested.viewInstanceId,
      requested.documentId,
      requested.sessionId,
      requested.rendererSessionId,
    ]);
    const pending = this.pendingCleanRestores.get(key);
    if (pending) return pending;
    const restore = this.reopenReleasedCleanSession(requested);
    this.pendingCleanRestores.set(key, restore);
    try {
      return await restore;
    } finally {
      if (this.pendingCleanRestores.get(key) === restore) this.pendingCleanRestores.delete(key);
    }
  }

  private async reopenReleasedCleanSession(
    requested: TextEditorRuntimeIdentity,
  ): Promise<TextEditorBinding> {
    const shell = await this.options.shell.getProjection(requested.windowId);
    if (shell.rendererSessionId !== requested.rendererSessionId) {
      throw new Error('Desktop Text Editor runtime identity is stale.');
    }
    const owner = resolveDesktopWindowWorkspaceWorkbench(shell.window, requested.workspaceId);
    const view = requireTextEditorView(owner.layout, requested.viewId);
    if (
      view.projectId !== requested.projectId ||
      view.workspaceId !== requested.workspaceId ||
      view.viewInstanceId !== requested.viewInstanceId ||
      view.documentId !== requested.documentId ||
      view.editorSessionId !== requested.sessionId ||
      view.ownerId !== requested.sessionId
    ) {
      throw new Error('Desktop Text Editor View identity is stale.');
    }
    const workspace = await this.options.shell.resolveAgentWorkspace(requested.workspaceId);
    const binding = await this.createBinding({
      projectId: requested.projectId,
      workspaceId: requested.workspaceId,
      windowId: requested.windowId,
      viewId: requested.viewId,
      viewInstanceId: requested.viewInstanceId,
      documentId: requested.documentId,
      rendererSessionId: shell.rendererSessionId,
      workspacePath: workspace.workspacePath,
    });
    const nextView = {
      ...view,
      ownerId: binding.runtimeIdentity.sessionId,
      editorSessionId: binding.runtimeIdentity.sessionId,
    };
    try {
      await this.options.shell.updateWorkbench(
        requested.windowId,
        shell.rendererSessionId,
        owner.workbenchInstanceId,
        openOrFocusMainView(owner.layout, nextView),
      );
    } catch (error) {
      this.releaseBinding(binding);
      throw error;
    }
    this.bindings.set(binding.runtimeIdentity.sessionId, binding);
    return binding;
  }

  private async createBinding(input: {
    readonly projectId: string;
    readonly workspaceId: string;
    readonly windowId: string;
    readonly viewId?: string;
    readonly viewInstanceId: string;
    readonly documentId: string;
    readonly rendererSessionId: string;
    readonly workspacePath: string;
  }): Promise<TextEditorBinding> {
    const sessionId = `text-document:${this.createIdentity()}`;
    const locator = { kind: 'workspace-file' as const, path: input.documentId };
    const session = await TextDocumentSession.open(
      {
        owner: { kind: 'window', windowId: input.windowId, projectId: input.projectId },
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        locator,
      },
      {
        reader: createNodeHostContentReadService({ workspaceRoot: input.workspacePath }),
        writer: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: input.workspacePath }),
        createSessionId: () => sessionId,
      },
    );
    const binding: TextEditorBinding = {
      runtimeIdentity: {
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        windowId: input.windowId,
        viewId: input.viewId ?? `text-editor:${this.createIdentity()}`,
        viewInstanceId: input.viewInstanceId,
        documentId: input.documentId,
        sessionId,
        rendererSessionId: input.rendererSessionId,
      },
      session,
      listeners: new Set(),
      externalChangeQueue: Promise.resolve(),
      eventSequence: 0,
      closed: false,
    };
    const absolutePath = path.join(input.workspacePath, ...input.documentId.split('/'));
    binding.watcher = this.watchFile(path.dirname(absolutePath), path.basename(absolutePath), () =>
      this.queueExternalChange(binding),
    );
    return binding;
  }

  private async attachCurrentRenderer(
    binding: TextEditorBinding,
    requested: TextEditorRuntimeIdentity,
  ): Promise<void> {
    const shell = await this.options.shell.getProjection(requested.windowId);
    const current = { ...binding.runtimeIdentity, rendererSessionId: shell.rendererSessionId };
    if (!sameTextEditorRuntimeIdentity(current, requested)) {
      throw new Error('Desktop Text Editor runtime identity is stale.');
    }
    const workbench = resolveDesktopWindowWorkspaceWorkbench(
      shell.window,
      requested.workspaceId,
    ).layout;
    const view = requireTextEditorView(workbench, requested.viewId);
    if (
      view.editorSessionId !== requested.sessionId ||
      view.documentId !== requested.documentId ||
      view.viewInstanceId !== requested.viewInstanceId
    ) {
      throw new Error('Desktop Text Editor View identity is stale.');
    }
    binding.runtimeIdentity = current;
  }

  private async closeBinding(binding: TextEditorBinding): Promise<void> {
    const shell = await this.options.shell.getProjection(binding.runtimeIdentity.windowId);
    const owner = resolveDesktopWindowWorkspaceWorkbench(
      shell.window,
      binding.runtimeIdentity.workspaceId,
    );
    await this.options.shell.updateWorkbench(
      binding.runtimeIdentity.windowId,
      shell.rendererSessionId,
      owner.workbenchInstanceId,
      closeMainView(owner.layout, binding.runtimeIdentity.viewId),
    );
    this.releaseBinding(binding);
  }

  private async closeReleasedCleanView(
    windowId: string,
    requested: TextEditorRuntimeIdentity,
  ): Promise<void> {
    if (requested.windowId !== windowId) {
      throw new Error('Desktop Text Editor session is unavailable.');
    }
    const shell = await this.options.shell.getProjection(windowId);
    if (shell.rendererSessionId !== requested.rendererSessionId) {
      throw new Error('Desktop Text Editor runtime identity is stale.');
    }
    const owner = resolveDesktopWindowWorkspaceWorkbench(shell.window, requested.workspaceId);
    const view = requireTextEditorView(owner.layout, requested.viewId);
    if (
      view.projectId !== requested.projectId ||
      view.workspaceId !== requested.workspaceId ||
      view.viewInstanceId !== requested.viewInstanceId ||
      view.documentId !== requested.documentId ||
      view.editorSessionId !== requested.sessionId ||
      view.ownerId !== requested.sessionId
    ) {
      throw new Error('Desktop Text Editor View identity is stale.');
    }
    await this.options.shell.updateWorkbench(
      windowId,
      shell.rendererSessionId,
      owner.workbenchInstanceId,
      closeMainView(owner.layout, requested.viewId),
    );
  }

  private queueExternalChange(binding: TextEditorBinding): Promise<void> {
    binding.externalChangeQueue = binding.externalChangeQueue.then(async () => {
      if (binding.closed) return;
      const projection = await binding.session.observeExternalChange();
      if (!projection || binding.closed) return;
      const unavailable = projection.diagnostics.some(
        (diagnostic) => diagnostic.code === 'text-document-external-change-unavailable',
      );
      if (unavailable && !projection.dirty) {
        await this.closeBinding(binding);
        return;
      }
      binding.eventSequence += 1;
      const event: TextEditorProjectionEvent = {
        sequence: binding.eventSequence,
        identity: binding.runtimeIdentity,
        projection,
      };
      for (const listener of binding.listeners) listener(event);
    });
    return binding.externalChangeQueue;
  }

  private releaseBinding(binding: TextEditorBinding): void {
    if (binding.closed) return;
    binding.closed = true;
    binding.watcher?.close();
    binding.listeners.clear();
    this.options.media.releaseSession(binding.runtimeIdentity.sessionId);
    this.bindings.delete(binding.runtimeIdentity.sessionId);
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Text Editor runtime is disposed.');
  }
}

function referenceSearchOwnsBinding(
  search: import('@neko/text-editor-domain').TextEditorMarkdownReferenceSearchRequest,
  binding: TextEditorBinding,
): boolean {
  const projection = binding.session.project();
  return (
    !binding.closed &&
    projection.sessionId === search.sessionId &&
    projection.editSequence === search.editSequence &&
    projection.identity.workspaceId === search.identity.workspaceId &&
    projection.identity.documentId === search.identity.documentId &&
    projection.identity.owner.kind === 'window' &&
    search.identity.owner.kind === 'window' &&
    projection.identity.owner.windowId === search.identity.owner.windowId &&
    projection.identity.owner.projectId === search.identity.owner.projectId
  );
}

function mediaRequestOwnsBinding(
  request: import('@neko/text-editor-domain').PrepareTextEditorMarkdownMediaRequest,
  binding: TextEditorBinding,
): boolean {
  const projection = binding.session.project();
  return (
    projection.mode === 'markdown' &&
    !binding.closed &&
    projection.sessionId === request.sessionId &&
    projection.editSequence === request.editSequence &&
    projection.identity.workspaceId === request.identity.workspaceId &&
    projection.identity.documentId === request.identity.documentId &&
    projection.identity.owner.kind === 'window' &&
    request.identity.owner.kind === 'window' &&
    projection.identity.owner.windowId === request.identity.owner.windowId &&
    projection.identity.owner.projectId === request.identity.owner.projectId
  );
}

function watchWorkspaceFile(
  directory: string,
  fileName: string,
  onChange: () => Promise<void>,
): DesktopTextEditorFileWatcher {
  const watcher = watch(directory, (_eventType, changedFileName) => {
    if (changedFileName !== null && changedFileName.toString() !== fileName) return;
    void onChange();
  });
  return watcher;
}

function requireResourceBrowserOwner(
  shell: TextEditorShellProjection,
  identity: ResourceBrowserIdentity,
): { readonly viewInstanceId: string } {
  const project = shell.catalog.projects.find(
    (candidate) =>
      candidate.projectId === identity.projectId && candidate.workspaceId === identity.workspaceId,
  );
  const tab = shell.window.tabs.find((candidate) => candidate.projectId === identity.projectId);
  if (
    !project ||
    !tab ||
    tab.viewInstanceId !== identity.viewInstanceId ||
    shell.rendererSessionId !== identity.rendererSessionId
  ) {
    throw new Error('Desktop Text Editor Resource owner is stale.');
  }
  return tab;
}

function requireTextEditorView(
  workbench: DesktopWorkbenchLayoutProjection,
  viewId: string,
): DesktopWorkbenchLayoutProjection['main']['views'][number] {
  const view = workbench.main.views.find(
    (candidate) => candidate.viewId === viewId && candidate.kind === 'text-editor',
  );
  if (!view) throw new Error('Desktop Text Editor View is unavailable.');
  return view;
}

function readyResult(requestId: string, binding: TextEditorBinding): TextEditorHostResult {
  return {
    requestId,
    identity: binding.runtimeIdentity,
    status: 'ready',
    projection: binding.session.project(),
  };
}
