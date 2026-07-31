import * as path from 'node:path';
import type { NekoHostPorts } from '@neko/host/ports';
import { detectPreviewContentKind, type PreviewContentKind } from '@neko-preview/contracts';
import {
  createWorkspaceLinkedMediaLibrary,
  listWorkspaceLinkedMediaLibraries,
  removeWorkspaceLinkedMediaLibrary,
  replaceWorkspaceLinkedMediaLibrary,
} from '@neko/shared/node/workspace-linked-media-libraries';
import type {
  ResourceBrowserContentEntry,
  ResourceBrowserInteractionPort,
  ResourceBrowserProjectionSource,
} from 'neko-assets/resource-browser/ports';
import {
  readResourceBrowserContentChildren,
  searchResourceBrowserContentTree,
} from 'neko-assets/resource-browser/content-tree-source';
import type {
  ResourceBrowserContentItem,
  ResourceBrowserIdentity,
  ResourceBrowserItem,
} from 'neko-assets/resource-browser/contract';
import {
  createGlobalLibraryOpaqueId,
  createGlobalLibraryThumbnailDescriptor,
} from 'neko-assets/global-library/contract';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';
import { resolveDesktopWorkspaceContentLocator } from './desktop-content-locator';
import { readDesktopConfirmedEntityResources } from './desktop-entity-resource-query';
import {
  createDesktopGlobalMediaLibraryConnection,
  listDesktopGlobalMediaLibraryConnections,
  removeDesktopGlobalMediaLibraryConnection,
  type DesktopGlobalMediaLibraryConnection,
} from './desktop-global-media-library-files';
import type {
  DesktopHomeAssetItem,
  DesktopHomeCatalogSort,
  DesktopHomeMediaLibraryItem,
  DesktopHomeSortDirection,
} from '../shared/home-management-contract';

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

export interface DesktopResourceBrowserSourceOptions {
  readonly globalMediaLibraryRoot: string;
  readonly workspace: DesktopWorkspaceResolution;
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
      readonly locationKind: DesktopGlobalMediaLibraryConnection['locationKind'];
    }[];
  }) => Promise<string | undefined>;
  readonly mutateGlobalMediaLibraries: <Result>(
    operation: () => Promise<Result>,
  ) => Promise<Result>;
  readonly didMutateGlobalMediaLibraries: () => void;
  readonly createThumbnail: (absolutePath: string) => Promise<string>;
  readonly addToCanvas: ResourceBrowserInteractionPort['addToCanvas'];
  readonly addToCut: ResourceBrowserInteractionPort['addToCut'];
}

export type DesktopResourceBrowserReadSourceOptions = Pick<
  DesktopResourceBrowserSourceOptions,
  'workspace' | 'host'
>;

export async function searchDesktopGlobalAssetCatalog(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
  readonly sortBy: DesktopHomeCatalogSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}): Promise<readonly DesktopHomeAssetItem[]> {
  await input.files.createDirectory(input.globalAssetRoot);
  return (await readGlobalAssets(input))
    .sort((left, right) => compareGlobalCatalogItems(left, right, input))
    .slice(0, input.limit);
}

export async function resolveDesktopGlobalAssetItemPath(input: {
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
      createGlobalLibraryOpaqueId('asset-library', candidate.locator.path) === input.itemId,
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

export function isSupportedDesktopGlobalAssetPath(filePath: string): boolean {
  return classifyContent(filePath, true).include;
}

export async function searchDesktopGlobalMediaLibraries(input: {
  readonly mediaLibraryRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
  readonly sortBy: DesktopHomeCatalogSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}): Promise<readonly DesktopHomeMediaLibraryItem[]> {
  const connections = await listDesktopGlobalMediaLibraryConnections(input.mediaLibraryRoot);
  const normalizedQuery = input.query.trim().toLocaleLowerCase();
  const items: DesktopHomeMediaLibraryItem[] = [];
  for (const connection of connections) {
    const rootMatches =
      normalizedQuery.length === 0 ||
      `${connection.name} ${connection.locationKind}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
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

export async function readDesktopGlobalMediaLibraryChildren(input: {
  readonly mediaLibraryRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly libraryId: string;
  readonly relativePath: string;
  readonly sortBy: DesktopHomeCatalogSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}): Promise<readonly DesktopHomeMediaLibraryItem[]> {
  const connection = (await listDesktopGlobalMediaLibraryConnections(input.mediaLibraryRoot)).find(
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

export function createDesktopResourceBrowserReadSource(
  options: DesktopResourceBrowserReadSourceOptions,
): ResourceBrowserProjectionSource {
  return {
    files: {
      list: async ({ query, limit }) => listWorkspaceProjection(options, query, limit, false),
      children: async ({ parent, limit }) =>
        readResourceBrowserContentChildren({
          absoluteRoot: options.workspace.workspacePath,
          absoluteDirectory: await resolveDesktopWorkspaceContentLocator(
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
    entities: {
      list: async () =>
        readDesktopConfirmedEntityResources({
          workspace: options.workspace,
          host: options.host,
        }),
    },
    async refresh(): Promise<void> {
      // Sources are read-through; refresh invalidates no package-local catalog or cache.
    },
  };
}

export function createDesktopResourceBrowserProjectionSource(
  options: DesktopResourceBrowserSourceOptions,
): {
  readonly source: ResourceBrowserProjectionSource;
  readonly interactions: ResourceBrowserInteractionPort;
} {
  const source = createDesktopResourceBrowserReadSource(options);

  const interactions: ResourceBrowserInteractionPort = {
    async linkGlobalLibrary({ identity }): Promise<'linked' | 'cancelled'> {
      const linkedNames = new Set(
        (await listWorkspaceLinkedMediaLibraries(options.workspace.workspacePath)).map(
          (library) => library.name.toLocaleLowerCase(),
        ),
      );
      const availableLibraries = (
        await listDesktopGlobalMediaLibraryConnections(options.globalMediaLibraryRoot)
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
      await createWorkspaceLinkedMediaLibrary({
        workspaceRoot: options.workspace.workspacePath,
        name: library.name,
        targetDirectory: library.linkPath,
      });
      return 'linked';
    },
    async addDirectoryLibrary({ identity }): Promise<'added' | 'cancelled'> {
      const selectedDirectory = await options.selectSource(identity.windowId);
      if (!selectedDirectory) return 'cancelled';
      await options.mutateGlobalMediaLibraries(async () => {
        const created = await createDesktopGlobalMediaLibraryConnection({
          mediaLibraryRoot: options.globalMediaLibraryRoot,
          sourceDirectory: selectedDirectory,
          locationKind: 'local',
        });
        try {
          const library = (
            await listDesktopGlobalMediaLibraryConnections(options.globalMediaLibraryRoot)
          ).find((candidate) => candidate.libraryId === created.libraryId);
          if (!library || library.availability !== 'available') {
            throw new Error('New global Media Library could not be resolved after creation.');
          }
          await createWorkspaceLinkedMediaLibrary({
            workspaceRoot: options.workspace.workspacePath,
            name: library.name,
            targetDirectory: library.linkPath,
          });
        } catch (error: unknown) {
          try {
            await removeDesktopGlobalMediaLibraryConnection({
              mediaLibraryRoot: options.globalMediaLibraryRoot,
              libraryId: created.libraryId,
            });
          } catch (rollbackError: unknown) {
            throw new AggregateError(
              [error, rollbackError],
              'Project Media Library setup failed and global registry rollback also failed.',
            );
          }
          throw error;
        }
      });
      options.didMutateGlobalMediaLibraries();
      return 'added';
    },
    async relinkSource({ identity, item }): Promise<'relinked' | 'cancelled'> {
      const libraryName = requireLibraryName(item);
      const selectedDirectory = await options.selectSource(identity.windowId);
      if (!selectedDirectory) return 'cancelled';
      await replaceWorkspaceLinkedMediaLibrary({
        workspaceRoot: options.workspace.workspacePath,
        name: libraryName,
        targetDirectory: selectedDirectory,
      });
      return 'relinked';
    },
    async removeSource({ item }): Promise<void> {
      await removeWorkspaceLinkedMediaLibrary({
        workspaceRoot: options.workspace.workspacePath,
        name: requireLibraryName(item),
      });
    },
    async preview({ identity, item, target }): Promise<void> {
      const absolutePath = await resolveDesktopResourceBrowserItemPath(options.workspace, item);
      await options.openPreview({ identity, item, absolutePath, target });
    },
    async openCut({ identity, item }): Promise<void> {
      const absolutePath = await resolveDesktopResourceBrowserItemPath(options.workspace, item);
      await options.openCut({ identity, item, absolutePath });
    },
    async reveal({ item }): Promise<void> {
      const absolutePath = await resolveDesktopResourceBrowserItemPath(options.workspace, item);
      const external = options.host.external;
      if (!external?.revealPath) {
        throw new Error('Desktop Resource Browser reveal capability is unavailable.');
      }
      await external.revealPath(absolutePath);
    },
    async resolveThumbnail({ item }): Promise<string> {
      const absolutePath = await resolveDesktopResourceBrowserItemPath(options.workspace, item);
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
  options: DesktopResourceBrowserReadSourceOptions,
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
    for (const library of libraries) {
      if (entries.length >= limit) break;
      const rootIndex = entries.length;
      entries.push({
        locator: { kind: 'workspace-file', path: library.workspacePath },
        label: library.name,
        description:
          library.availability === 'available'
            ? library.workspacePath
            : (library.diagnostic?.message ?? 'Media library is unavailable.'),
        availability: library.availability === 'available' ? 'available' : 'unavailable',
        ...(library.availability === 'unavailable'
          ? { diagnostic: { code: 'resource-inaccessible' as const } }
          : {}),
        capabilities: library.availability === 'available' ? ['read'] : [],
        metadata: { mediaType: 'directory' },
        role: 'library-root',
        depth: 0,
        libraryName: library.name,
      });
      const libraryMatchesQuery =
        !normalizedQuery ||
        `${library.name} ${library.workspacePath}`.toLocaleLowerCase().includes(normalizedQuery);
      if (library.availability !== 'available' || entries.length >= limit || !normalizedQuery) {
        if (!libraryMatchesQuery) entries.splice(rootIndex, 1);
        continue;
      }
      const absoluteRoot = path.join(
        options.workspace.workspacePath,
        ...library.workspacePath.split('/'),
      );
      entries.push(
        ...(await searchResourceBrowserContentTree({
          absoluteRoot,
          locatorPrefix: library.workspacePath,
          query,
          limit: Math.min(limit - entries.length, FILE_SCAN_LIMIT),
          rootDepth: 0,
          excludedDirectoryNames: EXCLUDED_DIRECTORIES,
          files: options.host.files,
          joinAbsolutePath: path.join,
          relativePath: path.relative,
          classify: (locatorPath) => classifyContent(locatorPath, true),
          libraryName: library.name,
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
  options: DesktopResourceBrowserReadSourceOptions,
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
  const absoluteRoot = await resolveDesktopWorkspaceContentLocator(options.workspace, {
    kind: 'workspace-file',
    path: library.workspacePath,
  });
  return readResourceBrowserContentChildren({
    absoluteRoot,
    absoluteDirectory: await resolveDesktopWorkspaceContentLocator(
      options.workspace,
      parent.locator,
    ),
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
  input: Parameters<typeof searchDesktopGlobalAssetCatalog>[0],
): Promise<DesktopHomeAssetItem[]> {
  const entries = await readGlobalAssetEntries(input);
  return entries.flatMap((entry) => {
    if (entry.role !== 'content') return [];
    if (entry.locator.kind !== 'workspace-file') {
      throw new Error('Desktop global asset catalog produced a non-file locator.');
    }
    const id = createGlobalLibraryOpaqueId('asset-library', entry.locator.path);
    const modifiedAt = entry.metadata?.modifiedAt;
    const byteLength = entry.metadata?.byteLength;
    const thumbnail = createGlobalLibraryThumbnailDescriptor({
      owner: 'asset-library',
      itemId: id,
      mediaType: entry.metadata?.mediaType,
      modifiedAt,
      byteLength,
    });
    return [
      {
        id,
        owner: 'asset-library' as const,
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

function projectMediaLibraryRoot(
  connection: DesktopGlobalMediaLibraryConnection,
): DesktopHomeMediaLibraryItem {
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
  connection: DesktopGlobalMediaLibraryConnection,
  entry: ResourceBrowserContentEntry,
): DesktopHomeMediaLibraryItem {
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
  left: Pick<DesktopHomeAssetItem, 'id' | 'label' | 'modifiedAt'>,
  right: Pick<DesktopHomeAssetItem, 'id' | 'label' | 'modifiedAt'>,
  input: {
    readonly sortBy: DesktopHomeCatalogSort;
    readonly sortDirection: DesktopHomeSortDirection;
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

export async function resolveDesktopResourceBrowserItemPath(
  workspace: DesktopWorkspaceResolution,
  item: Parameters<ResourceBrowserInteractionPort['preview']>[0]['item'],
): Promise<string> {
  const locator = item.facet === 'materials' ? item.representationLocator : item.locator;
  if (!locator) {
    throw new Error('Desktop Resource Browser item has no local presentation.');
  }
  return resolveDesktopWorkspaceContentLocator(workspace, locator);
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
