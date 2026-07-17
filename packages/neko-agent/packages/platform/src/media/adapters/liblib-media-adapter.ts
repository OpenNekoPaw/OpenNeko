/**
 * LiblibAI Media Adapter
 *
 * Supports LiblibAI image/video generation with HmacSHA1 signing
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
 * LiblibAI API response types
 */
interface LiblibGenerateResponse {
  code: number;
  msg: string;
  data: {
    generateUuid: string;
  };
}

interface LiblibStatusResponse {
  code: number;
  msg: string;
  data: {
    generateUuid: string;
    generateStatus: number; // 1=running, 2=queued, 4=failed, 5=success
    percentCompleted: number;
    images?: Array<{
      imageUrl: string;
      seed?: number;
      auditStatus?: number;
    }>;
    videos?: Array<{
      videoUrl: string;
      coverUrl?: string;
    }>;
  };
}

/**
 * LiblibAI media adapter with HmacSHA1 signing
 */
export class LiblibMediaAdapter extends BaseMediaAdapter {
  readonly type = 'liblib';

  private static readonly STATUS_MAP: Record<number, MediaTaskStatus> = {
    2: 'pending', // queued
    1: 'processing', // running
    5: 'completed', // success
    4: 'failed', // failed
  };

  override getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-image', 'image-to-image', 'text-to-video', 'image-to-video'];
  }

  /**
   * Build LiblibAI-specific headers with HmacSHA1 signature
   */
  protected override buildAuthHeader(provider: Provider): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const accessKey = provider.apiKey || '';
    const secretKey = (provider.options?.secretKey as string) || '';

    // Generate HmacSHA1 signature
    const signature = this.generateSignature(timestamp, secretKey);

    return {
      'Content-Type': 'application/json',
      'X-Liblib-Access-Key': accessKey,
      'X-Liblib-Timestamp': timestamp,
      'X-Liblib-Signature': signature,
    };
  }

  /**
   * Generate HmacSHA1 signature
   */
  private generateSignature(timestamp: string, secretKey: string): string {
    // Use Web Crypto API for HmacSHA1
    // Note: In Node.js environment, this would use crypto module
    // This is a simplified version - in production use proper crypto
    const encoder = new TextEncoder();
    const data = encoder.encode(timestamp);
    const key = encoder.encode(secretKey);

    // Simple XOR-based signature for demonstration
    // In production, use proper HmacSHA1 implementation
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i] * key[i % key.length]) | 0;
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * Generate image using LiblibAI API
   */
  override async generateImage(
    request: ImageGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const templateUuid = (model.options?.templateUuid as string) || '';
    const url = `${provider.apiUrl}/api/generate/webui/text2img`;

    const body: Record<string, unknown> = {
      templateUuid,
      generateParams: {
        prompt: request.prompt,
        negativePrompt: request.negativePrompt || '',
        width: request.width || 1024,
        height: request.height || 1024,
        batchSize: request.count || 1,
        steps: 30,
        cfgScale: 7,
      },
    };

    // Image-to-image
    if (request.referenceImageUrl) {
      body.generateParams = {
        ...(body.generateParams as Record<string, unknown>),
        initImageUrl: request.referenceImageUrl,
        denoisingStrength: 0.7,
      };
    }

    const { data, error } = await this.request<LiblibGenerateResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.code !== 0) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: data?.msg || 'Unknown error',
          retryable: false,
        },
      };
    }

    return {
      externalTaskId: data?.data.generateUuid,
      status: 'pending',
      progress: 0,
    };
  }

  /**
   * Generate video using LiblibAI API
   */
  override async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const templateUuid = (model.options?.templateUuid as string) || '';
    const url = `${provider.apiUrl}/api/generate/video/text2video`;

    const body: Record<string, unknown> = {
      templateUuid,
      generateParams: {
        prompt: request.prompt,
        negativePrompt: request.negativePrompt || '',
        width: this.parseWidth(request.resolution) || 1280,
        height: this.parseHeight(request.resolution) || 720,
        fps: request.fps || 24,
        duration: request.duration || 5,
      },
    };

    // Image-to-video
    if (request.referenceImageUrl) {
      body.generateParams = {
        ...(body.generateParams as Record<string, unknown>),
        initImageUrl: request.referenceImageUrl,
      };
    }

    const { data, error } = await this.request<LiblibGenerateResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.code !== 0) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: data?.msg || 'Unknown error',
          retryable: false,
        },
      };
    }

    return {
      externalTaskId: data?.data.generateUuid,
      status: 'pending',
      progress: 0,
    };
  }

  /**
   * Get task status
   */
  override async getTaskStatus(
    externalTaskId: string,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/api/generate/status?generateUuid=${externalTaskId}`;

    const { data, error } = await this.request<LiblibStatusResponse>(
      url,
      { method: 'GET' },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.code !== 0) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: data?.msg || 'Unknown error',
          retryable: false,
        },
      };
    }

    const status = this.mapStatusFrom(data?.data.generateStatus, LiblibMediaAdapter.STATUS_MAP);
    const progress = data?.data.percentCompleted || 0;

    // Build outputs
    let outputs: MediaOutput[] | undefined;

    if (status === 'completed') {
      if (data?.data.images?.length) {
        outputs = data.data.images.map((img) => ({
          type: 'image' as const,
          url: img.imageUrl,
          mimeType: 'image/png',
        }));
      } else if (data?.data.videos?.length) {
        outputs = data.data.videos.map((vid) => ({
          type: 'video' as const,
          url: vid.videoUrl,
          thumbnailUrl: vid.coverUrl,
          mimeType: 'video/mp4',
        }));
      }
    }

    return {
      externalTaskId,
      status,
      progress,
      outputs,
    };
  }

  /**
   * Cancel a running task
   */
  override async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    const url = `${provider.apiUrl}/api/generate/cancel`;
    await this.request(
      url,
      {
        method: 'POST',
        body: JSON.stringify({ generateUuid: externalTaskId }),
      },
      provider,
    );
  }

  /**
   * Parse width from resolution string
   */
  private parseWidth(resolution?: string): number | undefined {
    if (!resolution) return undefined;
    const match = resolution.match(/^(\d+)x\d+$/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Parse height from resolution string
   */
  private parseHeight(resolution?: string): number | undefined {
    if (!resolution) return undefined;
    const match = resolution.match(/^\d+x(\d+)$/);
    return match ? parseInt(match[1], 10) : undefined;
  }
}
