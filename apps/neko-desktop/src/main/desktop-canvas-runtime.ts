import { randomUUID } from 'node:crypto';
import {
  CANVAS_WORKSPACE_BOARD_PATH,
  CanvasHostVisibleEffectError,
  CanvasHostRuntimeSession,
  createCanvasHostPresentationSnapshotStore,
  parseCanvasMaterialActionResolutionRequest,
  parseCanvasHostIntentRequest,
  parseCanvasTextFilePreviewRequest,
  type CanvasHostIntentRequest,
  type CanvasHostIntentResult,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
  type CanvasMaterialActionResolution,
  type CanvasMaterialActionTarget,
  type CanvasTextFilePreviewResult,
  type CanvasGenerationApplicationPort,
  type CanvasGenerationModelOption,
  createCanvasMaterialActionOwner,
} from '@neko/canvas-domain';
import type { NekoHostPorts } from '@neko/host/ports';
import { contentLocatorKey, type ContentLocator } from '@neko/content-domain';
import { createNodeHostContentReadService } from '@neko/content-domain/node';
import {
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
  CanvasTextFilePreviewService,
  type CanvasExternalSource,
} from '@neko/canvas-node';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import {
  parseDesktopCanvasPreviewResourceReleaseRequest,
  parseDesktopCanvasPreviewResourceRequest,
  type DesktopCanvasPreviewResourceRequest,
  type DesktopCanvasPreviewResourceResult,
  type DesktopCanvasPreviewResourceReleaseRequest,
} from '../shared/canvas-bridge-contract';
import type {
  PreviewResourceLease,
  PreviewResourceProjection,
} from '@neko/preview-domain/resource-projection';

export interface DesktopCanvasShellPort {
  resolveCanvasViewGrant(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<DesktopCanvasViewGrant>;
  closeCanvasView?(identity: CanvasHostRuntimeIdentity): Promise<void>;
}

export interface DesktopCanvasFileWatcher {
  close(): void;
}

export type DesktopCanvasWatchFile = (
  directory: string,
  fileName: string,
  onChange: () => Promise<void>,
) => DesktopCanvasFileWatcher;

interface DesktopCanvasSessionEntry {
  readonly windowId: string;
  readonly identity: CanvasHostRuntimeIdentity;
  readonly documentPath: string;
  readonly workspace: DesktopCanvasViewGrant['workspace'];
  readonly session: CanvasHostRuntimeSession;
  watcher?: DesktopCanvasFileWatcher;
  externalChangeQueue: Promise<void>;
  generationReattachmentScheduled: boolean;
}

interface DesktopCanvasPreviewLeaseEntry {
  readonly windowId: string;
  readonly viewId: string;
  readonly sessionKey: string;
  readonly locatorKey: string;
  readonly mediaType?: string;
  readonly lease: PreviewResourceLease;
  readonly descriptor: DesktopCanvasPreviewResourceResult['descriptor'];
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
  private readonly workspaceBoardOperationTails = new Map<string, Promise<void>>();
  private readonly previewLeases = new Map<string, DesktopCanvasPreviewLeaseEntry>();
  private readonly presentationSnapshots = createCanvasHostPresentationSnapshotStore();
  private readonly materialAuthoring: CanvasMaterialAuthoringService;
  private readonly mediaLibraryCopy: CanvasMediaLibraryCopyService;
  private disposed = false;

  constructor(
    private readonly options: {
      readonly shell: DesktopCanvasShellPort;
      readonly host: NekoHostPorts;
      readonly globalMediaLibraryRoot: string;
      readonly watchFile?: DesktopCanvasWatchFile;
      readonly requestSource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly sourceKind: 'image' | 'video' | 'audio' | 'model' | 'document' | 'canvas';
        readonly sourceMode: 'import' | 'reference';
        readonly workspace: DesktopCanvasViewGrant['workspace'];
      }) => Promise<DesktopCanvasSourceSelection | undefined>;
      readonly previewResource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly workspace: DesktopCanvasViewGrant['workspace'];
        readonly locator: ContentLocator;
        readonly absolutePath?: string;
      }) => Promise<void>;
      readonly resolveEditText?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly target: CanvasMaterialActionTarget;
      }) => Promise<boolean>;
      readonly editText?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly target: CanvasMaterialActionTarget;
      }) => Promise<void>;
      readonly projectPreviewResource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly workspace: DesktopCanvasViewGrant['workspace'];
        readonly locator: ContentLocator;
        readonly purpose: 'viewer-source';
        readonly descriptorId: string;
        readonly displayName: string;
        readonly mediaType?: string;
      }) => Promise<PreviewResourceProjection>;
      readonly releasePreviewResourceProjection?: (descriptorId: string) => void;
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
      readonly resolveAddToCut?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly target: CanvasMaterialActionTarget;
      }) => Promise<Readonly<Record<string, unknown>> | undefined>;
      readonly addToCut?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly target: CanvasMaterialActionTarget;
        readonly executionPayload: Readonly<Record<string, unknown>>;
      }) => Promise<void>;
      readonly separateAudioInCut?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly target: CanvasMaterialActionTarget;
        readonly executionPayload: Readonly<Record<string, unknown>>;
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
        readonly editText?: string;
        readonly addToCut?: string;
        readonly separateAudio?: string;
        readonly copyToProjectMediaLibrary?: string;
        readonly copyToGlobalMediaLibrary?: string;
        readonly regenerate?: string;
        readonly editAndGenerate?: string;
      };
      readonly generation?: CanvasGenerationApplicationPort;
      readonly resolveGenerationModels?: (input: {
        readonly workspace: DesktopCanvasViewGrant['workspace'];
      }) => readonly CanvasGenerationModelOption[];
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
    const entry = await this.requireSession(windowId, identity);
    const snapshot = await entry.session.getSnapshot();
    this.scheduleGenerationReattachment(entry);
    return snapshot;
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

  async readTextFilePreview(
    windowId: string,
    payload: unknown,
  ): Promise<CanvasTextFilePreviewResult> {
    const request = parseCanvasTextFilePreviewRequest(payload);
    return (await this.requireSession(windowId, request.identity)).session.readTextFilePreview(
      request,
    );
  }

  async resolvePreviewResource(
    windowId: string,
    value: DesktopCanvasPreviewResourceRequest | unknown,
  ): Promise<DesktopCanvasPreviewResourceResult> {
    const request = parseDesktopCanvasPreviewResourceRequest(value);
    const entry = await this.requireSession(windowId, request.identity);
    entry.session.authorizePreviewSource(request);
    const projectPreviewResource = this.options.projectPreviewResource;
    if (!projectPreviewResource)
      throw new Error('Canvas preview resource capability is unavailable.');
    const leaseId = randomUUID();
    const descriptorId = [
      'canvas-preview',
      request.identity.sessionId,
      request.nodeId,
      request.outputId,
      leaseId,
    ].join(':');
    const key = `preview:${sessionKey(request.identity)}:${leaseId}`;
    const locatorKey = contentLocatorKey(request.locator);
    const projection = await projectPreviewResource({
      identity: request.identity,
      workspace: entry.workspace,
      locator: request.locator,
      purpose: 'viewer-source',
      descriptorId,
      displayName: request.displayName,
      mediaType: request.mediaType,
    });
    if (projection.status === 'unavailable') throw new Error(projection.diagnostic.message);
    if (projection.descriptor.contentKind !== request.contentKind) {
      this.releasePreviewProjection(projection.descriptor.descriptorId);
      throw new Error(
        'Canvas preview descriptor content kind does not match the authorized output.',
      );
    }
    const { descriptor, lease } = projection;
    this.previewLeases.set(key, {
      windowId,
      viewId: request.identity.viewId,
      sessionKey: sessionKey(request.identity),
      locatorKey,
      mediaType: request.mediaType,
      lease,
      descriptor,
    });
    return { requestId: request.requestId, descriptor };
  }

  async releasePreviewResource(
    windowId: string,
    value: DesktopCanvasPreviewResourceReleaseRequest | unknown,
  ): Promise<void> {
    this.requireActive();
    const request = parseDesktopCanvasPreviewResourceReleaseRequest(value);
    if (request.identity.windowId !== windowId) {
      throw new Error('Canvas preview resource release Window identity does not match the sender.');
    }
    const ownerSessionKey = sessionKey(request.identity);
    this.releasePreviewLeases(
      (entry) =>
        entry.windowId === windowId &&
        entry.sessionKey === ownerSessionKey &&
        entry.descriptor.descriptorId === request.descriptorId,
    );
  }

  async subscribe(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
    listener: (event: CanvasHostProjectionEvent) => void,
  ): Promise<() => void> {
    return (await this.requireSession(windowId, identity)).session.subscribe(listener);
  }

  async coordinateWorkspaceBoardMutation<TResult>(
    workspaceId: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    return this.enqueueWorkspaceBoardOperation(workspaceId, async () => {
      this.requireActive();
      const entries = [...this.sessions.values()]
        .filter(
          (entry) =>
            entry.workspace.workspaceId === workspaceId &&
            entry.identity.documentId === CANVAS_WORKSPACE_BOARD_PATH,
        )
        .sort((left, right) => sessionKey(left.identity).localeCompare(sessionKey(right.identity)));
      if (entries.length === 0) return operation();
      const snapshots = await Promise.all(entries.map((entry) => entry.session.getSnapshot()));
      const dirtyDocuments = snapshots
        .filter((snapshot) => snapshot.dirty)
        .map((snapshot) => JSON.stringify(snapshot.canvas));
      if (new Set(dirtyDocuments).size > 1) {
        throw new CanvasHostVisibleEffectError(
          'workspace-board-open-session-conflict: Open Workspace Board views contain divergent unsaved changes.',
        );
      }

      const coordinate = async (
        index: number,
      ): Promise<{ readonly value: TResult; readonly canvas: CanvasData }> => {
        const entry = entries[index];
        if (!entry) {
          const value = await operation();
          const first = entries[0];
          if (!first) throw new Error('Workspace Board session coordination lost its target.');
          return {
            value,
            canvas: await this.loadDocument(first.documentPath, first.workspace.displayName),
          };
        }
        return entry.session.coordinateAuthoritativeDocumentChange(() => coordinate(index + 1));
      };

      const result = await coordinate(0);
      await Promise.all(entries.map((entry) => entry.session.reattachGenerationNodes()));
      return result.value;
    });
  }

  detachWindow(windowId: string): void {
    for (const [key, entry] of this.sessions) {
      if (entry.windowId !== windowId) continue;
      this.releaseSession(key, entry);
    }
    this.releasePreviewLeases((entry) => entry.windowId === windowId);
    this.presentationSnapshots.deleteWindow(windowId);
    this.options.generation?.detachWindow(windowId);
  }

  reconcileWindow(
    windowId: string,
    workbenches: readonly DesktopWorkbenchLayoutProjection[],
  ): void {
    const attached = new Map(
      workbenches
        .flatMap((workbench) => workbench.main.views)
        .filter((view) => view.kind === 'canvas')
        .map((view) => [view.viewId, view] as const),
    );
    for (const [key, entry] of this.sessions) {
      if (entry.windowId !== windowId) continue;
      const view = attached.get(entry.identity.viewId);
      if (
        view &&
        view.viewInstanceId === entry.identity.viewInstanceId &&
        view.documentId === entry.identity.documentId
      ) {
        continue;
      }
      this.releaseSession(key, entry);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const [key, entry] of this.sessions) this.releaseSession(key, entry);
    this.sessions.clear();
    this.releasePreviewLeases(() => true);
    this.presentationSnapshots.clear();
    this.materialAuthoring.dispose();
    await this.options.generation?.dispose();
  }

  private releasePreviewLeases(
    predicate: (entry: DesktopCanvasPreviewLeaseEntry) => boolean,
  ): void {
    for (const [key, entry] of this.previewLeases) {
      if (!predicate(entry)) continue;
      this.releasePreviewProjection(entry.descriptor.descriptorId);
      this.previewLeases.delete(key);
    }
  }

  private releasePreviewProjection(descriptorId: string): void {
    const release = this.options.releasePreviewResourceProjection;
    if (!release) throw new Error('Canvas preview resource release capability is unavailable.');
    release(descriptorId);
  }

  private async requireSession(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
  ): Promise<DesktopCanvasSessionEntry> {
    this.requireActive();
    // Grant resolution may flush pending Agent deliveries through the Workspace Board
    // coordinator. Resolve it before entering the Board queue so that opening the
    // Canvas never waits on a nested mutation scheduled behind itself.
    const grant = await this.options.shell.resolveCanvasViewGrant(windowId, identity);
    if (identity.documentId === CANVAS_WORKSPACE_BOARD_PATH) {
      return this.enqueueWorkspaceBoardOperation(identity.workspaceId, () =>
        this.requireSessionSerial(windowId, identity, grant),
      );
    }
    return this.requireSessionSerial(windowId, identity, grant);
  }

  private async requireSessionSerial(
    windowId: string,
    identity: CanvasHostRuntimeIdentity,
    grant: DesktopCanvasViewGrant,
  ): Promise<DesktopCanvasSessionEntry> {
    const key = sessionKey(identity);
    const existing = this.sessions.get(key);
    if (existing) return existing;
    const documentPath =
      identity.documentId === CANVAS_WORKSPACE_BOARD_PATH
        ? this.options.host.paths.join(grant.workspace.workspacePath, identity.documentId)
        : await resolveWorkspaceContentLocator(grant.workspace, {
            file: { authority: 'workspace', path: identity.documentId },
          });
    const initialCanvas = await this.loadDocument(documentPath, grant.workspace.displayName);
    const textFilePreview = new CanvasTextFilePreviewService(
      createNodeHostContentReadService({ workspaceRoot: grant.workspace.workspacePath }),
    );
    const requestSource = this.options.requestSource;
    const previewResource = this.options.previewResource;
    const resolveEditText = this.options.resolveEditText;
    const editText = this.options.editText;
    const resolveCut = this.options.resolveCut;
    const openInCut = this.options.openInCut;
    const resolveAddToCut = this.options.resolveAddToCut;
    const addToCut = this.options.addToCut;
    const separateAudioInCut = this.options.separateAudioInCut;
    const requestProjectMediaLibraryCopy = this.options.requestProjectMediaLibraryCopy;
    const requestGlobalMediaLibraryCopy = this.options.requestGlobalMediaLibraryCopy;
    const generation = this.options.generation;
    const previewEffect = previewResource
      ? async (requestIdentity: CanvasHostRuntimeIdentity, locator: ContentLocator) => {
          await previewResource({
            identity: requestIdentity,
            workspace: grant.workspace,
            locator,
            ...(locator.file.authority === 'workspace' && locator.selector === undefined
              ? {
                  absolutePath: await this.resolveContentPath(
                    requestIdentity.projectId,
                    grant.workspace,
                    locator,
                  ),
                }
              : {}),
          });
        }
      : undefined;
    const revealEffect = async (
      requestIdentity: CanvasHostRuntimeIdentity,
      locator: ContentLocator,
    ) => {
      const absolutePath = await this.resolveContentPath(
        requestIdentity.projectId,
        grant.workspace,
        locator,
      );
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
            resolveReveal: async ({ target }: { readonly target: CanvasMaterialActionTarget }) =>
              target.locator.file.authority === 'workspace' &&
              target.locator.selector === undefined,
            reveal: ({ identity: requestIdentity, target }) =>
              revealEffect(requestIdentity, target.locator),
          }
        : {}),
      ...(resolveEditText && editText
        ? {
            resolveEditText: ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) => resolveEditText({ identity: requestIdentity, target }),
            editText: ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) => editText({ identity: requestIdentity, target }),
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
                absolutePath: await this.resolveContentPath(
                  requestIdentity.projectId,
                  grant.workspace,
                  target.locator,
                ),
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
                absolutePath: await this.resolveContentPath(
                  requestIdentity.projectId,
                  grant.workspace,
                  target.locator,
                ),
              }),
          }
        : {}),
      ...(resolveAddToCut && addToCut
        ? {
            resolveAddToCut: ({
              identity: requestIdentity,
              target,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
            }) => resolveAddToCut({ identity: requestIdentity, target }),
            addToCut: ({
              identity: requestIdentity,
              target,
              executionPayload,
            }: {
              readonly identity: CanvasHostRuntimeIdentity;
              readonly target: CanvasMaterialActionTarget;
              readonly executionPayload: Readonly<Record<string, unknown>>;
            }) => addToCut({ identity: requestIdentity, target, executionPayload }),
            ...(separateAudioInCut
              ? {
                  separateAudioInCut: ({
                    identity: requestIdentity,
                    target,
                    executionPayload,
                  }: {
                    readonly identity: CanvasHostRuntimeIdentity;
                    readonly target: CanvasMaterialActionTarget;
                    readonly executionPayload: Readonly<Record<string, unknown>>;
                  }) =>
                    separateAudioInCut({
                      identity: requestIdentity,
                      target,
                      executionPayload,
                    }),
                }
              : {}),
          }
        : {}),
      ...(requestProjectMediaLibraryCopy || requestGlobalMediaLibraryCopy
        ? {
            resolveMediaLibraryCopy: async () => {
              const availability = await this.mediaLibraryCopy.resolveAvailability(
                identity.projectId,
                grant.workspace,
              );
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
    });
    const session = new CanvasHostRuntimeSession({
      identity,
      initialCanvas,
      presentationSnapshots: this.presentationSnapshots,
      resolveGenerationModels: () =>
        this.options.resolveGenerationModels?.({ workspace: grant.workspace }) ?? [],
      effects: {
        readTextFilePreview: (input) => textFilePreview.read(input),
        resolveMaterialActions: ({ identity: requestIdentity, targets }) =>
          materialActionOwner.resolve({
            identity: requestIdentity,
            targets,
          }),
        saveDocument: async ({ canvas, removedNodeIds }) => {
          const authoritative = await this.loadDocument(documentPath, grant.workspace.displayName);
          const candidateNodeIds = new Set(canvas.nodes.map((node) => node.id));
          const removedNodeIdSet = new Set(removedNodeIds);
          const unprovenMissingNodeIds = authoritative.nodes
            .filter((node) => !candidateNodeIds.has(node.id) && !removedNodeIdSet.has(node.id))
            .map((node) => node.id);
          if (unprovenMissingNodeIds.length > 0) {
            throw new CanvasHostVisibleEffectError(
              `canvas-authoritative-save-conflict: The Canvas changed outside this View; reload before saving (${unprovenMissingNodeIds.length} protected node(s)).`,
            );
          }
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
        generation: generation
          ? {
              startNode: ({ canvas, identity: requestIdentity, nodeId, persistCanvas }) =>
                generation.startNode({
                  canvas,
                  identity: requestIdentity,
                  workspace: grant.workspace,
                  nodeId,
                  persistCanvas,
                }),
              resumeNode: ({ canvas, identity: requestIdentity, nodeId, run, persistCanvas }) =>
                generation.resumeNode({
                  canvas,
                  identity: requestIdentity,
                  workspace: grant.workspace,
                  nodeId,
                  run,
                  persistCanvas,
                }),
              observeNode: ({ identity: requestIdentity, nodeId, run }) =>
                generation.observeNode({
                  identity: requestIdentity,
                  workspace: grant.workspace,
                  nodeId,
                  run,
                }),
              cancelNode: ({ identity: requestIdentity, nodeId, run }) =>
                generation.cancelNode({
                  identity: requestIdentity,
                  workspace: grant.workspace,
                  nodeId,
                  run,
                }),
            }
          : undefined,
        previewResource: previewEffect
          ? ({ identity: requestIdentity, locator }) => previewEffect(requestIdentity, locator)
          : undefined,
        revealResource: ({ identity: requestIdentity, locator }) =>
          revealEffect(requestIdentity, locator),
        executeMaterialAction: async ({
          canvas: _canvas,
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
          if (result.generationProjection) {
            throw new Error('Historical Canvas material regeneration is no longer supported.');
          }
          return {};
        },
      },
    });
    const entry: DesktopCanvasSessionEntry = {
      windowId,
      identity: { ...identity },
      documentPath,
      workspace: grant.workspace,
      session,
      externalChangeQueue: Promise.resolve(),
      generationReattachmentScheduled: false,
    };
    if (identity.documentId !== CANVAS_WORKSPACE_BOARD_PATH) {
      const watchFile = this.options.watchFile;
      if (watchFile) {
        entry.watcher = watchFile(
          this.options.host.paths.dirname(documentPath),
          documentPath.split(/[\\/]/u).at(-1) ?? identity.documentId,
          () => this.queueExternalChange(entry),
        );
      }
    }
    this.sessions.set(key, entry);
    return entry;
  }

  private queueExternalChange(entry: DesktopCanvasSessionEntry): Promise<void> {
    entry.externalChangeQueue = entry.externalChangeQueue.then(async () => {
      const key = sessionKey(entry.identity);
      if (this.disposed || this.sessions.get(key) !== entry) return;
      try {
        const stat = await this.options.host.files.stat(entry.documentPath);
        if (stat.type === 'file') return;
      } catch (error: unknown) {
        if (!isFileNotFound(error)) throw error;
      }
      const snapshot = await entry.session.getSnapshot();
      if (snapshot.dirty) return;
      const closeCanvasView = this.options.shell.closeCanvasView;
      if (!closeCanvasView) {
        throw new Error('Desktop Canvas clean deletion requires a View close capability.');
      }
      await closeCanvasView(entry.identity);
      this.releaseSession(key, entry);
    });
    return entry.externalChangeQueue;
  }

  private releaseSession(key: string, entry: DesktopCanvasSessionEntry): void {
    entry.watcher?.close();
    entry.session.dispose();
    this.sessions.delete(key);
    this.releasePreviewLeases((lease) => lease.sessionKey === key);
  }

  private scheduleGenerationReattachment(entry: DesktopCanvasSessionEntry): void {
    if (entry.generationReattachmentScheduled) return;
    entry.generationReattachmentScheduled = true;
    const key = sessionKey(entry.identity);
    setImmediate(() => {
      if (this.disposed || this.sessions.get(key) !== entry) return;
      void entry.session.reattachGenerationNodes();
    });
  }

  private async resolveContentPath(
    projectId: string,
    workspace: DesktopCanvasViewGrant['workspace'],
    locator: ContentLocator,
  ): Promise<string> {
    if (locator.file.authority === 'workspace' && locator.selector === undefined) {
      return resolveWorkspaceContentLocator(workspace, { file: locator.file });
    }
    throw new Error('Canvas material has no directly resolvable Host file path.');
  }

  private enqueueWorkspaceBoardOperation<TResult>(
    workspaceId: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    const previous = this.workspaceBoardOperationTails.get(workspaceId) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.workspaceBoardOperationTails.set(workspaceId, tail);
    void tail.then(() => {
      if (this.workspaceBoardOperationTails.get(workspaceId) === tail) {
        this.workspaceBoardOperationTails.delete(workspaceId);
      }
    });
    return result;
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
      const diagnostics = loaded.validation.errors
        .slice(0, 3)
        .map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`)
        .join('; ');
      const remaining = Math.max(0, loaded.validation.errors.length - 3);
      throw new Error(
        `Canvas document is invalid: ${diagnostics}${remaining > 0 ? `; ${remaining} more issue(s)` : ''}.`,
      );
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
  return portableBaseName(
    locator.selector?.kind === 'entry' ? locator.selector.path : locator.file.path,
  );
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
    String(identity.viewInstanceId),
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
  ].join(':');
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
