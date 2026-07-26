import * as vscode from 'vscode';
import type { PreviewManifest } from '@neko/shared';
import { PreviewService, type PreviewPlayback } from '../services/PreviewService';
import type { StatusBarManager } from '../ui/StatusBarManager';
import { getLogger } from '../utils/logger';
import { PANORAMIC_VIDEO_VIEW_TYPE } from '../types/panoramic-api';
import {
  createReadonlyPreviewDocument,
  getPreviewFileName,
  setupPreviewWebviewPanel,
} from './previewProviderHelper';

const logger = getLogger('PanoramicVideoPreview');

export class PanoramicVideoPreviewProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = PANORAMIC_VIDEO_VIEW_TYPE;

  private _previewService: PreviewService | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar: StatusBarManager,
    private readonly _resolvePreviewService: () => Promise<PreviewService | null> = () =>
      PreviewService.tryCreate(),
  ) {}

  setPreviewService(service: PreviewService): void {
    this._previewService = service;
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
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    await setupPreviewWebviewPanel({
      webviewPanel,
      extensionUri: this._extensionUri,
      entry: 'panorama-video',
    });

    const filePath = document.uri.fsPath;
    const fileName = getPreviewFileName(filePath);
    this._statusBar.show({ fileName, duration: 0 });
    const manifestPromise = this.registerManifest(filePath, fileName);
    let activeManifest: PreviewManifest | null = null;
    let playback: PreviewPlayback | undefined;

    const stopPlayback = async (): Promise<void> => {
      if (!playback || !this._previewService) return;
      const active = playback;
      playback = undefined;
      await this._previewService.stopPlayback(active);
    };

    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (message: Record<string, unknown>) => {
        switch (message.type) {
          case 'ready': {
            const manifest = await manifestPromise;
            if (!manifest) return;
            activeManifest = manifest;
            await webviewPanel.webview.postMessage({
              type: 'panorama:init',
              payload: { manifest },
            });
            break;
          }
          case 'preview:play': {
            await stopPlayback();
            const startTime = finiteNumber(message.startTime) ?? 0;
            const speed = finiteNumber(message.speed) ?? 1;
            const mediaInfo = await this._previewService?.probeMedia(filePath);
            if (!mediaInfo) return;
            playback = await this._previewService?.startPlayback(
              filePath,
              mediaInfo,
              'video',
              startTime,
              speed,
            );
            if (!playback?.video)
              throw new Error('Panoramic preview produced no video descriptor.');
            await webviewPanel.webview.postMessage({
              type: 'preview:playbackReady',
              payload: {
                video: playback.video,
                ...(playback.audio ? { audio: playback.audio } : {}),
                startTime,
                playbackRate: speed,
              },
            });
            break;
          }
          case 'preview:pause':
          case 'preview:resume':
          case 'preview:speed':
            break;
          case 'preview:seek': {
            const time = finiteNumber(message.time) ?? 0;
            const speed = finiteNumber(message.speed) ?? 1;
            const mediaInfo = await this._previewService?.probeMedia(filePath);
            if (!mediaInfo || !this._previewService) return;
            await stopPlayback();
            playback = await this._previewService.startPlayback(
              filePath,
              mediaInfo,
              'video',
              time,
              speed,
            );
            if (!playback.video) throw new Error('Panoramic preview produced no video descriptor.');
            await webviewPanel.webview.postMessage({
              type: 'preview:playbackReady',
              payload: {
                video: playback.video,
                ...(playback.audio ? { audio: playback.audio } : {}),
                startTime: time,
                playbackRate: speed,
              },
            });
            break;
          }
          case 'preview:stop':
          case 'preview:eof':
            await stopPlayback();
            break;
          default:
            throw new Error(`Unknown panoramic video message: ${String(message.type)}`);
        }
      },
    );

    webviewPanel.onDidDispose(() => {
      void (async () => {
        messageDisposable.dispose();
        await stopPlayback();
        const manifest = activeManifest ?? (await manifestPromise.catch(() => null));
        if (manifest) {
          await this._previewService?.unregisterPreviewAsset(manifest.assetId);
        }
        this._statusBar.hide();
      })().catch((error) => {
        logger.error('Failed to dispose panoramic video preview resources:', error);
      });
    });
  }

  dispose(): void {}

  private async registerManifest(
    filePath: string,
    fileName: string,
  ): Promise<PreviewManifest | null> {
    if (!this._previewService) {
      this._previewService = await this._resolvePreviewService();
    }
    if (!this._previewService?.isAvailable) {
      this._statusBar.hide();
      return null;
    }
    const manifest = await this._previewService.registerPreviewAsset({
      source: filePath,
      kind: 'video',
    });
    this._statusBar.show({
      fileName,
      width: manifest.media.dimensions?.width,
      height: manifest.media.dimensions?.height,
      codec: manifest.media.codec?.videoCodec ?? manifest.media.codec?.container,
      duration: manifest.media.codec?.durationSecs ?? 0,
    });
    return manifest;
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
