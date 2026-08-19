import { lstat, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { ContentIoDiagnosticCode, WorkspaceFileContentLocator } from '@neko/content';
import { authorizeWorkspaceContainedPath } from '@neko/content/node';
import { workspaceLinkedMediaLibraryPath } from '@neko/assets-domain/contracts';
import type { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import { resolveGlobalMediaLibraryTarget } from './global-media-library-files';

export interface WorkspaceMediaLibraryPath {
  readonly libraryName: string;
  readonly relativePath: string;
}

export function parseWorkspaceMediaLibraryPath(
  value: string,
): WorkspaceMediaLibraryPath | undefined {
  const segments = value.split('/');
  if (segments[0] !== 'neko' || segments[1] !== 'assets' || segments.length < 4) return undefined;
  const libraryName = segments[2];
  const relativePath = segments.slice(3).join('/');
  if (!libraryName || !relativePath) return undefined;
  return { libraryName, relativePath };
}

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

export interface ProjectMediaLibraryContentPathResolverOptions {
  readonly bindings: Pick<ProjectMediaLibraryBindingRepository, 'read'>;
  readonly connections: ProjectMediaLibraryConnectionResolver;
  readonly workspaceRoot: string;
  readonly initialize?: () => Promise<void>;
}

export type ProjectMediaLibraryContentPathResolution =
  | { readonly ok: true; readonly filePath: string }
  | { readonly ok: false; readonly code: ContentIoDiagnosticCode };

export class ProjectMediaLibraryContentPathResolver {
  constructor(private readonly options: ProjectMediaLibraryContentPathResolverOptions) {}

  async resolve(
    locator: WorkspaceFileContentLocator,
  ): Promise<ProjectMediaLibraryContentPathResolution> {
    const parsed = parseWorkspaceMediaLibraryPath(locator.file.path);
    if (!parsed) return { ok: false, code: 'content-unauthorized' };
    const root = await this.resolveLibraryRoot(parsed.libraryName);
    if (!root.ok) return root;

    try {
      const candidate = path.resolve(root.filePath, ...parsed.relativePath.split('/'));
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

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
}
