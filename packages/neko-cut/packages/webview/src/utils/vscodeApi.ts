/**
 * VSCode API Wrapper - Type-safe singleton for VSCode Webview API access
 *
 * Re-exports core VSCode API from @neko/shared and adds webview-specific
 * message types and helper functions.
 */

// Re-export core VSCode API from shared (subpath import for browser-only module)
export {
  getVSCodeAPI,
  isVSCodeContext,
  postMessage,
  getState,
  setState,
  sendRequest,
  cancelRequest,
  getPendingRequestCount,
  vscodeApi,
  type VSCodeAPI,
  type RequestMessage,
  type VSCodeResponseMessage,
  type PendingRequest,
  type SendRequestOptions,
} from '@neko/shared/vscode';

// Import for local use
import { postMessage } from '@neko/shared/vscode';

// =============================================================================
// Webview-specific Message Types
// =============================================================================

export interface AIActionMessage {
  type: 'executeAIAction';
  actionId: string;
  elementIds: string[];
  trackIds?: string[];
}

export interface RequestFileMessage {
  type: 'requestFile';
  path: string;
}

export interface SaveMessage {
  type: 'save';
  content: unknown;
}

export interface ExportDialogMessage {
  type: 'showExportDialog';
  filename: string;
  format: string;
}

export type WebviewMessage =
  | AIActionMessage
  | RequestFileMessage
  | SaveMessage
  | ExportDialogMessage
  | { type: string; [key: string]: unknown };

// =============================================================================
// Webview-specific Helper Functions
// =============================================================================

/**
 * Type-safe message sender for webview messages
 */
export function sendMessage<T extends WebviewMessage>(message: T): void {
  postMessage(message);
}

/**
 * Send AI action to Extension Host
 */
export function sendAIAction(actionId: string, elementIds: string[], trackIds?: string[]): void {
  sendMessage<AIActionMessage>({
    type: 'executeAIAction',
    actionId,
    elementIds,
    trackIds,
  });
}
