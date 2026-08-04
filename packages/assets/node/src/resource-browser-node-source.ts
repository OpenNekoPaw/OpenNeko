import * as path from 'node:path';
import type { NekoHostPorts } from '@neko/host/ports';
import { detectPreviewContentKind, type PreviewContentKind } from '@neko/preview-domain';
import { workspaceLinkedMediaLibraryPath } from '@neko/assets-domain/contracts';
import { listWorkspaceLinkedMediaLibraries } from './workspace-linked-media-libraries';
import type {
  ResourceBrowserContentEntry,
  ResourceBrowserInteractionPort,
  ResourceBrowserProjectionSource,
} from '@neko/assets-domain/resource-browser/ports';
import {
  readResourceBrowserContentChildren,
  searchResourceBrowserContentTree,
} from '@neko/assets-domain/resource-browser/content-tree-source';
import type {
  ResourceBrowserContentItem,
  ResourceBrowserIdentity,
  ResourceBrowserItem,
} from '@neko/assets-domain/resource-browser/contract';
import {
  createGlobalLibraryOpaqueId,
  createGlobalLibraryThumbnailDescriptor,
  type GlobalAssetItem,
  type GlobalLibraryCatalogSort,
  type GlobalLibrarySortDirection,
  type GlobalMediaLibraryItem,
} from '@neko/assets-domain/global-library/contract';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { resolveWorkspaceContentLocator } from './workspace-content-locator';
import { readProjectEntityManagementResources } from '@neko/entity-node';
import type { EntityAssetProjectionRepository } from '@neko/entity-domain';
import {
  listGlobalMediaLibraryConnections,
  type GlobalMediaLibraryConnection,
} from './global-media-library-files';
import { WorkspaceMediaLibrarySyncService } from './workspace-media-library-sync';

const FILE_SCAN_LIMIT = 5_000;
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.neko',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

export interface ResourceBrowserNodeSourceOptions {
  readonly globalAssetRoot: string;
  readonly globalMediaLibraryRoot: string;
  readonly workspaceMediaLibrarySync?: WorkspaceMediaLibrarySyncService;
  readonly workspace: AssetWorkspaceResolution;
  readonly entityProjections?: Pick<EntityAssetProjectionRepository, 'list'>;
  readonly refreshEntityProjections?: (workspace: AssetWorkspaceResolution) => Promise<void>;
  readonly host: Pick<NekoHostPorts, 'files' | 'external'>;
  readonly openPreview: (input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
    readonly target: Parameters<ResourceBrowserInteractionPort['preview']>[0]['target'];
  }) => Promise<void>;
  readonly openCut: (input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
  }) => Promise<void>;
  readonly selectSource: (windowId: string) => Promise<string | undefined>;
  readonly selectGlobalLibrary: (input: {
    readonly windowId: string;
    readonly libraries: readonly {
      readonly libraryId: string;
      readonly name: string;
      readonly locationKind: GlobalMediaLibraryConnection['locationKind'];
    }[];
  }) => Promise<string | undefined>;
  readonly mutateGlobalMediaLibraries: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>;
  readonly didMutateGlobalMediaLibraries: () => void;
  readonly createThumbnail: (absolutePath: string) => Promise<string>;
  readonly addToCanvas: ResourceBrowserInteractionPort['addToCanvas'];
  readonly addToCut: ResourceBrowserInteractionPort['addToCut'];
  readonly manageEntity: ResourceBrowserInteractionPort['manageEntity'];
}

export type ResourceBrowserNodeReadSourceOptions = Pick<
  ResourceBrowserNodeSourceOptions,
  | 'globalAssetRoot'
  | 'workspace'
  | 'host'
  | 'workspaceMediaLibrarySync'
  | 'entityProjections'
  | 'refreshEntityProjections'
>;

export async function searchGlobalAssetCatalog(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
  readonly sortBy: GlobalLibraryCatalogSort;
  readonly sortDirection: GlobalLibrarySortDirection;
  readonly limit: number;
}): Promise<readonly GlobalAssetItem[]> {
  await input.files.createDirectory(input.globalAssetRoot);
  return (await readGlobalAssets(input))
    .sort((left, right) => compareGlobalCatalogItems(left, right, input))
    .slice(0, input.limit);
}

export async function resolveGlobalAssetItemPath(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly itemId: string;
}): Promise<string> {
  const entries = await readGlobalAssetEntries({
    globalAssetRoot: input.globalAssetRoot,
    files: input.files,
    query: '',
  });
  const entry = entries.find(
    (candidate) =>
      candidate.locator.kind === 'workspace-file' &&
      createGlobalLibraryOpaqueId('global-asset-library', candidate.locator.path) === input.itemId,
  );
  if (!entry || entry.locator.kind !== 'workspace-file') {
    throw new Error('Desktop global Asset identity is stale or unavailable.');
  }
  const resolved = path.resolve(input.globalAssetRoot, ...entry.locator.path.split('/'));
  const relative = path.relative(input.globalAssetRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Desktop global Asset path escapes its owned root.');
  }
  return resolved;
}

export function isSupportedGlobalAssetPath(filePath: string): boolean {
  return classifyContent(filePath, true).include;
}

export async function searchGlobalMediaLibraries(input: {
  readonly mediaLibraryRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
  readonly sortBy: GlobalLibraryCatalogSort;
  readonly sortDirection: GlobalLibrarySortDirection;
  readonly limit: number;
}): Promise<readonly GlobalMediaLibraryItem[]> {
  const connections = await listGlobalMediaLibraryConnections(input.mediaLibraryRoot);
  const normalizedQuery = input.query.trim().toLocaleLowerCase();
  const items: GlobalMediaLibraryItem[] = [];
  for (const connection of connections) {
    const rootMatches =
      normalizedQuery.length === 0 ||
      `${connection.name} ${connection.locationKind}`.toLocaleLowerCase().includes(normalizedQuery);
    if (rootMatches) items.push(projectMediaLibraryRoot(connection));
    if (
      normalizedQuery.length === 0 ||
      connection.availability !== 'available' ||
      items.length >= input.limit
    ) {
      continue;
    }
    const entries = await searchResourceBrowserContentTree({
      absoluteRoot: connection.linkPath,
      locatorPrefix: '',
      query: input.query,
      limit: Math.min(input.limit - items.length, FILE_SCAN_LIMIT),
      rootDepth: -1,
      excludedDirectoryNames: EXCLUDED_DIRECTORIES,
      files: input.files,
      joinAbsolutePath: path.join,
      relativePath: path.relative,
      classify: (locatorPath) => classifyContent(locatorPath, false),
    });
    items.push(...entries.map((entry) => projectMediaLibraryEntry(connection, entry)));
  }
  return items
    .sort((left, right) => compareGlobalCatalogItems(left, right, input))
    .slice(0, input.limit);
}

export async function readGlobalMediaLibraryChildren(input: {
  readonly mediaLibraryRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly libraryId: string;
  readonly relativePath: string;
  readonly sortBy: GlobalLibraryCatalogSort;
  readonly sortDirection: GlobalLibrarySortDirection;
  readonly limit: number;
}): Promise<readonly GlobalMediaLibraryItem[]> {
  const connection = (await listGlobalMediaLibraryConnections(input.mediaLibraryRoot)).find(
    (candidate) => candidate.libraryId === input.libraryId,
  );
  if (!connection || connection.availability !== 'available') {
    throw new Error('Desktop global Media Library connection is unavailable.');
  }
  const absoluteDirectory = resolveMediaLibraryChildPath(connection.linkPath, input.relativePath);
  const entries = await readResourceBrowserContentChildren({
    absoluteRoot: connection.linkPath,
    absoluteDirectory,
    locatorPrefix: '',
    limit: Math.min(input.limit, FILE_SCAN_LIMIT),
    rootDepth: -1,
    excludedDirectoryNames: EXCLUDED_DIRECTORIES,
    files: input.files,
    joinAbsolutePath: path.join,
    relativePath: path.relative,
    classify: (locatorPath) => classifyContent(locatorPath, false),
  });
  return entries
    .map((entry) => projectMediaLibraryEntry(connection, entry))
    .sort((left, right) => compareGlobalCatalogItems(left, right, input));
}

export function createResourceBrowserNodeReadSource(
  options: ResourceBrowserNodeReadSourceOptions,
): ResourceBrowserProjectionSource {
  return {
    files: {
      list: async ({ query, limit }) => listWorkspaceProjection(options, query, limit, false),
      children: async ({ parent, limit }) =>
        readResourceBrowserContentChildren({
          absoluteRoot: options.workspace.workspacePath,
          absoluteDirectory: await resolveWorkspaceContentLocator(
            options.workspace,
            parent.locator,
          ),
          locatorPrefix: '',
          limit: Math.min(limit, FILE_SCAN_LIMIT),
          rootDepth: -1,
          excludedDirectoryNames: EXCLUDED_DIRECTORIES,
          files: options.host.files,
          joinAbsolutePath: path.join,
          relativePath: path.relative,
          classify: (locatorPath) => classifyContent(locatorPath, false),
        }),
    },
    media: {
      search: async ({ query, limit }) => listWorkspaceProjection(options, query, limit, true),
      children: async ({ parent, limit }) => readMediaLibraryChildren(options, parent, limit),
    },
    assets: {
      list: async ({ query, limit }) =>
        searchGlobalAssetCatalog({
          globalAssetRoot: options.globalAssetRoot,
          files: options.host.files,
          query,
          sortBy: 'name',
          sortDirection: 'ascending',
          limit,
        }),
    },
    entities: {
      list: async () => {
        await options.refreshEntityProjections?.(options.workspace);
        const result = await readProjectEntityManagementResources({
          workspace: options.workspace,
          ...(options.entityProjections
            ? {
                derivedProjection: {
                  repository: options.entityProjections,
                  partition: {
                    scope: 'workspace',
                    workspaceId: options.workspace.workspaceId,
                    domain: 'entity-asset-projection',
                  },
                },
              }
            : {}),
        });
        return {
          ...result,
          inspectorCapabilities: result.projections.map((projection) => ({
            projectionId: projection.projectionId,
            capabilities: {
              blockers:
                projection.status === 'candidate'
                  ? [REFERENCE_REWRITE_BLOCKERS[0]]
                  : REFERENCE_REWRITE_BLOCKERS,
            },
          })),
        };
      },
    },
    async refresh(): Promise<void> {
      // Sources are read-through; refresh invalidates no package-local catalog or cache.
    },
  };
}

const REFERENCE_REWRITE_BLOCKERS = [
  {
    code: 'reference-owners-not-configured',
    message: 'Project reference owners are not configured for a complete rewrite.',
    operation: 'merge' as const,
  },
  {
    code: 'reference-owners-not-configured',
    message: 'Project reference owners are not configured for a complete rewrite.',
    operation: 'deprecate' as const,
  },
] as const;

export function createResourceBrowserNodeProjectionSource(
  options: ResourceBrowserNodeSourceOptions,
): {
  readonly source: ResourceBrowserProjectionSource;
  readonly interactions: ResourceBrowserInteractionPort;
} {
  const source = createResourceBrowserNodeReadSource(options);
  const workspaceMediaLibrarySync =
    options.workspaceMediaLibrarySync ??
    new WorkspaceMediaLibrarySyncService(options.globalMediaLibraryRoot);

  const interactions: ResourceBrowserInteractionPort = {
    manageEntity: options.manageEntity,
    async linkGlobalLibrary({ identity }): Promise<'linked' | 'cancelled'> {
      const linkedNames = new Set(
        (await listWorkspaceLinkedMediaLibraries(options.workspace.workspacePath)).map((library) =>
          library.name.toLocaleLowerCase(),
        ),
      );
      const availableLibraries = (
        await listGlobalMediaLibraryConnections(options.globalMediaLibraryRoot)
      ).filter(
        (library) =>
          library.availability === 'available' &&
          !linkedNames.has(library.name.toLocaleLowerCase()),
      );
      if (availableLibraries.length === 0) {
        throw new Error('No unlinked global Media Library is available for this workspace.');
      }
      const libraryId = await options.selectGlobalLibrary({
        windowId: identity.windowId,
        libraries: availableLibraries.map(({ libraryId, name, locationKind }) => ({
          libraryId,
          name,
          locationKind,
        })),
      });
      if (!libraryId) return 'cancelled';
      const library = availableLibraries.find((candidate) => candidate.libraryId === libraryId);
      if (!library) {
        throw new Error('Selected global Media Library identity is stale.');
      }
      await workspaceMediaLibrarySync.linkGlobalLibrary({
        workspace: options.workspace,
        libraryId: library.libraryId,
      });
      return 'linked';
    },
    async addDirectoryLibrary({ identity }): Promise<'added' | 'cancelled'> {
      const selectedDirectory = await options.selectSource(identity.windowId);
      if (!selectedDirectory) return 'cancelled';
      await options.mutateGlobalMediaLibraries(async () => {
        await workspaceMediaLibrarySync.addDirectoryLibrary({
          workspace: options.workspace,
          sourceDirectory: selectedDirectory,
          locationKind: 'local',
        });
      });
      options.didMutateGlobalMediaLibraries();
      return 'added';
    },
    async relinkSource({ identity, item }): Promise<'relinked' | 'cancelled'> {
      const libraryName = requireLibraryName(item);
      const selectedDirectory = await options.selectSource(identity.windowId);
      if (!selectedDirectory) return 'cancelled';
      await options.mutateGlobalMediaLibraries(() =>
        workspaceMediaLibrarySync.relinkDirectoryLibrary({
          workspace: options.workspace,
          libraryName,
          sourceDirectory: selectedDirectory,
          locationKind: 'local',
        }),
      );
      options.didMutateGlobalMediaLibraries();
      return 'relinked';
    },
    async removeSource({ item }): Promise<void> {
      await workspaceMediaLibrarySync.removeLink({
        workspace: options.workspace,
        libraryName: requireLibraryName(item),
      });
    },
    async preview({ identity, item, target }): Promise<void> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        globalAssetRoot: options.globalAssetRoot,
        files: options.host.files,
        item,
      });
      await options.openPreview({ identity, item, absolutePath, target });
    },
    async openCut({ identity, item }): Promise<void> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        globalAssetRoot: options.globalAssetRoot,
        files: options.host.files,
        item,
      });
      await options.openCut({ identity, item, absolutePath });
    },
    async reveal({ item }): Promise<void> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        globalAssetRoot: options.globalAssetRoot,
        files: options.host.files,
        item,
      });
      const external = options.host.external;
      if (!external?.revealPath) {
        throw new Error('Desktop Resource Browser reveal capability is unavailable.');
      }
      await external.revealPath(absolutePath);
    },
    async resolveThumbnail({ item }): Promise<string> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        globalAssetRoot: options.globalAssetRoot,
        files: options.host.files,
        item,
      });
      return options.createThumbnail(absolutePath);
    },
    addToCanvas: options.addToCanvas,
    addToCut: options.addToCut,
  };
  return { source, interactions };
}

function requireLibraryName(item: ResourceBrowserItem): string {
  if (item.role !== 'library-root' || !item.libraryName) {
    throw new Error('Resource Browser media library management requires a library root.');
  }
  return item.libraryName;
}

async function listWorkspaceProjection(
  options: ResourceBrowserNodeReadSourceOptions,
  query: string,
  limit: number,
  mediaOnly: boolean,
): Promise<readonly ResourceBrowserContentEntry[]> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const entries: ResourceBrowserContentEntry[] = [];
  if (!mediaOnly) {
    const readInput = {
      absoluteRoot: options.workspace.workspacePath,
      locatorPrefix: '',
      limit: Math.min(limit, FILE_SCAN_LIMIT),
      rootDepth: -1,
      excludedDirectoryNames: EXCLUDED_DIRECTORIES,
      files: options.host.files,
      joinAbsolutePath: path.join,
      relativePath: path.relative,
      classify: (locatorPath: string) => classifyContent(locatorPath, false),
    };
    entries.push(
      ...(normalizedQuery
        ? await searchResourceBrowserContentTree({
            ...readInput,
            query,
          })
        : await readResourceBrowserContentChildren(readInput)),
    );
  }
  if (mediaOnly) {
    const libraries = await listWorkspaceLinkedMediaLibraries(options.workspace.workspacePath);
    const librariesByName = new Map(libraries.map((library) => [library.name, library]));
    const syncProjection = options.workspaceMediaLibrarySync
      ? await options.workspaceMediaLibrarySync.inspect(options.workspace)
      : undefined;
    const statusesByName = new Map(
      syncProjection?.statuses.map((status) => [status.libraryName, status]) ?? [],
    );
    const libraryNames = new Set([...librariesByName.keys(), ...statusesByName.keys()]);
    for (const libraryName of [...libraryNames].sort((left, right) =>
      left.localeCompare(right, 'en-US'),
    )) {
      if (entries.length >= limit) break;
      const library = librariesByName.get(libraryName);
      const libraryStatus = statusesByName.get(libraryName);
      const workspacePath = library?.workspacePath ?? workspaceLinkedMediaLibraryPath(libraryName);
      const browseAvailable =
        library?.availability === 'available' &&
        libraryStatus?.state !== 'required-unlinked' &&
        libraryStatus?.state !== 'global-connection-missing' &&
        libraryStatus?.state !== 'target-unavailable' &&
        libraryStatus?.state !== 'entry-conflict';
      const rootIndex = entries.length;
      entries.push({
        locator: { kind: 'workspace-file', path: workspacePath },
        label: libraryName,
        description:
          libraryStatus?.diagnostic?.message ??
          library?.diagnostic?.message ??
          (browseAvailable ? workspacePath : 'Media library is unavailable.'),
        availability: browseAvailable ? 'available' : 'unavailable',
        ...(!browseAvailable ? { diagnostic: { code: 'resource-inaccessible' as const } } : {}),
        capabilities: browseAvailable ? ['read'] : [],
        metadata: { mediaType: 'directory' },
        role: 'library-root',
        depth: 0,
        libraryName,
        ...(libraryStatus ? { libraryStatus } : {}),
      });
      const libraryMatchesQuery =
        !normalizedQuery ||
        `${libraryName} ${workspacePath}`.toLocaleLowerCase().includes(normalizedQuery);
      if (!browseAvailable || entries.length >= limit || !normalizedQuery) {
        if (!libraryMatchesQuery) entries.splice(rootIndex, 1);
        continue;
      }
      const absoluteRoot = path.join(options.workspace.workspacePath, ...workspacePath.split('/'));
      entries.push(
        ...(await searchResourceBrowserContentTree({
          absoluteRoot,
          locatorPrefix: workspacePath,
          query,
          limit: Math.min(limit - entries.length, FILE_SCAN_LIMIT),
          rootDepth: 0,
          excludedDirectoryNames: EXCLUDED_DIRECTORIES,
          files: options.host.files,
          joinAbsolutePath: path.join,
          relativePath: path.relative,
          classify: (locatorPath) => classifyContent(locatorPath, true),
          libraryName,
        })),
      );
      if (!libraryMatchesQuery && entries.length === rootIndex + 1) {
        entries.splice(rootIndex, 1);
      }
    }
  }
  return dedupeProjection(entries).slice(0, limit);
}

async function readMediaLibraryChildren(
  options: ResourceBrowserNodeReadSourceOptions,
  parent: ResourceBrowserContentItem,
  limit: number,
): Promise<readonly ResourceBrowserContentEntry[]> {
  if (parent.locator.kind !== 'workspace-file') {
    throw new Error('Resource Browser Media parent must use a workspace locator.');
  }
  const parentPath = parent.locator.path;
  const libraries = await listWorkspaceLinkedMediaLibraries(options.workspace.workspacePath);
  const library = libraries.find(
    (candidate) =>
      candidate.name === parent.libraryName ||
      parentPath === candidate.workspacePath ||
      parentPath.startsWith(`${candidate.workspacePath}/`),
  );
  if (!library || library.availability !== 'available') {
    throw new Error('Resource Browser Media parent library is unavailable.');
  }
  const absoluteRoot = await resolveWorkspaceContentLocator(options.workspace, {
    kind: 'workspace-file',
    path: library.workspacePath,
  });
  return readResourceBrowserContentChildren({
    absoluteRoot,
    absoluteDirectory: await resolveWorkspaceContentLocator(options.workspace, parent.locator),
    locatorPrefix: library.workspacePath,
    limit: Math.min(limit, FILE_SCAN_LIMIT),
    rootDepth: 0,
    libraryName: library.name,
    excludedDirectoryNames: EXCLUDED_DIRECTORIES,
    files: options.host.files,
    joinAbsolutePath: path.join,
    relativePath: path.relative,
    classify: (locatorPath) => classifyContent(locatorPath, true),
  });
}

function classifyContent(locatorPath: string, mediaOnly: boolean) {
  const previewKind = detectDesktopPreviewContentKind(locatorPath, mediaOnly);
  const cutDocument = isCutDocument(locatorPath);
  const canvasDocument = isCanvasDocument(locatorPath);
  return {
    include: !mediaOnly || (!!previewKind && previewKind !== 'text') || cutDocument,
    mediaType: canvasDocument ? 'canvas' : cutDocument ? 'cut' : (previewKind ?? 'file'),
    capabilities: mediaOnly
      ? (['read', ...(previewKind ? (['preview'] as const) : []), 'bind'] as const)
      : (['read', 'bind', ...(previewKind ? (['preview'] as const) : [])] as const),
  };
}

async function readGlobalAssets(
  input: Parameters<typeof searchGlobalAssetCatalog>[0],
): Promise<GlobalAssetItem[]> {
  const entries = await readGlobalAssetEntries(input);
  return entries.flatMap((entry) => {
    if (entry.role !== 'content') return [];
    if (entry.locator.kind !== 'workspace-file') {
      throw new Error('Desktop global asset catalog produced a non-file locator.');
    }
    const id = createGlobalLibraryOpaqueId('global-asset-library', entry.locator.path);
    const modifiedAt = entry.metadata?.modifiedAt;
    const byteLength = entry.metadata?.byteLength;
    const thumbnail = createGlobalLibraryThumbnailDescriptor({
      owner: 'global-asset-library',
      itemId: id,
      mediaType: entry.metadata?.mediaType,
      modifiedAt,
      byteLength,
    });
    return [
      {
        id,
        owner: 'global-asset-library' as const,
        label: entry.label,
        ...(entry.description ? { description: entry.description } : {}),
        kind: 'asset' as const,
        ...(entry.metadata?.mediaType ? { mediaType: entry.metadata.mediaType } : {}),
        ...(byteLength === undefined ? {} : { byteLength }),
        ...(modifiedAt ? { modifiedAt } : {}),
        availability: entry.availability,
        ...(thumbnail ? { thumbnail } : {}),
      },
    ];
  });
}

async function readGlobalAssetEntries(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
}): Promise<readonly ResourceBrowserContentEntry[]> {
  return searchResourceBrowserContentTree({
    absoluteRoot: input.globalAssetRoot,
    locatorPrefix: '',
    query: input.query,
    limit: FILE_SCAN_LIMIT,
    rootDepth: -1,
    excludedDirectoryNames: EXCLUDED_DIRECTORIES,
    files: input.files,
    joinAbsolutePath: path.join,
    relativePath: path.relative,
    classify: (locatorPath) => classifyContent(locatorPath, true),
  });
}

function projectMediaLibraryRoot(connection: GlobalMediaLibraryConnection): GlobalMediaLibraryItem {
  const id = createGlobalLibraryOpaqueId('media-library', `${connection.libraryId}:root`);
  return {
    id,
    owner: 'media-library',
    libraryId: connection.libraryId,
    libraryLabel: connection.name,
    label: connection.name,
    description: connection.locationKind,
    kind: 'library',
    locationKind: connection.locationKind,
    relativePath: '',
    mediaType: 'directory',
    ...(connection.modifiedAt ? { modifiedAt: connection.modifiedAt } : {}),
    availability: connection.availability,
  };
}

function projectMediaLibraryEntry(
  connection: GlobalMediaLibraryConnection,
  entry: ResourceBrowserContentEntry,
): GlobalMediaLibraryItem {
  if (entry.locator.kind !== 'workspace-file') {
    throw new Error('Desktop global Media Library produced a non-file locator.');
  }
  const relativePath = entry.locator.path;
  const id = createGlobalLibraryOpaqueId(
    'media-library',
    `${connection.libraryId}:${relativePath}`,
  );
  const modifiedAt = entry.metadata?.modifiedAt;
  const byteLength = entry.metadata?.byteLength;
  const thumbnail = createGlobalLibraryThumbnailDescriptor({
    owner: 'media-library',
    itemId: id,
    mediaType: entry.metadata?.mediaType,
    modifiedAt,
    byteLength,
  });
  return {
    id,
    owner: 'media-library',
    libraryId: connection.libraryId,
    libraryLabel: connection.name,
    label: entry.label,
    ...(entry.description ? { description: entry.description } : {}),
    kind: entry.role === 'directory' ? 'directory' : 'file',
    locationKind: connection.locationKind,
    relativePath,
    ...(entry.metadata?.mediaType ? { mediaType: entry.metadata.mediaType } : {}),
    ...(byteLength === undefined ? {} : { byteLength }),
    ...(modifiedAt ? { modifiedAt } : {}),
    availability: entry.availability,
    ...(thumbnail ? { thumbnail } : {}),
  };
}

function resolveMediaLibraryChildPath(root: string, relativePath: string): string {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\\'))) {
    throw new Error('Desktop global Media Library relative path is invalid.');
  }
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Desktop global Media Library relative path escapes its connection root.');
  }
  return resolved;
}

function compareGlobalCatalogItems(
  left: Pick<GlobalAssetItem, 'id' | 'label' | 'modifiedAt'>,
  right: Pick<GlobalAssetItem, 'id' | 'label' | 'modifiedAt'>,
  input: {
    readonly sortBy: GlobalLibraryCatalogSort;
    readonly sortDirection: GlobalLibrarySortDirection;
  },
): number {
  const primary =
    input.sortBy === 'name'
      ? left.label.localeCompare(right.label)
      : Date.parse(left.modifiedAt ?? '1970-01-01T00:00:00.000Z') -
        Date.parse(right.modifiedAt ?? '1970-01-01T00:00:00.000Z');
  const directed = input.sortDirection === 'ascending' ? primary : -primary;
  return directed || left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

function detectDesktopPreviewContentKind(
  locatorPath: string,
  allowTransportStream: boolean,
): PreviewContentKind | undefined {
  if (path.posix.extname(locatorPath).toLocaleLowerCase() === '.ts') {
    return allowTransportStream ? 'video' : 'text';
  }
  return detectPreviewContentKind(locatorPath);
}

function isCanvasDocument(locatorPath: string): boolean {
  return path.posix.extname(locatorPath).toLocaleLowerCase() === '.nkc';
}

function isCutDocument(locatorPath: string): boolean {
  return path.posix.extname(locatorPath).toLocaleLowerCase() === '.otio';
}

export async function resolveResourceBrowserItemPath(input: {
  readonly workspace: AssetWorkspaceResolution;
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly item: Parameters<ResourceBrowserInteractionPort['preview']>[0]['item'];
}): Promise<string> {
  if (input.item.facet === 'assets') {
    return resolveGlobalAssetItemPath({
      globalAssetRoot: input.globalAssetRoot,
      files: input.files,
      itemId: input.item.assetRef.assetId,
    });
  }
  const locator =
    input.item.facet === 'entities'
      ? input.item.entityStatus === 'candidate'
        ? undefined
        : input.item.representationLocator
      : input.item.locator;
  if (!locator) {
    throw new Error('Desktop Resource Browser item has no local presentation.');
  }
  return resolveWorkspaceContentLocator(input.workspace, locator);
}

function dedupeProjection(
  entries: readonly ResourceBrowserContentEntry[],
): readonly ResourceBrowserContentEntry[] {
  const byLocator = new Map<string, ResourceBrowserContentEntry>();
  for (const entry of entries) {
    if (entry.locator.kind !== 'workspace-file') continue;
    byLocator.set(entry.locator.path, entry);
  }
  return [...byLocator.values()];
}
