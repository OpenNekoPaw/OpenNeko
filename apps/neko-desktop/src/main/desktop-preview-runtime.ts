import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  PREVIEW_HOST_RUNTIME_ROUTES,
  assertPreviewRuntimeIdentity,
  detectPreviewContentKind,
  getEpubResourceMediaType,
  getPreviewMediaType,
  parsePreviewProjection,
  parsePreviewRuntimeRequest,
  PreviewSessionRegistry,
  type PreviewContentKind,
  type PreviewProjection,
  type PreviewRuntimeRequest,
  type PreviewRuntimeIdentity,
  type PreviewSessionSnapshot,
  type PreviewViewPresentation,
} from '@neko/preview-domain';
import {
  createPreviewResourceProjectionService,
  type PreviewResourceProjectionService,
  type PreviewResourceSource,
} from '@neko/preview-domain/resource-projection';
import { createNodeArchiveResource } from '@neko/content/document/node';
import type {
  ResourceBrowserIdentity,
  ResourceBrowserItem,
  ResourceBrowserQuickPreviewDescriptor,
} from '@neko/assets-domain/resource-browser/contract';
import type { ContentLocator } from '@neko/content';
import {
  closeMainView,
  findMainGroupForView,
  openOrFocusMainView,
  type DesktopWorkbenchLayoutProjection,
} from '@neko/host/desktop-workbench-contract';
import {
  resolveDesktopWindowWorkspaceWorkbench,
  type DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import {
  parseDesktopPreviewBootstrapRequest,
  type DesktopPreviewBootstrapRequest,
} from '../shared/preview-bridge-contract';
import type { DesktopResourceRegistry } from './desktop-resource-registry';

type DesktopPreviewShellProjection = Pick<
  DesktopShellProjection,
  'rendererSessionId' | 'catalog' | 'window'
>;

export interface DesktopPreviewShellPort {
  getProjection(windowId: string): Promise<DesktopPreviewShellProjection>;
  updateWorkbench(
    windowId: string,
    rendererSessionId: string,
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<unknown>;
}

export interface DesktopPreviewRuntimeOptions {
  readonly shell: DesktopPreviewShellPort;
  readonly resources: Pick<
    DesktopResourceRegistry,
    'registerFile' | 'registerResourceSet' | 'registerResourceTree' | 'releaseSession'
  >;
  readonly createIdentity?: () => string;
}

export class DesktopPreviewRuntime {
  private readonly sessions = new PreviewSessionRegistry();
  private readonly pendingSources = new Map<string, PendingPreviewSource>();
  private readonly sourcePreparations = new Map<string, Promise<PreviewProjection>>();
  private readonly createIdentity: () => string;
  private readonly previewResources: PreviewResourceProjectionService<DesktopPreviewResourceOwner>;
  private disposed = false;

  constructor(private readonly options: DesktopPreviewRuntimeOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
    this.previewResources = createPreviewResourceProjectionService({
      resolveSource: async ({ owner }) => ({ status: 'ready', source: owner.source }),
      registerSource: async ({ owner, source }) => ({
        status: 'ready',
        lease: await publishPreviewResource({
          resources: this.options.resources,
          owner: owner.resourceOwner,
          source,
          displayName: owner.displayName,
          contentKind: owner.contentKind,
          signal: owner.signal,
        }),
      }),
    });
  }

  async open(
    input: {
      readonly identity: ResourceBrowserIdentity;
      readonly item: ResourceBrowserItem;
      readonly target?: {
        readonly viewId: string;
        readonly presentation: 'temporary' | 'side';
      };
    } & PreviewSourceInput,
  ): Promise<PreviewProjection> {
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
      shellProjection.rendererSessionId !== input.identity.rendererSessionId ||
      input.identity.viewInstanceId !== tab.viewInstanceId
    ) {
      throw new Error('Desktop Preview Resource owner is stale.');
    }
    const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      shellProjection.window,
      project.workspaceId,
    );
    const presentation = input.target?.presentation ?? 'temporary';
    const expectedViewId = `preview:${tab.viewId}:${presentation}`;
    const viewId = input.target?.viewId ?? expectedViewId;
    if (viewId !== expectedViewId) {
      throw new Error('Desktop Preview target View identity is stale.');
    }
    const sessionId = `preview-session:${this.createIdentity()}`;
    const runtimeIdentity: PreviewRuntimeIdentity = {
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      windowId: input.identity.windowId,
      viewId,
      viewInstanceId: tab.viewInstanceId,
      documentId: input.item.resourceId,
      sessionId,
      rendererSessionId: shellProjection.rendererSessionId,
    };
    const contentKind = detectPreviewContentKind(input.item.label);
    const mediaType = getPreviewMediaType(input.item.label);
    let projection: PreviewProjection;
    let pendingSource: PendingPreviewSource | undefined;
    if (!contentKind || !mediaType) {
      projection = parsePreviewProjection({
        identity: runtimeIdentity,
        presentation,
        status: 'unsupported',
        diagnostic: {
          code: 'preview-unsupported-kind',
          message: `Desktop Preview does not support '${input.item.label}'.`,
        },
      });
    } else {
      const source = await resolvePreviewSource(input, mediaType);
      const descriptorId = `preview:${sessionId}`;
      const contentLocator = resolvePreviewContentLocator(input.item);
      projection = parsePreviewProjection({
        identity: runtimeIdentity,
        presentation,
        status: 'loading',
      });
      pendingSource = {
        source,
        displayName: input.item.label,
        contentKind,
        contentLocator,
        descriptorId,
        identity: runtimeIdentity,
        presentation,
        abortController: new AbortController(),
      };
    }
    const currentWorkbench = workspaceWorkbench.layout;
    const previewView: DesktopWorkbenchLayoutProjection['main']['views'][number] = {
      viewId,
      viewInstanceId: tab.viewInstanceId,
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
    } catch (error) {
      this.options.resources.releaseSession(sessionId);
      throw error;
    }
    try {
      await this.options.shell.updateWorkbench(
        input.identity.windowId,
        shellProjection.rendererSessionId,
        workspaceWorkbench.workbenchInstanceId,
        workbench,
      );
      for (const releasedSessionId of this.sessions.register(projection)) {
        this.releaseSessionResources(releasedSessionId);
      }
      if (pendingSource) this.pendingSources.set(sessionId, pendingSource);
      return projection;
    } catch (error) {
      this.options.resources.releaseSession(sessionId);
      throw error;
    }
  }

  async openQuickPreview(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
  }): Promise<{
    readonly previewSessionId: string;
    readonly descriptor: ResourceBrowserQuickPreviewDescriptor;
  }> {
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
      shellProjection.rendererSessionId !== input.identity.rendererSessionId ||
      input.identity.viewInstanceId !== tab.viewInstanceId
    ) {
      throw new Error('Desktop quick Preview Resource owner is stale.');
    }
    const contentKind = detectPreviewContentKind(input.item.label);
    const mediaType = getPreviewMediaType(input.item.label);
    if (
      (contentKind !== 'image' && contentKind !== 'video' && contentKind !== 'audio') ||
      !mediaType
    ) {
      throw new Error(`Desktop quick Preview does not support '${input.item.label}'.`);
    }
    const previewSessionId = `preview-hover:${this.createIdentity()}`;
    const descriptorId = `preview:${previewSessionId}`;
    const source = await resolvePreviewSource({ absolutePath: input.absolutePath }, mediaType);
    const projected = await this.previewResources.project({
      descriptorId,
      locator: resolvePreviewContentLocator(input.item),
      displayName: input.item.label,
      owner: {
        source,
        displayName: input.item.label,
        contentKind,
        signal: new AbortController().signal,
        resourceOwner: {
          windowId: input.identity.windowId,
          viewId: input.identity.viewId,
          sessionId: previewSessionId,
          rendererSessionId: input.identity.rendererSessionId,
        },
      },
      requestedMediaType: mediaType,
    });
    if (projected.status === 'unavailable') {
      throw new Error(projected.diagnostic.message);
    }
    if (projected.descriptor.contentKind !== contentKind) {
      projected.lease.release();
      throw new Error('Desktop quick Preview descriptor kind does not match its item.');
    }
    try {
      this.sessions.registerTransient(input.identity.windowId, previewSessionId);
    } catch (error) {
      this.previewResources.release(descriptorId);
      throw error;
    }
    return {
      previewSessionId,
      descriptor: { ...projected.descriptor, contentKind },
    };
  }

  releaseQuickPreview(windowId: string, previewSessionId: string): void {
    this.requireActive();
    this.sessions.releaseTransient(windowId, previewSessionId);
    this.previewResources.release(`preview:${previewSessionId}`);
  }

  async getSnapshot(
    windowId: string,
    value: DesktopPreviewBootstrapRequest | unknown,
  ): Promise<PreviewProjection> {
    this.requireActive();
    const request = parseDesktopPreviewBootstrapRequest(value);
    const session = this.sessions.read(request.sessionId);
    const projection = await this.options.shell.getProjection(windowId);
    const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      projection.window,
      request.workspaceId,
    );
    const view = workspaceWorkbench.layout.main.views.find(
      (candidate) =>
        candidate.kind === 'preview' &&
        candidate.viewId === request.viewId &&
        candidate.ownerId === request.sessionId,
    );
    if (!view) throw new Error('Desktop Preview View is no longer attached.');
    if (request.rendererSessionId !== projection.rendererSessionId) {
      throw new Error('Desktop Preview bootstrap endpoint is stale.');
    }
    const requestedIdentity = {
      ...session.identity,
      projectId: request.projectId,
      workspaceId: request.workspaceId,
      windowId,
      viewId: request.viewId,
      viewInstanceId: request.viewInstanceId,
      sessionId: request.sessionId,
      rendererSessionId: session.identity.rendererSessionId,
    };
    assertPreviewRuntimeIdentity(session.identity, requestedIdentity);
    if (session.identity.rendererSessionId !== request.rendererSessionId) {
      throw new Error('Desktop Preview session endpoint is stale.');
    }
    return session.projection.status === 'loading'
      ? this.prepareSource(session)
      : session.projection;
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
    const session = this.sessions.assertIdentity(request.identity);
    const shellProjection = await this.options.shell.getProjection(windowId);
    const workspaceWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      shellProjection.window,
      session.identity.workspaceId,
    );
    const currentWorkbench = workspaceWorkbench.layout;
    const view = currentWorkbench.main.views.find(
      (candidate) =>
        candidate.kind === 'preview' &&
        candidate.viewId === session.identity.viewId &&
        candidate.ownerId === session.identity.sessionId,
    );
    if (!view) throw new Error('Desktop Preview View is no longer attached.');
    switch (request.route) {
      case PREVIEW_HOST_RUNTIME_ROUTES.snapshotGet:
        return session.projection.status === 'loading'
          ? this.prepareSource(session)
          : session.projection;
      case PREVIEW_HOST_RUNTIME_ROUTES.viewPin:
        return this.updatePresentation(
          session,
          shellProjection,
          workspaceWorkbench.workbenchInstanceId,
          view,
          'pinned',
        );
      case PREVIEW_HOST_RUNTIME_ROUTES.viewOpen:
        return this.updatePresentation(
          session,
          shellProjection,
          workspaceWorkbench.workbenchInstanceId,
          view,
          'side',
        );
      case PREVIEW_HOST_RUNTIME_ROUTES.viewClose:
        return this.closeSession(
          session,
          shellProjection,
          workspaceWorkbench.workbenchInstanceId,
          view,
        );
      case PREVIEW_HOST_RUNTIME_ROUTES.contentResolve:
        throw new Error(
          'Desktop Preview content is resolved only through its Host-authorized descriptor.',
        );
    }
  }

  detachWindow(windowId: string): void {
    for (const sessionId of this.sessions.detachWindow(windowId)) {
      this.releaseSessionResources(sessionId);
    }
  }

  reconcileWindow(
    windowId: string,
    workbenches: readonly DesktopWorkbenchLayoutProjection[],
  ): void {
    const attachedSessionIds = workbenches
      .flatMap((workbench) => workbench.main.views)
      .filter((view) => view.kind === 'preview')
      .map((view) => view.ownerId);
    for (const sessionId of this.sessions.reconcileWindow(windowId, attachedSessionIds)) {
      this.releaseSessionResources(sessionId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const sessionId of this.sessions.dispose()) {
      this.releaseSessionResources(sessionId);
    }
    this.previewResources.dispose();
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Preview runtime is disposed.');
  }

  private prepareSource(session: PreviewSessionSnapshot): Promise<PreviewProjection> {
    const sessionId = session.identity.sessionId;
    const current = this.sourcePreparations.get(sessionId);
    if (current) return current;
    const source = this.pendingSources.get(sessionId);
    if (!source) {
      throw new Error(`Preview session '${sessionId}' has no pending source.`);
    }
    const preparation = this.completeSourcePreparation(session, source).finally(() => {
      if (this.sourcePreparations.get(sessionId) === preparation) {
        this.sourcePreparations.delete(sessionId);
      }
    });
    this.sourcePreparations.set(sessionId, preparation);
    return preparation;
  }

  private async completeSourcePreparation(
    session: PreviewSessionSnapshot,
    source: PendingPreviewSource,
  ): Promise<PreviewProjection> {
    try {
      source.abortController.signal.throwIfAborted();
      const projected = await this.previewResources.project({
        descriptorId: source.descriptorId,
        locator: source.contentLocator,
        displayName: source.displayName,
        owner: {
          source: source.source,
          displayName: source.displayName,
          contentKind: source.contentKind,
          signal: source.abortController.signal,
          resourceOwner: {
            windowId: source.identity.windowId,
            viewId: source.identity.viewId,
            sessionId: source.identity.sessionId,
            rendererSessionId: source.identity.rendererSessionId,
          },
        },
        requestedMediaType: source.source.mediaType,
      });
      if (projected.status === 'unavailable') throw new Error(projected.diagnostic.message);
      if (source.abortController.signal.aborted) {
        this.previewResources.release(source.descriptorId);
        source.abortController.signal.throwIfAborted();
      }
      if (this.pendingSources.get(source.identity.sessionId) !== source) {
        this.previewResources.release(source.descriptorId);
        throw new Error(`Preview session '${source.identity.sessionId}' preparation is stale.`);
      }
      const ready = parsePreviewProjection({
        identity: source.identity,
        presentation: source.presentation,
        status: 'ready',
        descriptor: projected.descriptor,
      });
      const transition = this.sessions.planPreparation(session.identity.sessionId, ready);
      this.pendingSources.delete(session.identity.sessionId);
      return this.sessions.commit(transition).projection;
    } catch (error) {
      if (source.abortController.signal.aborted) throw error;
      if (
        !this.sessions.has(session.identity.sessionId) ||
        this.pendingSources.get(session.identity.sessionId) !== source
      ) {
        throw error;
      }
      const unavailable = parsePreviewProjection({
        identity: source.identity,
        presentation: source.presentation,
        status: 'unavailable',
        diagnostic: {
          code: 'preview-source-unavailable',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      const transition = this.sessions.planPreparation(session.identity.sessionId, unavailable);
      this.pendingSources.delete(session.identity.sessionId);
      return this.sessions.commit(transition).projection;
    }
  }

  private releaseSessionResources(sessionId: string): void {
    const source = this.pendingSources.get(sessionId);
    if (source) {
      this.pendingSources.delete(sessionId);
      source.abortController.abort(new Error('Preview source preparation was released.'));
    }
    this.previewResources.release(`preview:${sessionId}`);
  }

  private async updatePresentation(
    session: PreviewSessionSnapshot,
    shellProjection: DesktopPreviewShellProjection,
    workbenchInstanceId: string,
    view: DesktopWorkbenchLayoutProjection['main']['views'][number],
    presentation: Exclude<PreviewViewPresentation, 'temporary'>,
  ): Promise<PreviewProjection> {
    if (session.projection.presentation === presentation) return session.projection;
    const currentWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      shellProjection.window,
      session.identity.workspaceId,
    ).layout;
    const nextViewId =
      session.projection.presentation === 'temporary'
        ? `preview:${view.viewId.split(':')[1] ?? view.viewId}:${session.identity.sessionId}`
        : view.viewId;
    const transition = this.sessions.planPresentation(
      session.identity.sessionId,
      presentation,
      nextViewId,
    );
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
    await this.options.shell.updateWorkbench(
      session.identity.windowId,
      shellProjection.rendererSessionId,
      workbenchInstanceId,
      workbench,
    );
    return this.sessions.commit(transition).projection;
  }

  private async closeSession(
    session: PreviewSessionSnapshot,
    shellProjection: DesktopPreviewShellProjection,
    workbenchInstanceId: string,
    view: DesktopWorkbenchLayoutProjection['main']['views'][number],
  ): Promise<PreviewProjection> {
    const currentWorkbench = resolveDesktopWindowWorkspaceWorkbench(
      shellProjection.window,
      session.identity.workspaceId,
    ).layout;
    const workbench = closeMainView(currentWorkbench, view.viewId);
    const transition = this.sessions.planClose(session.identity.sessionId);
    await this.options.shell.updateWorkbench(
      session.identity.windowId,
      shellProjection.rendererSessionId,
      workbenchInstanceId,
      workbench,
    );
    this.releaseSessionResources(session.identity.sessionId);
    return this.sessions.commitClose(transition);
  }
}

function resolvePreviewContentLocator(item: ResourceBrowserItem): ResourceBrowserContentLocator {
  if ((item.source === 'files' || item.source === 'media') && item.role !== 'library-root') {
    return item.locator;
  }
  throw new Error(`Desktop Preview item '${item.resourceId}' has no content locator.`);
}

type ResourceBrowserContentLocator = ContentLocator;

interface PublishedPreviewResource {
  readonly url: string;
  readonly resourceUris?: Readonly<Record<string, string>>;
  release(): void;
}

type PreviewSourceInput =
  | {
      readonly absolutePath: string;
      readonly bytes?: never;
    }
  | {
      readonly absolutePath?: never;
      readonly bytes: Uint8Array;
    };

async function resolvePreviewSource(
  input: PreviewSourceInput,
  mediaType: string,
): Promise<PreviewResourceSource> {
  if (input.absolutePath !== undefined) {
    const file = await stat(input.absolutePath);
    if (!file.isFile()) throw new Error('Desktop Preview source is not a file.');
    return {
      kind: 'file',
      absolutePath: input.absolutePath,
      mediaType,
      byteLength: file.size,
      sourceFingerprint: `${file.mtimeMs}:${file.size}`,
    };
  }
  const bytes = input.bytes.slice();
  return {
    kind: 'bytes',
    bytes,
    mediaType,
    byteLength: bytes.byteLength,
    sourceFingerprint: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

interface PendingPreviewSource {
  readonly source: PreviewResourceSource;
  readonly displayName: string;
  readonly contentKind: PreviewContentKind;
  readonly contentLocator: ResourceBrowserContentLocator;
  readonly descriptorId: string;
  readonly identity: PreviewRuntimeIdentity;
  readonly presentation: PreviewViewPresentation;
  readonly abortController: AbortController;
}

interface DesktopPreviewResourceOwner {
  readonly source: PreviewResourceSource;
  readonly displayName: string;
  readonly contentKind: PreviewContentKind;
  readonly signal: AbortSignal;
  readonly resourceOwner: Parameters<DesktopResourceRegistry['registerFile']>[0];
}

async function publishPreviewResource(input: {
  readonly resources: Pick<
    DesktopResourceRegistry,
    'registerFile' | 'registerResourceSet' | 'registerResourceTree'
  >;
  readonly owner: Parameters<DesktopResourceRegistry['registerFile']>[0];
  readonly source: PreviewResourceSource;
  readonly displayName: string;
  readonly contentKind: PreviewContentKind;
  readonly signal: AbortSignal;
}): Promise<PublishedPreviewResource> {
  input.signal.throwIfAborted();
  if (input.source.kind === 'bytes') {
    const bytes = input.source.bytes;
    const lease = input.resources.registerResourceTree(input.owner, {
      entries: [
        {
          virtualPath: 'content',
          byteLength: bytes.byteLength,
          contentType: input.source.mediaType,
          read: async (signal) => {
            signal.throwIfAborted();
            return bytes;
          },
        },
      ],
      release: () => undefined,
    });
    releaseLeaseIfAborted(lease, input.signal);
    return { url: new URL('content', lease.url).toString(), release: lease.release };
  }
  const absolutePath = input.source.absolutePath;
  if (input.source.mediaType === 'application/epub+zip') {
    const archive = await createNodeArchiveResource(absolutePath, {
      signal: input.signal,
    });
    try {
      if (!archive.entries.some((entry) => entry.path === 'META-INF/container.xml')) {
        throw new Error('EPUB container descriptor is missing.');
      }
      const lease = input.resources.registerResourceTree(input.owner, {
        entries: archive.entries.map((entry) => ({
          virtualPath: entry.path,
          byteLength: entry.byteLength,
          contentType: getEpubResourceMediaType(entry.path),
          read: (signal) => archive.readEntry(entry.path, signal),
        })),
        release: () => {
          void archive.dispose();
        },
      });
      releaseLeaseIfAborted(lease, input.signal);
      return lease;
    } catch (error) {
      await archive.dispose();
      throw error;
    }
  }
  if (
    input.contentKind !== 'model' ||
    path.extname(input.displayName).toLocaleLowerCase() !== '.gltf'
  ) {
    const lease = await input.resources.registerFile(input.owner, {
      absolutePath,
      mediaType: input.source.mediaType,
    });
    releaseLeaseIfAborted(lease, input.signal);
    return lease;
  }
  const dependencies = await resolveGltfDependencies(absolutePath);
  const entryPath = path.basename(absolutePath);
  const lease = await input.resources.registerResourceSet(
    input.owner,
    [
      {
        virtualPath: entryPath,
        path: absolutePath,
        contentType: input.source.mediaType,
      },
      ...dependencies.map((dependency) => ({
        virtualPath: dependency.virtualPath,
        path: dependency.absolutePath,
        contentType: dependency.mediaType,
      })),
    ],
    entryPath,
  );
  releaseLeaseIfAborted(lease, input.signal);
  return {
    url: lease.url,
    release: lease.release,
    resourceUris: {
      [input.displayName]: lease.url,
      ...Object.fromEntries(
        dependencies.map((dependency) => [
          dependency.reference,
          new URL(dependency.reference, lease.url).toString(),
        ]),
      ),
    },
  };
}

function releaseLeaseIfAborted(lease: { release(): void }, signal: AbortSignal): void {
  if (!signal.aborted) return;
  lease.release();
  signal.throwIfAborted();
}

interface GltfDependency {
  readonly reference: string;
  readonly virtualPath: string;
  readonly absolutePath: string;
  readonly mediaType: string;
}

async function resolveGltfDependencies(absolutePath: string): Promise<readonly GltfDependency[]> {
  const manifest = parseGltfManifest(await readFile(absolutePath, 'utf8'));
  const references = collectGltfReferences(manifest);
  const sourcePath = await realpath(absolutePath);
  const sourceRoot = path.dirname(sourcePath);
  return Promise.all(
    references.map(async (reference) => {
      const virtualPath = normalizeGltfReference(reference);
      const dependencyPath = await realpath(path.resolve(sourceRoot, ...virtualPath.split('/')));
      const relativePath = path.relative(sourceRoot, dependencyPath);
      if (
        relativePath.length === 0 ||
        path.isAbsolute(relativePath) ||
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`)
      ) {
        throw new Error(`Preview glTF dependency '${reference}' escapes the model directory.`);
      }
      const metadata = await stat(dependencyPath);
      if (!metadata.isFile()) {
        throw new Error(`Preview glTF dependency '${reference}' is not a file.`);
      }
      return {
        reference,
        virtualPath,
        absolutePath: dependencyPath,
        mediaType: getGltfDependencyMediaType(virtualPath),
      };
    }),
  );
}

function parseGltfManifest(source: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('Preview glTF manifest is not valid JSON.');
  }
  if (!isRecord(value)) throw new Error('Preview glTF manifest must be an object.');
  return value;
}

function collectGltfReferences(manifest: Record<string, unknown>): readonly string[] {
  const references = new Set<string>();
  for (const collectionName of ['buffers', 'images'] as const) {
    const collection = manifest[collectionName];
    if (collection === undefined) continue;
    if (!Array.isArray(collection)) {
      throw new Error(`Preview glTF '${collectionName}' must be an array.`);
    }
    for (const entry of collection) {
      if (!isRecord(entry) || entry['uri'] === undefined) continue;
      const uri = entry['uri'];
      if (typeof uri !== 'string' || uri.length === 0) {
        throw new Error(`Preview glTF '${collectionName}' contains an invalid URI.`);
      }
      if (uri.startsWith('data:')) continue;
      references.add(uri);
    }
  }
  if (references.size > 512) {
    throw new Error('Preview glTF declares more than 512 external dependencies.');
  }
  return [...references];
}

function normalizeGltfReference(reference: string): string {
  if (
    reference.startsWith('/') ||
    reference.startsWith('\\') ||
    reference.startsWith('//') ||
    reference.includes('\\') ||
    reference.includes('\0') ||
    reference.includes('?') ||
    reference.includes('#') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(reference)
  ) {
    throw new Error(`Preview glTF dependency '${reference}' must be a relative file URI.`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    throw new Error(`Preview glTF dependency '${reference}' has invalid URL encoding.`);
  }
  const segments = decoded.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\') ||
        segment.includes('\0'),
    )
  ) {
    throw new Error(`Preview glTF dependency '${reference}' contains an unsafe path segment.`);
  }
  return segments.join('/');
}

function getGltfDependencyMediaType(virtualPath: string): string {
  switch (path.extname(virtualPath).slice(1).toLocaleLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'ktx2':
      return 'image/ktx2';
    case 'basis':
      return 'image/x-basis';
    default:
      return 'application/octet-stream';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
