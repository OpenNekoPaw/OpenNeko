import * as path from 'node:path';
import type { NekoHostPorts } from '@neko/host/ports';
import {
  detectPreviewContentKind,
  type PreviewContentKind,
} from '@neko-preview/contracts';
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
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';
import { resolveDesktopWorkspaceContentLocator } from './desktop-content-locator';
import { readDesktopConfirmedEntityResources } from './desktop-entity-resource-query';
import type {
  DesktopHomeAssetFacet,
  DesktopHomeAssetItem,
  DesktopHomeAssetSort,
  DesktopHomeSortDirection,
} from '../shared/home-management-contract';

const FILE_SCAN_LIMIT = 5_000;
export const DESKTOP_GLOBAL_MEDIA_LIBRARY_STAGING_PREFIX = '.openneko-import-';
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
  readonly facet: DesktopHomeAssetFacet;
  readonly query: string;
  readonly sortBy: DesktopHomeAssetSort;
  readonly sortDirection: DesktopHomeSortDirection;
  readonly limit: number;
}): Promise<readonly DesktopHomeAssetItem[]> {
  await input.files.createDirectory(input.globalAssetRoot);
  const normalizedQuery = input.query.trim().toLocaleLowerCase();
  const items =
    input.facet === 'libraries'
      ? await readGlobalLibraries(input, normalizedQuery)
      : await readGlobalAssets(input);
  return items
    .sort((left, right) => compareGlobalAssetItems(left, right, input))
    .slice(0, input.limit);
}

export function createDesktopGlobalMediaLibraryId(libraryName: string): string {
  return `library:${requireDesktopGlobalMediaLibraryName(libraryName)}`;
}

export function parseDesktopGlobalMediaLibraryId(libraryId: string): string {
  if (!libraryId.startsWith('library:')) {
    throw new Error('Desktop global media-library identity is invalid.');
  }
  return requireDesktopGlobalMediaLibraryName(libraryId.slice('library:'.length));
}

export async function requireDesktopGlobalMediaLibraryPath(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly libraryId: string;
}): Promise<string> {
  const libraryName = parseDesktopGlobalMediaLibraryId(input.libraryId);
  await input.files.createDirectory(input.globalAssetRoot);
  const entry = (await input.files.readDirectory(input.globalAssetRoot)).find(
    (candidate) => candidate.name === libraryName,
  );
  if (!entry) {
    throw new Error(`Desktop global media library '${libraryName}' does not exist.`);
  }
  if (entry.type !== 'directory') {
    throw new Error(`Desktop global media library '${libraryName}' is not a physical directory.`);
  }
  return path.join(input.globalAssetRoot, libraryName);
}

export async function importDesktopGlobalMediaLibrary(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly sourceDirectory: string;
  readonly operationId: string;
  readonly copyDirectory: (sourceDirectory: string, destinationDirectory: string) => Promise<void>;
}): Promise<{ readonly libraryId: string }> {
  await input.files.createDirectory(input.globalAssetRoot);
  const libraryName = requireDesktopGlobalMediaLibraryName(path.basename(input.sourceDirectory));
  const existingEntry = (await input.files.readDirectory(input.globalAssetRoot)).find(
    (candidate) => candidate.name === libraryName,
  );
  if (existingEntry) {
    throw new Error(`Desktop global media library '${libraryName}' already exists.`);
  }
  const stagingName = `${DESKTOP_GLOBAL_MEDIA_LIBRARY_STAGING_PREFIX}${requireOperationId(input.operationId)}`;
  const stagingPath = path.join(input.globalAssetRoot, stagingName);
  const destinationPath = path.join(input.globalAssetRoot, libraryName);
  try {
    await input.copyDirectory(input.sourceDirectory, stagingPath);
    const entriesBeforePublish = await input.files.readDirectory(input.globalAssetRoot);
    if (entriesBeforePublish.some((entry) => entry.name === libraryName)) {
      throw new Error(`Desktop global media library '${libraryName}' already exists.`);
    }
    await input.files.rename(stagingPath, destinationPath);
  } catch (error: unknown) {
    await input.files.delete(stagingPath, { recursive: true, idempotent: true });
    throw error;
  }
  return { libraryId: createDesktopGlobalMediaLibraryId(libraryName) };
}

export async function trashDesktopGlobalMediaLibrary(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly libraryId: string;
  readonly trashDirectory: (absolutePath: string) => Promise<void>;
}): Promise<void> {
  const absolutePath = await requireDesktopGlobalMediaLibraryPath(input);
  await input.trashDirectory(absolutePath);
}

export async function revealDesktopGlobalMediaLibrary(input: {
  readonly globalAssetRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly libraryId: string;
  readonly revealPath: (absolutePath: string) => Promise<void>;
}): Promise<void> {
  const absolutePath = await requireDesktopGlobalMediaLibraryPath(input);
  await input.revealPath(absolutePath);
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
      search: async ({ query, limit }) =>
        listWorkspaceProjection(options, query, limit, true),
      children: async ({ parent, limit }) =>
        readMediaLibraryChildren(options, parent, limit),
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
    async addSource({ identity }): Promise<'added' | 'cancelled'> {
      const selectedDirectory = await options.selectSource(identity.windowId);
      if (!selectedDirectory) return 'cancelled';
      await createWorkspaceLinkedMediaLibrary({
        workspaceRoot: options.workspace.workspacePath,
        name: path.basename(selectedDirectory),
        targetDirectory: selectedDirectory,
      });
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
      const absolutePath = await resolveAuthorizedItemPath(options.workspace, item);
      await options.openPreview({ identity, item, absolutePath, target });
    },
    async openCut({ identity, item }): Promise<void> {
      const absolutePath = await resolveAuthorizedItemPath(options.workspace, item);
      await options.openCut({ identity, item, absolutePath });
    },
    async reveal({ item }): Promise<void> {
      const absolutePath = await resolveAuthorizedItemPath(options.workspace, item);
      const external = options.host.external;
      if (!external?.revealPath) {
        throw new Error('Desktop Resource Browser reveal capability is unavailable.');
      }
      await external.revealPath(absolutePath);
    },
    async resolveThumbnail({ item }): Promise<string> {
      const absolutePath = await resolveAuthorizedItemPath(options.workspace, item);
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
    const libraries = await listWorkspaceLinkedMediaLibraries(
      options.workspace.workspacePath,
    );
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
        availability:
          library.availability === 'available' ? 'available' : 'unavailable',
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
        `${library.name} ${library.workspacePath}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      if (
        library.availability !== 'available' ||
        entries.length >= limit ||
        !normalizedQuery
      ) {
        if (!libraryMatchesQuery) entries.splice(rootIndex, 1);
        continue;
      }
      const absoluteRoot = path.join(
        options.workspace.workspacePath,
        ...library.workspacePath.split('/'),
      );
      entries.push(...(await searchResourceBrowserContentTree({
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
      })));
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
  const libraries = await listWorkspaceLinkedMediaLibraries(
    options.workspace.workspacePath,
  );
  const library = libraries.find(
    (candidate) =>
      candidate.name === parent.libraryName ||
      parentPath === candidate.workspacePath ||
      parentPath.startsWith(`${candidate.workspacePath}/`),
  );
  if (!library || library.availability !== 'available') {
    throw new Error('Resource Browser Media parent library is unavailable.');
  }
  const absoluteRoot = await resolveDesktopWorkspaceContentLocator(
    options.workspace,
    { kind: 'workspace-file', path: library.workspacePath },
  );
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

async function readGlobalLibraries(
  input: Parameters<typeof searchDesktopGlobalAssetCatalog>[0],
  normalizedQuery: string,
): Promise<DesktopHomeAssetItem[]> {
  const entries = await input.files.readDirectory(input.globalAssetRoot);
  const libraries = entries.filter(
    (entry) =>
      entry.type === 'directory' &&
      !entry.name.startsWith(DESKTOP_GLOBAL_MEDIA_LIBRARY_STAGING_PREFIX) &&
      (normalizedQuery.length === 0 || entry.name.toLocaleLowerCase().includes(normalizedQuery)),
  );
  return Promise.all(
    libraries.map(async (entry) => {
      const stat = await input.files.stat(path.join(input.globalAssetRoot, entry.name));
      return {
        id: createDesktopGlobalMediaLibraryId(entry.name),
        label: entry.name,
        description: '.',
        kind: 'library' as const,
        mediaType: 'directory',
        ...(stat.modifiedAtMs === undefined
          ? {}
          : { modifiedAt: new Date(stat.modifiedAtMs).toISOString() }),
        availability: 'available' as const,
      };
    }),
  );
}

function requireDesktopGlobalMediaLibraryName(value: string): string {
  if (
    value.length === 0 ||
    value !== value.normalize('NFC') ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    value.startsWith(DESKTOP_GLOBAL_MEDIA_LIBRARY_STAGING_PREFIX)
  ) {
    throw new Error('Desktop global media-library name is invalid.');
  }
  return value;
}

function requireOperationId(value: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(value)) {
    throw new Error('Desktop global media-library operation identity is invalid.');
  }
  return value;
}

async function readGlobalAssets(
  input: Parameters<typeof searchDesktopGlobalAssetCatalog>[0],
): Promise<DesktopHomeAssetItem[]> {
  const entries = await searchResourceBrowserContentTree({
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
  return entries.flatMap((entry) => {
    if (entry.role !== 'content') return [];
    if (entry.locator.kind !== 'workspace-file') {
      throw new Error('Desktop global asset catalog produced a non-file locator.');
    }
    if (entry.locator.path.split('/')[0]?.startsWith(DESKTOP_GLOBAL_MEDIA_LIBRARY_STAGING_PREFIX)) {
      return [];
    }
    return [
      {
        id: `asset:${entry.locator.path}`,
        label: entry.label,
        ...(entry.description ? { description: entry.description } : {}),
        kind: 'asset' as const,
        ...(entry.metadata?.mediaType ? { mediaType: entry.metadata.mediaType } : {}),
        ...(entry.metadata?.modifiedAt ? { modifiedAt: entry.metadata.modifiedAt } : {}),
        availability: entry.availability,
      },
    ];
  });
}

function compareGlobalAssetItems(
  left: DesktopHomeAssetItem,
  right: DesktopHomeAssetItem,
  input: Pick<Parameters<typeof searchDesktopGlobalAssetCatalog>[0], 'sortBy' | 'sortDirection'>,
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

async function resolveAuthorizedItemPath(
  workspace: DesktopWorkspaceResolution,
  item: Parameters<ResourceBrowserInteractionPort['preview']>[0]['item'],
): Promise<string> {
  const locator =
    item.facet === 'entities' ? item.representationLocator : item.locator;
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
