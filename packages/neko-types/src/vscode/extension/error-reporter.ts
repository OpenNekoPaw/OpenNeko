/**
 * VSCode Error Reporter
 *
 * IErrorHandler implementation for Extension Host.
 * Shows errors via vscode.window.show*Message and logs to ILogger.
 *
 * Layer 1: Requires vscode API (Extension Host only).
 * Import via: @neko/shared/vscode/extension
 */

import * as vscode from 'vscode';
import { BaseError } from '../../errors/base-error';
import {
  getDefaultDisplayOptions,
  toBaseError,
  type ErrorDisplayOptions,
  type IErrorHandler,
} from '../../errors/error-handler';
import type { ILogger } from '../../logger/types';

/**
 * VSCode Extension Host error handler
 *
 * Usage:
 * ```typescript
 * const errorHandler = new VSCodeErrorHandler(logger);
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const action = await errorHandler.handleError(error, { actions: ['Retry'] });
 *   if (action === 'Retry') { ... }
 * }
 * ```
 */
export class VSCodeErrorHandler implements IErrorHandler {
  constructor(private readonly logger: ILogger) {}

  async handleError(
    error: Error | BaseError,
    options?: Partial<ErrorDisplayOptions>,
  ): Promise<string | undefined> {
    const baseError = toBaseError(error);

    const displayOpts: ErrorDisplayOptions = {
      ...getDefaultDisplayOptions(baseError.category),
      ...options,
    };

    // Always log
    this.logger.error(baseError.message, baseError);

    // Optionally show to user
    if (!displayOpts.showToUser) return undefined;

    const actions = displayOpts.actions ?? [];
    const showFn =
      displayOpts.severity === 'warning'
        ? vscode.window.showWarningMessage
        : displayOpts.severity === 'info'
          ? vscode.window.showInformationMessage
          : vscode.window.showErrorMessage;

    const selected = await showFn(baseError.message, ...actions);
    return selected;
  }
}
