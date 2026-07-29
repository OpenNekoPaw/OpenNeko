import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { HostSecretPort } from '@neko/host/ports';

const DESKTOP_SECRET_FILE_SCHEMA_VERSION = 1;

export interface DesktopSecretEncryption {
  assertAvailable(): void;
  encrypt(value: string): Uint8Array;
  decrypt(value: Uint8Array): string;
}

export interface CreateEncryptedDesktopSecretPortOptions {
  readonly filePath: string;
  readonly encryption: DesktopSecretEncryption;
}

interface DesktopSecretFile {
  readonly schemaVersion: typeof DESKTOP_SECRET_FILE_SCHEMA_VERSION;
  readonly entries: Readonly<Record<string, string>>;
}

export function createEncryptedDesktopSecretPort(
  options: CreateEncryptedDesktopSecretPortOptions,
): HostSecretPort {
  return new EncryptedDesktopSecretPort(options);
}

class EncryptedDesktopSecretPort implements HostSecretPort {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly options: CreateEncryptedDesktopSecretPortOptions) {}

  get(key: string): Promise<string | undefined> {
    return this.enqueue(async () => {
      this.options.encryption.assertAvailable();
      const file = await this.readFile();
      const encrypted = file.entries[requireSecretKey(key)];
      if (encrypted === undefined) return undefined;
      return this.options.encryption.decrypt(decodeEncryptedValue(encrypted));
    });
  }

  set(key: string, value: string): Promise<void> {
    return this.enqueue(async () => {
      this.options.encryption.assertAvailable();
      const file = await this.readFile();
      const encrypted = Buffer.from(this.options.encryption.encrypt(value)).toString('base64');
      await this.writeFile({
        schemaVersion: DESKTOP_SECRET_FILE_SCHEMA_VERSION,
        entries: { ...file.entries, [requireSecretKey(key)]: encrypted },
      });
    });
  }

  delete(key: string): Promise<void> {
    return this.enqueue(async () => {
      this.options.encryption.assertAvailable();
      const file = await this.readFile();
      const normalizedKey = requireSecretKey(key);
      if (file.entries[normalizedKey] === undefined) return;
      const entries = { ...file.entries };
      delete entries[normalizedKey];
      await this.writeFile({
        schemaVersion: DESKTOP_SECRET_FILE_SCHEMA_VERSION,
        entries,
      });
    });
  }

  private async readFile(): Promise<DesktopSecretFile> {
    let source: string;
    try {
      source = await readFile(this.options.filePath, 'utf8');
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') {
        return {
          schemaVersion: DESKTOP_SECRET_FILE_SCHEMA_VERSION,
          entries: {},
        };
      }
      throw error;
    }
    const parsed: unknown = JSON.parse(source);
    if (!isRecord(parsed) || parsed['schemaVersion'] !== DESKTOP_SECRET_FILE_SCHEMA_VERSION) {
      throw new Error('Desktop secret file has an unknown schema version.');
    }
    const rawEntries = parsed['entries'];
    if (!isRecord(rawEntries)) {
      throw new TypeError('Desktop secret file entries must be a record.');
    }
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawEntries)) {
      requireSecretKey(key);
      if (typeof value !== 'string') {
        throw new TypeError(`Desktop secret entry '${key}' must be encrypted text.`);
      }
      decodeEncryptedValue(value);
      entries[key] = value;
    }
    return {
      schemaVersion: DESKTOP_SECRET_FILE_SCHEMA_VERSION,
      entries,
    };
  }

  private async writeFile(file: DesktopSecretFile): Promise<void> {
    const directory = dirname(this.options.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.options.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(file)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      await rename(temporaryPath, this.options.filePath);
      await chmod(this.options.filePath, 0o600);
    } catch (error) {
      try {
        await rm(temporaryPath, { force: true });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Failed to persist and clean up the Desktop secret file.',
        );
      }
      throw error;
    }
  }

  private async enqueue<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const previous = this.chain;
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.chain = previous.then(() => current);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

function requireSecretKey(key: string): string {
  const normalized = key.trim();
  if (normalized.length === 0 || normalized !== key || normalized.length > 512) {
    throw new Error('Desktop secret key must be a non-empty normalized value.');
  }
  return normalized;
}

function decodeEncryptedValue(value: string): Uint8Array {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.byteLength === 0 || decoded.toString('base64') !== value) {
    throw new TypeError('Desktop secret entry is not canonical encrypted base64.');
  }
  return decoded;
}

function hasErrorCode(error: unknown): error is Error & { readonly code: unknown } {
  return error instanceof Error && 'code' in error;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
