import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  ContentIoContractError,
  isAuthorizedWorkspaceWriteOptions,
  type AuthorizedWorkspaceWriteOptions,
  type AuthorizedWorkspaceWriteResult,
  type AuthorizedWorkspaceWriter,
  type ContentIoDiagnosticCode,
} from '../contracts';
import {
  normalizeWorkspaceContentPath,
  type ContentFingerprint,
  type WorkspaceFileContentLocator,
} from '../contracts';
import {
  authorizeWorkspaceContainedPath,
  type AuthorizeWorkspacePathInput,
  type WorkspacePathGuardResult,
} from './workspace-path-guard';

export interface NodeAuthorizedWorkspaceWriterOptions {
  readonly workspaceRoot: string;
  readonly defaultMaxBytes?: number;
  readonly authorize?: (input: AuthorizeWorkspacePathInput) => Promise<WorkspacePathGuardResult>;
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
    if (normalizeWorkspaceContentPath(locator.file.path) !== locator.file.path) {
      return unavailable(locator, 'content-unauthorized');
    }
    const maxBytes = options.maxBytes ?? this.defaultMaxBytes;
    if (bytes.byteLength > maxBytes) return unavailable(locator, 'content-too-large');

    const targetPath = path.join(this.options.workspaceRoot, ...locator.file.path.split('/'));
    const parentAuthorization = await this.authorizeParent(targetPath);
    if (!parentAuthorization.authorized) {
      return unavailable(locator, guardDiagnosticCode(parentAuthorization.diagnostic.code));
    }
    try {
      await mkdir(path.dirname(targetPath), { recursive: true });
    } catch (error) {
      return unavailable(locator, writeDiagnostic(error));
    }
    const createdParentAuthorization = await (
      this.options.authorize ?? authorizeWorkspaceContainedPath
    )({
      workspaceRoot: this.options.workspaceRoot,
      requestedPath: path.dirname(targetPath),
    });
    if (!createdParentAuthorization.authorized) {
      return unavailable(locator, guardDiagnosticCode(createdParentAuthorization.diagnostic.code));
    }

    const lockPath = path.join(
      path.dirname(targetPath),
      `.${path.basename(targetPath)}.write-lock`,
    );
    let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      lockHandle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      return unavailable(locator, writeDiagnostic(error));
    }

    try {
      return await this.writeLocked(locator, targetPath, bytes, options);
    } finally {
      try {
        await closeLock(lockHandle);
      } finally {
        await rm(lockPath, { force: true });
      }
    }
  }

  private async writeLocked(
    locator: WorkspaceFileContentLocator,
    targetPath: string,
    bytes: Uint8Array,
    options: AuthorizedWorkspaceWriteOptions,
  ): Promise<AuthorizedWorkspaceWriteResult> {
    let targetState: TargetState;
    try {
      targetState = await inspectTarget(targetPath);
    } catch (error) {
      return unavailable(locator, writeDiagnostic(error));
    }
    if (targetState === 'unsupported') return unavailable(locator, 'content-unauthorized');
    const authorizationPath = targetState === 'missing' ? path.dirname(targetPath) : targetPath;
    const authorization = await (this.options.authorize ?? authorizeWorkspaceContainedPath)({
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
        if (options.expectedFingerprint) {
          const current = await fingerprintForPath(
            targetPath,
            options.expectedFingerprint.strategy,
          );
          if (!current || current.value !== options.expectedFingerprint.value) {
            return unavailable(locator, 'content-changed');
          }
        }
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

  private async authorizeParent(targetPath: string): Promise<WorkspacePathGuardResult> {
    let candidate = path.dirname(targetPath);
    while (true) {
      try {
        await lstat(candidate);
        return (this.options.authorize ?? authorizeWorkspaceContainedPath)({
          workspaceRoot: this.options.workspaceRoot,
          requestedPath: candidate,
        });
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) {
          return {
            authorized: false,
            diagnostic: {
              code: 'workspace-path-unavailable',
              message: 'Workspace content parent cannot be inspected.',
            },
          };
        }
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        return {
          authorized: false,
          diagnostic: {
            code: 'invalid-workspace-path',
            message: 'Workspace content parent is outside the workspace.',
          },
        };
      }
      candidate = parent;
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
  code: import('./workspace-path-guard').WorkspacePathGuardDiagnosticCode,
): ContentIoDiagnosticCode {
  return code === 'workspace-path-unavailable' ? 'content-missing' : 'content-unauthorized';
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

async function closeLock(handle: Awaited<ReturnType<typeof open>> | undefined): Promise<void> {
  if (!handle) return;
  await handle.close();
}
