/**
 * NekoCut Extension Error Handler Registry
 *
 * Global error handler access for module-level code.
 * Initialized in activate() with VSCodeErrorHandler.
 * Falls back to a no-op handler before initialization.
 */

import type { IErrorHandler, ErrorDisplayOptions } from '@neko/shared';

/** No-op handler used before activate() */
const noopHandler: IErrorHandler = {
  async handleError() {
    return undefined;
  },
};

let _errorHandler: IErrorHandler = noopHandler;

/**
 * Set the global error handler (called once in activate())
 */
export function setErrorHandler(handler: IErrorHandler): void {
  _errorHandler = handler;
}

/**
 * Convenience: handle an error with options
 */
export async function handleError(
  error: Error | unknown,
  options?: Partial<ErrorDisplayOptions>,
): Promise<string | undefined> {
  return _errorHandler.handleError(error as Error, options);
}
