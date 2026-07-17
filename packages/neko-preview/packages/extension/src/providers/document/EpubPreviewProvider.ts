/**
 * EpubPreviewProvider - CustomReadonlyEditorProvider for EPUB ebooks
 *
 * On ready: registers the archive with the Preview Node host and sends a directory URL.
 * Webview uses epub.js directory mode to fetch bounded entries on demand.
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
import type { DocumentStatusPayload } from '../../types/document-messages';

export interface EpubActiveLocation {
  uri: vscode.Uri;
  currentPage?: number;
  pageCount?: number;
  chapterHref?: string;
  chapterTitle?: string;
}

export class EpubPreviewProvider implements vscode.CustomReadonlyEditorProvider, vscode.Disposable {
  static readonly viewType = 'neko.epubPreview';

  /** URI fsPath → webview panel */
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  /** Concrete panel → independently owned Node registration. */
  private readonly registrations = new Map<vscode.WebviewPanel, DocumentPanelRegistration>();
  /** fsPath → current reading location */
  private readonly locations = new Map<string, Omit<EpubActiveLocation, 'uri'>>();
  /** fsPath → pending webview navigation message */
  private readonly pendingNavigation = new Map<string, unknown>();
  private _activeUri: vscode.Uri | null = null;

  private readonly _onDidChangeActiveEpub = new vscode.EventEmitter<vscode.Uri | null>();
  /** Fires when the active EPUB editor changes (or becomes null). */
  readonly onDidChangeActiveEpub = this._onDidChangeActiveEpub.event;
  private readonly _onDidChangeActiveLocation =
    new vscode.EventEmitter<EpubActiveLocation | null>();
  /** Fires when the active EPUB reading location changes. */
  readonly onDidChangeActiveLocation = this._onDidChangeActiveLocation.event;

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
    const key = document.uri.fsPath;
    this.panels.set(key, webviewPanel);
    const registration = new DocumentPanelRegistration(
      () =>
        previewFileServer.registerEpub(document.uri.fsPath, {
          sourceDocumentUri: document.uri,
        }),
      (token) => previewFileServer.unregisterFile(token),
    );
    this.registrations.set(webviewPanel, registration);

    const emitActiveLocation = (): void => {
      if (this._activeUri?.fsPath !== key) return;
      this._onDidChangeActiveLocation.fire(this.getActiveLocation());
    };

    webviewPanel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        this._activeUri = document.uri;
        this._onDidChangeActiveEpub.fire(document.uri);
        emitActiveLocation();
      } else if (this._activeUri?.fsPath === key) {
        this._activeUri = null;
        this._onDidChangeActiveEpub.fire(null);
        this._onDidChangeActiveLocation.fire(null);
      }
    });

    if (webviewPanel.active) {
      this._activeUri = document.uri;
      this._onDidChangeActiveEpub.fire(document.uri);
    }

    webviewPanel.onDidDispose(() => {
      if (this.panels.get(key) === webviewPanel) {
        this.panels.delete(key);
      }
      this.locations.delete(key);
      this.registrations.delete(webviewPanel);
      registration.dispose();
      if (this._activeUri?.fsPath === key) {
        this._activeUri = null;
        this._onDidChangeActiveEpub.fire(null);
        this._onDidChangeActiveLocation.fire(null);
      }
    });

    await setupDocumentWebview(document, webviewPanel, this._extensionUri, 'epub', {
      statusBar: this._statusBar,
      context: this._context,
      onReady: async () => {
        try {
          const { url } = await registration.getOrCreate();

          await webviewPanel.webview.postMessage({
            type: 'document:data',
            payload: { url },
          });
          this.flushPendingNavigation(key);
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
      onStatusUpdate: (payload) => {
        this.updateLocation(document.uri, payload);
        emitActiveLocation();
      },
      onMessage: (_msg) => {
        // EPUB-specific messages handled here if needed
      },
    });
  }

  /** Navigate the active (or specified) EPUB webview to a chapter href. */
  navigateToChapter(href: string, uri?: vscode.Uri): boolean {
    const key = uri?.fsPath ?? this._activeUri?.fsPath;
    if (!key) return false;
    const panel = this.panels.get(key);
    const message = { type: 'epub:navigate', payload: { href } };
    if (!panel) {
      this.pendingNavigation.set(key, message);
      return false;
    }
    void panel.webview.postMessage(message);
    return true;
  }

  navigateToPage(pageNumber: number, uri: vscode.Uri): boolean {
    const panel = this.panels.get(uri.fsPath);
    const message = {
      type: 'document:navigate',
      payload: { locator: { kind: 'page', pageNumber, pageIndex: Math.max(0, pageNumber - 1) } },
    };
    if (!panel) {
      this.pendingNavigation.set(uri.fsPath, message);
      return false;
    }
    void panel.webview.postMessage(message);
    return true;
  }

  getActiveUri(): vscode.Uri | null {
    return this._activeUri;
  }

  getActiveLocation(): EpubActiveLocation | null {
    const activeUri = this._activeUri;
    if (!activeUri) return null;
    return {
      uri: activeUri,
      ...(this.locations.get(activeUri.fsPath) ?? {}),
    };
  }

  private updateLocation(uri: vscode.Uri, payload: DocumentStatusPayload): void {
    const previous = this.locations.get(uri.fsPath) ?? {};
    this.locations.set(uri.fsPath, {
      currentPage: payload.currentPage ?? previous.currentPage,
      pageCount: payload.pageCount ?? previous.pageCount,
      chapterHref: payload.chapterHref ?? previous.chapterHref,
      chapterTitle: payload.chapterTitle ?? previous.chapterTitle,
    });
  }

  private flushPendingNavigation(key: string): void {
    const message = this.pendingNavigation.get(key);
    const panel = this.panels.get(key);
    if (!message || !panel) return;
    this.pendingNavigation.delete(key);
    void panel.webview.postMessage(message);
  }

  dispose(): void {
    for (const registration of this.registrations.values()) registration.dispose();
    this.registrations.clear();
    this.panels.clear();
    this.locations.clear();
    this.pendingNavigation.clear();
    this._onDidChangeActiveEpub.dispose();
    this._onDidChangeActiveLocation.dispose();
  }
}
