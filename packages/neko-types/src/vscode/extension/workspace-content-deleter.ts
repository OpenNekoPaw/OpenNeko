import { createHash } from 'node:crypto';
import { lstat, open, rm, stat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  ContentIoContractError,
  isAuthorizedWorkspaceDeleteOptions,
  type AuthorizedWorkspaceDeleter,
  type AuthorizedWorkspaceDeleteOptions,
  type AuthorizedWorkspaceDeleteResult,
  type ContentIoDiagnosticCode,
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

export interface NodeAuthorizedWorkspaceDeleterOptions {
  readonly workspaceRoot: string;
  readonly authorize?: (
    input: AuthorizeWorkspaceLinkedPathInput,
  ) => Promise<WorkspaceLinkedPathGuardResult>;
}

export class NodeAuthorizedWorkspaceDeleter implements AuthorizedWorkspaceDeleter {
  constructor(private readonly options: NodeAuthorizedWorkspaceDeleterOptions) {
    if (!path.isAbsolute(options.workspaceRoot)) {
      throw new Error('Workspace content deleter requires an absolute Host workspace root.');
    }
  }

  async delete(
    locator: WorkspaceFileContentLocator,
    options: AuthorizedWorkspaceDeleteOptions,
  ): Promise<AuthorizedWorkspaceDeleteResult> {
    if (!isAuthorizedWorkspaceDeleteOptions(options)) {
      throw new ContentIoContractError(
        'invalid-content-delete-options',
        'Workspace content delete options are invalid.',
      );
    }
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');
    if (normalizeWorkspaceContentPath(locator.path) !== locator.path) {
      return unavailable(locator, 'content-unauthorized');
    }

    const targetPath = path.join(this.options.workspaceRoot, ...locator.path.split('/'));
    try {
      const target = await lstat(targetPath);
      if (!target.isFile() || target.isSymbolicLink()) {
        return unavailable(locator, 'content-unauthorized');
      }
    } catch (error) {
      return unavailable(locator, deleteDiagnostic(error));
    }

    const authorization = await (this.options.authorize ?? authorizeWorkspaceLinkedPath)({
      workspaceRoot: this.options.workspaceRoot,
      requestedPath: targetPath,
    });
    if (!authorization.authorized) {
      return unavailable(locator, guardDiagnosticCode(authorization.diagnostic.code));
    }

    let actual: ContentFingerprint | undefined;
    try {
      actual = await fingerprintForPath(targetPath, options.expectedFingerprint.strategy);
    } catch (error) {
      return unavailable(locator, deleteDiagnostic(error));
    }
    if (!actual || actual.value !== options.expectedFingerprint.value) {
      return unavailable(locator, 'content-changed');
    }
    if (options.signal?.aborted) return unavailable(locator, 'content-cancelled');

    try {
      await rm(targetPath);
      return { status: 'deleted', locator };
    } catch (error) {
      return unavailable(locator, deleteDiagnostic(error));
    }
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

function deleteDiagnostic(error: unknown): ContentIoDiagnosticCode {
  if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
    return 'content-unauthorized';
  }
  if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) return 'content-missing';
  return 'content-write-failed';
}

function unavailable(
  locator: WorkspaceFileContentLocator,
  code: ContentIoDiagnosticCode,
): Extract<AuthorizedWorkspaceDeleteResult, { status: 'unavailable' }> {
  return { status: 'unavailable', locator, diagnostic: { code } };
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}
