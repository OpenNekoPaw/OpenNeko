import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import {
  DEFAULT_PANORAMA_VIEW_STATE,
  type PreviewAssetKind,
  type PreviewManifest,
  type PreviewProjectionType,
  type PreviewVariant,
  type PreviewVariantRequest,
  type RegisterPreviewAssetRequest,
  type UpdatePreviewAssetMetadataRequest,
} from '@neko/shared';
import { NodeMediaRuntime } from '@neko/media/node';
import type {
  HtmlVideoDescriptor,
  HtmlVideoNativeCapabilities,
  PcmStreamDescriptor,
} from '@neko/media';
import type { MediaInfo } from '../types/api';

export type { MediaInfo } from '../types/api';

interface PreviewAssetRecord {
  readonly sourcePath: string;
  readonly sessionIds: readonly string[];
  manifest: PreviewManifest;
}

export interface PreviewPlayback {
  readonly videoSessionId?: string;
  readonly video?: HtmlVideoDescriptor;
  readonly audioSessionId?: string;
  readonly audio?: PcmStreamDescriptor;
}

export type PreviewPlaybackKind = 'video' | 'audio';

export interface PreviewPlaybackOptions {
  readonly nativeVideoCapabilities?: HtmlVideoNativeCapabilities;
}

export type PreviewMediaRuntime = Pick<
  NodeMediaRuntime,
  | 'probe'
  | 'captureFrame'
  | 'generateWaveform'
  | 'prepareVideo'
  | 'publishFile'
  | 'startPcm'
  | 'stop'
  | 'dispose'
>;

export class PreviewService implements vscode.Disposable {
  private readonly assets = new Map<string, PreviewAssetRecord>();
  private disposed = false;

  static async tryCreate(): Promise<PreviewService> {
    return new PreviewService(new NodeMediaRuntime());
  }

  constructor(private readonly runtime: PreviewMediaRuntime) {}

  get isAvailable(): boolean {
    return !this.disposed;
  }

  async probeMedia(filePath: string): Promise<MediaInfo> {
    const probe = await this.runtime.probe(filePath);
    const video = probe.video;
    const audio = probe.audioStreams[0];
    return {
      duration: probe.durationSeconds,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      fps: video?.framesPerSecond ?? 0,
      codec: video?.codecName ?? audio?.codecName ?? 'unknown',
      format: probe.formatName ?? path.extname(filePath).slice(1),
      ...(probe.bitRate === undefined ? {} : { bitrate: probe.bitRate }),
      hasAudio: audio !== undefined,
      ...(audio
        ? {
            audioCodec: audio.codecName,
            audioSampleRate: audio.sampleRate,
            audioChannels: audio.channels,
          }
        : {}),
    };
  }

  async startPlayback(
    filePath: string,
    mediaInfo: MediaInfo,
    kind: PreviewPlaybackKind,
    startTimeSeconds = 0,
    playbackRate = 1,
    options: PreviewPlaybackOptions = {},
  ): Promise<PreviewPlayback> {
    this.assertAvailable();
    const remainingDuration = Math.max(0, mediaInfo.duration - startTimeSeconds);
    if (remainingDuration <= 0) throw new Error('Preview start is outside the media duration.');
    const video =
      kind === 'video'
        ? options.nativeVideoCapabilities
          ? await this.runtime.prepareVideo(filePath, {
              nativeCapabilities: options.nativeVideoCapabilities,
            })
          : await this.runtime.prepareVideo(filePath)
        : undefined;
    try {
      const audio = mediaInfo.hasAudio
        ? await this.runtime.startPcm(filePath, {
            startTimeSeconds,
            durationSeconds: remainingDuration,
            playbackRate,
          })
        : undefined;
      return {
        ...(video ? { videoSessionId: video.sessionId, video: video.video } : {}),
        ...(audio ? { audioSessionId: audio.sessionId, audio: audio.stream } : {}),
      };
    } catch (error) {
      if (video) await this.runtime.stop(video.sessionId);
      throw error;
    }
  }

  async stopPlayback(playback: {
    readonly videoSessionId?: string;
    readonly audioSessionId?: string;
  }): Promise<void> {
    const ids = [playback.videoSessionId, playback.audioSessionId].filter(
      (value): value is string => value !== undefined,
    );
    await Promise.all(ids.map((id) => this.runtime.stop(id)));
  }

  async getWaveform(
    filePath: string,
  ): Promise<{ peaks: number[]; duration: number; sampleRate: number; partial?: boolean }> {
    const waveform = await this.runtime.generateWaveform(filePath, { peaksPerSecond: 100 });
    return {
      peaks: [...waveform.peaks],
      duration: waveform.durationSeconds,
      sampleRate: waveform.sampleRate,
      ...(waveform.partial ? { partial: true } : {}),
    };
  }

  async captureFrame(filePath: string, time: number, quality = 80): Promise<string> {
    return this.runtime.captureFrame(filePath, time, { quality });
  }

  async registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest> {
    this.assertAvailable();
    const sourcePath = path.resolve(request.source);
    const [metadata, probe] = await Promise.all([
      fs.stat(sourcePath),
      this.runtime.probe(sourcePath),
    ]);
    if (!metadata.isFile()) throw new Error('Preview source must be a file.');
    const kind = request.kind ?? inferKind(sourcePath, probe.video !== undefined);
    const published =
      kind === 'video'
        ? await this.runtime.prepareVideo(sourcePath)
        : await this.runtime.publishFile(sourcePath, mimeTypeFor(sourcePath));
    const sessionId = published.sessionId;
    const sourceUrl = 'video' in published ? published.video.url : published.url;
    const assetId = randomUUID();
    const projectionType =
      request.expectedProjection ?? inferProjection(probe.video?.width, probe.video?.height);
    const sourceVariant: PreviewVariant = {
      id: randomUUID(),
      assetId,
      role: 'source',
      url: sourceUrl,
      token: sessionId,
      mimeType: mimeTypeFor(sourcePath),
      ...(probe.video
        ? { dimensions: { width: probe.video.width, height: probe.video.height } }
        : {}),
      fileSizeBytes: metadata.size,
    };
    const manifest: PreviewManifest = {
      manifestVersion: 1,
      assetId,
      token: sessionId,
      kind,
      status: 'ready',
      sourceName: path.basename(sourcePath),
      sourceUrl,
      projection: {
        type: projectionType,
        confidence: request.expectedProjection ? 'explicit' : 'heuristic',
        source: request.expectedProjection ? 'metadata' : 'aspect-ratio',
        ...(projectionType === 'unknown' ? { requiresConfirmation: true } : {}),
      },
      media: {
        ...(probe.video
          ? { dimensions: { width: probe.video.width, height: probe.video.height } }
          : {}),
        fileSizeBytes: metadata.size,
        mimeType: mimeTypeFor(sourcePath),
        dynamicRange: isHdrTransfer(probe.video?.color.transfer) ? 'hdr' : 'sdr',
        ...(probe.video?.bitDepth === undefined ? {} : { bitDepth: probe.video.bitDepth }),
        codec: {
          ...(probe.formatName ? { container: probe.formatName } : {}),
          ...(kind === 'image' && probe.video ? { imageFormat: probe.video.codecName } : {}),
          ...(kind === 'video' && probe.video ? { videoCodec: probe.video.codecName } : {}),
          ...(probe.audioStreams[0] ? { audioCodec: probe.audioStreams[0].codecName } : {}),
          ...(probe.video?.pixelFormat ? { pixelFormat: probe.video.pixelFormat } : {}),
          ...(probe.video?.color.space ? { colorSpace: probe.video.color.space } : {}),
          ...(probe.durationSeconds > 0 ? { durationSecs: probe.durationSeconds } : {}),
          ...(probe.video ? { fps: probe.video.framesPerSecond } : {}),
          hasAudio: probe.audioStreams.length > 0,
        },
      },
      defaultViewState: DEFAULT_PANORAMA_VIEW_STATE,
      variants: [sourceVariant],
      createdAt: new Date().toISOString(),
    };
    this.assets.set(assetId, { sourcePath, sessionIds: [sessionId], manifest });
    return manifest;
  }

  async requestPreviewVariant(
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<PreviewVariant> {
    const record = this.requireAsset(assetId);
    const existing = record.manifest.variants.find(
      (variant) => variant.role === request.role && request.role === 'source',
    );
    if (existing) return existing;
    if (
      request.role !== 'thumbnail' &&
      request.role !== 'fov-crop' &&
      request.role !== 'screenshot' &&
      request.role !== 'proxy'
    ) {
      throw new Error(`Preview variant role ${request.role} is not implemented by Node media.`);
    }
    if (request.role === 'proxy') {
      const source = record.manifest.variants[0];
      if (!source) throw new Error('Preview asset has no source variant.');
      return { ...source, id: randomUUID(), role: 'proxy' };
    }
    const dataUrl = await this.runtime.captureFrame(record.sourcePath, 0, {
      ...(request.width ? { width: request.width } : {}),
      ...(request.height ? { height: request.height } : {}),
      quality: request.quality ?? 85,
    });
    const variant: PreviewVariant = {
      id: randomUUID(),
      assetId,
      role: request.role,
      url: dataUrl,
      mimeType: 'image/jpeg',
      ...(request.width && request.height
        ? { dimensions: { width: request.width, height: request.height } }
        : {}),
      ...(request.viewState ? { viewState: request.viewState } : {}),
    };
    record.manifest = { ...record.manifest, variants: [...record.manifest.variants, variant] };
    return variant;
  }

  async updatePreviewAssetMetadata(
    assetId: string,
    request: UpdatePreviewAssetMetadataRequest,
  ): Promise<PreviewManifest> {
    const record = this.requireAsset(assetId);
    record.manifest = {
      ...record.manifest,
      projection: {
        ...record.manifest.projection,
        ...(request.projectionType
          ? { type: request.projectionType, confidence: 'manual', source: 'manual' }
          : {}),
        ...(request.coverageAngle ? { coverageAngle: request.coverageAngle } : {}),
      },
      ...(request.defaultViewState ? { defaultViewState: request.defaultViewState } : {}),
    };
    return record.manifest;
  }

  async unregisterPreviewAsset(assetIdOrToken: string): Promise<void> {
    const record =
      this.assets.get(assetIdOrToken) ??
      [...this.assets.values()].find((candidate) => candidate.manifest.token === assetIdOrToken);
    if (!record) throw new Error(`Unknown preview asset: ${assetIdOrToken}`);
    this.assets.delete(record.manifest.assetId);
    await Promise.all(record.sessionIds.map((id) => this.runtime.stop(id)));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.assets.clear();
    await this.runtime.dispose();
  }

  private requireAsset(assetId: string): PreviewAssetRecord {
    const record = this.assets.get(assetId);
    if (!record) throw new Error(`Unknown preview asset: ${assetId}`);
    return record;
  }

  private assertAvailable(): void {
    if (this.disposed) throw new Error('PreviewService is disposed.');
  }
}

function inferKind(sourcePath: string, hasVideo: boolean): PreviewAssetKind {
  if (/\.(?:jpg|jpeg|png|webp|hdr|exr)$/iu.test(sourcePath)) return 'image';
  return hasVideo ? 'video' : 'audio';
}

function inferProjection(
  width: number | undefined,
  height: number | undefined,
): PreviewProjectionType {
  if (!width || !height) return 'unknown';
  const ratio = width / height;
  if (ratio >= 1.9 && ratio <= 2.1) return 'equirectangular';
  return 'flat';
}

function mimeTypeFor(sourcePath: string): string {
  switch (path.extname(sourcePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    default:
      return 'video/mp4';
  }
}

function isHdrTransfer(transfer: string | undefined): boolean {
  return transfer === 'smpte2084' || transfer === 'arib-std-b67';
}
