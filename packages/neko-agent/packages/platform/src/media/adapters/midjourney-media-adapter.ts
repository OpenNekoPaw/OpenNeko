/**
 * Midjourney Media Adapter
 *
 * Adapter for Midjourney image generation (via proxy API)
 * Note: Midjourney doesn't have official API, this uses common proxy patterns
 */

import type { Model, Provider } from '../../types/provider';
import type {
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaAdapterResult,
  MediaGenerationType,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * Midjourney API response types (common proxy pattern)
 */
interface MidjourneySubmitResponse {
  task_id: string;
  status?: string;
}

interface MidjourneyTaskResponse {
  task_id: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress?: number;
  image_url?: string;
  images?: string[];
  error?: string;
  prompt?: string;
}

/**
 * Midjourney media adapter for image generation
 */
export class MidjourneyMediaAdapter extends BaseMediaAdapter {
  readonly type = 'midjourney';

  override getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-image', 'image-to-image'];
  }

  override async generateImage(
    request: ImageGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const baseUrl = provider.apiUrl || 'https://api.midjourney-proxy.com';

    // Build prompt with aspect ratio and style
    let fullPrompt = request.prompt;
    if (request.aspectRatio) {
      fullPrompt += ` --ar ${request.aspectRatio}`;
    }
    if (request.style) {
      fullPrompt += ` --style ${request.style}`;
    }
    if (request.quality === 'hd') {
      fullPrompt += ' --q 2';
    }

    // Determine endpoint based on whether reference image is provided
    const endpoint = request.referenceImageUrl
      ? `${baseUrl}/mj/submit/blend`
      : `${baseUrl}/mj/submit/imagine`;

    const body: Record<string, unknown> = {
      prompt: fullPrompt,
    };

    // Add image reference for image-to-image (blend)
    if (request.referenceImageUrl) {
      body.base64Array = [request.referenceImageUrl];
    }

    // Add model version (niji for anime style)
    if (model.name?.includes('niji')) {
      body.botType = 'NIJI_JOURNEY';
    }

    const result = await this.request<MidjourneySubmitResponse>(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      provider,
    );

    if (result.error) {
      return { status: 'failed', error: result.error };
    }

    return {
      externalTaskId: result.data?.task_id,
      status: 'pending',
    };
  }

  override async generateVideo(
    _request: VideoGenerationRequest,
    _model: Model,
    _provider: Provider,
  ): Promise<MediaAdapterResult> {
    return {
      status: 'failed',
      error: {
        code: 'NOT_SUPPORTED',
        message: 'Midjourney does not support video generation',
        retryable: false,
      },
    };
  }

  override async generateAudio(
    _request: AudioGenerationRequest,
    _model: Model,
    _provider: Provider,
  ): Promise<MediaAdapterResult> {
    return {
      status: 'failed',
      error: {
        code: 'NOT_SUPPORTED',
        message: 'Midjourney does not support audio generation',
        retryable: false,
      },
    };
  }

  override async getTaskStatus(
    externalTaskId: string,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const baseUrl = provider.apiUrl || 'https://api.midjourney-proxy.com';
    const endpoint = `${baseUrl}/mj/task/${externalTaskId}/fetch`;

    const result = await this.request<MidjourneyTaskResponse>(
      endpoint,
      { method: 'GET' },
      provider,
    );

    if (result.error) {
      return { status: 'failed', error: result.error };
    }

    const response = result.data!;

    switch (response.status) {
      case 'success':
        const images = response.images || (response.image_url ? [response.image_url] : []);
        return {
          externalTaskId,
          status: 'completed',
          progress: 100,
          outputs: images.map((url) => ({
            type: 'image' as const,
            url,
          })),
        };

      case 'failed':
        return {
          externalTaskId,
          status: 'failed',
          error: {
            code: 'GENERATION_FAILED',
            message: response.error || 'Image generation failed',
            retryable: false,
          },
        };

      case 'running':
        return {
          externalTaskId,
          status: 'processing',
          progress: response.progress || 50,
        };

      case 'pending':
      default:
        return {
          externalTaskId,
          status: 'pending',
          progress: response.progress || 0,
        };
    }
  }

  override async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    const baseUrl = provider.apiUrl || 'https://api.midjourney-proxy.com';
    const endpoint = `${baseUrl}/mj/task/${externalTaskId}/cancel`;

    await this.request(endpoint, { method: 'POST' }, provider);
  }
}
