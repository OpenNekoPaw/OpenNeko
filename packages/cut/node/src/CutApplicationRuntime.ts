import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CUT_HOST_RUNTIME_ROUTES,
  CutDocumentSession,
  createOtioTimeline,
  isCutDraftDocumentId,
  DEFAULT_CUT_HOST_PRESENTATION,
  assertCutHostRuntimeIdentity,
  parseCutHostPresentationState,
  parseCutHostRuntimeRequest,
  type CutCommand,
  type CutProjectProfile,
  type CutRouteAppendItem,
  type CutDocumentStorage,
  type CutHostRuntimeIdentity,
  type CutHostPresentationState,
  type CutHostRuntimeProjectionEvent,
  type CutHostRuntimeRequest,
  type CutHostRuntimeResult,
  type CutHostRuntimeSnapshot,
  type CutMediaRuntimeAdapter,
} from '@neko/cut-domain';
import {
  parseContentLocatorDragData,
  type ContentLocator,
  type ContentLocatorDragData,
} from '@neko/content';
import { CutExportTaskRegistry } from './CutExportTaskRegistry';
import {
  CutPreviewRuntimeController,
  type CutPreviewRuntimeEvent,
} from './CutPreviewRuntimeController';
import { CutWorkspaceMediaImporter } from './CutWorkspaceMediaImporter';
import { CutWorkspaceMediaPaths } from './CutWorkspaceMediaPaths';
import { NodeFfmpegCutMediaAdapter } from './NodeFfmpegCutMediaAdapter';
import { createInMemoryExportJobStore } from './export-job/store';
import { freezeCutExportRequest, readCutExportSettings } from './cutExportRequest';
import { generateClipRepresentations, readClipRepresentationRequests } from './clipRepresentations';
import type { NodeMediaPublisher } from '@neko/media/node';
import type {
  ResourceBrowserIdentity,
  ResourceBrowserItem,
} from '@neko/assets-domain/resource-browser/contract';

interface CutApplicationRuntimeEntry {
  identity: CutHostRuntimeIdentity;
  readonly session: CutDocumentSession;
  readonly listeners: Set<(event: CutHostRuntimeProjectionEvent) => void>;
  readonly completedCommands: Map<string, CutHostRuntimeResult>;
  documentPath: string;
  readonly workspacePath: string;
  preview: CutPreviewRuntimeController;
  presentation: CutHostPresentationState;
  sequence: number;
}

interface CutPresentationSnapshotEntry {
  readonly windowId: string;
  readonly presentation: CutHostPresentationState;
}

type CutAgentContextOutput = Extract<
  NonNullable<CutHostRuntimeResult['output']>,
  { readonly type: 'agent-context' }
>;

export interface CutApplicationRuntimeOptions {
  readonly authorizeSession: (
    windowId: string,
    identity: CutHostRuntimeIdentity,
  ) => Promise<{
    readonly documentPath: string;
    readonly workspacePath: string;
    readonly storage: CutDocumentStorage;
  }>;
  readonly authorizeNewSession: (
    windowId: string,
    identity: CutHostRuntimeIdentity,
  ) => Promise<{
    readonly documentPath: string;
    readonly workspacePath: string;
    readonly storage: CutDocumentStorage;
  }>;
  readonly resolveResourcePath: (workspaceId: string, locator: ContentLocator) => Promise<string>;
  readonly readText: (absolutePath: string) => Promise<string>;
  readonly createMediaPublisher?: (input: {
    readonly windowId: string;
    readonly viewId: string;
    readonly sessionId: string;
    readonly rendererSessionId: string;
    readonly requestId: string;
  }) => NodeMediaPublisher;
  readonly createMediaAdapter?: (
    workspacePath: string,
  ) => Pick<CutMediaRuntimeAdapter, 'captureFrame' | 'generateWaveform' | 'dispose'>;
  readonly createAuthoringMediaAdapter?: (
    workspacePath: string,
  ) => Pick<CutMediaRuntimeAdapter, 'probe' | 'dispose'>;
  readonly createPreviewMediaAdapter?: (workspacePath: string) => CutMediaRuntimeAdapter;
  readonly createExportMediaAdapter?: (workspacePath: string) => CutMediaRuntimeAdapter;
  readonly selectExportDestination?: (input: {
    readonly identity: CutHostRuntimeIdentity;
    readonly workspacePath: string;
    readonly outputName: string;
    readonly container: 'mp4' | 'mov';
  }) => Promise<string | undefined>;
  readonly selectMediaFiles?: (input: {
    readonly identity: CutHostRuntimeIdentity;
    readonly trackKind: 'Video' | 'Audio' | 'Subtitle';
  }) => Promise<readonly string[] | undefined>;
  readonly reportExportFailure?: (input: {
    readonly identity: CutHostRuntimeIdentity;
    readonly sourceSnapshotId: string;
    readonly outputWorkspaceRelativePath: string;
    readonly error: unknown;
  }) => void;
}

export class CutApplicationRuntime {
  private readonly sessions = new Map<string, CutApplicationRuntimeEntry>();
  private readonly sessionOpenings = new Map<string, Promise<CutApplicationRuntimeEntry>>();
  private readonly operationTails = new Map<string, Promise<void>>();
  private readonly pendingDisposals = new Set<Promise<void>>();
  private readonly presentationSnapshots = new Map<string, CutPresentationSnapshotEntry>();
  private readonly exportTasks: CutExportTaskRegistry;
  private disposed = false;

  constructor(private readonly options: CutApplicationRuntimeOptions) {
    this.exportTasks = new CutExportTaskRegistry({
      store: createInMemoryExportJobStore(),
      onUpdate: (task) => this.projectExportTaskUpdate(task.sessionId),
    });
  }

  async addResource(input: {
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
    if (
      (input.item.facet !== 'files' && input.item.facet !== 'media') ||
      !input.item.capabilities.includes('add-to-cut')
    ) {
      throw new Error('Cut does not support this Resource Browser item.');
    }
    const identity: CutHostRuntimeIdentity = {
      projectId: input.resourceIdentity.projectId,
      workspaceId: input.resourceIdentity.workspaceId,
      windowId: input.resourceIdentity.windowId,
      viewId: input.target.viewId,
      viewInstanceId: input.target.viewInstanceId,
      documentId: input.target.documentId,
      sessionId: input.target.sessionId,
      rendererSessionId: input.resourceIdentity.rendererSessionId,
    };
    const entry = await this.requireSession(input.resourceIdentity.windowId, identity);
    const commandId = [
      'resource-browser-cut',
      input.resourceIdentity.viewId,
      input.item.resourceId,
      identity.sessionId,
    ].join(':');
    const completed = entry.completedCommands.get(commandId);
    if (completed) return completed.snapshot;
    const current = entry.session.view();
    const sourcePath = await this.options.resolveResourcePath(
      input.resourceIdentity.workspaceId,
      input.item.locator,
    );
    const importer = await CutWorkspaceMediaImporter.create(entry.workspacePath);
    const prepared = await importer.prepare(entry.documentPath, sourcePath);
    const mediaAdapter =
      this.options.createAuthoringMediaAdapter?.(entry.workspacePath) ??
      this.createNodeMediaAdapter(entry.workspacePath, entry.identity, commandId);
    let committed = false;
    try {
      const probe = await mediaAdapter.probe({
        workspaceRelativePath: prepared.workspaceRelativePath,
      });
      const trackKind = probe.hasVideo ? 'Video' : probe.hasAudio ? 'Audio' : undefined;
      if (!trackKind) {
        throw new Error('Cut resource has no supported video or audio stream.');
      }
      const rate = current.profile
        ? current.profile.editRateNumerator / current.profile.editRateDenominator
        : 30;
      const durationFrames = Math.max(1, Math.round(probe.durationSeconds * rate));
      const existingTrack = current.tracks.find(
        (track) => track.kind === trackKind && !track.locked,
      );
      if (trackKind === 'Video' && !existingTrack) {
        throw new Error('Cut target has no unlocked Video Track.');
      }
      const trackId = existingTrack?.trackId ?? `track-${randomUUID()}`;
      const timelineStartFrames = existingTrack
        ? Math.round(
            existingTrack.items.reduce(
              (end, item) => Math.max(end, item.startSeconds + item.durationSeconds),
              0,
            ) * rate,
          )
        : 0;
      const paths = await CutWorkspaceMediaPaths.create(entry.workspacePath);
      const targetUrl = await paths.linkMedia(entry.documentPath, prepared.workspaceRelativePath);
      const linkCommand: CutCommand = {
        type: 'link-media',
        clipId: `clip-${randomUUID()}`,
        name: path.basename(prepared.filePath),
        targetUrl,
        durationFrames,
        availableDurationFrames: durationFrames,
        rate,
        trackId,
        timelineStartFrames,
        overlapPolicy: 'insert',
      };
      const commands: readonly CutCommand[] = existingTrack
        ? [linkCommand]
        : [
            {
              type: 'add-track',
              trackId,
              trackKind: 'Audio',
              name: 'Audio',
            },
            linkCommand,
          ];
      entry.session.applyBatch({
        documentUri: identity.documentId,
        sessionId: identity.sessionId,
        commands,
      });
      committed = true;
      const snapshot = this.projectSnapshot(entry);
      const result: CutHostRuntimeResult = {
        snapshot,
      };
      entry.completedCommands.set(commandId, result);
      this.publish(entry, snapshot);
      return snapshot;
    } finally {
      try {
        await mediaAdapter.dispose();
      } finally {
        if (!committed) await importer.discard(prepared);
      }
    }
  }

  async getSnapshot(
    windowId: string,
    identity: CutHostRuntimeIdentity,
  ): Promise<CutHostRuntimeSnapshot> {
    return this.projectSnapshot(await this.requireSession(windowId, identity));
  }

  hasSession(identity: CutHostRuntimeIdentity): boolean {
    this.requireActive();
    return this.sessions.has(cutSessionKey(identity));
  }

  createDraft(input: {
    readonly identity: CutHostRuntimeIdentity;
    readonly name: string;
    readonly documentPath: string;
    readonly workspacePath: string;
    readonly storage: CutDocumentStorage;
  }): CutHostRuntimeSnapshot {
    this.requireActive();
    const key = cutSessionKey(input.identity);
    if (this.sessions.has(key)) {
      throw new Error('Cut draft identity already has an active session.');
    }
    const session = CutDocumentSession.create(
      input.identity.documentId,
      createOtioTimeline(input.name, {
        profile: '1080p30',
        editRateNumerator: 30,
        editRateDenominator: 1,
        width: 1920,
        height: 1080,
      }),
      {
        storage: input.storage,
        createClipId: () => `clip-${randomUUID()}`,
        createTrackId: () => `track-${randomUUID()}`,
        createSessionId: () => input.identity.sessionId,
      },
    );
    const entry: CutApplicationRuntimeEntry = {
      identity: { ...input.identity },
      session,
      listeners: new Set(),
      completedCommands: new Map(),
      documentPath: input.documentPath,
      workspacePath: input.workspacePath,
      preview: this.createPreviewController(
        input.documentPath,
        input.workspacePath,
        input.identity,
        `draft:${input.identity.sessionId}`,
      ),
      presentation: { ...DEFAULT_CUT_HOST_PRESENTATION },
      sequence: 0,
    };
    this.sessions.set(key, entry);
    return this.projectSnapshot(entry);
  }

  async saveDraftAs(input: {
    readonly windowId: string;
    readonly identity: CutHostRuntimeIdentity;
    readonly nextIdentity: CutHostRuntimeIdentity;
    readonly documentPath: string;
    readonly storage: CutDocumentStorage;
  }): Promise<CutHostRuntimeResult> {
    const key = cutSessionKey(input.identity);
    return this.enqueueSessionOperation(key, async () => {
      const entry = this.sessions.get(key);
      if (!entry || entry.identity.windowId !== input.windowId) {
        throw new Error('Cut draft session is unavailable.');
      }
      assertCutHostRuntimeIdentity(entry.identity, input.identity);
      assertCutHostRuntimeIdentity(
        { ...entry.identity, documentId: input.nextIdentity.documentId },
        input.nextIdentity,
      );
      const nextKey = cutSessionKey(input.nextIdentity);
      if (this.sessions.has(nextKey)) {
        throw new Error('Cut Save As target already has an active session.');
      }
      const paths = await CutWorkspaceMediaPaths.create(entry.workspacePath);
      await entry.session.saveAs({
        documentUri: input.nextIdentity.documentId,
        storage: input.storage,
        rebase: (document) =>
          paths.rebaseDocument(document, entry.documentPath, input.documentPath),
      });
      await entry.preview.dispose();
      this.sessions.delete(key);
      entry.identity = { ...input.nextIdentity };
      entry.documentPath = input.documentPath;
      entry.preview = this.createPreviewController(
        input.documentPath,
        entry.workspacePath,
        entry.identity,
        `save-as:${entry.identity.sessionId}`,
      );
      this.sessions.set(nextKey, entry);
      const snapshot = this.projectSnapshot(entry);
      this.publish(entry, snapshot);
      return { snapshot };
    });
  }

  discardSession(windowId: string, identity: CutHostRuntimeIdentity): void {
    this.requireActive();
    const key = cutSessionKey(identity);
    const entry = this.sessions.get(key);
    if (!entry || entry.identity.windowId !== windowId) {
      throw new Error('Cut session is unavailable.');
    }
    assertCutHostRuntimeIdentity(entry.identity, identity);
    entry.listeners.clear();
    this.sessions.delete(key);
    this.scheduleDisposal(entry);
  }

  async execute(
    windowId: string,
    value: CutHostRuntimeRequest | unknown,
  ): Promise<CutHostRuntimeResult> {
    const request = parseCutHostRuntimeRequest(value);
    const key = cutSessionKey(request.identity);
    return this.enqueueSessionOperation(key, async () => {
      if (request.route === CUT_HOST_RUNTIME_ROUTES.documentCreate) {
        return this.createDocument(windowId, request);
      }
      const entry = await this.requireSession(windowId, request.identity);
      return this.executeOwned(entry, request);
    });
  }

  private async executeOwned(
    entry: CutApplicationRuntimeEntry,
    request: CutHostRuntimeRequest,
  ): Promise<CutHostRuntimeResult> {
    const completed = entry.completedCommands.get(request.commandId);
    if (completed) return completed;
    assertCutHostRuntimeIdentity(entry.identity, request.identity);
    switch (request.route) {
      case CUT_HOST_RUNTIME_ROUTES.commandExecute:
        entry.session.apply({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
          command: requireCutCommand(request.payload),
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.commandBatch:
        entry.session.applyBatch({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
          commands: requireCutCommandBatch(request.payload),
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.undo:
        entry.session.undo({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.redo:
        entry.session.redo({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.save:
        await entry.session.save();
        break;
      case CUT_HOST_RUNTIME_ROUTES.presentationUpdate:
        entry.presentation = parseCutHostPresentationState(request.payload);
        this.presentationSnapshots.set(cutPresentationSnapshotKey(entry.identity), {
          windowId: entry.identity.windowId,
          presentation: { ...entry.presentation },
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.mediaSelect: {
        const payload = requireMediaSelectPayload(request.payload);
        const track = entry.session
          .view()
          .tracks.find((candidate) => candidate.trackId === payload.trackId);
        if (!track) throw new Error(`Cut target Track '${payload.trackId}' is stale.`);
        if (!this.options.selectMediaFiles) {
          throw new Error('Cut media picker is unavailable.');
        }
        const selected = await this.options.selectMediaFiles({
          identity: entry.identity,
          trackKind: track.kind,
        });
        if (!selected || selected.length === 0) break;
        await this.applyMediaPaths(entry, request.requestId, {
          ...payload,
          sourcePaths: selected,
        });
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.mediaDrop: {
        const payload = requireMediaDropPayload(request.payload);
        const sourcePaths =
          payload.source.kind === 'content-locator'
            ? [
                await this.options.resolveResourcePath(
                  entry.identity.workspaceId,
                  payload.source.data.locator,
                ),
              ]
            : payload.source.uris.map(requireLocalFileUri);
        await this.applyMediaPaths(entry, request.requestId, {
          ...payload,
          sourcePaths,
        });
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.agentSend: {
        const payload = projectCutAgentContext(entry, request.payload);
        const snapshot = this.projectSnapshot(entry);
        const result: CutHostRuntimeResult = {
          snapshot,
          output: { type: 'agent-context', payload },
        };
        entry.completedCommands.set(request.commandId, result);
        return result;
      }
      case CUT_HOST_RUNTIME_ROUTES.exportGet:
        break;
      case CUT_HOST_RUNTIME_ROUTES.exportStart: {
        const frozen = freezeCutExportRequest(
          entry.session.view(),
          {
            documentUri: entry.identity.documentId,
            sessionId: entry.identity.sessionId,
            snapshotId: request.requestId,
          },
          readCutExportSettings(requireExportStartPayload(request.payload)),
        );
        const selectedDestination = this.options.selectExportDestination
          ? await this.options.selectExportDestination({
              identity: entry.identity,
              workspacePath: entry.workspacePath,
              outputName: frozen.settings.outputName,
              container: frozen.settings.container,
            })
          : `exports/${frozen.settings.outputName.replace(/\.(?:mp4|mov)$/iu, '')}.${frozen.settings.container}`;
        if (selectedDestination === undefined) break;
        const outputWorkspaceRelativePath = selectedDestination;
        assertWorkspaceRelativeExportPath(outputWorkspaceRelativePath, frozen.settings.container);
        await entry.preview.stop(request.requestId);
        await this.exportTasks.start({
          documentUri: frozen.documentUri,
          sessionId: frozen.sessionId,
          sourceSnapshotId: frozen.sourceSnapshotId,
          settings: frozen.settings,
          outputWorkspaceRelativePath,
          run: async (signal) => {
            const adapter =
              this.options.createExportMediaAdapter?.(entry.workspacePath) ??
              this.createNodeMediaAdapter(
                entry.workspacePath,
                entry.identity,
                frozen.sourceSnapshotId,
              );
            try {
              await adapter.export(
                {
                  timeline: Object.freeze({
                    ...frozen.timeline,
                    documentUri: pathToFileURL(entry.documentPath).href,
                  }),
                  outputWorkspaceRelativePath,
                  settings: frozen.settings,
                },
                signal,
              );
            } catch (error: unknown) {
              this.options.reportExportFailure?.({
                identity: entry.identity,
                sourceSnapshotId: frozen.sourceSnapshotId,
                outputWorkspaceRelativePath,
                error,
              });
              throw error;
            } finally {
              await adapter.dispose();
            }
          },
        });
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.exportCancel: {
        const jobId = requireExportCancelPayload(request.payload);
        await this.exportTasks.cancel(entry.identity.documentId, jobId);
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.representationResolve: {
        const requests = readClipRepresentationRequests(
          requireRepresentationResolvePayload(request.payload),
        );
        const paths = await CutWorkspaceMediaPaths.create(entry.workspacePath);
        const mediaAdapter =
          this.options.createMediaAdapter?.(entry.workspacePath) ??
          this.createNodeMediaAdapter(entry.workspacePath, entry.identity, request.requestId);
        try {
          const requestedView = entry.session.view();
          const results = await generateClipRepresentations({
            view: requestedView,
            requests,
            ports: mediaAdapter,
            resolveSource: async (targetUrl) => {
              const source = await paths.resolveTarget(entry.documentPath, targetUrl);
              if (source.status !== 'available') {
                throw new Error(`Cannot derive presentation for missing media: ${targetUrl}`);
              }
              return { workspaceRelativePath: source.workspaceRelativePath };
            },
          });
          const snapshot = this.projectSnapshot(entry);
          const result: CutHostRuntimeResult = {
            snapshot,
            output: {
              type: 'representations',
              requestId: request.requestId,
              results,
            },
          };
          entry.completedCommands.set(request.commandId, result);
          return result;
        } finally {
          await mediaAdapter.dispose();
        }
      }
      case CUT_HOST_RUNTIME_ROUTES.previewStart: {
        const payload = requirePreviewStartPayload(request.payload);
        const message = await entry.preview.start(entry.session.view(), payload);
        return this.completePreviewRequest(entry, request.commandId, message);
      }
      case CUT_HOST_RUNTIME_ROUTES.previewPrepare: {
        const payload = requirePreviewPreparePayload(request.payload);
        const message = await entry.preview.prepare(entry.session.view(), payload);
        return this.completePreviewRequest(entry, request.commandId, message);
      }
      case CUT_HOST_RUNTIME_ROUTES.previewActivate: {
        const payload = requirePreviewRequestIdPayload(request.payload, 'cut:preview-activate');
        const message = await entry.preview.activate(payload.previewRequestId);
        return this.completePreviewRequest(entry, request.commandId, message);
      }
      case CUT_HOST_RUNTIME_ROUTES.previewPause: {
        const payload = requirePreviewPausePayload(request.payload);
        await entry.preview.pause({
          requestId: request.requestId,
          ...(payload.preparedRequestId ? { preparedRequestId: payload.preparedRequestId } : {}),
        });
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.previewStop:
        requirePreviewRequestIdPayload(request.payload, 'cut:preview-stop');
        await entry.preview.stop(request.requestId);
        break;
      default:
        throw new Error(`Cut route '${request.route}' is not integrated yet.`);
    }
    const snapshot = this.projectSnapshot(entry);
    const result: CutHostRuntimeResult = {
      snapshot,
    };
    entry.completedCommands.set(request.commandId, result);
    this.publish(entry, snapshot);
    return result;
  }

  private async createDocument(
    windowId: string,
    request: CutHostRuntimeRequest,
  ): Promise<CutHostRuntimeResult> {
    this.requireActive();
    const key = cutSessionKey(request.identity);
    if (this.sessions.has(key)) {
      throw new Error('Cut document creation target already has an active session.');
    }
    const input = requireDocumentCreatePayload(request.payload);
    const grant = await this.options.authorizeNewSession(windowId, request.identity);
    const session = CutDocumentSession.create(
      request.identity.documentId,
      createOtioTimeline(input.name, input.profile),
      {
        storage: grant.storage,
        createClipId: () => `clip-${randomUUID()}`,
        createTrackId: () => `track-${randomUUID()}`,
        createSessionId: () => request.identity.sessionId,
      },
    );
    if (input.items.length > 0) {
      session.apply({
        documentUri: request.identity.documentId,
        sessionId: request.identity.sessionId,
        command: { type: 'append-route', items: input.items },
      });
    }
    await session.save();
    const entry: CutApplicationRuntimeEntry = {
      identity: { ...request.identity },
      session,
      listeners: new Set(),
      completedCommands: new Map(),
      documentPath: grant.documentPath,
      workspacePath: grant.workspacePath,
      preview: this.createPreviewController(
        grant.documentPath,
        grant.workspacePath,
        request.identity,
        request.requestId,
      ),
      presentation: { ...DEFAULT_CUT_HOST_PRESENTATION },
      sequence: 0,
    };
    const result: CutHostRuntimeResult = {
      snapshot: this.projectSnapshot(entry),
    };
    entry.completedCommands.set(request.commandId, result);
    this.sessions.set(key, entry);
    return result;
  }

  async subscribe(
    windowId: string,
    identity: CutHostRuntimeIdentity,
    listener: (event: CutHostRuntimeProjectionEvent) => void,
  ): Promise<() => void> {
    const entry = await this.requireSession(windowId, identity);
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  detachWindow(windowId: string): void {
    for (const [key, entry] of this.sessions) {
      if (entry.identity.windowId !== windowId) continue;
      entry.listeners.clear();
      this.sessions.delete(key);
      this.scheduleDisposal(entry);
    }
    for (const [key, snapshot] of this.presentationSnapshots) {
      if (snapshot.windowId === windowId) this.presentationSnapshots.delete(key);
    }
  }

  reconcileSessions(windowId: string, attachedSessionIds: readonly string[]): void {
    const attached = new Set(attachedSessionIds);
    for (const [key, entry] of this.sessions) {
      if (entry.identity.windowId !== windowId || attached.has(entry.identity.sessionId)) continue;
      entry.listeners.clear();
      this.sessions.delete(key);
      this.scheduleDisposal(entry);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.sessions.values()) {
      entry.listeners.clear();
      this.scheduleDisposal(entry);
    }
    this.sessions.clear();
    this.presentationSnapshots.clear();
    const results = await Promise.allSettled(this.pendingDisposals);
    await this.exportTasks.dispose();
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Cut sessions could not be disposed.');
    }
  }

  private async requireSession(
    windowId: string,
    identity: CutHostRuntimeIdentity,
  ): Promise<CutApplicationRuntimeEntry> {
    this.requireActive();
    const key = cutSessionKey(identity);
    const current = this.sessions.get(key);
    if (isCutDraftDocumentId(identity.documentId)) {
      if (current) return current;
      throw new Error('Unnamed Cut draft session is unavailable in this application process.');
    }
    const grant = await this.options.authorizeSession(windowId, identity);
    if (current) return current;
    const pending = this.sessionOpenings.get(key);
    if (pending) return pending;
    const opening = this.openSession(key, identity, grant);
    this.sessionOpenings.set(key, opening);
    try {
      return await opening;
    } finally {
      if (this.sessionOpenings.get(key) === opening) {
        this.sessionOpenings.delete(key);
      }
    }
  }

  private async openSession(
    key: string,
    identity: CutHostRuntimeIdentity,
    grant: Awaited<ReturnType<CutApplicationRuntimeOptions['authorizeSession']>>,
  ): Promise<CutApplicationRuntimeEntry> {
    const rebound = [...this.sessions.entries()].find(
      ([, candidate]) =>
        candidate.identity.projectId === identity.projectId &&
        candidate.identity.workspaceId === identity.workspaceId &&
        candidate.identity.windowId === identity.windowId &&
        candidate.identity.viewId === identity.viewId &&
        candidate.identity.viewInstanceId === identity.viewInstanceId &&
        candidate.identity.documentId === identity.documentId &&
        candidate.identity.sessionId === identity.sessionId,
    );
    if (rebound) {
      const [previousKey, entry] = rebound;
      this.sessions.delete(previousKey);
      await entry.preview.dispose();
      this.requireActive();
      entry.identity = { ...identity };
      entry.preview = this.createPreviewController(
        entry.documentPath,
        entry.workspacePath,
        entry.identity,
        `rebind:${entry.identity.sessionId}`,
      );
      this.sessions.set(key, entry);
      return entry;
    }
    const documentPath = grant.documentPath;
    const storage = grant.storage;
    const session = await CutDocumentSession.open(identity.documentId, {
      storage,
      createClipId: () => `clip-${randomUUID()}`,
      createTrackId: () => `track-${randomUUID()}`,
      createSessionId: () => identity.sessionId,
    });
    this.requireActive();
    const entry: CutApplicationRuntimeEntry = {
      identity: { ...identity },
      session,
      listeners: new Set(),
      completedCommands: new Map(),
      documentPath,
      workspacePath: grant.workspacePath,
      preview: this.createPreviewController(
        documentPath,
        grant.workspacePath,
        identity,
        `open:${identity.sessionId}`,
      ),
      presentation: {
        ...(this.presentationSnapshots.get(cutPresentationSnapshotKey(identity))?.presentation ??
          DEFAULT_CUT_HOST_PRESENTATION),
      },
      sequence: 0,
    };
    this.sessions.set(key, entry);
    return entry;
  }

  private projectSnapshot(entry: CutApplicationRuntimeEntry): CutHostRuntimeSnapshot {
    return {
      identity: { ...entry.identity },
      dirty: entry.session.dirty,
      document: entry.session.view(),
      playback: { status: 'idle' },
      export: {
        tasks: this.exportTasks
          .list(entry.identity.documentId)
          .filter((task) => task.sessionId === entry.identity.sessionId),
      },
      presentation: { ...entry.presentation },
    };
  }

  private async applyMediaPaths(
    entry: CutApplicationRuntimeEntry,
    requestId: string,
    input: {
      readonly trackId: string;
      readonly timelineStartFrames: number;
      readonly overlapPolicy: 'reject' | 'insert';
      readonly sourcePaths: readonly string[];
    },
  ): Promise<void> {
    const current = entry.session.view();
    const track = current.tracks.find((candidate) => candidate.trackId === input.trackId);
    if (!track || track.locked) {
      throw new Error(`Cut target Track '${input.trackId}' is unavailable or locked.`);
    }
    const importer = await CutWorkspaceMediaImporter.create(entry.workspacePath);
    const prepared: Awaited<ReturnType<CutWorkspaceMediaImporter['prepare']>>[] = [];
    const adapter =
      this.options.createAuthoringMediaAdapter?.(entry.workspacePath) ??
      this.createNodeMediaAdapter(entry.workspacePath, entry.identity, requestId);
    let committed = false;
    try {
      for (const sourcePath of input.sourcePaths) {
        prepared.push(await importer.prepare(entry.documentPath, sourcePath));
      }
      const rate = current.profile
        ? current.profile.editRateNumerator / current.profile.editRateDenominator
        : 30;
      const paths = await CutWorkspaceMediaPaths.create(entry.workspacePath);
      let timelineStartFrames = input.timelineStartFrames;
      const commands: CutCommand[] = [];
      for (const source of prepared) {
        const durationSeconds =
          track.kind === 'Subtitle'
            ? parseSubtitleDurationSeconds(await this.options.readText(source.filePath))
            : await adapter
                .probe({ workspaceRelativePath: source.workspaceRelativePath })
                .then((probe) => {
                  if (
                    (track.kind === 'Video' && !probe.hasVideo) ||
                    (track.kind === 'Audio' && !probe.hasAudio)
                  ) {
                    throw new Error(`Cut media is incompatible with target ${track.kind} Track.`);
                  }
                  return probe.durationSeconds;
                });
        const durationFrames = Math.max(1, Math.round(durationSeconds * rate));
        commands.push({
          type: 'link-media',
          clipId: `clip-${randomUUID()}`,
          name: path.basename(source.filePath),
          targetUrl: await paths.linkMedia(entry.documentPath, source.workspaceRelativePath),
          durationFrames,
          availableDurationFrames: durationFrames,
          rate,
          trackId: track.trackId,
          timelineStartFrames,
          overlapPolicy: input.overlapPolicy,
        });
        timelineStartFrames += durationFrames;
      }
      entry.session.applyBatch({
        documentUri: entry.identity.documentId,
        sessionId: entry.identity.sessionId,
        commands,
      });
      committed = true;
    } finally {
      try {
        await adapter.dispose();
      } finally {
        if (!committed) {
          await Promise.all(prepared.map((source) => importer.discard(source)));
        }
      }
    }
  }

  private projectExportTaskUpdate(sessionId: string): void {
    for (const entry of this.sessions.values()) {
      if (entry.identity.sessionId === sessionId) this.publish(entry);
    }
  }

  private publish(
    entry: CutApplicationRuntimeEntry,
    snapshot: CutHostRuntimeSnapshot = this.projectSnapshot(entry),
  ): void {
    entry.sequence += 1;
    const event: CutHostRuntimeProjectionEvent = {
      sequence: entry.sequence,
      snapshot,
    };
    for (const listener of entry.listeners) listener(event);
  }

  private completePreviewRequest(
    entry: CutApplicationRuntimeEntry,
    commandId: string,
    event: CutPreviewRuntimeEvent,
  ): CutHostRuntimeResult {
    const result: CutHostRuntimeResult = {
      snapshot: this.projectSnapshot(entry),
      output: { type: 'preview', message: event },
    };
    entry.completedCommands.set(commandId, result);
    return result;
  }

  private scheduleDisposal(entry: CutApplicationRuntimeEntry): void {
    const disposal = entry.preview.dispose();
    this.pendingDisposals.add(disposal);
    void disposal.catch(() => undefined);
  }

  private createPreviewController(
    documentPath: string,
    workspacePath: string,
    identity: CutHostRuntimeIdentity,
    requestId: string,
  ): CutPreviewRuntimeController {
    const mediaAdapter =
      this.options.createPreviewMediaAdapter?.(workspacePath) ??
      this.createNodeMediaAdapter(workspacePath, identity, requestId);
    return new CutPreviewRuntimeController({
      documentPath,
      workspacePath,
      mediaAdapter,
    });
  }

  private createNodeMediaAdapter(
    workspacePath: string,
    identity: CutHostRuntimeIdentity,
    requestId: string,
  ): NodeFfmpegCutMediaAdapter {
    const publisher =
      this.options.createMediaPublisher?.({
        windowId: identity.windowId,
        viewId: identity.viewId,
        sessionId: identity.sessionId,
        rendererSessionId: identity.rendererSessionId,
        requestId,
      }) ?? UNAVAILABLE_MEDIA_PUBLISHER;
    return new NodeFfmpegCutMediaAdapter(workspacePath, { publisher });
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Cut runtime is disposed.');
  }

  private enqueueSessionOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTails.get(key) ?? Promise.resolve();
    const result = previous.then(() => {
      this.requireActive();
      return operation();
    });
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.operationTails.set(key, tail);
    void tail.then(() => {
      if (this.operationTails.get(key) === tail) this.operationTails.delete(key);
    });
    return result;
  }
}

function projectCutAgentContext(
  entry: CutApplicationRuntimeEntry,
  value: unknown,
): CutAgentContextOutput['payload'] {
  const selection = requireCutAgentSelection(value);
  const view = entry.session.view();
  const track = view.tracks.find((candidate) => candidate.trackId === selection.trackId);
  if (!track) throw new Error(`Cut Agent target Track '${selection.trackId}' is stale.`);
  const document = {
    locator: { kind: 'workspace-file' as const, path: entry.identity.documentId },
    sessionId: entry.identity.sessionId,
  };
  if (selection.kind === 'track') {
    const clips = track.items.filter((item) => item.kind === 'clip');
    return {
      type: 'cut-clip',
      id: `cut:${entry.identity.documentId}:track:${track.trackId}`,
      label: track.name,
      summary: `${track.kind} Track “${track.name}” with ${clips.length} Clip${clips.length === 1 ? '' : 's'}.`,
      data: {
        kind: 'cut-track-selection',
        projectId: entry.identity.projectId,
        workspaceId: entry.identity.workspaceId,
        document,
        selection: {
          kind: 'track',
          trackId: track.trackId,
          trackKind: track.kind,
          enabled: track.enabled,
          locked: track.locked,
          clipIds: clips.map((clip) => clip.clipId),
        },
      },
    };
  }
  const clip = track.items.find((item) => item.kind === 'clip' && item.clipId === selection.clipId);
  if (!clip || clip.kind !== 'clip') {
    throw new Error(`Cut Agent target Clip '${selection.clipId}' is stale.`);
  }
  return {
    type: 'cut-clip',
    id: `cut:${entry.identity.documentId}:track:${track.trackId}:clip:${clip.clipId}`,
    label: clip.name,
    summary: `${track.kind} Clip “${clip.name}” at ${formatSeconds(clip.startSeconds)}–${formatSeconds(clip.startSeconds + clip.durationSeconds)}.`,
    data: {
      kind: 'cut-clip-selection',
      projectId: entry.identity.projectId,
      workspaceId: entry.identity.workspaceId,
      document,
      selection: {
        kind: 'clip',
        trackId: track.trackId,
        trackKind: track.kind,
        clipId: clip.clipId,
        timeRange: {
          startSeconds: clip.startSeconds,
          durationSeconds: clip.durationSeconds,
        },
        media: {
          targetUrl: clip.targetUrl,
          sourceStartSeconds: clip.sourceStartSeconds,
          playbackRate: clip.playbackRate,
          enabled: clip.enabled,
          audio: clip.audio,
        },
      },
    },
  };
}

function requireCutAgentSelection(
  value: unknown,
):
  | { readonly kind: 'track'; readonly trackId: string }
  | { readonly kind: 'clip'; readonly trackId: string; readonly clipId: string } {
  const payload = requireObject(value, 'Cut Agent selection must be an object.');
  const selection = requireObject(
    payload['selection'],
    'Cut Agent selection requires an explicit selection object.',
  );
  if (typeof selection['trackId'] !== 'string') {
    throw new Error('Cut Agent selection requires an explicit Track identity.');
  }
  if (selection['kind'] === 'track') {
    return { kind: 'track', trackId: selection['trackId'] };
  }
  if (selection['kind'] === 'clip' && typeof selection['clipId'] === 'string') {
    return {
      kind: 'clip',
      trackId: selection['trackId'],
      clipId: selection['clipId'],
    };
  }
  throw new Error('Cut Agent selection kind or Clip identity is invalid.');
}

function formatSeconds(value: number): string {
  return `${value.toFixed(3)}s`;
}

const UNAVAILABLE_MEDIA_PUBLISHER = {
  registerFile: async () => {
    throw new Error('Cut media publication requires the app resource registry.');
  },
  registerPcm: async () => {
    throw new Error('Cut PCM publication requires the app resource registry.');
  },
  unregister: () => {
    throw new Error('Cut cannot release an unregistered media capability.');
  },
} satisfies NodeMediaPublisher;

const CUT_COMMAND_TYPES = new Set<string>([
  'set-project-canvas',
  'link-media',
  'add-track',
  'remove-track',
  'rename-track',
  'move-track',
  'relink-media',
  'split',
  'trim',
  'move-item',
  'place-clip',
  'rename-clip',
  'set-clip-duration',
  'set-playback-rate',
  'ripple-delete',
  'trim-trailing-gaps',
  'insert-gap',
  'remove-gap',
  'set-audio',
  'set-clip-enabled',
  'set-track-enabled',
  'set-track-muted',
  'set-clip-locked',
  'set-track-locked',
  'duplicate-clip',
  'clone-clip-at-time',
  'duplicate-track',
  'separate-audio',
  'unseparate-audio',
  'append-route',
]);

function requireCutCommand(value: unknown): CutCommand {
  if (!isCutCommand(value)) throw new Error('Cut command payload is invalid.');
  return value;
}

function requireCutCommandBatch(value: unknown): readonly CutCommand[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isCutCommand)) {
    throw new Error('Cut command batch payload is invalid.');
  }
  return value;
}

function requireDocumentCreatePayload(value: unknown): {
  readonly name: string;
  readonly profile: CutProjectProfile;
  readonly items: readonly CutRouteAppendItem[];
} {
  const record = requireObject(value, 'Cut document creation payload is invalid.');
  if (record['type'] !== 'cut:document-create') {
    throw new Error('Cut document creation type is invalid.');
  }
  const name = record['name'];
  const profile = requireObject(record['profile'], 'Cut document profile is invalid.');
  const items = record['items'];
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Cut document creation requires a project name.');
  }
  if (!Array.isArray(items) || items.length === 0 || !items.every(isCutRouteAppendItem)) {
    throw new Error('Cut document creation requires a validated non-empty route.');
  }
  const profileName = profile['profile'];
  const editRateNumerator = profile['editRateNumerator'];
  const editRateDenominator = profile['editRateDenominator'];
  const width = profile['width'];
  const height = profile['height'];
  if (
    typeof profileName !== 'string' ||
    profileName.trim().length === 0 ||
    !isPositiveInteger(editRateNumerator) ||
    !isPositiveInteger(editRateDenominator) ||
    !isPositiveInteger(width) ||
    !isPositiveInteger(height)
  ) {
    throw new Error('Cut document creation profile fields are invalid.');
  }
  return {
    name,
    profile: { profile: profileName, editRateNumerator, editRateDenominator, width, height },
    items,
  };
}

function isCutRouteAppendItem(value: unknown): value is CutRouteAppendItem {
  if (!isUnknownRecord(value)) return false;
  if (!isPositiveInteger(value['durationFrames']) || !isPositiveNumber(value['rate'])) {
    return false;
  }
  if (value['kind'] === 'gap') return true;
  return (
    value['kind'] === 'media' &&
    typeof value['clipId'] === 'string' &&
    value['clipId'].length > 0 &&
    typeof value['name'] === 'string' &&
    value['name'].length > 0 &&
    typeof value['targetUrl'] === 'string' &&
    value['targetUrl'].length > 0
  );
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function requireMediaSelectPayload(value: unknown): {
  readonly trackId: string;
  readonly timelineStartFrames: number;
  readonly overlapPolicy: 'reject' | 'insert';
} {
  const record = requireObject(value, 'Cut media selection payload is invalid.');
  if (record['type'] !== 'cut:select-link-media') {
    throw new Error('Cut media selection type is invalid.');
  }
  return readMediaPlacement(record);
}

function requireMediaDropPayload(value: unknown): {
  readonly trackId: string;
  readonly timelineStartFrames: number;
  readonly overlapPolicy: 'reject' | 'insert';
  readonly source:
    | { readonly kind: 'content-locator'; readonly data: ContentLocatorDragData }
    | { readonly kind: 'local-file-uris'; readonly uris: readonly string[] };
} {
  const record = requireObject(value, 'Cut media drop payload is invalid.');
  if (record['type'] !== 'cut:drop-link-media') {
    throw new Error('Cut media drop type is invalid.');
  }
  const source = requireObject(record['source'], 'Cut media drop source is invalid.');
  if (source['kind'] === 'content-locator') {
    return {
      ...readMediaPlacement(record),
      source: {
        kind: 'content-locator',
        data: parseContentLocatorDragData(source['data']),
      },
    };
  }
  const uris = source['uris'];
  if (
    source['kind'] !== 'local-file-uris' ||
    !Array.isArray(uris) ||
    uris.length === 0 ||
    !uris.every((uri): uri is string => typeof uri === 'string')
  ) {
    throw new Error('Cut media drop source is invalid.');
  }
  return { ...readMediaPlacement(record), source: { kind: 'local-file-uris', uris } };
}

function readMediaPlacement(record: Record<string, unknown>): {
  readonly trackId: string;
  readonly timelineStartFrames: number;
  readonly overlapPolicy: 'reject' | 'insert';
} {
  const trackId = record['trackId'];
  const timelineStartFrames = record['timelineStartFrames'];
  const overlapPolicy = record['overlapPolicy'];
  if (
    typeof trackId !== 'string' ||
    trackId.length === 0 ||
    typeof timelineStartFrames !== 'number' ||
    !Number.isInteger(timelineStartFrames) ||
    timelineStartFrames < 0 ||
    (overlapPolicy !== 'reject' && overlapPolicy !== 'insert')
  ) {
    throw new Error('Cut media placement requires a Track, timeline frame and overlap policy.');
  }
  return { trackId, timelineStartFrames, overlapPolicy };
}

function requireLocalFileUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('Cut dropped media URI is invalid.', { cause: error });
  }
  if (url.protocol !== 'file:') {
    throw new Error('Cut dropped media must use a local file URI.');
  }
  return fileURLToPath(url);
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function parseSubtitleDurationSeconds(source: string): number {
  const matches = source.matchAll(/(?:\d{2}:)?\d{2}:\d{2}[,.]\d{3}/gu);
  let maximum = 0;
  for (const match of matches) {
    const value = match[0];
    if (!value) continue;
    const parts = value.replace(',', '.').split(':').map(Number);
    const seconds =
      parts.length === 3
        ? (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
        : (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
    if (Number.isFinite(seconds)) maximum = Math.max(maximum, seconds);
  }
  if (maximum <= 0) {
    throw new Error('Cut subtitle contains no valid SRT/VTT timestamp.');
  }
  return maximum;
}

function requireRepresentationResolvePayload(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('type' in value) ||
    value.type !== 'cut:request-representations' ||
    !('requests' in value)
  ) {
    throw new Error('Cut representation request payload is invalid.');
  }
  return value.requests;
}

function requireExportStartPayload(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('type' in value) ||
    value.type !== 'cut:export-start' ||
    !('settings' in value)
  ) {
    throw new Error('Cut export start payload is invalid.');
  }
  return value.settings;
}

function requireExportCancelPayload(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('type' in value) ||
    value.type !== 'cut:export-cancel' ||
    !('jobId' in value) ||
    typeof value.jobId !== 'string' ||
    !value.jobId.trim()
  ) {
    throw new Error('Cut export cancellation payload is invalid.');
  }
  return value.jobId;
}

function assertWorkspaceRelativeExportPath(value: string, container: 'mp4' | 'mov'): void {
  if (
    !value.trim() ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').includes('..') ||
    !value.toLocaleLowerCase().endsWith(`.${container}`)
  ) {
    throw new Error(`Cut export target must be a workspace-relative .${container} path.`);
  }
}

function requirePreviewStartPayload(value: unknown): {
  readonly timelineTimeSeconds: number;
  readonly previewRequestId: string;
  readonly retainedVideoClipId?: string;
  readonly includeAudio?: boolean;
} {
  const record = requirePreviewPayload(value, 'cut:preview-start');
  const retainedVideoClipId = record['retainedVideoClipId'];
  if (retainedVideoClipId !== undefined && typeof retainedVideoClipId !== 'string') {
    throw new Error('Cut retained Video Clip identity is invalid.');
  }
  return {
    timelineTimeSeconds: requireNonNegativeFinite(
      record['timelineTimeSeconds'],
      'Cut preview time is invalid.',
    ),
    previewRequestId: requireIdentity(
      record['previewRequestId'],
      'Cut preview request identity is invalid.',
    ),
    ...(retainedVideoClipId ? { retainedVideoClipId } : {}),
    ...(record['playbackMode'] === 'paused' ? { includeAudio: false } : {}),
  };
}

function requirePreviewPreparePayload(value: unknown): {
  readonly timelineTimeSeconds: number;
  readonly previewRequestId: string;
} {
  const record = requirePreviewPayload(value, 'cut:preview-prepare');
  return {
    timelineTimeSeconds: requireNonNegativeFinite(
      record['timelineTimeSeconds'],
      'Cut preview time is invalid.',
    ),
    previewRequestId: requireIdentity(
      record['previewRequestId'],
      'Cut preview request identity is invalid.',
    ),
  };
}

function requirePreviewRequestIdPayload(
  value: unknown,
  type: 'cut:preview-activate' | 'cut:preview-stop',
): { readonly previewRequestId: string } {
  const record = requirePreviewPayload(value, type);
  return {
    previewRequestId: requireIdentity(
      record['previewRequestId'],
      'Cut preview request identity is invalid.',
    ),
  };
}

function requirePreviewPausePayload(value: unknown): {
  readonly previewRequestId: string;
  readonly preparedRequestId?: string;
} {
  const record = requirePreviewPayload(value, 'cut:preview-pause');
  const preparedRequestId = record['preparedRequestId'];
  return {
    previewRequestId: requireIdentity(
      record['previewRequestId'],
      'Cut preview request identity is invalid.',
    ),
    ...(preparedRequestId === undefined
      ? {}
      : {
          preparedRequestId: requireIdentity(
            preparedRequestId,
            'Cut prepared preview request identity is invalid.',
          ),
        }),
  };
}

function requirePreviewPayload(value: unknown, expectedType: string): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('type' in value) ||
    value.type !== expectedType
  ) {
    throw new Error(`Cut ${expectedType} payload is invalid.`);
  }
  return value as Record<string, unknown>;
}

function requireNonNegativeFinite(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function requireIdentity(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value;
}

function isCutCommand(value: unknown): value is CutCommand {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    typeof value.type === 'string' &&
    CUT_COMMAND_TYPES.has(value.type)
  );
}

function cutSessionKey(identity: CutHostRuntimeIdentity): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewInstanceId),
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
  ].join(':');
}

function cutPresentationSnapshotKey(identity: CutHostRuntimeIdentity): string {
  return JSON.stringify([
    identity.projectId,
    identity.workspaceId,
    identity.windowId,
    identity.viewId,
    identity.viewInstanceId,
    identity.documentId,
    identity.sessionId,
  ]);
}
