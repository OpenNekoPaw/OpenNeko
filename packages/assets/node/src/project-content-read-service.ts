import type {
  ContentReadService,
  MediaLibraryContentLocator,
  WorkspaceFileContentLocator,
} from '@neko/content';
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
  ProjectMediaLibraryContentPathResolver,
  ProjectMediaLibraryContentReadHandler,
} from './project-media-library-content-handler';
import { initializeProjectMediaLibraryBindings } from './project-media-library-initialization';

export interface ProjectContentReadContext {
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly globalMediaLibraryRoot: string;
}

export type CreateProjectContentReadServiceOptions = ProjectContentReadContext &
  Omit<
    CreateNodeHostContentReadServiceOptions,
    | 'workspaceRoot'
    | 'workspacePathAuthorizer'
    | 'mediaLibraryHandler'
    | 'documentEntryMediaSourcePathResolver'
  >;

export function createProjectContentReadService(
  options: CreateProjectContentReadServiceOptions,
): ContentReadService {
  const mediaLibraryHandler = createProjectMediaLibraryContentReadHandler(options);
  const mediaLibraryPathResolver = createProjectMediaLibraryContentPathResolver(options);
  return createNodeHostContentReadService({
    workspaceRoot: options.workspaceRoot,
    workspacePathAuthorizer: (input) => authorizeProjectWorkspaceContentPath(options, input),
    mediaLibraryHandler,
    documentEntryMediaSourcePathResolver: mediaLibraryPathResolver,
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
  const media = mediaLocatorFromWorkspacePath(locator.path, locator.fingerprint);
  if (media) return resolveProjectMediaLibraryContentPath(context, media);
  const requestedPath = path.join(context.workspaceRoot, ...locator.path.split('/'));
  const authorization = await authorizeWorkspaceContainedPath({
    workspaceRoot: context.workspaceRoot,
    requestedPath,
  });
  if (!authorization.authorized) {
    throw new Error(`Workspace content is unavailable: ${authorization.diagnostic.code}.`);
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
  const media = mediaLocatorFromWorkspacePath(portable);
  if (!media) return authorizeWorkspaceContainedPath(input);
  const resolved = await createProjectMediaLibraryContentPathResolver(context).resolve(media);
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

export function projectMediaLibraryWorkspaceLocator(
  locator: MediaLibraryContentLocator,
): WorkspaceFileContentLocator {
  return {
    kind: 'workspace-file',
    path: `neko/assets/${locator.libraryName}/${locator.relativePath}`,
    ...(locator.fingerprint ? { fingerprint: locator.fingerprint } : {}),
  };
}

function mediaLocatorFromWorkspacePath(
  pathValue: string,
  fingerprint?: WorkspaceFileContentLocator['fingerprint'],
): MediaLibraryContentLocator | undefined {
  const segments = pathValue.split('/');
  if (segments[0] !== 'neko' || segments[1] !== 'assets' || segments.length < 4) return undefined;
  const libraryName = segments[2];
  const relativePath = segments.slice(3).join('/');
  if (!libraryName || !relativePath) return undefined;
  return {
    kind: 'media-library',
    libraryName,
    relativePath,
    ...(fingerprint ? { fingerprint } : {}),
  };
}

export async function resolveProjectMediaLibraryContentPath(
  context: ProjectContentReadContext,
  locator: MediaLibraryContentLocator,
): Promise<string> {
  const resolved = await createProjectMediaLibraryContentPathResolver(context).resolve(locator);
  if (!resolved.ok) {
    throw new Error(`Media Library content is unavailable: ${resolved.code}.`);
  }
  return resolved.filePath;
}

function createProjectMediaLibraryContentReadHandler(
  context: ProjectContentReadContext,
): ProjectMediaLibraryContentReadHandler {
  return new ProjectMediaLibraryContentReadHandler({
    bindings: new ProjectMediaLibraryBindingRepository(context.workspaceRoot, context.projectId),
    connections: createGlobalProjectMediaLibraryConnectionResolver(context.globalMediaLibraryRoot),
    workspaceRoot: context.workspaceRoot,
    initialize: () => initializeProjectMediaLibraryBindings(context).then(() => undefined),
  });
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
