/**
 * Logger Module
 *
 * Unified logging abstraction for all OpenNeko packages.
 *
 * Layer 0 (this module): ILogger interface + ConsoleLogger default
 * Layer 1 (vscode/extension/logger): OutputChannelTransport for Extension Host
 */
export { LogLevel } from './types';
export type { ILogger, ILogTransport, LogEntry, LoggerFactory } from './types';
export { ConsoleLogger, ConsoleTransport } from './console-logger';
export { CapturedLogTransport } from './captured-log-transport';
export {
  emitDiagnostic,
  classifyCommonFailureReason,
  toDiagnosticError,
  type DiagnosticErrorData,
  type DiagnosticLevel,
  type RuntimeDiagnostic,
} from './diagnostic';

// Logger registry factory — eliminates boilerplate in each package
import type { ILogger } from './types';
import { LogLevel } from './types';
import { ConsoleLogger } from './console-logger';

export interface LoggerRegistry {
  readonly setRootLogger: (logger: ILogger) => void;
  readonly getRootLogger: () => ILogger;
  readonly getLogger: (source: string) => ILogger;
}

export interface CreateWebviewLoggerRegistryOptions {
  readonly packageName: string;
  readonly defaultLevel?: LogLevel;
  readonly rootLogger?: ILogger;
}

class DelegatingLogger implements ILogger {
  constructor(
    private readonly registryToken: object,
    private readonly resolveRootLogger: () => ILogger,
    private readonly sourcePath: readonly string[],
  ) {}

  get source(): string {
    return this.resolveLogger().source;
  }

  debug(message: string, data?: unknown): void {
    this.resolveLogger().debug(message, data);
  }

  info(message: string, data?: unknown): void {
    this.resolveLogger().info(message, data);
  }

  warn(message: string, data?: unknown): void {
    this.resolveLogger().warn(message, data);
  }

  error(message: string, errorOrData?: Error | unknown): void {
    this.resolveLogger().error(message, errorOrData);
  }

  child(subSource: string): ILogger {
    return new DelegatingLogger(this.registryToken, this.resolveRootLogger, [
      ...this.sourcePath,
      subSource,
    ]);
  }

  setLevel(level: LogLevel): void {
    this.resolveLogger().setLevel(level);
  }

  isFromRegistry(registryToken: object): boolean {
    return this.registryToken === registryToken;
  }

  private resolveLogger(): ILogger {
    let logger = this.resolveRootLogger();
    for (const source of this.sourcePath) {
      logger = logger.child(source);
    }
    return logger;
  }
}

/**
 * Create a logger registry for a package.
 *
 * Each package calls this once to get its own setRootLogger/getLogger/getRootLogger
 * functions, backed by a module-scoped root logger instance.
 *
 * When setRootLogger replaces the root, any loggers already created via getLogger()
 * delegate to the new root logger and transport.
 *
 * @param packageName Default root logger source name (e.g., 'Agent', 'Platform')
 * @param defaultLevel Default log level (defaults to Info)
 */
export function createLoggerRegistry(
  packageName: string,
  defaultLevel = LogLevel.Info,
): LoggerRegistry {
  const registryToken = {};
  let rootLogger: ILogger = new ConsoleLogger(packageName, defaultLevel);
  const rootProxy = new DelegatingLogger(registryToken, () => rootLogger, []);

  const createProxy = (sourcePath: readonly string[]): ILogger =>
    new DelegatingLogger(registryToken, () => rootLogger, sourcePath);

  return {
    setRootLogger(logger: ILogger) {
      if (logger instanceof DelegatingLogger && logger.isFromRegistry(registryToken)) {
        throw new Error('Logger registry root cannot be set to one of its own proxy loggers.');
      }
      rootLogger = logger;
    },
    getRootLogger() {
      return rootProxy;
    },
    getLogger(source: string) {
      return createProxy([source]);
    },
  };
}

export function createWebviewLoggerRegistry(
  options: CreateWebviewLoggerRegistryOptions,
): LoggerRegistry {
  const registry = createLoggerRegistry(options.packageName, options.defaultLevel);
  if (options.rootLogger) {
    registry.setRootLogger(options.rootLogger);
  }
  return registry;
}
