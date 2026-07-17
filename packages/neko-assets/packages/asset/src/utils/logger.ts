import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

const rootLogger: ILogger = new ConsoleLogger('NekoAsset', LogLevel.Info);

export function getLogger(source: string): ILogger {
  return rootLogger.child(source);
}

export { rootLogger };
