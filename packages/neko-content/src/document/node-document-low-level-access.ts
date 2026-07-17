import { open, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { Reader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import type { DocumentLowLevelAccess } from './document-access-service';

export interface CreateNodeDocumentLowLevelAccessOptions {
  readonly resolvePath?: (filePath: string) => string;
  readonly maxWholeFileBytes?: number;
  readonly maxRangeBytes?: number;
  readonly maxArchiveEntryBytes?: number;
}

export const DEFAULT_DOCUMENT_WHOLE_FILE_MAX_BYTES = 256 * 1024 * 1024;
export const DEFAULT_DOCUMENT_RANGE_MAX_BYTES = 64 * 1024 * 1024;
export const DEFAULT_DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES = 64 * 1024 * 1024;

export interface NodeDocumentLowLevelAccess extends DocumentLowLevelAccess {
  identify(filePath: string): Promise<{ fileId?: string; sizeBytes?: number; mtimeMs?: number }>;
  readFile(filePath: string): Promise<Uint8Array>;
  readRange(filePath: string, start: number, end: number): Promise<Uint8Array>;
  readEntry(filePath: string, entryPath: string): Promise<Uint8Array>;
}

/** Node host file/archive access for document readers. */
export function createNodeDocumentLowLevelAccess(
  options: CreateNodeDocumentLowLevelAccessOptions = {},
): NodeDocumentLowLevelAccess {
  const resolvePath = options.resolvePath ?? ((filePath: string) => filePath);
  const maxWholeFileBytes = validateByteLimit(
    options.maxWholeFileBytes ?? DEFAULT_DOCUMENT_WHOLE_FILE_MAX_BYTES,
    'maxWholeFileBytes',
  );
  const maxRangeBytes = validateByteLimit(
    options.maxRangeBytes ?? DEFAULT_DOCUMENT_RANGE_MAX_BYTES,
    'maxRangeBytes',
  );
  const maxArchiveEntryBytes = validateByteLimit(
    options.maxArchiveEntryBytes ?? DEFAULT_DOCUMENT_ARCHIVE_ENTRY_MAX_BYTES,
    'maxArchiveEntryBytes',
  );

  return {
    async identify(filePath) {
      const resolved = resolvePath(filePath);
      const metadata = await stat(resolved);
      return {
        fileId: `${resolved}:${metadata.size}:${metadata.mtimeMs}`,
        sizeBytes: metadata.size,
        mtimeMs: metadata.mtimeMs,
      };
    },
    async readFile(filePath) {
      const resolved = resolvePath(filePath);
      const metadata = await stat(resolved);
      if (metadata.size > maxWholeFileBytes) {
        throw new Error(`Document file exceeds the ${maxWholeFileBytes}-byte limit: ${filePath}`);
      }
      return new Uint8Array(await readFile(resolved));
    },
    async readRange(filePath, start, end) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
        throw new Error(`Invalid document byte range: ${start}-${end}`);
      }
      const length = end - start + 1;
      if (!Number.isSafeInteger(length) || length > maxRangeBytes) {
        throw new Error(
          `Document byte range exceeds the ${maxRangeBytes}-byte limit: ${start}-${end}`,
        );
      }
      const resolved = resolvePath(filePath);
      const metadata = await stat(resolved);
      if (end >= metadata.size) {
        throw new Error(`Document range exceeds file length: ${start}-${end}`);
      }
      const handle = await open(resolved, 'r');
      try {
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, start);
        if (bytesRead !== length) {
          throw new Error(`Document range exceeds file length: ${start}-${end}`);
        }
        return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
      } finally {
        await handle.close();
      }
    },
    async readEntry(filePath, entryPath) {
      const normalizedEntryPath = normalizeArchiveEntryPath(entryPath);
      const archive = new ZipReader(new NodeFileReader(resolvePath(filePath)), {
        useWebWorkers: false,
      });
      try {
        for await (const entry of archive.getEntriesGenerator()) {
          if (entry.filename !== normalizedEntryPath) continue;
          if (entry.directory) break;
          if (
            !Number.isSafeInteger(entry.uncompressedSize) ||
            entry.uncompressedSize > maxArchiveEntryBytes
          ) {
            throw new Error(
              `Document archive entry exceeds the ${maxArchiveEntryBytes}-byte limit: ${normalizedEntryPath}`,
            );
          }
          const data = await entry.getData(new Uint8ArrayWriter());
          if (data.byteLength > maxArchiveEntryBytes) {
            throw new Error(
              `Document archive entry exceeds the ${maxArchiveEntryBytes}-byte limit: ${normalizedEntryPath}`,
            );
          }
          return data;
        }
        throw new Error(`Document archive entry does not exist: ${normalizedEntryPath}`);
      } finally {
        await archive.close();
      }
    },
  };
}

class NodeFileReader extends Reader<string> {
  constructor(private readonly filePath: string) {
    super(filePath);
  }

  override async init(): Promise<void> {
    Reader.prototype.init?.call(this);
    const metadata = await stat(this.filePath);
    this.size = metadata.size;
  }

  override async readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(length) || index < 0 || length < 0) {
      throw new Error(`Invalid archive byte range: ${index}+${length}`);
    }
    const boundedLength = Math.min(length, this.size - index);
    if (boundedLength < 0 || boundedLength > DEFAULT_DOCUMENT_RANGE_MAX_BYTES) {
      throw new Error(
        `Archive byte range exceeds the ${DEFAULT_DOCUMENT_RANGE_MAX_BYTES}-byte limit.`,
      );
    }
    const handle = await open(this.filePath, 'r');
    try {
      const buffer = Buffer.allocUnsafe(boundedLength);
      const { bytesRead } = await handle.read(buffer, 0, boundedLength, index);
      // zip.js currently constructs DataView from array.buffer without honoring
      // byteOffset, so return an isolated zero-offset array for every chunk.
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }
}

function validateByteLimit(value: number, optionName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive safe integer.`);
  }
  return value;
}

function normalizeArchiveEntryPath(entryPath: string): string {
  if (entryPath.includes('\0')) {
    throw new Error('Document archive entry contains a null byte.');
  }
  const portablePath = entryPath.replaceAll('\\', '/');
  if (path.posix.isAbsolute(portablePath)) {
    throw new Error(`Document archive entry must be relative: ${entryPath}`);
  }
  const segments = portablePath.split('/');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    throw new Error(`Document archive entry escapes the archive root: ${entryPath}`);
  }
  const normalized = path.posix.normalize(portablePath);
  if (!normalized || normalized === '.' || normalized.startsWith('../')) {
    throw new Error(`Document archive entry is invalid: ${entryPath}`);
  }
  return normalized;
}
