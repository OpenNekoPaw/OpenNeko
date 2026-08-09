import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import { Uint8ArrayWriter, ZipReader, type FileEntry } from '@zip.js/zip.js';
import { NodeArchiveFileReader } from './node-file-reader';

const DEFAULT_ARCHIVE_RESOURCE_ENTRY_MAX_BYTES = 64 * 1024 * 1024;

export interface NodeArchiveResourceEntry {
  readonly path: string;
  readonly byteLength: number;
}

export interface NodeArchiveResource {
  readonly entries: readonly NodeArchiveResourceEntry[];
  readEntry(entryPath: string, signal: AbortSignal): Promise<Uint8Array>;
  dispose(): Promise<void>;
}

export interface CreateNodeArchiveResourceOptions {
  readonly maxEntryBytes?: number;
  readonly signal?: AbortSignal;
}

export async function createNodeArchiveResource(
  filePath: string,
  options: CreateNodeArchiveResourceOptions = {},
): Promise<NodeArchiveResource> {
  const maxEntryBytes = validateByteLimit(
    options.maxEntryBytes ?? DEFAULT_ARCHIVE_RESOURCE_ENTRY_MAX_BYTES,
    'maxEntryBytes',
  );
  const source = await stat(filePath);
  options.signal?.throwIfAborted();
  if (!source.isFile()) throw new Error('Archive resource source is not a file.');
  const sourceFingerprint = `${source.size}:${source.mtimeMs}`;
  const archive = new ZipReader(new NodeArchiveFileReader(filePath), {
    ...(options.signal ? { signal: options.signal } : {}),
    useWebWorkers: false,
  });
  const indexed = new Map<string, FileEntry>();
  let disposed = false;
  try {
    for await (const entry of archive.getEntriesGenerator()) {
      options.signal?.throwIfAborted();
      const normalizedPath = normalizeArchiveResourcePath(entry.filename, entry.directory);
      if (entry.directory) continue;
      if (indexed.has(normalizedPath)) {
        throw new Error(`Archive resource contains duplicate path '${normalizedPath}'.`);
      }
      if (entry.encrypted) {
        throw new Error(`Archive resource entry is encrypted: ${normalizedPath}`);
      }
      if (
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize < 0 ||
        entry.uncompressedSize > maxEntryBytes
      ) {
        throw new Error(
          `Archive resource entry exceeds the ${maxEntryBytes}-byte limit: ${normalizedPath}`,
        );
      }
      indexed.set(normalizedPath, entry);
    }
  } catch (error) {
    await archive.close();
    throw error;
  }
  if (indexed.size === 0) {
    await archive.close();
    throw new Error('Archive resource contains no readable entries.');
  }

  return {
    entries: [...indexed].map(([entryPath, entry]) => ({
      path: entryPath,
      byteLength: entry.uncompressedSize,
    })),
    async readEntry(entryPath, signal) {
      if (disposed) throw new Error('Archive resource is disposed.');
      signal.throwIfAborted();
      const normalizedPath = normalizeArchiveResourcePath(entryPath, false);
      const entry = indexed.get(normalizedPath);
      if (!entry) throw new Error(`Archive resource entry does not exist: ${normalizedPath}`);
      const current = await stat(filePath);
      if (`${current.size}:${current.mtimeMs}` !== sourceFingerprint) {
        throw new Error('Archive resource source changed after indexing.');
      }
      signal.throwIfAborted();
      const bytes = await entry.getData(new Uint8ArrayWriter(), { signal });
      if (bytes.byteLength !== entry.uncompressedSize || bytes.byteLength > maxEntryBytes) {
        throw new Error(`Archive resource entry length is invalid: ${normalizedPath}`);
      }
      return bytes;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      indexed.clear();
      await archive.close();
    },
  };
}

function normalizeArchiveResourcePath(value: string, directory: boolean): string {
  if (!value || value.includes('\0')) {
    throw new Error('Archive resource entry path is invalid.');
  }
  const portable = value.replaceAll('\\', '/');
  const candidate = directory ? portable.replace(/\/+$/u, '') : portable;
  if (!candidate || path.posix.isAbsolute(candidate)) {
    throw new Error(`Archive resource entry must be relative: ${value}`);
  }
  const segments = candidate.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Archive resource entry path is not canonical: ${value}`);
  }
  const normalized = path.posix.normalize(candidate);
  if (normalized !== candidate || normalized.startsWith('../')) {
    throw new Error(`Archive resource entry escapes the archive root: ${value}`);
  }
  return normalized;
}

function validateByteLimit(value: number, optionName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive safe integer.`);
  }
  return value;
}
