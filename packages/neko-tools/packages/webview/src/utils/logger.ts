import { createWebviewLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createWebviewLoggerRegistry({
  packageName: 'NekoTools',
  defaultLevel: LogLevel.Info,
});

export const setRootLogger = registry.setRootLogger;
export const getRootLogger = registry.getRootLogger;
export const getLogger = registry.getLogger;
