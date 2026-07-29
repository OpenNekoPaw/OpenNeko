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

export function createDesktopResourceBrowserReadSource(
  options: DesktopResourceBrowserReadSourceOptions,
): ResourceBrowserProjectionSource {
  return {
    files: {
      list: async ({ query, limit }) =>
        listWorkspaceProjection(options, query, limit, false),
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
