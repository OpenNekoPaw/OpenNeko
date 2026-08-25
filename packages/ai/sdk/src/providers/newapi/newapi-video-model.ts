/**
 * NewAPI Video Model - AI SDK VideoModelV4 start/status implementation.
 *
 * The provider task is returned by doStart before any status request.
 * GenerationJob owns persistence, polling, recovery, and cancellation.
 */

import type {
  Experimental_VideoModelV4 as VideoModelV4,
  Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  Experimental_VideoModelV4File as VideoModelV4File,
  JSONValue,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';
import { createVideoTaskOperation, decodeVideoTaskOperation } from '../../video-task-operation';
import { copyBytesToArrayBuffer } from './newapi-binary';

interface SoraCreateResponse {
  id?: string;
  error?: { message?: string; code?: string };
}

interface SoraStatusResponse {
  id?: string;
  status?: string;
  error?: { message?: string; code?: string };
}

export class NewAPIVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'newapi';
  readonly modelId: string;
  readonly maxVideosPerCall = 1;

  constructor(
    modelId: string,
    private readonly config: ProviderConfig,
  ) {
    this.modelId = modelId;
  }

  async doStart(options: VideoModelV4CallOptions): Promise<VideoModelV4OperationStartResult> {
    if (options.prompt === undefined || options.prompt.trim().length === 0) {
      throw new Error('NewAPI video generation requires a non-empty prompt.');
    }
    if (options.inputReferences?.length) {
      throw new Error('NewAPI Sora video generation does not support reference media inputs.');
    }
    if (options.generateAudio !== undefined) {
      throw new Error('NewAPI Sora video generation does not support generateAudio.');
    }

    const frameImages = options.frameImages ?? [];
    if (frameImages.some((frame) => frame.frameType === 'last_frame')) {
      throw new Error('NewAPI Sora video generation does not support a last-frame image.');
    }
    const firstFrames = frameImages.filter((frame) => frame.frameType === 'first_frame');
    if (firstFrames.length > 1) {
      throw new Error('NewAPI Sora video generation accepts at most one first-frame image.');
    }
    if (options.image && firstFrames.length > 0) {
      throw new Error('NewAPI Sora video generation received duplicate first-frame inputs.');
    }

    const formData = new FormData();
    formData.append('model', this.modelId);
    formData.append('prompt', options.prompt);
    if (options.duration !== undefined) formData.append('seconds', String(options.duration));
    if (options.resolution !== undefined) formData.append('size', options.resolution);
    const input = firstFrames[0]?.image ?? options.image;
    if (input) appendInputReference(formData, input);

    const response = await fetch(`${this.getBaseUrl()}/v1/videos`, {
      method: 'POST',
      headers: buildHeaders(this.config.apiKey, options.headers),
      body: formData,
      signal: options.abortSignal,
    });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const body = await parseJson<SoraCreateResponse>(response, 'NewAPI video generation');
    if (body.error?.message) {
      throw new Error(`NewAPI video generation failed: ${body.error.message}`);
    }
    if (typeof body.id !== 'string' || body.id.trim().length === 0) {
      throw new Error('NewAPI video generation returned no task id.');
    }

    return {
      operation: createVideoTaskOperation(body.id),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(options: {
    operation: JSONValue;
    abortSignal?: AbortSignal;
    headers?: Record<string, string | undefined>;
  }): Promise<VideoModelV4OperationStatusResult> {
    const { taskId } = decodeVideoTaskOperation(options.operation);
    const response = await fetch(`${this.getBaseUrl()}/v1/videos/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: buildHeaders(this.config.apiKey, options.headers),
      signal: options.abortSignal,
    });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const body = await parseJson<SoraStatusResponse>(response, 'NewAPI video status');
    const responseMetadata = {
      timestamp: new Date(),
      modelId: this.modelId,
      headers: responseHeaders,
    };
    if (body.error?.message) {
      return { status: 'error', error: body.error.message, response: responseMetadata };
    }

    switch (body.status?.toLowerCase()) {
      case 'queued':
      case 'pending':
      case 'processing':
      case 'in_progress':
        return { status: 'pending', response: responseMetadata };
      case 'succeeded':
      case 'completed':
        return {
          status: 'completed',
          videos: [
            {
              type: 'url',
              url: `${this.getBaseUrl()}/v1/videos/${encodeURIComponent(taskId)}/content`,
              mediaType: 'video/mp4',
            },
          ],
          warnings: [],
          response: responseMetadata,
        };
      case 'failed':
      case 'cancelled':
        return {
          status: 'error',
          error: `NewAPI video task ${taskId} ended with status ${body.status}.`,
          response: responseMetadata,
        };
      default:
        return {
          status: 'error',
          error: `NewAPI video task ${taskId} returned unknown status ${String(body.status)}.`,
          response: responseMetadata,
        };
    }
  }

  private getBaseUrl(): string {
    return this.config.apiUrl.replace(/\/+$/u, '').replace(/\/v1$/u, '');
  }
}

function appendInputReference(formData: FormData, input: VideoModelV4File): void {
  if (input.type === 'url') {
    formData.append('input_reference', input.url);
    return;
  }
  const bytes = typeof input.data === 'string' ? Buffer.from(input.data, 'base64') : input.data;
  const blob = new Blob([copyBytesToArrayBuffer(bytes)], {
    type: input.mediaType || 'image/png',
  });
  formData.append('input_reference', blob, 'input-reference');
}

function buildHeaders(
  apiKey: string,
  extra?: Record<string, string | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value !== undefined) headers[key] = value;
  }
  return headers;
}

async function parseJson<T>(response: Response, operation: string): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${operation} failed (${response.status}): ${body}`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${operation} returned invalid JSON.`);
  }
}
