import type * as vscode from 'vscode';
import type { EngineClient } from '@neko/neko-client/EngineClient';
import type { IEngineMediaService } from '../../contracts/IEngineMediaService';
import type { IScheduler } from '../../contracts/IScheduler';
import type { ITempFileService } from '../../contracts/ITempFileService';
import type { IMediaDiffService } from '../services/MediaDiffService';
import { MediaDiffMessageHandler } from './MediaDiffMessageHandler';
import {
  type IMediaDiffEditorMessageHandler,
  type IMediaDiffEditorSession,
  type IMediaDiffEditorSessionFactory,
  type IMediaDiffEditorSessionOptions,
  MediaDiffEditorSession,
} from './MediaDiffEditorSession';

export interface IMediaDiffEditorMessageHandlerFactoryOptions {
  webview: vscode.Webview;
  documentUri: vscode.Uri;
  diffService: IMediaDiffService;
  engineClient: EngineClient | null;
  scheduler: IScheduler;
  tempFileService: ITempFileService;
  previousUri?: vscode.Uri;
}

export type MediaDiffEditorMessageHandlerFactory = (
  options: IMediaDiffEditorMessageHandlerFactoryOptions,
) => IMediaDiffEditorMessageHandler;

export class MediaDiffEditorSessionFactory implements IMediaDiffEditorSessionFactory {
  private isDisposed = false;

  constructor(
    private readonly diffService: IMediaDiffService,
    private readonly engineMediaService: IEngineMediaService,
    private readonly scheduler: IScheduler,
    private readonly tempFileService: ITempFileService,
    private readonly createMessageHandler: MediaDiffEditorMessageHandlerFactory = (options) =>
      new MediaDiffMessageHandler(
        options.webview,
        options.documentUri,
        options.diffService,
        options.engineClient,
        options.scheduler,
        options.tempFileService,
        options.previousUri,
      ),
  ) {}

  async createSession(options: IMediaDiffEditorSessionOptions): Promise<IMediaDiffEditorSession> {
    this.throwIfDisposed();
    const engineClient = await this.engineMediaService.ensureClient();
    this.throwIfDisposed();
    let messageHandler: IMediaDiffEditorMessageHandler | undefined;

    try {
      messageHandler = this.createMessageHandler({
        webview: options.webviewPanel.webview,
        documentUri: options.documentUri,
        diffService: this.diffService,
        engineClient,
        scheduler: this.scheduler,
        tempFileService: this.tempFileService,
        previousUri: options.previousUri,
      });

      return new MediaDiffEditorSession(
        options.webviewPanel,
        messageHandler,
        engineClient !== null,
      );
    } catch (error) {
      if (messageHandler) {
        await messageHandler.disposeAsync();
      }
      throw error;
    }
  }

  dispose(): void {
    this.isDisposed = true;
  }

  private throwIfDisposed(): void {
    if (this.isDisposed) {
      throw new Error('MediaDiffEditorSessionFactory has been disposed');
    }
  }
}
