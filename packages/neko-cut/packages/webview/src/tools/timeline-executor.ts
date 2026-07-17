/**
 * Timeline Tool Executor
 * Handles tool execution requests from Extension via postMessage
 */

import type { ToolHandler, ToolExecuteRequest, ToolHandlerResult } from './types';
import { useEditorStore } from '../stores/editor-store';
import { exportHandlers, updateExportProgress } from './handlers/export-handlers';
import { renderHandlers, updateRenderTask } from './handlers/render-handlers';
import { getVSCodeAPI } from '../utils/vscodeApi';
import { getLogger } from '../utils/logger';

const logger = getLogger('TimelineToolExecutor');

// Track initialization state to prevent duplicate listeners
let isInitialized = false;
let messageHandler: ((event: MessageEvent) => void) | null = null;

/**
 * Registry of all tool handlers
 */
const toolHandlers: Map<string, ToolHandler> = new Map();

/**
 * Register tool handlers
 */
function registerHandlers(): void {
  // Export tools（Extension FFmpeg）
  Object.entries(exportHandlers).forEach(([name, handler]) => {
    toolHandlers.set(name, handler);
  });

  // Render tools (render_frame, render_clip, get_thumbnail)
  Object.entries(renderHandlers).forEach(([name, handler]) => {
    toolHandlers.set(name, handler);
  });

  logger.info(`Registered ${toolHandlers.size} tool handlers`);
}

/**
 * Execute a tool by name
 */
async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
): Promise<ToolHandlerResult> {
  const handler = toolHandlers.get(toolName);

  if (!handler) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  try {
    return await handler(params);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle tool execution message from Extension
 */
function handleToolMessage(message: ToolExecuteRequest): void {
  const { requestId, toolName, params } = message;

  executeTool(toolName, params).then((result) => {
    // Send result back to Extension
    const vscode = getVSCodeAPI();
    if (vscode) {
      vscode.postMessage({
        type: 'tool.result',
        requestId,
        success: result.success,
        result: result.data,
        error: result.error,
      });
    }
  });
}

/**
 * Initialize the tool executor
 * Should be called once when the webview starts
 */
export function initToolExecutor(): void {
  // Prevent duplicate initialization
  if (isInitialized) {
    logger.warn('Already initialized, skipping');
    return;
  }

  // Register all handlers
  registerHandlers();

  // Create message handler
  messageHandler = (event: MessageEvent) => {
    const message = event.data;
    if (message?.type === 'tool.execute') {
      handleToolMessage(message as ToolExecuteRequest);
    } else if (message?.type?.startsWith?.('export:')) {
      // Handle Extension FFmpeg export protocol updates (export:*)
      switch (message.type) {
        case 'export:progress': {
          const stage = message.stage as string | undefined;
          const status =
            stage === 'completed'
              ? 'completed'
              : stage === 'error' || stage === 'cancelled'
                ? 'failed'
                : stage === 'muxing'
                  ? 'muxing'
                  : 'encoding';

          updateExportProgress(message.jobId, {
            status,
            progress: message.progress,
            currentFrame: message.currentFrame,
            totalFrames: message.totalFrames,
            estimatedTimeRemaining: message.estimatedRemaining,
          });
          updateRenderTask(message.jobId, {
            status:
              status === 'failed' ? 'failed' : status === 'completed' ? 'completed' : 'rendering',
            progress: message.progress,
            currentFrame: message.currentFrame,
            totalFrames: message.totalFrames,
            error: status === 'failed' ? (message.error as string | undefined) : undefined,
          });
          break;
        }
        case 'export:complete': {
          updateExportProgress(message.jobId, {
            status: 'completed',
            progress: 100,
            outputPath: message.outputPath,
          });
          updateRenderTask(message.jobId, {
            status: 'completed',
            progress: 100,
            result: message.outputPath,
          });
          break;
        }
        case 'export:error': {
          updateExportProgress(message.jobId, {
            status: 'failed',
            error: message.error,
          });
          updateRenderTask(message.jobId, {
            status: 'failed',
            error: message.error,
          });
          break;
        }
        case 'export:cancelled': {
          updateExportProgress(message.jobId, {
            status: 'failed',
            error: 'Cancelled',
          });
          updateRenderTask(message.jobId, {
            status: 'failed',
            error: 'Cancelled',
          });
          break;
        }
      }
    }
  };

  // Listen for tool execution messages
  window.addEventListener('message', messageHandler);
  isInitialized = true;

  logger.info('Initialized');
}

/**
 * Dispose the tool executor
 * Should be called when the webview is unmounted
 */
export function disposeToolExecutor(): void {
  if (!isInitialized) {
    return;
  }

  if (messageHandler) {
    window.removeEventListener('message', messageHandler);
    messageHandler = null;
  }

  toolHandlers.clear();
  isInitialized = false;

  logger.info('Disposed');
}

/**
 * Get the editor store for handlers
 */
export function getEditorStore(): typeof useEditorStore {
  return useEditorStore;
}
