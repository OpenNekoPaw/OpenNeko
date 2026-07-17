/**
 * OpenAI Compatible Media Adapter
 *
 * Supports Sora, xAI Grok, Kling and other OpenAI-compatible video/image APIs
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaAdapterResult,
  MediaTaskStatus,
  ImageGenerationRequest,
  VideoGenerationRequest,
  MediaOutput,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * OpenAI compatible response types
 */
interface OpenAIImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

interface OpenAIVideoResponse {
  /** Sora-style task ID */
  id?: string;
  /** NewAPI-style task ID */
  task_id?: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  created_at?: number;
  model?: string;
  output?: {
    video_url: string;
    duration: number;
    width: number;
    height: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * OpenAI compatible media adapter for Sora, xAI, Kling
 */
export class OpenAICompatMediaAdapter extends BaseMediaAdapter {
  readonly type = 'openai-compat';

  private static readonly STATUS_MAP: Record<string, MediaTaskStatus> = {
    queued: 'pending',
    in_progress: 'processing',
    completed: 'completed',
    failed: 'failed',
  };

  private static readonly PROGRESS_MAP: Record<string, number> = {
    queued: 0,
    in_progress: 50,
    completed: 100,
    failed: 0,
  };

  override getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-image', 'text-to-video', 'image-to-video'];
  }

  /**
   * Default endpoint paths (OpenAI Sora-compatible)
   */
  private static readonly DEFAULT_ENDPOINTS = {
    imageGenerations: '/v1/images/generations',
    videoGenerations: '/v1/videos/generations',
    videoStatus: '/v1/videos/{taskId}',
    videoCancel: '/v1/videos/{taskId}/cancel',
  };

  /**
   * Get normalized base URL (removes trailing /v1 if present)
   */
  private getBaseUrl(provider: Provider): string {
    let baseUrl = provider.apiUrl || '';
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');
    // Remove /v1 suffix if present (will be added by endpoint paths)
    baseUrl = baseUrl.replace(/\/v1$/, '');
    return baseUrl;
  }

  /**
   * Get media endpoint URL, respecting provider's protocolVariant.mediaEndpoints override.
   */
  private getMediaEndpoint(
    provider: Provider,
    key: keyof typeof OpenAICompatMediaAdapter.DEFAULT_ENDPOINTS,
    params?: Record<string, string>,
  ): string {
    const custom = provider.protocolVariant?.mediaEndpoints?.[key];
    let path = custom ?? OpenAICompatMediaAdapter.DEFAULT_ENDPOINTS[key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        path = path.replace(`{${k}}`, v);
      }
    }
    return `${this.getBaseUrl(provider)}${path}`;
  }

  /**
   * Generate image using OpenAI DALL-E compatible API
   */
  override async generateImage(
    request: ImageGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = this.getMediaEndpoint(provider, 'imageGenerations');

    const body: Record<string, unknown> = {
      model: model.name,
      prompt: request.prompt,
      n: request.count || 1,
      size: this.formatSize(request.width, request.height, request.aspectRatio),
      quality: request.quality || 'standard',
      style: request.style,
    };

    // ControlNet / IP-Adapter / edit parameters (E4 enhancement)
    if (request.controlImageBase64) body.control_image = request.controlImageBase64;
    if (request.controlMode) body.control_mode = request.controlMode;
    if (request.controlStrength != null) body.control_strength = request.controlStrength;
    if (request.editInstruction) body.edit_instruction = request.editInstruction;
    if (request.referenceImageBase64) body.reference_image = request.referenceImageBase64;

    const { data, error } = await this.request<OpenAIImageResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    const outputs: MediaOutput[] =
      data?.data.map((item) => ({
        type: 'image' as const,
        url: item.url || '',
        mimeType: 'image/png',
      })) || [];

    return {
      status: 'completed',
      progress: 100,
      outputs,
    };
  }

  /**
   * Generate video using Sora-like API
   */
  override async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = this.getMediaEndpoint(provider, 'videoGenerations');

    const body: Record<string, unknown> = {
      model: model.name,
      prompt: request.prompt,
    };

    if (request.duration) body.duration = request.duration;
    if (request.fps) body.fps = request.fps;

    // Convert resolution string (e.g., "720p") to width/height
    if (request.resolution) {
      const dims = this.parseResolution(request.resolution);
      if (dims) {
        body.width = dims.width;
        body.height = dims.height;
      }
    }

    // Convert aspect ratio to width/height when no explicit resolution
    if (request.aspectRatio && !body.width) {
      body.aspect_ratio = request.aspectRatio;
    }

    // NewAPI uses "image", Sora uses "image_url"
    if (request.referenceImageUrl) {
      body.image = request.referenceImageUrl;
      body.image_url = request.referenceImageUrl;
    }

    // Camera / motion / edit parameters (E4 enhancement for Kling 3.0 etc.)
    if (request.cameraMovement) body.camera_movement = request.cameraMovement;
    if (request.cameraAngle) body.camera_angle = request.cameraAngle;
    if (request.shotScale) body.shot_scale = request.shotScale;
    if (request.startFrameImageBase64) body.first_frame_image = request.startFrameImageBase64;
    if (request.endFrameImageBase64) body.last_frame_image = request.endFrameImageBase64;
    if (request.sourceVideoUrl) body.source_video = request.sourceVideoUrl;
    if (request.editInstruction) body.edit_instruction = request.editInstruction;
    if (request.motionStrength != null) body.motion_strength = request.motionStrength;

    const { data, error } = await this.request<OpenAIVideoResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    // Accept both Sora-style "id" and NewAPI-style "task_id"
    const taskId = data?.id ?? data?.task_id;

    // Video generation is async, return task ID for polling
    return {
      externalTaskId: taskId,
      status: this.mapStatusFrom(data?.status, OpenAICompatMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(data?.status, OpenAICompatMediaAdapter.PROGRESS_MAP),
    };
  }

  /**
   * Get task status for async video generation
   */
  override async getTaskStatus(
    externalTaskId: string,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = this.getMediaEndpoint(provider, 'videoStatus', { taskId: externalTaskId });

    const { data, error } = await this.request<OpenAIVideoResponse>(
      url,
      { method: 'GET' },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.error) {
      return {
        status: 'failed',
        error: {
          code: data.error.code,
          message: data.error.message,
          retryable: false,
        },
      };
    }

    const outputs: MediaOutput[] | undefined = data?.output
      ? [
          {
            type: 'video',
            url: data.output.video_url,
            width: data.output.width,
            height: data.output.height,
            duration: data.output.duration,
            mimeType: 'video/mp4',
          },
        ]
      : undefined;

    return {
      externalTaskId,
      status: this.mapStatusFrom(data?.status, OpenAICompatMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(data?.status, OpenAICompatMediaAdapter.PROGRESS_MAP),
      outputs,
    };
  }

  /**
   * Cancel a running task
   */
  override async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    await this.cancelViaEndpoint(
      this.getMediaEndpoint(provider, 'videoCancel', { taskId: externalTaskId }),
      provider,
    );
  }

  /**
   * Format size string from dimensions
   */
  private formatSize(width?: number, height?: number, aspectRatio?: string): string {
    if (width && height) {
      return `${width}x${height}`;
    }
    if (aspectRatio === '16:9') return '1792x1024';
    if (aspectRatio === '9:16') return '1024x1792';
    return '1024x1024';
  }

  /**
   * Parse resolution string (e.g., "720p", "1080p") to width/height
   */
  private parseResolution(resolution: string): { width: number; height: number } | null {
    const presets: Record<string, { width: number; height: number }> = {
      '480p': { width: 854, height: 480 },
      '720p': { width: 1280, height: 720 },
      '1080p': { width: 1920, height: 1080 },
    };
    return presets[resolution] ?? null;
  }
}
