/**
 * NekoAgent Extension Logger Registry
 *
 * Global logger access for module-level code.
 * Initialized in activate() with a VSCode OutputChannel logger.
 * Falls back to ConsoleLogger before initialization.
 */
import { createLoggerRegistry } from '@neko/shared';

export const { setRootLogger, getRootLogger, getLogger } = createLoggerRegistry('NekoAgent');
