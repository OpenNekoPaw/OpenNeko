import * as vscode from 'vscode';
import { PreviewService, type MediaInfo, type PreviewPlayback } from '../services/PreviewService';
import type { StatusBarManager } from '../ui/StatusBarManager';
import {
  createReadonlyPreviewDocument,
  getPreviewErrorHtml,
  getPreviewFileName,
  setupPreviewWebviewPanel,
} from './previewProviderHelper';

export class VideoPreviewProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = 'neko.videoPreview';

  private previewService: PreviewService | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly statusBar: StatusBarManager,
    private readonly resolvePreviewService: () => Promise<PreviewService | null> = () =>
      PreviewService.tryCreate(),
  ) {}

  setPreviewService(service: PreviewService): void {
    this.previewService = service;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return createReadonlyPreviewDocument(uri);
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    await setupPreviewWebviewPanel({
      webviewPanel: panel,
      extensionUri: this.extensionUri,
      entry: 'video',
      pinEditor: true,
    });
    const filePath = document.uri.fsPath;
    const fileName = getPreviewFileName(filePath);
    this.statusBar.show({ fileName, duration: 0 });
    const mediaInfoPromise = this.resolveMediaInfo(filePath, fileName, panel);
    let playback: PreviewPlayback | undefined;

    const stopPlayback = async (): Promise<void> => {
      if (!playback || !this.previewService) return;
      const active = playback;
      playback = undefined;
      await this.previewService.stopPlayback(active);
    };

    const startPlayback = async (startTime: number, speed: number): Promise<void> => {
      const mediaInfo = await mediaInfoPromise;
      if (!mediaInfo || !this.previewService) return;
      await stopPlayback();
      playback = await this.previewService.startPlayback(
        filePath,
        mediaInfo,
        'video',
        startTime,
        speed,
      );
      if (!playback.video) {
        await this.previewService.stopPlayback(playback);
        playback = undefined;
        throw new Error('Video preview did not produce a browser video descriptor.');
      }
      await panel.webview.postMessage({
        type: 'preview:playbackReady',
        payload: {
          ...(playback.video ? { video: playback.video } : {}),
          ...(playback.audio ? { audio: playback.audio } : {}),
          startTime,
          playbackRate: speed,
        },
      });
    };

    const messageDisposable = panel.webview.onDidReceiveMessage(
      async (message: Record<string, unknown>) => {
        switch (message['type']) {
          case 'ready': {
            const mediaInfo = await mediaInfoPromise;
            if (!mediaInfo) return;
            await panel.webview.postMessage({
              type: 'preview:init',
              payload: { mediaInfo, displayName: fileName },
            });
            return;
          }
          case 'preview:play':
            await startPlayback(numberOr(message['startTime'], 0), numberOr(message['speed'], 1));
            return;
          case 'preview:seek':
            await startPlayback(numberOr(message['time'], 0), numberOr(message['speed'], 1));
            return;
          case 'preview:stop':
            await stopPlayback();
            return;
          case 'preview:captureFrame': {
            if (!this.previewService) return;
            const imageDataUrl = await this.previewService.captureFrame(
              filePath,
              numberOr(message['time'], 0),
            );
            await panel.webview.postMessage({
              type: 'preview:frameData',
              payload: { imageDataUrl },
            });
            return;
          }
          case 'preview:pause':
          case 'preview:resume':
          case 'preview:speed':
          case 'preview:eof':
            return;
          case 'preview:statusUpdate':
            this.statusBar.updatePlayback(
              playbackState(message['playbackState']),
              numberOr(message['currentTime'], 0),
            );
            return;
          default:
            throw new Error(`Unknown video preview message: ${String(message['type'])}`);
        }
      },
    );

    const viewStateDisposable = panel.onDidChangeViewState(async () => {
      if (!panel.visible) {
        this.statusBar.hide();
        return;
      }
      const info = await mediaInfoPromise;
      if (!info) return;
      this.showMediaStatus(fileName, info);
    });

    panel.onDidDispose(() => {
      messageDisposable.dispose();
      viewStateDisposable.dispose();
      void stopPlayback();
      this.statusBar.hide();
    });
  }

  dispose(): void {}

  private async resolveMediaInfo(
    filePath: string,
    fileName: string,
    panel: vscode.WebviewPanel,
  ): Promise<MediaInfo | null> {
    try {
      const service = this.previewService ?? (await this.resolvePreviewService());
      if (!service) {
        throw new Error('Node/FFmpeg Preview adapter is unavailable.');
      }
      this.previewService = service;
      const info = await service.probeMedia(filePath);
      this.showMediaStatus(fileName, info);
      return info;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.webview.html = getPreviewErrorHtml(`Failed to prepare video preview: ${message}`);
      this.statusBar.hide();
      return null;
    }
  }

  private showMediaStatus(fileName: string, info: MediaInfo): void {
    this.statusBar.show({
      fileName,
      codec: info.codec,
      width: info.width,
      height: info.height,
      fps: info.fps,
      audioCodec: info.audioCodec,
      audioSampleRate: info.audioSampleRate,
      audioChannels: info.audioChannels,
      duration: info.duration,
    });
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function playbackState(value: unknown): 'playing' | 'paused' | 'stopped' {
  if (value === 'playing' || value === 'paused' || value === 'stopped') {
    return value;
  }
  throw new Error(`Invalid preview playback state: ${String(value)}`);
}
