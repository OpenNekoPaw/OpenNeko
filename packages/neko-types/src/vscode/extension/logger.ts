/**
 * VSCode OutputChannel Logger Transport
 *
 * Layer 1: Requires vscode API (Extension Host only).
 * Import via: @neko/shared/vscode/extension
 */

import * as vscode from 'vscode';
import { LogLevel, type ILogTransport, type LogEntry } from '../../logger/types';
import { ConsoleLogger } from '../../logger/console-logger';

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'DEBUG',
  [LogLevel.Info]: 'INFO',
  [LogLevel.Warn]: 'WARN',
  [LogLevel.Error]: 'ERROR',
  [LogLevel.Off]: 'OFF',
};

/**
 * OutputChannel transport - writes structured logs to VSCode Output panel
 */
export class OutputChannelTransport implements ILogTransport {
  constructor(private readonly channel: vscode.OutputChannel) {}

  write(entry: LogEntry): void {
    const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
    const level = LEVEL_LABELS[entry.level] ?? 'INFO';
    this.channel.appendLine(`[${ts}] [${level}] [${entry.source}] ${entry.message}`);
    if (entry.data !== undefined && !(entry.data instanceof Error)) {
      this.channel.appendLine(formatLogData(entry.data));
    }
    if (entry.error?.stack) {
      this.channel.appendLine(entry.error.stack);
    }
  }

  dispose(): void {
    this.channel.dispose();
  }
}

export interface VSCodeLoggerOptions {
  readonly showOutputCommand?: string;
}

/**
 * Create a logger backed by a VSCode OutputChannel
 *
 * Usage in extension activate():
 * ```typescript
 * const logger = createVSCodeLogger('Neko Cut', 'NekoCut', context);
 * logger.info('Extension activated');
 *
 * const exportLogger = logger.child('Export');
 * exportLogger.info('Export started');
 * ```
 *
 * @param channelName - Display name in VSCode Output panel dropdown
 * @param source - Log source prefix
 * @param context - Extension context (for disposal)
 * @param level - Minimum log level (default: Info)
 */
export function createVSCodeLogger(
  channelName: string,
  source: string,
  context: vscode.ExtensionContext,
  level: LogLevel = LogLevel.Info,
  options: VSCodeLoggerOptions = {},
): ConsoleLogger {
  const channel = vscode.window.createOutputChannel(channelName);
  context.subscriptions.push(channel);
  if (options.showOutputCommand) {
    context.subscriptions.push(
      vscode.commands.registerCommand(options.showOutputCommand, () => {
        channel.show(true);
      }),
    );
  }
  return new ConsoleLogger(source, level, [new OutputChannelTransport(channel)]);
}

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
};

export interface LogLevelSettingSnapshot {
  readonly level: LogLevel;
  readonly source: 'workspaceFolder' | 'workspace' | 'global' | 'extensionMode';
  readonly value: string | undefined;
  readonly valid: boolean;
  readonly defaultValue: string | undefined;
  readonly globalValue: string | undefined;
  readonly workspaceValue: string | undefined;
  readonly workspaceFolderValue: string | undefined;
  readonly extensionMode: vscode.ExtensionMode | undefined;
}

const RUST_LOG_MAP: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Off]: 'error',
};

/**
 * Read `neko.logLevel` from VSCode settings and map to LogLevel enum.
 *
 * When the user has not explicitly set `neko.logLevel`, the default is
 * chosen by ExtensionMode:
 *   Development → Debug | Production / Test → Warn
 *
 * An explicit user setting (global / workspace / folder) always wins.
 */
export function resolveLogLevelSetting(extensionMode?: vscode.ExtensionMode): LogLevel {
  return inspectLogLevelSetting(extensionMode).level;
}

/**
 * Resolve `neko.logLevel` and expose the exact VSCode configuration source.
 * Useful for diagnostics when an Extension Development Host inherits user or
 * workspace settings from a different window than the repository under test.
 */
export function inspectLogLevelSetting(
  extensionMode?: vscode.ExtensionMode,
): LogLevelSettingSnapshot {
  const config = vscode.workspace.getConfiguration('neko');
  const inspection = config.inspect<string>('logLevel');

  const candidates = [
    ['workspaceFolder', inspection?.workspaceFolderValue],
    ['workspace', inspection?.workspaceValue],
    ['global', inspection?.globalValue],
  ] as const;

  for (const [source, value] of candidates) {
    if (value === undefined) continue;
    const level = parseLogLevelValue(value);
    return {
      level: level ?? LogLevel.Info,
      source,
      value,
      valid: level !== undefined,
      defaultValue: inspection?.defaultValue,
      globalValue: inspection?.globalValue,
      workspaceValue: inspection?.workspaceValue,
      workspaceFolderValue: inspection?.workspaceFolderValue,
      extensionMode,
    };
  }

  // ExtensionMode enum: Production = 1, Development = 2, Test = 3
  let level: LogLevel;
  switch (extensionMode) {
    case 2:
      level = LogLevel.Debug;
      break;
    case 1:
    case 3:
      level = LogLevel.Warn;
      break;
    default:
      level = LogLevel.Info;
      break;
  }

  return {
    level,
    source: 'extensionMode',
    value: undefined,
    valid: true,
    defaultValue: inspection?.defaultValue,
    globalValue: inspection?.globalValue,
    workspaceValue: inspection?.workspaceValue,
    workspaceFolderValue: inspection?.workspaceFolderValue,
    extensionMode,
  };
}

/**
 * Watch `neko.logLevel` changes and hot-reload the logger level.
 * Also sets `process.env.RUST_LOG` so the Rust engine picks up the level
 * on next `init_tracing()` call.
 */
export function watchLogLevel(logger: ConsoleLogger, context: vscode.ExtensionContext): void {
  syncRustLogEnv(resolveLogLevelSetting(context.extensionMode));

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('neko.logLevel')) {
        const level = resolveLogLevelSetting(context.extensionMode);
        logger.setLevel(level);
        syncRustLogEnv(level);
      }
    }),
  );
}

let rustLogManagedByUs = false;

function formatLogData(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data, createLogDataReplacer(), 2);
  } catch {
    return String(data);
  }
}

function createLogDataReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    return value;
  };
}

function parseLogLevelValue(value: string): LogLevel | undefined {
  return LOG_LEVEL_MAP[value.trim().toLowerCase()];
}

function syncRustLogEnv(level: LogLevel): void {
  // Only manage RUST_LOG if no external value was present at first call
  if (!rustLogManagedByUs && process.env['RUST_LOG']) return;
  rustLogManagedByUs = true;
  process.env['RUST_LOG'] = RUST_LOG_MAP[level] ?? 'info';
}
