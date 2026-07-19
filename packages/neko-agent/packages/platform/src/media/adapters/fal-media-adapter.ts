/**
 * fal.ai Media Adapter
 *
 * Supports fal.ai queue-based API for image generation with ControlNet and IP-Adapter.
 * Models: Flux.1 [dev/schnell], Flux-General (ControlNet/IP-Adapter), SDXL variants.
 *
 * API pattern:
 * - Submit: POST https://queue.fal.run/{model_id}
 * - Status: GET https://queue.fal.run/{model_id}/requests/{request_id}/status
 * - Result: GET https://queue.fal.run/{model_id}/requests/{request_id}
 * - Cancel: PUT https://queue.fal.run/{model_id}/requests/{request_id}/cancel
 * - Auth: Authorization: Key {api_key}
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaAdapterResult,
  MediaTaskStatus,
  ImageGenerationRequest,
  MediaOutput,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

// =============================================================================
// API Response Types
// =============================================================================

interface FalQueueResponse {
  request_id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response_url?: string;
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  queue_position?: number;
}

interface FalImageResult {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type?: string;
  }>;
  timings?: Record<string, number>;
  seed?: number;
  has_nsfw_concepts?: boolean[];
  prompt?: string;
}

// =============================================================================
// ControlNet Model Mapping
// =============================================================================

/** Maps ControlMode to fal.ai model endpoint */
const CONTROLNET_MODEL_MAP: Record<string, string> = {
  canny: 'fal-ai/flux-general/canny',
  depth: 'fal-ai/flux-general/depth',
  pose: 'fal-ai/flux-general/pose',
  // Other modes fall back to the general controlnet endpoint
};

const FAL_QUEUE_BASE = 'https://queue.fal.run';

// =============================================================================
// FalMediaAdapter
// =============================================================================

export class FalMediaAdapter extends BaseMediaAdapter {
  readonly type = 'fal';

  private static readonly STATUS_MAP: Record<string, MediaTaskStatus> = {
    IN_QUEUE: 'pending',
    IN_PROGRESS: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
  };

  private static readonly PROGRESS_MAP: Record<string, number> = {
    IN_QUEUE: 5,
    IN_PROGRESS: 50,
    COMPLETED: 100,
    FAILED: 0,
  };

  override getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-image', 'image-to-image', 'image-edit'];
  }

  override supportsType(type: MediaGenerationType): boolean {
    return this.getSupportedTypes().includes(type);
  }

  /**
   * Override auth header: fal.ai uses "Key xxx" instead of "Bearer xxx"
   */
  protected override buildAuthHeader(provider: Provider): Record<string, string> {
    return { Authorization: `Key ${provider.apiKey}` };
  }

  // ===========================================================================
  // Image Generation
  // ===========================================================================

  override async generateImage(
    request: ImageGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const modelId = this.resolveModelId(request, model);
    const url = `${FAL_QUEUE_BASE}/${modelId}`;
    const body = this.buildImageBody(request);

    const { data, error } = await this.request<FalQueueResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    // Encode modelId into externalTaskId for status polling
    const taskId = `${modelId}|${data?.request_id ?? ''}`;

    return {
      externalTaskId: taskId,
      status: this.mapStatusFrom(data?.status, FalMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(data?.status, FalMediaAdapter.PROGRESS_MAP),
    };
  }

  // ===========================================================================
  // Task Status
  // ===========================================================================

  override async getTaskStatus(
    externalTaskId: string,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const [modelId, requestId] = this.parseTaskId(externalTaskId);

    // First check status
    const statusUrl = `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}/status`;
    const { data: statusData, error: statusError } = await this.request<FalStatusResponse>(
      statusUrl,
      { method: 'GET' },
      provider,
    );

    if (statusError) {
      return { status: 'failed', error: statusError };
    }

    const status = this.mapStatusFrom(statusData?.status, FalMediaAdapter.STATUS_MAP);
    const progress = this.estimateProgressFrom(statusData?.status, FalMediaAdapter.PROGRESS_MAP);

    // If not completed, return status only
    if (statusData?.status !== 'COMPLETED') {
      return { externalTaskId, status, progress };
    }

    // Fetch full result when completed
    const resultUrl = `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}`;
    const { data: resultData, error: resultError } = await this.request<FalImageResult>(
      resultUrl,
      { method: 'GET' },
      provider,
    );

    if (resultError) {
      return { status: 'failed', error: resultError };
    }

    const outputs: MediaOutput[] = (resultData?.images ?? []).map((img) => ({
      type: 'image' as const,
      url: img.url,
      width: img.width,
      height: img.height,
      mimeType: img.content_type ?? 'image/png',
    }));

    return {
      externalTaskId,
      status: 'completed',
      progress: 100,
      outputs,
      metadata: {
        seed: resultData?.seed,
        timings: resultData?.timings,
      },
    };
  }

  // ===========================================================================
  // Cancel
  // ===========================================================================

  override async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    const [modelId, requestId] = this.parseTaskId(externalTaskId);
    // fal.ai uses PUT for cancel (not POST/DELETE)
    await this.request(
      `${FAL_QUEUE_BASE}/${modelId}/requests/${requestId}/cancel`,
      { method: 'PUT' },
      provider,
    );
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Select the fal.ai model endpoint based on request fields.
   * Priority: controlMode → ipAdapter → img2img → default model.
   */
  private resolveModelId(request: ImageGenerationRequest, model: Model): string {
    // ControlNet mode takes highest priority
    if (request.controlImageBase64 && request.controlMode) {
      return CONTROLNET_MODEL_MAP[request.controlMode] ?? 'fal-ai/flux-general/controlnet';
    }

    // IP-Adapter for style/subject transfer
    if (request.ipAdapterRefs?.length) {
      return 'fal-ai/flux-general/ip-adapter';
    }

    // Image-to-image (inpaint or style transfer)
    if (request.referenceImageBase64 || request.referenceImageUrl) {
      return 'fal-ai/flux-general/image-to-image';
    }

    // Use model name from config, or default to flux/dev
    return model.name || 'fal-ai/flux/dev';
  }

  /**
   * Build the request body for fal.ai image generation.
   */
  private buildImageBody(request: ImageGenerationRequest): Record<string, unknown> {
    const input: Record<string, unknown> = {
      prompt: request.prompt,
    };

    if (request.negativePrompt) {
      input.negative_prompt = request.negativePrompt;
    }

    // Image dimensions
    if (request.width && request.height) {
      input.image_size = { width: request.width, height: request.height };
    }

    // Number of images
    if (request.count && request.count > 1) {
      input.num_images = request.count;
    }

    // ControlNet conditioning
    if (request.controlImageBase64) {
      input.control_image = `data:image/png;base64,${request.controlImageBase64}`;
      if (request.controlMode) {
        input.control_mode = request.controlMode;
      }
      if (request.controlStrength != null) {
        input.controlnet_conditioning_scale = request.controlStrength;
      }
    }

    // IP-Adapter references (respect per-ref MIME when provided)
    if (request.ipAdapterRefs?.length) {
      const ref = request.ipAdapterRefs[0];
      if (ref) {
        const mime = ref.mimeType ?? 'image/png';
        input.ip_adapter_image = `data:${mime};base64,${ref.imageBase64}`;
        if (ref.strength != null) {
          input.ip_adapter_scale = ref.strength;
        }
      }
    }

    // Image-to-image reference
    if (request.referenceImageBase64) {
      input.image = `data:image/png;base64,${request.referenceImageBase64}`;
      if (request.inpaintStrength != null) {
        input.strength = request.inpaintStrength;
      }
    } else if (request.referenceImageUrl) {
      input.image = request.referenceImageUrl;
      if (request.inpaintStrength != null) {
        input.strength = request.inpaintStrength;
      }
    }

    // Inpaint mask
    if (request.maskBase64) {
      input.mask_image = `data:image/png;base64,${request.maskBase64}`;
    }

    return input;
  }

  /**
   * Parse composite task ID "modelId|requestId".
   */
  private parseTaskId(externalTaskId: string): [string, string] {
    const sep = externalTaskId.indexOf('|');
    if (sep < 0) return ['fal-ai/flux/dev', externalTaskId];
    return [externalTaskId.slice(0, sep), externalTaskId.slice(sep + 1)];
  }
}
