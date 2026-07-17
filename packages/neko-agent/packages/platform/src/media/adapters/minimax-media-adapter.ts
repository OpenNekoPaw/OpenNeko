/**
 * MiniMax Media Adapter
 *
 * Supports MiniMax video generation API
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
 * MiniMax API response types
 */
interface MiniMaxVideoResponse {
  task_id: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

interface MiniMaxTaskStatusResponse {
  task_id: string;
  status: 'Queueing' | 'Processing' | 'Success' | 'Fail';
  file_id?: string;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

interface MiniMaxFileResponse {
  file: {
    file_id: string;
    bytes: number;
    created_at: number;
    filename: string;
    purpose: string;
    download_url: string;
  };
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

/**
 * MiniMax media adapter
 */
export class MiniMaxMediaAdapter extends BaseMediaAdapter {
  readonly type = 'minimax';

  private static readonly STATUS_MAP: Record<string, MediaTaskStatus> = {
    Queueing: 'pending',
    Processing: 'processing',
    Success: 'completed',
    Fail: 'failed',
  };

  private static readonly PROGRESS_MAP: Record<string, number> = {
    Queueing: 0,
    Processing: 50,
    Success: 100,
    Fail: 0,
  };

  override getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-video'];
  }

  /**
   * Generate video using MiniMax API
   */
  override async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/v1/video_generation`;

    const body: Record<string, unknown> = {
      model: model.name || 'video-01',
      prompt: request.prompt,
    };

    const { data, error } = await this.request<MiniMaxVideoResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.base_resp.status_code !== 0) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: data?.base_resp.status_msg || 'Unknown error',
          retryable: false,
        },
      };
    }

    return {
      externalTaskId: data?.task_id,
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
    const url = `${provider.apiUrl}/v1/query/video_generation?task_id=${externalTaskId}`;

    const { data, error } = await this.request<MiniMaxTaskStatusResponse>(
      url,
      { method: 'GET' },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.base_resp.status_code !== 0) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: data?.base_resp.status_msg || 'Unknown error',
          retryable: false,
        },
      };
    }

    const status = this.mapStatusFrom(data?.status, MiniMaxMediaAdapter.STATUS_MAP);

    // If completed, get the download URL
    if (status === 'completed' && data?.file_id) {
      const outputs = await this.getFileUrl(data.file_id, provider);
      return {
        externalTaskId,
        status,
        progress: 100,
        outputs,
      };
    }

    return {
      externalTaskId,
      status,
      progress: this.estimateProgressFrom(data?.status, MiniMaxMediaAdapter.PROGRESS_MAP),
    };
  }

  /**
   * Get file download URL
   */
  private async getFileUrl(fileId: string, provider: Provider): Promise<MediaOutput[] | undefined> {
    const url = `${provider.apiUrl}/v1/files/retrieve?file_id=${fileId}`;

    const { data, error } = await this.request<MiniMaxFileResponse>(
      url,
      { method: 'GET' },
      provider,
    );

    if (error || data?.base_resp.status_code !== 0) {
      return undefined;
    }

    return [
      {
        type: 'video',
        url: data.file.download_url,
        fileSize: data.file.bytes,
        mimeType: 'video/mp4',
      },
    ];
  }

  /**
   * Cancel a running task
   */
  override async cancelTask(_externalTaskId: string, _provider: Provider): Promise<void> {
    // MiniMax does not support task cancellation
  }
}
