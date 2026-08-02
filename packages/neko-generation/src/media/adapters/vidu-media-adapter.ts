/**
 * Vidu Media Adapter
 *
 * Adapter for Vidu video generation platform
 * API docs: https://docs.vidu.com
 */

import type { MediaModel as Model, MediaProvider as Provider } from '../types';
import type {
  MediaAdapterResult,
  MediaGenerationType,
  MaterializedVideoGenerationRequest,
} from '@neko/generation';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * Vidu API response types
 */
interface ViduCreateResponse {
  task_id: string;
  state?: string;
}

interface ViduTaskResponse {
  task_id: string;
  state: 'pending' | 'processing' | 'success' | 'failed';
  video_url?: string;
  cover_url?: string;
  error?: string;
  progress?: number;
}

/**
 * Vidu media adapter for video generation
 */
export class ViduMediaAdapter extends BaseMediaAdapter {
  readonly type = 'vidu';

  override getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-video', 'image-to-video'];
  }

  async generateVideo(
    request: MaterializedVideoGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const baseUrl = provider.apiUrl || 'https://api.vidu.com/v1';

    // Determine endpoint based on whether reference image is provided
    const endpoint = request.referenceImageUrl
      ? `${baseUrl}/tasks/img2video`
      : `${baseUrl}/tasks/text2video`;

    const body: Record<string, unknown> = {
      model: model.name || 'vidu-1.5',
      prompt: request.prompt,
    };

    // Add image reference for image-to-video
    if (request.referenceImageUrl) {
      body.image_url = request.referenceImageUrl;
    }

    // Add optional parameters
    if (request.duration) {
      body.duration = request.duration;
    }
    if (request.aspectRatio) {
      body.aspect_ratio = request.aspectRatio;
    }

    const result = await this.request<ViduCreateResponse>(
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

  async getTaskStatus(externalTaskId: string, provider: Provider): Promise<MediaAdapterResult> {
    const baseUrl = provider.apiUrl || 'https://api.vidu.com/v1';
    const endpoint = `${baseUrl}/tasks/${externalTaskId}`;

    const result = await this.request<ViduTaskResponse>(endpoint, { method: 'GET' }, provider);

    if (result.error) {
      return { status: 'failed', error: result.error };
    }

    const response = result.data!;

    switch (response.state) {
      case 'success':
        return {
          externalTaskId,
          status: 'completed',
          progress: 100,
          outputs: response.video_url
            ? [
                {
                  type: 'video',
                  url: response.video_url,
                  thumbnailUrl: response.cover_url,
                },
              ]
            : [],
        };

      case 'failed':
        return {
          externalTaskId,
          status: 'failed',
          error: {
            code: 'GENERATION_FAILED',
            message: response.error || 'Video generation failed',
            retryable: false,
          },
        };

      case 'processing':
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

  async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    const baseUrl = provider.apiUrl || 'https://api.vidu.com/v1';
    const endpoint = `${baseUrl}/tasks/${externalTaskId}/cancel`;

    await this.requestSimple<unknown>(endpoint, 'POST', provider);
  }
}
