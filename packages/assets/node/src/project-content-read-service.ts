import type { ContentReadService, MediaLibraryContentLocator } from '@neko/content';
import {
  createNodeHostContentReadService,
  type CreateNodeHostContentReadServiceOptions,
} from '@neko/content/node';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import {
  createGlobalProjectMediaLibraryConnectionResolver,
  ProjectMediaLibraryContentPathResolver,
  ProjectMediaLibraryContentReadHandler,
} from './project-media-library-content-handler';

export interface ProjectContentReadContext {
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly globalMediaLibraryRoot: string;
}

export type CreateProjectContentReadServiceOptions = ProjectContentReadContext &
  Omit<
    CreateNodeHostContentReadServiceOptions,
    'workspaceRoot' | 'mediaLibraryHandler' | 'documentEntryMediaSourcePathResolver'
  >;

export function createProjectContentReadService(
  options: CreateProjectContentReadServiceOptions,
): ContentReadService {
  const mediaLibraryHandler = createProjectMediaLibraryContentReadHandler(options);
  const mediaLibraryPathResolver = createProjectMediaLibraryContentPathResolver(options);
  return createNodeHostContentReadService({
    workspaceRoot: options.workspaceRoot,
    mediaLibraryHandler,
    documentEntryMediaSourcePathResolver: mediaLibraryPathResolver,
    ...(options.documentEntryReader ? { documentEntryReader: options.documentEntryReader } : {}),
    ...(options.packageResourceHandler
      ? { packageResourceHandler: options.packageResourceHandler }
      : {}),
    ...(options.defaultMaxBytes !== undefined ? { defaultMaxBytes: options.defaultMaxBytes } : {}),
  });
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
  });
}

function createProjectMediaLibraryContentPathResolver(
  context: ProjectContentReadContext,
): ProjectMediaLibraryContentPathResolver {
  return new ProjectMediaLibraryContentPathResolver({
    bindings: new ProjectMediaLibraryBindingRepository(context.workspaceRoot, context.projectId),
    connections: createGlobalProjectMediaLibraryConnectionResolver(context.globalMediaLibraryRoot),
  });
}
