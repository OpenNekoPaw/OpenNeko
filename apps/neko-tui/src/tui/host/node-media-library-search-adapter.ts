import type { NekoHostPorts } from '@neko/host';
import {
  buildProjectSearchText,
  createSearchProjectionAdapter,
  type AssetSearchProjection,
} from '@neko/search';
import { detectMediaType, isDocumentFile, isMediaFile } from '@neko/shared';

const MAX_PROJECTED_FILES = 5_000;

export function createNodeMediaLibrarySearchAdapter(host: NekoHostPorts) {
  return createSearchProjectionAdapter<AssetSearchProjection>({
    partition: 'media-library',
    providerId: 'tui-media-library-files',
    itemKind: (projection) => (isDocumentFile(projection.filePath ?? '') ? 'document' : 'media'),
    load: async (_query, context) => {
      if (!context.projectRoot) return [];
      const policy = await host.contentPolicy?.getSnapshot();
      if (!policy) {
        throw new Error('TUI Media Library search requires the Host content policy.');
      }

      const projections: AssetSearchProjection[] = [];
      for (const library of policy.mediaLibraries) {
        if (library.availability !== 'available') continue;
        const absoluteRoot = host.paths.join(
          context.projectRoot,
          ...library.workspacePath.split('/'),
        );
        await collectLibraryFiles({
          host,
          projectRoot: context.projectRoot,
          libraryName: library.name,
          workspaceDirectory: library.workspacePath,
          absoluteDirectory: absoluteRoot,
          projections,
        });
        if (projections.length >= MAX_PROJECTED_FILES) break;
      }
      return projections;
    },
    capabilities: {
      providerId: 'tui-media-library-files',
      modes: ['mention', 'global', 'media-picker', 'agent-tool'],
      itemKinds: ['media', 'document'],
      partitions: ['media-library'],
    },
  });
}

async function collectLibraryFiles(input: {
  readonly host: NekoHostPorts;
  readonly projectRoot: string;
  readonly libraryName: string;
  readonly workspaceDirectory: string;
  readonly absoluteDirectory: string;
  readonly projections: AssetSearchProjection[];
}): Promise<void> {
  if (input.projections.length >= MAX_PROJECTED_FILES) return;
  const entries = await input.host.files.readDirectory(input.absoluteDirectory);
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (input.projections.length >= MAX_PROJECTED_FILES) return;
    const workspacePath = `${input.workspaceDirectory}/${entry.name}`;
    const absolutePath = input.host.paths.join(input.absoluteDirectory, entry.name);
    if (entry.type === 'directory') {
      await collectLibraryFiles({
        ...input,
        workspaceDirectory: workspacePath,
        absoluteDirectory: absolutePath,
      });
      continue;
    }
    if (entry.type !== 'file' || (!isMediaFile(entry.name) && !isDocumentFile(entry.name))) {
      continue;
    }

    const mediaType = detectMediaType(workspacePath);
    input.projections.push({
      id: `workspace-file:${workspacePath}`,
      kind: isDocumentFile(workspacePath) ? 'document' : 'media',
      label: entry.name,
      projectRoot: input.projectRoot,
      source: {
        partition: 'media-library',
        sourceId: input.libraryName,
        sourceKind: 'workspace-file',
        refId: `workspace-file:${workspacePath}`,
        filePath: workspacePath,
        projectRelativePath: workspacePath,
      },
      searchText: buildProjectSearchText([
        entry.name,
        workspacePath,
        input.libraryName,
        mediaType,
        'media library',
      ]),
      description: `Media Library / ${input.libraryName}`,
      filePath: workspacePath,
      navigationData: {
        kind: 'workspace-file',
        relativePath: workspacePath,
      },
      metadata: {
        libraryName: input.libraryName,
        mediaType,
        fileType: extensionOf(entry.name),
      },
    });
  }
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}
