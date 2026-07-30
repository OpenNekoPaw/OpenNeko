/**
 * Shared HTTP Client - Common HTTP functionality for all adapters
 *
 * Provides unified HTTP request handling, error parsing, and streaming support
 * for both LLM and Media adapters.
 */

import { getLogger } from '../utils/logger';

const logger = getLogger('HttpClient');

/**
 * HTTP request configuration
 */
export interface HttpRequestConfig {
  /** Full URL to request */
  url: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (will be JSON.stringify'd) */
  body?: unknown;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * HTTP error with structured information
 */
export interface HttpError {
  /** Error code (e.g., 'RATE_LIMITED', 'AUTH_ERROR') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** HTTP status code */
  statusCode: number;
  /** Whether the request can be retried */
  retryable: boolean;
  /** Suggested retry delay in milliseconds */
  retryAfterMs?: number;
}

/**
 * Result type for HTTP requests (union of success or error)
 */
export type HttpResult<T> = { success: true; data: T } | { success: false; error: HttpError };

export interface HttpClientErrorInfo {
  readonly code: string;
  readonly message: string;
  readonly method: HttpRequestConfig['method'];
  readonly url: string;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  readonly cause?: Error;
}

export class HttpClientError extends Error {
  readonly code: string;
  readonly method: HttpRequestConfig['method'];
  readonly url: string;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  declare readonly cause?: Error;

  constructor(info: HttpClientErrorInfo) {
    super(info.message);
    this.name = 'HttpClientError';
    this.code = info.code;
    this.method = info.method;
    this.url = info.url;
    this.retryable = info.retryable;
    this.statusCode = info.statusCode;
    this.retryAfterMs = info.retryAfterMs;
    this.cause = info.cause;
  }
}

/**
 * Shared HTTP client with common functionality
 */
export class HttpClient {
  /**
   * Make HTTP request and return parsed JSON
   * Throws on error (use for simple cases)
   */
  async request<T>(config: HttpRequestConfig, errorPrefix: string = 'HTTP error'): Promise<T> {
    const response = await this.fetch(config);

    if (!response.ok) {
      const error = await this.parseError(response);
      throw createHttpResponseError(errorPrefix, config, response.url, error);
    }

    const data = (await response.json()) as T;
    logger.debug('Response received', {
      url: response.url,
      status: response.status,
    });
    return data;
  }

  /**
   * Make HTTP request and return Result type
   * Never throws, returns error in result (use for detailed error handling)
   */
  async requestSafe<T>(config: HttpRequestConfig): Promise<HttpResult<T>> {
    try {
      const response = await this.fetch(config);

      if (!response.ok) {
        const error = await this.parseError(response);
        return { success: false, error };
      }

      const data = (await response.json()) as T;
      return { success: true, data };
    } catch (err) {
      if (err instanceof HttpClientError) {
        return {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            statusCode: err.statusCode ?? 0,
            retryable: err.retryable,
            ...(err.retryAfterMs !== undefined ? { retryAfterMs: err.retryAfterMs } : {}),
          },
        };
      }

      // Handle timeout/abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: config.timeout
              ? `Request timed out after ${config.timeout}ms`
              : 'Request was aborted',
            statusCode: 0,
            retryable: true,
            retryAfterMs: 5000,
          },
        };
      }

      // Build a message that includes Node.js error cause (e.g. ENOTFOUND, ECONNREFUSED)
      let message = err instanceof Error ? err.message : 'Network error';
      const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
      if (cause instanceof Error && cause.message) {
        message = `${message}: ${cause.message}`;
      }

      logger.error(`Network error for ${config.method} ${config.url}`, { err, cause });

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message,
          statusCode: 0,
          retryable: true,
          retryAfterMs: 5000,
        },
      };
    }
  }

  /**
   * Make streaming HTTP request and yield SSE data lines
   * Handles common Server-Sent Events parsing logic
   */
  async *stream(
    config: HttpRequestConfig,
    errorPrefix: string = 'Stream error',
  ): AsyncIterable<string> {
    const response = await this.fetch(config);

    if (!response.ok) {
      const error = await this.parseError(response);
      throw createHttpResponseError(errorPrefix, config, response.url, error);
    }

    logger.debug('Stream started', {
      url: response.url,
      status: response.status,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse HTTP error response into structured error
   */
  async parseError(response: Response): Promise<HttpError> {
    let message = `HTTP ${response.status}`;
    let code = 'HTTP_ERROR';
    let retryable = false;
    let retryAfterMs: number | undefined;
    let rawBody: string | undefined;

    // Try to parse error body
    try {
      rawBody = await response.text();
      const body = JSON.parse(rawBody) as {
        error?: { message?: string; code?: string; type?: string };
        message?: string;
      };
      message = body.error?.message || body.message || message;
      code = body.error?.code || body.error?.type || code;

      // Log detailed error response
      logger.error('Error response', {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: body,
      });
    } catch {
      // Use status text if JSON parsing fails
      message = response.statusText || message;
      logger.error('Error response', {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        rawBody: rawBody || '(failed to read body)',
      });
    }

    // Determine retryability and code based on status
    switch (response.status) {
      case 429:
        code = 'RATE_LIMITED';
        retryable = true;
        const retryAfter = response.headers.get('Retry-After');
        retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        code = 'SERVER_ERROR';
        retryable = true;
        retryAfterMs = 5000;
        break;
      case 400:
        code = 'INVALID_REQUEST';
        break;
      case 401:
        code = 'AUTH_ERROR';
        break;
      case 402:
        code = 'QUOTA_EXCEEDED';
        break;
      case 403:
        code = 'FORBIDDEN';
        break;
      case 404:
        code = 'NOT_FOUND';
        break;
      case 408:
        code = 'TIMEOUT';
        retryable = true;
        retryAfterMs = 5000;
        break;
    }

    return {
      code,
      message,
      statusCode: response.status,
      retryable,
      retryAfterMs,
    };
  }

  /**
   * Build Authorization header with Bearer token
   */
  buildBearerAuth(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }

  /**
   * Build custom API key header (for providers like Anthropic)
   */
  buildApiKeyHeader(headerName: string, apiKey: string): Record<string, string> {
    return { [headerName]: apiKey };
  }

  /**
   * Internal fetch wrapper
   */
  private async fetch(config: HttpRequestConfig): Promise<Response> {
    const { url, method, headers = {}, body, signal, timeout } = config;

    // Debug log for request (sanitize headers to avoid leaking API keys)
    logger.debug(`${method} ${url}`);
    const sanitizedHeaders = { ...headers };
    for (const key of Object.keys(sanitizedHeaders)) {
      if (
        key.toLowerCase() === 'authorization' ||
        key.toLowerCase() === 'api-key' ||
        key.toLowerCase() === 'x-api-key'
      ) {
        sanitizedHeaders[key] = '***';
      }
    }
    logger.debug('Request headers', { headers: sanitizedHeaders });
    if (body) {
      logger.debug('Request body', { body });
    }

    // Create abort signal with timeout if specified
    let fetchSignal = signal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeout) {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeout);

      if (signal) {
        // Compose both signals: abort on either timeout or caller's signal
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      fetchSignal = controller.signal;
    }

    try {
      return await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: fetchSignal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw createHttpNetworkError(config, error);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * Singleton HTTP client instance
 */
let httpClientInstance: HttpClient | null = null;

/**
 * Get shared HTTP client instance
 */
export function getHttpClient(): HttpClient {
  if (!httpClientInstance) {
    httpClientInstance = new HttpClient();
  }
  return httpClientInstance;
}

/**
 * Create new HTTP client instance
 */
export function createHttpClient(): HttpClient {
  return new HttpClient();
}

function createHttpResponseError(
  errorPrefix: string,
  config: HttpRequestConfig,
  responseUrl: string,
  error: HttpError,
): HttpClientError {
  const safeUrl = sanitizeRequestUrl(responseUrl || config.url);
  return new HttpClientError({
    code: error.code,
    message: `${errorPrefix} for ${config.method} ${safeUrl}: ${error.statusCode} ${error.code} - ${error.message}`,
    method: config.method,
    url: safeUrl,
    retryable: error.retryable,
    statusCode: error.statusCode,
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
  });
}

function createHttpNetworkError(config: HttpRequestConfig, error: unknown): HttpClientError {
  const safeUrl = sanitizeRequestUrl(config.url);
  const baseMessage = getErrorMessage(error) ?? 'Network error';
  const causeMessage = formatNetworkCause(error);
  return new HttpClientError({
    code: 'NETWORK_ERROR',
    message: `Network request failed for ${config.method} ${safeUrl}: ${baseMessage}${
      causeMessage ? ` (${causeMessage})` : ''
    }`,
    method: config.method,
    url: safeUrl,
    retryable: true,
    statusCode: 0,
    cause: error instanceof Error ? error : undefined,
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function formatNetworkCause(error: unknown): string | undefined {
  const cause = error instanceof Error ? readObjectField(error, 'cause') : undefined;
  const code = firstString(readObjectField(cause, 'code'), readObjectField(error, 'code'));
  const message = getErrorMessage(cause);
  if (code && message) {
    return message.includes(code) ? `cause=${message}` : `cause=${code}: ${message}`;
  }
  if (code) {
    return `cause=${code}`;
  }
  if (message && message !== getErrorMessage(error)) {
    return `cause=${message}`;
  }
  return undefined;
}

function sanitizeRequestUrl(value: string): string {
  try {
    const url = new URL(value);
    const authFreeOrigin = `${url.protocol}//${url.host}`;
    return `${authFreeOrigin}${url.pathname}${url.search ? '?<redacted>' : ''}`;
  } catch {
    const queryIndex = value.indexOf('?');
    return queryIndex >= 0 ? `${value.slice(0, queryIndex)}?<redacted>` : value;
  }
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const message = firstString(readObjectField(error, 'message'));
  if (message) {
    return message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return undefined;
}

function readObjectField(value: unknown, key: string): unknown {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
  }
  return undefined;
}
