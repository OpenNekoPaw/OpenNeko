/**
 * Platform Error - Extends BaseError with platform-specific categories
 *
 * Follows the same pattern as AgentError in @neko/agent.
 */

import { BaseError, type BaseErrorInfo } from '@neko/shared';
import type { PlatformErrorInfo } from '../types/error';
/**
 * Platform error with classification
 */
export class PlatformError extends BaseError {
  constructor(info: PlatformErrorInfo) {
    super(info as BaseErrorInfo);
    this.name = 'PlatformError';
  }

  /**
   * Create authentication error
   */
  static authentication(message: string, cause?: Error): PlatformError {
    return new PlatformError({
      category: 'authentication',
      code: 'AUTH_ERROR',
      message,
      retryable: false,
      cause,
    });
  }

  /**
   * Create rate limit error
   */
  static rateLimit(message: string, retryAfter?: number): PlatformError {
    return new PlatformError({
      category: 'rate_limit',
      code: 'RATE_LIMIT',
      message,
      retryable: true,
      retryAfter,
    });
  }

  /**
   * Create network error
   */
  static network(message: string, cause?: Error): PlatformError {
    return new PlatformError({
      category: 'network',
      code: 'NETWORK_ERROR',
      message,
      retryable: true,
      cause,
    });
  }

  /**
   * Create not found error
   */
  static notFound(message: string, context?: Record<string, unknown>): PlatformError {
    return new PlatformError({
      category: 'not_found',
      code: 'NOT_FOUND',
      message,
      retryable: false,
      context,
    });
  }
}
