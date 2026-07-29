import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CUT_HOST_RUNTIME_ROUTES,
  CUT_HOST_RUNTIME_VERSION,
  CutDocumentSession,
  DEFAULT_CUT_HOST_PRESENTATION,
  assertCutHostRuntimeIdentity,
  parseCutHostPresentationState,
  parseCutHostRuntimeRequest,
  type CutCommand,
  type CutDocumentStorage,
  type CutHostRuntimeIdentity,
  type CutHostPreviewMessage,
  type CutHostPresentationState,
  type CutHostRuntimeProjectionEvent,
  type CutHostRuntimeRequest,
  type CutHostRuntimeResult,
  type CutHostRuntimeSnapshot,
  type CutMediaRuntimeAdapter,
} from '@neko-cut/domain';
import {
  CutExportTaskRegistry,
  CutPreviewRuntimeController,
  CutWorkspaceMediaImporter,
  CutWorkspaceMediaPaths,
  NodeFfmpegCutMediaAdapter,
  createInMemoryExportJobStore,
  freezeCutExportRequest,
  generateClipRepresentations,
  readCutExportSettings,
  readClipRepresentationRequests,
  type CutPreviewRuntimeEvent,
} from '@neko-cut/node';
import type { NekoHostPorts } from '@neko/host/ports';
import type {
  ResourceBrowserIdentity,
  ResourceBrowserItem,
} from 'neko-assets/resource-browser/contract';
import type { DesktopShellService } from './shell-service';
import {
  getActiveMainView,
  openOrFocusMainView,
  showWorkbenchTimeline,
  type DesktopWorkbenchLayoutProjection,
} from '../shared/workbench-contract';
import { createDesktopCutSessionId } from '../shared/cut-bridge-contract';
import { resolveDesktopWorkspaceContentLocator } from './desktop-content-locator';
import type { DesktopMediaDescriptorRegistry } from './desktop-media-protocol';

interface DesktopCutRuntimeEntry {
  identity: CutHostRuntimeIdentity;
  readonly session: CutDocumentSession;
  readonly listeners: Set<(event: CutHostRuntimeProjectionEvent) => void>;
  readonly completedCommands: Map<string, CutHostRuntimeResult>;
  readonly documentPath: string;
  readonly workspacePath: string;
  readonly preview: CutPreviewRuntimeController;
  presentation: CutHostPresentationState;
  sequence: number;
}

export class DesktopCutRuntime {
  private readonly sessions = new Map<string, DesktopCutRuntimeEntry>();
  private readonly pendingDisposals = new Set<Promise<void>>();
  private readonly exportTasks: CutExportTaskRegistry;
  private disposed = false;

  constructor(
    private readonly options: {
      readonly shell: Pick<
        DesktopShellService,
        'getProjection' | 'updateWorkbench' | 'resolveAgentWorkspace' | 'resolveCutViewGrant'
      >;
      readonly host: NekoHostPorts;
      readonly mediaRegistry: DesktopMediaDescriptorRegistry;
      readonly resolveWebContentsId: (windowId: string) => number;
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
    },
  ) {
    this.exportTasks = new CutExportTaskRegistry({
      store: createInMemoryExportJobStore(),
      onUpdate: (task) => this.projectExportTaskUpdate(task.sessionId),
    });
  }

  async open(input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
  }): Promise<void> {
    this.requireActive();
    if (
      input.item.facet === 'entities' ||
      input.item.locator.kind !== 'workspace-file' ||
      !input.item.locator.path.toLocaleLowerCase().endsWith('.otio')
    ) {
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
      current.endpointEpoch !== input.identity.endpointEpoch ||
      tab.viewEpoch !== input.identity.viewEpoch
    ) {
      throw new Error('Desktop Cut Resource owner is stale.');
    }
    const workspace = await this.options.shell.resolveAgentWorkspace(project.workspaceId);
    const resolvedPath = await resolveDesktopWorkspaceContentLocator(workspace, locator);
    if (resolvedPath !== input.absolutePath) {
      throw new Error('Desktop Cut Resource path does not match its authorized ContentLocator.');
    }
    const existing = current.window.workbench.main.views.find(
      (view) =>
        view.kind === 'cut' &&
        view.projectId === project.projectId &&
        view.workspaceId === project.workspaceId &&
        view.documentId === locator.path,
    );
    const viewId = existing?.viewId ?? `cut:${tab.viewId}:${randomUUID()}`;
    const ownerId = existing?.ownerId ?? createDesktopCutSessionId(viewId, tab.viewEpoch);
    const view = existing ?? {
      viewId,
      viewEpoch: tab.viewEpoch,
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      kind: 'cut' as const,
      ownerId,
      displayLabel: input.item.label,
      documentId: locator.path,
    };
    const activeBeforeOpen = getActiveMainView(current.window.workbench);
    let workbench = openOrFocusMainView(current.window.workbench, view);
    if (activeBeforeOpen?.kind === 'canvas') {
      workbench = openOrFocusMainView(workbench, activeBeforeOpen);
    }
    workbench = showWorkbenchTimeline(workbench, view.viewId);
    workbench = {
      ...workbench,
      revision: current.window.workbench.revision + 1,
    };
    await this.options.shell.updateWorkbench(
      input.identity.windowId,
      current.endpointEpoch,
      current.window.revision,
      current.window.workbench.revision,
      workbench,
    );
  }

  async addResource(input: {
    readonly resourceIdentity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly target: {
      readonly viewId: string;
      readonly viewEpoch: number;
      readonly documentId: string;
      readonly sessionId: string;
      readonly expectedRevision: number;
    };
  }): Promise<CutHostRuntimeSnapshot> {
    this.requireActive();
    if (input.item.facet === 'entities' || !input.item.capabilities.includes('add-to-cut')) {
      throw new Error('Desktop Cut does not support this Resource Browser item.');
    }
    const identity: CutHostRuntimeIdentity = {
      projectId: input.resourceIdentity.projectId,
      workspaceId: input.resourceIdentity.workspaceId,
      windowId: input.resourceIdentity.windowId,
      viewId: input.target.viewId,
      viewEpoch: input.target.viewEpoch,
      documentId: input.target.documentId,
      sessionId: input.target.sessionId,
      endpointEpoch: input.resourceIdentity.endpointEpoch,
    };
    const entry = await this.requireSession(input.resourceIdentity.windowId, identity);
    const commandId = [
      'resource-browser-cut',
      input.resourceIdentity.viewId,
      input.item.resourceId,
      identity.sessionId,
      String(input.target.expectedRevision),
    ].join(':');
    const completed = entry.completedCommands.get(commandId);
    if (completed) return completed.snapshot;
    const current = entry.session.view();
    if (current.revision !== input.target.expectedRevision) {
      throw new Error(
        `Desktop Cut resource target revision ${input.target.expectedRevision} is stale; current revision is ${current.revision}.`,
      );
    }

    const workspace = await this.options.shell.resolveAgentWorkspace(
      input.resourceIdentity.workspaceId,
    );
    const sourcePath = await resolveDesktopWorkspaceContentLocator(workspace, input.item.locator);
    const importer = await CutWorkspaceMediaImporter.create(entry.workspacePath);
    const prepared = await importer.prepare(entry.documentPath, sourcePath);
    const mediaAdapter =
      this.options.createAuthoringMediaAdapter?.(entry.workspacePath) ??
      new NodeFfmpegCutMediaAdapter(entry.workspacePath);
    let committed = false;
    try {
      const probe = await mediaAdapter.probe({
        workspaceRelativePath: prepared.workspaceRelativePath,
      });
      const trackKind = probe.hasVideo ? 'Video' : probe.hasAudio ? 'Audio' : undefined;
      if (!trackKind) {
        throw new Error('Desktop Cut resource has no supported video or audio stream.');
      }
      const rate = current.profile
        ? current.profile.editRateNumerator / current.profile.editRateDenominator
        : 30;
      const durationFrames = Math.max(1, Math.round(probe.durationSeconds * rate));
      const existingTrack = current.tracks.find(
        (track) => track.kind === trackKind && !track.locked,
      );
      if (trackKind === 'Video' && !existingTrack) {
        throw new Error('Desktop Cut target has no unlocked Video Track.');
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
        expectedRevision: input.target.expectedRevision,
        commands,
      });
      committed = true;
      const snapshot = this.projectSnapshot(entry);
      const result: CutHostRuntimeResult = {
        schemaVersion: CUT_HOST_RUNTIME_VERSION,
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

  async execute(
    windowId: string,
    value: CutHostRuntimeRequest | unknown,
  ): Promise<CutHostRuntimeResult> {
    const request = parseCutHostRuntimeRequest(value);
    const entry = await this.requireSession(windowId, request.identity);
    const completed = entry.completedCommands.get(request.commandId);
    if (completed) return completed;
    assertCutHostRuntimeIdentity(entry.identity, request.identity);
    const current = entry.session.view();
    if (current.revision !== request.expectedRevision) {
      throw new Error(
        `Desktop Cut revision ${request.expectedRevision} is stale; current revision is ${current.revision}.`,
      );
    }
    switch (request.route) {
      case CUT_HOST_RUNTIME_ROUTES.commandExecute:
        entry.session.apply({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
          expectedRevision: request.expectedRevision,
          command: requireCutCommand(request.payload),
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.commandBatch:
        entry.session.applyBatch({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
          expectedRevision: request.expectedRevision,
          commands: requireCutCommandBatch(request.payload),
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.undo:
        entry.session.undo({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
          expectedRevision: request.expectedRevision,
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.redo:
        entry.session.redo({
          documentUri: entry.identity.documentId,
          sessionId: entry.identity.sessionId,
          expectedRevision: request.expectedRevision,
        });
        break;
      case CUT_HOST_RUNTIME_ROUTES.save:
        await entry.session.save();
        break;
      case CUT_HOST_RUNTIME_ROUTES.presentationUpdate:
        entry.presentation = parseCutHostPresentationState(request.payload);
        break;
      case CUT_HOST_RUNTIME_ROUTES.mediaSelect: {
        const payload = requireMediaSelectPayload(request.payload);
        const track = entry.session
          .view()
          .tracks.find((candidate) => candidate.trackId === payload.trackId);
        if (!track) throw new Error(`Desktop Cut target Track '${payload.trackId}' is stale.`);
        if (!this.options.selectMediaFiles) {
          throw new Error('Desktop Cut media picker is unavailable.');
        }
        const selected = await this.options.selectMediaFiles({
          identity: entry.identity,
          trackKind: track.kind,
        });
        if (!selected || selected.length === 0) break;
        await this.applyMediaPaths(entry, request.expectedRevision, {
          ...payload,
          sourcePaths: selected,
        });
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.mediaDrop: {
        const payload = requireMediaDropPayload(request.payload);
        await this.applyMediaPaths(entry, request.expectedRevision, {
          ...payload,
          sourcePaths: payload.uris.map(requireLocalFileUri),
        });
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.exportGet:
        break;
      case CUT_HOST_RUNTIME_ROUTES.exportStart: {
        const frozen = freezeCutExportRequest(
          entry.session.view(),
          {
            documentUri: entry.identity.documentId,
            sessionId: entry.identity.sessionId,
            expectedRevision: request.expectedRevision,
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
        await entry.preview.stop();
        await this.exportTasks.start({
          documentUri: frozen.documentUri,
          sessionId: frozen.sessionId,
          sourceRevision: frozen.sourceRevision,
          settings: frozen.settings,
          outputWorkspaceRelativePath,
          run: async (signal) => {
            const adapter =
              this.options.createExportMediaAdapter?.(entry.workspacePath) ??
              new NodeFfmpegCutMediaAdapter(entry.workspacePath);
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
          new NodeFfmpegCutMediaAdapter(entry.workspacePath);
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
          const current = entry.session.view();
          if (
            current.sessionId !== requestedView.sessionId ||
            current.documentUri !== requestedView.documentUri ||
            current.revision !== requestedView.revision
          ) {
            throw new Error('Desktop Cut representation result became stale.');
          }
          const snapshot = this.projectSnapshot(entry);
          const result: CutHostRuntimeResult = {
            schemaVersion: CUT_HOST_RUNTIME_VERSION,
            snapshot,
            output: {
              type: 'representations',
              revision: snapshot.revision,
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
        const payload = requirePreviewGenerationPayload(request.payload, 'cut:preview-activate');
        const message = await entry.preview.activate(payload.generation);
        return this.completePreviewRequest(entry, request.commandId, message);
      }
      case CUT_HOST_RUNTIME_ROUTES.previewPause: {
        const payload = requirePreviewPausePayload(request.payload);
        await entry.preview.pause(payload.preparedGeneration);
        break;
      }
      case CUT_HOST_RUNTIME_ROUTES.previewStop:
        requirePreviewGenerationPayload(request.payload, 'cut:preview-stop');
        await entry.preview.stop();
        break;
      default:
        throw new Error(`Desktop Cut route '${request.route}' is not integrated yet.`);
    }
    const snapshot = this.projectSnapshot(entry);
    const result: CutHostRuntimeResult = {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      snapshot,
    };
    entry.completedCommands.set(request.commandId, result);
    this.publish(entry, snapshot);
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
  }

  reconcileWorkbench(windowId: string, workbench: DesktopWorkbenchLayoutProjection): void {
    const attached = new Set(
      workbench.main.views.filter((view) => view.kind === 'cut').map((view) => view.ownerId),
    );
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
    const results = await Promise.allSettled(this.pendingDisposals);
    await this.exportTasks.dispose();
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Desktop Cut sessions could not be disposed.');
    }
  }

  private async requireSession(
    windowId: string,
    identity: CutHostRuntimeIdentity,
  ): Promise<DesktopCutRuntimeEntry> {
    this.requireActive();
    const grant = await this.options.shell.resolveCutViewGrant(windowId, identity);
    const key = cutSessionKey(identity);
    const current = this.sessions.get(key);
    if (current) return current;
    const rebound = [...this.sessions.entries()].find(
      ([, candidate]) =>
        candidate.identity.projectId === identity.projectId &&
        candidate.identity.workspaceId === identity.workspaceId &&
        candidate.identity.windowId === identity.windowId &&
        candidate.identity.viewId === identity.viewId &&
        candidate.identity.viewEpoch === identity.viewEpoch &&
        candidate.identity.documentId === identity.documentId &&
        candidate.identity.sessionId === identity.sessionId,
    );
    if (rebound) {
      const [previousKey, entry] = rebound;
      this.sessions.delete(previousKey);
      entry.identity = { ...identity };
      this.sessions.set(key, entry);
      return entry;
    }
    const documentPath = await resolveDesktopWorkspaceContentLocator(grant.workspace, {
      kind: 'workspace-file',
      path: identity.documentId,
    });
    const storage = createCutDocumentStorage(this.options.host, documentPath);
    const session = await CutDocumentSession.open(identity.documentId, {
      storage,
      createClipId: () => `clip-${randomUUID()}`,
      createTrackId: () => `track-${randomUUID()}`,
      createSessionId: () => identity.sessionId,
    });
    const previewMediaAdapter =
      this.options.createPreviewMediaAdapter?.(grant.workspace.workspacePath) ??
      new NodeFfmpegCutMediaAdapter(grant.workspace.workspacePath);
    const entry: DesktopCutRuntimeEntry = {
      identity: { ...identity },
      session,
      listeners: new Set(),
      completedCommands: new Map(),
      documentPath,
      workspacePath: grant.workspace.workspacePath,
      preview: new CutPreviewRuntimeController({
        documentPath,
        workspacePath: grant.workspace.workspacePath,
        mediaAdapter: previewMediaAdapter,
      }),
      presentation: { ...DEFAULT_CUT_HOST_PRESENTATION },
      sequence: 0,
    };
    this.sessions.set(key, entry);
    return entry;
  }

  private projectSnapshot(entry: DesktopCutRuntimeEntry): CutHostRuntimeSnapshot {
    return {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      identity: { ...entry.identity },
      revision: entry.session.revision,
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
    entry: DesktopCutRuntimeEntry,
    expectedRevision: number,
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
      throw new Error(`Desktop Cut target Track '${input.trackId}' is unavailable or locked.`);
    }
    const importer = await CutWorkspaceMediaImporter.create(entry.workspacePath);
    const prepared: Awaited<ReturnType<CutWorkspaceMediaImporter['prepare']>>[] = [];
    const adapter =
      this.options.createAuthoringMediaAdapter?.(entry.workspacePath) ??
      new NodeFfmpegCutMediaAdapter(entry.workspacePath);
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
            ? parseSubtitleDurationSeconds(await this.options.host.files.readText(source.filePath))
            : await adapter
                .probe({ workspaceRelativePath: source.workspaceRelativePath })
                .then((probe) => {
                  if (
                    (track.kind === 'Video' && !probe.hasVideo) ||
                    (track.kind === 'Audio' && !probe.hasAudio)
                  ) {
                    throw new Error(
                      `Desktop Cut media is incompatible with target ${track.kind} Track.`,
                    );
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
        expectedRevision,
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
    entry: DesktopCutRuntimeEntry,
    snapshot: CutHostRuntimeSnapshot = this.projectSnapshot(entry),
  ): void {
    entry.sequence += 1;
    const event: CutHostRuntimeProjectionEvent = {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      sequence: entry.sequence,
      snapshot,
    };
    for (const listener of entry.listeners) listener(event);
  }

  private completePreviewRequest(
    entry: DesktopCutRuntimeEntry,
    commandId: string,
    event: CutPreviewRuntimeEvent,
  ): CutHostRuntimeResult {
    const message = this.authorizePreviewEvent(entry, event);
    const result: CutHostRuntimeResult = {
      schemaVersion: CUT_HOST_RUNTIME_VERSION,
      snapshot: this.projectSnapshot(entry),
      output: { type: 'preview', message },
    };
    entry.completedCommands.set(commandId, result);
    return result;
  }

  private authorizePreviewEvent(
    entry: DesktopCutRuntimeEntry,
    event: CutPreviewRuntimeEvent,
  ): CutHostPreviewMessage {
    if (event.type === 'cut:preview-activated') return event;
    const webContentsId = this.options.resolveWebContentsId(entry.identity.windowId);
    const video = event.video
      ? {
          ...event.video,
          transport: 'authorized' as const,
          url: this.authorizeUpstreamMedia(entry, {
            webContentsId,
            generation: event.generation,
            upstreamUrl: event.video.url,
            mediaType: event.video.mimeType,
            displayName: 'preview.mp4',
          }),
        }
      : undefined;
    const audioStreams = event.audioStreams.map((stream, index) => ({
      ...stream,
      transport: 'authorized' as const,
      streamUrl: this.authorizeUpstreamMedia(entry, {
        webContentsId,
        generation: event.generation,
        upstreamUrl: stream.streamUrl,
        mediaType: 'application/octet-stream',
        displayName: `audio-${index}.pcm`,
      }),
    }));
    return {
      ...event,
      ...(video ? { video } : {}),
      audioStreams,
    };
  }

  private authorizeUpstreamMedia(
    entry: DesktopCutRuntimeEntry,
    input: {
      readonly webContentsId: number;
      readonly generation: number;
      readonly upstreamUrl: string;
      readonly mediaType: string;
      readonly displayName: string;
    },
  ): string {
    const descriptorId = this.options.mediaRegistry.registerUpstream({
      webContentsId: input.webContentsId,
      windowId: entry.identity.windowId,
      viewId: entry.identity.viewId,
      sessionId: entry.identity.sessionId,
      revision: `preview:${input.generation}`,
      upstreamUrl: input.upstreamUrl,
      mediaType: input.mediaType,
    });
    return `neko-media://desktop/${encodeURIComponent(descriptorId)}/${encodeURIComponent(
      input.displayName,
    )}`;
  }

  private scheduleDisposal(entry: DesktopCutRuntimeEntry): void {
    this.options.mediaRegistry.releaseSession(entry.identity.sessionId);
    const disposal = entry.preview.dispose();
    this.pendingDisposals.add(disposal);
    void disposal.catch(() => undefined);
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Cut runtime is disposed.');
  }
}

function createCutDocumentStorage(host: NekoHostPorts, documentPath: string): CutDocumentStorage {
  return {
    async read(documentUri) {
      if (!documentUri.toLocaleLowerCase().endsWith('.otio')) {
        throw new Error('Desktop Cut storage only accepts OTIO documents.');
      }
      return {
        bytes: await host.files.readBytes(documentPath),
        version: await readFileVersion(host, documentPath),
      };
    },
    async write(documentUri, bytes, options) {
      if (!documentUri.toLocaleLowerCase().endsWith('.otio')) {
        throw new Error('Desktop Cut storage only accepts OTIO documents.');
      }
      if (
        options.expectedVersion !== undefined &&
        (await readFileVersion(host, documentPath)) !== options.expectedVersion
      ) {
        throw new Error('Desktop Cut document changed outside the current session.');
      }
      const temporaryPath = `${documentPath}.${randomUUID()}.tmp`;
      try {
        await host.files.writeBytes(temporaryPath, bytes);
        await host.files.rename(temporaryPath, documentPath);
      } catch (error) {
        await host.files.delete(temporaryPath, { idempotent: true }).catch(() => undefined);
        throw error;
      }
      return { version: await readFileVersion(host, documentPath) };
    },
  };
}

async function readFileVersion(host: NekoHostPorts, documentPath: string): Promise<string> {
  const stat = await host.files.stat(documentPath);
  if (stat.type !== 'file') throw new Error('Desktop Cut document is not a file.');
  return `${stat.modifiedAtMs ?? 0}:${stat.sizeBytes ?? 0}`;
}

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
  if (!isCutCommand(value)) throw new Error('Desktop Cut command payload is invalid.');
  return value;
}

function requireCutCommandBatch(value: unknown): readonly CutCommand[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isCutCommand)) {
    throw new Error('Desktop Cut command batch payload is invalid.');
  }
  return value;
}

function requireMediaSelectPayload(value: unknown): {
  readonly trackId: string;
  readonly timelineStartFrames: number;
  readonly overlapPolicy: 'reject' | 'insert';
} {
  const record = requireObject(value, 'Desktop Cut media selection payload is invalid.');
  if (record['type'] !== 'cut:select-link-media') {
    throw new Error('Desktop Cut media selection type is invalid.');
  }
  return readMediaPlacement(record);
}

function requireMediaDropPayload(value: unknown): {
  readonly trackId: string;
  readonly timelineStartFrames: number;
  readonly overlapPolicy: 'reject' | 'insert';
  readonly uris: readonly string[];
} {
  const record = requireObject(value, 'Desktop Cut media drop payload is invalid.');
  if (record['type'] !== 'cut:drop-link-media') {
    throw new Error('Desktop Cut media drop type is invalid.');
  }
  const uris = record['uris'];
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    !uris.every((uri): uri is string => typeof uri === 'string')
  ) {
    throw new Error('Desktop Cut media drop requires at least one local file URI.');
  }
  return { ...readMediaPlacement(record), uris };
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
    throw new Error(
      'Desktop Cut media placement requires a Track, timeline frame and overlap policy.',
    );
  }
  return { trackId, timelineStartFrames, overlapPolicy };
}

function requireLocalFileUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('Desktop Cut dropped media URI is invalid.', { cause: error });
  }
  if (url.protocol !== 'file:') {
    throw new Error('Desktop Cut dropped media must use a local file URI.');
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
    throw new Error('Desktop Cut subtitle contains no valid SRT/VTT timestamp.');
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
    throw new Error('Desktop Cut representation request payload is invalid.');
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
    throw new Error('Desktop Cut export start payload is invalid.');
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
    throw new Error('Desktop Cut export cancellation payload is invalid.');
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
    throw new Error(`Desktop Cut export target must be a workspace-relative .${container} path.`);
  }
}

function requirePreviewStartPayload(value: unknown): {
  readonly timelineTimeSeconds: number;
  readonly generation: number;
  readonly retainedVideoClipId?: string;
  readonly includeAudio?: boolean;
} {
  const record = requirePreviewPayload(value, 'cut:preview-start');
  const retainedVideoClipId = record['retainedVideoClipId'];
  if (retainedVideoClipId !== undefined && typeof retainedVideoClipId !== 'string') {
    throw new Error('Desktop Cut retained Video Clip identity is invalid.');
  }
  return {
    timelineTimeSeconds: requireNonNegativeFinite(
      record['timelineTimeSeconds'],
      'Desktop Cut preview time is invalid.',
    ),
    generation: requirePositiveInteger(
      record['generation'],
      'Desktop Cut preview generation is invalid.',
    ),
    ...(retainedVideoClipId ? { retainedVideoClipId } : {}),
    ...(record['playbackMode'] === 'paused' ? { includeAudio: false } : {}),
  };
}

function requirePreviewPreparePayload(value: unknown): {
  readonly timelineTimeSeconds: number;
  readonly generation: number;
} {
  const record = requirePreviewPayload(value, 'cut:preview-prepare');
  return {
    timelineTimeSeconds: requireNonNegativeFinite(
      record['timelineTimeSeconds'],
      'Desktop Cut preview time is invalid.',
    ),
    generation: requirePositiveInteger(
      record['generation'],
      'Desktop Cut preview generation is invalid.',
    ),
  };
}

function requirePreviewGenerationPayload(
  value: unknown,
  type: 'cut:preview-activate' | 'cut:preview-stop',
): { readonly generation: number } {
  const record = requirePreviewPayload(value, type);
  return {
    generation: requirePositiveInteger(
      record['generation'],
      'Desktop Cut preview generation is invalid.',
    ),
  };
}

function requirePreviewPausePayload(value: unknown): {
  readonly generation: number;
  readonly preparedGeneration?: number;
} {
  const record = requirePreviewPayload(value, 'cut:preview-pause');
  const preparedGeneration = record['preparedGeneration'];
  return {
    generation: requirePositiveInteger(
      record['generation'],
      'Desktop Cut preview generation is invalid.',
    ),
    ...(preparedGeneration === undefined
      ? {}
      : {
          preparedGeneration: requirePositiveInteger(
            preparedGeneration,
            'Desktop Cut prepared preview generation is invalid.',
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
    throw new Error(`Desktop Cut ${expectedType} payload is invalid.`);
  }
  return value as Record<string, unknown>;
}

function requireNonNegativeFinite(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(message);
  return value as number;
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
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
  ].join(':');
}
