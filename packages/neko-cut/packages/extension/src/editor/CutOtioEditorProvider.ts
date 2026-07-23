import * as vscode from 'vscode';
import * as nodePath from 'node:path';
import {
  CutDocumentSession,
  type CutExportTaskSnapshot,
  createOtioTimeline,
  parseOtio,
  serializeOtio,
  type CutCommand,
  type CutRouteAppendItem,
  type TimelineView,
} from '@neko-cut/domain';
import type {
  CutRouteHandoffItem,
  CutRouteHandoffRequest,
  CutRouteHandoffResult,
} from '@neko/shared';
import {
  createDefaultLocalResourceAccessService,
  injectLocaleAttribute,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import { CutOtioDocument, VSCodeCutDocumentStorage } from './CutOtioDocument';
import { generateClipRepresentations, readClipRepresentationRequests } from './clipRepresentations';
import { resolvePreviewSelection } from './previewSelection';
import { executeCutWorkbenchHistory } from './cutHistory';
import { CutExportTaskRegistry } from './CutExportTaskRegistry';
import { PreviewStopCoordinator } from './PreviewStopCoordinator';
import { CutWorkspaceMediaImporter } from '../services/CutWorkspaceMediaImporter';
import { CutWorkspaceMediaPaths } from '../services/CutWorkspaceMediaPaths';
import { EngineConnection } from '../services/EngineConnection';
import { NekoEngineCutMediaAdapter } from '../services/NekoEngineCutMediaAdapter';
import { handleError } from '../base';
import { projectCutAgentContext, type CutAgentSelection } from './cutAgentContext';
import { buildDuplicateClipCommands, buildPasteClipCommands } from './cutClipboardCommands';
import {
  createCutDocumentStatusSnapshot,
  type CutDocumentStatusSnapshot,
} from '../views/cutDocumentStatusProjection';

export interface CutOtioEditorHostEvents {
  readonly onExportTaskUpdate: (task: CutExportTaskSnapshot) => void;
  readonly onDocumentStatusUpdate: (snapshot: CutDocumentStatusSnapshot | undefined) => void;
}

export class CutOtioEditorProvider implements vscode.CustomEditorProvider<CutOtioDocument> {
  private readonly changeEmitter = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<CutOtioDocument>
  >();
  readonly onDidChangeCustomDocument = this.changeEmitter.event;
  private readonly panels = new Map<CutOtioDocument, Set<vscode.WebviewPanel>>();
  private readonly previewSessions = new Map<
    vscode.WebviewPanel,
    { readonly videoSessionId?: string; readonly pcmSessionIds: readonly string[] }
  >();
  private readonly previewStops = new PreviewStopCoordinator<vscode.WebviewPanel>();
  private readonly representationRequests = new Map<vscode.WebviewPanel, AbortController>();
  private readonly documents = new Map<string, CutOtioDocument>();
  private readonly storage = new VSCodeCutDocumentStorage();
  private readonly engineConnection = new EngineConnection();
  private readonly exportTasks: CutExportTaskRegistry;
  private readonly localResourceAccess: LocalResourceAccessService;
  private activePanel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly hostEvents: CutOtioEditorHostEvents,
  ) {
    this.localResourceAccess = createDefaultLocalResourceAccessService({
      extensionUri: context.extensionUri,
      extensionAssetSegments: ['dist', 'webview'],
    });
    this.exportTasks = new CutExportTaskRegistry((task) => {
      hostEvents.onExportTaskUpdate(task);
      void this.broadcastExportTask(task).catch((error: unknown) => {
        void handleError(
          new Error(
            `Failed to publish Cut export status: ${error instanceof Error ? error.message : String(error)}`,
          ),
          { showToUser: true },
        );
      });
    });
  }

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
  ): Promise<CutOtioDocument> {
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspace) throw new Error('Cut OTIO documents must be inside an open workspace.');
    const options = sessionOptions(this.storage);
    let session: CutDocumentSession;
    if (openContext.backupId) {
      const backup = await this.storage.read(openContext.backupId);
      const parsed = parseOtio(backup.bytes);
      if (!parsed.ok) throw new Error('Cut backup contains invalid OTIO bytes.');
      session = CutDocumentSession.create(uri.toString(), parsed.document, options);
    } else {
      session = await CutDocumentSession.open(uri.toString(), options);
    }
    const document = new CutOtioDocument(
      session,
      new NekoEngineCutMediaAdapter(workspace.uri.fsPath, this.engineConnection),
    );
    this.documents.set(uri.toString(), document);
    document.onDidDispose(() => {
      for (const [documentUri, candidate] of this.documents) {
        if (candidate === document) this.documents.delete(documentUri);
      }
    });
    return document;
  }

  async handoffRoute(request: CutRouteHandoffRequest): Promise<CutRouteHandoffResult> {
    if (request.items.length === 0) throw new Error('Canvas route handoff is empty.');
    if (request.target.kind === 'append') {
      const document = this.documents.get(request.target.documentUri);
      if (!document) {
        throw new Error('Explicit Cut append target must be open in this VS Code window.');
      }
      if (document.session.revision !== request.target.expectedRevision) {
        throw new Error(
          `Cut target revision is stale: expected ${request.target.expectedRevision}, current ${document.session.revision}.`,
        );
      }
      const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspace) throw new Error('Cut target must be inside an open workspace.');
      const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
      const rate = editRateOf(document.session.view());
      const items = await prepareRouteItems(paths, document.uri.fsPath, request.items, rate);
      await this.applyCommand(
        document,
        {
          documentUri: document.session.documentUri,
          sessionId: document.session.sessionId,
          expectedRevision: request.target.expectedRevision,
        },
        { type: 'append-route', items },
      );
      return {
        documentUri: document.session.documentUri,
        revision: document.session.revision,
        created: false,
      };
    }

    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) throw new Error('Open a workspace before creating a Cut target.');
    const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
    const configuredRoot = vscode.workspace
      .getConfiguration('neko.cut')
      .get<string>('defaultProjectRoot', 'projects/cut');
    const target = vscode.Uri.file(
      paths.resolveDefaultProjectPath(configuredRoot, request.target.projectName),
    );
    await assertTargetDoesNotExist(target);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(nodePath.dirname(target.fsPath)));
    const timeline = createOtioTimeline(request.target.projectName.replace(/\.otio$/i, ''), {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    });
    const session = CutDocumentSession.create(
      target.toString(),
      timeline,
      sessionOptions(this.storage),
    );
    const items = await prepareRouteItems(paths, target.fsPath, request.items, 30);
    session.apply({
      documentUri: session.documentUri,
      sessionId: session.sessionId,
      expectedRevision: 0,
      command: { type: 'append-route', items },
    });
    await session.save();
    await vscode.commands.executeCommand('vscode.openWith', target, 'neko.cut.otioEditor');
    return { documentUri: target.toString(), revision: 0, created: true };
  }

  async resolveCustomEditor(document: CutOtioDocument, panel: vscode.WebviewPanel): Promise<void> {
    await this.localResourceAccess.configureWebview(panel.webview, { enableScripts: true });
    panel.webview.html = this.html(panel.webview, document.uri);
    const documentPanels = this.panels.get(document) ?? new Set<vscode.WebviewPanel>();
    documentPanels.add(panel);
    this.panels.set(document, documentPanels);
    const viewStateSubscription = panel.onDidChangeViewState(() => {
      if (panel.active) {
        this.activePanel = panel;
        this.publishDocumentStatus(document);
      } else if (this.activePanel === panel) {
        this.activePanel = undefined;
        this.hostEvents.onDocumentStatusUpdate(undefined);
      }
    });
    if (panel.active) {
      this.activePanel = panel;
      this.publishDocumentStatus(document);
    }
    panel.onDidDispose(() => {
      viewStateSubscription.dispose();
      this.representationRequests.get(panel)?.abort();
      this.representationRequests.delete(panel);
      documentPanels.delete(panel);
      if (documentPanels.size === 0) this.panels.delete(document);
      if (this.activePanel === panel) {
        this.activePanel = undefined;
        this.hostEvents.onDocumentStatusUpdate(undefined);
      }
      void this.stopPanelPreview(document, panel).catch((error: unknown) => {
        void handleError(
          new Error(
            `Failed to stop Cut preview: ${error instanceof Error ? error.message : String(error)}`,
          ),
          { showToUser: true },
        );
      });
    });
    panel.webview.onDidReceiveMessage((message: unknown) =>
      this.handleMessage(document, panel, message),
    );
  }

  async saveCustomDocument(document: CutOtioDocument): Promise<void> {
    await document.session.save();
    this.publishDocumentStatusIfActive(document);
  }

  async saveCustomDocumentAs(document: CutOtioDocument, destination: vscode.Uri): Promise<void> {
    const workspace = vscode.workspace.getWorkspaceFolder(destination);
    if (!workspace) throw new Error('Save As destination must be inside an open workspace.');
    const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
    const previousDocumentUri = document.session.documentUri;
    await document.session.saveAs({
      documentUri: destination.toString(),
      rebase: (timeline, oldUri, newUri) =>
        paths.rebaseDocument(
          timeline,
          vscode.Uri.parse(oldUri).fsPath,
          vscode.Uri.parse(newUri).fsPath,
        ),
    });
    this.documents.delete(previousDocumentUri);
    this.documents.set(document.session.documentUri, document);
    await this.broadcast(document);
  }

  async revertCustomDocument(document: CutOtioDocument): Promise<void> {
    await this.stopDocumentPreviews(document);
    await document.session.revert();
    await this.broadcast(document);
  }

  async backupCustomDocument(
    document: CutOtioDocument,
    context: vscode.CustomDocumentBackupContext,
  ): Promise<vscode.CustomDocumentBackup> {
    await document.session.backup(context.destination.toString());
    return {
      id: context.destination.toString(),
      delete: () => vscode.workspace.fs.delete(context.destination, { useTrash: false }),
    };
  }

  private async handleMessage(
    document: CutOtioDocument,
    panel: vscode.WebviewPanel,
    value: unknown,
  ): Promise<void> {
    let clientMutationId: string | undefined;
    let mutationSucceeded = true;
    try {
      if (!isRecord(value) || typeof value['type'] !== 'string') {
        throw new Error('Invalid Cut Webview message.');
      }
      clientMutationId =
        typeof value['clientMutationId'] === 'string' ? value['clientMutationId'] : undefined;
      if (isCutMutationIntentType(value['type']) && !clientMutationId) {
        throw new Error(`Cut mutation ${value['type']} requires a clientMutationId.`);
      }
      if (value['type'] === 'cut:ready') {
        await this.postView(panel, document.session.view());
        await this.postExportTasks(panel, document.session.documentUri);
        return;
      }
      const identity = readIdentity(value);
      if (value['type'] === 'cut:preview-start') {
        if (typeof value['timelineTimeSeconds'] !== 'number') {
          throw new Error('Invalid Cut preview intent.');
        }
        assertCurrentIdentity(document.session.view(), identity);
        await this.startPanelPreview(document, panel, value['timelineTimeSeconds']);
        return;
      }
      if (value['type'] === 'cut:preview-stop') {
        assertCurrentIdentity(document.session.view(), identity);
        await this.stopPanelPreview(document, panel);
        return;
      }
      if (value['type'] === 'cut:request-representations') {
        if (!isCurrentIdentity(document.session.view(), identity)) return;
        const requests = readClipRepresentationRequests(value['requests']);
        const previous = this.representationRequests.get(panel);
        previous?.abort();
        const controller = new AbortController();
        this.representationRequests.set(panel, controller);
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspace) throw new Error('Cut document workspace is unavailable.');
        const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
        const requestedView = document.session.view();
        try {
          const results = await generateClipRepresentations({
            view: requestedView,
            requests,
            ports: document.mediaAdapter,
            signal: controller.signal,
            resolveSource: async (targetUrl) => {
              const source = await paths.resolveTarget(document.uri.fsPath, targetUrl);
              if (source.status !== 'available') {
                throw new Error(`Cannot derive presentation for missing media: ${targetUrl}`);
              }
              return { workspaceRelativePath: source.workspaceRelativePath };
            },
          });
          if (controller.signal.aborted) return;
          const currentView = document.session.view();
          if (
            currentView.documentUri !== requestedView.documentUri ||
            currentView.sessionId !== requestedView.sessionId ||
            currentView.revision !== requestedView.revision
          ) {
            return;
          }
          await panel.webview.postMessage({
            type: 'cut:representations',
            documentUri: requestedView.documentUri,
            sessionId: requestedView.sessionId,
            revision: requestedView.revision,
            results,
          });
        } finally {
          if (this.representationRequests.get(panel) === controller) {
            this.representationRequests.delete(panel);
          }
        }
        return;
      }
      if (value['type'] === 'cut:export-query') {
        assertCurrentIdentity(document.session.view(), identity);
        await this.postExportTasks(panel, document.session.documentUri);
        return;
      }
      if (value['type'] === 'cut:export-cancel') {
        assertCurrentIdentity(document.session.view(), identity);
        if (typeof value['jobId'] !== 'string') {
          throw new Error('Cut export cancellation requires an explicit jobId.');
        }
        this.exportTasks.cancel(document.session.documentUri, value['jobId']);
        return;
      }
      if (value['type'] === 'cut:export-start') {
        assertCurrentIdentity(document.session.view(), identity);
        await this.stopDocumentPreviews(document);
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspace) throw new Error('Cut document workspace is unavailable.');
        const destination = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(workspace.uri, `${document.session.view().name}.mp4`),
          filters: { 'MPEG-4 Video': ['mp4'] },
          saveLabel: 'Export Cut media',
        });
        if (!destination) return;
        if (
          vscode.workspace.getWorkspaceFolder(destination)?.uri.toString() !==
          workspace.uri.toString()
        ) {
          throw new Error('Cut export output must remain inside the document workspace.');
        }
        const outputWorkspaceRelativePath = nodePath
          .relative(workspace.uri.fsPath, destination.fsPath)
          .split(nodePath.sep)
          .join('/');
        const sourceView = document.session.view();
        this.exportTasks.start({
          documentUri: sourceView.documentUri,
          sessionId: sourceView.sessionId,
          sourceRevision: sourceView.revision,
          outputWorkspaceRelativePath,
          run: async (signal) => {
            await document.mediaAdapter.export(sourceView, outputWorkspaceRelativePath, signal);
          },
        });
        return;
      }
      if (value['type'] === 'cut:undo') {
        assertCurrentIdentity(document.session.view(), identity);
        await this.stopDocumentPreviews(document);
        await executeCutWorkbenchHistory({
          direction: 'undo',
          panelActive: panel.active,
          execute: (command) => vscode.commands.executeCommand(command),
        });
        return;
      }
      if (value['type'] === 'cut:redo') {
        assertCurrentIdentity(document.session.view(), identity);
        await this.stopDocumentPreviews(document);
        await executeCutWorkbenchHistory({
          direction: 'redo',
          panelActive: panel.active,
          execute: (command) => vscode.commands.executeCommand(command),
        });
        return;
      }
      if (value['type'] === 'cut:add-track') {
        const trackKind = value['trackKind'];
        if (trackKind !== 'Audio' && trackKind !== 'Subtitle') {
          throw new Error('Cut can add only Audio or Subtitle Tracks.');
        }
        const count = document.session
          .view()
          .tracks.filter((track) => track.kind === trackKind).length;
        await this.applyCommand(document, identity, {
          type: 'add-track',
          trackId: `track-${randomId()}`,
          trackKind,
          name: `${trackKind} ${count + 1}`,
        });
        return;
      }
      if (value['type'] === 'cut:select-link-media') {
        if (typeof value['trackId'] !== 'string') {
          throw new Error('Link media requires a target trackId.');
        }
        const targetTrack = document.session
          .view()
          .tracks.find((track) => track.trackId === value['trackId']);
        if (!targetTrack) throw new Error(`Target Track ${value['trackId']} is unavailable.`);
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspace) throw new Error('Cut document workspace is unavailable.');
        const selected = await vscode.window.showOpenDialog({
          defaultUri: workspace.uri,
          canSelectMany: false,
          canSelectFiles: true,
          canSelectFolders: false,
          title: `Link ${targetTrack.kind.toLowerCase()} to ${targetTrack.name}`,
          filters:
            targetTrack.kind === 'Subtitle'
              ? { Subtitles: ['srt', 'vtt'] }
              : targetTrack.kind === 'Audio'
                ? { Audio: ['wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'mp4', 'mov'] }
                : { Video: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] },
        });
        const mediaUri = selected?.[0];
        if (!mediaUri) return;
        await this.linkMediaUri(document, identity, targetTrack.trackId, mediaUri);
        return;
      }
      if (value['type'] === 'cut:drop-link-media') {
        if (
          typeof value['trackId'] !== 'string' ||
          !Array.isArray(value['uris']) ||
          value['uris'].length === 0 ||
          !value['uris'].every((uri) => typeof uri === 'string')
        ) {
          throw new Error('Dropped media requires one or more URIs and a target trackId.');
        }
        let currentIdentity = identity;
        for (const uri of value['uris']) {
          const mediaUri = vscode.Uri.parse(uri, true);
          if (mediaUri.scheme !== 'file') {
            throw new Error('Dropped Cut media must use local file URIs.');
          }
          await this.linkMediaUri(document, currentIdentity, value['trackId'], mediaUri);
          currentIdentity = {
            documentUri: document.session.documentUri,
            sessionId: document.session.sessionId,
            expectedRevision: document.session.revision,
          };
        }
        return;
      }
      if (value['type'] === 'cut:split') {
        if (typeof value['clipId'] !== 'string' || typeof value['offsetFrames'] !== 'number') {
          throw new Error('Invalid Cut split intent.');
        }
        await this.applyCommand(document, identity, {
          type: 'split',
          clipId: value['clipId'],
          offsetFrames: value['offsetFrames'],
          rightClipId: `clip-${randomId()}`,
        });
        return;
      }
      if (value['type'] === 'cut:paste') {
        const source = value['source'];
        const timelineStartSeconds = value['timelineStartSeconds'];
        if (
          !isRecord(source) ||
          source['documentUri'] !== identity.documentUri ||
          source['sessionId'] !== identity.sessionId ||
          typeof timelineStartSeconds !== 'number' ||
          !Number.isFinite(timelineStartSeconds) ||
          timelineStartSeconds < 0
        ) {
          throw new Error('Cut clipboard belongs to a different document session.');
        }
        if (source['kind'] === 'clips' && Array.isArray(source['clips'])) {
          const commands = buildPasteClipCommands(
            document.session.view(),
            source['clips'],
            timelineStartSeconds,
            () => `clip-${randomId()}`,
          );
          await this.applyCommands(document, identity, commands, 'paste-clips');
          return;
        }
        if (source['kind'] === 'track' && typeof source['trackId'] === 'string') {
          const track = document.session
            .view()
            .tracks.find((candidate) => candidate.trackId === source['trackId']);
          if (!track) throw new Error(`Clipboard Track ${source['trackId']} is unavailable.`);
          await this.applyCommand(document, identity, {
            type: 'duplicate-track',
            trackId: track.trackId,
            duplicateTrackId: `track-${randomId()}`,
            duplicateClipIds: track.items.flatMap((item) =>
              item.kind === 'clip' ? [`clip-${randomId()}`] : [],
            ),
          });
          return;
        }
        throw new Error('Cut clipboard payload is invalid.');
      }
      if (value['type'] === 'cut:duplicate') {
        if (
          !Array.isArray(value['clipIds']) ||
          value['clipIds'].length === 0 ||
          !value['clipIds'].every((clipId) => typeof clipId === 'string')
        ) {
          throw new Error('Invalid Cut duplicate intent.');
        }
        await this.applyCommands(
          document,
          identity,
          buildDuplicateClipCommands(
            document.session.view(),
            value['clipIds'],
            () => `clip-${randomId()}`,
          ),
          'duplicate-clips',
        );
        return;
      }
      if (value['type'] === 'cut:batch') {
        if (!Array.isArray(value['commands']) || value['commands'].length === 0) {
          throw new Error('Cut batch requires one or more commands.');
        }
        await this.applyCommands(
          document,
          identity,
          value['commands'].map((command) => readCommand(command)),
          'batch',
        );
        return;
      }
      if (value['type'] === 'cut:send-to-agent') {
        const selection = readAgentSelection(value['selection']);
        assertCurrentIdentity(document.session.view(), identity);
        const payload = projectCutAgentContext(document.session.view(), selection);
        await vscode.commands.executeCommand('neko.agent.sendContext', payload);
        return;
      }
      if (value['type'] === 'cut:separate') {
        if (typeof value['videoClipId'] !== 'string') throw new Error('Invalid separation intent.');
        await this.assertCanSeparate(document, value['videoClipId']);
        await this.applyCommand(document, identity, {
          type: 'separate-audio',
          videoClipId: value['videoClipId'],
          audioClipId: `clip-${randomId()}`,
          audioTrackId:
            document.session.view().tracks.find((track) => track.kind === 'Audio')?.trackId ??
            `track-${randomId()}`,
        });
        return;
      }
      if (value['type'] !== 'cut:command') throw new Error(`Unknown Cut message: ${value['type']}`);
      const command = readCommand(value['command']);
      if (command.type === 'separate-audio') {
        await this.assertCanSeparate(document, command.videoClipId);
      }
      await this.applyCommand(document, identity, command);
    } catch (error) {
      mutationSucceeded = false;
      await panel.webview.postMessage({
        type: 'cut:error',
        message: error instanceof Error ? error.message : String(error),
        ...(clientMutationId ? { clientMutationId } : {}),
      });
    } finally {
      if (clientMutationId) {
        await panel.webview.postMessage({
          type: 'cut:mutation-result',
          clientMutationId,
          succeeded: mutationSucceeded,
          revision: document.session.revision,
        });
      }
    }
  }

  private async applyCommand(
    document: CutOtioDocument,
    identity: {
      readonly documentUri: string;
      readonly sessionId: string;
      readonly expectedRevision: number;
    },
    command: CutCommand,
  ): Promise<void> {
    await this.applyCommands(document, identity, [command], command.type);
  }

  private async applyCommands(
    document: CutOtioDocument,
    identity: {
      readonly documentUri: string;
      readonly sessionId: string;
      readonly expectedRevision: number;
    },
    commands: readonly CutCommand[],
    label: string,
  ): Promise<void> {
    this.abortDocumentRepresentations(document);
    await this.stopDocumentPreviews(document);
    const previousRevision = document.session.revision;
    document.session.applyBatch({ ...identity, commands });
    this.changeEmitter.fire({
      document,
      label,
      undo: async () => {
        document.session.undo({
          documentUri: document.session.documentUri,
          sessionId: document.session.sessionId,
          expectedRevision: document.session.revision,
        });
        await this.broadcast(document);
      },
      redo: async () => {
        document.session.redo({
          documentUri: document.session.documentUri,
          sessionId: document.session.sessionId,
          expectedRevision: document.session.revision,
        });
        await this.broadcast(document);
      },
    });
    if (document.session.revision !== previousRevision + 1) {
      throw new Error('Cut command did not advance exactly one revision.');
    }
    await this.broadcast(document);
  }

  private async postExportTasks(panel: vscode.WebviewPanel, documentUri: string): Promise<void> {
    await panel.webview.postMessage({
      type: 'cut:export-tasks',
      documentUri,
      tasks: this.exportTasks.list(documentUri),
    });
  }

  private async broadcastExportTask(task: CutExportTaskSnapshot): Promise<void> {
    const deliveries: Thenable<boolean>[] = [];
    for (const [document, panels] of this.panels) {
      if (document.session.documentUri !== task.documentUri) continue;
      for (const panel of panels) {
        deliveries.push(panel.webview.postMessage({ type: 'cut:export-task', task }));
      }
    }
    await Promise.all(deliveries);
  }

  private abortDocumentRepresentations(document: CutOtioDocument): void {
    for (const panel of this.panels.get(document) ?? []) {
      this.representationRequests.get(panel)?.abort();
      this.representationRequests.delete(panel);
    }
  }

  private async assertCanSeparate(document: CutOtioDocument, videoClipId: string): Promise<void> {
    const view = document.session.view();
    const clip = view.tracks
      .flatMap((track) => track.items)
      .find((item) => item.kind === 'clip' && item.clipId === videoClipId);
    if (!clip || clip.kind !== 'clip') throw new Error('Video Clip is unavailable.');
    const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspace) throw new Error('Cut document workspace is unavailable.');
    const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
    const source = await paths.resolveTarget(document.uri.fsPath, clip.targetUrl);
    if (source.status !== 'available') throw new Error('Cannot separate audio from missing media.');
    const probe = await document.mediaAdapter.probe({
      workspaceRelativePath: source.workspaceRelativePath,
    });
    if (!probe.hasAudio) throw new Error('Selected Video Clip has no usable audio stream.');
  }

  private async linkMediaUri(
    document: CutOtioDocument,
    identity: ReturnType<typeof readIdentity>,
    trackId: string,
    mediaUri: vscode.Uri,
  ): Promise<void> {
    assertCurrentIdentity(document.session.view(), identity);
    const targetTrack = document.session.view().tracks.find((track) => track.trackId === trackId);
    if (!targetTrack) throw new Error(`Target Track ${trackId} is unavailable.`);
    const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspace) throw new Error('Cut document workspace is unavailable.');
    const importer = await CutWorkspaceMediaImporter.create(workspace.uri.fsPath);
    const prepared = await importer.prepare(document.uri.fsPath, mediaUri.fsPath);
    const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
    const clipId = `clip-${randomId()}`;
    try {
      const targetUrl = await paths.linkMedia(document.uri.fsPath, prepared.workspaceRelativePath);
      const profile = document.session.view().profile;
      const rate = profile ? profile.editRateNumerator / profile.editRateDenominator : 30;
      const durationSeconds =
        targetTrack.kind === 'Subtitle'
          ? await readSubtitleDurationSeconds(vscode.Uri.file(prepared.filePath))
          : await this.probeCompatibleDuration(
              document,
              prepared.workspaceRelativePath,
              targetTrack.kind,
            );
      const durationFrames = Math.max(1, Math.round(durationSeconds * rate));
      await this.applyCommand(document, identity, {
        type: 'link-media',
        clipId,
        name: nodePath.basename(prepared.filePath),
        targetUrl,
        durationFrames,
        availableDurationFrames: durationFrames,
        rate,
        trackId: targetTrack.trackId,
      });
    } catch (error) {
      const committed = document.session
        .view()
        .tracks.some((track) =>
          track.items.some((item) => item.kind === 'clip' && item.clipId === clipId),
        );
      if (!committed) {
        try {
          await importer.discard(prepared);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Cut media link failed and the uncommitted imported copy could not be removed.',
          );
        }
      }
      throw error;
    }
  }

  private async probeCompatibleDuration(
    document: CutOtioDocument,
    workspaceRelativePath: string,
    trackKind: 'Video' | 'Audio',
  ): Promise<number> {
    const probe = await document.mediaAdapter.probe({ workspaceRelativePath });
    if (trackKind === 'Video' && !probe.hasVideo) {
      throw new Error('Selected media does not contain a usable video stream.');
    }
    if (trackKind === 'Audio' && !probe.hasAudio) {
      throw new Error('Selected media does not contain a usable audio stream.');
    }
    return probe.durationSeconds;
  }

  private async startPanelPreview(
    document: CutOtioDocument,
    panel: vscode.WebviewPanel,
    timelineTime: number,
  ): Promise<void> {
    const view = document.session.view();
    const selection = resolvePreviewSelection(view, timelineTime);
    const videoClip = selection.videoClip;
    const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspace) throw new Error('Cut document workspace is unavailable.');
    const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
    await this.stopPanelPreview(document, panel);
    let preview:
      | {
          readonly sessionId: string;
          readonly videoStreamUrl?: string;
          readonly audioStreamUrl?: string;
        }
      | undefined;
    let videoProbe:
      | {
          readonly width: number;
          readonly height: number;
          readonly framesPerSecond: number;
        }
      | undefined;
    if (videoClip) {
      const source = await paths.resolveTarget(document.uri.fsPath, videoClip.targetUrl);
      if (source.status !== 'available') throw new Error('Cannot preview missing media.');
      videoProbe = await document.mediaAdapter.probe({
        workspaceRelativePath: source.workspaceRelativePath,
      });
      preview = await document.mediaAdapter.startPreview(
        { workspaceRelativePath: source.workspaceRelativePath },
        {
          startTimeSeconds:
            videoClip.sourceStartSeconds +
            Math.max(0, timelineTime - videoClip.startSeconds) * videoClip.playbackRate,
          includeAudio: !selection.videoAudioMuted && !videoClip.audio.muted,
          playbackRate: videoClip.playbackRate,
        },
      );
    }
    const pcmSessions: Array<{ readonly sessionId: string; readonly streamUrl: string }> = [];
    let registered = false;
    try {
      for (const audioClip of selection.audioClips) {
        const audioSource = await paths.resolveTarget(document.uri.fsPath, audioClip.targetUrl);
        if (audioSource.status !== 'available') {
          throw new Error(`Cannot preview missing audio media: ${audioClip.targetUrl}`);
        }
        pcmSessions.push(
          await document.mediaAdapter.startPcm(
            { workspaceRelativePath: audioSource.workspaceRelativePath },
            {
              startTimeSeconds:
                audioClip.sourceStartSeconds +
                Math.max(0, timelineTime - audioClip.startSeconds) * audioClip.playbackRate,
              playbackRate: audioClip.playbackRate,
            },
          ),
        );
      }
      this.previewSessions.set(panel, {
        ...(preview ? { videoSessionId: preview.sessionId } : {}),
        pcmSessionIds: pcmSessions.map((session) => session.sessionId),
      });
      registered = true;
      const audioStreamUrls = [
        ...(preview?.audioStreamUrl ? [preview.audioStreamUrl] : []),
        ...pcmSessions.map((session) => session.streamUrl),
      ];
      const audioGainsDb = [
        ...(preview?.audioStreamUrl && videoClip ? [videoClip.audio.gainDb] : []),
        ...selection.audioClips.map((clip) => clip.audio.gainDb),
      ];
      const profile = view.profile;
      const delivered = await panel.webview.postMessage({
        type: 'cut:preview-ready',
        ...(videoClip ? { videoClipId: videoClip.clipId } : {}),
        timelineTimeSeconds: selection.timelineTimeSeconds,
        segmentEndSeconds: selection.segmentEndSeconds,
        width: videoProbe?.width ?? profile?.width ?? 1920,
        height: videoProbe?.height ?? profile?.height ?? 1080,
        framesPerSecond:
          videoProbe?.framesPerSecond ??
          (profile ? profile.editRateNumerator / profile.editRateDenominator : 30),
        ...(preview?.videoStreamUrl ? { videoStreamUrl: preview.videoStreamUrl } : {}),
        audioStreamUrls,
        audioGainsDb,
      });
      if (!delivered) {
        throw new Error('Cut Webview did not accept the preview stream.');
      }
    } catch (error) {
      if (registered) {
        try {
          await this.stopPanelPreview(document, panel);
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'Cut preview failed and its streams could not be fully stopped.',
          );
        }
      } else {
        const cleanup = await Promise.allSettled([
          ...(preview ? [document.mediaAdapter.stopPreview(preview.sessionId)] : []),
          ...pcmSessions.map((session) => document.mediaAdapter.stopPcm(session.sessionId)),
        ]);
        const cleanupErrors = cleanup.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        );
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            'Cut preview failed and its partially started streams could not be fully stopped.',
          );
        }
      }
      throw error;
    }
  }

  private async stopPanelPreview(
    document: CutOtioDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    await this.previewStops.run(panel, () => this.stopPanelPreviewOnce(document, panel));
  }

  private async stopPanelPreviewOnce(
    document: CutOtioDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const sessions = this.previewSessions.get(panel);
    if (!sessions) return;
    const failures: unknown[] = [];
    const remainingPcmSessionIds: string[] = [];
    let remainingVideoSessionId = sessions.videoSessionId;
    if (sessions.videoSessionId) {
      try {
        await document.mediaAdapter.stopPreview(sessions.videoSessionId);
        remainingVideoSessionId = undefined;
      } catch (error) {
        failures.push(error);
      }
    }
    for (const sessionId of sessions.pcmSessionIds) {
      try {
        await document.mediaAdapter.stopPcm(sessionId);
      } catch (error) {
        failures.push(error);
        remainingPcmSessionIds.push(sessionId);
      }
    }
    if (failures.length === 0) {
      this.previewSessions.delete(panel);
      return;
    }
    this.previewSessions.set(panel, {
      ...(remainingVideoSessionId ? { videoSessionId: remainingVideoSessionId } : {}),
      pcmSessionIds: remainingPcmSessionIds,
    });
    throw new AggregateError(failures, 'One or more Cut preview streams could not be stopped.');
  }

  private async stopDocumentPreviews(document: CutOtioDocument): Promise<void> {
    const panels = [...(this.panels.get(document) ?? [])];
    await Promise.all(panels.map((panel) => this.stopPanelPreview(document, panel)));
  }

  private async broadcast(document: CutOtioDocument): Promise<void> {
    const view = document.session.view();
    await Promise.all(
      [...(this.panels.get(document) ?? [])].map((panel) => this.postView(panel, view)),
    );
    this.publishDocumentStatusIfActive(document);
  }

  private publishDocumentStatusIfActive(document: CutOtioDocument): void {
    if (!this.activePanel || !this.panels.get(document)?.has(this.activePanel)) return;
    this.publishDocumentStatus(document);
  }

  private publishDocumentStatus(document: CutOtioDocument): void {
    this.hostEvents.onDocumentStatusUpdate(
      createCutDocumentStatusSnapshot(document.session.view(), document.session.dirty),
    );
  }

  private postView(panel: vscode.WebviewPanel, view: TimelineView): Thenable<boolean> {
    return panel.webview.postMessage({ type: 'cut:view', view });
  }

  private html(webview: vscode.Webview, documentUri: vscode.Uri): string {
    const root = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );
    const nonce = randomId();
    return `<!DOCTYPE html><html ${injectLocaleAttribute()}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data: blob:; media-src ${webview.cspSource} data: blob:; connect-src ws://127.0.0.1:* http://127.0.0.1:*;"><title>Neko Cut</title><link rel="stylesheet" href="${root}/assets/style.css"></head><body><div id="root"></div><script nonce="${nonce}">window.documentUri=${JSON.stringify(documentUri.toString())};</script><script nonce="${nonce}" type="module" src="${root}/assets/index.js"></script></body></html>`;
  }
}

function isCutMutationIntentType(type: string): boolean {
  switch (type) {
    case 'cut:command':
    case 'cut:batch':
    case 'cut:undo':
    case 'cut:redo':
    case 'cut:add-track':
    case 'cut:select-link-media':
    case 'cut:drop-link-media':
    case 'cut:split':
    case 'cut:duplicate':
    case 'cut:paste':
    case 'cut:separate':
      return true;
    default:
      return false;
  }
}

export async function createNewOtioProject(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) throw new Error('Open a workspace before creating a Cut project.');
  const root = vscode.workspace
    .getConfiguration('neko.cut')
    .get<string>('defaultProjectRoot', 'projects/cut');
  const name = await vscode.window.showInputBox({ prompt: 'Cut project name', value: 'untitled' });
  if (!name) return;
  const paths = await CutWorkspaceMediaPaths.create(workspace.uri.fsPath);
  const target = vscode.Uri.file(paths.resolveDefaultProjectPath(root, name));
  const document = createOtioTimeline(name.replace(/\.otio$/i, ''), {
    profile: '1080p30',
    editRateNumerator: 30,
    editRateDenominator: 1,
    width: 1920,
    height: 1080,
  });
  const storage = new VSCodeCutDocumentStorage();
  await assertTargetDoesNotExist(target);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(nodePath.dirname(target.fsPath)));
  await storage.write(target.toString(), serializeOtio(document), {});
  await vscode.commands.executeCommand('vscode.openWith', target, 'neko.cut.otioEditor');
}

function readIdentity(value: Record<string, unknown>) {
  const documentUri = value['documentUri'];
  const sessionId = value['sessionId'];
  const expectedRevision = value['expectedRevision'];
  if (
    typeof documentUri !== 'string' ||
    typeof sessionId !== 'string' ||
    typeof expectedRevision !== 'number'
  ) {
    throw new Error('Cut command requires documentUri, sessionId and expectedRevision.');
  }
  return { documentUri, sessionId, expectedRevision };
}

function readAgentSelection(value: unknown): CutAgentSelection {
  if (!isRecord(value) || typeof value['trackId'] !== 'string') {
    throw new Error('Cut Agent handoff requires an explicit Track selection.');
  }
  if (value['kind'] === 'track') {
    return { kind: 'track', trackId: value['trackId'] };
  }
  if (value['kind'] === 'clip' && typeof value['clipId'] === 'string') {
    return {
      kind: 'clip',
      trackId: value['trackId'],
      clipId: value['clipId'],
    };
  }
  throw new Error('Cut Agent handoff selection is invalid.');
}

function assertCurrentIdentity(
  view: TimelineView,
  identity: ReturnType<typeof readIdentity>,
): void {
  if (!isCurrentIdentity(view, identity)) {
    throw new Error('Cut preview intent targets a stale or mismatched document revision.');
  }
}

function isCurrentIdentity(view: TimelineView, identity: ReturnType<typeof readIdentity>): boolean {
  return (
    identity.documentUri === view.documentUri &&
    identity.sessionId === view.sessionId &&
    identity.expectedRevision === view.revision
  );
}

function readCommand(value: unknown): CutCommand {
  if (!isRecord(value) || typeof value['type'] !== 'string')
    throw new Error('Invalid Cut command.');
  const type = value['type'];
  if (
    type === 'set-project-canvas' &&
    typeof value['profile'] === 'string' &&
    typeof value['width'] === 'number' &&
    Number.isInteger(value['width']) &&
    typeof value['height'] === 'number' &&
    Number.isInteger(value['height'])
  ) {
    return {
      type,
      profile: value['profile'],
      width: value['width'],
      height: value['height'],
    };
  }
  if (type === 'ripple-delete' && typeof value['clipId'] === 'string')
    return { type, clipId: value['clipId'] };
  if (type === 'unseparate-audio' && typeof value['videoClipId'] === 'string')
    return { type, videoClipId: value['videoClipId'] };
  if (
    type === 'separate-audio' &&
    typeof value['videoClipId'] === 'string' &&
    typeof value['audioClipId'] === 'string' &&
    typeof value['audioTrackId'] === 'string'
  )
    return {
      type,
      videoClipId: value['videoClipId'],
      audioClipId: value['audioClipId'],
      audioTrackId: value['audioTrackId'],
    };
  if (type === 'remove-track' && typeof value['trackId'] === 'string') {
    return { type, trackId: value['trackId'] };
  }
  if (
    type === 'remove-gap' &&
    typeof value['trackId'] === 'string' &&
    typeof value['itemIndex'] === 'number' &&
    Number.isInteger(value['itemIndex'])
  ) {
    return { type, trackId: value['trackId'], itemIndex: value['itemIndex'] };
  }
  if (
    type === 'rename-track' &&
    typeof value['trackId'] === 'string' &&
    typeof value['name'] === 'string'
  ) {
    return { type, trackId: value['trackId'], name: value['name'] };
  }
  if (
    type === 'move-track' &&
    typeof value['trackId'] === 'string' &&
    typeof value['toIndex'] === 'number' &&
    Number.isInteger(value['toIndex'])
  ) {
    return { type, trackId: value['trackId'], toIndex: value['toIndex'] };
  }
  if (
    type === 'set-clip-enabled' &&
    typeof value['clipId'] === 'string' &&
    typeof value['enabled'] === 'boolean'
  ) {
    return { type, clipId: value['clipId'], enabled: value['enabled'] };
  }
  if (
    type === 'set-track-enabled' &&
    typeof value['trackId'] === 'string' &&
    typeof value['enabled'] === 'boolean'
  ) {
    return { type, trackId: value['trackId'], enabled: value['enabled'] };
  }
  if (
    type === 'set-track-muted' &&
    typeof value['trackId'] === 'string' &&
    typeof value['muted'] === 'boolean'
  ) {
    return { type, trackId: value['trackId'], muted: value['muted'] };
  }
  if (
    type === 'set-clip-locked' &&
    typeof value['clipId'] === 'string' &&
    typeof value['locked'] === 'boolean'
  ) {
    return { type, clipId: value['clipId'], locked: value['locked'] };
  }
  if (
    type === 'set-track-locked' &&
    typeof value['trackId'] === 'string' &&
    typeof value['locked'] === 'boolean'
  ) {
    return { type, trackId: value['trackId'], locked: value['locked'] };
  }
  if (
    type === 'duplicate-clip' &&
    typeof value['clipId'] === 'string' &&
    typeof value['duplicateClipId'] === 'string' &&
    (value['duplicateLinkedClipId'] === undefined ||
      typeof value['duplicateLinkedClipId'] === 'string')
  ) {
    const duplicateLinkedClipId = value['duplicateLinkedClipId'];
    return {
      type,
      clipId: value['clipId'],
      duplicateClipId: value['duplicateClipId'],
      ...(typeof duplicateLinkedClipId === 'string' ? { duplicateLinkedClipId } : {}),
    };
  }
  if (
    type === 'move-item' &&
    typeof value['fromTrackId'] === 'string' &&
    typeof value['fromIndex'] === 'number' &&
    typeof value['toTrackId'] === 'string' &&
    typeof value['toIndex'] === 'number'
  ) {
    return {
      type,
      fromTrackId: value['fromTrackId'],
      fromIndex: value['fromIndex'],
      toTrackId: value['toTrackId'],
      toIndex: value['toIndex'],
    };
  }
  if (
    type === 'place-clip' &&
    typeof value['clipId'] === 'string' &&
    typeof value['toTrackId'] === 'string' &&
    typeof value['timelineStartFrames'] === 'number' &&
    Number.isInteger(value['timelineStartFrames']) &&
    typeof value['rate'] === 'number' &&
    (value['overlapPolicy'] === 'reject' || value['overlapPolicy'] === 'insert')
  ) {
    return {
      type,
      clipId: value['clipId'],
      toTrackId: value['toTrackId'],
      timelineStartFrames: value['timelineStartFrames'],
      rate: value['rate'],
      overlapPolicy: value['overlapPolicy'],
    };
  }
  if (
    type === 'rename-clip' &&
    typeof value['clipId'] === 'string' &&
    typeof value['name'] === 'string'
  ) {
    return { type, clipId: value['clipId'], name: value['name'] };
  }
  if (
    type === 'set-clip-duration' &&
    typeof value['clipId'] === 'string' &&
    typeof value['durationFrames'] === 'number' &&
    Number.isInteger(value['durationFrames']) &&
    typeof value['rate'] === 'number'
  ) {
    return {
      type,
      clipId: value['clipId'],
      durationFrames: value['durationFrames'],
      rate: value['rate'],
    };
  }
  if (
    type === 'set-playback-rate' &&
    typeof value['clipId'] === 'string' &&
    typeof value['playbackRate'] === 'number'
  ) {
    return { type, clipId: value['clipId'], playbackRate: value['playbackRate'] };
  }
  if (
    type === 'trim' &&
    typeof value['clipId'] === 'string' &&
    typeof value['startDeltaFrames'] === 'number' &&
    Number.isInteger(value['startDeltaFrames']) &&
    typeof value['endDeltaFrames'] === 'number' &&
    Number.isInteger(value['endDeltaFrames'])
  ) {
    return {
      type,
      clipId: value['clipId'],
      startDeltaFrames: value['startDeltaFrames'],
      endDeltaFrames: value['endDeltaFrames'],
    };
  }
  if (
    type === 'set-audio' &&
    typeof value['clipId'] === 'string' &&
    isRecord(value['settings']) &&
    typeof value['settings']['muted'] === 'boolean'
  ) {
    const gainDb = readOptionalFiniteNumber(value['settings'], 'gainDb');
    const fadeInSeconds = readOptionalFiniteNumber(value['settings'], 'fadeInSeconds');
    const fadeOutSeconds = readOptionalFiniteNumber(value['settings'], 'fadeOutSeconds');
    return {
      type,
      clipId: value['clipId'],
      settings: {
        muted: value['settings']['muted'],
        ...(gainDb !== undefined ? { gainDb } : {}),
        ...(fadeInSeconds !== undefined ? { fadeInSeconds } : {}),
        ...(fadeOutSeconds !== undefined ? { fadeOutSeconds } : {}),
      },
    };
  }
  if (
    type === 'split' &&
    typeof value['clipId'] === 'string' &&
    typeof value['offsetFrames'] === 'number' &&
    typeof value['rightClipId'] === 'string'
  )
    return {
      type,
      clipId: value['clipId'],
      offsetFrames: value['offsetFrames'],
      rightClipId: value['rightClipId'],
    };
  throw new Error(`Unsupported or invalid Cut command: ${type}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalFiniteNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key];
  if (candidate === undefined) return undefined;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`Cut audio setting ${key} must be a finite number.`);
  }
  return candidate;
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sessionOptions(storage: VSCodeCutDocumentStorage) {
  return {
    storage,
    createClipId: () => `clip-${randomId()}`,
    createTrackId: () => `track-${randomId()}`,
    createSessionId: () => `cut-session-${randomId()}`,
  };
}

async function readSubtitleDurationSeconds(uri: vscode.Uri): Promise<number> {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(
    await vscode.workspace.fs.readFile(uri),
  );
  const matches = source.matchAll(/(?:\d{2}:)?\d{2}:\d{2}[,.]\d{3}/g);
  let maximum = 0;
  for (const match of matches) {
    const value = match[0];
    if (!value) continue;
    const normalized = value.replace(',', '.').split(':').map(Number);
    const seconds =
      normalized.length === 3
        ? (normalized[0] ?? 0) * 3600 + (normalized[1] ?? 0) * 60 + (normalized[2] ?? 0)
        : (normalized[0] ?? 0) * 60 + (normalized[1] ?? 0);
    if (Number.isFinite(seconds)) maximum = Math.max(maximum, seconds);
  }
  if (maximum <= 0) {
    throw new Error('Subtitle file does not contain a valid SRT/VTT timestamp.');
  }
  return maximum;
}

function editRateOf(view: TimelineView): number {
  return view.profile ? view.profile.editRateNumerator / view.profile.editRateDenominator : 30;
}

async function prepareRouteItems(
  paths: CutWorkspaceMediaPaths,
  documentPath: string,
  sourceItems: readonly CutRouteHandoffItem[],
  rate: number,
): Promise<readonly CutRouteAppendItem[]> {
  const items: CutRouteAppendItem[] = [];
  for (const item of sourceItems) {
    if (!Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0) {
      throw new Error('Canvas route item duration must be a positive finite number.');
    }
    const durationFrames = Math.max(1, Math.round(item.durationSeconds * rate));
    if (item.kind === 'gap') {
      items.push({ kind: 'gap', durationFrames, rate });
      continue;
    }
    const targetUrl = await paths.linkMedia(documentPath, item.workspaceRelativePath);
    items.push({
      kind: 'media',
      clipId: `clip-${randomId()}`,
      name: item.name,
      targetUrl,
      durationFrames,
      rate,
    });
  }
  return items;
}

async function assertTargetDoesNotExist(target: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.stat(target);
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') return;
    throw error;
  }
  throw new Error(`Cut target already exists: ${target.fsPath}`);
}
