import {
  ProjectCacheSearchService,
  buildProjectSearchText,
  createProjectSearchHeadlessCapabilityProvider,
  createSearchProjectionAdapter,
  type AssetSearchProjection,
} from '@neko/search';
import { isDocumentFile, type AgentCapabilityProvider, type MediaFileType } from '@neko/shared';
import type { MediaLibrarySearchService } from './MediaLibrarySearchService';

export interface MediaLibraryAgentCapabilityRuntime {
  readonly provider: AgentCapabilityProvider;
  dispose(): void;
}

export function createMediaLibraryAgentCapabilityRuntime(input: {
  readonly searchService: Pick<MediaLibrarySearchService, 'search'>;
  readonly projectRoot: string;
}): MediaLibraryAgentCapabilityRuntime {
  const runtime = ProjectCacheSearchService.create({
    resolveContext: async () => ({ projectRoot: input.projectRoot }),
    getWorkspaceRoots: () => [input.projectRoot],
  });
  runtime.registerAdapter(
    createSearchProjectionAdapter<AssetSearchProjection>({
      partition: 'media-library',
      providerId: 'vscode-media-library-files',
      itemKind: (projection) => (isDocumentFile(projection.filePath ?? '') ? 'document' : 'media'),
      load: async (query) => {
        const results = await input.searchService.search(query.text, {
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
          ...(query.mediaTypes ? { types: query.mediaTypes.filter(isMediaFileType) } : {}),
        });
        return results.map((result): AssetSearchProjection => ({
          id: `workspace-file:${result.locator.path}`,
          kind: isDocumentFile(result.locator.path) ? 'document' : 'media',
          label: result.fileName,
          description: `Media Library / ${result.libraryName}`,
          projectRoot: input.projectRoot,
          source: {
            partition: 'media-library',
            sourceId: result.libraryName,
            sourceKind: 'workspace-file',
            refId: `workspace-file:${result.locator.path}`,
            filePath: result.locator.path,
            projectRelativePath: result.locator.path,
          },
          searchText: buildProjectSearchText([
            result.fileName,
            result.locator.path,
            result.libraryName,
            result.mediaType,
            'media library',
          ]),
          filePath: result.locator.path,
          navigationData: {
            kind: result.locator.kind,
            relativePath: result.locator.path,
          },
          metadata: {
            libraryName: result.libraryName,
            mediaType: result.mediaType,
          },
        }));
      },
      capabilities: {
        providerId: 'vscode-media-library-files',
        modes: ['mention', 'global', 'media-picker', 'agent-tool'],
        itemKinds: ['media', 'document'],
        partitions: ['media-library'],
      },
    }),
  );
  return {
    provider: createProjectSearchHeadlessCapabilityProvider(runtime),
    dispose: () => runtime.dispose(),
  };
}

function isMediaFileType(value: string): value is MediaFileType {
  return ['video', 'audio', 'image', 'sequence', 'document', 'text', 'model'].includes(value);
}
