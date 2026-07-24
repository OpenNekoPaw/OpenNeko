/**
 * NekoCut Extension - Professional video editor for VSCode
 *
 * Main entry point using the new architecture with:
 * - ServiceCollection for dependency injection
 * - EditorRegistry + Model pattern
 * - Bootstrap services for MCP, Platform, Workflow
 */
import * as vscode from 'vscode';
import {
  ServiceCollection,
  setGlobalServices,
  setRootLogger,
  setErrorHandler,
  handleError,
  getRootLogger,
} from './base';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
  createVSCodeProjectFileIoAdapter,
  registerOptionalAgentCapabilityProvider,
} from '@neko/shared/vscode/extension';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { VideoEditorProvider } from './editor/video/videoEditorProvider';
import { registerCommands } from './commands';
import type { LocalMetadataStore, NekoCutAPI } from '@neko/shared';
import { classifyWorkspaceMediaPath, resolveWorkspaceMediaPath } from '@neko/shared';
import { createNekoCutCapabilityProvider } from './agentCapabilityProvider';
import {
  buildCutAgentSkillInvocation,
  type CutAgentSkillName,
} from './services/cutAgentSkillInvocation';
import { TimelineToolExecutor } from './services/TimelineToolExecutor';
import { TimelineToolBridge } from './services/timelineToolBridge';
import { createNkvProjectRef, CutProjectQualityFacade } from './services/CutProjectQualityFacade';
import type { CutCanvasDraftImportResult } from '@neko/shared';
import type { GenerationJobSnapshot, PurposeGenerationJobPort } from '@neko/generation';
import type { ResourceRef } from '@neko/shared';
import type { DomainActivityHost, DomainActivityItem } from '@neko/shared/domain-activity';
import {
  createPersistentExportJobStore,
  EXPORT_JOB_MIGRATIONS,
  projectExportJobActivity,
} from './services/export-job';

interface CutAiCommandOptions {
  readonly prompt?: string;
  readonly filePath?: string;
  readonly documentUri?: string;
  readonly expectedProjectRevision?: string;
}

let activeVideoEditorProvider: VideoEditorProvider | undefined;

export interface NekoCutHostServices {
  readonly purposeGenerationJobs?: PurposeGenerationJobPort;
  readonly resolveGenerationResultPath?: (ref: ResourceRef) => string;
  readonly localMetadata?: {
    readonly metadataStore: LocalMetadataStore;
    readonly workspaceId: string;
  };
  readonly domainActivity?: DomainActivityHost;
}

/**
 * Activate the extension
 */
export async function activate(
  context: vscode.ExtensionContext,
  hostServices?: NekoCutHostServices,
): Promise<NekoCutAPI> {
  // Initialize logger → VSCode OutputChannel + Console
  const logger = createVSCodeLogger(
    'Neko Cut',
    'NekoCut',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(logger);

  // Initialize error handler
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  logger.info('Activating extension...');

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  const bootstrapResult = await bootstrapCoreServices(services, context);
  logServicesStatus(bootstrapResult);

  const exportJobStore = hostServices?.localMetadata
    ? await createCutExportJobStore(hostServices.localMetadata)
    : undefined;

  // Create providers
  const videoEditorProvider = new VideoEditorProvider(
    context,
    exportJobStore,
    hostServices?.domainActivity?.publisher,
  );
  activeVideoEditorProvider = videoEditorProvider;
  if (hostServices?.domainActivity) {
    context.subscriptions.push(
      hostServices.domainActivity.installExportCommandExecutor({
        async execute(input): Promise<DomainActivityItem> {
          if (input.jobKind !== 'export') {
            throw new Error(`Cut Export command executor rejects Job kind ${input.jobKind}.`);
          }
          const command = {
            ref: { kind: 'export' as const, jobId: input.jobId },
            expectedRevision: input.expectedRevision,
          };
          const snapshot =
            input.command === 'cancel'
              ? await videoEditorProvider.cancelExport(command)
              : input.command === 'retry'
                ? await videoEditorProvider.retryExport(command)
                : await videoEditorProvider.reconcileExport(command);
          return projectExportJobActivity(snapshot);
        },
      }),
    );
  }
  const projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  const projectQuality = new CutProjectQualityFacade({
    fileOps: projectFileAdapter.fileOps,
    snapshotSource: {
      async getSnapshot({ documentUri }) {
        const document = videoEditorProvider.getProjectDataForDocument(documentUri);
        return document ? { status: 'available', document } : { status: 'not-open' };
      },
    },
    runtimeProbe: {
      async probe({ project }) {
        const available =
          videoEditorProvider.getExportServiceForDocument(project.documentUri) !== undefined;
        return {
          available,
          ...(available ? { profileId: 'cut-engine-export' } : {}),
        };
      },
    },
    resolveSourcePath(sourcePath, projectFilePath) {
      const classification = classifyWorkspaceMediaPath(sourcePath);
      if (classification.kind !== 'workspace-relative' && classification.kind !== 'variable') {
        return undefined;
      }
      const context = projectFileAdapter.createWorkspaceMediaPathContext({
        documentUri: vscode.Uri.file(projectFilePath),
      });
      const resolved = resolveWorkspaceMediaPath({ source: sourcePath, context });
      return resolved.status === 'resolved-local' ? resolved.path : undefined;
    },
    exportReadinessProbe: {
      async check({ project }) {
        const ready =
          videoEditorProvider.getExportServiceForDocument(project.documentUri) !== undefined;
        return {
          ready,
          diagnostics: ready
            ? []
            : [
                {
                  code: 'quality-evaluator-failed',
                  severity: 'error',
                  message: 'No target-bound Cut export service is registered for this project.',
                },
              ],
        };
      },
    },
  });

  // Register custom editor (CustomEditorProvider for .nkv files)
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('neko.videoEditor', videoEditorProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register outline view
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('neko.projectOutline', bootstrapResult.outlineProvider),
  );

  // Register commands
  registerCommands(
    context,
    bootstrapResult.outlineProvider,
    videoEditorProvider,
    bootstrapResult.cutProjectAuthoringService,
  );

  // Register media preview command (opens in neko-preview's customEditor)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.cut.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) return;

      const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
      const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

      try {
        if (videoExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (audioExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        }
      } catch (error) {
        getRootLogger().error('Failed to open media preview', error);
      }
    }),
  );

  getRootLogger().info('Extension activated');

  // Exported API for direct typed cross-feature composition.
  const timelineBridge = new TimelineToolBridge(new TimelineToolExecutor());
  const api: NekoCutAPI = {
    projectQuality,
    authoring: {
      importGeneratedClip: (request) =>
        bootstrapResult.cutProjectAuthoringService.importGeneratedClip(request),
    },
    timeline: {
      getInfo: (target) => timelineBridge.getInfo(target),
      addElement: (target, config) => timelineBridge.addElement(target, config),
      updateElement: (target, id, updates) => timelineBridge.updateElement(target, id, updates),
      deleteElement: (target, id) => timelineBridge.deleteElement(target, id),
      listElements: (target) => timelineBridge.listElements(target),
      reveal: async (request) => {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.parse(request.projectUri),
          'neko.videoEditor',
        );
        return true;
      },
      importCanvasDraft: async (request) => {
        const result = await vscode.commands.executeCommand<CutCanvasDraftImportResult>(
          'neko.cut.authoring.importCanvasDraft',
          {
            payload: request.payload,
            target: { kind: 'file', documentUri: request.documentUri },
            ...(request.expectedProjectRevision
              ? { expectedProjectRevision: request.expectedProjectRevision }
              : {}),
          },
        );
        if (result) {
          return result;
        }
        return {
          accepted: false,
          status: 'post-failed',
          projectUri: request.documentUri,
          error: 'neko.cut.authoring.importCanvasDraft did not return an import result.',
        };
      },
    },
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.cut.ai.generateVideoForClip',
      async (options?: CutAiCommandOptions | unknown) => {
        const target = resolveInteractiveCutTarget(options, videoEditorProvider);
        if (!target) {
          vscode.window.showWarningMessage('Open a Cut project before requesting timeline media.');
          return undefined;
        }
        const providedPrompt = readStringProperty(options, 'prompt');
        const prompt = providedPrompt ?? (await promptForGenerateVideoClip());
        if (!prompt) return undefined;

        const jobs = hostServices?.purposeGenerationJobs;
        const resolveResultPath = hostServices?.resolveGenerationResultPath;
        if (!jobs || !resolveResultPath) {
          throw new Error(
            'Cut video generation requires the Host-composed Generation Job runtime.',
          );
        }
        return vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Cut video clip',
            cancellable: true,
          },
          async (progress, cancellation) => {
            let reportedPercent = 0;
            const submitted = await jobs.submitGeneration({
              lifecycleMode: 'detached',
              purpose: 'video.generate',
              generationType: 'text-to-video',
              request: {
                prompt,
                metadata: {
                  sourcePackage: 'neko-cut',
                  targetDocumentUri: target.documentUri,
                  expectedProjectRevision: target.expectedProjectRevision,
                },
              },
            });
            const terminal = await waitForCutGenerationJob(jobs, submitted, {
              cancellation,
              onProgress: (percent, stage) => {
                const nextPercent = Math.max(reportedPercent, Math.min(100, percent));
                progress.report({
                  increment: nextPercent - reportedPercent,
                  message: stage,
                });
                reportedPercent = nextPercent;
              },
            });
            if (terminal.phase !== 'succeeded') {
              throw new Error(
                terminal.failure?.message ??
                  `Generation Job ${terminal.ref.jobId} ended in phase ${terminal.phase}.`,
              );
            }
            const resultRef = terminal.resultRefs?.[0];
            if (!resultRef) {
              throw new Error(
                `Generation Job ${terminal.ref.jobId} completed without a ResourceRef.`,
              );
            }
            const result = await bootstrapResult.cutProjectAuthoringService.importGeneratedClip({
              target: {
                kind: 'file',
                documentUri: target.documentUri,
                reveal: true,
              },
              expectedProjectRevision: target.expectedProjectRevision,
              sourcePath: resolveResultPath(resultRef),
              name: `Generated clip ${terminal.ref.jobId}`,
              mediaType: 'video',
              requestId: `generation-job:${terminal.ref.jobId}`,
            });
            if (!result.ok) {
              throw new Error(
                result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
                  'Cut generated clip import failed.',
              );
            }
            return {
              generationJobId: terminal.ref.jobId,
              resourceRef: resultRef,
              authoring: result,
            };
          },
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.cut.ai.transcribeToSubtitles', async (args?: unknown) => {
      const target = resolveInteractiveCutTarget(args, videoEditorProvider);
      if (!target) {
        vscode.window.showWarningMessage('Open a Cut project before requesting subtitles.');
        return;
      }
      const filePath = readStringProperty(args, 'filePath') ?? (await promptForMediaFilePath());
      if (!filePath) return;

      await sendCutSkillIntentToAgent(
        'subtitle',
        `Transcribe this audio/video file and add word-timed subtitles only to Cut project ${target.documentUri} with expected project revision ${target.expectedProjectRevision}: ${filePath}`,
      );
    }),
  );

  void registerOptionalAgentCapabilityProvider(
    createNekoCutCapabilityProvider(api, timelineBridge),
  ).catch((error: unknown) => {
    void handleError(error, { showToUser: false });
  });

  return api;
}

async function promptForGenerateVideoClip(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Describe the video clip to generate',
    placeHolder: 'A cinematic close-up of rain on a neon city street...',
  });
}

async function promptForMediaFilePath(): Promise<string | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Select Audio or Video',
    filters: {
      'Audio / Video': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'mp4', 'mov', 'mkv', 'webm'],
      'All Files': ['*'],
    },
  });
  return selected?.[0]?.fsPath;
}

async function sendCutSkillIntentToAgent(
  skillName: CutAgentSkillName,
  intent: string,
): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      'neko.agent.invokeSkill',
      buildCutAgentSkillInvocation(skillName, intent),
    );
  } catch (error) {
    getRootLogger().warn('Failed to forward NekoCut skill intent to neko-agent', { error });
    vscode.window.showWarningMessage('Neko Agent is required to run this skill.');
  }
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
}

export async function deactivate(): Promise<void> {
  getRootLogger().info('Deactivating extension...');
  const provider = activeVideoEditorProvider;
  activeVideoEditorProvider = undefined;
  await provider?.dispose();
}

async function waitForCutGenerationJob(
  jobs: PurposeGenerationJobPort,
  initial: GenerationJobSnapshot,
  options: {
    readonly cancellation: vscode.CancellationToken;
    readonly onProgress: (percent: number, stage: string) => void;
  },
): Promise<GenerationJobSnapshot> {
  if (isTerminalGeneration(initial)) return initial;
  let latest = initial;
  const iterator = jobs.observeGeneration(initial.ref, initial.revision)[Symbol.asyncIterator]();
  let cancellationSubscription: vscode.Disposable | undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    cancellationSubscription = options.cancellation.onCancellationRequested(() => {
      reject(new Error('Cut Generation Job observation cancelled.'));
    });
  });
  try {
    while (true) {
      const next = await Promise.race([iterator.next(), cancellation]);
      if (next.done) break;
      latest = next.value;
      options.onProgress(latest.progress.percent, latest.progress.stage);
      if (isTerminalGeneration(latest)) return latest;
    }
  } catch (error) {
    if (!options.cancellation.isCancellationRequested) throw error;
    const current = await jobs.describeGeneration(latest.ref);
    if (!isTerminalGeneration(current)) {
      await jobs.cancelGeneration({
        ref: current.ref,
        expectedRevision: current.revision,
      });
    }
    throw error;
  } finally {
    cancellationSubscription?.dispose();
    await iterator.return?.();
  }
  throw new Error(
    `Generation Job ${initial.ref.jobId} observation ended before a terminal snapshot.`,
  );
}

function isTerminalGeneration(snapshot: GenerationJobSnapshot): boolean {
  return (
    snapshot.phase === 'succeeded' ||
    snapshot.phase === 'failed' ||
    snapshot.phase === 'cancelled' ||
    snapshot.phase === 'outcome-unknown'
  );
}

function resolveInteractiveCutTarget(
  value: unknown,
  videoEditorProvider: VideoEditorProvider,
): { readonly documentUri: string; readonly expectedProjectRevision: string } | undefined {
  const requestedDocumentUri = readStringProperty(value, 'documentUri');
  const requestedRevision = readStringProperty(value, 'expectedProjectRevision');
  if (requestedDocumentUri || requestedRevision) {
    return requestedDocumentUri && requestedRevision
      ? { documentUri: requestedDocumentUri, expectedProjectRevision: requestedRevision }
      : undefined;
  }

  const documentUri = videoEditorProvider.getActiveDocumentVsCodeUri()?.toString();
  if (!documentUri) return undefined;
  const project = videoEditorProvider.getProjectDataForDocument(documentUri);
  if (!project) return undefined;
  return {
    documentUri,
    expectedProjectRevision: createNkvProjectRef(documentUri, project).projectRevision,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function createCutExportJobStore(localMetadata: {
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceId: string;
}): Promise<ReturnType<typeof createPersistentExportJobStore>> {
  await localMetadata.metadataStore.migrateNamespace(EXPORT_JOB_MIGRATIONS);
  return createPersistentExportJobStore(localMetadata);
}
