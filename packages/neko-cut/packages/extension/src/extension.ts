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
import type { NekoCutAPI } from '@neko/shared';
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

interface CutAiCommandOptions {
  readonly prompt?: string;
  readonly filePath?: string;
  readonly documentUri?: string;
  readonly expectedProjectRevision?: string;
}

/**
 * Activate the extension
 */
export async function activate(
  context: vscode.ExtensionContext,
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

  // Create providers
  const videoEditorProvider = new VideoEditorProvider(context);
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

  // ── P2: Exported API for neko-agent cross-extension communication ──────────
  // The `ai` namespace delegates to neko-agent via VSCode command so that
  // neko-cut doesn't take a direct dependency on @neko/platform.
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

  // Register the VSCode command for ai.generateVideoForClip
  // so the API method above can delegate properly.
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

        await sendCutSkillIntentToAgent(
          'video',
          `Generate a video clip from this prompt: ${prompt}. Add it only to Cut project ${target.documentUri} with expected project revision ${target.expectedProjectRevision}.`,
        );
        return undefined;
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

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
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
