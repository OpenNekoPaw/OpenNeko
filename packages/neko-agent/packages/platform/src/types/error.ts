/**
 * Error Types - Platform error handling
 *
 * Delegates to @neko/shared BaseError hierarchy.
 * Platform defines a constrained ErrorCategory subset.
 */

import type { ErrorCategory, BaseErrorInfo, RetryPolicy } from '@neko/shared';

// Re-export shared types for backward compatibility
export type {
  ErrorCategory,
  BaseErrorInfo,
  RetryPolicy,
  BackoffStrategy,
  FixedBackoff,
  LinearBackoff,
  ExponentialBackoff,
  JitterBackoff,
} from '@neko/shared';

/**
 * Platform-specific error categories (subset of ErrorCategory)
 */
export type PlatformErrorCategory = Extract<
  ErrorCategory,
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'validation'
  | 'not_found'
  | 'context_length'
  | 'content_filter'
  | 'unknown'
>;

/**
 * Platform error info (constrained category)
 */
export interface PlatformErrorInfo extends Omit<BaseErrorInfo, 'category'> {
  category: PlatformErrorCategory;
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
 * Retry event for monitoring
 */
export interface RetryEvent {
  /** Attempt number (1-based) */
  attempt: number;
  /** Error that triggered retry */
  error: PlatformErrorInfo;
  /** Delay before next retry */
  delayMs: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Timeout event for monitoring
 */
export interface TimeoutEvent {
  /** Timeout type */
  type: 'request' | 'total' | 'stream';
  /** Timeout value in ms */
  timeoutMs: number;
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Retry/timeout presets
 */
export interface RetryTimeoutPreset {
  /** Preset name */
  name: string;
  /** Retry policy */
  retry: RetryPolicy;
  /** Timeout policy */
  timeout: TimeoutPolicy;
}

/**
 * Built-in preset names
 */
export type BuiltinPresetName = 'modelCall' | 'toolExecution' | 'mcpRequest' | 'workflowExecution';
