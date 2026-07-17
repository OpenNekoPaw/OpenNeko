/**
 * DashScope Media Adapter
 *
 * Supports Alibaba DashScope API for Qwen-Image 2.0 (image) and Wan 2.7 (video).
 * Both services share the same auth and async polling pattern.
 *
 * API pattern:
 * - Submit: POST {apiUrl}/services/aigc/{service}/generation  (with X-DashScope-Async: enable)
 * - Poll:   GET  {apiUrl}/tasks/{task_id}
 * - Auth:   Authorization: Bearer {api_key}
 *
 * Qwen-Image capabilities: text-to-image, image-to-image, image-edit (ControlNet + instruction edit)
 * Wan 2.7 capabilities: text-to-video, image-to-video, video-edit (Camera Code + first/last frame)
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

// =============================================================================
// API Response Types
// =============================================================================

interface DashScopeSubmitResponse {
  output: {
    task_id: string;
    task_status: string;
  };
  request_id: string;
}

interface DashScopeTaskResponse {
  output: {
    task_id: string;
    task_status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';
    task_metrics?: {
      TOTAL?: number;
      SUCCEEDED?: number;
      FAILED?: number;
    };
    results?: Array<{
      url?: string;
      orig_url?: string;
    }>;
    video_url?: string;
    code?: string;
    message?: string;
  };
  request_id: string;
  usage?: {
    image_count?: number;
  };
}

// =============================================================================
// Camera Movement Mapping
// =============================================================================

/**
 * Maps CameraMovement values to Wan 2.7 Camera Code strings.
 * Wan uses a structured camera_control parameter.
 */
const CAMERA_MOVEMENT_MAP: Record<string, string> = {
  pan: 'pan_left',
  tilt: 'tilt_up',
  'zoom-in': 'zoom_in',
  'zoom-out': 'zoom_out',
  dolly: 'dolly_forward',
  'dolly-in': 'dolly_forward',
  'dolly-out': 'dolly_backward',
  crane: 'crane_up',
  handheld: 'shake',
  static: 'static',
};

// =============================================================================
// DashScopeMediaAdapter
// =============================================================================

export class DashScopeMediaAdapter extends BaseMediaAdapter {
  readonly type = 'dashscope';

  private static readonly STATUS_MAP: Record<string, MediaTaskStatus> = {
    PENDING: 'pending',
    RUNNING: 'processing',
    SUCCEEDED: 'completed',
    FAILED: 'failed',
    CANCELED: 'cancelled',
    UNKNOWN: 'pending',
  };

  private static readonly PROGRESS_MAP: Record<string, number> = {
    PENDING: 5,
    RUNNING: 50,
    SUCCEEDED: 100,
    FAILED: 0,
    CANCELED: 0,
  };

  override getSupportedTypes(): MediaGenerationType[] {
    return [
      'text-to-image',
      'image-to-image',
      'image-edit',
      'text-to-video',
      'image-to-video',
      'video-edit',
    ];
  }

  override supportsType(type: MediaGenerationType): boolean {
    return this.getSupportedTypes().includes(type);
  }

  // ===========================================================================
  // Image Generation (Qwen-Image 2.0)
  // ===========================================================================

  override async generateImage(
    request: ImageGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const service = this.resolveImageService(request);
    const url = `${provider.apiUrl}/services/aigc/${service}/generation`;
    const body = this.buildQwenImageBody(request, model);

    const { data, error } = await this.request<DashScopeSubmitResponse>(
      url,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-DashScope-Async': 'enable' },
      },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    return {
      externalTaskId: data?.output?.task_id,
      status: 'pending',
      progress: 0,
    };
  }

  // ===========================================================================
  // Video Generation (Wan 2.7)
  // ===========================================================================

  override async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const service = this.resolveVideoService(request);
    const url = `${provider.apiUrl}/services/aigc/${service}/generation`;
    const body = this.buildWanVideoBody(request, model);

    const { data, error } = await this.request<DashScopeSubmitResponse>(
      url,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-DashScope-Async': 'enable' },
      },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    return {
      externalTaskId: data?.output?.task_id,
      status: 'pending',
      progress: 0,
    };
  }

  // ===========================================================================
  // Task Status (shared for image and video)
  // ===========================================================================

  override async getTaskStatus(
    externalTaskId: string,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/tasks/${externalTaskId}`;

    const { data, error } = await this.request<DashScopeTaskResponse>(
      url,
      { method: 'GET' },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    const taskStatus = data?.output?.task_status ?? 'UNKNOWN';

    // Check for API-level error
    if (taskStatus === 'FAILED' && data?.output?.message) {
      return {
        status: 'failed',
        error: {
          code: data.output.code ?? 'GENERATION_FAILED',
          message: data.output.message,
          retryable: false,
        },
      };
    }

    // Extract outputs based on response format
    let outputs: MediaOutput[] | undefined;

    if (taskStatus === 'SUCCEEDED') {
      // Video output (Wan)
      if (data?.output?.video_url) {
        outputs = [
          {
            type: 'video',
            url: data.output.video_url,
            mimeType: 'video/mp4',
          },
        ];
      }
      // Image output (Qwen-Image)
      else if (data?.output?.results?.length) {
        outputs = data.output.results
          .filter((r) => r.url ?? r.orig_url)
          .map((r) => ({
            type: 'image' as const,
            url: (r.url ?? r.orig_url)!,
            mimeType: 'image/png',
          }));
      }
    }

    return {
      externalTaskId,
      status: this.mapStatusFrom(taskStatus, DashScopeMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(taskStatus, DashScopeMediaAdapter.PROGRESS_MAP),
      outputs,
    };
  }

  // ===========================================================================
  // Cancel (DashScope does not support cancellation)
  // ===========================================================================

  override async cancelTask(_externalTaskId: string, _provider: Provider): Promise<void> {
    // DashScope API does not provide a cancel endpoint
  }

  // ===========================================================================
  // Private Helpers — Qwen-Image
  // ===========================================================================

  /**
   * Determine the DashScope image service endpoint based on request.
   */
  private resolveImageService(request: ImageGenerationRequest): string {
    if (request.editInstruction || request.controlImageBase64) {
      return 'text2image/image-editing';
    }
    if (request.referenceImageBase64 || request.referenceImageUrl) {
      return 'text2image/image-synthesis';
    }
    return 'text2image/image-synthesis';
  }

  /**
   * Build request body for Qwen-Image 2.0.
   */
  private buildQwenImageBody(
    request: ImageGenerationRequest,
    model: Model,
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };

    if (request.negativePrompt) {
      input.negative_prompt = request.negativePrompt;
    }

    // Reference image for editing / img2img
    if (request.referenceImageBase64) {
      input.ref_image = `data:image/png;base64,${request.referenceImageBase64}`;
    } else if (request.referenceImageUrl) {
      input.ref_image = request.referenceImageUrl;
    }

    // ControlNet conditioning
    if (request.controlImageBase64) {
      input.control_image = `data:image/png;base64,${request.controlImageBase64}`;
    }

    // Inpaint mask
    if (request.maskBase64) {
      input.mask_image = `data:image/png;base64,${request.maskBase64}`;
    }

    // Edit instruction (Qwen-Image native instruction editing)
    if (request.editInstruction) {
      input.prompt = request.editInstruction;
    }

    const parameters: Record<string, unknown> = {};

    if (request.width && request.height) {
      parameters.size = `${request.width}*${request.height}`;
    }

    if (request.count) {
      parameters.n = request.count;
    }

    if (request.controlMode) {
      parameters.control_mode = request.controlMode;
    }

    if (request.controlStrength != null) {
      parameters.control_strength = request.controlStrength;
    }

    if (request.style) {
      parameters.style = request.style;
    }

    return {
      model: model.name || 'wanx-v1',
      input,
      parameters,
    };
  }

  // ===========================================================================
  // Private Helpers — Wan 2.7 Video
  // ===========================================================================

  /**
   * Determine the DashScope video service endpoint.
   */
  private resolveVideoService(request: VideoGenerationRequest): string {
    if (request.sourceVideoUrl || request.editInstruction) {
      return 'text2video/video-editing';
    }
    if (request.referenceImageUrl || request.startFrameImageBase64) {
      return 'text2video/image2video';
    }
    return 'text2video/video-synthesis';
  }

  /**
   * Build request body for Wan 2.7 video generation.
   */
  private buildWanVideoBody(
    request: VideoGenerationRequest,
    model: Model,
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };

    // First/last frame images
    if (request.startFrameImageBase64) {
      input.first_frame_image = `data:image/png;base64,${request.startFrameImageBase64}`;
    }

    if (request.endFrameImageBase64) {
      input.last_frame_image = `data:image/png;base64,${request.endFrameImageBase64}`;
    }

    // Reference image for image-to-video
    if (request.referenceImageUrl) {
      input.image_url = request.referenceImageUrl;
    }

    // Source video for video editing
    if (request.sourceVideoUrl) {
      input.ref_video = request.sourceVideoUrl;
    }

    // Edit instruction
    if (request.editInstruction) {
      input.prompt = request.editInstruction;
    }

    const parameters: Record<string, unknown> = {};

    // Camera movement → Wan Camera Code
    if (request.cameraMovement) {
      const cameraCode = CAMERA_MOVEMENT_MAP[request.cameraMovement] ?? request.cameraMovement;
      parameters.camera_control = cameraCode;
    }

    if (request.duration) {
      parameters.duration = request.duration;
    }

    if (request.resolution) {
      parameters.resolution = request.resolution;
    }

    if (request.aspectRatio) {
      parameters.aspect_ratio = request.aspectRatio;
    }

    return {
      model: model.name || 'wanx-v1',
      input,
      parameters,
    };
  }
}
