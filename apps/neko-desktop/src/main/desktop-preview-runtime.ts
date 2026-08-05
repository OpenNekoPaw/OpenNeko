import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  PREVIEW_HOST_RUNTIME_ROUTES,
  assertPreviewRuntimeIdentity,
  detectPreviewContentKind,
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
import type {
  ResourceBrowserIdentity,
  ResourceBrowserItem,
  ResourceBrowserQuickPreviewDescriptor,
} from '@neko/assets-domain/resource-browser/contract';
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
    expectedWindowRevision: number,
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<unknown>;
}

export interface DesktopPreviewRuntimeOptions {
  readonly shell: DesktopPreviewShellPort;
  readonly resources: Pick<
    DesktopResourceRegistry,
    'registerFile' | 'registerResourceSet' | 'releaseSession'
  >;
  readonly createIdentity?: () => string;
}

export class DesktopPreviewRuntime {
  private readonly sessions = new PreviewSessionRegistry();
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
      const file = await stat(input.absolutePath);
      if (!file.isFile()) throw new Error('Desktop Preview source is not a file.');
      const revision = `${file.mtimeMs}:${file.size}`;
      const descriptorId = `preview:${sessionId}`;
      const resource = await publishPreviewResource({
        resources: this.options.resources,
        owner: {
          windowId: input.identity.windowId,
          viewId,
          sessionId,
          rendererSessionId: input.identity.rendererSessionId,
          revision,
        },
        absolutePath: input.absolutePath,
        displayName: input.item.label,
        contentKind,
        mediaType,
        revision,
      });
      projection = parsePreviewProjection({
        identity: runtimeIdentity,
        presentation,
        status: 'ready',
        descriptor: {
          descriptorId,
          sourceFingerprint: revision,
          contentLocator: resolvePreviewContentLocator(input.item),
          url: resource.url,
          ...(resource.resourceUris ? { resourceUris: resource.resourceUris } : {}),
          contentKind,
          mediaType,
          displayName: input.item.label,
          byteLength: file.size,
        },
      });
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
        shellProjection.window.revision,
        workspaceWorkbench.workbenchInstanceId,
        workbench,
      );
      for (const releasedSessionId of this.sessions.register(projection)) {
        this.options.resources.releaseSession(releasedSessionId);
      }
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
    const file = await stat(input.absolutePath);
    if (!file.isFile()) throw new Error('Desktop quick Preview source is not a file.');
    const previewSessionId = `preview-hover:${this.createIdentity()}`;
    const revision = `${file.mtimeMs}:${file.size}`;
    const descriptorId = `preview:${previewSessionId}`;
    const lease = await this.options.resources.registerFile(
      {
        windowId: input.identity.windowId,
        viewId: input.identity.viewId,
        sessionId: previewSessionId,
        rendererSessionId: input.identity.rendererSessionId,
        revision,
      },
      {
        absolutePath: input.absolutePath,
        mediaType,
        revision,
      },
    );
    this.sessions.registerTransient(input.identity.windowId, previewSessionId);
    return {
      previewSessionId,
      descriptor: {
        descriptorId,
        sourceFingerprint: revision,
        contentLocator: resolvePreviewContentLocator(input.item),
        url: lease.url,
        contentKind,
        mediaType,
        displayName: input.item.label,
        byteLength: file.size,
      },
    };
  }

  releaseQuickPreview(windowId: string, previewSessionId: string): void {
    this.requireActive();
    this.sessions.releaseTransient(windowId, previewSessionId);
    this.options.resources.releaseSession(previewSessionId);
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
        return session.projection;
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
      this.options.resources.releaseSession(sessionId);
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
      this.options.resources.releaseSession(sessionId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const sessionId of this.sessions.dispose()) {
      this.options.resources.releaseSession(sessionId);
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Preview runtime is disposed.');
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
      shellProjection.window.revision,
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
      shellProjection.window.revision,
      workbenchInstanceId,
      workbench,
    );
    this.options.resources.releaseSession(session.identity.sessionId);
    return this.sessions.commitClose(transition);
  }
}

function resolvePreviewContentLocator(item: ResourceBrowserItem): ResourceBrowserContentLocator {
  if (item.facet === 'files' || item.facet === 'media') {
    return item.locator;
  }
  if (
    item.facet === 'entities' &&
    item.entityStatus !== 'candidate' &&
    item.representationLocator
  ) {
    return item.representationLocator;
  }
  throw new Error(`Desktop Preview item '${item.resourceId}' has no content locator.`);
}

type ResourceBrowserContentLocator =
  | Extract<ResourceBrowserItem, { readonly facet: 'files' | 'media' }>['locator']
  | NonNullable<
      Extract<
        ResourceBrowserItem,
        {
          readonly facet: 'entities';
          readonly entityStatus: 'confirmed' | 'needs-attention' | 'deprecated';
        }
      >['representationLocator']
    >;

interface PublishedPreviewResource {
  readonly url: string;
  readonly resourceUris?: Readonly<Record<string, string>>;
}

async function publishPreviewResource(input: {
  readonly resources: Pick<DesktopResourceRegistry, 'registerFile' | 'registerResourceSet'>;
  readonly owner: Parameters<DesktopResourceRegistry['registerFile']>[0];
  readonly absolutePath: string;
  readonly displayName: string;
  readonly contentKind: PreviewContentKind;
  readonly mediaType: string;
  readonly revision: string;
}): Promise<PublishedPreviewResource> {
  if (
    input.contentKind !== 'model' ||
    path.extname(input.displayName).toLocaleLowerCase() !== '.gltf'
  ) {
    return input.resources.registerFile(input.owner, {
      absolutePath: input.absolutePath,
      mediaType: input.mediaType,
      revision: input.revision,
    });
  }
  const dependencies = await resolveGltfDependencies(input.absolutePath);
  const entryPath = path.basename(input.absolutePath);
  const lease = await input.resources.registerResourceSet(
    input.owner,
    [
      {
        virtualPath: entryPath,
        path: input.absolutePath,
        contentType: input.mediaType,
        revision: input.revision,
      },
      ...dependencies.map((dependency) => ({
        virtualPath: dependency.virtualPath,
        path: dependency.absolutePath,
        contentType: dependency.mediaType,
        revision: dependency.revision,
      })),
    ],
    entryPath,
  );
  return {
    url: lease.url,
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

interface GltfDependency {
  readonly reference: string;
  readonly virtualPath: string;
  readonly absolutePath: string;
  readonly mediaType: string;
  readonly revision: string;
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
        revision: `${metadata.mtimeMs}:${metadata.size}`,
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
