/**
 * Logger Module - Type Definitions
 *
 * Core abstractions for unified logging across all packages.
 * Layer 0: Zero dependencies, works in any environment.
 */

/**
 * Log level enumeration (ordered by severity)
 */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Off = 4,
}

/**
 * Structured log entry
 */
export interface LogEntry {
  readonly level: LogLevel;
  readonly timestamp: number;
  /** Source identifier, e.g. 'NekoCut', 'NekoEngine:Export' */
  readonly source: string;
  readonly message: string;
  readonly data?: unknown;
  readonly error?: Error;
}

/**
 * Logger interface - core abstraction
 *
 * Each module/service creates its own logger instance with a source name.
 * The underlying transport (console, OutputChannel, etc.) is injected.
 */
export interface ILogger {
  readonly source: string;

  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, errorOrData?: Error | unknown): void;

  /** Create child logger with sub-source (e.g. 'NekoCut' -> 'NekoCut:Export') */
  child(subSource: string): ILogger;

  /** Set minimum log level */
  setLevel(level: LogLevel): void;
}

/**
 * Log transport - pluggable output strategy
 *
 * Follows Strategy pattern: ConsoleTransport, OutputChannelTransport, etc.
 */
export interface ILogTransport {
  write(entry: LogEntry): void;
  flush?(): void;
  dispose?(): void;
}

/**
 * Logger factory function type
 */
export type LoggerFactory = (source: string) => ILogger;
