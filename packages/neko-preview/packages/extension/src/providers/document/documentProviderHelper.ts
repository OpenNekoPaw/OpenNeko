/**
 * Shared helper for document preview providers.
 *
 * Data flow: Extension Host registers a document with its Node loopback service,
 * then sends the opaque URL to the Webview.
 *
 * Message protocol:
 *   Extension → Webview:
 *     document:data    — { url } for direct HTTP loading
 *     epub:navigate    — chapter navigation
 *   Webview → Extension:
 *     ready            — webview mounted
 *     document:sendToAi — send selection to AI agent
 */

import * as vscode from 'vscode';
import { createDefaultLocalResourceAccessService } from '@neko/shared/vscode/extension';
import type {
  AgentContextPayload,
  DocumentContentKind,
  DocumentContextData,
  DocumentExcerpt,
  DocumentFormat,
  DocumentSourceRef,
} from '@neko/shared';
import type { PreviewEntry } from '../../utils/html';
import { getWebviewHtml } from '../../utils/html';
import { getLogger } from '../../utils/logger';
import type { StatusBarManager } from '../../ui/StatusBarManager';
import type { DocumentStatusPayload, DocumentWebviewMessage } from '../../types/document-messages';
import { handleError } from '../../utils/errorHandler';

const logger = getLogger('DocumentProvider');

/**
 * Configure a webview panel for document preview and wire up message handling.
 */
export async function setupDocumentWebview(
  document: vscode.CustomDocument,
  webviewPanel: vscode.WebviewPanel,
  extensionUri: vscode.Uri,
  entry: PreviewEntry,
  options?: {
    /** Called when the webview sends 'ready'. */
    onReady?: () => Promise<void>;
    /** Handle additional webview messages not covered by the default switch. */
    onMessage?: (msg: { type: string; payload: Record<string, unknown> }) => void;
    /** Handle document status updates after the default status-bar update. */
    onStatusUpdate?: (payload: DocumentStatusPayload) => void;
    /** StatusBarManager for document info display. */
    statusBar?: StatusBarManager;
    /** ExtensionContext for workspaceState persistence (reading progress). */
    context?: vscode.ExtensionContext;
  },
): Promise<void> {
  const filePath = document.uri.fsPath;
  const fileName = filePath.split('/').pop() ?? filePath;

  const localResourceAccess = createDefaultLocalResourceAccessService({
    extensionUri,
    ...(options?.context ? { context: options.context } : {}),
  });
  await localResourceAccess.configureWebview(webviewPanel.webview, {
    enableScripts: true,
  });

  // workspaceState key for this file's reading progress
  const stateKey = `preview:state:${document.uri.toString()}`;

  // Set HTML early
  webviewPanel.webview.html = getWebviewHtml({
    webview: webviewPanel.webview,
    extensionUri,
    entry,
  });

  let readyHandled = false;

  // Handle messages from webview
  const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
    async (msg: DocumentWebviewMessage | { type: string; payload: Record<string, unknown> }) => {
      const msgType = (msg as { type: string }).type;

      switch (msgType) {
        case 'ready': {
          if (readyHandled) return;
          readyHandled = true;
          // Restore saved reading progress before loading document data
          if (options?.context) {
            const saved = options.context.workspaceState.get<Record<string, unknown>>(stateKey);
            if (saved) {
              await webviewPanel.webview.postMessage({
                type: 'document:restoreState',
                payload: saved,
              });
            }
          }
          if (options?.onReady) {
            await options.onReady();
          }
          break;
        }

        // ── Save reading progress from webview ────────────────────────────
        case 'document:saveState': {
          if (options?.context) {
            const payload = (msg as { payload: Record<string, unknown> }).payload;
            void options.context.workspaceState.update(stateKey, payload);
          }
          break;
        }

        // ── Status bar update from webview ─────────────────────────────
        case 'document:statusUpdate': {
          const payload = (msg as { payload: DocumentStatusPayload }).payload;
          if (options?.statusBar) {
            const format =
              entry === 'epub'
                ? 'epub'
                : entry === 'cbz'
                  ? 'cbz'
                  : entry === 'docx'
                    ? 'docx'
                    : 'pdf';
            options.statusBar.showDocument({
              fileName,
              format,
              pageCount: payload.pageCount as number | undefined,
              currentPage: payload.currentPage as number | undefined,
              fileSize: payload.fileSize as number | undefined,
              zoom: payload.zoom as number | undefined,
            });
          }
          options?.onStatusUpdate?.(payload);
          break;
        }

        // ── Send content to AI agent ──────────────────────────────────
        case 'document:sendToAi': {
          const { text, imageData, contentKind, context, locator, range, excerpt } = (
            msg as DocumentWebviewMessage & { type: 'document:sendToAi' }
          ).payload;
          const normalizedContentKind = contentKind ?? inferContentKind(text, imageData);
          const source = buildDocumentSourceRef(filePath, entry);
          const normalizedExcerpt =
            excerpt ?? buildDocumentExcerpt(normalizedContentKind, text, imageData);
          const label = buildLabel(fileName, context?.page, context?.chapter);
          const intent = buildIntent(normalizedContentKind, text);
          const summary = buildSummary(normalizedContentKind, text, !!imageData);
          const data: DocumentContextData = {
            filePath,
            text,
            imageData,
            contentKind: normalizedContentKind,
            context,
            source,
            locator,
            range: range ?? {
              locator,
            },
            excerpt: normalizedExcerpt,
          };
          const payload: AgentContextPayload = {
            type: 'document-selection',
            id: `doc:${filePath}:${context?.page ?? 0}:${Date.now()}`,
            label,
            summary,
            data,
            intent,
          };
          try {
            await vscode.commands.executeCommand('neko.agent.sendContext', payload);
          } catch {
            logger.warn('neko.agent.sendContext command not available');
            void handleError(
              new Error(
                'AI Agent extension is not available. Please install neko-agent to use this feature.',
              ),
              { showToUser: true, severity: 'warning' },
            );
          }
          break;
        }

        default: {
          if (options?.onMessage) {
            options.onMessage(msg as { type: string; payload: Record<string, unknown> });
          }
        }
      }
    },
  );

  // Cleanup
  webviewPanel.onDidDispose(() => {
    messageDisposable.dispose();
    options?.statusBar?.hide();
  });
}

/**
 * Register an open command for a document type.
 */
export function registerOpenCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  viewType: string,
  fileFilters: Record<string, string[]>,
  dialogTitle: string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(commandId, async () => {
      const fileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        filters: fileFilters,
        title: dialogTitle,
      });
      if (fileUri && fileUri.length > 0) {
        await vscode.commands.executeCommand('vscode.openWith', fileUri[0], viewType);
      }
    }),
  );
}

function buildDocumentSourceRef(filePath: string, entry: PreviewEntry): DocumentSourceRef {
  return {
    filePath,
    format: detectPreviewDocumentFormat(filePath, entry),
    fileId: filePath,
  };
}

function detectPreviewDocumentFormat(filePath: string, entry: PreviewEntry): DocumentFormat {
  if (entry === 'epub' || entry === 'cbz' || entry === 'docx' || entry === 'pdf') {
    return entry;
  }
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'doc' ? 'doc' : 'unknown';
}

function buildDocumentExcerpt(
  contentKind: DocumentContentKind,
  text: string | undefined,
  imageData: string | undefined,
): DocumentExcerpt | undefined {
  if (!text && !imageData) {
    return undefined;
  }
  return {
    contentKind,
    text,
    imageData,
    truncated: false,
  };
}

function inferContentKind(
  text: string | undefined,
  imageData: string | undefined,
): DocumentContentKind {
  if (text && imageData) return 'mixed';
  if (imageData) return 'image';
  return 'text';
}

function buildIntent(contentKind: string, text: string | undefined): string {
  if (contentKind === 'mixed') return '请分析这段内容和图片：';
  if (contentKind === 'image') return '请分析这个图片：';
  if (text) return '请分析这段内容：';
  return '请分析这个文档：';
}

function buildSummary(contentKind: string, text: string | undefined, hasImage: boolean): string {
  const parts: string[] = [];
  if (text) parts.push(text.slice(0, 400));
  if (hasImage) parts.push('[Image attached]');
  return parts.join(' · ') || 'Document selection';
}

function buildLabel(fileName: string, pageNumber?: number, chapterTitle?: string): string {
  let label = fileName;
  if (pageNumber != null) label += ` p.${pageNumber}`;
  if (chapterTitle) label += ` · ${chapterTitle}`;
  return label;
}

export function getErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-errorForeground, #f44);
      font-family: var(--vscode-font-family);
      font-size: 14px; text-align: center; padding: 20px;
    }
  </style>
</head>
<body><div><p>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</p></div></body>
</html>`;
}

/**
 * Error HTML for unresolved path variables — more descriptive than generic error.
 */
export function getUnresolvedVariableHtml(variable: string, filePath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: 14px; padding: 40px;
    }
    .container { max-width: 520px; text-align: left; }
    .icon { font-size: 32px; margin-bottom: 12px; }
    h2 { margin: 0 0 8px; color: var(--vscode-errorForeground, #f44); font-size: 16px; }
    .path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px; padding: 8px 12px; margin: 12px 0; border-radius: 4px;
      background: var(--vscode-textBlockQuote-background);
      color: var(--vscode-textBlockQuote-foreground);
      word-break: break-all;
    }
    .var { color: var(--vscode-charts-orange, #e89b17); font-weight: bold; }
    ol { padding-left: 20px; margin: 12px 0; line-height: 1.8; }
    .hint { opacity: 0.7; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#9888;</div>
    <h2>Media Library Not Configured</h2>
    <p>This file references media library <span class="var">\${${variable}}</span> which is not set up on this machine.</p>
    <div class="path">${filePath.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    <p>To fix:</p>
    <ol>
      <li>Open <strong>neko/settings.json</strong> in your project</li>
      <li>Add a media library entry with variable <span class="var">${variable}</span></li>
      <li>Set the path to the directory on this machine</li>
    </ol>
    <div class="hint">Or ensure the neko-assets extension is activated and the media library is configured.</div>
  </div>
</body>
</html>`;
}
