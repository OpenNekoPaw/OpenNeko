/**
 * DocxPreviewProvider - CustomReadonlyEditorProvider for DOCX/DOC files
 *
 * On ready: registers the file with the Preview Node host and sends its URL.
 * Webview fetches the full file via HTTP, then passes to docx-preview.
 */

import * as vscode from 'vscode';
import {
  setupDocumentWebview,
  getErrorHtml,
  getUnresolvedVariableHtml,
} from './documentProviderHelper';
import { previewFileServer, UnresolvedPathVariableError } from './PreviewFileServer';
import { DocumentPanelRegistration } from './DocumentPanelRegistration';
import type { StatusBarManager } from '../../ui/StatusBarManager';

export class DocxPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.docxPreview';

  /** Concrete panel → independently owned Node registration. */
  private readonly registrations = new Map<vscode.WebviewPanel, DocumentPanelRegistration>();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar?: StatusBarManager,
    private readonly _context?: vscode.ExtensionContext,
  ) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const filePath = document.uri.fsPath;
    const registration = new DocumentPanelRegistration(
      () =>
        previewFileServer.registerFile(filePath, {
          sourceDocumentUri: document.uri,
        }),
      (token) => previewFileServer.unregisterFile(token),
    );
    this.registrations.set(webviewPanel, registration);

    webviewPanel.onDidDispose(() => {
      this.registrations.delete(webviewPanel);
      registration.dispose();
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'docx', {
      statusBar: this._statusBar,
      context: this._context,
      onReady: async () => {
        try {
          const { url } = await registration.getOrCreate();

          await webviewPanel.webview.postMessage({
            type: 'document:data',
            payload: { url },
          });
        } catch (err) {
          if (err instanceof UnresolvedPathVariableError) {
            webviewPanel.webview.html = getUnresolvedVariableHtml(err.variable, err.originalPath);
          } else {
            webviewPanel.webview.html = getErrorHtml(
              err instanceof Error ? err.message : String(err),
            );
          }
        }
      },
    });
  }

  dispose(): void {
    for (const registration of this.registrations.values()) registration.dispose();
    this.registrations.clear();
  }
}
