/**
 * NekoEngine Extension Logger Registry
 *
 * Global logger access for module-level code.
 * Initialized in activate() with a VSCode OutputChannel logger.
 * Falls back to ConsoleLogger before initialization.
 */

import type { ILogger } from '@neko/shared';
import { createLoggerRegistry } from '@neko/shared';

const registry = createLoggerRegistry('NekoEngine');

export function setRootLogger(logger: ILogger): void {
  registry.setRootLogger(logger);
}

export function getLogger(source: string): ILogger {
  return registry.getLogger(source);
}
