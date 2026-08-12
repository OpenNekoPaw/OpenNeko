import { randomUUID } from 'node:crypto';
import {
  CANVAS_WORKSPACE_BOARD_PATH,
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
import { contentLocatorKey, type ContentLocator } from '@neko/content';
import { createNodeHostContentReadService } from '@neko/content/node';
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
  parseDesktopCanvasMediaRequest,
  parseDesktopCanvasEmbeddedPreviewReleaseRequest,
  parseDesktopCanvasEmbeddedPreviewRequest,
  parseDesktopCanvasPreviewVariantRequest,
  type DesktopCanvasMediaRequest,
  type DesktopCanvasMediaResponse,
  type DesktopCanvasEmbeddedPreviewRequest,
  type DesktopCanvasEmbeddedPreviewResult,
  type DesktopCanvasEmbeddedPreviewReleaseRequest,
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

export interface DesktopCanvasPreviewResourceLease {
  readonly url: string;
  readonly sourceFingerprint: string;
  readonly byteLength: number;
  readonly mediaType: string;
  release(): void;
}

interface DesktopCanvasPreviewLeaseEntry {
  readonly windowId: string;
  readonly viewId: string;
  readonly sessionKey: string;
  readonly locatorKey: string;
  readonly mediaType?: string;
  readonly lease: DesktopCanvasPreviewResourceLease;
  readonly descriptor?: DesktopCanvasEmbeddedPreviewResult['descriptor'];
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
      readonly registerPreviewResource?: (input: {
        readonly identity: CanvasHostRuntimeIdentity;
        readonly workspace: DesktopCanvasViewGrant['workspace'];
        readonly locator: ContentLocator;
        readonly purpose: 'inline-variant' | 'embedded-source';
        readonly mediaType?: string;
      }) => Promise<DesktopCanvasPreviewResourceLease>;
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
      readonly media?: DesktopCanvasMediaPort;
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

  async readTextFilePreview(
    windowId: string,
    payload: unknown,
  ): Promise<CanvasTextFilePreviewResult> {
    const request = parseCanvasTextFilePreviewRequest(payload);
    return (await this.requireSession(windowId, request.identity)).session.readTextFilePreview(
      request,
    );
  }

  async resolvePreviewVariant(
    windowId: string,
    value: DesktopCanvasPreviewVariantRequest | unknown,
  ): Promise<DesktopCanvasPreviewVariantResult> {
    const request = parseDesktopCanvasPreviewVariantRequest(value);
    const entry = await this.requireSession(windowId, request.identity);
    const registerPreviewResource = this.options.registerPreviewResource;
    if (!registerPreviewResource) {
      throw new Error('Canvas preview variant capability is unavailable.');
    }
    const key = previewLeaseKey(request);
    const locatorKey = contentLocatorKey(request.locator);
    const current = this.previewLeases.get(key);
    if (current?.locatorKey === locatorKey && current.mediaType === request.mediaType) {
      return { requestId: request.requestId, url: current.lease.url };
    }
    current?.lease.release();
    this.previewLeases.delete(key);
    const lease = await registerPreviewResource({
      identity: request.identity,
      workspace: entry.workspace,
      locator: request.locator,
      purpose: 'inline-variant',
      ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
    });
    this.previewLeases.set(key, {
      windowId,
      viewId: request.identity.viewId,
      sessionKey: sessionKey(request.identity),
      locatorKey,
      ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
      lease,
    });
    return {
      requestId: request.requestId,
      url: lease.url,
    };
  }

  async resolveEmbeddedPreview(
    windowId: string,
    value: DesktopCanvasEmbeddedPreviewRequest | unknown,
  ): Promise<DesktopCanvasEmbeddedPreviewResult> {
    const request = parseDesktopCanvasEmbeddedPreviewRequest(value);
    const entry = await this.requireSession(windowId, request.identity);
    entry.session.authorizeEmbeddedPreviewSource(request);
    const registerPreviewResource = this.options.registerPreviewResource;
    if (!registerPreviewResource)
      throw new Error('Canvas embedded preview capability is unavailable.');
    const leaseId = randomUUID();
    const descriptorId = [
      'canvas-embedded',
      request.identity.sessionId,
      request.nodeId,
      request.outputId,
      leaseId,
    ].join(':');
    const key = `embedded:${sessionKey(request.identity)}:${leaseId}`;
    const locatorKey = contentLocatorKey(request.locator);
    const lease = await registerPreviewResource({
      identity: request.identity,
      workspace: entry.workspace,
      locator: request.locator,
      purpose: 'embedded-source',
      mediaType: request.mediaType,
    });
    const descriptor = {
      descriptorId,
      sourceFingerprint: lease.sourceFingerprint,
      contentLocator: request.locator,
      url: lease.url,
      contentKind: request.contentKind,
      mediaType: lease.mediaType,
      displayName: request.displayName,
      byteLength: lease.byteLength,
    } as const;
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

  async releaseEmbeddedPreview(
    windowId: string,
    value: DesktopCanvasEmbeddedPreviewReleaseRequest | unknown,
  ): Promise<void> {
    const request = parseDesktopCanvasEmbeddedPreviewReleaseRequest(value);
    await this.requireSession(windowId, request.identity);
    const ownerSessionKey = sessionKey(request.identity);
    this.releasePreviewLeases(
      (entry) =>
        entry.sessionKey === ownerSessionKey &&
        entry.descriptor?.descriptorId === request.descriptorId,
    );
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

      return (await coordinate(0)).value;
    });
  }

  detachWindow(windowId: string): void {
    for (const [key, entry] of this.sessions) {
      if (entry.windowId !== windowId) continue;
      entry.session.dispose();
      this.sessions.delete(key);
    }
    this.releasePreviewLeases((entry) => entry.windowId === windowId);
    this.presentationSnapshots.deleteWindow(windowId);
    this.options.media?.detachWindow(windowId);
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
      entry.session.dispose();
      this.sessions.delete(key);
      this.releasePreviewLeases((lease) => lease.sessionKey === key);
      this.options.media?.detachView(windowId, entry.identity.viewId);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.sessions.values()) entry.session.dispose();
    this.sessions.clear();
    this.releasePreviewLeases(() => true);
    this.presentationSnapshots.clear();
    this.materialAuthoring.dispose();
    await this.options.media?.dispose();
    await this.options.generation?.dispose();
  }

  private releasePreviewLeases(
    predicate: (entry: DesktopCanvasPreviewLeaseEntry) => boolean,
  ): void {
    for (const [key, entry] of this.previewLeases) {
      if (!predicate(entry)) continue;
      entry.lease.release();
      this.previewLeases.delete(key);
    }
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
            kind: 'workspace-file',
            path: identity.documentId,
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
            ...(locator.kind === 'workspace-file' || locator.kind === 'generated-output'
              ? { absolutePath: await resolveWorkspaceContentLocator(grant.workspace, locator) }
              : {}),
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
            resolveReveal: async ({ target }: { readonly target: CanvasMaterialActionTarget }) =>
              target.locator.kind === 'workspace-file' ||
              target.locator.kind === 'generated-output',
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
    };
    this.sessions.set(key, entry);
    await session.reattachGenerationNodes();
    return entry;
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
    String(identity.viewInstanceId),
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
  ].join(':');
}

function previewLeaseKey(request: DesktopCanvasPreviewVariantRequest): string {
  return [sessionKey(request.identity), request.sourceId, request.role].join(':');
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
