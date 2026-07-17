/**
 * CbzPreviewProvider - CustomReadonlyEditorProvider for CBZ comic archives
 *
 * On ready: registers the archive with the Preview Node host and sends its Range URL.
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

export class CbzPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.cbzPreview';

  /** Concrete panel → independently owned Node registration. */
  private readonly registrations = new Map<vscode.WebviewPanel, DocumentPanelRegistration>();
  /** fsPath → webview panel */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** fsPath → pending page navigation */
  private readonly pendingPageNumbers = new Map<string, number>();

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
    this.panels.set(filePath, webviewPanel);
    const registration = new DocumentPanelRegistration(
      () =>
        previewFileServer.registerFile(filePath, {
          sourceDocumentUri: document.uri,
        }),
      (token) => previewFileServer.unregisterFile(token),
    );
    this.registrations.set(webviewPanel, registration);

    webviewPanel.onDidDispose(() => {
      if (this.panels.get(filePath) === webviewPanel) {
        this.panels.delete(filePath);
      }
      this.registrations.delete(webviewPanel);
      registration.dispose();
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'cbz', {
      statusBar: this._statusBar,
      context: this._context,
      onReady: async () => {
        try {
          const { url } = await registration.getOrCreate();

          await webviewPanel.webview.postMessage({
            type: 'document:data',
            payload: { url },
          });
          this.flushPendingNavigation(filePath);
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

  navigateToPage(pageNumber: number, uri: vscode.Uri): boolean {
    const panel = this.panels.get(uri.fsPath);
    if (!panel) {
      this.pendingPageNumbers.set(uri.fsPath, pageNumber);
      return false;
    }
    this.postPageNavigation(panel, pageNumber);
    return true;
  }

  private flushPendingNavigation(filePath: string): void {
    const pageNumber = this.pendingPageNumbers.get(filePath);
    const panel = this.panels.get(filePath);
    if (pageNumber === undefined || !panel) return;
    this.pendingPageNumbers.delete(filePath);
    this.postPageNavigation(panel, pageNumber);
  }

  private postPageNavigation(panel: vscode.WebviewPanel, pageNumber: number): void {
    void panel.webview.postMessage({
      type: 'document:navigate',
      payload: { locator: { kind: 'page', pageNumber, pageIndex: Math.max(0, pageNumber - 1) } },
    });
  }

  dispose(): void {
    for (const registration of this.registrations.values()) registration.dispose();
    this.registrations.clear();
    this.panels.clear();
    this.pendingPageNumbers.clear();
  }
}
