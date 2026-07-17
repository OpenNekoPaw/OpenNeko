/** HTTP/WS client for the pruned local Rust media engine. */

import { PathResolver } from '@neko/shared';
import type {
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
  UpdatePreviewAssetMetadataRequest,
} from '@neko/shared';
import type {
  ActionRequest,
  ActionResponse,
  DiffResult,
  EffectApplyResult,
  EffectCapability,
  EffectPresetInfo,
  LoudnessAnalysis,
  ProbeResult,
  RawProbeData,
  RawWaveformData,
  Resolution,
  ShaderParamDef,
  SilenceAnalysis,
  StreamHandle,
  WaveformResult,
} from './engine/types';
import { transformDiffResponse } from './engine/responseTransform';
import { getLogger } from './utils/logger';
import { isRecord } from './utils/wireReaders';

export interface EngineClientConfig {
  /** Request timeout in milliseconds. */
  timeout?: number;
}

export type FileAccessPurpose = 'preview' | 'media-decode' | 'subtitle' | 'other';

export interface FileSourceRef {
  token?: string;
  path?: string;
  assetId?: string;
}

export interface RegisterFileRequest {
  source?: string;
  filePath?: string;
  path?: string;
  purpose?: FileAccessPurpose;
  ttlMs?: number;
  mimeHint?: string;
}

export interface RegisteredFile {
  token: string;
  fileSizeBytes: number;
  mimeType: string;
  purpose: FileAccessPurpose;
  rangeUrl: string;
}

export interface DetectedShot {
  readonly index: number;
  readonly start: number;
  readonly end: number | null;
  readonly confidence: number | null;
}

const logger = getLogger('EngineClient');

export class EngineClient {
  readonly port: number;
  private readonly timeout: number;
  private pathResolver: PathResolver | null = null;

  constructor(port: number, config?: EngineClientConfig) {
    this.port = port;
    this.timeout = config?.timeout ?? 120_000;
  }

  setPathResolver(resolver: PathResolver): void {
    this.pathResolver = resolver;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get wsBaseUrl(): string {
    return `ws://127.0.0.1:${this.port}/v1/streams`;
  }

  getStreamWsUrl(streamId: string): string {
    return `${this.wsBaseUrl}/${streamId}`;
  }

  getAudioWsUrl(streamId: string): string {
    return `ws://127.0.0.1:${this.port}/v1/audio/${streamId}`;
  }

  async dispatch(req: ActionRequest): Promise<ActionResponse> {
    const resolvedSource = req.source ? this.resolveSource(req.source) : undefined;
    let options = req.options ?? {};
    const source = options.source;
    if (typeof source === 'string') {
      options = { ...options, source: this.resolveSource(source) };
    }
    const sourceRef = options.sourceRef;
    if (isRecord(sourceRef) && typeof sourceRef.path === 'string') {
      options = {
        ...options,
        sourceRef: { ...sourceRef, path: this.resolveSource(sourceRef.path) },
      };
    }
    if (typeof options.sourceA === 'string') {
      options = { ...options, sourceA: this.resolveSource(options.sourceA) };
    }
    if (typeof options.sourceB === 'string') {
      options = { ...options, sourceB: this.resolveSource(options.sourceB) };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/v1/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group: req.group,
          action: req.action,
          id: req.id ?? '',
          source: resolvedSource,
          sessionId: req.sessionId,
          streamId: req.streamId,
          options,
          body: req.body ?? null,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Engine HTTP ${response.status}: ${response.statusText}`);
      }
      return (await response.json()) as ActionResponse;
    } catch (error) {
      logger.warn(`dispatch ${req.group}/${req.action} failed`, {
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async probe(group: 'videos' | 'audios', source: string): Promise<ProbeResult> {
    const resolvedSource = this.resolveExecutionSource(source, `${group}:probe`);
    const response = await this.dispatch({
      group,
      action: 'probe',
      options: { source: resolvedSource },
    });
    this.assertOk(response, `${group}:probe`);

    const raw = response.data as RawProbeData;
    const video = raw.videoStreams?.[0];
    const audio = raw.audioStreams?.[0];
    return {
      duration: raw.duration ?? 0,
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      fps: video?.fps ?? 0,
      codec: video?.codec ?? '',
      format: raw.format ?? '',
      bitrate: video?.bitrate,
      hasAudio: (raw.audioStreams?.length ?? 0) > 0,
      audioCodec: audio?.codec,
      audioSampleRate: audio?.sampleRate,
      audioChannels: audio?.channels,
      audioBitrate: audio?.bitrate,
    };
  }

  async waveform(source: string, options?: { peaksPerSecond?: number }): Promise<WaveformResult> {
    const response = await this.dispatch({
      group: 'audios',
      action: 'waveform',
      options: {
        source: this.resolveExecutionSource(source, 'audios:waveform'),
        ...options,
      },
    });
    this.assertOk(response, 'audios:waveform');
    const data = response.data as Record<string, unknown>;
    const waveform = data.waveform as RawWaveformData | undefined;
    if (!waveform) {
      throw new Error('audios:waveform returned no waveform data');
    }
    return {
      peaks: downmixPeaks(waveform.peaks),
      channelPeaks: waveform.peaks,
      sampleRate: waveform.sampleRate,
      channels: waveform.channels,
      duration: waveform.duration,
      peaksPerSecond: waveform.peaksPerSecond,
    };
  }

  async extractAudioSegment(
    source: string,
    start: number,
    duration: number,
    options?: { format?: string; sampleRate?: number; channels?: number },
  ): Promise<ArrayBuffer | null> {
    const response = await this.dispatch({
      group: 'audios',
      action: 'segment',
      options: {
        source: this.resolveExecutionSource(source, 'audios:segment'),
        start,
        duration,
        format: options?.format ?? 'wav',
        ...(options?.sampleRate !== undefined && { sampleRate: options.sampleRate }),
        ...(options?.channels !== undefined && { channels: options.channels }),
      },
    });
    if (response.status === 'error') return null;
    const data = response.data as
      { data?: string; base64?: string; dataBase64?: string } | undefined;
    const encoded = data?.data ?? data?.base64 ?? data?.dataBase64;
    return encoded ? base64ToArrayBuffer(encoded) : null;
  }

  async diff<T = DiffResult>(
    group: 'videos' | 'audios' | 'images' | 'timelines',
    sourceA: string,
    sourceB: string,
    options?: Record<string, unknown>,
  ): Promise<T | null> {
    const response = await this.dispatch({
      group,
      action: 'diff',
      options: { sourceA, sourceB, ...options },
    });
    if (response.status === 'error') return null;
    const data = response.data as Record<string, unknown> | undefined;
    return data ? (transformDiffResponse(data) as unknown as T) : null;
  }

  async extractFrame(
    source: string | FileSourceRef,
    time: number,
    options?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null> {
    return this.captureEncodedImage('videos', source, {
      time,
      quality: options?.quality ?? 85,
      format: options?.format ?? 'jpeg',
      ...(options?.width !== undefined && { width: options.width }),
      ...(options?.height !== undefined && { height: options.height }),
    });
  }

  async captureImage(
    source: string | FileSourceRef,
    options?: { quality?: number; format?: string; width?: number; height?: number },
  ): Promise<ArrayBuffer | null> {
    return this.captureEncodedImage('images', source, {
      quality: options?.quality ?? 85,
      format: options?.format ?? 'jpeg',
      ...(options?.width !== undefined && { width: options.width }),
      ...(options?.height !== undefined && { height: options.height }),
    });
  }

  async getKeyframes(source: string): Promise<number[]> {
    const response = await this.dispatch({
      group: 'videos',
      action: 'keyframes',
      options: { source: this.resolveExecutionSource(source, 'videos:keyframes') },
    });
    if (response.status === 'error') return [];
    const data = response.data as { keyframes?: Array<{ time: number }> } | undefined;
    return (data?.keyframes ?? []).map(({ time }) => time).sort((left, right) => left - right);
  }

  async detectShots(source: string): Promise<readonly DetectedShot[]> {
    const keyframes = await this.getKeyframes(source);
    return keyframes.map((start, index) => ({
      index,
      start,
      end: keyframes[index + 1] ?? null,
      confidence: null,
    }));
  }

  async createStream(
    group: 'videos' | 'audios' | 'timelines' | 'streams',
    source: string | FileSourceRef,
    options?: Record<string, unknown>,
  ): Promise<StreamHandle> {
    const resolvedSource =
      typeof source === 'string' ? this.resolveExecutionSource(source, `${group}:stream`) : source;
    const response = await this.dispatch({
      group,
      action: 'stream',
      options: { ...sourceOptions(resolvedSource), ...options },
    });
    this.assertOk(response, `${group}:stream`);
    const data = response.data as Record<string, unknown> | undefined;
    const streamId = readString(data, 'videoStreamId', 'streamId', 'stream_id');
    if (!streamId) throw new Error(`${group}:stream returned no streamId`);
    const audioStreamId = readString(data, 'audioStreamId');
    return {
      streamId,
      wsUrl: this.getStreamWsUrl(streamId),
      sessionId: readString(data, 'sessionId'),
      resolution: data?.resolution as Resolution | undefined,
      fps: typeof data?.fps === 'number' ? data.fps : undefined,
      audioStreamId,
      audioWsUrl: audioStreamId ? this.getStreamWsUrl(audioStreamId) : undefined,
    };
  }

  async controlStream(
    group: 'videos' | 'audios' | 'timelines' | 'streams',
    streamId: string,
    action: string,
    options?: Record<string, unknown>,
  ): Promise<ActionResponse> {
    return this.dispatch({ group, action, options: { streamId, ...options } });
  }

  async analyzeLoudness(source: string, targetLufs = -14): Promise<LoudnessAnalysis> {
    const response = await this.dispatch({
      group: 'audios',
      action: 'analyze_loudness',
      options: {
        source: this.resolveExecutionSource(source, 'audios:analyze_loudness'),
        targetLufs,
      },
    });
    this.assertOk(response, 'audios:analyze_loudness');
    return response.data as LoudnessAnalysis;
  }

  async detectSilence(
    source: string,
    thresholdDbfs = -40,
    minDuration = 0.5,
  ): Promise<SilenceAnalysis> {
    const response = await this.dispatch({
      group: 'audios',
      action: 'detect_silence',
      options: {
        source: this.resolveExecutionSource(source, 'audios:detect_silence'),
        thresholdDbfs,
        minDuration,
      },
    });
    this.assertOk(response, 'audios:detect_silence');
    return response.data as SilenceAnalysis;
  }

  async listEffects(): Promise<EffectPresetInfo[]> {
    const response = await this.dispatch({ group: 'effects', action: 'list', options: {} });
    this.assertOk(response, 'effects:list');
    return (response.data as EffectPresetInfo[] | undefined) ?? [];
  }

  async listEffectCapabilities(): Promise<EffectCapability[]> {
    const response = await this.dispatch({
      group: 'effects',
      action: 'list-capabilities',
      options: {},
    });
    this.assertOk(response, 'effects:list-capabilities');
    return (response.data as EffectCapability[] | undefined) ?? [];
  }

  async getEffectInfo(shaderId: string): Promise<EffectPresetInfo> {
    const response = await this.dispatch({
      group: 'effects',
      action: 'info',
      options: { shaderId },
    });
    this.assertOk(response, 'effects:info');
    return response.data as EffectPresetInfo;
  }

  async applyEffect(
    data: string,
    width: number,
    height: number,
    shaderId: string,
    params?: Record<string, unknown>,
  ): Promise<EffectApplyResult> {
    const response = await this.dispatch({
      group: 'effects',
      action: 'apply',
      options: { data, width, height, shaderId, params: params ?? {} },
    });
    this.assertOk(response, 'effects:apply');
    return response.data as EffectApplyResult;
  }

  async registerShader(id: string, code: string, params?: ShaderParamDef[]): Promise<void> {
    const response = await this.dispatch({
      group: 'effects',
      action: 'register',
      options: { id, code, params: params ?? [] },
    });
    this.assertOk(response, 'effects:register');
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest> {
    const response = await this.dispatch({
      group: 'previews',
      action: 'register-asset',
      options: { ...request },
    });
    this.assertOk(response, 'previews:register-asset');
    return response.data as PreviewManifest;
  }

  async requestPreviewVariant(
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<PreviewVariant> {
    const response = await this.dispatch({
      group: 'previews',
      action: 'request-variant',
      id: assetId,
      options: { ...request },
    });
    this.assertOk(response, 'previews:request-variant');
    return response.data as PreviewVariant;
  }

  async updatePreviewAssetMetadata(
    assetId: string,
    request: UpdatePreviewAssetMetadataRequest,
  ): Promise<PreviewManifest> {
    const response = await this.dispatch({
      group: 'previews',
      action: 'update-metadata',
      id: assetId,
      options: { ...request },
    });
    this.assertOk(response, 'previews:update-metadata');
    return response.data as PreviewManifest;
  }

  async unregisterPreviewAsset(assetIdOrToken: string): Promise<void> {
    await this.dispatch({
      group: 'previews',
      action: 'unregister',
      id: assetIdOrToken,
      options: {},
    }).catch(() => undefined);
  }

  getPreviewTokenUrl(token: string): string {
    return `${this.baseUrl}/v1/preview/file/${encodeURIComponent(token)}`;
  }

  getFileTokenUrl(token: string): string {
    return `${this.baseUrl}/v1/files/${encodeURIComponent(token)}`;
  }

  async registerFile(request: RegisterFileRequest | string): Promise<RegisteredFile> {
    const normalized =
      typeof request === 'string'
        ? {
            filePath: this.resolveLocalFileSource(request, 'files:register'),
            purpose: 'preview' as const,
          }
        : {
            ...request,
            filePath: this.resolveOptionalLocalSource(request.filePath, 'files:register'),
            source: this.resolveOptionalLocalSource(request.source, 'files:register'),
            path: this.resolveOptionalLocalSource(request.path, 'files:register'),
          };
    const response = await this.dispatch({
      group: 'files',
      action: 'register',
      options: normalized,
    });
    this.assertOk(response, 'files:register');
    return response.data as RegisteredFile;
  }

  async unregisterFile(token: string): Promise<void> {
    await this.dispatch({
      group: 'files',
      action: 'unregister',
      id: token,
      options: {},
    }).catch(() => undefined);
  }

  async statFile(token: string): Promise<RegisteredFile> {
    const response = await this.dispatch({
      group: 'files',
      action: 'stat',
      id: token,
      options: {},
    });
    this.assertOk(response, 'files:stat');
    return response.data as RegisteredFile;
  }

  async resolveFile(source: string): Promise<{ path: string }> {
    const response = await this.dispatch({
      group: 'files',
      action: 'resolve',
      options: { source: this.resolveLocalFileSource(source, 'files:resolve') },
    });
    this.assertOk(response, 'files:resolve');
    return response.data as { path: string };
  }

  async readFileRange(
    token: string,
    start: number,
    end: number,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      throw new Error(`Invalid engine file byte range: ${start}-${end}`);
    }
    const response = await fetch(this.getFileTokenUrl(token), {
      headers: { Range: `bytes=${start}-${end}` },
      ...(signal ? { signal } : {}),
    });
    if (response.status !== 206) {
      throw new Error(`files:readRange failed: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  async withRegisteredFile<T>(
    request: RegisterFileRequest | string,
    task: (registered: RegisteredFile) => Promise<T>,
  ): Promise<T> {
    const registered = await this.registerFile(request);
    try {
      return await task(registered);
    } finally {
      await this.unregisterFile(registered.token);
    }
  }

  private resolveSource(source: string): string {
    if (!this.pathResolver?.hasVariable(source)) return source;
    return this.pathResolver.resolve(source);
  }

  private resolveExecutionSource(source: string, label: string): string {
    const resolved = this.resolveSource(source);
    assertResolvedEngineExecutionSource(resolved, label);
    return resolved;
  }

  private resolveLocalFileSource(source: string, label: string): string {
    const resolved = this.resolveSource(source);
    assertResolvedEngineLocalFileSource(resolved, label);
    return resolved;
  }

  private resolveOptionalLocalSource(
    source: string | undefined,
    label: string,
  ): string | undefined {
    return source === undefined ? undefined : this.resolveLocalFileSource(source, label);
  }

  private async captureEncodedImage(
    group: 'videos' | 'images',
    source: string | FileSourceRef,
    options: Record<string, unknown>,
  ): Promise<ArrayBuffer | null> {
    const resolvedSource =
      typeof source === 'string' ? this.resolveExecutionSource(source, `${group}:capture`) : source;
    const response = await this.dispatch({
      group,
      action: 'capture',
      options: { ...sourceOptions(resolvedSource), ...options },
    });
    if (response.status === 'error') return null;
    const data = response.data as { data?: string; base64?: string } | undefined;
    const encoded = data?.data ?? data?.base64;
    return encoded ? base64ToArrayBuffer(encoded) : null;
  }

  private assertOk(response: ActionResponse, label: string): void {
    if (response.status === 'error') {
      throw new Error(response.error?.message ?? `${label} failed`);
    }
  }
}

function sourceOptions(source: string | FileSourceRef): Record<string, unknown> {
  return typeof source === 'string' ? { source } : { sourceRef: source };
}

function readString(
  value: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    if (typeof value?.[key] === 'string') return value[key];
  }
  return undefined;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }
  const buffer = Buffer.from(base64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function downmixPeaks(channels: number[][]): number[] {
  if (channels.length === 0) return [];
  if (channels.length === 1) return channels[0] ?? [];
  const result = new Array<number>(channels[0]?.length ?? 0);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Math.max(...channels.map((channel) => Math.abs(channel[index] ?? 0)));
  }
  return result;
}

function assertResolvedEngineExecutionSource(source: string, label: string): void {
  if (isRemoteUrl(source) || isAbsoluteLocalPath(source)) return;
  throw unresolvedPathError(source, label, 'media source');
}

function assertResolvedEngineLocalFileSource(source: string, label: string): void {
  if (isAbsoluteLocalPath(source)) return;
  if (isRemoteUrl(source)) {
    throw new Error(`${label} requires a resolved local file path, received remote URL: ${source}`);
  }
  throw unresolvedPathError(source, label, 'local file path');
}

function unresolvedPathError(source: string, label: string, kind: string): Error {
  const reason = hasPathVariableSyntax(source)
    ? 'unresolved path variables require source document context'
    : 'workspace-relative paths require source document context';
  return new Error(`${label} requires host-resolved ${kind}; ${reason}: ${source}`);
}

function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function isAbsoluteLocalPath(source: string): boolean {
  return source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source) || source.startsWith('\\\\');
}

function hasPathVariableSyntax(source: string): boolean {
  return /^\/?\$\{[^}]+\}/.test(source);
}
