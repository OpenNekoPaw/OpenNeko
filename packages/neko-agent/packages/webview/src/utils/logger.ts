/**
 * Webview Logger Registry
 *
 * Browser-side logger for neko-agent webview.
 * Uses the shared webview logger registry.
 */
import { createWebviewLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createWebviewLoggerRegistry({
  packageName: 'NekoAgent',
  defaultLevel: LogLevel.Debug,
});

export const setRootLogger = registry.setRootLogger;
export const getRootLogger = registry.getRootLogger;
export const getLogger = registry.getLogger;
