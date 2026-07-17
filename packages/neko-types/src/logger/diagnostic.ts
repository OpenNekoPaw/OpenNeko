import type { ILogger } from './types';

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly reason?: string;
  readonly context?: Record<string, unknown>;
  readonly error?: unknown;
}

export interface DiagnosticErrorData {
  readonly name?: string;
  readonly message?: string;
  readonly code?: string;
  readonly stack?: string;
  readonly errno?: string | number;
  readonly syscall?: string;
  readonly path?: string;
  readonly value?: unknown;
}

export function emitDiagnostic(
  logger: ILogger,
  level: DiagnosticLevel,
  diagnostic: RuntimeDiagnostic,
): void {
  const payload: Record<string, unknown> = {
    code: diagnostic.code,
  };

  if (diagnostic.reason) {
    payload['reason'] = diagnostic.reason;
  }
  if (diagnostic.context && Object.keys(diagnostic.context).length > 0) {
    payload['context'] = diagnostic.context;
  }
  if (diagnostic.error !== undefined) {
    payload['error'] = toDiagnosticError(diagnostic.error);
  }

  switch (level) {
    case 'debug':
      logger.debug(diagnostic.message, payload);
      return;
    case 'info':
      logger.info(diagnostic.message, payload);
      return;
    case 'warn':
      logger.warn(diagnostic.message, payload);
      return;
    case 'error':
      logger.error(diagnostic.message, payload);
      return;
  }
}

export function classifyCommonFailureReason(error: unknown): string {
  if (error instanceof SyntaxError) {
    return 'serialization-failed';
  }
  if (
    error instanceof TypeError &&
    /circular|serialize|serialization|stringify/i.test(error.message)
  ) {
    return 'serialization-failed';
  }

  const record = asRecord(error);
  const code = typeof record?.['code'] === 'string' ? record['code'] : null;
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return 'permission-denied';
    case 'ENOSPC':
      return 'disk-full';
    case 'ENOENT':
      return 'path-not-found';
    case 'EMFILE':
    case 'ENFILE':
      return 'fd-limit';
    case 'EISDIR':
    case 'ENOTDIR':
      return 'invalid-path';
    default:
      return 'unknown-error';
  }
}

export function toDiagnosticError(error: unknown): DiagnosticErrorData {
  if (error instanceof Error) {
    const errorRecord = error as Error & {
      code?: string;
      errno?: string | number;
      syscall?: string;
      path?: string;
    };
    return {
      name: error.name,
      message: error.message,
      ...(typeof errorRecord.code === 'string' ? { code: errorRecord.code } : {}),
      ...(typeof error.stack === 'string' ? { stack: error.stack } : {}),
      ...(typeof errorRecord.errno === 'string' || typeof errorRecord.errno === 'number'
        ? { errno: errorRecord.errno }
        : {}),
      ...(typeof errorRecord.syscall === 'string' ? { syscall: errorRecord.syscall } : {}),
      ...(typeof errorRecord.path === 'string' ? { path: errorRecord.path } : {}),
    };
  }

  const record = asRecord(error);
  if (record) {
    return {
      ...(typeof record['name'] === 'string' ? { name: record['name'] } : {}),
      ...(typeof record['message'] === 'string' ? { message: record['message'] } : {}),
      ...(typeof record['code'] === 'string' ? { code: record['code'] } : {}),
      ...(typeof record['stack'] === 'string' ? { stack: record['stack'] } : {}),
      ...(typeof record['errno'] === 'string' || typeof record['errno'] === 'number'
        ? { errno: record['errno'] as string | number }
        : {}),
      ...(typeof record['syscall'] === 'string' ? { syscall: record['syscall'] } : {}),
      ...(typeof record['path'] === 'string' ? { path: record['path'] } : {}),
    };
  }

  return {
    value: error,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
