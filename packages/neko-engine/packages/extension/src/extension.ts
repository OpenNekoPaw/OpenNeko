/**
 * Neko Engine Extension
 *
 * VSCode extension entry point that wires up the media processing engine.
 *
 * Architecture:
 * extension.ts → MediaEngineManager → NativeMediaEngine → NativeEngine (NAPI) → EngineApi (Rust)
 *
 * Responsibilities:
 * - Engine session lifecycle management (connect/disconnect)
 * - VSCode command registration
 * - Status bar integration
 * - Export pipeline orchestration
 */
import * as vscode from 'vscode';
import { MediaEngineManager, createMediaEngineManager, NativeMediaEngine } from './mediaEngine';
import {
  ExportService,
  JviProjectLoader,
  createVideoFrameProvider,
  type ExportProgress,
} from './mediaEngine/export';
import { setRootLogger, setErrorHandler, handleError, getLogger } from './base';
import {
  createVSCodeLogger,
  registerOptionalAgentCapabilityProvider,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import type { NekoEngineRuntimeState, NekoEngineRuntimeStatus } from '@neko/shared';
import { createEngineCapabilityProvider } from './agentCapabilityProvider';
import { configureNativeEngineBinding } from './mediaEngine/nativeEngineBinding';

// =============================================================================
// Extension State
// =============================================================================

let manager: MediaEngineManager | null = null;
let exportService: ExportService | null = null;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let runtimeState: NekoEngineRuntimeState = 'idle';
/** Cached frame server port for the current extension session (null = not connected) */
let frameServerPort: number | null = null;
let ensureFrameServerPromise: Promise<{ port: number } | null> | null = null;
let pendingPreviewAllowedRoots: readonly string[] | undefined;

const FRAME_SERVER_HEALTH_ATTEMPTS = 3;
const FRAME_SERVER_HEALTH_TIMEOUT_MS = 1000;
const FRAME_SERVER_HEALTH_RETRY_DELAY_MS = 120;

type NativeEngineWithPreviewRoots = {
  startFrameServerWithPreviewRoots?: (
    port?: number,
    previewAllowedRoots?: readonly string[],
  ) => Promise<number>;
  setPreviewAllowedRoots?: (previewAllowedRoots?: readonly string[]) => void;
  startFrameServer(port?: number): Promise<number>;
};

// =============================================================================
// Activation
// =============================================================================

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  configureNativeEngineBinding(context.asAbsolutePath('packages/host-napi/loader.js'));
  outputChannel = vscode.window.createOutputChannel('Neko Engine');
  context.subscriptions.push(outputChannel);

  // Initialize structured logger and error handler
  const logger = createVSCodeLogger(
    'Neko Engine',
    'NekoEngine',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(logger);
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  log('Activating extension...');

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'neko.engine.status';
  context.subscriptions.push(statusBarItem);

  // Create MediaEngineManager
  manager = createMediaEngineManager(context.globalStorageUri);
  context.subscriptions.push(manager);

  // Create ExportService
  exportService = new ExportService();

  // Register commands
  registerCommands(context);

  // Update status bar
  updateStatusBar('idle');

  log('Extension activated');

  void registerOptionalAgentCapabilityProvider(createEngineCapabilityProvider()).catch(
    (error: unknown) => {
      void handleError(error, { showToUser: false });
    },
  );
}

// =============================================================================
// Command Registration
// =============================================================================

function registerCommands(context: vscode.ExtensionContext): void {
  // Connect Engine Session
  context.subscriptions.push(vscode.commands.registerCommand('neko.engine.start', cmdStartEngine));

  // Disconnect Engine Session
  context.subscriptions.push(vscode.commands.registerCommand('neko.engine.stop', cmdStopEngine));

  // Engine Status
  context.subscriptions.push(vscode.commands.registerCommand('neko.engine.status', cmdShowStatus));

  // Engine runtime status (internal read-only API for status and diagnostic consumers)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.engine.getStatus', getEngineRuntimeStatus),
  );

  // Probe Media (interactive — shows file picker + output)
  context.subscriptions.push(vscode.commands.registerCommand('neko.engine.probe', cmdProbeMedia));

  // Probe Media (internal — programmatic API for other extensions)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.engine.probeInternal', async (filePath: string) => {
      try {
        const engine = await getOrStartEngine();
        if (!engine) return null;
        return await engine.probeMedia(filePath);
      } catch (error) {
        log(`probeInternal failed for ${filePath}: ${error}`, 'error');
        return null;
      }
    }),
  );

  // Extract Frame (programmatic API for other extensions)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.engine.extractFrame',
      async (filePath: string, timeSeconds: number) => {
        try {
          const engine = await getOrStartEngine();
          if (!engine?.engine) return null;
          const resultJson = await engine.engine.captureFrame(filePath, timeSeconds);
          const result = JSON.parse(resultJson);
          if (result.status === 'ok' && result.data?.data) {
            return { data: Buffer.from(result.data.data as string, 'base64') };
          }
          return null;
        } catch (error) {
          log(`extractFrame failed for ${filePath} at ${timeSeconds}s: ${error}`, 'error');
          return null;
        }
      },
    ),
  );

  // Extract Thumbnail — generates a JPEG thumbnail and writes to outputPath
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.engine.extractThumbnail',
      async (
        filePath: string,
        outputPath: string,
        maxWidth: number,
        maxHeight: number,
        timeOffset: number,
      ) => {
        try {
          const engine = await getOrStartEngine();
          if (!engine?.engine) return { success: false, path: '', width: 0, height: 0 };

          const optionsJson = JSON.stringify({
            source: filePath,
            time: timeOffset,
            width: maxWidth,
            height: maxHeight,
            format: 'jpeg',
            quality: 85,
          });

          const resultJson = await engine.engine.dispatchAction(
            'videos',
            'capture',
            null,
            optionsJson,
            null,
            null,
            null,
            null,
          );
          if (!resultJson) return { success: false, path: '', width: 0, height: 0 };

          const result = JSON.parse(resultJson);
          if (result.status === 'ok' && result.data?.data) {
            const buf = Buffer.from(result.data.data as string, 'base64');
            const fsPromises = await import('fs/promises');
            const pathMod = await import('path');
            await fsPromises.mkdir(pathMod.dirname(outputPath), { recursive: true });
            await fsPromises.writeFile(outputPath, buf);
            return {
              success: true,
              path: outputPath,
              width: (result.data.width as number) ?? maxWidth,
              height: (result.data.height as number) ?? maxHeight,
            };
          }
          return { success: false, path: '', width: 0, height: 0 };
        } catch (error) {
          log(`extractThumbnail failed for ${filePath}: ${error}`, 'error');
          return { success: false, path: '', width: 0, height: 0 };
        }
      },
    ),
  );

  // Diff two media files (programmatic API for other extensions)
  // Dispatches to engine's native diff: audios:diff, videos:diff, images:diff, timelines:diff
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.engine.diff',
      async (
        group: string,
        sourceA: string,
        sourceB: string,
        options?: Record<string, unknown>,
      ) => {
        try {
          const engine = await getOrStartEngine();
          if (!engine?.engine) return null;
          const opts = { sourceA, sourceB, ...options };
          const resultJson = await engine.engine.dispatchAction(
            group,
            'diff',
            null,
            JSON.stringify(opts),
            null,
            null,
            null,
            null,
          );
          const result = JSON.parse(resultJson);
          if (result.status === 'ok') {
            const data = result.data;
            // Rust ContentDiff is a tagged enum: { content: { type: "Image"|"Audio"|"Video"|"Timeline", ...fields } }
            // TypeScript EngineDiffResult expects flat fields: { imageDiff?, audioDiff?, videoDiff?, timelineDiff? }
            // Transform here to bridge the mismatch without changing Rust or generated types.
            if (data?.content) {
              const { type: contentType, ...contentFields } = data.content;
              const keyMap: Record<string, string> = {
                Image: 'imageDiff',
                Audio: 'audioDiff',
                Video: 'videoDiff',
                Timeline: 'timelineDiff',
                image: 'imageDiff',
                audio: 'audioDiff',
                video: 'videoDiff',
                timeline: 'timelineDiff',
              };
              const key = keyMap[contentType];
              if (key) {
                data[key] = contentFields;
              }
              delete data.content;
            }
            return data;
          }
          log(`diff failed for ${group}: ${result.message ?? 'unknown error'}`, 'error');
          return null;
        } catch (error) {
          log(`diff failed for ${group} (${sourceA} vs ${sourceB}): ${error}`, 'error');
          return null;
        }
      },
    ),
  );

  // Ensure Frame Server is running (programmatic API for other extensions)
  // Starts the embedded HTTP/WebSocket server if not already running.
  // Returns { port: number } on success, null on failure.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.engine.ensureFrameServer',
      async (previewAllowedRoots?: readonly string[]): Promise<{ port: number } | null> => {
        pendingPreviewAllowedRoots = mergePreviewAllowedRootRequests(
          pendingPreviewAllowedRoots,
          previewAllowedRoots,
        );
        if (!ensureFrameServerPromise) {
          ensureFrameServerPromise = ensureFrameServer(() => pendingPreviewAllowedRoots).finally(
            () => {
              ensureFrameServerPromise = null;
              pendingPreviewAllowedRoots = undefined;
            },
          );
        }
        return ensureFrameServerPromise;
      },
    ),
  );

  // Generic dispatch (programmatic API for other extensions)
  // Dispatches an ActionRequest to the engine and returns the JSON result.
  // Parameters: (group: string, action: string, options?: Record<string, unknown>)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.engine.dispatch',
      async (
        group: string,
        action: string,
        options?: Record<string, unknown>,
      ): Promise<string | null> => {
        try {
          const engine = await getOrStartEngine();
          if (!engine?.engine) return null;

          const optionsJson = options ? JSON.stringify(options) : null;
          return await engine.engine.dispatchAction(
            group,
            action,
            null,
            optionsJson,
            null,
            null,
            null,
            null,
          );
        } catch (error) {
          log(`dispatch(${group}:${action}) failed: ${error}`, 'error');
          return null;
        }
      },
    ),
  );

  // Export JVI Project
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.engine.export', cmdExportProject),
  );

  // Open Documentation
  context.subscriptions.push(vscode.commands.registerCommand('neko.engine.openDocs', cmdOpenDocs));
}

// =============================================================================
// Command Implementations
// =============================================================================

/**
 * Connect the extension session to the process-wide engine singleton.
 */
async function cmdStartEngine(): Promise<void> {
  if (!manager) {
    void handleError(new Error('Neko Engine: Manager not initialized'), { showToUser: true });
    return;
  }

  updateStatusBar('starting');

  try {
    const engine = await manager.getCompatibleEngine();

    // Share the NativeEngine instance with ExportService
    if (exportService && engine.engine) {
      exportService.initializeWithEngine(engine.engine);
    }

    log(`Engine session connected (GPU: ${engine.engine?.hasGpu() ? 'enabled' : 'disabled'})`);

    // Log available groups
    const groups = engine.engine?.groups();
    if (groups) {
      log(`Available API groups: ${groups.join(', ')}`);
    }

    updateStatusBar('ready');
    vscode.window.showInformationMessage('Neko Engine connected');
  } catch (error) {
    log(
      `Failed to connect engine session: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
    updateStatusBar('error');
    handleError(error, { showToUser: true, severity: 'error' });
  }
}

/**
 * Disconnect the extension session from the engine wrapper.
 *
 * Note: the Rust EngineApi currently lives behind a process-wide singleton in
 * host-napi, so this command only disposes the TypeScript-side wrapper and
 * embedded frame server state for the current extension session.
 */
async function cmdStopEngine(): Promise<void> {
  if (!manager) {
    return;
  }

  try {
    // Cancel any ongoing export
    if (exportService) {
      await exportService.cancel();
    }

    // Dispose engines
    await manager.disposeEngines();
    frameServerPort = null;

    log('Engine session disconnected');
    updateStatusBar('idle');
    vscode.window.showInformationMessage('Neko Engine disconnected');
  } catch (error) {
    frameServerPort = null;
    log(
      `Failed to disconnect engine session: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
    handleError(error, { showToUser: true, severity: 'error' });
  }
}

/**
 * Show engine status — queries real health/GPU info from Rust side
 */
async function cmdShowStatus(): Promise<void> {
  if (!manager) {
    vscode.window.showInformationMessage('Neko Engine: Not initialized');
    return;
  }

  try {
    const engine = await getOrStartEngine();
    if (!engine?.engine) {
      vscode.window.showInformationMessage('Neko Engine: Not connected');
      return;
    }

    // Query health
    JSON.parse(await engine.engine.health());

    // Query GPU info
    const gpuJson = await engine.engine.gpuInfo();
    const gpu = JSON.parse(gpuJson);

    // Query metrics
    const metricsJson = await engine.engine.metrics();
    const metrics = JSON.parse(metricsJson);

    // Build status message
    const lines: string[] = [
      `State: ${engine.state}`,
      `GPU: ${gpu.data?.name ?? 'N/A'} (${gpu.data?.backend ?? 'N/A'})`,
      `Hardware Accel: ${engine.capabilities.hardwareAcceleration ? 'Yes' : 'No'}`,
    ];

    if (metrics.data) {
      const m = metrics.data;
      if (m.cpuUsage !== undefined) {
        lines.push(`CPU: ${(m.cpuUsage as number).toFixed(1)}%`);
      }
      if (m.memoryUsedMb !== undefined) {
        lines.push(`Memory: ${(m.memoryUsedMb as number).toFixed(0)} MB`);
      }
    }

    // Show in output channel
    outputChannel.show(true);
    outputChannel.appendLine('--- Engine Status ---');
    for (const line of lines) {
      outputChannel.appendLine(line);
    }
    outputChannel.appendLine('');

    vscode.window.showInformationMessage(
      `Neko Engine: ${engine.state} | GPU: ${gpu.data?.name ?? 'N/A'}`,
    );
  } catch (error) {
    handleError(error, { showToUser: true, severity: 'error' });
  }
}

/**
 * Probe a media file — select file, probe metadata, show results
 */
async function cmdProbeMedia(): Promise<void> {
  // Select file
  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: {
      'Media Files': ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'flac', 'aac'],
      'All Files': ['*'],
    },
    title: 'Select media file to probe',
  });

  if (!fileUri || fileUri.length === 0) {
    return;
  }

  const filePath = fileUri[0]!.fsPath;

  try {
    const engine = await getOrStartEngine();
    if (!engine) {
      return;
    }

    const mediaInfo = await engine.probeMedia(filePath);

    // Show results in output channel
    outputChannel.show(true);
    outputChannel.appendLine(`--- Probe: ${filePath} ---`);
    outputChannel.appendLine(`  Duration: ${mediaInfo.duration.toFixed(2)}s`);
    outputChannel.appendLine(`  Resolution: ${mediaInfo.width}x${mediaInfo.height}`);
    outputChannel.appendLine(`  FPS: ${mediaInfo.fps}`);
    outputChannel.appendLine(`  Video Codec: ${mediaInfo.codec}`);
    outputChannel.appendLine(`  Format: ${mediaInfo.format}`);
    if (mediaInfo.hasAudio) {
      outputChannel.appendLine(
        `  Audio: ${mediaInfo.audioCodec ?? 'unknown'} (${mediaInfo.audioSampleRate ?? 0} Hz, ${mediaInfo.audioChannels ?? 0} ch)`,
      );
    }
    if (mediaInfo.hasSubtitles) {
      outputChannel.appendLine('  Subtitles: Yes');
    }

    outputChannel.appendLine('');

    vscode.window.showInformationMessage(
      `${mediaInfo.width}x${mediaInfo.height} | ${mediaInfo.codec} | ${mediaInfo.duration.toFixed(1)}s`,
    );
  } catch (error) {
    handleError(error, { showToUser: true, severity: 'error' });
  }
}

/**
 * Export a JVI project — select .nkv file, export to video
 */
async function cmdExportProject(): Promise<void> {
  if (!exportService) {
    void handleError(new Error('Neko Engine: Export service not available'), { showToUser: true });
    return;
  }

  // Ensure engine is running
  const engine = await getOrStartEngine();
  if (!engine?.engine) {
    return;
  }

  // Ensure export service has engine
  if (!exportService['_isInitialized']) {
    exportService.initializeWithEngine(engine.engine);
  }

  // Select JVI project file
  const jviUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: { 'JVI Project': ['jvi'] },
    title: 'Select JVI project to export',
  });

  if (!jviUri || jviUri.length === 0) {
    return;
  }

  const jviPath = jviUri[0]!.fsPath;

  // Select output path
  const outputUri = await vscode.window.showSaveDialog({
    filters: {
      'MP4 Video': ['mp4'],
      'MOV Video': ['mov'],
    },
    title: 'Save exported video as',
  });

  if (!outputUri) {
    return;
  }

  const outputPath = outputUri.fsPath;

  try {
    // Load JVI project
    const loader = new JviProjectLoader(jviPath);
    const project = await loader.load();

    log(
      `Exporting project: ${project.name} (${project.resolution.width}x${project.resolution.height} @ ${project.fps}fps)`,
    );

    // Convert JVI tracks to export layers
    const layers = loader.toLayers();
    const duration = loader.calculateDuration();

    // Create frame provider
    const frameProvider = await createVideoFrameProvider();

    // Build export config
    const config = {
      outputPath,
      width: project.resolution.width,
      height: project.resolution.height,
      fps: project.fps,
      duration,
      videoCodec: 'h264' as const,
      preset: 'medium' as const,
      profile: 'high' as const,
      container: 'mp4' as const,
      includeAudio: true,
      audioCodec: 'aac' as const,
      audioSampleRate: 48000,
      audioChannels: 2,
    };

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Neko Engine: Exporting',
        cancellable: true,
      },
      async (progress, token) => {
        // Handle cancellation
        token.onCancellationRequested(() => {
          exportService?.cancel();
        });

        const result = await exportService!.export(
          config,
          layers,
          frameProvider,
          (p: ExportProgress) => {
            progress.report({
              increment: undefined,
              message: `${p.percentage.toFixed(1)}% | Frame ${p.currentFrame}/${p.totalFrames} | ${p.phase}`,
            });
            log(`Export progress: ${p.percentage.toFixed(1)}% (${p.phase})`);
          },
        );

        if (result.success) {
          log(`Export completed: ${outputPath} (${result.totalTimeMs?.toFixed(0)}ms)`);
          const action = await vscode.window.showInformationMessage(
            `Export completed: ${outputPath}`,
            'Open File',
            'Open Folder',
          );
          if (action === 'Open File') {
            vscode.env.openExternal(vscode.Uri.file(outputPath));
          } else if (action === 'Open Folder') {
            const path = await import('path');
            vscode.env.openExternal(vscode.Uri.file(path.dirname(outputPath)));
          }
        } else {
          log(`Export failed: ${result.error}`, 'error');
          handleError(new Error(result.error ?? 'Export failed'), {
            showToUser: true,
            severity: 'error',
          });
        }
      },
    );
  } catch (error) {
    log(`Export error: ${error instanceof Error ? error.message : String(error)}`, 'error');
    handleError(error, { showToUser: true, severity: 'error' });
  }
}

/**
 * Open API documentation
 */
function cmdOpenDocs(): void {
  const docsPath = vscode.Uri.joinPath(vscode.Uri.file(__dirname), '../../docs/refactor.md');
  vscode.commands.executeCommand('markdown.showPreview', docsPath);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the compatible engine, starting it if needed
 */
async function getOrStartEngine(): Promise<NativeMediaEngine | null> {
  if (!manager) {
    void handleError(new Error('Neko Engine: Manager not initialized'), { showToUser: true });
    return null;
  }

  try {
    const engine = await manager.getCompatibleEngine();
    updateStatusBar('ready');
    return engine;
  } catch (error) {
    log(`Failed to get engine: ${error instanceof Error ? error.message : String(error)}`, 'error');
    updateStatusBar('error');
    handleError(error, { showToUser: true, severity: 'error' });
    return null;
  }
}

async function ensureFrameServer(
  getRequestedPreviewAllowedRoots?: () => readonly string[] | undefined,
): Promise<{ port: number } | null> {
  try {
    const engine = await getOrStartEngine();
    if (!engine?.engine) return null;
    const nativeEngine = engine.engine as NativeEngineWithPreviewRoots;
    const previewRoots = previewAllowedRoots(getRequestedPreviewAllowedRoots?.());

    // Reuse a healthy embedded server when possible, but self-heal stale cache state.
    const existingPort = frameServerPort ?? engine.engine.getFrameServerPort();
    if (existingPort !== null) {
      if (await isFrameServerHealthy(existingPort)) {
        updatePreviewAllowedRoots(
          nativeEngine,
          previewAllowedRoots(getRequestedPreviewAllowedRoots?.()),
        );
        frameServerPort = existingPort;
        return { port: existingPort };
      }

      log(`Frame server port ${existingPort} is stale after health retries, restarting`, 'error');
      frameServerPort = null;

      try {
        await engine.engine.stopFrameServer();
      } catch {
        // Ignore — the wrapper may already be out of sync with the real server state.
      }
    }

    // Start frame server with auto-assigned port and a workspace-scoped preview allow-list.
    const port = await startFrameServer(nativeEngine, previewRoots);
    updatePreviewAllowedRoots(
      nativeEngine,
      previewAllowedRoots(getRequestedPreviewAllowedRoots?.()),
    );
    frameServerPort = port;
    log(`Frame server started on port ${port}`);
    return { port };
  } catch (error) {
    frameServerPort = null;
    log(`ensureFrameServer failed: ${error}`, 'error');
    return null;
  }
}

async function isFrameServerHealthy(port: number): Promise<boolean> {
  for (let attempt = 1; attempt <= FRAME_SERVER_HEALTH_ATTEMPTS; attempt += 1) {
    if (await checkFrameServerHealthOnce(port)) {
      return true;
    }
    if (attempt < FRAME_SERVER_HEALTH_ATTEMPTS) {
      await delay(FRAME_SERVER_HEALTH_RETRY_DELAY_MS);
    }
  }
  return false;
}

async function checkFrameServerHealthOnce(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FRAME_SERVER_HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function previewAllowedRoots(requestedRoots?: readonly string[]): string[] {
  const previewRoots =
    vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).filter(Boolean) ?? [];
  for (const root of requestedRoots ?? []) {
    if (root) {
      previewRoots.push(root);
    }
  }
  return [...new Set(previewRoots)];
}

function mergePreviewAllowedRootRequests(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!left || left.length === 0) return right;
  if (!right || right.length === 0) return left;
  return [...new Set([...left, ...right])];
}

function updatePreviewAllowedRoots(
  engine: NativeEngineWithPreviewRoots,
  previewRoots: readonly string[],
): void {
  if (typeof engine.setPreviewAllowedRoots !== 'function') return;
  try {
    engine.setPreviewAllowedRoots(previewRoots);
  } catch (error) {
    log(`Failed to update preview allowed roots: ${error}`, 'error');
  }
}

async function startFrameServer(
  engine: NativeEngineWithPreviewRoots,
  previewRoots: readonly string[],
): Promise<number> {
  if (typeof engine.startFrameServerWithPreviewRoots === 'function') {
    return engine.startFrameServerWithPreviewRoots(0, previewRoots);
  }
  return engine.startFrameServer(0);
}

/**
 * Update status bar based on engine state
 */
function updateStatusBar(state: 'idle' | 'starting' | 'ready' | 'error'): void {
  runtimeState = state;

  switch (state) {
    case 'idle':
      statusBarItem.text = '$(circle-outline) Neko Engine';
      statusBarItem.tooltip = 'Neko Engine: Disconnected — Click to view status';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'starting':
      statusBarItem.text = '$(loading~spin) Neko Engine';
      statusBarItem.tooltip = 'Neko Engine: Connecting...';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'ready':
      statusBarItem.text = '$(check) Neko Engine';
      statusBarItem.tooltip = 'Neko Engine: Connected — Click to view status';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'error':
      statusBarItem.text = '$(error) Neko Engine';
      statusBarItem.tooltip = 'Neko Engine: Error — Click to view status';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
  }
  statusBarItem.show();
}

function getEngineRuntimeStatus(): NekoEngineRuntimeStatus {
  const port = frameServerPort ?? getNativeFrameServerPort();
  return {
    state: runtimeState,
    ...(port !== undefined
      ? {
          endpoint: {
            host: '127.0.0.1',
            port,
            address: `127.0.0.1:${port}`,
            url: `http://127.0.0.1:${port}`,
          },
          health: 'unknown' as const,
        }
      : {}),
  };
}

function getNativeFrameServerPort(): number | undefined {
  return manager?.frameServerPort;
}

/**
 * Log to output channel
 */
function log(message: string, level: 'info' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = level === 'error' ? '❌' : '📋';
  outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);

  const extensionLogger = getLogger('Extension');
  if (level === 'error') {
    extensionLogger.error(message);
  } else {
    extensionLogger.info(message);
  }
}

// =============================================================================
// Deactivation
// =============================================================================

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
  log('Deactivating extension...');

  // Cancel ongoing exports
  if (exportService) {
    await exportService.cancel();
    exportService.dispose();
    exportService = null;
  }

  // Dispose engine manager
  if (manager) {
    await manager.disposeEngines();
    manager.dispose();
    manager = null;
  }

  frameServerPort = null;
  ensureFrameServerPromise = null;

  log('Extension deactivated');
}
