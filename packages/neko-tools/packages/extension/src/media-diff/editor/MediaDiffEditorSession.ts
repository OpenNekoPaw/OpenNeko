import * as vscode from 'vscode';
import { parseMediaDiffRequest, type MediaDiffRequest } from '@neko-tools/contracts';

export interface IMediaDiffEditorMessageHandler extends vscode.Disposable {
  handleMessage(message: MediaDiffRequest): Promise<void>;
  disposeAsync(): Promise<void>;
}

export interface IMediaDiffEditorSession extends vscode.Disposable {
  attach(onDidDispose: () => void): void;
  start(requiresRecompare?: boolean): Promise<void>;
  disposeAsync(): Promise<void>;
}

export interface IMediaDiffEditorSessionOptions {
  webviewPanel: vscode.WebviewPanel;
  documentUri: vscode.Uri;
  sessionId: string;
  previousUri?: vscode.Uri;
}

export interface IMediaDiffEditorSessionFactory {
  createSession(options: IMediaDiffEditorSessionOptions): Promise<IMediaDiffEditorSession>;
  dispose(): void;
}

export class MediaDiffEditorSession implements IMediaDiffEditorSession {
  private readonly disposables: vscode.Disposable[] = [];
  private isAttached = false;
  private isDisposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly messageHandler: IMediaDiffEditorMessageHandler,
    private readonly sessionId: string,
  ) {}

  attach(onDidDispose: () => void): void {
    if (this.isDisposed || this.isAttached) {
      return;
    }

    this.isAttached = true;
    this.disposables.push(
      this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
        await this.messageHandler.handleMessage(parseMediaDiffRequest(message, this.sessionId));
      }),
      this.webviewPanel.onDidDispose(() => {
        void this.disposeAsync().finally(onDidDispose);
      }),
    );
  }

  async start(_requiresRecompare: boolean = false): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    // The Webview sends the initial request after installing its listener so
    // every response is correlated to an explicit request identity.
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

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }

    await this.messageHandler.disposeAsync();
  }
}
