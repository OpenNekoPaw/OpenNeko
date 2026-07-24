import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, open, rename, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  ContentIoContractError,
  isAuthorizedWorkspaceWriteOptions,
  type AuthorizedWorkspaceWriteOptions,
  type AuthorizedWorkspaceWriteResult,
  type AuthorizedWorkspaceWriter,
  type AuthorizedOutputAllocationRequest,
  type AuthorizedOutputAllocationResult,
  type AuthorizedOutputAllocator,
  type ContentIoDiagnosticCode,
  isAuthorizedOutputAllocationRequest,
} from '../../types/content-io';
import {
  normalizeWorkspaceContentPath,
  type ContentFingerprint,
  type WorkspaceFileContentLocator,
} from '../../types/content-locator';
import {
  authorizeWorkspaceLinkedPath,
  type AuthorizeWorkspaceLinkedPathInput,
  type WorkspaceLinkedPathGuardResult,
} from './workspace-linked-path-guard';

export interface NodeAuthorizedWorkspaceWriterOptions {
  readonly workspaceRoot: string;
  readonly defaultMaxBytes?: number;
  readonly authorize?: (
    input: AuthorizeWorkspaceLinkedPathInput,
  ) => Promise<WorkspaceLinkedPathGuardResult>;
}

export interface NodeAuthorizedOutputAllocatorOptions {
  readonly outputDirectory: string;
}

export class NodeAuthorizedOutputAllocator implements AuthorizedOutputAllocator {
  private readonly outputDirectory: string;

  constructor(options: NodeAuthorizedOutputAllocatorOptions) {
    const outputDirectory = normalizeWorkspaceContentPath(options.outputDirectory);
    if (!outputDirectory || outputDirectory !== options.outputDirectory) {
      throw new Error('Output allocator requires a normalized workspace-relative directory.');
    }
    this.outputDirectory = outputDirectory;
  }

  async allocate(
    request: AuthorizedOutputAllocationRequest,
  ): Promise<AuthorizedOutputAllocationResult> {
    if (!isAuthorizedOutputAllocationRequest(request)) {
      throw new ContentIoContractError(
        'invalid-content-allocation-request',
        'Output allocation request is invalid.',
      );
    }
    if (request.signal?.aborted) {
      return { status: 'unavailable', diagnostic: { code: 'content-cancelled' } };
    }
    const fileName = createAllocatedFileName(request);
    return {
      status: 'allocated',
      locator: {
        kind: 'workspace-file',
        path: `${this.outputDirectory}/${fileName}`,
      },
    };
  }
}

export class NodeAuthorizedWorkspaceWriter implements AuthorizedWorkspaceWriter {
  private readonly defaultMaxBytes: number;

  constructor(private readonly options: NodeAuthorizedWorkspaceWriterOptions) {
    if (!path.isAbsolute(options.workspaceRoot)) {
      throw new Error('Workspace content writer requires an absolute Host workspace root.');
    }
    this.defaultMaxBytes = options.defaultMaxBytes ?? 64 * 1024 * 1024;
    if (!Number.isInteger(this.defaultMaxBytes) || this.defaultMaxBytes <= 0) {
      throw new Error('Workspace content writer defaultMaxBytes must be a positive integer.');
    }
  }

  async write(
    locator: WorkspaceFileContentLocator,
    bytes: Uint8Array,
    options: AuthorizedWorkspaceWriteOptions,
  ): Promise<AuthorizedWorkspaceWriteResult> {
    if (!isAuthorizedWorkspaceWriteOptions(options)) {
      throw new ContentIoContractError(
        'invalid-content-write-options',
        'Workspace content write options are invalid.',
      );
    }
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    if (normalizeWorkspaceContentPath(locator.path) !== locator.path) {
      return unavailable(locator, 'content-unauthorized');
    }
    const maxBytes = options.maxBytes ?? this.defaultMaxBytes;
    if (bytes.byteLength > maxBytes) return unavailable(locator, 'content-too-large');

    const targetPath = path.join(this.options.workspaceRoot, ...locator.path.split('/'));
    let targetState: TargetState;
    try {
      targetState = await inspectTarget(targetPath);
    } catch (error) {
      return unavailable(locator, writeDiagnostic(error));
    }
    if (targetState === 'unsupported') return unavailable(locator, 'content-unauthorized');
    const authorizationPath = targetState === 'missing' ? path.dirname(targetPath) : targetPath;
    const authorization = await (this.options.authorize ?? authorizeWorkspaceLinkedPath)({
      workspaceRoot: this.options.workspaceRoot,
      requestedPath: authorizationPath,
    });
    if (!authorization.authorized) {
      return unavailable(locator, guardDiagnosticCode(authorization.diagnostic.code));
    }

    if (options.expectedFingerprint) {
      if (targetState === 'missing') return unavailable(locator, 'content-changed');
      let actual: ContentFingerprint | undefined;
      try {
        actual = await fingerprintForPath(targetPath, options.expectedFingerprint.strategy);
      } catch (error) {
        return unavailable(locator, writeDiagnostic(error));
      }
      if (!actual || actual.value !== options.expectedFingerprint.value) {
        return unavailable(locator, 'content-changed');
      }
    }
    if (options.conflict === 'fail-if-exists' && targetState === 'file') {
      return unavailable(locator, 'content-conflict');
    }

    const temporaryPath = path.join(
      path.dirname(targetPath),
      `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
    );
    try {
      await writeTemporaryFile(temporaryPath, bytes, options.signal);
      if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
      if (options.conflict === 'fail-if-exists') {
        await link(temporaryPath, targetPath);
        await rm(temporaryPath);
      } else {
        await rename(temporaryPath, targetPath);
      }
      const written = await stat(targetPath);
      return {
        status: 'written',
        locator,
        byteLength: written.size,
        fingerprint: { strategy: 'mtime-size', value: `${written.mtimeMs}:${written.size}` },
      };
    } catch (error) {
      return unavailable(locator, writeDiagnostic(error));
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

type TargetState = 'missing' | 'file' | 'unsupported';

async function inspectTarget(filePath: string): Promise<TargetState> {
  try {
    const target = await lstat(filePath);
    return target.isFile() && !target.isSymbolicLink() ? 'file' : 'unsupported';
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return 'missing';
    throw error;
  }
}

async function writeTemporaryFile(
  filePath: string,
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
): Promise<void> {
  const handle = await open(filePath, 'wx', 0o600);
  try {
    if (signal?.aborted) throw abortError();
    await handle.writeFile(bytes);
    if (signal?.aborted) throw abortError();
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fingerprintForPath(
  filePath: string,
  strategy: ContentFingerprint['strategy'],
): Promise<ContentFingerprint | undefined> {
  const fileStat = await stat(filePath);
  if (strategy === 'mtime-size') {
    return { strategy, value: `${fileStat.mtimeMs}:${fileStat.size}` };
  }
  if (strategy === 'provider') return undefined;
  const handle = await open(filePath, 'r');
  try {
    const hash = createHash('sha256');
    const buffer = new Uint8Array(64 * 1024);
    let position = 0;
    while (position < fileStat.size) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return { strategy, value: `sha256:${hash.digest('hex')}` };
  } finally {
    await handle.close();
  }
}

function guardDiagnosticCode(
  code: import('./workspace-linked-path-guard').WorkspaceLinkedPathGuardDiagnosticCode,
): ContentIoDiagnosticCode {
  return code === 'workspace-path-unavailable' || code === 'library-link-broken'
    ? 'content-missing'
    : 'content-unauthorized';
}

function writeDiagnostic(error: unknown): ContentIoDiagnosticCode {
  if (error instanceof Error && error.name === 'AbortError') return 'content-cancelled';
  if (isNodeError(error, 'EEXIST')) return 'content-conflict';
  if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
    return 'content-unauthorized';
  }
  if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) return 'content-missing';
  return 'content-write-failed';
}

function unavailable(
  locator: WorkspaceFileContentLocator,
  code: ContentIoDiagnosticCode,
): Extract<AuthorizedWorkspaceWriteResult, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

function abortError(): Error {
  const error = new Error('Workspace content write was cancelled.');
  error.name = 'AbortError';
  return error;
}

function createAllocatedFileName(request: AuthorizedOutputAllocationRequest): string {
  const hintedBase = request.fileNameHint ? path.basename(request.fileNameHint) : 'output';
  const hintedExtension = path.extname(hintedBase).toLowerCase();
  const extension = hintedExtension || extensionForMediaType(request.mediaType);
  const stem = (hintedExtension ? hintedBase.slice(0, -hintedExtension.length) : hintedBase)
    .normalize('NFC')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64);
  return `${stem || 'output'}-${randomUUID()}${extension}`;
}

function extensionForMediaType(mediaType: string | undefined): string {
  switch (mediaType?.toLowerCase()) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'audio/wav':
      return '.wav';
    case 'video/mp4':
      return '.mp4';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}
