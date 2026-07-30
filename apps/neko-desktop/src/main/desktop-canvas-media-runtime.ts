import type { HtmlVideoDescriptor, MediaProbe, PcmStreamDescriptor } from '@neko/media';
import { NodeMediaRuntime } from '@neko/media/node';
import type { CanvasHostRuntimeIdentity } from '@neko-canvas/domain';
import type { DesktopMediaDescriptorRegistry } from './desktop-media-protocol';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';
import { resolveDesktopWorkspaceContentLocator } from './desktop-content-locator';
import type {
  DesktopCanvasMediaInfo,
  DesktopCanvasMediaRequest,
  DesktopCanvasMediaResponse,
} from '../shared/canvas-bridge-contract';

interface DesktopCanvasMediaHandle {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly descriptorSessionId: string;
  readonly sourcePath: string;
  readonly mediaInfo: DesktopCanvasMediaInfo;
  readonly mediaType: 'video' | 'audio';
  readonly speed: number;
  readonly videoSessionId?: string;
  readonly audioSessionId?: string;
  readonly video?: HtmlVideoDescriptor;
  readonly audio?: PcmStreamDescriptor;
}

export interface DesktopCanvasNodeMediaPort {
  probe(sourcePath: string): Promise<MediaProbe>;
  captureFrame(
    sourcePath: string,
    timeSeconds: number,
    options?: { readonly width?: number; readonly height?: number; readonly quality?: number },
  ): Promise<string>;
  prepareVideo(sourcePath: string): Promise<{
    readonly sessionId: string;
    readonly video: HtmlVideoDescriptor;
  }>;
  startPcm(
    sourcePath: string,
    options: {
      readonly startTimeSeconds: number;
      readonly durationSeconds: number;
      readonly playbackRate: number;
    },
  ): Promise<{ readonly sessionId: string; readonly stream: PcmStreamDescriptor }>;
  stop(sessionId: string): Promise<void>;
  dispose(): Promise<void>;
}

export class DesktopCanvasMediaRuntime {
  private readonly streams = new Map<string, DesktopCanvasMediaHandle>();
  private readonly pendingCleanup = new Set<Promise<void>>();
  private readonly media: DesktopCanvasNodeMediaPort;
  private disposed = false;

  constructor(
    private readonly options: {
      readonly mediaRegistry: DesktopMediaDescriptorRegistry;
      readonly resolveWebContentsId: (windowId: string) => number;
      readonly media?: DesktopCanvasNodeMediaPort;
    },
  ) {
    this.media = options.media ?? new NodeMediaRuntime();
  }

  async execute(
    request: DesktopCanvasMediaRequest,
    workspace: DesktopWorkspaceResolution,
  ): Promise<DesktopCanvasMediaResponse | undefined> {
    this.requireActive();
    const key = streamKey(request.identity, request.nodeId);
    switch (request.type) {
      case 'media:probe':
        return this.probe(request, workspace);
      case 'media:play':
        return this.play(request, workspace, key);
      case 'media:seek':
        return this.seek(request, key);
      case 'media:pause':
      case 'media:resume':
        return undefined;
      case 'media:stop':
        await this.stopKey(key);
        return undefined;
      case 'media:captureFrame':
        return this.captureFrame(request, workspace);
    }
  }

  detachWindow(windowId: string): void {
    const keys = [...this.streams.keys()].filter((key) => key.startsWith(`${windowId}\u0000`));
    this.trackCleanup(Promise.all(keys.map((key) => this.stopKey(key))).then(() => undefined));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const keys = [...this.streams.keys()];
    await Promise.all(keys.map((key) => this.stopKey(key)));
    await Promise.all(this.pendingCleanup);
    await this.media.dispose();
  }

  private async probe(
    request: Extract<DesktopCanvasMediaRequest, { readonly type: 'media:probe' }>,
    workspace: DesktopWorkspaceResolution,
  ): Promise<DesktopCanvasMediaResponse> {
    try {
      const sourcePath = await resolveDesktopWorkspaceContentLocator(workspace, request.locator);
      return {
        type: 'media:probeResult',
        nodeId: request.nodeId,
        mediaInfo: projectMediaInfo(await this.media.probe(sourcePath)),
      };
    } catch (error: unknown) {
      return {
        type: 'media:probeResult',
        nodeId: request.nodeId,
        error: describeError(error),
      };
    }
  }

  private async play(
    request: Extract<DesktopCanvasMediaRequest, { readonly type: 'media:play' }>,
    workspace: DesktopWorkspaceResolution,
    key: string,
  ): Promise<DesktopCanvasMediaResponse> {
    try {
      const sourcePath = await resolveDesktopWorkspaceContentLocator(workspace, request.locator);
      await this.stopKey(key);
      const handle = await this.startPlayback(
        request.identity,
        key,
        sourcePath,
        request.mediaInfo,
        request.mediaType,
        request.startTime,
        request.speed,
      );
      this.streams.set(key, handle);
      return streamReadyResponse(request.nodeId, handle, request.startTime);
    } catch (error: unknown) {
      return {
        type: 'media:streamReady',
        nodeId: request.nodeId,
        error: describeError(error),
      };
    }
  }

  private async seek(
    request: Extract<DesktopCanvasMediaRequest, { readonly type: 'media:seek' }>,
    key: string,
  ): Promise<DesktopCanvasMediaResponse | undefined> {
    const current = this.streams.get(key);
    if (!current) return undefined;
    try {
      await this.stopKey(key);
      const replacement = await this.startPlayback(
        current.identity,
        key,
        current.sourcePath,
        current.mediaInfo,
        current.mediaType,
        request.time,
        current.speed,
      );
      this.streams.set(key, replacement);
      return streamReadyResponse(request.nodeId, replacement, request.time);
    } catch (error: unknown) {
      return {
        type: 'media:streamReady',
        nodeId: request.nodeId,
        error: describeError(error),
      };
    }
  }

  private async captureFrame(
    request: Extract<DesktopCanvasMediaRequest, { readonly type: 'media:captureFrame' }>,
    workspace: DesktopWorkspaceResolution,
  ): Promise<DesktopCanvasMediaResponse> {
    try {
      const sourcePath = await resolveDesktopWorkspaceContentLocator(workspace, request.locator);
      return {
        type: 'media:captureFrameResult',
        nodeId: request.nodeId,
        dataUrl: await this.media.captureFrame(sourcePath, request.time, {
          width: 640,
          height: 400,
          quality: 82,
        }),
      };
    } catch (error: unknown) {
      return {
        type: 'media:captureFrameResult',
        nodeId: request.nodeId,
        error: describeError(error),
      };
    }
  }

  private async startPlayback(
    identity: CanvasHostRuntimeIdentity,
    key: string,
    sourcePath: string,
    mediaInfo: DesktopCanvasMediaInfo,
    mediaType: 'video' | 'audio',
    startTime: number,
    speed: number,
  ): Promise<DesktopCanvasMediaHandle> {
    const duration = Math.max(0, mediaInfo.duration - startTime);
    if (duration <= 0) {
      throw new Error('Desktop Canvas playback start is outside the media duration.');
    }
    const descriptorSessionId = `canvas-media:${key}`;
    const video = mediaType === 'video' ? await this.media.prepareVideo(sourcePath) : undefined;
    let audio:
      | {
          readonly sessionId: string;
          readonly stream: PcmStreamDescriptor;
        }
      | undefined;
    try {
      audio =
        mediaType === 'audio' || mediaInfo.hasAudio
          ? await this.media.startPcm(sourcePath, {
              startTimeSeconds: startTime,
              durationSeconds: duration,
              playbackRate: speed,
            })
          : undefined;
      return {
        identity,
        descriptorSessionId,
        sourcePath,
        mediaInfo,
        mediaType,
        speed,
        ...(video
          ? {
              videoSessionId: video.sessionId,
              video: this.authorizeVideo(identity, descriptorSessionId, video.video),
            }
          : {}),
        ...(audio
          ? {
              audioSessionId: audio.sessionId,
              audio: this.authorizeAudio(identity, descriptorSessionId, audio.stream),
            }
          : {}),
      };
    } catch (error: unknown) {
      this.options.mediaRegistry.releaseSession(descriptorSessionId);
      await Promise.all(
        [video?.sessionId, audio?.sessionId]
          .filter((sessionId): sessionId is string => sessionId !== undefined)
          .map((sessionId) => this.media.stop(sessionId)),
      );
      throw error;
    }
  }

  private async stopKey(key: string): Promise<void> {
    const handle = this.streams.get(key);
    if (!handle) return;
    this.streams.delete(key);
    this.options.mediaRegistry.releaseSession(handle.descriptorSessionId);
    const sessionIds = [handle.videoSessionId, handle.audioSessionId].filter(
      (sessionId): sessionId is string => sessionId !== undefined,
    );
    await Promise.all(sessionIds.map((sessionId) => this.media.stop(sessionId)));
  }

  private authorizeVideo(
    identity: CanvasHostRuntimeIdentity,
    descriptorSessionId: string,
    descriptor: HtmlVideoDescriptor,
  ): HtmlVideoDescriptor {
    return {
      ...descriptor,
      transport: 'authorized',
      url: this.authorizeUpstreamMedia(
        identity,
        descriptorSessionId,
        descriptor.url,
        descriptor.mimeType,
        'video.mp4',
      ),
    };
  }

  private authorizeAudio(
    identity: CanvasHostRuntimeIdentity,
    descriptorSessionId: string,
    descriptor: PcmStreamDescriptor,
  ): PcmStreamDescriptor {
    return {
      ...descriptor,
      transport: 'authorized',
      streamUrl: this.authorizeUpstreamMedia(
        identity,
        descriptorSessionId,
        descriptor.streamUrl,
        'application/octet-stream',
        'audio.pcm',
      ),
    };
  }

  private authorizeUpstreamMedia(
    identity: CanvasHostRuntimeIdentity,
    descriptorSessionId: string,
    upstreamUrl: string,
    mediaType: string,
    displayName: string,
  ): string {
    const descriptorId = this.options.mediaRegistry.registerUpstream({
      webContentsId: this.options.resolveWebContentsId(identity.windowId),
      windowId: identity.windowId,
      viewId: identity.viewId,
      sessionId: descriptorSessionId,
      revision: descriptorSessionId,
      upstreamUrl,
      mediaType,
    });
    return `neko-media://desktop/${encodeURIComponent(descriptorId)}/${encodeURIComponent(
      displayName,
    )}`;
  }

  private trackCleanup(cleanup: Promise<void>): void {
    this.pendingCleanup.add(cleanup);
    void cleanup.then(
      () => this.pendingCleanup.delete(cleanup),
      () => this.pendingCleanup.delete(cleanup),
    );
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Canvas media runtime is disposed.');
  }
}

function streamReadyResponse(
  nodeId: string,
  handle: DesktopCanvasMediaHandle,
  startTime: number,
): DesktopCanvasMediaResponse {
  return {
    type: 'media:streamReady',
    nodeId,
    mediaInfo: handle.mediaInfo,
    ...(handle.video ? { video: handle.video } : {}),
    ...(handle.audio ? { audio: handle.audio } : {}),
    startTime,
    playbackRate: handle.speed,
  };
}

function projectMediaInfo(probe: MediaProbe): DesktopCanvasMediaInfo {
  const video = probe.video;
  const audio = probe.audioStreams[0];
  return {
    duration: probe.durationSeconds,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: video?.framesPerSecond ?? 0,
    codec: video?.codecName ?? audio?.codecName ?? 'unknown',
    format: probe.formatName ?? 'unknown',
    hasAudio: audio !== undefined,
    ...(probe.bitRate === undefined ? {} : { bitrate: probe.bitRate }),
    ...(audio
      ? {
          audioCodec: audio.codecName,
          audioSampleRate: audio.sampleRate,
          audioChannels: audio.channels,
        }
      : {}),
  };
}

function streamKey(identity: CanvasHostRuntimeIdentity, nodeId: string): string {
  return [
    identity.windowId,
    identity.viewId,
    String(identity.viewEpoch),
    identity.documentId,
    identity.sessionId,
    identity.endpointEpoch,
    nodeId,
  ].join('\u0000');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
