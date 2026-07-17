/**
 * Webview Logger Registry
 *
 * Browser-side equivalent of the extension logger registry.
 * Uses ConsoleLogger from @neko/shared.
 */

import { createWebviewLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createWebviewLoggerRegistry({
  packageName: 'NekoCanvas',
  defaultLevel: LogLevel.Debug,
});

export const setRootLogger = registry.setRootLogger;
export const getRootLogger = registry.getRootLogger;
export const getLogger = registry.getLogger;
