import type { ContentReadService, WorkspaceFileContentLocator } from '@neko/content';
import {
  authorizeWorkspaceContainedPath,
  createNodeHostContentReadService,
  type AuthorizeWorkspacePathInput,
  type CreateNodeHostContentReadServiceOptions,
  type WorkspacePathGuardResult,
} from '@neko/content/node';
import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import {
  createGlobalProjectMediaLibraryConnectionResolver,
  parseWorkspaceMediaLibraryPath,
  ProjectMediaLibraryContentPathResolver,
} from './project-media-library-content-handler';
import { initializeProjectMediaLibraryBindings } from './project-media-library-initialization';

export interface ProjectContentReadContext {
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly globalMediaLibraryRoot: string;
}

export type CreateProjectContentReadServiceOptions = ProjectContentReadContext &
  Omit<CreateNodeHostContentReadServiceOptions, 'workspaceRoot' | 'workspacePathAuthorizer'>;

export function createProjectContentReadService(
  options: CreateProjectContentReadServiceOptions,
): ContentReadService {
  return createNodeHostContentReadService({
    workspaceRoot: options.workspaceRoot,
    workspacePathAuthorizer: (input) => authorizeProjectWorkspaceContentPath(options, input),
    ...(options.documentEntryReader ? { documentEntryReader: options.documentEntryReader } : {}),
    ...(options.packageResourceHandler
      ? { packageResourceHandler: options.packageResourceHandler }
      : {}),
    ...(options.defaultMaxBytes !== undefined ? { defaultMaxBytes: options.defaultMaxBytes } : {}),
  });
}

export async function resolveProjectWorkspaceContentLocator(
  context: ProjectContentReadContext,
  locator: WorkspaceFileContentLocator,
): Promise<string> {
  if (parseWorkspaceMediaLibraryPath(locator.file.path)) {
    return resolveProjectMediaLibraryContentPath(context, locator);
  }
  const requestedPath = path.join(context.workspaceRoot, ...locator.file.path.split('/'));
  const authorization = await authorizeWorkspaceContainedPath({
    workspaceRoot: context.workspaceRoot,
    requestedPath,
  });
  if (!authorization.authorized) {
    const error = new Error(`Workspace content is unavailable: ${authorization.diagnostic.code}.`);
    Object.assign(error, { code: authorization.diagnostic.code });
    throw error;
  }
  return realpath(requestedPath);
}

export async function authorizeProjectWorkspaceContentPath(
  context: ProjectContentReadContext,
  input: AuthorizeWorkspacePathInput,
): Promise<WorkspacePathGuardResult> {
  const relative = path.relative(
    path.resolve(context.workspaceRoot),
    path.resolve(input.requestedPath),
  );
  const portable = relative.split(path.sep).join('/');
  const media = parseWorkspaceMediaLibraryPath(portable);
  if (!media) return authorizeWorkspaceContainedPath(input);
  const resolved = await createProjectMediaLibraryContentPathResolver(context).resolve({
    file: { authority: 'workspace', path: portable },
  });
  return resolved.ok
    ? { authorized: true }
    : {
        authorized: false,
        diagnostic: {
          code: resolved.code === 'content-missing' ? 'library-link-broken' : 'unmanaged-symlink',
          message: 'Media library Workspace path is not authorized by its exact project binding.',
          workspacePath: portable,
          libraryName: media.libraryName,
        },
      };
}

export async function resolveProjectMediaLibraryContentPath(
  context: ProjectContentReadContext,
  locator: WorkspaceFileContentLocator,
): Promise<string> {
  const resolved = await createProjectMediaLibraryContentPathResolver(context).resolve(locator);
  if (!resolved.ok) {
    const error = new Error(`Media Library content is unavailable: ${resolved.code}.`);
    Object.assign(error, { code: resolved.code });
    throw error;
  }
  return resolved.filePath;
}

function createProjectMediaLibraryContentPathResolver(
  context: ProjectContentReadContext,
): ProjectMediaLibraryContentPathResolver {
  return new ProjectMediaLibraryContentPathResolver({
    bindings: new ProjectMediaLibraryBindingRepository(context.workspaceRoot, context.projectId),
    connections: createGlobalProjectMediaLibraryConnectionResolver(context.globalMediaLibraryRoot),
    workspaceRoot: context.workspaceRoot,
    initialize: () => initializeProjectMediaLibraryBindings(context).then(() => undefined),
  });
}

export async function resolveProjectMediaLibraryRootPath(
  context: ProjectContentReadContext,
  libraryName: string,
): Promise<string> {
  const resolved =
    await createProjectMediaLibraryContentPathResolver(context).resolveLibraryRoot(libraryName);
  if (!resolved.ok) {
    throw new Error(`Media Library root is unavailable: ${resolved.code}.`);
  }
  return resolved.filePath;
}
