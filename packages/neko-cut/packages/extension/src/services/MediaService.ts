/**
 * MediaService - Webview 媒体消息路由服务
 *
 * 职责：
 * - 接收 Webview 的媒体处理请求 (IPC 消息)
 * - 转换为 NativeEngine ActionRequest
 * - 通过 EngineClient.dispatch() 转发到 Rust 端
 * - 将 ActionResponse 转换回 Webview 消息格式
 *
 * 设计原则：
 * - 单一职责：仅负责消息路由，不做媒体处理
 * - 不支持降级：NativeEngine 不可用时直接报错
 * - 无缓存/队列：Rust 端处理并发和缓存
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  EngineClient,
  MediaPlaybackService,
  type ActionRequest,
  type ActionResponse,
} from '@neko/neko-client';
import {
  createCutWorkspaceMediaPathContext,
  isExistingLocalFile,
  resolveMediaPath as resolveMediaPathHelper,
  resolveProjectMediaSourcesForRuntime,
} from './tools/helpers';
import type {
  MediaRequest,
  MediaResponse,
  GetVideoFrameRequest,
  GetVideoFrameRangeRequest,
  ProbeMediaInfoRequest,
  ExtractSubtitlesRequest,
  GetWaveformRequest,
  CompatibleGetVideoFrameRequest,
  CompatibleGetVideoFrameResponse,
  RenderCompositeFrameRequest,
  RenderCompositeFrameResponse,
  CompatibleModeRequest,
  CompatibleModeResponse,
  ProjectData,
} from '@neko/shared';
import { getLogger } from '../base';

const logger = getLogger('MediaService');

interface EditorStreamProjectData {
  tracks: unknown[];
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
}

// =============================================================================
// MediaService
// =============================================================================

export class MediaService implements vscode.Disposable {
  private readonly documentDir: string | undefined;
  private readonly documentUri: vscode.Uri | undefined;
  private readonly mediaPlayback: MediaPlaybackService;
  private disposed = false;

  // Stream state (editor-level lifecycle)
  private _streamState: 'idle' | 'active' | 'paused' = 'idle';
  private _activeVideoStreamId: string | null = null;
  private _activeAudioStreamId: string | null = null;

  constructor(
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly client: EngineClient,
    documentUri?: vscode.Uri,
  ) {
    this.documentUri = documentUri;
    this.documentDir = documentUri ? path.dirname(documentUri.fsPath) : undefined;
    this.mediaPlayback = new MediaPlaybackService(this.client);
  }

  // =========================================================================
  // Message Routing
  // =========================================================================

  /**
   * Handle incoming message from Webview
   * @returns true if message was handled, false otherwise
   */
  async handleMessage(message: unknown): Promise<boolean> {
    if (this.disposed) return false;
    if (typeof message !== 'object' || message === null) return false;

    const msg = message as Record<string, unknown>;
    const type = msg.type as string | undefined;
    if (typeof type !== 'string') return false;

    try {
      // Standard media requests
      if (this.isStandardMediaRequest(msg)) {
        await this.handleStandardMedia(message as MediaRequest);
        return true;
      }

      // Compatible mode requests
      if (this.isCompatibleModeRequest(msg)) {
        await this.handleCompatibleMode(message as CompatibleModeRequest);
        return true;
      }

      // Frame server playback control
      if (type.startsWith('media:frameServer:')) {
        await this.handlePlaybackControl(msg);
        return true;
      }

      // Loudness analysis
      if (type === 'media:analyzeLoudness') {
        await this.handleAnalyzeLoudness(msg);
        return true;
      }

      // Media bitrate
      if (type === 'media:getMediaBitrate') {
        await this.handleMediaBitrate(msg);
        return true;
      }

      // Engine-side stream stats
      if (type === 'media:getStreamStats') {
        await this.handleStreamStats(msg);
        return true;
      }

      // Effects / Shader API
      if (type === 'effects:list') {
        await this.handleEffectsList(msg);
        return true;
      }
      if (type === 'effects:info') {
        await this.handleEffectsInfo(msg);
        return true;
      }
      if (type === 'effects:register') {
        await this.handleEffectsRegister(msg);
        return true;
      }
    } catch (error) {
      logger.error(
        'handleMessage error:',
        error instanceof Error ? error.message : JSON.stringify(error),
      );
    }

    return false;
  }

  // =========================================================================
  // Standard Media Requests → NativeEngine dispatch
  // =========================================================================

  private async handleStandardMedia(request: MediaRequest): Promise<void> {
    let response: MediaResponse;

    try {
      switch (request.type) {
        case 'media:getVideoFrame':
          response = await this.handleVideoCapture(request as GetVideoFrameRequest);
          break;
        case 'media:getVideoFrameRange':
          response = await this.handleVideoFrameRange(request as GetVideoFrameRangeRequest);
          break;
        case 'media:probeMediaInfo':
          response = await this.handleProbeMedia(request as ProbeMediaInfoRequest);
          break;
        case 'media:extractSubtitles':
          response = await this.handleExtractSubtitles(request as ExtractSubtitlesRequest);
          break;
        case 'media:getWaveform':
          response = await this.handleGetWaveform(request as GetWaveformRequest);
          break;
        default:
          throw new Error(`Unknown media request type: ${request.type}`);
      }
    } catch (error) {
      response = {
        requestId: request.requestId,
        type: `media:response:${request.type.replace('media:', '')}` as never,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    this.sendResponse(response);
  }

  private async handleVideoCapture(request: GetVideoFrameRequest): Promise<MediaResponse> {
    const { videoPath, timeInSeconds, quality, scale } = request.payload;
    const absolutePath = await this.resolveMediaPath(videoPath);

    let width: number | undefined;
    let height: number | undefined;
    if (scale && scale > 0 && scale < 1) {
      try {
        const probe = await this.mediaPlayback.probeMedia(absolutePath);
        if (probe.width && probe.height) {
          width = Math.round(probe.width * scale);
          height = Math.round(probe.height * scale);
        }
      } catch (probeError) {
        logger.warn('probe failed, using full resolution:', probeError);
      }
    }

    const dataUrl = await this.mediaPlayback.captureFrame(absolutePath, timeInSeconds, {
      quality: quality ?? 85,
      width,
      height,
    });

    return {
      requestId: request.requestId,
      type: 'media:response:getVideoFrame' as never,
      payload: { imageDataUrl: dataUrl } as never,
    };
  }

  /**
   * media:getVideoFrameRange → videos:capture (batch)
   */
  private async handleVideoFrameRange(request: GetVideoFrameRangeRequest): Promise<MediaResponse> {
    const { videoPath, startTime, duration, fps, maxFrames } = request.payload;
    const absolutePath = await this.resolveMediaPath(videoPath);

    const actualDuration = maxFrames ? Math.min(duration, maxFrames / fps) : duration;
    const frameCount = Math.ceil(actualDuration * fps);
    const frameInterval = 1 / fps;

    // Capture frames sequentially
    const frames: Array<{ time: number; imageDataUrl: string }> = [];
    for (let i = 0; i < frameCount; i++) {
      const time = startTime + i * frameInterval;
      const result = await this.dispatch({
        group: 'videos',
        action: 'capture',
        id: absolutePath,
        options: {
          source: absolutePath,
          time,
          quality: request.payload.quality ?? 85,
          format: 'jpeg',
        },
      });
      const data = result.data as Record<string, unknown>;
      frames.push({
        time,
        imageDataUrl: `data:image/jpeg;base64,${data.data as string}`,
      });
    }

    return {
      requestId: request.requestId,
      type: 'media:response:getVideoFrameRange' as never,
      payload: { frames } as never,
    };
  }

  /**
   * media:probeMediaInfo → videos:probe
   */
  private async handleProbeMedia(request: ProbeMediaInfoRequest): Promise<MediaResponse> {
    const { videoPath } = request.payload;
    const absolutePath = await this.resolveMediaPath(videoPath);

    const result = await this.dispatch({
      group: 'videos',
      action: 'probe',
      options: { source: absolutePath },
    });

    // Rust MediaInfo has nested videoStreams/audioStreams/subtitleStreams.
    // Webview expects a flat structure with top-level width/height/fps/codec.
    const raw = result.data as Record<string, unknown>;
    const videoStreams = (raw.videoStreams ?? []) as Array<Record<string, unknown>>;
    const audioStreams = (raw.audioStreams ?? []) as Array<Record<string, unknown>>;
    const subtitleStreams = (raw.subtitleStreams ?? []) as Array<Record<string, unknown>>;
    const primaryVideo = videoStreams[0];
    const primaryAudio = audioStreams[0];

    const payload = {
      duration: raw.duration as number,
      width: (primaryVideo?.width as number) ?? 0,
      height: (primaryVideo?.height as number) ?? 0,
      fps: (primaryVideo?.fps as number) ?? 0,
      codec: (primaryVideo?.codec as string) ?? '',
      format: raw.format as string,
      bitrate: primaryVideo?.bitrate as number | undefined,
      hasAudio: audioStreams.length > 0,
      audioCodec: primaryAudio?.codec as string | undefined,
      audioSampleRate: primaryAudio?.sampleRate as number | undefined,
      audioChannels: primaryAudio?.channels as number | undefined,
      audioBitrate: primaryAudio?.bitrate as number | undefined,
      hasSubtitles: subtitleStreams.length > 0,
      subtitleStreams: subtitleStreams.map((s) => ({
        index: s.index as number,
        codec: s.codec as string,
        language: s.language as string | undefined,
        title: s.title as string | undefined,
      })),
    };

    return {
      requestId: request.requestId,
      type: 'media:response:probeMediaInfo' as never,
      payload: payload as never,
    };
  }

  /**
   * media:extractSubtitles → videos:extract
   */
  private async handleExtractSubtitles(request: ExtractSubtitlesRequest): Promise<MediaResponse> {
    const { videoPath } = request.payload;
    const absolutePath = await this.resolveMediaPath(videoPath);

    const result = await this.dispatch({
      group: 'videos',
      action: 'extract',
      id: absolutePath,
      options: { source: absolutePath, type: 'subtitles' },
    });

    return {
      requestId: request.requestId,
      type: 'media:response:extractSubtitles' as never,
      payload: result.data as never,
    };
  }

  /**
   * media:getWaveform → audios:waveform
   */
  private async handleGetWaveform(request: GetWaveformRequest): Promise<MediaResponse> {
    const { filePath } = request.payload;
    const absolutePath = await this.resolveMediaPath(filePath);

    const result = await this.dispatch({
      group: 'audios',
      action: 'waveform',
      options: { source: absolutePath },
    });

    const data = result.data as Record<string, unknown>;
    const waveform = data.waveform as Record<string, unknown>;

    return {
      requestId: request.requestId,
      type: 'media:response:getWaveform' as never,
      payload: {
        sampleRate: waveform.sampleRate as number,
        channels: waveform.channels as number,
        peaksPerSecond: waveform.peaksPerSecond as number,
        duration: waveform.duration as number,
        peaks: waveform.peaks as number[][],
      } as never,
    };
  }

  // =========================================================================
  // Compatible Mode Requests
  // =========================================================================

  private async handleCompatibleMode(request: CompatibleModeRequest): Promise<void> {
    let response: CompatibleModeResponse;

    try {
      switch (request.type) {
        case 'media:compatibleGetVideoFrame':
          response = await this.handleCompatibleVideoFrame(
            request as CompatibleGetVideoFrameRequest,
          );
          break;
        case 'media:renderCompositeFrame':
          response = await this.handleCompositeFrame(request as RenderCompositeFrameRequest);
          break;
        default:
          throw new Error(`Unknown compatible mode request: ${(request as { type: string }).type}`);
      }
    } catch (error) {
      if (request.type === 'media:compatibleGetVideoFrame') {
        response = {
          requestId: request.requestId,
          type: 'media:response:compatibleGetVideoFrame',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      } else {
        response = {
          requestId: request.requestId,
          type: 'media:response:renderCompositeFrame',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    this.sendResponse(response);
  }

  /**
   * media:compatibleGetVideoFrame → videos:capture
   */
  private async handleCompatibleVideoFrame(
    request: CompatibleGetVideoFrameRequest,
  ): Promise<CompatibleGetVideoFrameResponse> {
    const { videoPath, timeInSeconds, width, height } = request.payload;
    const absolutePath = await this.resolveMediaPath(videoPath);

    const result = await this.dispatch({
      group: 'videos',
      action: 'capture',
      id: absolutePath,
      options: {
        source: absolutePath,
        time: timeInSeconds,
        quality: 85,
        format: 'jpeg',
        width,
        height,
      },
    });

    const data = result.data as Record<string, unknown>;
    const jpegBase64 = data.data as string;
    const jpegBuffer = Buffer.from(jpegBase64, 'base64');

    return {
      requestId: request.requestId,
      type: 'media:response:compatibleGetVideoFrame',
      payload: {
        imageData: new Uint8Array(jpegBuffer),
        width: (data.width as number) ?? width ?? 0,
        height: (data.height as number) ?? height ?? 0,
      },
    };
  }

  /**
   * media:renderCompositeFrame → timelines:composite
   */
  private async handleCompositeFrame(
    request: RenderCompositeFrameRequest,
  ): Promise<RenderCompositeFrameResponse> {
    const { layers, width, height, backgroundColor } = request.payload;

    // Build a minimal Timeline for the composite request
    // The Rust side expects a Timeline object in the body
    const timeline = await this.buildTimelineForComposite(layers, width, height, backgroundColor);

    const result = await this.dispatch({
      group: 'timelines',
      action: 'composite',
      options: { frame: 0 },
      body: timeline,
    });

    const data = result.data as Record<string, unknown>;
    const frameBase64 = data.data as string;
    const frameBuffer = Buffer.from(frameBase64, 'base64');

    return {
      requestId: request.requestId,
      type: 'media:response:renderCompositeFrame',
      payload: {
        imageData: new Uint8Array(frameBuffer),
        width: (data.width as number) ?? width,
        height: (data.height as number) ?? height,
      },
    };
  }

  // =========================================================================
  // Editor-Level Stream Lifecycle
  // =========================================================================

  /**
   * Create editor-level stream (paused state).
   * Called by VideoEditorProvider when editor opens.
   */
  async createEditorStream(projectData: EditorStreamProjectData): Promise<void> {
    if (this._activeVideoStreamId) {
      logger.warn('Stream already exists, skipping create');
      return;
    }

    logger.info('Creating editor-level stream, baseDir:', this.getRuntimeMediaBaseDir());
    const runtimeProjectData = await this.resolveProjectDataForRuntime(projectData);

    const result = await this.dispatch({
      group: 'timelines',
      action: 'stream',
      options: {
        sessionId: 'editor',
        width: projectData.resolution.width,
        height: projectData.resolution.height,
        fps: projectData.fps,
        startTime: 0,
        paused: true,
        baseDir: this.getRuntimeMediaBaseDir(),
      },
      body: runtimeProjectData,
    });

    const data = result.data as Record<string, unknown>;
    this._activeVideoStreamId = (data.videoStreamId as string) ?? (data.streamId as string) ?? null;
    this._activeAudioStreamId = (data.audioStreamId as string) ?? null;
    this._streamState = 'paused';

    this.notifyStreamCreated();
    logger.info(
      `Editor stream created (paused): video=${this._activeVideoStreamId}, audio=${this._activeAudioStreamId}`,
    );
  }

  /**
   * Destroy editor-level stream.
   * Called by VideoEditorProvider when editor closes.
   */
  async destroyEditorStream(): Promise<void> {
    if (!this._activeVideoStreamId) return;

    const stoppedId = this._activeVideoStreamId;
    try {
      await this.dispatch({
        group: 'streams',
        action: 'stop',
        options: { streamId: this._activeVideoStreamId },
      });
    } catch {
      // Ignore errors during disposal
    }

    this._activeVideoStreamId = null;
    this._activeAudioStreamId = null;
    this._streamState = 'idle';

    this.sendResponse({
      type: 'frameServer:streamStopped',
      streamId: stoppedId,
    });
    logger.info(`Editor stream destroyed: ${stoppedId}`);
  }

  /** Notify Webview that stream was created (with WebSocket URLs) */
  /** Re-send stream info to Webview (e.g. after webview ready) */
  notifyStreamCreated(): void {
    if (!this._activeVideoStreamId) return;

    const port = this.client.port;
    const baseUrl = port ? `ws://127.0.0.1:${port}/v1/streams` : null;
    this.sendResponse({
      type: 'frameServer:streamCreated',
      streamId: this._activeVideoStreamId,
      wsUrl: baseUrl ? `${baseUrl}/${this._activeVideoStreamId}` : null,
      audioStreamId: this._activeAudioStreamId,
      audioWsUrl:
        baseUrl && this._activeAudioStreamId ? `${baseUrl}/${this._activeAudioStreamId}` : null,
    });
  }

  // =========================================================================
  // Playback Control → streams:*
  // =========================================================================

  private async handlePlaybackControl(msg: Record<string, unknown>): Promise<void> {
    const type = msg.type as string;

    if (type === 'media:frameServer:projectPlayback:resume') {
      if (!this._activeVideoStreamId) return;
      const payload = msg.payload as { startTime: number; speed?: number };

      await this.dispatch({
        group: 'streams',
        action: 'resume',
        options: {
          streamId: this._activeVideoStreamId,
          time: payload.startTime,
          speed: payload.speed ?? 1.0,
        },
      });
      this._streamState = 'active';
    } else if (type === 'media:frameServer:projectPlayback:pause') {
      if (!this._activeVideoStreamId) return;

      await this.dispatch({
        group: 'streams',
        action: 'pause',
        options: { streamId: this._activeVideoStreamId },
      });
      this._streamState = 'paused';
    } else if (type === 'media:frameServer:projectPlayback:seek') {
      if (!this._activeVideoStreamId) return;
      const payload = msg.payload as { seekTime: number };

      await this.dispatch({
        group: 'streams',
        action: 'seek',
        options: {
          streamId: this._activeVideoStreamId,
          time: payload.seekTime,
        },
      });
    } else if (type === 'media:frameServer:projectPlayback:applyOperation') {
      if (!this._activeVideoStreamId) return;
      const payload = msg.payload as { operation: unknown };

      const result = await this.dispatch({
        group: 'streams',
        action: 'applyOperation',
        options: {
          streamId: this._activeVideoStreamId,
          baseDir: this.getRuntimeMediaBaseDir(),
        },
        body: payload.operation,
      });

      // If Rust returned applied: false, signal caller to fall back to full update
      const applied = (result.data as Record<string, unknown>)?.applied;
      if (!applied) {
        throw new Error('UNSUPPORTED_OPERATION');
      }
    } else if (type === 'media:frameServer:projectPlayback:update') {
      if (!this._activeVideoStreamId) return;
      const payload = msg.payload as { projectData: EditorStreamProjectData };
      const runtimeProjectData = await this.resolveProjectDataForRuntime(payload.projectData);

      await this.dispatch({
        group: 'streams',
        action: 'update',
        options: {
          streamId: this._activeVideoStreamId,
          baseDir: this.getRuntimeMediaBaseDir(),
        },
        body: runtimeProjectData,
      });
    } else if (type === 'media:frameServer:projectPlayback:speed') {
      if (!this._activeVideoStreamId) return;
      const payload = msg.payload as { speed: number };

      await this.dispatch({
        group: 'streams',
        action: 'speed',
        options: {
          streamId: this._activeVideoStreamId,
          speed: payload.speed,
        },
      });
    } else if (type === 'media:frameServer:projectPlayback:quality') {
      if (!this._activeVideoStreamId) return;
      const payload = msg.payload as {
        width: number;
        height: number;
        bitrate?: number;
        fps?: number;
      };

      await this.dispatch({
        group: 'streams',
        action: 'quality',
        options: {
          streamId: this._activeVideoStreamId,
          width: payload.width,
          height: payload.height,
          ...(payload.bitrate !== undefined && { bitrate: payload.bitrate }),
          ...(payload.fps !== undefined && { fps: payload.fps }),
        },
      });
    }
  }

  // =========================================================================
  // Loudness Analysis
  // =========================================================================

  /**
   * media:analyzeLoudness → audios:analyze_loudness (per file)
   *
   * Accepts multiple sources and returns per-file analysis results.
   * Each file is analyzed sequentially to avoid overloading the engine.
   */
  private async handleAnalyzeLoudness(msg: Record<string, unknown>): Promise<void> {
    const requestId = msg.requestId as string;
    const payload = msg.payload as {
      sources: string[];
      targetLufs?: number;
    };

    try {
      const targetLufs = payload.targetLufs ?? -14;
      const results: Array<{
        source: string;
        analysis?: unknown;
        error?: string;
      }> = [];

      for (const source of payload.sources) {
        try {
          const absolutePath = await this.resolveMediaPath(source);
          const result = await this.dispatch({
            group: 'audios',
            action: 'analyze_loudness',
            options: { source: absolutePath, targetLufs },
          });
          results.push({ source, analysis: result.data });
        } catch (error) {
          results.push({
            source,
            error: error instanceof Error ? error.message : 'Analysis failed',
          });
        }
      }

      this.sendResponse({
        type: 'media:response:analyzeLoudness',
        requestId,
        payload: { results },
      });
    } catch (error) {
      this.sendResponse({
        type: 'media:response:analyzeLoudness',
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // =========================================================================
  // Stream Stats / Media Bitrate
  // =========================================================================

  private async handleStreamStats(msg: Record<string, unknown>): Promise<void> {
    const requestId = msg.requestId as string;
    const streamId = this._activeVideoStreamId;

    if (!streamId) {
      this.sendResponse({
        type: 'media:response:getStreamStats',
        requestId,
        payload: null,
      });
      return;
    }

    try {
      const result = await this.dispatch({
        group: 'streams',
        action: 'stats',
        options: { streamId },
      });

      this.sendResponse({
        type: 'media:response:getStreamStats',
        requestId,
        payload: result.data ?? null,
      });
    } catch (error) {
      this.sendResponse({
        type: 'media:response:getStreamStats',
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleMediaBitrate(msg: Record<string, unknown>): Promise<void> {
    const requestId = msg.requestId as string;
    const payload = msg.payload as { mediaPath: string };

    try {
      const absolutePath = await this.resolveMediaPath(payload.mediaPath);

      const result = await this.dispatch({
        group: 'videos',
        action: 'probe',
        options: { source: absolutePath },
      });

      const data = result.data as Record<string, unknown>;
      const videoBitrate = (data.bitrate as number) ?? 0;
      const audioBitrate = (data.audioBitrate as number) ?? 0;
      const totalBitrate = videoBitrate + audioBitrate;

      const formatBitrate = (bps: number): string => {
        if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
        if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
        return `${bps} bps`;
      };

      this.sendResponse({
        type: 'media:response:getMediaBitrate',
        requestId,
        payload: {
          videoBitrate,
          audioBitrate,
          totalBitrate,
          videoBitrateStr: formatBitrate(videoBitrate),
          totalBitrateStr: formatBitrate(totalBitrate),
        },
      });
    } catch (error) {
      this.sendResponse({
        type: 'media:response:getMediaBitrate',
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // =========================================================================
  // Effects / Shader API
  // =========================================================================

  /**
   * effects:list → list all GPU shader presets
   */
  private async handleEffectsList(msg: Record<string, unknown>): Promise<void> {
    const requestId = msg.requestId as string | undefined;
    try {
      const presets = await this.client.listEffects();
      this.sendResponse({
        type: 'effects:response:list',
        requestId,
        payload: presets,
      });
    } catch (error) {
      this.sendResponse({
        type: 'effects:response:list',
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * effects:info → get metadata for a specific shader
   */
  private async handleEffectsInfo(msg: Record<string, unknown>): Promise<void> {
    const requestId = msg.requestId as string | undefined;
    const payload = msg.payload as { shaderId: string } | undefined;
    const shaderId = payload?.shaderId ?? (msg.shaderId as string);
    try {
      const info = await this.client.getEffectInfo(shaderId);
      this.sendResponse({
        type: 'effects:response:info',
        requestId,
        payload: info,
      });
    } catch (error) {
      this.sendResponse({
        type: 'effects:response:info',
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * effects:register → register a custom WGSL shader at runtime
   */
  private async handleEffectsRegister(msg: Record<string, unknown>): Promise<void> {
    const requestId = msg.requestId as string | undefined;
    const payload = msg.payload as
      | {
          id: string;
          code: string;
          params?: Array<{ name: string; default: number; min: number; max: number }>;
        }
      | undefined;
    try {
      const id = payload?.id ?? (msg.id as string);
      const code = payload?.code ?? (msg.code as string);
      const params =
        payload?.params ??
        (msg.params as
          Array<{ name: string; default: number; min: number; max: number }> | undefined);
      await this.client.registerShader(id, code, params);
      this.sendResponse({
        type: 'effects:response:register',
        requestId,
        payload: { id, registered: true },
      });
    } catch (error) {
      this.sendResponse({
        type: 'effects:response:register',
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Dispatch an ActionRequest to NativeEngine via EngineClient
   */
  private async dispatch(req: ActionRequest): Promise<ActionResponse> {
    const response = await this.client.dispatch(req);

    if (response.status === 'error') {
      const errMsg = response.error?.message ?? `${req.group}:${req.action} failed`;
      throw new Error(errMsg);
    }

    return response;
  }

  /**
   * Resolve media path to absolute path
   */
  private async resolveMediaPath(mediaPath: string): Promise<string> {
    const baseDir = this.documentDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    return resolveMediaPathHelper(mediaPath, baseDir, {
      ...(this.documentUri
        ? { documentUri: this.documentUri, projectFilePath: this.documentUri.fsPath }
        : {}),
      fileExists: isExistingLocalFile,
    });
  }

  private getRuntimeMediaBaseDir(): string | undefined {
    if (!this.documentDir) return undefined;
    const context = createCutWorkspaceMediaPathContext(this.documentDir, {
      ...(this.documentUri
        ? { documentUri: this.documentUri, projectFilePath: this.documentUri.fsPath }
        : {}),
    });
    return context.owningWorkspaceRoot ?? this.documentDir;
  }

  private async resolveProjectDataForRuntime<T extends EditorStreamProjectData>(
    projectData: T,
  ): Promise<T> {
    if (!this.documentUri?.fsPath || !this.documentDir) return projectData;
    return (await resolveProjectMediaSourcesForRuntime(
      projectData as unknown as ProjectData,
      this.documentUri.fsPath,
      { documentUri: this.documentUri, fileExists: isExistingLocalFile },
    )) as unknown as T;
  }

  /**
   * Build a minimal Timeline object for timelines:composite
   */
  private async buildTimelineForComposite(
    layers: Array<{
      source: string;
      sourceTime: number;
      transform?: {
        x?: number;
        y?: number;
        scaleX?: number;
        scaleY?: number;
        rotation?: number;
        anchorX?: number;
        anchorY?: number;
      };
      opacity?: number;
      zIndex?: number;
      effects?: Array<{
        type: string;
        parameters: Record<string, unknown>;
        order: number;
      }>;
      masks?: Array<{
        shape: unknown;
        inverted: boolean;
        feather: number;
        expansion: number;
        opacity: number;
        blendMode: string;
      }>;
      transition?: {
        type: string;
        progress: number;
        pairedLayerIndex: number;
        easing: string;
      };
      blendMode?: string;
    }>,
    width: number,
    height: number,
    backgroundColor?: [number, number, number, number],
  ): Promise<object> {
    // Resolve all layer sources in parallel before building the project
    const resolvedSources = await Promise.all(
      layers.map((layer) => this.resolveMediaPath(layer.source)),
    );

    return {
      id: 'composite-frame',
      duration: 1,
      fps: 30,
      resolution: { width, height },
      backgroundColor: backgroundColor ? backgroundColor.map((c) => c / 255) : [0, 0, 0, 1],
      tracks: [
        {
          id: 'composite-track',
          type: 'video',
          elements: layers.map((layer, index) => ({
            id: `layer-${index}`,
            type: 'media',
            src: resolvedSources[index],
            startTime: 0,
            duration: 1,
            trimStart: layer.sourceTime,
            transform: layer.transform,
            opacity: layer.opacity ?? 1,
            zIndex: layer.zIndex ?? index,
            // Pass through effects for engine GPU processing
            ...(layer.effects && layer.effects.length > 0 && { effects: layer.effects }),
            // Pass through masks for engine GPU rasterization
            ...(layer.masks && layer.masks.length > 0 && { masks: layer.masks }),
            // Pass through transition for paired layer blending
            ...(layer.transition && { transition: layer.transition }),
            // Pass through blend mode for GPU compositing
            ...(layer.blendMode && { blendMode: layer.blendMode }),
          })),
        },
      ],
    };
  }

  /**
   * Send response to Webview (safely handles disposed webview)
   */
  private sendResponse(response: unknown): void {
    if (this.disposed) return;
    try {
      this.webviewPanel.webview.postMessage(response);
    } catch {
      // Webview was disposed, silently ignore
    }
  }

  // =========================================================================
  // Type Guards
  // =========================================================================

  private isStandardMediaRequest(msg: Record<string, unknown>): boolean {
    return (
      typeof msg.type === 'string' &&
      msg.type.startsWith('media:') &&
      !msg.type.includes('compatible') &&
      !msg.type.includes('renderComposite') &&
      !msg.type.includes('frameServer') &&
      msg.type !== 'media:getPerformanceStats' &&
      msg.type !== 'media:getMediaBitrate' &&
      typeof msg.requestId === 'string' &&
      typeof msg.timestamp === 'number' &&
      typeof msg.payload === 'object'
    );
  }

  private isCompatibleModeRequest(msg: Record<string, unknown>): boolean {
    return (
      typeof msg.type === 'string' &&
      (msg.type === 'media:compatibleGetVideoFrame' || msg.type === 'media:renderCompositeFrame') &&
      typeof msg.requestId === 'string' &&
      typeof msg.timestamp === 'number' &&
      typeof msg.payload === 'object'
    );
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this.disposed = true;
    // destroyEditorStream is async — fire-and-forget during disposal
    this.destroyEditorStream().catch(() => {});
  }
}
