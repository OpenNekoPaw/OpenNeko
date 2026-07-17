/**
 * VideoPreviewProvider - CustomReadonlyEditorProvider for video files
 *
 * Opens video files (.mp4, .mov, .mkv, etc.) in a lightweight preview player
 * powered by neko-engine's H.264 streaming pipeline.
 *
 * Data flow:
 * 1. User opens video file → resolveCustomEditor()
 * 2. Probe media metadata → send to webview
 * 3. Start FrameServer → send port to webview
 * 4. Webview connects H264StreamClient via WebSocket
 * 5. Playback control via postMessage ↔ PreviewService dispatch
 */

import * as vscode from 'vscode';
import { PreviewService, type MediaInfo } from '../services/PreviewService';
import type { StatusBarManager } from '../ui/StatusBarManager';
import { getLogger } from '../utils/logger';
import {
  createReadonlyPreviewDocument,
  getPreviewErrorHtml,
  getPreviewFileName,
  setupPreviewWebviewPanel,
} from './previewProviderHelper';

const logger = getLogger('VideoPreview');

// =============================================================================
// VideoPreviewProvider
// =============================================================================

export class VideoPreviewProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = 'neko.videoPreview';

  private readonly _disposables: vscode.Disposable[] = [];
  private _previewService: PreviewService | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar: StatusBarManager,
  ) {}

  /** Inject a shared PreviewService instance (avoids duplicate NativeEngine) */
  setPreviewService(service: PreviewService): void {
    this._previewService = service;
  }

  // =========================================================================
  // CustomReadonlyEditorProvider
  // =========================================================================

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
      entry: 'video',
      pinEditor: true,
    });

    // Immediately show status bar with file name (placeholder before probe completes)
    const filePath = document.uri.fsPath;
    const fileName = getPreviewFileName(filePath);
    this._statusBar.show({ fileName, duration: 0 });

    // Probe media in background — message handler awaits this before responding
    const mediaInfoPromise = (async (): Promise<MediaInfo | null> => {
      if (!this._previewService) {
        this._previewService = await PreviewService.tryCreate();
      }
      if (!this._previewService?.isAvailable) {
        webviewPanel.webview.html = getPreviewErrorHtml(
          'Failed to initialize media engine. Please ensure neko-engine is installed.',
        );
        this._statusBar.hide();
        return null;
      }
      try {
        const info = await this._previewService.probeMedia(filePath);
        // Update status bar with full media info
        this._statusBar.show({
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
        return info;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        webviewPanel.webview.html = getPreviewErrorHtml(`Failed to probe media file: ${msg}`);
        this._statusBar.hide();
        return null;
      }
    })();

    // Per-panel stream state (independent of other panels)
    let activeVideoStreamId: string | null = null;
    let activeAudioStreamId: string | null = null;
    let streamEof = false;

    const stopPanelStreams = async () => {
      if (activeVideoStreamId || activeAudioStreamId) {
        await this._previewService?.stopStreams(activeVideoStreamId, activeAudioStreamId);
        activeVideoStreamId = null;
        activeAudioStreamId = null;
      }
    };

    // Handle messages from webview — registered early so no messages are lost
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (msg: Record<string, unknown>) => {
        const type = msg.type as string;

        switch (type) {
          case 'ready': {
            // Wait for probe to complete before sending init
            const mediaInfo = await mediaInfoPromise;
            if (!mediaInfo) return;
            await webviewPanel.webview.postMessage({
              type: 'preview:init',
              payload: {
                filePath,
                mediaInfo,
                port: this._previewService?.port ?? null,
              },
            });
            break;
          }

          case 'preview:play': {
            streamEof = false;
            if (activeVideoStreamId) {
              // Resume existing streams
              const startTime = (msg.startTime as number) ?? 0;
              const speed = (msg.speed as number) ?? 1.0;
              if (startTime > 0) {
                await this._previewService?.seekStreams(
                  activeVideoStreamId,
                  activeAudioStreamId,
                  startTime,
                );
              }
              await this._previewService?.setStreamSpeed(
                activeVideoStreamId,
                activeAudioStreamId,
                speed,
              );
              await this._previewService?.resumeStreams(activeVideoStreamId, activeAudioStreamId);
            } else {
              // First play or streams lost — create new
              const mediaInfo = await mediaInfoPromise;
              if (!mediaInfo) return;

              const startTime = (msg.startTime as number) ?? 0;
              const speed = (msg.speed as number) ?? 1.0;
              const result = await this._previewService?.startVideoPlayback(
                filePath,
                mediaInfo,
                startTime,
                speed,
              );
              if (result?.videoStreamId) {
                activeVideoStreamId = result.videoStreamId;
                activeAudioStreamId = result.audioStreamId;

                const streamUrl = this._previewService?.getStreamWebSocketUrl(result.videoStreamId);
                let audioStreamUrl: string | null = null;
                if (result.audioStreamId) {
                  audioStreamUrl =
                    this._previewService?.getStreamWebSocketUrl(result.audioStreamId) ?? null;
                }
                if (streamUrl) {
                  await webviewPanel.webview.postMessage({
                    type: 'preview:streamReady',
                    payload: {
                      streamId: result.videoStreamId,
                      streamUrl,
                      audioStreamId: result.audioStreamId,
                      audioStreamUrl,
                    },
                  });
                }
              }
            }
            break;
          }

          case 'preview:pause':
            await this._previewService?.pauseStreams(activeVideoStreamId, activeAudioStreamId);
            break;

          case 'preview:eof':
            streamEof = true;
            break;

          case 'preview:resume':
            await this._previewService?.resumeStreams(activeVideoStreamId, activeAudioStreamId);
            break;

          case 'preview:stop':
            await stopPanelStreams();
            break;

          case 'preview:seek': {
            const time = msg.time as number;
            if (typeof time === 'number') {
              await this._previewService?.seekStreams(
                activeVideoStreamId,
                activeAudioStreamId,
                time,
              );
              // Only reconnect WebSockets if EOF closed them
              if (streamEof && activeVideoStreamId) {
                streamEof = false;
                const streamUrl = this._previewService?.getStreamWebSocketUrl(activeVideoStreamId);
                let audioStreamUrl: string | null = null;
                if (activeAudioStreamId) {
                  audioStreamUrl =
                    this._previewService?.getStreamWebSocketUrl(activeAudioStreamId) ?? null;
                }
                await webviewPanel.webview.postMessage({
                  type: 'preview:streamReconnect',
                  payload: {
                    streamId: activeVideoStreamId,
                    streamUrl,
                    audioStreamId: activeAudioStreamId,
                    audioStreamUrl,
                  },
                });
              }
            }
            break;
          }

          case 'preview:speed': {
            const speed = msg.speed as number;
            if (typeof speed === 'number') {
              await this._previewService?.setStreamSpeed(
                activeVideoStreamId,
                activeAudioStreamId,
                speed,
              );
            }
            break;
          }

          case 'preview:captureFrame': {
            const time = (msg.time as number) ?? 0;
            try {
              const frameData = await this._previewService?.captureFrame(filePath, time);
              await webviewPanel.webview.postMessage({
                type: 'preview:frameData',
                payload: { imageDataUrl: frameData },
              });
            } catch (error) {
              logger.error('Frame capture failed:', error);
            }
            break;
          }

          case 'preview:statusUpdate': {
            const state = msg.playbackState as 'playing' | 'paused' | 'stopped';
            const time = (msg.currentTime as number) ?? 0;
            this._statusBar.updatePlayback(state, time);
            break;
          }

          default:
            break;
        }
      },
      undefined,
      this._disposables,
    );

    // Manage status bar visibility with panel lifecycle
    const visibilityDisposable = webviewPanel.onDidChangeViewState(async () => {
      if (!webviewPanel.visible) {
        this._statusBar.hide();
      } else {
        const mediaInfo = await mediaInfoPromise;
        if (mediaInfo) {
          this._statusBar.show({
            fileName,
            codec: mediaInfo.codec,
            width: mediaInfo.width,
            height: mediaInfo.height,
            fps: mediaInfo.fps,
            audioCodec: mediaInfo.audioCodec,
            audioSampleRate: mediaInfo.audioSampleRate,
            audioChannels: mediaInfo.audioChannels,
            duration: mediaInfo.duration,
          });
        } else {
          this._statusBar.show({ fileName, duration: 0 });
        }
      }
    });

    // Cleanup on dispose — stop this panel's streams only
    webviewPanel.onDidDispose(async () => {
      messageDisposable.dispose();
      visibilityDisposable.dispose();
      this._statusBar.hide();
      await stopPanelStreams();
    });
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    // Note: do NOT dispose _previewService here — it may be a shared singleton
    // injected via setPreviewService(). The owner (extension.ts) manages its lifecycle.
    this._disposables.forEach((d) => d.dispose());
  }
}
