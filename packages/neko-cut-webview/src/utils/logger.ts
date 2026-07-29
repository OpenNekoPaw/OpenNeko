/**
 * Webview Logger Registry
 *
 * Browser-side equivalent of the extension logger registry.
 * Uses ConsoleLogger from @neko/shared.
 */

import { createWebviewLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createWebviewLoggerRegistry({
  packageName: 'NekoCut',
  defaultLevel: LogLevel.Debug,
});

/**
 * Get a child logger for a module/component.
 *
 * @example
 * ```typescript
 * const logger = getLogger('ThumbnailService');
 * logger.info('Cache hit', { key });
 * // Output: [NekoCut:ThumbnailService] Cache hit { key: '...' }
 * ```
 */
export const setRootLogger = registry.setRootLogger;
export const getRootLogger = registry.getRootLogger;
export const getLogger = registry.getLogger;
