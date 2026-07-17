/**
 * NewAPI Video Model - VideoModelV3 implementation using OpenAI Sora format
 *
 * Uses the official Sora-compatible endpoint:
 * - POST /v1/videos (multipart/form-data)
 * - GET /v1/videos/{video_id} (status polling)
 * - GET /v1/videos/{video_id}/content (video download)
 *
 * Parameters:
 * - model: string (e.g., "sora-2")
 * - prompt: string
 * - seconds: string (duration, e.g., "8")
 * - input_reference: binary (image file for i2v)
 *
 * Reference: https://doc.newapi.pro/en/api/openai-video/
 */

import type {
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
  Experimental_VideoModelV3VideoData as VideoModelV3VideoData,
  SharedV3Warning,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';
import { pollUntilDone, POLLING_PRESETS } from '../../polling';

/** POST /v1/videos response */
interface SoraCreateResponse {
  id: string;
  object?: string;
  model?: string;
  status: string;
  progress?: number;
  created_at?: number;
  seconds?: string;
  size?: string;
  error?: { message: string; code?: string };
}

/** GET /v1/videos/{id} response */
interface SoraStatusResponse {
  id: string;
  status: string;
  progress?: number;
  seconds?: string;
  size?: string;
  quality?: string;
  completed_at?: number;
  expires_at?: number;
  error?: { message: string; code?: string };
}

export class NewAPIVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'newapi';
  readonly modelId: string;
  readonly maxVideosPerCall = 1;

  private config: ProviderConfig;

  constructor(modelId: string, config: ProviderConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate(options: VideoModelV3CallOptions): Promise<{
    videos: Array<VideoModelV3VideoData>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: SharedV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
  }> {
    const baseUrl = this.getBaseUrl();
    const submitUrl = `${baseUrl}/v1/videos`;

    // Build multipart/form-data body
    const formData = new FormData();
    formData.append('model', this.modelId);
    if (options.prompt === undefined) {
      throw new Error('NewAPI video generation requires a prompt.');
    }
    formData.append('prompt', options.prompt);

    // Duration: AI SDK passes as number, Sora format expects "seconds" as string
    if (options.duration !== undefined) {
      formData.append('seconds', String(options.duration));
    }

    // Image-to-video: Sora format uses "input_reference" file field
    if (options.image) {
      if (options.image.type === 'file') {
        const data = options.image.data;
        const blob =
          typeof data === 'string'
            ? new Blob([Buffer.from(data, 'base64')], {
                type: options.image.mediaType ?? 'image/png',
              })
            : new Blob([data], { type: options.image.mediaType ?? 'image/png' });
        formData.append('input_reference', blob, 'input.png');
      } else if (options.image.type === 'url') {
        // For URL references, download and attach as file
        // Some APIs accept URL directly — try appending as string first
        formData.append('input_reference', options.image.url);
      }
    }

    // Submit generation request
    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        // Do NOT set Content-Type — fetch auto-sets multipart boundary
        ...(options.headers as Record<string, string>),
      },
      body: formData,
      signal: options.abortSignal,
    });

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.text();
      throw new Error(`NewAPI video generation failed (${submitResponse.status}): ${errorBody}`);
    }

    const createData = (await submitResponse.json()) as SoraCreateResponse;

    if (createData.error) {
      throw new Error(`Video generation failed: ${createData.error.message}`);
    }

    if (!createData.id) {
      throw new Error('NewAPI video generation: no video id returned');
    }

    await this.config.onExternalTaskId?.(createData.id);

    // Poll for completion
    const videoData = await this.pollForCompletion(createData.id, baseUrl, options.abortSignal);

    return {
      videos: [videoData],
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  /**
   * Poll GET /v1/videos/{videoId} until completion, then return video data.
   * On success, downloads via /v1/videos/{videoId}/content.
   */
  private async pollForCompletion(
    videoId: string,
    baseUrl: string,
    abortSignal?: AbortSignal,
  ): Promise<VideoModelV3VideoData> {
    const statusUrl = `${baseUrl}/v1/videos/${videoId}`;
    const downloadUrl = `${baseUrl}/v1/videos/${videoId}/content`;
    const apiKey = this.config.apiKey;

    return pollUntilDone<VideoModelV3VideoData>(
      async () => {
        const response = await fetch(statusUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: abortSignal,
        });

        if (!response.ok) return undefined; // Transient error, continue

        const data = (await response.json()) as SoraStatusResponse;

        if (data.error) {
          throw new Error(`Video generation failed: ${data.error.message}`);
        }

        const status = data.status?.toLowerCase();

        if (status === 'succeeded' || status === 'completed') {
          // Download the video file
          const videoResponse = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: abortSignal,
          });

          if (!videoResponse.ok) {
            return { type: 'url' as const, url: downloadUrl, mediaType: 'video/mp4' };
          }

          const videoBuffer = await videoResponse.arrayBuffer();
          return {
            type: 'binary' as const,
            data: new Uint8Array(videoBuffer),
            mediaType: 'video/mp4',
          };
        }

        if (status === 'failed') {
          throw new Error('Video generation failed');
        }

        return undefined; // Continue polling
      },
      POLLING_PRESETS.video,
      abortSignal,
    );
  }

  private getBaseUrl(): string {
    let base = this.config.apiUrl.replace(/\/+$/, '');
    base = base.replace(/\/v1$/, '');
    return base;
  }
}
