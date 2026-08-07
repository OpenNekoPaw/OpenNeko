import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { LogLevel, type ILogTransport, type LogEntry } from './types';

export interface ManagedFileLogTransportOptions {
  readonly filePath: string;
  readonly maxBytes?: number;
  readonly maxFiles?: number;
  readonly retentionMs?: number;
  readonly now?: () => number;
  readonly onFailure?: (error: Error) => void;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const DEFAULT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STRING_LENGTH = 4_096;
const MAX_COLLECTION_SIZE = 100;
const MAX_OBJECT_DEPTH = 6;
const REDACTED = '<redacted>';
const SENSITIVE_KEY_PATTERN =
  /(?:api[-_]?key|authorization|bearer|cookie|credential|password|prompt|secret|token)/i;

export class ManagedFileLogTransport implements ILogTransport {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly retentionMs: number;
  private readonly now: () => number;
  private readonly onFailure: ((error: Error) => void) | undefined;
  private available = true;
  private disposed = false;

  constructor(options: ManagedFileLogTransportOptions) {
    this.filePath = options.filePath;
    this.maxBytes = requirePositiveInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, 'maxBytes');
    this.maxFiles = requirePositiveInteger(options.maxFiles ?? DEFAULT_MAX_FILES, 'maxFiles');
    this.retentionMs = requirePositiveInteger(
      options.retentionMs ?? DEFAULT_RETENTION_MS,
      'retentionMs',
    );
    this.now = options.now ?? Date.now;
    this.onFailure = options.onFailure;
    this.protectFileBoundary(() => this.initialize());
  }

  write(entry: LogEntry): void {
    if (this.disposed || !this.available) return;
    this.protectFileBoundary(() => {
      const line = `${serializeManagedLogEntry(entry)}\n`;
      this.rotateIfRequired(Buffer.byteLength(line));
      appendFileSync(this.filePath, line, 'utf8');
    });
  }

  clear(confirmed: boolean): void {
    if (!confirmed) {
      throw new Error('Managed log deletion requires explicit confirmation.');
    }
    if (this.disposed) {
      throw new Error('Managed log transport is disposed.');
    }
    for (const filePath of this.listOwnedFiles()) rmSync(filePath, { force: true });
    writeFileSync(this.filePath, '', 'utf8');
    this.available = true;
  }

  flush(): void {}

  dispose(): void {
    this.disposed = true;
  }

  private initialize(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.deleteExpiredFiles();
    appendFileSync(this.filePath, '', 'utf8');
  }

  private rotateIfRequired(nextByteLength: number): void {
    const currentByteLength = statSync(this.filePath).size;
    if (currentByteLength === 0 || currentByteLength + nextByteLength <= this.maxBytes) return;
    const rotationCount = this.maxFiles - 1;
    if (rotationCount === 0) {
      writeFileSync(this.filePath, '', 'utf8');
      return;
    }
    rmSync(`${this.filePath}.${rotationCount}`, { force: true });
    for (let index = rotationCount - 1; index >= 1; index -= 1) {
      const source = `${this.filePath}.${index}`;
      if (fileExists(source)) renameSync(source, `${this.filePath}.${index + 1}`);
    }
    renameSync(this.filePath, `${this.filePath}.1`);
    writeFileSync(this.filePath, '', 'utf8');
  }

  private deleteExpiredFiles(): void {
    const cutoff = this.now() - this.retentionMs;
    for (const filePath of this.listOwnedFiles()) {
      if (statSync(filePath).mtimeMs < cutoff) rmSync(filePath, { force: true });
    }
  }

  private listOwnedFiles(): readonly string[] {
    const directory = dirname(this.filePath);
    const fileName = basename(this.filePath);
    const pattern = new RegExp(`^${escapeRegExp(fileName)}(?:\\.[1-9][0-9]*)?$`);
    return readdirSync(directory)
      .filter((entry) => pattern.test(entry))
      .map((entry) => join(directory, entry));
  }

  private protectFileBoundary(operation: () => void): void {
    try {
      operation();
    } catch (error: unknown) {
      this.available = false;
      try {
        this.onFailure?.(toError(error));
      } catch {
        // Failure reporting must not escape the owner-local logging boundary.
      }
    }
  }
}

export function serializeManagedLogEntry(entry: LogEntry): string {
  const seen = new Set<object>();
  return JSON.stringify({
    timestamp: new Date(entry.timestamp).toISOString(),
    level: logLevelName(entry.level),
    source: redactText(entry.source),
    message: redactText(entry.message),
    ...(entry.data === undefined ? {} : { data: redactValue(entry.data, undefined, seen, 0) }),
    ...(entry.error
      ? {
          error: {
            name: redactText(entry.error.name),
            message: redactText(entry.error.message),
          },
        }
      : {}),
  });
}

function redactValue(
  value: unknown,
  key: string | undefined,
  seen: Set<object>,
  depth: number,
): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return '<undefined>';
  if (typeof value === 'symbol' || typeof value === 'function') return `<${typeof value}>`;
  if (value instanceof Error) {
    return { name: redactText(value.name), message: redactText(value.message) };
  }
  if (ArrayBuffer.isView(value)) return `<binary:${value.byteLength}>`;
  if (depth >= MAX_OBJECT_DEPTH) return '<max-depth>';
  if (seen.has(value)) return '<circular>';
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_COLLECTION_SIZE)
      .map((item) => redactValue(item, undefined, seen, depth + 1));
  }
  const entries = Object.entries(value).slice(0, MAX_COLLECTION_SIZE);
  return Object.fromEntries(
    entries.map(([entryKey, item]) => [entryKey, redactValue(item, entryKey, seen, depth + 1)]),
  );
}

function redactText(value: string): string {
  const truncated =
    value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}<truncated>` : value;
  return truncated
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
    .replace(
      /\b(api[-_]?key|password|secret|token)\s*[:=]\s*[^\s,;]+/gi,
      (_match, label: string) => `${label}=${REDACTED}`,
    )
    .replace(/(^|[\s"'(])\/(?:[^/\s"'`,)\]}]+\/)+[^\s"'`,)\]}]*/g, '$1<local-path>')
    .replace(/\b[A-Za-z]:\\(?:[^\\\s"'`,)\]}]+\\)+[^\s"'`,)\]}]*/g, '<local-path>');
}

function logLevelName(level: LogLevel): string {
  switch (level) {
    case LogLevel.Debug:
      return 'debug';
    case LogLevel.Info:
      return 'info';
    case LogLevel.Warn:
      return 'warn';
    case LogLevel.Error:
      return 'error';
    case LogLevel.Off:
      return 'off';
  }
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Managed log ${label} must be a positive integer.`);
  }
  return value;
}

function fileExists(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch (error: unknown) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
