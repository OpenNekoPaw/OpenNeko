import { randomUUID } from 'node:crypto';
import { copyFile, link, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { COPYFILE_EXCL } from 'node:constants';
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
import type { AssetLibraryMembershipRepository } from '@neko/assets-domain/global-library/membership';
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
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

export interface ResourceBrowserNodeSourceOptions {
  readonly globalAssetRoot: string;
  readonly assetLibraryMemberships?: AssetLibraryMembershipRepository;
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
  readonly openTextEditor: ResourceBrowserInteractionPort['editText'];
  readonly openCut: (input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
  }) => Promise<void>;
  readonly selectSource: (windowId: string) => Promise<string | undefined>;
  readonly selectWorkspaceFiles: (windowId: string) => Promise<readonly string[] | undefined>;
  readonly trashWorkspaceItem: (absolutePath: string) => Promise<void>;
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
  readonly createThumbnail: (absolutePath: string) => Promise<string>;
  readonly addToCanvas: ResourceBrowserInteractionPort['addToCanvas'];
  readonly addToCut: ResourceBrowserInteractionPort['addToCut'];
  readonly manageEntity: ResourceBrowserInteractionPort['manageEntity'];
}

export type ResourceBrowserNodeReadSourceOptions = Pick<
  ResourceBrowserNodeSourceOptions,
  | 'globalAssetRoot'
  | 'assetLibraryMemberships'
  | 'workspace'
  | 'host'
  | 'workspaceMediaLibrarySync'
  | 'entityProjections'
  | 'refreshEntityProjections'
>;

export async function searchGlobalAssetCatalog(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly memberships: AssetLibraryMembershipRepository;
  readonly query: string;
  readonly sortBy: GlobalLibraryCatalogSort;
  readonly sortDirection: GlobalLibrarySortDirection;
  readonly limit: number;
}): Promise<readonly GlobalAssetItem[]> {
  await input.files.createDirectory(input.globalAssetRoot);
  await initializeGlobalAssetMembershipInventory(input);
  return (await readGlobalAssets(input))
    .sort((left, right) => compareGlobalCatalogItems(left, right, input))
    .slice(0, input.limit);
}

export async function resolveGlobalAssetItemPath(input: {
  readonly globalAssetRoot: string;
  readonly memberships: AssetLibraryMembershipRepository;
  readonly itemId: string;
}): Promise<string> {
  const membership = await input.memberships.get(input.itemId);
  if (!membership || membership.state !== 'active') {
    throw new Error('Desktop global Asset identity is stale or unavailable.');
  }
  const resolved = path.resolve(input.globalAssetRoot, ...membership.sourceRelativePath.split('/'));
  const relative = path.relative(input.globalAssetRoot, resolved);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Desktop global Asset path escapes its owned root.');
  }
  const [root, target, entry] = await Promise.all([
    realpath(input.globalAssetRoot),
    realpath(resolved),
    lstat(resolved),
  ]);
  const realRelative = path.relative(root, target);
  if (
    !entry.isFile() ||
    entry.isSymbolicLink() ||
    realRelative === '' ||
    realRelative === '..' ||
    realRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelative)
  ) {
    throw new Error('Desktop global Asset path escapes its owned root.');
  }
  return target;
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
          memberships: requireAssetLibraryMemberships(options.assetLibraryMemberships),
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
    async createDirectory({ parent, name }): Promise<void> {
      const absoluteParent = await resolveWorkspaceFileParent(options.workspace, parent);
      const target = path.join(absoluteParent, name);
      await mkdir(target);
    },
    async importFiles({ identity, parent }): Promise<'imported' | 'cancelled'> {
      const selectedFiles = await options.selectWorkspaceFiles(identity.windowId);
      if (!selectedFiles || selectedFiles.length === 0) return 'cancelled';
      const absoluteParent = await resolveWorkspaceFileParent(options.workspace, parent);
      await importWorkspaceFiles(selectedFiles, absoluteParent);
      return 'imported';
    },
    async trashContent({ item }): Promise<void> {
      const absolutePath = await resolveWorkspaceContentLocator(options.workspace, item.locator);
      const workspaceRoot = await realpath(options.workspace.workspacePath);
      if (absolutePath === workspaceRoot || !isPathInside(absolutePath, workspaceRoot)) {
        throw new Error('Resource Browser Trash target escapes the authorized Workspace.');
      }
      await options.trashWorkspaceItem(absolutePath);
    },
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
        memberships: options.assetLibraryMemberships,
        item,
      });
      await options.openPreview({ identity, item, absolutePath, target });
    },
    editText: options.openTextEditor,
    async openCut({ identity, item }): Promise<void> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        globalAssetRoot: options.globalAssetRoot,
        memberships: options.assetLibraryMemberships,
        item,
      });
      await options.openCut({ identity, item, absolutePath });
    },
    async reveal({ item }): Promise<void> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        globalAssetRoot: options.globalAssetRoot,
        memberships: options.assetLibraryMemberships,
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
        memberships: options.assetLibraryMemberships,
        item,
      });
      return options.createThumbnail(absolutePath);
    },
    addToCanvas: options.addToCanvas,
    addToCut: options.addToCut,
  };
  return { source, interactions };
}

async function resolveWorkspaceFileParent(
  workspace: AssetWorkspaceResolution,
  parent: ResourceBrowserContentItem | undefined,
): Promise<string> {
  const workspaceRoot = await realpath(workspace.workspacePath);
  if (!parent) return workspaceRoot;
  if (parent.facet !== 'files' || parent.kind !== 'directory') {
    throw new Error('Resource Browser Workspace File parent must be a Files directory.');
  }
  const absoluteParent = await resolveWorkspaceContentLocator(workspace, parent.locator);
  const entry = await lstat(absoluteParent);
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    !isPathInside(absoluteParent, workspaceRoot)
  ) {
    throw new Error('Resource Browser Workspace File parent is outside the authorized Workspace.');
  }
  return absoluteParent;
}

async function importWorkspaceFiles(
  selectedFiles: readonly string[],
  absoluteParent: string,
): Promise<void> {
  const sources = await Promise.all(
    selectedFiles.map(async (selectedPath) => {
      const entry = await lstat(selectedPath);
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error('Resource Browser import accepts regular files only.');
      }
      const source = await realpath(selectedPath);
      const name = path.basename(source);
      if (!isPortableVisibleEntryName(name)) {
        throw new Error('Resource Browser import requires a visible portable file name.');
      }
      return { source, name, destination: path.join(absoluteParent, name) };
    }),
  );
  if (new Set(sources.map((source) => source.name)).size !== sources.length) {
    throw new Error('Resource Browser import contains duplicate file names.');
  }
  await Promise.all(sources.map((source) => assertPathAbsent(source.destination)));

  const staging = path.join(absoluteParent, `.neko-import-${randomUUID()}.tmp`);
  const published: string[] = [];
  await mkdir(staging);
  try {
    for (const source of sources) {
      await copyFile(source.source, path.join(staging, source.name), COPYFILE_EXCL);
    }
    for (const source of sources) {
      await link(path.join(staging, source.name), source.destination);
      published.push(source.destination);
    }
  } catch (error: unknown) {
    await Promise.all(published.map((target) => rm(target, { force: true })));
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function isPortableVisibleEntryName(name: string): boolean {
  return (
    Boolean(name) &&
    name !== '.' &&
    name !== '..' &&
    !name.startsWith('.') &&
    !/[\\/\0]/u.test(name)
  );
}

async function assertPathAbsent(target: string): Promise<void> {
  try {
    await lstat(target);
  } catch (error: unknown) {
    if (readErrorCode(error) === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Resource Browser destination '${path.basename(target)}' already exists.`);
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
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
  const normalizedQuery = input.query.trim().toLocaleLowerCase();
  const memberships = await input.memberships.listActive();
  const items = await Promise.all(
    memberships.map(async (membership) => {
      if (
        normalizedQuery.length > 0 &&
        !membership.label.toLocaleLowerCase().includes(normalizedQuery) &&
        !membership.sourceRelativePath.toLocaleLowerCase().includes(normalizedQuery)
      ) {
        return undefined;
      }
      const absolutePath = path.resolve(
        input.globalAssetRoot,
        ...membership.sourceRelativePath.split('/'),
      );
      const current = await readAssetFileMetadata(absolutePath);
      const modifiedAt = current?.modifiedAt ?? membership.modifiedAt ?? undefined;
      const byteLength = current?.byteLength ?? membership.byteLength ?? undefined;
      const mediaType =
        membership.mediaType ?? detectGlobalAssetMediaType(membership.sourceRelativePath);
      const thumbnail = current
        ? createGlobalLibraryThumbnailDescriptor({
            owner: 'global-asset-library',
            itemId: membership.membershipId,
            mediaType,
            modifiedAt,
            byteLength,
          })
        : undefined;
      return {
        id: membership.membershipId,
        owner: 'global-asset-library' as const,
        label: membership.label,
        description: membership.sourceRelativePath,
        kind: 'asset' as const,
        ...(mediaType ? { mediaType } : {}),
        ...(byteLength === undefined ? {} : { byteLength }),
        ...(modifiedAt ? { modifiedAt } : {}),
        availability: current ? ('available' as const) : ('unavailable' as const),
        ...(current
          ? {}
          : {
              unavailable: {
                fieldNames: ['sourceRelativePath'],
                message: 'Asset source file is unavailable.',
              },
            }),
        ...(thumbnail ? { thumbnail } : {}),
      };
    }),
  );
  return items.flatMap((item) => (item ? [item] : []));
}

async function initializeGlobalAssetMembershipInventory(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly memberships: AssetLibraryMembershipRepository;
}): Promise<void> {
  const entries = await readGlobalAssetEntries({
    globalAssetRoot: input.globalAssetRoot,
    files: input.files,
    query: '',
  });
  const registeredAt = new Date().toISOString();
  await input.memberships.registerDiscovered(
    entries.flatMap((entry) => {
      if (entry.role !== 'content' || entry.locator.kind !== 'workspace-file') return [];
      return [
        {
          membershipId: randomUUID(),
          sourceRelativePath: entry.locator.path,
          label: entry.label,
          mediaType: entry.metadata?.mediaType ?? null,
          byteLength: entry.metadata?.byteLength ?? null,
          modifiedAt: entry.metadata?.modifiedAt ?? null,
          registeredAt,
        },
      ];
    }),
  );
}

async function readAssetFileMetadata(
  absolutePath: string,
): Promise<{ readonly byteLength: number; readonly modifiedAt: string } | undefined> {
  try {
    const entry = await lstat(absolutePath);
    if (!entry.isFile() || entry.isSymbolicLink()) return undefined;
    return { byteLength: entry.size, modifiedAt: entry.mtime.toISOString() };
  } catch (error: unknown) {
    if (readErrorCode(error) === 'ENOENT') return undefined;
    throw error;
  }
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
  readonly memberships?: AssetLibraryMembershipRepository;
  readonly item: Parameters<ResourceBrowserInteractionPort['preview']>[0]['item'];
}): Promise<string> {
  if (input.item.facet === 'assets') {
    return resolveGlobalAssetItemPath({
      globalAssetRoot: input.globalAssetRoot,
      memberships: requireAssetLibraryMemberships(input.memberships),
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

function requireAssetLibraryMemberships(
  memberships: AssetLibraryMembershipRepository | undefined,
): AssetLibraryMembershipRepository {
  if (!memberships) throw new Error('Asset Library membership repository is unavailable.');
  return memberships;
}

export function detectGlobalAssetMediaType(filePath: string): string | undefined {
  const classification = classifyContent(filePath, true);
  return classification.include ? classification.mediaType : undefined;
}

function readErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : undefined;
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
