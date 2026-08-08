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
import {
  TEXT_EDITOR_HOST_ROUTES,
  TextDocumentError,
  TextDocumentSession,
  parseTextEditorHostRequest,
  sameTextEditorRuntimeIdentity,
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

    const workspace = await this.options.shell.resolveAgentWorkspace(input.identity.workspaceId);
    const documentId = locator.path;
    const sessionId = `text-document:${this.createIdentity()}`;
    const session = await TextDocumentSession.open(
      {
        owner: {
          kind: 'window',
          windowId: input.identity.windowId,
          projectId: input.identity.projectId,
        },
        workspaceId: input.identity.workspaceId,
        documentId,
        locator,
      },
      {
        reader: createNodeHostContentReadService({ workspaceRoot: workspace.workspacePath }),
        writer: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: workspace.workspacePath }),
        createSessionId: () => sessionId,
      },
    );
    const runtimeIdentity: TextEditorRuntimeIdentity = {
      projectId: input.identity.projectId,
      workspaceId: input.identity.workspaceId,
      windowId: input.identity.windowId,
      viewId: `text-editor:${this.createIdentity()}`,
      viewInstanceId: owner.viewInstanceId,
      documentId,
      sessionId,
      rendererSessionId: shell.rendererSessionId,
    };
    const binding: TextEditorBinding = {
      runtimeIdentity,
      session,
      listeners: new Set(),
      externalChangeQueue: Promise.resolve(),
      eventSequence: 0,
      closed: false,
    };
    const absolutePath = path.join(workspace.workspacePath, ...locator.path.split('/'));
    binding.watcher = this.watchFile(
      path.dirname(absolutePath),
      path.basename(absolutePath),
      () => this.queueExternalChange(binding),
    );
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
    const binding = this.bindings.get(request.identity.sessionId);
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

  private queueExternalChange(binding: TextEditorBinding): Promise<void> {
    binding.externalChangeQueue = binding.externalChangeQueue.then(async () => {
      if (binding.closed) return;
      const projection = await binding.session.observeExternalChange();
      if (!projection || binding.closed) return;
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
    this.bindings.delete(binding.runtimeIdentity.sessionId);
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Text Editor runtime is disposed.');
  }
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
