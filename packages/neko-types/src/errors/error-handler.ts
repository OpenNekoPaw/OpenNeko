/**
 * Error Handler - Pluggable error reporting strategy
 *
 * Extends the existing BaseError system with a unified error display interface.
 * Extension Host: VSCodeErrorHandler (showErrorMessage + OutputChannel)
 * Webview: ErrorBoundary + toast notifications
 *
 * Layer 0: Zero dependencies (except BaseError from same package).
 */

import type { ErrorCategory } from './base-error';
import { BaseError } from './base-error';

/**
 * Error severity for display purposes
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

/**
 * Options controlling how an error is displayed to the user
 */
export interface ErrorDisplayOptions {
  /** Whether to show a notification to the user (vs. only logging) */
  showToUser: boolean;
  /** Severity determines the notification style (info/warning/error) */
  severity: ErrorSeverity;
  /** Action labels offered to the user (e.g., "Retry", "Show Output") */
  actions?: string[];
}

/**
 * Error handler interface - pluggable error reporting strategy
 *
 * Follows Strategy pattern:
 * - VSCodeErrorHandler: showErrorMessage + OutputChannel logging
 * - TestErrorHandler: collect errors for assertions
 */
export interface IErrorHandler {
  /**
   * Handle an error with optional display options
   * @returns The label of the action selected by the user, or undefined
   */
  handleError(
    error: Error | BaseError,
    options?: Partial<ErrorDisplayOptions>,
  ): Promise<string | undefined>;
}

/**
 * Derive default display options from an error's category
 *
 * Maps ErrorCategory to sensible defaults for showToUser, severity, and actions.
 */
export function getDefaultDisplayOptions(category: ErrorCategory): ErrorDisplayOptions {
  switch (category) {
    case 'authentication':
    case 'permission':
      return {
        showToUser: true,
        severity: 'error',
        actions: ['Open Settings'],
      };
    case 'rate_limit':
      return { showToUser: true, severity: 'warning', actions: ['Retry'] };
    case 'network':
    case 'timeout':
      return { showToUser: true, severity: 'warning', actions: ['Retry'] };
    case 'validation':
      return { showToUser: true, severity: 'info' };
    case 'context_length':
    case 'content_filter':
      return { showToUser: true, severity: 'warning' };
    case 'server':
      return { showToUser: true, severity: 'error', actions: ['Retry'] };
    default:
      return { showToUser: false, severity: 'error' };
  }
}

/**
 * Normalize any thrown value to a BaseError
 */
export function toBaseError(error: unknown, context?: Record<string, unknown>): BaseError {
  if (error instanceof BaseError) return error;
  if (error instanceof Error) return BaseError.fromError(error, context);
  return BaseError.fromError(
    new Error(typeof error === 'string' ? error : 'Unknown error'),
    context,
  );
}
