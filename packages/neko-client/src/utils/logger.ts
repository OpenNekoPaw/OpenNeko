import { ConsoleLogger, LogLevel, createLoggerRegistry } from '@neko/shared';
import type { ILogger } from '@neko/shared';

const rootLogger: ILogger = new ConsoleLogger('NekoClient', LogLevel.Warn);
const registry = createLoggerRegistry('NekoClient', LogLevel.Warn);
registry.setRootLogger(rootLogger);

export function getLogger(source: string): ILogger {
  return registry.getLogger(source);
}
