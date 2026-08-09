import type { ResourceBrowserContentEntry } from '@neko/assets-domain/resource-browser/ports';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  searchWorkspaceContentEntries,
  searchWorkspaceLinkedMediaLibraryContentEntries,
} from '@neko/assets-node';
import { readProjectEntityResources } from '@neko/entity-node';
import type { NekoHostPorts } from '@neko/host/ports';
import {
  TextEditorMarkdownReferenceCatalog,
  type TextEditorMarkdownReferenceCandidate,
  type TextEditorMarkdownReferenceContributor,
  type TextEditorMarkdownReferenceSearchRequest,
  type TextEditorMarkdownReferenceSource,
} from '@neko/text-editor-domain';

export interface NodeTextEditorMarkdownReferenceCatalogOptions {
  readonly files: NekoHostPorts['files'];
  readonly resolveWorkspace: (workspaceId: string) => Promise<AssetWorkspaceResolution>;
}

export function createNodeTextEditorMarkdownReferenceCatalog(
  options: NodeTextEditorMarkdownReferenceCatalogOptions,
): TextEditorMarkdownReferenceCatalog {
  return new TextEditorMarkdownReferenceCatalog([
    contentContributor('workspace-file', async (request) =>
      searchWorkspaceContentEntries({
        workspace: await options.resolveWorkspace(request.identity.workspaceId),
        files: options.files,
        query: request.query,
        limit: request.limit,
      }),
    ),
    {
      source: 'entity',
      search: async (request, signal) => {
        if (request.kind !== 'mention') return [];
        const workspace = await options.resolveWorkspace(request.identity.workspaceId);
        const resources = await readProjectEntityResources({ workspace, signal });
        const query = request.query.trim().toLocaleLowerCase();
        return resources.entities
          .filter((entity) => {
            const names = [entity.names.canonical, entity.names.display, ...entity.names.aliases];
            return !query || names.some((name) => name?.toLocaleLowerCase().includes(query));
          })
          .slice(0, request.limit)
          .map((entity) => ({
            kind: 'mention' as const,
            source: 'entity' as const,
            ref: { kind: entity.kind, id: entity.entityId },
            label: entity.names.display ?? entity.names.canonical,
            detail: entity.kind,
          }));
      },
    },
    contentContributor('asset', async (request) =>
      searchWorkspaceLinkedMediaLibraryContentEntries({
        workspace: await options.resolveWorkspace(request.identity.workspaceId),
        files: options.files,
        query: request.query,
        limit: request.limit,
      }),
    ),
  ]);
}

function contentContributor(
  source: Extract<TextEditorMarkdownReferenceSource, 'workspace-file' | 'asset'>,
  search: (
    request: TextEditorMarkdownReferenceSearchRequest,
  ) => Promise<readonly ResourceBrowserContentEntry[]>,
): TextEditorMarkdownReferenceContributor {
  return {
    source,
    search: async (request, signal) => {
      if (signal.aborted) return [];
      const entries = await search(request);
      if (signal.aborted) return [];
      return entries.flatMap((entry) => projectContentEntry(source, entry, request.kind));
    },
  };
}

function projectContentEntry(
  source: Extract<TextEditorMarkdownReferenceSource, 'workspace-file' | 'asset'>,
  entry: ResourceBrowserContentEntry,
  kind: TextEditorMarkdownReferenceSearchRequest['kind'],
): readonly TextEditorMarkdownReferenceCandidate[] {
  if (
    entry.role !== 'content' ||
    entry.availability !== 'available' ||
    entry.locator.kind !== 'workspace-file'
  ) {
    return [];
  }
  const ref = {
    kind: source === 'asset' ? 'workspace-media-library' : 'workspace-file',
    id: entry.locator.path,
  };
  const detail = entry.description ?? entry.locator.path;
  if (kind === 'mention') {
    return [{ kind: 'mention', source, ref, label: entry.label, detail }];
  }
  const mediaType = entry.metadata?.mediaType;
  const embeddable = mediaType === 'image' || mediaType === 'audio' || mediaType === 'video';
  if (kind === 'resource-embed' && !embeddable) return [];
  return [
    {
      kind: 'resource',
      source,
      ref,
      label: entry.label,
      detail,
      target: entry.locator.path,
      embeddable,
    },
  ];
}
