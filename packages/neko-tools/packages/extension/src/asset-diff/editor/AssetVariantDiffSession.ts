import * as vscode from 'vscode';
import type { AssetEntity, AssetVariant } from '@neko/shared';

export interface IAssetVariantDiffMessageHandler extends vscode.Disposable {
  initializeDiff(): Promise<void>;
  handleMessage(message: unknown): Promise<void>;
  disposeAsync(): Promise<void>;
}

export interface IAssetVariantDiffSession extends vscode.Disposable {
  attach(onDidDispose: () => void): void;
  start(): Promise<void>;
  disposeAsync(): Promise<void>;
}

export interface IAssetVariantDiffSessionOptions {
  webviewPanel: vscode.WebviewPanel;
  entity: AssetEntity;
  variantA: AssetVariant;
  variantB: AssetVariant;
}

export interface IAssetVariantDiffSessionFactory {
  createSession(options: IAssetVariantDiffSessionOptions): IAssetVariantDiffSession;
  dispose(): void;
}

export class AssetVariantDiffSession implements IAssetVariantDiffSession {
  private readonly disposables: vscode.Disposable[] = [];
  private isAttached = false;
  private isDisposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly messageHandler: IAssetVariantDiffMessageHandler,
  ) {}

  attach(onDidDispose: () => void): void {
    if (this.isDisposed || this.isAttached) {
      return;
    }

    this.isAttached = true;
    this.disposables.push(
      this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
        await this.messageHandler.handleMessage(message);
      }),
      this.webviewPanel.onDidDispose(() => {
        void this.disposeAsync().finally(onDidDispose);
      }),
    );
  }

  async start(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    await this.messageHandler.initializeDiff();
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
