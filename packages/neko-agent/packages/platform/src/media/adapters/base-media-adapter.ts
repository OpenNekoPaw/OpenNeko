/**
 * Base Media Adapter - Common functionality for media adapters
 *
 * Uses shared HttpClient for HTTP operations.
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaAdapter,
  MediaGenerationType,
  MediaTaskStatus,
  MediaAdapterResult,
  MediaAdapterError,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
} from '../types';
import { HttpClient, getHttpClient, type HttpResult } from '../../core/http-client';

/**
 * Abstract base adapter with common functionality
 */
export abstract class BaseMediaAdapter implements MediaAdapter {
  abstract readonly type: string;

  /** Shared HTTP client instance */
  protected readonly http: HttpClient = getHttpClient();

  /**
   * Get supported generation types
   */
  abstract getSupportedTypes(): MediaGenerationType[];

  /**
   * Check if adapter supports the given generation type
   */
  supportsType(type: MediaGenerationType): boolean {
    return this.getSupportedTypes().includes(type);
  }

  /**
   * Generate image - must be implemented by subclasses that support it
   */
  async generateImage(
    _request: ImageGenerationRequest,
    _model: Model,
    _provider: Provider,
  ): Promise<MediaAdapterResult> {
    return this.notSupportedResult('text-to-image');
  }

  /**
   * Generate video - must be implemented by subclasses that support it
   */
  async generateVideo(
    _request: VideoGenerationRequest,
    _model: Model,
    _provider: Provider,
  ): Promise<MediaAdapterResult> {
    return this.notSupportedResult('text-to-video');
  }

  /**
   * Generate audio - must be implemented by subclasses that support it
   */
  async generateAudio(
    _request: AudioGenerationRequest,
    _model: Model,
    _provider: Provider,
  ): Promise<MediaAdapterResult> {
    return this.notSupportedResult('text-to-audio');
  }

  /**
   * Get task status - must be implemented for async polling
   */
  abstract getTaskStatus(externalTaskId: string, provider: Provider): Promise<MediaAdapterResult>;

  /**
   * Cancel a running task
   */
  abstract cancelTask(externalTaskId: string, provider: Provider): Promise<void>;

  /**
   * Create error result
   */
  protected createErrorResult(
    code: string,
    message: string,
    retryable: boolean = false,
    retryAfterMs?: number,
  ): MediaAdapterResult {
    return {
      status: 'failed',
      error: {
        code,
        message,
        retryable,
        retryAfterMs,
      },
    };
  }

  /**
   * Create not supported result
   */
  protected notSupportedResult(type: MediaGenerationType): MediaAdapterResult {
    return this.createErrorResult(
      'NOT_SUPPORTED',
      `${type} is not supported by ${this.type} adapter`,
    );
  }

  /**
   * Build authorization header
   */
  protected buildAuthHeader(provider: Provider): Record<string, string> {
    if (provider.apiKey) {
      return this.http.buildBearerAuth(provider.apiKey);
    }
    return {};
  }

  /**
   * Make HTTP request with error handling
   * Returns result object with data or error (never throws)
   */
  protected async request<T>(
    url: string,
    options: RequestInit,
    provider: Provider,
  ): Promise<{ data?: T; error?: MediaAdapterError }> {
    const result = await this.http.requestSafe<T>({
      url,
      method: (options.method as 'GET' | 'POST' | 'PUT' | 'DELETE') || 'GET',
      headers: {
        ...this.buildAuthHeader(provider),
        ...(options.headers as Record<string, string>),
      },
      body: options.body ? JSON.parse(options.body as string) : undefined,
    });

    if (result.success === true) {
      return { data: result.data };
    }

    return {
      error: {
        code: result.error.code,
        message: result.error.message,
        retryable: result.error.retryable,
        retryAfterMs: result.error.retryAfterMs,
      },
    };
  }

  /**
   * Make simple HTTP request (throws on error)
   * Use when you want to handle errors with try/catch
   */
  protected async requestSimple<T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    provider: Provider,
    body?: unknown,
    additionalHeaders?: Record<string, string>,
  ): Promise<T> {
    return this.http.request<T>(
      {
        url,
        method,
        headers: {
          ...this.buildAuthHeader(provider),
          ...additionalHeaders,
        },
        body,
      },
      `${this.type} API error`,
    );
  }

  /**
   * Convert HttpResult to MediaAdapterResult for polling
   */
  protected httpResultToAdapterResult<T>(
    result: HttpResult<T>,
    transform: (data: T) => MediaAdapterResult,
  ): MediaAdapterResult {
    if (result.success === true) {
      return transform(result.data);
    }

    return {
      status: 'failed',
      error: {
        code: result.error.code,
        message: result.error.message,
        retryable: result.error.retryable,
        retryAfterMs: result.error.retryAfterMs,
      },
    };
  }

  // ==========================================================================
  // Shared Helpers for Subclass Deduplication
  // ==========================================================================

  /**
   * Map platform-specific status string/number to standard MediaTaskStatus
   */
  protected mapStatusFrom(
    rawStatus: string | number | undefined,
    statusMap: Record<string | number, MediaTaskStatus>,
  ): MediaTaskStatus {
    if (rawStatus === undefined) return 'pending';
    return statusMap[rawStatus] ?? 'pending';
  }

  /**
   * Estimate progress from platform-specific status string/number
   */
  protected estimateProgressFrom(
    rawStatus: string | number | undefined,
    progressMap: Record<string | number, number>,
  ): number {
    if (rawStatus === undefined) return 0;
    return progressMap[rawStatus] ?? 0;
  }

  /**
   * Submit a generation request and return task ID
   * Common pattern: POST body → extract task ID from response
   */
  protected async submitGeneration<T>(
    url: string,
    body: Record<string, unknown>,
    provider: Provider,
    extractTaskId: (data: T) => string | undefined,
  ): Promise<MediaAdapterResult> {
    const { data, error } = await this.request<T>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );
    if (error) return { status: 'failed', error };
    return {
      externalTaskId: data ? extractTaskId(data) : undefined,
      status: 'pending',
      progress: 0,
    };
  }

  /**
   * Poll task status with GET and transform response
   * Common pattern: GET → check error → transform data
   */
  protected async pollTaskStatus<T>(
    url: string,
    provider: Provider,
    transform: (data: T) => MediaAdapterResult,
  ): Promise<MediaAdapterResult> {
    const { data, error } = await this.request<T>(url, { method: 'GET' }, provider);
    if (error) return { status: 'failed', error };
    if (!data) return this.createErrorResult('NO_DATA', 'No response data');
    return transform(data);
  }

  /**
   * Cancel a task via HTTP endpoint
   */
  protected async cancelViaEndpoint(
    url: string,
    provider: Provider,
    method: 'POST' | 'DELETE' = 'POST',
  ): Promise<void> {
    await this.request(url, { method }, provider);
  }
}
