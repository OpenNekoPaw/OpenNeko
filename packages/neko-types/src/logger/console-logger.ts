/**
 * Console Logger - Default implementation
 *
 * Works in both Node.js and browser environments.
 * Layer 0: Zero dependencies.
 */

import { LogLevel, type ILogger, type ILogTransport, type LogEntry } from './types';

/**
 * Default console transport
 */
export class ConsoleTransport implements ILogTransport {
  write(entry: LogEntry): void {
    const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
    const prefix = `[${ts}] [${entry.source}]`;
    const method =
      entry.level === LogLevel.Error
        ? 'error'
        : entry.level === LogLevel.Warn
          ? 'warn'
          : entry.level === LogLevel.Debug
            ? 'debug'
            : 'log';

    if (entry.error) {
      console[method](prefix, entry.message, entry.error);
    } else if (entry.data !== undefined) {
      console[method](prefix, entry.message, entry.data);
    } else {
      console[method](prefix, entry.message);
    }
  }
}

/**
 * Console-based logger implementation
 *
 * Usage:
 * ```typescript
 * const logger = new ConsoleLogger('NekoCut');
 * logger.info('Timeline loaded', { tracks: 3 });
 *
 * const exportLogger = logger.child('Export');
 * exportLogger.info('Export started'); // [NekoCut:Export] Export started
 * ```
 */
export type LogLevelRef = { level: LogLevel };

export class ConsoleLogger implements ILogger {
  /** @internal shared across parent + all children so setLevel() propagates */
  _levelRef: LogLevelRef;

  constructor(
    readonly source: string,
    level: LogLevel | LogLevelRef = LogLevel.Info,
    private readonly transports: ILogTransport[] = [new ConsoleTransport()],
  ) {
    this._levelRef = typeof level === 'number' ? { level } : level;
  }

  setLevel(level: LogLevel): void {
    this._levelRef.level = level;
  }

  debug(message: string, data?: unknown): void {
    this.write(LogLevel.Debug, message, data);
  }

  info(message: string, data?: unknown): void {
    this.write(LogLevel.Info, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write(LogLevel.Warn, message, data);
  }

  error(message: string, errorOrData?: Error | unknown): void {
    this.write(LogLevel.Error, message, errorOrData);
  }

  child(subSource: string): ILogger {
    return new ConsoleLogger(`${this.source}:${subSource}`, this._levelRef, this.transports);
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    if (level < this._levelRef.level) return;

    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      source: this.source,
      message,
      data,
      error: data instanceof Error ? data : undefined,
    };

    for (const transport of this.transports) {
      transport.write(entry);
    }
  }
}
