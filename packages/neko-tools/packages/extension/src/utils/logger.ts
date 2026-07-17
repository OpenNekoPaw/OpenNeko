/**
 * Neko Tools Logger - Global logger registry
 *
 * Extension initializes via createVSCodeLogger() in activate().
 * All modules use getLogger('ModuleName') for scoped logging.
 */

import type { ILogger } from '@neko/shared';
import { createLoggerRegistry } from '@neko/shared';

const registry = createLoggerRegistry('NekoTools');

export function setRootLogger(logger: ILogger): void {
  registry.setRootLogger(logger);
}

export function getLogger(source: string): ILogger {
  return registry.getLogger(source);
}

export function getRootLogger(): ILogger {
  return registry.getRootLogger();
}
