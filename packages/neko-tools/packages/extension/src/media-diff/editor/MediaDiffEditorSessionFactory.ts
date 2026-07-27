import type * as vscode from 'vscode';
import type {
  IMediaRuntimeService,
  IToolsMediaRuntime,
} from '../../contracts/IMediaRuntimeService';
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
  sessionId: string;
  diffService: IMediaDiffService;
  mediaRuntime: IToolsMediaRuntime;
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
    private readonly mediaRuntimeService: IMediaRuntimeService,
    private readonly scheduler: IScheduler,
    private readonly tempFileService: ITempFileService,
    private readonly createMessageHandler: MediaDiffEditorMessageHandlerFactory = (options) =>
      new MediaDiffMessageHandler(
        options.webview,
        options.documentUri,
        options.diffService,
        options.mediaRuntime,
        options.scheduler,
        options.tempFileService,
        options.sessionId,
        options.previousUri,
      ),
  ) {}

  async createSession(options: IMediaDiffEditorSessionOptions): Promise<IMediaDiffEditorSession> {
    this.throwIfDisposed();
    let messageHandler: IMediaDiffEditorMessageHandler | undefined;

    try {
      messageHandler = this.createMessageHandler({
        webview: options.webviewPanel.webview,
        documentUri: options.documentUri,
        sessionId: options.sessionId,
        diffService: this.diffService,
        mediaRuntime: this.mediaRuntimeService.runtime,
        scheduler: this.scheduler,
        tempFileService: this.tempFileService,
        previousUri: options.previousUri,
      });

      return new MediaDiffEditorSession(options.webviewPanel, messageHandler, options.sessionId);
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
