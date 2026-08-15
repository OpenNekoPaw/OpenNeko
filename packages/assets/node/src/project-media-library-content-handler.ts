import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  ContentBytes,
  ContentFingerprint,
  ContentIoDiagnosticCode,
  ContentReadOptions,
  ContentStat,
  MediaLibraryContentLocator,
} from '@neko/content';
import type { ContentReadHandler } from '@neko/content/core';
import { authorizeWorkspaceContainedPath } from '@neko/content/node';
import { workspaceLinkedMediaLibraryPath } from '@neko/assets-domain/contracts';
import type { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import { resolveGlobalMediaLibraryTarget } from './global-media-library-files';

export interface ProjectMediaLibraryConnectionResolver {
  resolveAuthorizedTarget(connectionId: string): Promise<string>;
}

export function createGlobalProjectMediaLibraryConnectionResolver(
  mediaLibraryRoot: string,
): ProjectMediaLibraryConnectionResolver {
  if (!path.isAbsolute(mediaLibraryRoot)) {
    throw new Error('Global Media Library root must be an absolute Host path.');
  }
  return {
    resolveAuthorizedTarget: (connectionId) =>
      resolveGlobalMediaLibraryTarget({ mediaLibraryRoot, libraryId: connectionId }),
  };
}

export interface ProjectMediaLibraryContentReadHandlerOptions {
  readonly bindings: Pick<ProjectMediaLibraryBindingRepository, 'read'>;
  readonly connections: ProjectMediaLibraryConnectionResolver;
  readonly workspaceRoot: string;
  readonly initialize?: () => Promise<void>;
  readonly defaultMaxBytes?: number;
}

export type ProjectMediaLibraryContentPathResolution =
  | { readonly ok: true; readonly filePath: string }
  | { readonly ok: false; readonly code: ContentIoDiagnosticCode };

export class ProjectMediaLibraryContentPathResolver {
  constructor(
    private readonly options: Pick<
      ProjectMediaLibraryContentReadHandlerOptions,
      'bindings' | 'connections' | 'workspaceRoot' | 'initialize'
    >,
  ) {}

  async resolve(
    locator: MediaLibraryContentLocator,
  ): Promise<ProjectMediaLibraryContentPathResolution> {
    const root = await this.resolveLibraryRoot(locator.libraryName);
    if (!root.ok) return root;

    try {
      const candidate = path.resolve(root.filePath, ...locator.relativePath.split('/'));
      const authorization = await authorizeWorkspaceContainedPath({
        workspaceRoot: this.options.workspaceRoot,
        requestedPath: candidate,
      });
      if (!authorization.authorized) {
        return { ok: false, code: 'content-unauthorized' };
      }
      return { ok: true, filePath: await realpath(candidate) };
    } catch (error) {
      if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
        return { ok: false, code: 'content-missing' };
      }
      if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
        return { ok: false, code: 'content-unauthorized' };
      }
      return { ok: false, code: 'content-read-failed' };
    }
  }

  async resolveLibraryRoot(libraryName: string): Promise<ProjectMediaLibraryContentPathResolution> {
    await this.options.initialize?.();
    const binding = await this.options.bindings.read(libraryName);
    if (binding.status === 'absent') return { ok: false, code: 'content-missing' };
    if (binding.status === 'invalid') return { ok: false, code: 'content-unauthorized' };

    try {
      const registeredTarget = await realpath(
        await this.options.connections.resolveAuthorizedTarget(binding.binding.connectionId),
      );
      const linkPath = path.join(
        this.options.workspaceRoot,
        ...workspaceLinkedMediaLibraryPath(libraryName).split('/'),
      );
      if (!(await lstat(linkPath)).isSymbolicLink()) {
        return { ok: false, code: 'content-unauthorized' };
      }
      if ((await realpath(linkPath)) !== registeredTarget) {
        return { ok: false, code: 'content-unauthorized' };
      }
      return { ok: true, filePath: linkPath };
    } catch (error) {
      if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
        return { ok: false, code: 'content-missing' };
      }
      if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
        return { ok: false, code: 'content-unauthorized' };
      }
      return { ok: false, code: 'content-read-failed' };
    }
  }
}

export class ProjectMediaLibraryContentReadHandler implements ContentReadHandler<MediaLibraryContentLocator> {
  private readonly defaultMaxBytes: number;
  private readonly pathResolver: ProjectMediaLibraryContentPathResolver;

  constructor(options: ProjectMediaLibraryContentReadHandlerOptions) {
    this.defaultMaxBytes = options.defaultMaxBytes ?? 64 * 1024 * 1024;
    if (!Number.isInteger(this.defaultMaxBytes) || this.defaultMaxBytes <= 0) {
      throw new Error('Media Library content reader defaultMaxBytes must be a positive integer.');
    }
    this.pathResolver = new ProjectMediaLibraryContentPathResolver(options);
  }

  async stat(
    locator: MediaLibraryContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentStat> {
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    const resolved = await this.pathResolver.resolve(locator);
    if (!resolved.ok) return unavailable(locator, resolved.code);

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(resolved.filePath, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) return unavailable(locator, 'content-unsupported');
      const fingerprint = await fingerprintForHandle(
        handle,
        stat.size,
        stat.mtimeMs,
        options.expectedFingerprint ?? locator.fingerprint,
        options.signal,
      );
      if (!fingerprint) return unavailable(locator, 'content-unsupported');
      return {
        status: 'ready',
        locator,
        byteLength: stat.size,
        fingerprint,
        modifiedAt: new Date(stat.mtimeMs).toISOString(),
        ...(mimeTypeForPath(locator.relativePath)
          ? { mimeType: mimeTypeForPath(locator.relativePath) }
          : {}),
      };
    } catch (error) {
      return fileSystemDiagnostic(locator, error);
    } finally {
      await handle?.close();
    }
  }

  async read(
    locator: MediaLibraryContentLocator,
    options: ContentReadOptions,
  ): Promise<ContentBytes> {
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    const resolved = await this.pathResolver.resolve(locator);
    if (!resolved.ok) return unavailable(locator, resolved.code);

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(resolved.filePath, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) return unavailable(locator, 'content-unsupported');
      const range = resolveRange(stat.size, options, this.defaultMaxBytes);
      if (!range.ok) return unavailable(locator, range.code);
      const fingerprint = await fingerprintForHandle(
        handle,
        stat.size,
        stat.mtimeMs,
        options.expectedFingerprint ?? locator.fingerprint,
        options.signal,
      );
      if (!fingerprint) return unavailable(locator, 'content-unsupported');
      const bytes = await readRange(handle, range.offset, range.length, options.signal);
      return {
        status: 'ready',
        locator,
        bytes,
        offset: range.offset,
        totalByteLength: stat.size,
        fingerprint,
        ...(mimeTypeForPath(locator.relativePath)
          ? { mimeType: mimeTypeForPath(locator.relativePath) }
          : {}),
      };
    } catch (error) {
      return fileSystemDiagnostic(locator, error);
    } finally {
      await handle?.close();
    }
  }
}

function resolveRange(
  byteLength: number,
  options: ContentReadOptions,
  defaultMaxBytes: number,
):
  | { readonly ok: true; readonly offset: number; readonly length: number }
  | { readonly ok: false; readonly code: 'content-range-invalid' | 'content-too-large' } {
  const offset = options.range?.offset ?? 0;
  if (offset > byteLength) return { ok: false, code: 'content-range-invalid' };
  const length = Math.min(options.range?.length ?? byteLength, byteLength - offset);
  if (length > (options.maxBytes ?? defaultMaxBytes)) {
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
    const { bytesRead } = await handle.read(
      buffer,
      0,
      Math.min(buffer.byteLength, byteLength - position),
      position,
    );
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
  const bytes = new Uint8Array(length);
  let total = 0;
  while (total < length) {
    if (signal?.aborted) throw abortError();
    const result = await handle.read(bytes, total, length - total, offset + total);
    if (result.bytesRead === 0) break;
    total += result.bytesRead;
  }
  return total === bytes.byteLength ? bytes : bytes.slice(0, total);
}

function fileSystemDiagnostic(
  locator: MediaLibraryContentLocator,
  error: unknown,
): Extract<ContentStat, { status: 'unavailable' }> {
  if (error instanceof Error && error.name === 'AbortError') {
    return unavailable(locator, 'content-cancelled');
  }
  if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
    return unavailable(locator, 'content-missing');
  }
  if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
    return unavailable(locator, 'content-unauthorized');
  }
  return unavailable(locator, 'content-read-failed');
}

function unavailable(
  locator: MediaLibraryContentLocator,
  code: ContentIoDiagnosticCode,
): Extract<ContentStat, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}

function abortError(): Error {
  const error = new Error('Content read cancelled.');
  error.name = 'AbortError';
  return error;
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
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
