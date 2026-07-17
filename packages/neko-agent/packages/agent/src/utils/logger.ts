/**
 * Agent Logger - Global logger registry
 *
 * Default: ConsoleLogger for standalone usage.
 * Extension injects VSCode OutputChannel logger via setRootLogger().
 */
import { createLoggerRegistry } from '@neko/shared';

export const { setRootLogger, getRootLogger, getLogger } = createLoggerRegistry('Agent');
