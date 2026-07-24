import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import * as path from 'node:path';
import type { ContentReadHandler } from '../../content-access/content-read-service';
import type {
  ContentBytes,
  ContentIoDiagnosticCode,
  ContentReadOptions,
  ContentStat,
} from '../../types/content-io';
import type { ContentFingerprint, WorkspaceFileContentLocator } from '../../types/content-locator';
import {
  authorizeWorkspaceLinkedPath,
  type AuthorizeWorkspaceLinkedPathInput,
  type WorkspaceLinkedPathGuardResult,
} from './workspace-linked-path-guard';

export interface NodeWorkspaceContentReadHandlerOptions {
  readonly workspaceRoot: string;
  readonly defaultMaxBytes?: number;
  readonly authorize?: (
    input: AuthorizeWorkspaceLinkedPathInput,
  ) => Promise<WorkspaceLinkedPathGuardResult>;
}

export class NodeWorkspaceContentReadHandler implements ContentReadHandler<WorkspaceFileContentLocator> {
  private readonly defaultMaxBytes: number;

  constructor(private readonly options: NodeWorkspaceContentReadHandlerOptions) {
    if (!path.isAbsolute(options.workspaceRoot)) {
      throw new Error('Workspace content reader requires an absolute Host workspace root.');
    }
    this.defaultMaxBytes = options.defaultMaxBytes ?? 64 * 1024 * 1024;
    if (!Number.isInteger(this.defaultMaxBytes) || this.defaultMaxBytes <= 0) {
      throw new Error('Workspace content reader defaultMaxBytes must be a positive integer.');
    }
  }

  async stat(
    locator: WorkspaceFileContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentStat> {
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    const authorized = await this.authorize(locator);
    if (!authorized.ok) return unavailable(locator, authorized.code);

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(authorized.filePath, 'r');
      const stats = await handle.stat();
      if (!stats.isFile()) return unavailable(locator, 'content-unsupported');
      const fingerprint = await fingerprintForHandle(
        handle,
        stats.size,
        stats.mtimeMs,
        requestedFingerprint(locator, options),
        options.signal,
      );
      if (!fingerprint) return unavailable(locator, 'content-unsupported');
      return {
        status: 'ready',
        locator,
        byteLength: stats.size,
        fingerprint,
        modifiedAt: new Date(stats.mtimeMs).toISOString(),
        ...(mimeTypeForPath(locator.path) ? { mimeType: mimeTypeForPath(locator.path) } : {}),
      };
    } catch (error) {
      return fileSystemDiagnosticOrThrow(locator, error);
    } finally {
      await closeHandle(handle);
    }
  }

  async read(
    locator: WorkspaceFileContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentBytes> {
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    const authorized = await this.authorize(locator);
    if (!authorized.ok) return unavailable(locator, authorized.code);

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(authorized.filePath, 'r');
      const stats = await handle.stat();
      if (!stats.isFile()) return unavailable(locator, 'content-unsupported');

      const range = resolveRange(stats.size, options, this.defaultMaxBytes);
      if (!range.ok) return unavailable(locator, range.code);
      const fingerprint = await fingerprintForHandle(
        handle,
        stats.size,
        stats.mtimeMs,
        requestedFingerprint(locator, options),
        options.signal,
      );
      if (!fingerprint) return unavailable(locator, 'content-unsupported');
      if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');

      const bytes = await readRange(handle, range.offset, range.length, options.signal);
      return {
        status: 'ready',
        locator,
        bytes,
        offset: range.offset,
        totalByteLength: stats.size,
        fingerprint,
        ...(mimeTypeForPath(locator.path) ? { mimeType: mimeTypeForPath(locator.path) } : {}),
      };
    } catch (error) {
      return fileSystemDiagnosticOrThrow(locator, error);
    } finally {
      await closeHandle(handle);
    }
  }

  private async authorize(
    locator: WorkspaceFileContentLocator,
  ): Promise<
    | { readonly ok: true; readonly filePath: string }
    | { readonly ok: false; readonly code: ContentIoDiagnosticCode }
  > {
    const requestedPath = path.join(this.options.workspaceRoot, ...locator.path.split('/'));
    const result = await (this.options.authorize ?? authorizeWorkspaceLinkedPath)({
      workspaceRoot: this.options.workspaceRoot,
      requestedPath,
    });
    if (!result.authorized) {
      return { ok: false, code: guardDiagnosticCode(result.diagnostic.code) };
    }
    return { ok: true, filePath: requestedPath };
  }
}

function resolveRange(
  byteLength: number,
  options: ContentReadOptions,
  defaultMaxBytes: number,
):
  | { readonly ok: true; readonly offset: number; readonly length: number }
  | { readonly ok: false; readonly code: 'content-range-invalid' | 'content-too-large' } {
  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  const offset = options.range?.offset ?? 0;
  if (offset > byteLength) return { ok: false, code: 'content-range-invalid' };
  const length = Math.min(options.range?.length ?? byteLength, byteLength - offset);
  if (maxBytes !== undefined && length > maxBytes) {
    return { ok: false, code: 'content-too-large' };
  }
  return { ok: true, offset, length };
}

async function fingerprintForHandle(
  handle: Awaited<ReturnType<typeof open>>,
  byteLength: number,
  mtimeMs: number,
  requested: ContentFingerprint | undefined,
  signal: AbortSignal | undefined,
): Promise<ContentFingerprint | undefined> {
  if (!requested || requested.strategy === 'mtime-size') {
    return { strategy: 'mtime-size', value: `${mtimeMs}:${byteLength}` };
  }
  if (requested.strategy === 'provider') return undefined;

  const hash = createHash('sha256');
  const buffer = new Uint8Array(64 * 1024);
  let position = 0;
  while (position < byteLength) {
    if (signal?.aborted) throw abortError();
    const length = Math.min(buffer.byteLength, byteLength - position);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return { strategy: 'sha256', value: `sha256:${hash.digest('hex')}` };
}

async function readRange(
  handle: Awaited<ReturnType<typeof open>>,
  offset: number,
  length: number,
  signal: AbortSignal | undefined,
): Promise<Uint8Array> {
  const buffer = new Uint8Array(length);
  let bytesReadTotal = 0;
  while (bytesReadTotal < length) {
    if (signal?.aborted) throw abortError();
    const { bytesRead } = await handle.read(
      buffer,
      bytesReadTotal,
      length - bytesReadTotal,
      offset + bytesReadTotal,
    );
    if (bytesRead === 0) break;
    bytesReadTotal += bytesRead;
  }
  return bytesReadTotal === buffer.byteLength ? buffer : buffer.slice(0, bytesReadTotal);
}

function requestedFingerprint(
  locator: WorkspaceFileContentLocator,
  options: ContentReadOptions,
): ContentFingerprint | undefined {
  return options.expectedFingerprint ?? locator.fingerprint;
}

function guardDiagnosticCode(
  code: import('./workspace-linked-path-guard').WorkspaceLinkedPathGuardDiagnosticCode,
): ContentIoDiagnosticCode {
  switch (code) {
    case 'workspace-path-unavailable':
    case 'library-link-broken':
      return 'content-missing';
    case 'library-permission-denied':
      return 'content-unauthorized';
    case 'invalid-workspace-path':
    case 'library-entry-not-link':
    case 'library-link-loop':
    case 'nested-link-escape':
    case 'unmanaged-symlink':
      return 'content-unauthorized';
  }
}

function fileSystemDiagnosticOrThrow(
  locator: WorkspaceFileContentLocator,
  error: unknown,
): Extract<ContentStat, { status: 'unavailable' }> {
  if (error instanceof Error && error.name === 'AbortError') {
    return unavailable(locator, 'content-cancelled');
  }
  if (!isNodeError(error)) throw error;
  switch (error.code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return unavailable(locator, 'content-missing');
    case 'EACCES':
    case 'EPERM':
      return unavailable(locator, 'content-unauthorized');
    case 'EISDIR':
      return unavailable(locator, 'content-unsupported');
    default:
      return unavailable(locator, 'content-read-failed');
  }
}

async function closeHandle(handle: Awaited<ReturnType<typeof open>> | undefined): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    throw new Error('Workspace content file handle could not be closed.');
  }
}

function unavailable(
  locator: WorkspaceFileContentLocator,
  code: ContentIoDiagnosticCode,
): Extract<ContentStat, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}

function abortError(): Error {
  const error = new Error('Content read cancelled.');
  error.name = 'AbortError';
  return error;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function mimeTypeForPath(filePath: string): string | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.mp4':
      return 'video/mp4';
    case '.pdf':
      return 'application/pdf';
    case '.epub':
      return 'application/epub+zip';
    default:
      return undefined;
  }
}
