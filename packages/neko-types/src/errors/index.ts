/**
 * Errors Module
 *
 * Unified error handling for all OpenNeko packages.
 *
 * - BaseError: Base class for all custom errors (existing)
 * - IErrorHandler: Pluggable error display strategy (new)
 * - Retry/backoff utilities (existing)
 */

// Existing exports
export { BaseError, calculateBackoff, shouldRetry, sleep } from './base-error';
export type {
  BackoffStrategy,
  BaseErrorInfo,
  ErrorCategory,
  ExponentialBackoff,
  FixedBackoff,
  JitterBackoff,
  LinearBackoff,
  RetryPolicy,
  TimeoutPolicy,
} from './base-error';

// New error handler exports
export { getDefaultDisplayOptions, toBaseError } from './error-handler';
export type { ErrorDisplayOptions, ErrorSeverity, IErrorHandler } from './error-handler';
