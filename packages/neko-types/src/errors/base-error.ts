/**
 * Base Error - Shared error base class
 *
 * All package-specific errors should extend this class.
 * - AgentError extends BaseError (in @neko/agent)
 * - PlatformError extends BaseError (in @neko/platform)
 */

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'validation'
  | 'not_found'
  | 'context_length'
  | 'content_filter'
  | 'mcp'
  | 'tool'
  | 'execution'
  | 'permission'
  | 'skill'
  | 'unknown';

/**
 * Base error info
 */
export interface BaseErrorInfo {
  /** Error category */
  category: ErrorCategory;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Whether error is retryable */
  retryable: boolean;
  /** Suggested retry delay in ms */
  retryAfter?: number;
  /** Original error */
  cause?: Error;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Base error class for all packages
 */
export class BaseError extends Error implements BaseErrorInfo {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;
  declare readonly cause?: Error;
  readonly context?: Record<string, unknown>;

  constructor(info: BaseErrorInfo) {
    super(info.message);
    this.name = 'BaseError';
    this.category = info.category;
    this.code = info.code;
    this.retryable = info.retryable;
    this.retryAfter = info.retryAfter;
    this.cause = info.cause;
    this.context = info.context;
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof BaseError) {
      return error.retryable;
    }
    return false;
  }

  /**
   * Create from generic error
   */
  static fromError(error: Error, context?: Record<string, unknown>): BaseError {
    if (error instanceof BaseError) {
      return error;
    }

    return new BaseError({
      category: 'unknown',
      code: 'UNKNOWN_ERROR',
      message: error.message,
      retryable: false,
      cause: error,
      context,
    });
  }
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Maximum number of retries */
  maxRetries: number;
  /** Backoff strategy */
  backoffStrategy: BackoffStrategy;
  /** Errors that should trigger retry */
  retryableCategories: ErrorCategory[];
  /** Maximum total retry time in ms */
  maxRetryTime?: number;
}

/**
 * Backoff strategy
 */
export type BackoffStrategy = FixedBackoff | LinearBackoff | ExponentialBackoff | JitterBackoff;

export interface FixedBackoff {
  type: 'fixed';
  delayMs: number;
}

export interface LinearBackoff {
  type: 'linear';
  initialDelayMs: number;
  incrementMs: number;
  maxDelayMs: number;
}

export interface ExponentialBackoff {
  type: 'exponential';
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
}

export interface JitterBackoff {
  type: 'jitter';
  baseStrategy: Exclude<BackoffStrategy, JitterBackoff>;
  jitterFactor: number; // 0-1, percentage of delay to randomize
}

/**
 * Timeout policy configuration
 */
export interface TimeoutPolicy {
  /** Request timeout in ms */
  requestTimeout: number;
  /** Total timeout for all retries in ms */
  totalTimeout?: number;
  /** Stream chunk timeout in ms */
  streamTimeout?: number;
}

/**
 * Calculate backoff delay
 */
export function calculateBackoff(strategy: BackoffStrategy, attempt: number): number {
  switch (strategy.type) {
    case 'fixed':
      return strategy.delayMs;

    case 'linear':
      return Math.min(
        strategy.initialDelayMs + strategy.incrementMs * attempt,
        strategy.maxDelayMs,
      );

    case 'exponential':
      return Math.min(
        strategy.initialDelayMs * Math.pow(strategy.multiplier, attempt),
        strategy.maxDelayMs,
      );

    case 'jitter': {
      const baseDelay = calculateBackoff(strategy.baseStrategy, attempt);
      const jitter = baseDelay * strategy.jitterFactor * Math.random();
      return baseDelay + jitter;
    }

    default:
      return 1000;
  }
}

/**
 * Check if error should trigger retry
 */
export function shouldRetry(error: BaseError, policy: RetryPolicy, attempt: number): boolean {
  if (attempt >= policy.maxRetries) {
    return false;
  }

  if (!error.retryable) {
    return false;
  }

  return policy.retryableCategories.includes(error.category);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
