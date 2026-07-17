/**
 * AIActionHandler - Routes webview AI action requests to backend services.
 *
 * Responsibilities:
 * - Receive 'executeAIAction' messages from webview
 * - Route retained media analysis to EngineClient
 * - Send progress/result messages back to webview
 *
 * Design:
 * - Lazy EngineClient dependency resolution
 * - Removed local ML actions fail visibly instead of falling back to Engine media routes
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { EngineClient } from '@neko/neko-client';
import type { TimelineElement } from '@neko/shared';
import { resolveMediaPath } from './tools/helpers';
import { getLogger, getService } from '../base';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import type { VideoEditorModel } from '../editor/video/videoEditorModel';

const logger = getLogger('AIActionHandler');

// =============================================================================
// Types
// =============================================================================

type AIActionId = 'ai-auto-edit' | 'ai-match-music' | 'ai-remove-silence';

interface AIActionContext {
  actionId: AIActionId;
  elementIds: string[];
  trackIds?: string[];
  params?: Record<string, unknown>;
}

// =============================================================================
// AIActionHandler
// =============================================================================

export class AIActionHandler implements vscode.Disposable {
  private _engineClient: EngineClient | null = null;
  private _engineInitPromise: Promise<EngineClient | null> | null = null;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly _documentUri: vscode.Uri,
  ) {}

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Handle an AI action request from the webview.
   */
  async handleAction(
    actionId: string,
    elementIds: string[],
    trackIds?: string[],
    params?: Record<string, unknown>,
  ): Promise<void> {
    const ctx: AIActionContext = {
      actionId: actionId as AIActionId,
      elementIds,
      trackIds,
      params,
    };

    logger.info(`AI action requested: ${actionId}`, { elementIds, trackIds });
    this.sendStarted(ctx);

    try {
      switch (ctx.actionId) {
        // P0: Local engine audio analysis
        case 'ai-remove-silence':
          await this.handleRemoveSilence(ctx);
          break;

        // P2: Stub (future implementation)
        case 'ai-auto-edit':
        case 'ai-match-music':
          this.sendResult(ctx, false, undefined, `${actionId} is not yet available. Coming soon.`);
          break;

        default:
          this.sendResult(ctx, false, undefined, `Unknown AI action: ${actionId}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`AI action ${actionId} failed`, err);
      this.sendResult(ctx, false, undefined, message);
    }
  }

  dispose(): void {
    this._engineClient = null;
    this._engineInitPromise = null;
  }

  // ===========================================================================
  // P0: Local engine audio analysis
  // ===========================================================================

  private async handleRemoveSilence(ctx: AIActionContext): Promise<void> {
    const engine = await this.ensureEngine();
    if (!engine) return this.sendEngineUnavailable(ctx);

    const thresholdDbfs = (ctx.params?.['thresholdDbfs'] as number) ?? -40;
    const minDuration = (ctx.params?.['minDuration'] as number) ?? 0.5;

    this.sendProgress(ctx, 10, 'Preparing silence detection...');

    const inputPath = await this.resolveElementSourcePath(ctx.elementIds[0], ctx.params);
    if (!inputPath) {
      return this.sendResult(ctx, false, undefined, 'Could not resolve element source file');
    }

    this.sendProgress(ctx, 30, 'Analyzing audio for silence regions...');
    const result = await engine.detectSilence(inputPath, thresholdDbfs, minDuration);

    this.sendProgress(ctx, 90, 'Silence detection complete');
    this.sendResult(ctx, true, result);
  }

  // ===========================================================================
  // Message helpers
  // ===========================================================================

  private sendStarted(ctx: AIActionContext): void {
    this.webview.postMessage({
      type: 'aiActionStatus',
      actionId: ctx.actionId,
      status: 'running',
      progress: 0,
      message: 'Started',
    });
  }

  private sendProgress(ctx: AIActionContext, progress: number, message: string): void {
    this.webview.postMessage({
      type: 'aiActionStatus',
      actionId: ctx.actionId,
      status: 'running',
      progress,
      message,
    });
  }

  private sendResult(
    ctx: AIActionContext,
    success: boolean,
    _data?: unknown,
    error?: string,
  ): void {
    this.webview.postMessage({
      type: 'aiActionStatus',
      actionId: ctx.actionId,
      status: success ? 'completed' : 'failed',
      progress: success ? 100 : undefined,
      message: success ? 'Completed' : undefined,
      error,
    });
  }

  private sendEngineUnavailable(ctx: AIActionContext): void {
    this.sendResult(
      ctx,
      false,
      undefined,
      'neko-engine is not available. Please ensure the engine extension is installed and running.',
    );
  }

  // ===========================================================================
  // Dependency resolution
  // ===========================================================================

  private async ensureEngine(): Promise<EngineClient | null> {
    if (this._engineClient) return this._engineClient;
    if (this._engineInitPromise) return this._engineInitPromise;

    this._engineInitPromise = (async () => {
      try {
        const result = await vscode.commands.executeCommand<{ port: number }>(
          'neko.engine.ensureFrameServer',
        );
        if (!result?.port) {
          logger.warn('Engine frame server not available');
          return null;
        }
        const { EngineClient } = await import('@neko/neko-client');
        this._engineClient = new EngineClient(result.port);
        return this._engineClient;
      } catch (err) {
        logger.error('Failed to initialize EngineClient', err);
        return null;
      }
    })();

    const client = await this._engineInitPromise;
    this._engineInitPromise = null;
    return client;
  }

  // ===========================================================================
  // File path helpers
  // ===========================================================================

  /**
   * Resolve the source file path for a timeline element.
   *
   * Priority:
   *   1. Explicit sourcePath from action params (webview passes it)
   *   2. Lookup element by ID from the active VideoEditorModel
   *   3. Project directory fallback (from _documentUri)
   */
  private async resolveElementSourcePath(
    elementId: string | undefined,
    params?: Record<string, unknown>,
  ): Promise<string | null> {
    // 1. Explicit sourcePath from caller
    const explicit = params?.['sourcePath'];
    if (typeof explicit === 'string' && explicit.length > 0) {
      return this.resolveMediaSource(explicit);
    }

    // 2. Lookup element src from project data
    if (elementId) {
      const src = this.findElementSrc(elementId);
      if (src) {
        return this.resolveMediaSource(src);
      }
    }

    // 3. Fallback: project file directory
    if (this._documentUri) {
      return path.dirname(this._documentUri.fsPath);
    }
    return null;
  }

  private async resolveMediaSource(source: string): Promise<string> {
    if (!this._documentUri) return source;
    return resolveMediaPath(source, path.dirname(this._documentUri.fsPath), {
      documentUri: this._documentUri,
      projectFilePath: this._documentUri.fsPath,
      fileExists: (filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile(),
    });
  }

  /**
   * Find element src from active VideoEditorModel's project data.
   */
  private findElementSrc(elementId: string): string | null {
    const editorRegistry = getService(IEditorRegistry);
    if (!editorRegistry) return null;

    const editor = editorRegistry.getEditorByUri(this._documentUri);
    if (!editor || editor.type !== 'video') return null;

    const model = editor as unknown as VideoEditorModel;
    const project = model.getProjectData();
    if (!project?.tracks) return null;

    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.id === elementId && 'src' in element) {
          return (element as TimelineElement & { src: string }).src;
        }
      }
    }
    return null;
  }
}
