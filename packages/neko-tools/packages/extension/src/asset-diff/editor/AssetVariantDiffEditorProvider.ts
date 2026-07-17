/**
 * AssetVariantDiffEditorProvider - Asset Variant Diff Custom Editor
 *
 * Provides a custom editor for viewing asset variant differences.
 * Similar to MediaDiffEditorProvider but specialized for comparing
 * two variants of the same asset entity.
 *
 * Features:
 * - Side-by-side variant comparison
 * - Attribute difference highlighting
 * - Media file diff integration
 * - AI analysis support
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { AssetEntity, AssetVariant, VariantComparisonResult } from '@neko/shared';
import {
  createHostContentAccessRuntime,
  injectLocaleAttribute,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import {
  type IAssetVariantDiffSession,
  type IAssetVariantDiffSessionFactory,
} from './AssetVariantDiffSession';
import { AssetVariantDiffSessionFactory } from './AssetVariantDiffSessionFactory';

// Storage key for persisting comparison state
const COMPARISON_STATE_KEY = 'assetVariantDiff.comparisonState';

// Comparison state structure
interface ComparisonState {
  entityId: string;
  variantIdA: string;
  variantIdB: string;
}

// =============================================================================
// Virtual Document Provider
// =============================================================================

/**
 * Virtual file system for asset variant diff documents
 */
export class AssetVariantDiffFileSystemProvider implements vscode.FileSystemProvider {
  private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._emitter.event;

  watch(): vscode.Disposable {
    return { dispose: () => {} };
  }

  stat(): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: 0,
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {}

  readFile(): Uint8Array {
    // Return empty content - the actual data is fetched via messages
    return new Uint8Array();
  }

  writeFile(): void {}

  delete(): void {}

  rename(): void {}
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Custom editor provider for asset variant diff visualization
 */
export class AssetVariantDiffEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'neko.assetVariantDiff';
  public static readonly scheme = 'asset-variant-diff';

  private activeWebviews: Map<string, vscode.WebviewPanel> = new Map();
  private activeSessions: Map<string, IAssetVariantDiffSession> = new Map();
  /** Map from document URI to comparison state */
  private comparisonStates: Map<string, ComparisonState> = new Map();
  private isDisposed = false;
  private disposePromise: Promise<void> | null = null;
  private readonly localResourceAccess: LocalResourceAccessService;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getEntity: (id: string) => Promise<AssetEntity | null>,
    private readonly compareVariants?: (
      entityId: string,
      variantIdA: string,
      variantIdB: string,
    ) => Promise<VariantComparisonResult>,
    sessionFactory?: IAssetVariantDiffSessionFactory,
  ) {
    this.sessionFactory = sessionFactory ?? new AssetVariantDiffSessionFactory(compareVariants);
    const contentRuntime = createHostContentAccessRuntime({
      extensionUri: context.extensionUri,
      context,
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });
    if (!contentRuntime.localResourceAccess) {
      throw new Error('Asset variant diff editor requires LocalResourceAccessService.');
    }
    this.localResourceAccess = contentRuntime.localResourceAccess;
    // Restore persisted comparison states
    this.restoreComparisonStates();
  }

  private readonly sessionFactory: IAssetVariantDiffSessionFactory;

  /**
   * Restore comparison states from workspace state
   */
  private restoreComparisonStates(): void {
    const stored =
      this.context.workspaceState.get<Record<string, ComparisonState>>(COMPARISON_STATE_KEY);
    if (stored) {
      for (const [uri, state] of Object.entries(stored)) {
        this.comparisonStates.set(uri, state);
      }
    }
  }

  /**
   * Persist comparison states to workspace state
   */
  private persistComparisonStates(): void {
    const toStore: Record<string, ComparisonState> = {};
    for (const [uri, state] of this.comparisonStates.entries()) {
      toStore[uri] = state;
    }
    this.context.workspaceState.update(COMPARISON_STATE_KEY, toStore);
  }

  /**
   * Set up comparison state for a document
   */
  setComparisonState(documentUri: vscode.Uri, state: ComparisonState): void {
    this.comparisonStates.set(documentUri.toString(), state);
    this.persistComparisonStates();
  }

  /**
   * Clear comparison state for a document
   */
  clearComparisonState(documentUri: vscode.Uri): void {
    this.comparisonStates.delete(documentUri.toString());
    this.persistComparisonStates();
  }

  /**
   * Create a URI for comparing two variants
   */
  static createCompareUri(entityId: string, variantIdA: string, variantIdB: string): vscode.Uri {
    return vscode.Uri.parse(
      `${AssetVariantDiffEditorProvider.scheme}:/${entityId}/${variantIdA}-vs-${variantIdB}.asset-diff`,
    );
  }

  /**
   * Open a file for diff viewing
   */
  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  /**
   * Resolve the custom editor
   */
  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const docUri = document.uri.toString();
    this.activeWebviews.set(docUri, webviewPanel);

    // Get comparison state
    const state = this.comparisonStates.get(docUri);
    if (!state) {
      webviewPanel.webview.html = this.getErrorHtml(
        vscode.l10n.t('assetDiff.error.comparisonStateNotFound'),
      );
      return;
    }

    // Load entity and variants
    const entity = await this.getEntity(state.entityId);
    if (!entity) {
      webviewPanel.webview.html = this.getErrorHtml(
        vscode.l10n.t('assetDiff.error.entityNotFound', state.entityId),
      );
      return;
    }

    const variantA = entity.variants.find((v) => v.id === state.variantIdA);
    const variantB = entity.variants.find((v) => v.id === state.variantIdB);

    if (!variantA || !variantB) {
      webviewPanel.webview.html = this.getErrorHtml(
        vscode.l10n.t('assetDiff.error.variantsNotFound'),
      );
      return;
    }

    // Set panel title
    webviewPanel.title = `${variantA.name} ↔ ${variantB.name}`;

    await this.localResourceAccess.configureWebview(webviewPanel.webview, {
      enableScripts: true,
      extraRoots: collectVariantFileRoots(variantA, variantB),
    });

    // Set webview HTML
    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      entity,
      variantA,
      variantB,
    );

    const session = this.sessionFactory.createSession({
      webviewPanel,
      entity,
      variantA,
      variantB,
    });

    if (this.isDisposed) {
      await session.disposeAsync();
      return;
    }

    this.activeSessions.set(docUri, session);
    session.attach(() => {
      this.activeWebviews.delete(docUri);
      this.activeSessions.delete(docUri);
    });

    try {
      await session.start();
    } catch (error) {
      this.activeWebviews.delete(docUri);
      this.activeSessions.delete(docUri);
      await session.disposeAsync();
      throw error;
    }
  }

  /**
   * Get error HTML
   */
  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-errorForeground);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body>
  <div>${message}</div>
</body>
</html>`;
  }

  /**
   * Get HTML content for webview
   */
  private getHtmlForWebview(
    webview: vscode.Webview,
    entity: AssetEntity,
    variantA: AssetVariant,
    variantB: AssetVariant,
  ): string {
    const nonce = getNonce();
    const localeAttributes = injectLocaleAttribute();

    const fileA = variantA.files[0];
    const fileB = variantB.files[0];
    const project = this.localResourceAccess.createSyncProjector(
      webview,
      webview.options.localResourceRoots ?? [],
      { caller: 'neko-tools.asset-variant-diff' },
    );
    const imageUriA = fileA ? project(fileA.path) : null;
    const imageUriB = fileB ? project(fileB.path) : null;
    const initialState = JSON.stringify({
      entity: {
        id: entity.id,
        name: entity.name,
        category: entity.category,
      },
      variantA: {
        id: variantA.id,
        name: variantA.name,
        attributes: variantA.attributes,
        fileCount: variantA.files.length,
        hasImage: !!imageUriA,
        fileName: fileA?.name ?? null,
        filePath: fileA?.path ?? null,
      },
      variantB: {
        id: variantB.id,
        name: variantB.name,
        attributes: variantB.attributes,
        fileCount: variantB.files.length,
        hasImage: !!imageUriB,
        fileName: fileB?.name ?? null,
        filePath: fileB?.path ?? null,
      },
      imageUriA: imageUriA ?? null,
      imageUriB: imageUriB ?? null,
    });
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'assetDiff.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'style.css'),
    );

    return `<!DOCTYPE html>
<html ${localeAttributes}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} https: data: blob:;">
  <title>${vscode.l10n.t('assetDiff.title')}</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.assetDiffInitialState = ${initialState};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  async disposeAsync(): Promise<void> {
    this.disposePromise ??= this.disposeInternal();
    return this.disposePromise;
  }

  dispose(): void {
    void this.disposeAsync();
  }

  private async disposeInternal(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    const sessions = [...this.activeSessions.values()];
    this.activeSessions.clear();
    this.activeWebviews.clear();

    await Promise.allSettled(sessions.map((session) => session.disposeAsync()));

    this.sessionFactory.dispose();
    this.comparisonStates.clear();
  }
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function collectVariantFileRoots(variantA: AssetVariant, variantB: AssetVariant): vscode.Uri[] {
  const roots = new Map<string, vscode.Uri>();
  for (const file of [...variantA.files, ...variantB.files]) {
    if (!file.path || !path.isAbsolute(file.path)) continue;
    const root = vscode.Uri.file(path.dirname(file.path));
    roots.set(root.toString(), root);
  }
  return [...roots.values()];
}
