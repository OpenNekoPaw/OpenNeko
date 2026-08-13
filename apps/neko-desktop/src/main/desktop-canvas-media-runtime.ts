import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { HtmlAudioDescriptor, HtmlVideoDescriptor, MediaProbe } from '@neko/media';
import { NodeMediaRuntime, type NodeMediaPublisher } from '@neko/media/node';
import type {
  CanvasHostRuntimeIdentity,
  CanvasMediaHostInfo,
  CanvasMediaHostRequest,
  CanvasMediaHostResponse,
} from '@neko/canvas-domain';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import type { DesktopResourceRegistry } from './desktop-resource-registry';

interface DesktopCanvasMediaHandle {
  readonly identity: CanvasHostRuntimeIdentity;
  readonly contentLocator: {
    readonly kind: 'workspace-file';
    readonly path: string;
  };
  readonly sourcePath: string;
  readonly mediaInfo: CanvasMediaHostInfo;
  readonly mediaType: 'video' | 'audio';
  readonly speed: number;
  readonly videoSessionId?: string;
  readonly audioSessionId?: string;
  readonly video?: HtmlVideoDescriptor;
  readonly audio?: HtmlAudioDescriptor;
  readonly media: DesktopCanvasNodeMediaPort;
  readonly ownsMedia: boolean;
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
  publishFile(
    sourcePath: string,
    contentType: string,
  ): Promise<{ readonly sessionId: string; readonly url: string }>;
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
      readonly resources?: Pick<DesktopResourceRegistry, 'createMediaPublisher'>;
      readonly media?: DesktopCanvasNodeMediaPort;
    },
  ) {
    this.media =
      options.media ?? new NodeMediaRuntime({ publisher: UNAVAILABLE_DESKTOP_MEDIA_PUBLISHER });
  }

  async execute(
    request: CanvasMediaHostRequest,
    workspace: AssetWorkspaceResolution,
  ): Promise<CanvasMediaHostResponse | undefined> {
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

  detachView(windowId: string, viewId: string): void {
    const prefix = `${windowId}\u0000${viewId}\u0000`;
    const keys = [...this.streams.keys()].filter((key) => key.startsWith(prefix));
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
    request: Extract<CanvasMediaHostRequest, { readonly type: 'media:probe' }>,
    workspace: AssetWorkspaceResolution,
  ): Promise<CanvasMediaHostResponse> {
    try {
      const sourcePath = await resolveWorkspaceContentLocator(workspace, request.locator);
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
    request: Extract<CanvasMediaHostRequest, { readonly type: 'media:play' }>,
    workspace: AssetWorkspaceResolution,
    key: string,
  ): Promise<CanvasMediaHostResponse> {
    try {
      const sourcePath = await resolveWorkspaceContentLocator(workspace, request.locator);
      await this.stopKey(key);
      const handle = await this.startPlayback(
        request.identity,
        request.locator,
        request.nodeId,
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
    request: Extract<CanvasMediaHostRequest, { readonly type: 'media:seek' }>,
    key: string,
  ): Promise<CanvasMediaHostResponse | undefined> {
    const current = this.streams.get(key);
    if (!current) return undefined;
    try {
      await this.stopKey(key);
      const replacement = await this.startPlayback(
        current.identity,
        current.contentLocator,
        request.nodeId,
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
    request: Extract<CanvasMediaHostRequest, { readonly type: 'media:captureFrame' }>,
    workspace: AssetWorkspaceResolution,
  ): Promise<CanvasMediaHostResponse> {
    try {
      const sourcePath = await resolveWorkspaceContentLocator(workspace, request.locator);
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
    contentLocator: { readonly kind: 'workspace-file'; readonly path: string },
    nodeId: string,
    sourcePath: string,
    mediaInfo: CanvasMediaHostInfo,
    mediaType: 'video' | 'audio',
    startTime: number,
    speed: number,
  ): Promise<DesktopCanvasMediaHandle> {
    const duration = Math.max(0, mediaInfo.duration - startTime);
    if (duration <= 0) {
      throw new Error('Desktop Canvas playback start is outside the media duration.');
    }
    const playbackMedia = await this.createPlaybackMedia(identity, nodeId, sourcePath);
    const video =
      mediaType === 'video' ? await playbackMedia.media.prepareVideo(sourcePath) : undefined;
    let audio:
      | {
          readonly sessionId: string;
          readonly url: string;
        }
      | undefined;
    try {
      audio =
        mediaType === 'audio'
          ? await playbackMedia.media.publishFile(sourcePath, audioMimeType(sourcePath))
          : undefined;
      return {
        identity,
        contentLocator,
        sourcePath,
        mediaInfo,
        mediaType,
        speed,
        media: playbackMedia.media,
        ownsMedia: playbackMedia.ownsMedia,
        ...(video
          ? {
              videoSessionId: video.sessionId,
              video: video.video,
            }
          : {}),
        ...(audio
          ? {
              audioSessionId: audio.sessionId,
              audio: {
                url: audio.url,
                mimeType: audioMimeType(sourcePath),
                durationSeconds: mediaInfo.duration,
              },
            }
          : {}),
      };
    } catch (error: unknown) {
      await Promise.all(
        [video?.sessionId, audio?.sessionId]
          .filter((sessionId): sessionId is string => sessionId !== undefined)
          .map((sessionId) => playbackMedia.media.stop(sessionId)),
      );
      if (playbackMedia.ownsMedia) await playbackMedia.media.dispose();
      throw error;
    }
  }

  private async stopKey(key: string): Promise<void> {
    const handle = this.streams.get(key);
    if (!handle) return;
    this.streams.delete(key);
    const sessionIds = [handle.videoSessionId, handle.audioSessionId].filter(
      (sessionId): sessionId is string => sessionId !== undefined,
    );
    await Promise.all(sessionIds.map((sessionId) => handle.media.stop(sessionId)));
    if (handle.ownsMedia) await handle.media.dispose();
  }

  private async createPlaybackMedia(
    identity: CanvasHostRuntimeIdentity,
    nodeId: string,
    sourcePath: string,
  ): Promise<{ readonly media: DesktopCanvasNodeMediaPort; readonly ownsMedia: boolean }> {
    if (this.options.media) return { media: this.options.media, ownsMedia: false };
    const resources = this.options.resources;
    if (!resources) {
      throw new Error('Desktop Canvas playback requires the app resource registry.');
    }
    const metadata = await stat(sourcePath);
    if (!metadata.isFile()) throw new Error('Desktop Canvas media source is not a file.');
    return {
      media: new NodeMediaRuntime({
        publisher: resources.createMediaPublisher({
          windowId: identity.windowId,
          viewId: identity.viewId,
          sessionId: `canvas-media:${identity.sessionId}:${nodeId}`,
          rendererSessionId: identity.rendererSessionId,
        }),
      }),
      ownsMedia: true,
    };
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

const UNAVAILABLE_DESKTOP_MEDIA_PUBLISHER = {
  registerFile: async () => {
    throw new Error('Desktop Canvas media publication requires the app resource registry.');
  },
  registerPcm: async () => {
    throw new Error('Desktop Canvas PCM is not available for ordinary node playback.');
  },
  unregister: () => {
    throw new Error('Desktop Canvas cannot release an unregistered media capability.');
  },
} satisfies NodeMediaPublisher;

function streamReadyResponse(
  nodeId: string,
  handle: DesktopCanvasMediaHandle,
  startTime: number,
): CanvasMediaHostResponse {
  return {
    type: 'media:streamReady',
    nodeId,
    mediaInfo: handle.mediaInfo,
    contentLocator: handle.contentLocator,
    ...(handle.video ? { video: handle.video } : {}),
    ...(handle.audio ? { audio: handle.audio } : {}),
    startTime,
    playbackRate: handle.speed,
  };
}

function audioMimeType(sourcePath: string): string {
  switch (path.extname(sourcePath).toLocaleLowerCase()) {
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.m4a':
    case '.mp4':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
    case '.oga':
      return 'audio/ogg';
    default:
      throw new Error('Desktop Canvas audio source requires an accepted native profile.');
  }
}

function projectMediaInfo(probe: MediaProbe): CanvasMediaHostInfo {
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
    String(identity.viewInstanceId),
    identity.documentId,
    identity.sessionId,
    identity.rendererSessionId,
    nodeId,
  ].join('\u0000');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
