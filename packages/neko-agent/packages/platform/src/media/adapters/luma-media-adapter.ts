/**
 * Luma AI Media Adapter
 *
 * Supports Luma Dream Machine video generation API
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaAdapterResult,
  MediaTaskStatus,
  VideoGenerationRequest,
  MediaOutput,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * Luma API response types
 */
interface LumaGenerationResponse {
  id: string;
  state: 'queued' | 'dreaming' | 'completed' | 'failed';
  failure_reason?: string;
  created_at: string;
  assets?: {
    video?: string;
    thumbnail?: string;
  };
  version?: string;
  request?: {
    prompt: string;
    aspect_ratio?: string;
    loop?: boolean;
  };
}

/**
 * Luma AI media adapter
 */
export class LumaMediaAdapter extends BaseMediaAdapter {
  readonly type = 'luma';

  private static readonly STATUS_MAP: Record<string, MediaTaskStatus> = {
    queued: 'pending',
    dreaming: 'processing',
    completed: 'completed',
    failed: 'failed',
  };

  private static readonly PROGRESS_MAP: Record<string, number> = {
    queued: 0,
    dreaming: 50,
    completed: 100,
    failed: 0,
  };

  override getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-video', 'image-to-video'];
  }

  /**
   * Generate video using Luma API
   */
  override async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/dream-machine/v1/generations`;

    const body: Record<string, unknown> = {
      prompt: request.prompt,
    };

    if (request.aspectRatio) {
      body.aspect_ratio = request.aspectRatio.replace(':', ':');
    }

    if (request.referenceImageUrl) {
      body.keyframes = {
        frame0: {
          type: 'image',
          url: request.referenceImageUrl,
        },
      };
    }

    // Luma specific options from model
    if (model.options?.loop) {
      body.loop = true;
    }

    const { data, error } = await this.request<LumaGenerationResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    return {
      externalTaskId: data?.id,
      status: this.mapStatusFrom(data?.state, LumaMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(data?.state, LumaMediaAdapter.PROGRESS_MAP),
    };
  }

  /**
   * Get task status
   */
  override async getTaskStatus(
    externalTaskId: string,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/dream-machine/v1/generations/${externalTaskId}`;

    const { data, error } = await this.request<LumaGenerationResponse>(
      url,
      { method: 'GET' },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.failure_reason) {
      return {
        status: 'failed',
        error: {
          code: 'GENERATION_FAILED',
          message: data.failure_reason,
          retryable: false,
        },
      };
    }

    const outputs: MediaOutput[] | undefined = data?.assets?.video
      ? [
          {
            type: 'video',
            url: data.assets.video,
            thumbnailUrl: data.assets.thumbnail,
            mimeType: 'video/mp4',
          },
        ]
      : undefined;

    return {
      externalTaskId,
      status: this.mapStatusFrom(data?.state, LumaMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(data?.state, LumaMediaAdapter.PROGRESS_MAP),
      outputs: data?.state === 'completed' ? outputs : undefined,
    };
  }

  /**
   * Cancel a running task
   */
  override async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    await this.cancelViaEndpoint(
      `${provider.apiUrl}/dream-machine/v1/generations/${externalTaskId}`,
      provider,
      'DELETE',
    );
  }
}
