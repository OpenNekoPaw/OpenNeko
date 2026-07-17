import type * as vscode from 'vscode';
import type { AssetEntity, AssetVariant, VariantComparisonResult } from '@neko/shared';
import { AssetVariantDiffMessageHandler } from './AssetVariantDiffMessageHandler';
import {
  type IAssetVariantDiffMessageHandler,
  type IAssetVariantDiffSession,
  type IAssetVariantDiffSessionFactory,
  type IAssetVariantDiffSessionOptions,
  AssetVariantDiffSession,
} from './AssetVariantDiffSession';

export interface IAssetVariantDiffMessageHandlerFactoryOptions {
  webview: vscode.Webview;
  entity: AssetEntity;
  variantA: AssetVariant;
  variantB: AssetVariant;
}

export type AssetVariantDiffMessageHandlerFactory = (
  options: IAssetVariantDiffMessageHandlerFactoryOptions,
) => IAssetVariantDiffMessageHandler;

export class AssetVariantDiffSessionFactory implements IAssetVariantDiffSessionFactory {
  private isDisposed = false;

  constructor(
    private readonly compareVariants?: (
      entityId: string,
      variantIdA: string,
      variantIdB: string,
    ) => Promise<VariantComparisonResult>,
    private readonly createMessageHandler: AssetVariantDiffMessageHandlerFactory = (options) =>
      new AssetVariantDiffMessageHandler(
        options.webview,
        options.entity,
        options.variantA,
        options.variantB,
        this.compareVariants,
      ),
  ) {}

  createSession(options: IAssetVariantDiffSessionOptions): IAssetVariantDiffSession {
    this.throwIfDisposed();
    const messageHandler = this.createMessageHandler({
      webview: options.webviewPanel.webview,
      entity: options.entity,
      variantA: options.variantA,
      variantB: options.variantB,
    });

    return new AssetVariantDiffSession(options.webviewPanel, messageHandler);
  }

  dispose(): void {
    this.isDisposed = true;
  }

  private throwIfDisposed(): void {
    if (this.isDisposed) {
      throw new Error('AssetVariantDiffSessionFactory has been disposed');
    }
  }
}
