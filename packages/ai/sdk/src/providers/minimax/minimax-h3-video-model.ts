import type {
  Experimental_VideoModelV4 as VideoModelV4,
  Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  Experimental_VideoModelV4File as VideoModelV4File,
  Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  JSONValue,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';
import { createVideoTaskOperation, decodeVideoTaskOperation } from '../../video-task-operation';

type H3Content =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: { url: string };
      role: 'first_frame' | 'last_frame' | 'reference_image';
    }
  | {
      type: 'video_url';
      video_url: { url: string };
      role: 'reference_video';
    }
  | {
      type: 'audio_url';
      audio_url: { url: string };
      role: 'reference_audio';
    };

interface H3TaskResponse {
  task?: {
    id?: string;
    model?: string;
    status?: string;
    content?: { url?: string };
  };
  type?: string;
  error?: { message?: string; type?: string };
  request_id?: string;
}

export class MiniMaxH3VideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'minimax';
  readonly maxVideosPerCall = 1;

  constructor(
    readonly modelId: string,
    private readonly config: ProviderConfig,
  ) {
    if (modelId !== 'MiniMax-H3') {
      throw new Error(`MiniMax H3 provider does not support model ${modelId}.`);
    }
  }

  async doStart(options: VideoModelV4CallOptions): Promise<VideoModelV4OperationStartResult> {
    const prompt = options.prompt?.trim();
    if (!prompt) throw new Error('MiniMax H3 requires a non-empty prompt.');
    const duration = options.duration;
    if (!Number.isInteger(duration) || duration === undefined || duration < 4 || duration > 15) {
      throw new Error('MiniMax H3 duration must be an integer from 4 through 15 seconds.');
    }
    if (options.n !== 1) throw new Error('MiniMax H3 supports exactly one video per task.');
    if (options.fps !== undefined) throw new Error('MiniMax H3 does not accept an fps option.');
    if (options.seed !== undefined) throw new Error('MiniMax H3 does not accept a seed option.');
    if (options.generateAudio !== undefined) {
      throw new Error('MiniMax H3 does not accept a generateAudio option.');
    }

    const minimaxOptions = readMiniMaxOptions(options.providerOptions['minimax']);
    const resolution = minimaxOptions.resolution;
    if (resolution !== '768P' && resolution !== '2K') {
      throw new Error('MiniMax H3 resolution must be provided as 768P or 2K.');
    }

    const frameImages = [...(options.frameImages ?? [])];
    if (options.image && !frameImages.some((entry) => entry.frameType === 'first_frame')) {
      // AI SDK projects the resolved first frame through both fields; frameImages is authoritative.
      frameImages.push({ frameType: 'first_frame', image: options.image });
    }
    const firstFrames = frameImages.filter((entry) => entry.frameType === 'first_frame');
    const lastFrames = frameImages.filter((entry) => entry.frameType === 'last_frame');
    if (firstFrames.length > 1 || lastFrames.length > 1) {
      throw new Error('MiniMax H3 accepts at most one first frame and one last frame.');
    }
    if (frameImages.length > 0 && options.inputReferences?.length) {
      throw new Error(
        'MiniMax H3 frame generation and reference generation inputs are mutually exclusive.',
      );
    }
    for (const frame of frameImages) assertH3MediaType(frame.image, 'image');

    const referenceContent = (options.inputReferences ?? []).map(referenceToContent);
    assertH3ReferenceCounts(referenceContent);

    const content: H3Content[] = [{ type: 'text', text: prompt }];
    for (const frame of frameImages) {
      content.push({
        type: 'image_url',
        image_url: { url: fileToUrl(frame.image) },
        role: frame.frameType,
      });
    }
    content.push(...referenceContent);

    const hasFrames = frameImages.length > 0;
    const hasReferences = (options.inputReferences?.length ?? 0) > 0;
    const ratio = hasFrames
      ? 'adaptive'
      : (options.aspectRatio ?? (hasReferences ? 'adaptive' : undefined));
    if (ratio === undefined || (!hasFrames && !hasReferences && ratio === 'adaptive')) {
      throw new Error('MiniMax H3 text-to-video requires a concrete aspect ratio.');
    }

    const response = await fetch(`${this.getBaseUrl()}/v2/video_generation`, {
      method: 'POST',
      headers: buildHeaders(this.config.apiKey, options.headers, true),
      signal: options.abortSignal,
      body: JSON.stringify({
        model: this.modelId,
        content,
        resolution,
        duration,
        ratio,
        ...(minimaxOptions.aigcWatermark === undefined
          ? {}
          : { aigc_watermark: minimaxOptions.aigcWatermark }),
      }),
    });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const body = await parseJson<Record<string, unknown>>(response, 'MiniMax H3 task creation');
    const taskId = body['task_id'];
    if (typeof taskId !== 'string' || taskId.trim().length === 0) {
      throw new Error('MiniMax H3 task creation returned no task_id.');
    }
    return {
      operation: createVideoTaskOperation(taskId),
      warnings: [],
      response: { timestamp: new Date(), modelId: this.modelId, headers: responseHeaders },
    };
  }

  async doStatus(options: {
    operation: JSONValue;
    abortSignal?: AbortSignal;
    headers?: Record<string, string | undefined>;
  }): Promise<VideoModelV4OperationStatusResult> {
    const { taskId } = decodeVideoTaskOperation(options.operation);
    const response = await fetch(
      `${this.getBaseUrl()}/v2/query/video_generation/${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: buildHeaders(this.config.apiKey, options.headers),
        signal: options.abortSignal,
      },
    );
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const body = await parseJson<H3TaskResponse>(response, 'MiniMax H3 task status');
    const metadata = { timestamp: new Date(), modelId: this.modelId, headers: responseHeaders };
    if (body.task?.model !== undefined && body.task.model !== this.modelId) {
      return {
        status: 'error',
        error: `MiniMax task ${taskId} belongs to model ${body.task.model}, not ${this.modelId}.`,
        response: metadata,
      };
    }
    switch (body.task?.status?.toLowerCase()) {
      case 'queued':
      case 'running':
        return { status: 'pending', response: metadata };
      case 'succeeded': {
        const url = body.task.content?.url;
        if (!url) {
          return {
            status: 'error',
            error: `MiniMax H3 task ${taskId} succeeded without a video URL.`,
            response: metadata,
          };
        }
        return {
          status: 'completed',
          videos: [{ type: 'url', url, mediaType: 'video/mp4' }],
          warnings: [],
          response: metadata,
        };
      }
      case 'failed':
      case 'cancelled':
        return {
          status: 'error',
          error: `MiniMax H3 task ${taskId} ended with status ${body.task?.status}.`,
          response: metadata,
        };
      default:
        return {
          status: 'error',
          error: `MiniMax H3 task ${taskId} returned unknown status ${String(body.task?.status)}.`,
          response: metadata,
        };
    }
  }

  async cancelTask(externalTaskId: string): Promise<void> {
    const response = await fetch(
      `${this.getBaseUrl()}/v2/video_generation/${encodeURIComponent(externalTaskId)}`,
      {
        method: 'DELETE',
        headers: buildHeaders(this.config.apiKey),
      },
    );
    await parseJson<Record<string, unknown>>(response, 'MiniMax H3 task cancellation');
  }

  private getBaseUrl(): string {
    return this.config.apiUrl.replace(/\/+$/u, '').replace(/\/v[12]$/u, '');
  }
}

function assertH3ReferenceCounts(content: readonly H3Content[]): void {
  const imageCount = content.filter((entry) => entry.type === 'image_url').length;
  const videoCount = content.filter((entry) => entry.type === 'video_url').length;
  const audioCount = content.filter((entry) => entry.type === 'audio_url').length;
  if (imageCount > 9) throw new Error('MiniMax H3 accepts at most 9 reference images.');
  if (videoCount > 3) throw new Error('MiniMax H3 accepts at most 3 reference videos.');
  if (audioCount > 3) throw new Error('MiniMax H3 accepts at most 3 reference audio files.');
}

function referenceToContent(file: VideoModelV4File): H3Content {
  const mediaType = file.mediaType?.toLowerCase();
  const url = fileToUrl(file);
  if (mediaType?.startsWith('image/')) {
    assertH3MediaType(file, 'image');
    return { type: 'image_url', image_url: { url }, role: 'reference_image' };
  }
  if (mediaType?.startsWith('video/')) {
    assertH3MediaType(file, 'video');
    return { type: 'video_url', video_url: { url }, role: 'reference_video' };
  }
  if (mediaType?.startsWith('audio/')) {
    assertH3MediaType(file, 'audio');
    return { type: 'audio_url', audio_url: { url }, role: 'reference_audio' };
  }
  throw new Error(`MiniMax H3 reference input requires an image, video, or audio media type.`);
}

const H3_MEDIA_TYPES = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  video: new Set(['video/mp4', 'video/quicktime']),
  audio: new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav']),
} as const;

function assertH3MediaType(file: VideoModelV4File, kind: keyof typeof H3_MEDIA_TYPES): void {
  const mediaType = file.mediaType?.toLowerCase();
  if (mediaType === undefined || !H3_MEDIA_TYPES[kind].has(mediaType)) {
    throw new Error(
      `MiniMax H3 ${kind} input media type ${String(file.mediaType)} is not supported.`,
    );
  }
}

function fileToUrl(file: VideoModelV4File): string {
  if (file.type === 'url') return file.url;
  const base64 =
    typeof file.data === 'string' ? file.data : Buffer.from(file.data).toString('base64');
  return `data:${file.mediaType};base64,${base64}`;
}

function readMiniMaxOptions(value: unknown): {
  resolution?: unknown;
  aigcWatermark?: boolean;
} {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('MiniMax H3 provider options must be an object.');
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'resolution' && key !== 'aigcWatermark') {
      throw new Error(`MiniMax H3 does not support provider option ${key}.`);
    }
  }
  if (record['aigcWatermark'] !== undefined && typeof record['aigcWatermark'] !== 'boolean') {
    throw new Error('MiniMax H3 aigcWatermark must be a boolean.');
  }
  return {
    resolution: record['resolution'],
    aigcWatermark: record['aigcWatermark'] as boolean | undefined,
  };
}

function buildHeaders(
  apiKey: string,
  extra?: Record<string, string | undefined>,
  json = false,
): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (json) headers['Content-Type'] = 'application/json';
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value !== undefined) headers[key] = value;
  }
  return headers;
}

async function parseJson<T>(response: Response, operation: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${operation} failed (${response.status}): ${text}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${operation} returned invalid JSON.`);
  }
}
