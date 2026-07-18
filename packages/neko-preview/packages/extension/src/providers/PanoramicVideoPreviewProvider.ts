import * as vscode from 'vscode';
import type { PreviewManifest } from '@neko/shared';
import { PreviewService } from '../services/PreviewService';
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
    let activeVideoStreamId: string | null = null;
    let activeAudioStreamId: string | null = null;

    const stopStreams = async () => {
      await this._previewService?.stopStreams(activeVideoStreamId, activeAudioStreamId);
      activeVideoStreamId = null;
      activeAudioStreamId = null;
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
              payload: {
                manifest,
                engineBaseUrl: this._previewService?.getPreviewBaseUrl() ?? null,
              },
            });
            break;
          }
          case 'preview:play': {
            await stopStreams();
            const startTime = finiteNumber(message.startTime) ?? 0;
            const speed = finiteNumber(message.speed) ?? 1;
            const mediaInfo = await this._previewService?.probeMedia(filePath);
            if (!mediaInfo) return;
            const result = await this._previewService?.startVideoPlayback(
              filePath,
              mediaInfo,
              startTime,
              speed,
            );
            activeVideoStreamId = result?.videoStreamId ?? null;
            activeAudioStreamId = result?.audioStreamId ?? null;
            if (activeVideoStreamId) {
              await webviewPanel.webview.postMessage({
                type: 'preview:streamReady',
                payload: {
                  streamId: activeVideoStreamId,
                  streamUrl: this._previewService?.getStreamWebSocketUrl(activeVideoStreamId),
                  audioStreamId: activeAudioStreamId,
                  audioStreamUrl: activeAudioStreamId
                    ? this._previewService?.getAudioWebSocketUrl(activeAudioStreamId)
                    : null,
                },
              });
            }
            break;
          }
          case 'preview:pause':
            await this._previewService?.pauseStreams(activeVideoStreamId, activeAudioStreamId);
            break;
          case 'preview:resume':
            await this._previewService?.resumeStreams(activeVideoStreamId, activeAudioStreamId);
            break;
          case 'preview:seek': {
            const time = finiteNumber(message.time);
            if (time !== null) {
              await this._previewService?.seekStreams(
                activeVideoStreamId,
                activeAudioStreamId,
                time,
              );
            }
            break;
          }
          case 'preview:speed': {
            const speed = finiteNumber(message.speed);
            if (speed !== null) {
              await this._previewService?.setStreamSpeed(
                activeVideoStreamId,
                activeAudioStreamId,
                speed,
              );
            }
            break;
          }
          case 'preview:stop':
          case 'preview:eof':
            await stopStreams();
            break;
        }
      },
    );

    webviewPanel.onDidDispose(() => {
      void (async () => {
        messageDisposable.dispose();
        await stopStreams();
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
