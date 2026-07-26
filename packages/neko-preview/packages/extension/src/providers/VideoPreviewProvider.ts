import * as vscode from 'vscode';
import type { HtmlVideoNativeCapabilities } from '@neko/media';
import { PreviewService, type MediaInfo, type PreviewPlayback } from '../services/PreviewService';
import type { StatusBarManager } from '../ui/StatusBarManager';
import { getLogger } from '../utils/logger';
import { LatestPlaybackGeneration } from './LatestPlaybackGeneration';
import {
  createReadonlyPreviewDocument,
  getPreviewErrorHtml,
  getPreviewFileName,
  setupPreviewWebviewPanel,
} from './previewProviderHelper';

const logger = getLogger('VideoPreview');

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
    let videoPlayback: PreviewPlayback | undefined;
    let nativeVideoCapabilities: HtmlVideoNativeCapabilities | undefined;
    const pcmGenerations = new LatestPlaybackGeneration<PreviewPlayback>(async (playback) => {
      const service = this.previewService;
      if (!service) throw new Error('Node/FFmpeg Preview adapter is unavailable.');
      await service.stopPlayback(playback);
    });

    const startPlayback = async (startTime: number, speed: number): Promise<void> => {
      await pcmGenerations.replace(
        async () => {
          const mediaInfo = await mediaInfoPromise;
          const service = this.previewService;
          if (!mediaInfo || !service) {
            throw new Error('Node/FFmpeg Preview adapter is unavailable.');
          }
          if (!videoPlayback) {
            const initial = await service.startPlayback(
              filePath,
              mediaInfo,
              'video',
              startTime,
              speed,
              {
                ...(nativeVideoCapabilities ? { nativeVideoCapabilities } : {}),
              },
            );
            if (!initial.videoSessionId || !initial.video) {
              await service.stopPlayback(initial);
              throw new Error('Video preview did not produce a browser video descriptor.');
            }
            videoPlayback = {
              videoSessionId: initial.videoSessionId,
              video: initial.video,
            };
            return {
              ...(initial.audioSessionId ? { audioSessionId: initial.audioSessionId } : {}),
              ...(initial.audio ? { audio: initial.audio } : {}),
            };
          }
          return service.startPlayback(filePath, mediaInfo, 'audio', startTime, speed);
        },
        async (pcmPlayback) => {
          const video = videoPlayback?.video;
          if (!video) throw new Error('Video preview descriptor is unavailable.');
          await panel.webview.postMessage({
            type: 'preview:playbackReady',
            payload: {
              video,
              ...(pcmPlayback.audio ? { audio: pcmPlayback.audio } : {}),
              startTime,
              playbackRate: speed,
            },
          });
        },
      );
    };

    const stopPlayback = async (): Promise<void> => {
      await pcmGenerations.stop();
      const activeVideo = videoPlayback;
      videoPlayback = undefined;
      if (!activeVideo) return;
      const service = this.previewService;
      if (!service) throw new Error('Node/FFmpeg Preview adapter is unavailable.');
      await service.stopPlayback(activeVideo);
    };

    const handleMessage = async (message: Record<string, unknown>): Promise<void> => {
      switch (message['type']) {
        case 'ready': {
          nativeVideoCapabilities = parseNativeVideoCapabilities(
            message['nativeVideoCapabilities'],
          );
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
          return;
        case 'preview:eof':
          await pcmGenerations.stop();
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
    };

    const messageDisposable = panel.webview.onDidReceiveMessage(
      (message: Record<string, unknown>) => {
        void handleMessage(message).catch((error: unknown) => {
          const failure = error instanceof Error ? error.message : String(error);
          void Promise.resolve(
            panel.webview.postMessage({
              type: 'preview:operationFailed',
              payload: {
                operation: previewOperation(message['type']),
                message: failure,
              },
            }),
          ).catch((reportError: unknown) => {
            const reportFailure =
              reportError instanceof Error ? reportError.message : String(reportError);
            panel.webview.html = getPreviewErrorHtml(
              `Failed to report video preview failure: ${reportFailure}. Original failure: ${failure}`,
            );
            this.statusBar.hide();
          });
        });
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
      void stopPlayback().catch((error: unknown) => {
        logger.error('Failed to dispose video preview playback.', error);
      });
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

function parseNativeVideoCapabilities(value: unknown): HtmlVideoNativeCapabilities | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') {
    throw new Error('Invalid native video capability payload.');
  }
  const version = Reflect.get(value, 'version');
  const av1Mp4 = Reflect.get(value, 'av1Mp4');
  const vp9Mp4 = Reflect.get(value, 'vp9Mp4');
  if (version !== 1 || typeof av1Mp4 !== 'boolean' || typeof vp9Mp4 !== 'boolean') {
    throw new Error('Invalid native video capability payload.');
  }
  return { version, av1Mp4, vp9Mp4 };
}

function previewOperation(value: unknown): 'captureFrame' | 'playback' | 'protocol' {
  if (value === 'preview:captureFrame') return 'captureFrame';
  if (value === 'preview:play' || value === 'preview:seek' || value === 'preview:stop') {
    return 'playback';
  }
  return 'protocol';
}
