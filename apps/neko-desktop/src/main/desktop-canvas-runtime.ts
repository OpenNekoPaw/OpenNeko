import { randomUUID } from 'node:crypto';
import {
  CanvasHostRuntimeSession,
  parseCanvasMaterialActionResolutionRequest,
  parseCanvasHostIntentRequest,
  projectGenerationSnapshotToCanvas,
  type CanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
  type CanvasMaterialActionResolution,
  type CanvasMaterialActionTarget,
  type CanvasGenerationApplicationPort,
  createCanvasMaterialActionOwner,
} from '@neko/canvas-domain';
import type { NekoHostPorts } from '@neko/host/ports';
import { type ContentLocator } from '@neko/content';
import {
  CANVAS_VERSION,
  loadNkc,
  saveNkc,
  type CanvasData,
  type CanvasMaterialAuthoringRequest,
  type CanvasMediaLibraryCopyConflictPolicy,
  type CanvasMaterialMediaKind,
  type CanvasReferencedContentLocator,
} from '@neko/canvas-domain';
import type { DesktopCanvasViewGrant } from '@neko/host/desktop-shell-service';
import type { DesktopWorkbenchLayoutProjection } from '@neko/host/desktop-workbench-contract';
import {
  CanvasMaterialAuthoringService,
  CanvasMediaLibraryCopyService,
  type CanvasExternalSource,
} from '@neko/canvas-node';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import {
  parseDesktopCanvasMediaRequest,
  parseDesktopCanvasPreviewVariantRequest,
  type DesktopCanvasMediaRequest,
  type DesktopCanvasMediaResponse,
  type DesktopCanvasPreviewVariantRequest,
  type DesktopCanvasPreviewVariantResult,
} from '../shared/canvas-bridge-contract';

export interface DesktopCanvasShellPort {
  resolveCanvasViewGrant(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<DesktopCanvasViewGrant>;
}

interface DesktopCanvasSessionEntry {
  readonly windowId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly documentPath: string;
  readonly workspace: DesktopCanvasViewGrant['workspace'];
  readonly session: CanvasHostRuntimeSession;
}

export interface DesktopCanvasMediaPort {
  execute(
    request: DesktopCanvasMediaRequest,
    workspace: DesktopCanvasViewGrant['workspace'],
  ): Promise<DesktopCanvasMediaResponse | undefined>;
  detachWindow(windowId: string): void;
  detachView(windowId: string, viewId: string): void;
  dispose(): Promise<void>;
}

export type DesktopCanvasSourceSelection =
  | {
      readonly kind: 'external-import';
      readonly source: CanvasExternalSource;
    }
  | {
      readonly kind: 'workspace-reference';
      readonly locator: CanvasReferencedContentLocator;
      readonly title: string;
    };

export interface DesktopCanvasProjectMediaLibraryCopySelection {
  readonly libraryName: string;
  readonly destinationDirectory: string;
  readonly fileName: string;
  readonly conflictPolicy: CanvasMediaLibraryCopyConflictPolicy;
}

export interface DesktopCanvasGlobalMediaLibraryCopySelection {
  readonly globalLibraryId: string;
  readonly destinationDirectory: string;
  readonly fileName: string;
  readonly conflictPolicy: CanvasMediaLibraryCopyConflictPolicy;
}

export class DesktopCanvasRuntime {
  private readonly sessions = new Map<string, DesktopCanvasSessionEntry>();
  private readonly materialAuthoring: CanvasMaterialAuthoringService;
  private readonly mediaLibraryCopy: CanvasMediaLibraryCopyService;
  private disposed = false;

  constructor(
    private readonly options: {
      readonly shell: DesktopCanvasShellPort;
      readonly host: NekoHostPorts;
      readonly globalMediaLibraryRoot: string;
      readonly requestSource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly sourceKind: 'image' | 'video' | 'audio' | 'model' | 'document' | 'canvas';
        readonly sourceMode: 'import' | 'reference';
        readonly workspace: DesktopCanvasViewGrant['workspace'];
      }) => Promise<DesktopCanvasSourceSelection | undefined>;
      readonly previewResource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly locator: ContentLocator;
        readonly absolutePath: string;
      }) => Promise<void>;
      readonly createPreviewVariant?: (input: {
        readonly absolutePath: string;
        readonly mediaType?: string;
      }) => Promise<string>;
      readonly resolveCut?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly target: CanvasMaterialActionTarget;
        readonly absolutePath: string;
      }) => Promise<boolean>;
      readonly openInCut?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly target: CanvasMaterialActionTarget;
        readonly absolutePath: string;
      }) => Promise<void>;
      readonly requestProjectMediaLibraryCopy?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly workspace: DesktopCanvasViewGrant['workspace'];
        readonly target: CanvasMaterialActionTarget;
        readonly suggestedFileName: string;
      }) => Promise<DesktopCanvasProjectMediaLibraryCopySelection | undefined>;
      readonly requestGlobalMediaLibraryCopy?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly workspace: DesktopCanvasViewGrant['workspace'];
        readonly target: CanvasMaterialActionTarget;
        readonly suggestedFileName: string;
      }) => Promise<DesktopCanvasGlobalMediaLibraryCopySelection | undefined>;
      readonly materialActionLabels?: {
        readonly preview: string;
        readonly reveal: string;
        readonly openInCut?: string;
        readonly copyToProjectMediaLibrary?: string;
        readonly copyToGlobalMediaLibrary?: string;
        readonly regenerate?: string;
        readonly editAndGenerate?: string;
      };
      readonly media?: DesktopCanvasMediaPort;
      readonly generation?: CanvasGenerationApplicationPort;
    },
  ) {
    this.materialAuthoring = new CanvasMaterialAuthoringService({
      host: options.host,
      globalMediaLibraryRoot: options.globalMediaLibraryRoot,
    });
    this.mediaLibraryCopy = new CanvasMediaLibraryCopyService({
      globalMediaLibraryRoot: options.globalMediaLibraryRoot,
    });
  }

  async getSnapshot(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<CanvasHostSnapshot> {
    return (await this.requireSession(windowId, identity)).session.getSnapshot();
  }

  async executeIntent(
    windowId: string,
    payload: CanvasHostIntentRequest | unknown,
  ): Promise<CanvasHostIntentResult> {
    const request = parseCanvasHostIntentRequest(payload);
    return (await this.requireSession(windowId, request.identity)).session.executeIntent(request);
  }

  async resolveMaterialActions(
    windowId: string,
    payload: unknown,
  ): Promise<CanvasMaterialActionResolution> {
    const request = parseCanvasMaterialActionResolutionRequest(payload);
    return (await this.requireSession(windowId, request.identity)).session.resolveMaterialActions(
      request,
    );
  }

  async resolvePreviewVariant(
    windowId: string,
    value: DesktopCanvasPreviewVariantRequest | unknown,
  ): Promise<DesktopCanvasPreviewVariantResult> {
    const request = parseDesktopCanvasPreviewVariantRequest(value);
    const entry = await this.requireSession(windowId, request.identity);
    const createPreviewVariant = this.options.createPreviewVariant;
    if (!createPreviewVariant) {
      throw new Error('Canvas preview variant capability is unavailable.');
    }
    const absolutePath = await resolveWorkspaceContentLocator(entry.workspace, request.locator);
    return {
      requestId: request.requestId,
      url: await createPreviewVariant({
        absolutePath,
        ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
      }),
    };
  }

  async executeMediaRequest(
    windowId: string,
    value: DesktopCanvasMediaRequest | unknown,
  ): Promise<DesktopCanvasMediaResponse | undefined> {
    const request = parseDesktopCanvasMediaRequest(value);
    const entry = await this.requireSession(windowId, request.identity);
    const media = this.options.media;
    if (!media) throw new Error('Canvas media capability is unavailable.');
    return media.execute(request, entry.workspace);
  }

  async subscribe(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
    listener: (event: CanvasHostProjectionEvent) => void,
  ): Promise<() => void> {
    return (await this.requireSession(windowId, identity)).session.subscribe(listener);
  }

  detachWindow(windowId: string): void {
    for (const [key, entry] of this.sessions) {
      if (entry.windowId !== windowId) continue;
      entry.session.dispose();
      this.sessions.delete(key);
    }
    this.options.media?.detachWindow(windowId);
    this.options.generation?.detachWindow(windowId);
  }

  reconcileWorkbench(windowId: string, workbench: DesktopWorkbenchLayoutProjection): void {
    const attached = new Map(
      workbench.main.views
        .filter((view) => view.kind === 'canvas')
        .map((view) => [view.viewId, view] as const),
    );
    for (const [key, entry] of this.sessions) {
      if (entry.windowId !== windowId) continue;
      const view = attached.get(entry.identity.viewId);
      if (
        view &&
        view.viewEpoch === entry.identity.viewEpoch &&
        view.documentId === entry.identity.documentId
      ) {
        continue;
      }
      entry.session.dispose();
      this.sessions.delete(key);
      this.options.media?.detachView(windowId, entry.identity.viewId);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.sessions.values()) entry.session.dispose();
    this.sessions.clear();
    this.materialAuthoring.dispose();
    await this.options.media?.dispose();
    await this.options.generation?.dispose();
  }

  private async requireSession(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<DesktopCanvasSessionEntry> {
    this.requireActive();
    const grant = await this.options.shell.resolveCanvasViewGrant(windowId, identity);
    const key = sessionKey(identity);
    const existing = this.sessions.get(key);
    if (existing) return existing;
    const documentPath =
      identity.documentId === 'neko/boards/workspace.nkc'
        ? this.options.host.paths.join(grant.workspace.workspacePath, identity.documentId)
        : await resolveWorkspaceContentLocator(grant.workspace, {
            kind: 'workspace-file',
            path: identity.documentId,
          });
    const initialCanvas = await this.loadDocument(documentPath, grant.workspace.displayName);
    const requestSource = this.options.requestSource;
    const previewResource = this.options.previewResource;
    const resolveCut = this.options.resolveCut;
    const openInCut = this.options.openInCut;
    const requestProjectMediaLibraryCopy = this.options.requestProjectMediaLibraryCopy;
    const requestGlobalMediaLibraryCopy = this.options.requestGlobalMediaLibraryCopy;
    const generation = this.options.generation;
    const resolveGeneration = generation?.resolveResultActions;
    const regenerate = generation?.regenerateResult;
    const editAndGenerate = generation?.editAndGenerateResult;
    const previewEffect = previewResource
      ? async (requestIdentity: CanvasHostRuntimeIdentity, locator: ContentLocator) => {
          const absolutePath = await resolveWorkspaceContentLocator(grant.workspace, locator);
          await previewResource({
            identity: requestIdentity,
            locator,
            absolutePath,
          });
        }
      : undefined;
    const revealEffect = async (
      requestIdentity: CanvasHostRuntimeIdentity,
      locator: ContentLocator,
    ) => {
      const absolutePath = await resolveWorkspaceContentLocator(grant.workspace, locator);
      const revealPath = this.options.host.external?.revealPath;
      if (!revealPath) {
        throw new Error('Canvas reveal capability is unavailable.');
      }
      await revealPath(absolutePath);
    };
    const materialActionOwner = createCanvasMaterialActionOwner({
      ...(this.options.materialActionLabels ? { labels: this.options.materialActionLabels } : {}),
      ...(previewEffect
        ? {
            preview: ({ identity: requestIdentity, target }) =>
              previewEffect(requestIdentity, target.locator),
          }
        : {}),
      ...(this.options.host.external?.revealPath
        ? {
            reveal: ({ identity: requestIdentity, target }) =>
              revealEffect(requestIdentity, target.locator),
          }
        : {}),
      ...(resolveCut && openInCut
        ? {
            resolveCut: async ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) =>
              resolveCut({
                identity: requestIdentity,
                target,
                absolutePath: await resolveWorkspaceContentLocator(grant.workspace, target.locator),
              }),
            openInCut: async ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) =>
              openInCut({
                identity: requestIdentity,
                target,
                absolutePath: await resolveWorkspaceContentLocator(grant.workspace, target.locator),
              }),
          }
        : {}),
      ...(requestProjectMediaLibraryCopy || requestGlobalMediaLibraryCopy
        ? {
            resolveMediaLibraryCopy: async () => {
              const availability = await this.mediaLibraryCopy.resolveAvailability(grant.workspace);
              return {
                projectLinked:
                  requestProjectMediaLibraryCopy !== undefined && availability.projectLinked,
                global: requestGlobalMediaLibraryCopy !== undefined && availability.global,
              };
            },
          }
        : {}),
      ...(requestProjectMediaLibraryCopy
        ? {
            copyToProjectMediaLibrary: async ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) => {
              const selection = await requestProjectMediaLibraryCopy({
                identity: requestIdentity,
                workspace: grant.workspace,
                target,
                suggestedFileName: materialFileName(target.locator),
              });
              if (!selection) return;
              await requireMediaLibraryCopySuccess(
                this.mediaLibraryCopy.copy({
                  runtimeIdentity: requestIdentity,
                  workspace: grant.workspace,
                  request: {
                    kind: 'copy-to-project-media-library',
                    identity: materialIdentity(requestIdentity),
                    source: target.locator,
                    ...selection,
                  },
                }),
              );
            },
          }
        : {}),
      ...(requestGlobalMediaLibraryCopy
        ? {
            copyToGlobalMediaLibrary: async ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) => {
              const selection = await requestGlobalMediaLibraryCopy({
                identity: requestIdentity,
                workspace: grant.workspace,
                target,
                suggestedFileName: materialFileName(target.locator),
              });
              if (!selection) return;
              await requireMediaLibraryCopySuccess(
                this.mediaLibraryCopy.copy({
                  runtimeIdentity: requestIdentity,
                  workspace: grant.workspace,
                  request: {
                    kind: 'copy-to-global-media-library',
                    identity: materialIdentity(requestIdentity),
                    source: target.locator,
                    ...selection,
                  },
                }),
              );
            },
          }
        : {}),
      ...(resolveGeneration
        ? {
            resolveGeneration: ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) =>
              resolveGeneration({
                identity: requestIdentity,
                workspace: grant.workspace,
                target,
              }),
          }
        : {}),
      ...(regenerate
        ? {
            regenerate: ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) =>
              regenerate({
                identity: requestIdentity,
                workspace: grant.workspace,
                target,
              }),
          }
        : {}),
      ...(editAndGenerate
        ? {
            editAndGenerate: ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) =>
              editAndGenerate({
                identity: requestIdentity,
                workspace: grant.workspace,
                target,
              }),
          }
        : {}),
    });
    const requestGenerationDraft = generation?.requestDraft;
    const session = new CanvasHostRuntimeSession({
      identity,
      initialCanvas,
      effects: {
        resolveMaterialActions: ({ identity: requestIdentity, targets }) =>
          materialActionOwner.resolve({
            identity: requestIdentity,
            targets,
          }),
        saveDocument: async ({ canvas }) => {
          await this.saveDocument(documentPath, canvas);
        },
        authorMaterial: async ({ canvas, identity: requestIdentity, request }) =>
          this.materialAuthoring.author({
            canvas,
            identity: requestIdentity,
            workspace: grant.workspace,
            request,
          }),
        requestSource: requestSource
          ? async ({ identity: requestIdentity, sourceKind, sourceMode }) => {
              const selection = await requestSource({
                identity: requestIdentity,
                sourceKind,
                sourceMode,
                workspace: grant.workspace,
              });
              if (!selection) return undefined;
              if (selection.kind === 'workspace-reference') {
                return createWorkspaceReferenceRequest({
                  identity: requestIdentity,
                  locator: selection.locator,
                  title: selection.title,
                  mediaKind: sourceKindToMediaKind(sourceKind),
                });
              }
              const sourceToken = this.materialAuthoring.registerExternalSource(
                grant.workspace,
                selection.source,
              );
              return createExternalImportRequest({
                identity: requestIdentity,
                sourceToken,
                sourceName: selection.source.sourceName,
                mediaKind: sourceKindToMediaKind(sourceKind),
              });
            }
          : undefined,
        requestGenerationDraft: requestGenerationDraft
          ? async ({ identity: requestIdentity, mediaKind, position, inputNodeIds }) =>
              requestGenerationDraft({
                identity: requestIdentity,
                workspace: grant.workspace,
                mediaKind,
                ...(position ? { position } : {}),
                inputNodeIds,
              })
          : undefined,
        previewResource: previewEffect
          ? ({ identity: requestIdentity, locator }) => previewEffect(requestIdentity, locator)
          : undefined,
        revealResource: ({ identity: requestIdentity, locator }) =>
          revealEffect(requestIdentity, locator),
        executeMaterialAction: async ({
          canvas,
          identity: requestIdentity,
          descriptor,
          action,
          targets,
        }) => {
          const result = await materialActionOwner.execute({
            identity: requestIdentity,
            descriptor,
            action,
            targets,
          });
          if (!result.generationProjection) return {};
          const projectionIdentity = {
            projectId: requestIdentity.projectId,
            canvasId: requestIdentity.documentId,
            canvasSessionId: requestIdentity.sessionId,
          };
          return {
            canvas: projectGenerationSnapshotToCanvas({
              identity: projectionIdentity,
              expectedIdentity: projectionIdentity,
              canvas,
              snapshot: result.generationProjection,
            }),
          };
        },
      },
    });
    const entry: DesktopCanvasSessionEntry = {
      windowId,
      identity: { ...identity },
      documentPath,
      workspace: grant.workspace,
      session,
    };
    this.sessions.set(key, entry);
    return entry;
  }

  private async loadDocument(documentPath: string, workspaceName: string): Promise<CanvasData> {
    try {
      const stat = await this.options.host.files.stat(documentPath);
      if (stat.type !== 'file') {
        throw new Error('Canvas document is not a file.');
      }
    } catch (error: unknown) {
      if (isFileNotFound(error)) {
        return {
          version: CANVAS_VERSION,
          name: `${workspaceName} Canvas`,
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          nodes: [],
          connections: [],
        };
      }
      throw error;
    }
    const loaded = loadNkc(await this.options.host.files.readText(documentPath));
    if (!loaded.validation.valid) {
      throw new Error('Canvas document is invalid.');
    }
    return loaded.data;
  }

  private async saveDocument(documentPath: string, canvas: CanvasData): Promise<void> {
    const directory = this.options.host.paths.dirname(documentPath);
    await this.options.host.files.createDirectory(directory);
    const temporaryPath = `${documentPath}.${randomUUID()}.tmp`;
    try {
      await this.options.host.files.writeText(temporaryPath, saveNkc(canvas));
      await this.options.host.files.rename(temporaryPath, documentPath);
    } catch (error: unknown) {
      await this.options.host.files
        .delete(temporaryPath, { idempotent: true })
        .catch(() => undefined);
      throw error;
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Canvas runtime is disposed.');
  }
}

function createWorkspaceReferenceRequest(input: {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly locator: CanvasReferencedContentLocator;
  readonly title: string;
  readonly mediaKind: CanvasMaterialMediaKind;
}): CanvasMaterialAuthoringRequest {
  return {
    kind: 'direct-reference',
    identity: {
      projectId: input.identity.projectId,
      canvasId: input.identity.documentId,
      canvasSessionId: input.identity.sessionId,
    },
    locator: input.locator,
    title: input.title,
    mediaKind: input.mediaKind,
  };
}

function createExternalImportRequest(input: {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly sourceToken: string;
  readonly sourceName: string;
  readonly mediaKind: CanvasMaterialMediaKind;
}): CanvasMaterialAuthoringRequest {
  return {
    kind: 'external-import',
    identity: {
      projectId: input.identity.projectId,
      canvasId: input.identity.documentId,
      canvasSessionId: input.identity.sessionId,
    },
    sourceToken: input.sourceToken,
    sourceName: input.sourceName,
    mediaKind: input.mediaKind,
    conflictPolicy: 'rename',
  };
}

function sourceKindToMediaKind(
  sourceKind: 'image' | 'video' | 'audio' | 'model' | 'document' | 'canvas',
): CanvasMaterialMediaKind {
  return sourceKind === 'canvas' ? 'other' : sourceKind;
}

function materialIdentity(identity: CanvasHostRuntimeIdentity) {
  return {
    projectId: identity.projectId,
    canvasId: identity.documentId,
    canvasSessionId: identity.sessionId,
  };
}

function materialFileName(locator: ContentLocator): string {
  switch (locator.kind) {
    case 'workspace-file':
    case 'generated-output':
      return portableBaseName(locator.path);
    case 'document-entry':
      return portableBaseName(locator.entryPath);
    case 'package-resource':
      return portableBaseName(locator.resourcePath);
  }
}

function portableBaseName(value: string): string {
  const fileName = value.split('/').at(-1);
  if (!fileName) throw new Error('Canvas material ContentLocator has no file name.');
  return fileName;
}

async function requireMediaLibraryCopySuccess(
  operation: ReturnType<CanvasMediaLibraryCopyService['copy']>,
): Promise<void> {
  const result = await operation;
  if (result.status === 'unavailable') {
    throw new Error(`Canvas Media Library copy failed: ${result.diagnostic.code}.`);
  }
}

function sessionKey(identity: CanvasHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
  ].join(':');
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
