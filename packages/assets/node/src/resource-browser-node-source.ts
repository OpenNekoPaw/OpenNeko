import { createHash, randomUUID } from 'node:crypto';
import { copyFile, link, lstat, realpath, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import type { NekoHostPorts } from '@neko/host/ports';
import { detectPreviewContentKind, type PreviewContentKind } from '@neko/preview-domain';
import type {
  ResourceBrowserContentEntry,
  ResourceBrowserInteractionPort,
  ResourceBrowserMediaEntry,
  ResourceBrowserMediaLibraryRootEntry,
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
  ResourceBrowserMediaLibraryRootItem,
  ResourceBrowserMediaLibraryStatus,
} from '@neko/assets-domain/resource-browser/contract';
import { presentResourceBrowserContentItem } from '@neko/assets-domain/resource-browser/presenter';
import { assertResourceBrowserProjectStorageMutable } from '@neko/assets-domain/resource-browser';
import {
  createGlobalLibraryOpaqueId,
  createGlobalLibraryThumbnailDescriptor,
  type GlobalAssetItem,
  type GlobalLibraryCatalogSort,
  type GlobalLibrarySortDirection,
  type GlobalMediaLibraryItem,
} from '@neko/assets-domain/global-library/contract';
import type { AssetLibraryMembershipRepository } from '@neko/assets-domain/global-library/membership';
import {
  confirmProjectMediaLibraryRecovery,
  type AssetWorkspaceResolution,
  type ProjectMediaLibraryAvailability,
} from '@neko/assets-domain/contracts';
import { resolveWorkspaceContentLocator } from './workspace-content-locator';
import {
  materializeWorkspaceLinkedMediaLibrary,
  removeExactWorkspaceLinkedMediaLibrary,
  removeWorkspaceLinkedMediaLibraryProjection,
  restoreWorkspaceLinkedMediaLibrary,
} from './workspace-linked-media-libraries';
import { ProjectMediaLibraryAvailabilityService } from './project-media-library-availability-service';
import {
  createGlobalMediaLibraryConnection,
  listGlobalMediaLibraryConnections,
  removeGlobalMediaLibraryConnection,
  resolveGlobalMediaLibraryTarget,
  type GlobalMediaLibraryConnection,
} from './global-media-library-files';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import { ProjectMediaLibraryBindingService } from './project-media-library-binding-service';
import { initializeProjectMediaLibraryBindings } from './project-media-library-initialization';
import {
  resolveProjectMediaLibraryContentPath,
  resolveProjectMediaLibraryRootPath,
} from './project-content-read-service';
import { parseWorkspaceMediaLibraryPath } from './project-media-library-content-handler';
import {
  CreativeDocumentCreationService,
  WorkspaceEntryCreationService,
} from '@neko/content/project-file-io';
import {
  NodeAuthorizedWorkspaceDirectoryCreator,
  NodeAuthorizedWorkspaceWriter,
} from '@neko/content/node';
import {
  createEmptyCanvasDocumentBytes,
  isValidCanvasDocumentBytes,
} from '@neko/canvas-domain/project-file-io';
import { createEmptyCutDocumentBytes, isValidCutDocumentBytes } from '@neko/cut-domain';
import { isWorkspaceFileContentLocator, type WorkspaceFileContentLocator } from '@neko/content';

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
const EXCLUDED_WORKSPACE_LOCATOR_PATHS = new Set(['neko/assets']);

export interface ResourceBrowserNodeSourceOptions {
  readonly projectId: string;
  readonly globalAssetRoot: string;
  readonly assetLibraryMemberships?: AssetLibraryMembershipRepository;
  readonly globalMediaLibraryRoot: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly host: Pick<NekoHostPorts, 'files' | 'external'>;
  readonly openPreview: (input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserItem;
    readonly absolutePath: string;
    readonly target: Parameters<ResourceBrowserInteractionPort['preview']>[0]['target'];
  }) => Promise<void>;
  readonly openCreativeDocument: (input: {
    readonly identity: ResourceBrowserIdentity;
    readonly item: ResourceBrowserContentItem;
    readonly absolutePath: string;
    readonly kind: 'canvas' | 'cut';
  }) => Promise<void>;
  readonly openTextEditor: ResourceBrowserInteractionPort['editText'];
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
}

export type ResourceBrowserNodeReadSourceOptions = Pick<
  ResourceBrowserNodeSourceOptions,
  | 'projectId'
  | 'globalAssetRoot'
  | 'globalMediaLibraryRoot'
  | 'assetLibraryMemberships'
  | 'workspace'
  | 'host'
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
      list: async ({ query, limit }) => listWorkspaceProjection(options, query, limit),
      children: async ({ parent, limit }) =>
        readResourceBrowserContentChildren({
          absoluteRoot: options.workspace.workspacePath,
          absoluteDirectory: await resolveWorkspaceContentLocator(
            options.workspace,
            requireWorkspaceFileLocator(parent),
          ),
          locatorPrefix: '',
          limit: Math.min(limit, FILE_SCAN_LIMIT),
          rootDepth: -1,
          excludedDirectoryNames: EXCLUDED_DIRECTORIES,
          excludedLocatorPaths: EXCLUDED_WORKSPACE_LOCATOR_PATHS,
          files: options.host.files,
          joinAbsolutePath: path.join,
          relativePath: path.relative,
          classify: (locatorPath) => classifyContent(locatorPath, false),
        }),
    },
    media: {
      search: async ({ query, limit }) => listProjectMediaProjection(options, query, limit),
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
    async refresh(): Promise<void> {
      // Sources are read-through; refresh invalidates no package-local catalog or cache.
    },
  };
}

export async function searchProjectMediaLibraryWorkspaceLocators(input: {
  readonly projectId: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly globalMediaLibraryRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
  readonly limit: number;
}): Promise<readonly WorkspaceFileContentLocator[]> {
  return (await searchProjectMediaLibraryContentEntries(input)).flatMap((entry) =>
    entry.role === 'content' &&
    isWorkspaceFileContentLocator(entry.locator) &&
    entry.locator.selector === undefined
      ? [entry.locator]
      : [],
  );
}

export async function searchProjectMediaLibraryContentEntries(input: {
  readonly projectId: string;
  readonly workspace: AssetWorkspaceResolution;
  readonly globalMediaLibraryRoot: string;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
  readonly limit: number;
}): Promise<readonly ResourceBrowserContentEntry[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error('Project Media Library search limit must be a positive integer.');
  }
  await initializeProjectMediaLibraryBindings({
    projectId: input.projectId,
    workspaceRoot: input.workspace.workspacePath,
    globalMediaLibraryRoot: input.globalMediaLibraryRoot,
  });
  const entries: ResourceBrowserContentEntry[] = [];
  const libraries = (
    await new ProjectMediaLibraryAvailabilityService({
      projectId: input.projectId,
      workspaceRoot: input.workspace.workspacePath,
      globalMediaLibraryRoot: input.globalMediaLibraryRoot,
    }).inspect()
  ).libraries;
  for (const library of libraries) {
    if (entries.length >= input.limit) break;
    if (library.state !== 'available' && library.state !== 'unreferenced-local-binding') continue;
    const absoluteRoot = await resolveProjectMediaLibraryRootPath(
      {
        projectId: input.projectId,
        workspaceRoot: input.workspace.workspacePath,
        globalMediaLibraryRoot: input.globalMediaLibraryRoot,
      },
      library.libraryName,
    );
    const found = await searchResourceBrowserContentTree({
      absoluteRoot,
      locatorPrefix: '',
      query: input.query,
      limit: Math.min(input.limit - entries.length, FILE_SCAN_LIMIT),
      rootDepth: 0,
      libraryName: library.libraryName,
      excludedDirectoryNames: EXCLUDED_DIRECTORIES,
      files: input.files,
      joinAbsolutePath: path.join,
      relativePath: path.relative,
      classify: (locatorPath) => classifyContent(locatorPath, true),
    });
    entries.push(
      ...found.map((entry) => {
        const { parentLocator: _parentLocator, ...flat } = projectBoundMediaEntry(
          library.libraryName,
          entry,
        );
        return { ...flat, depth: 0 };
      }),
    );
  }
  return entries;
}

export async function searchWorkspaceContentEntries(input: {
  readonly workspace: AssetWorkspaceResolution;
  readonly files: NekoHostPorts['files'];
  readonly query: string;
  readonly limit: number;
}): Promise<readonly ResourceBrowserContentEntry[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error('Workspace content search limit must be a positive integer.');
  }
  const readInput = {
    absoluteRoot: input.workspace.workspacePath,
    locatorPrefix: '',
    limit: Math.min(input.limit, FILE_SCAN_LIMIT),
    rootDepth: -1,
    excludedDirectoryNames: EXCLUDED_DIRECTORIES,
    excludedLocatorPaths: EXCLUDED_WORKSPACE_LOCATOR_PATHS,
    files: input.files,
    joinAbsolutePath: path.join,
    relativePath: path.relative,
    classify: (locatorPath: string) => classifyContent(locatorPath, false),
  };
  return input.query.trim()
    ? searchResourceBrowserContentTree({ ...readInput, query: input.query })
    : readResourceBrowserContentChildren(readInput);
}

export function createResourceBrowserNodeProjectionSource(
  options: ResourceBrowserNodeSourceOptions,
): {
  readonly source: ResourceBrowserProjectionSource;
  readonly interactions: ResourceBrowserInteractionPort;
} {
  const source = createResourceBrowserNodeReadSource(options);
  const mediaAvailability = projectMediaLibraryAvailability(options);
  const mediaBindings = new ProjectMediaLibraryBindingRepository(
    options.workspace.workspacePath,
    options.projectId,
  );
  const mediaBindingService = new ProjectMediaLibraryBindingService({
    projectId: options.projectId,
    bindings: mediaBindings,
    connections: {
      resolveAuthorizedTarget: (connectionId) =>
        resolveGlobalMediaLibraryTarget({
          mediaLibraryRoot: options.globalMediaLibraryRoot,
          libraryId: connectionId,
        }),
    },
    requirements: { read: (libraryName) => mediaAvailability.readRequirement(libraryName) },
    workspaceProjection: {
      materialize: ({ libraryName, targetDirectory }) =>
        materializeWorkspaceLinkedMediaLibrary({
          workspaceRoot: options.workspace.workspacePath,
          name: libraryName,
          targetDirectory,
        }),
      remove: ({ libraryName, targetDirectory }) =>
        targetDirectory
          ? removeExactWorkspaceLinkedMediaLibrary({
              workspaceRoot: options.workspace.workspacePath,
              name: libraryName,
              targetDirectory,
            })
          : removeWorkspaceLinkedMediaLibraryProjection({
              workspaceRoot: options.workspace.workspacePath,
              name: libraryName,
            }),
      restore: ({ libraryName, previous }) =>
        restoreWorkspaceLinkedMediaLibrary({
          workspaceRoot: options.workspace.workspacePath,
          name: libraryName,
          previous,
        }),
    },
  });
  const workspaceWriter = new NodeAuthorizedWorkspaceWriter({
    workspaceRoot: options.workspace.workspacePath,
  });
  const workspaceEntryCreation = new WorkspaceEntryCreationService({
    writer: workspaceWriter,
    directoryCreator: new NodeAuthorizedWorkspaceDirectoryCreator({
      workspaceRoot: options.workspace.workspacePath,
    }),
  });
  const creativeDocumentCreation = new CreativeDocumentCreationService({
    writer: workspaceWriter,
    owners: {
      canvas: {
        extension: '.nkc',
        createBytes: createEmptyCanvasDocumentBytes,
        validateBytes: isValidCanvasDocumentBytes,
      },
      cut: {
        extension: '.otio',
        createBytes: createEmptyCutDocumentBytes,
        validateBytes: isValidCutDocumentBytes,
      },
    },
  });

  const interactions: ResourceBrowserInteractionPort = {
    async createCreativeDocument({ identity, parent, kind, name }) {
      const targetDirectory = await resolveWorkspaceFileParent(options.workspace, parent);
      assertResourceBrowserProjectStorageMutable(joinWorkspaceEntryPath(targetDirectory, name));
      const result = await creativeDocumentCreation.create({ kind, targetDirectory, name });
      if (result.status === 'unavailable') {
        throw new Error(`Creative document creation failed: ${result.diagnostic.code}.`);
      }
      const item = presentCreatedCreativeDocument(result.path, kind);
      const absolutePath = await resolveWorkspaceContentLocator(
        options.workspace,
        requireWorkspaceFileLocator(item),
      );
      try {
        await options.openCreativeDocument({ identity, item, absolutePath, kind });
        return { status: 'opened' };
      } catch (error) {
        return {
          status: 'created',
          diagnostic: {
            code: 'creative-document-open-failed',
            message: `Created '${item.label}', but its editor could not open: ${asError(error).message}`,
            recordId: item.resourceId,
          },
        };
      }
    },
    async createFile({ parent, name }): Promise<void> {
      await createWorkspaceEntry('file', parent, name);
    },
    async createDirectory({ parent, name }): Promise<void> {
      await createWorkspaceEntry('directory', parent, name);
    },
    async importFiles({ identity, parent }): Promise<'imported' | 'cancelled'> {
      const selectedFiles = await options.selectWorkspaceFiles(identity.windowId);
      if (!selectedFiles || selectedFiles.length === 0) return 'cancelled';
      const targetDirectory = await resolveWorkspaceFileParent(options.workspace, parent);
      await importWorkspaceFiles({
        workspaceRoot: options.workspace.workspacePath,
        targetDirectory,
        sourcePaths: selectedFiles,
      });
      return 'imported';
    },
    async trashContent({ item }): Promise<void> {
      assertResourceBrowserProjectStorageMutable(requireWorkspaceFileLocator(item).file.path);
      const absolutePath = await resolveWorkspaceContentLocator(
        options.workspace,
        requireWorkspaceFileLocator(item),
      );
      const workspaceRoot = await realpath(options.workspace.workspacePath);
      if (absolutePath === workspaceRoot || !isPathInside(absolutePath, workspaceRoot)) {
        throw new Error('Resource Browser Trash target escapes the authorized Workspace.');
      }
      await options.trashWorkspaceItem(absolutePath);
    },
    async linkGlobalLibrary({ identity }): Promise<'linked' | 'cancelled'> {
      const availableLibraries = (
        await listGlobalMediaLibraryConnections(options.globalMediaLibraryRoot)
      ).filter((library) => library.availability === 'available');
      if (availableLibraries.length === 0) {
        throw new Error('No available global Media Library can be associated.');
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
      if (!library) throw new Error('Selected global Media Library identity is stale.');
      await associateMediaLibrary(library.name, library.libraryId);
      return 'linked';
    },
    async addDirectoryLibrary({ identity }): Promise<'added' | 'cancelled'> {
      const selectedDirectory = await options.selectSource(identity.windowId);
      if (!selectedDirectory) return 'cancelled';
      await options.mutateGlobalMediaLibraries(async () => {
        const created = await createGlobalMediaLibraryConnection({
          mediaLibraryRoot: options.globalMediaLibraryRoot,
          sourceDirectory: selectedDirectory,
          locationKind: 'local',
        });
        try {
          const connection = (
            await listGlobalMediaLibraryConnections(options.globalMediaLibraryRoot)
          ).find((candidate) => candidate.libraryId === created.libraryId);
          if (!connection || connection.availability !== 'available') {
            throw new Error('New global Media Library connection is unavailable.');
          }
          await associateMediaLibrary(connection.name, connection.libraryId);
        } catch (error) {
          await removeGlobalMediaLibraryConnection({
            mediaLibraryRoot: options.globalMediaLibraryRoot,
            libraryId: created.libraryId,
          });
          throw error;
        }
      });
      return 'added';
    },
    async relinkSource({ identity, item }): Promise<'relinked' | 'cancelled'> {
      const libraryName = requireManagedLibraryRootName(item);
      const availableLibraries = (
        await listGlobalMediaLibraryConnections(options.globalMediaLibraryRoot)
      ).filter((library) => library.availability === 'available');
      const connectionId = await options.selectGlobalLibrary({
        windowId: identity.windowId,
        libraries: availableLibraries.map(({ libraryId, name, locationKind }) => ({
          libraryId,
          name,
          locationKind,
        })),
      });
      if (!connectionId) return 'cancelled';
      if (!availableLibraries.some((library) => library.libraryId === connectionId)) {
        throw new Error('Selected global Media Library identity is stale.');
      }
      await associateMediaLibrary(libraryName, connectionId);
      return 'relinked';
    },
    async removeSource({ item }): Promise<void> {
      const libraryName = requireManagedLibraryRootName(item);
      const current = await mediaBindings.read(libraryName);
      if (current.status !== 'available') {
        throw new Error('Project Media Library binding is unavailable for removal.');
      }
      await mediaBindingService.remove({
        libraryName,
        expectedBindingFingerprint: current.binding.bindingFingerprint,
      });
    },
    async preview({ identity, item, target }): Promise<void> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        projectId: options.projectId,
        globalAssetRoot: options.globalAssetRoot,
        globalMediaLibraryRoot: options.globalMediaLibraryRoot,
        memberships: options.assetLibraryMemberships,
        item,
      });
      await options.openPreview({ identity, item, absolutePath, target });
    },
    editText: options.openTextEditor,
    async openCreativeDocument({ identity, item }): Promise<void> {
      if (!isWorkspaceFileContentLocator(item.locator) || item.locator.selector) {
        throw new Error('Resource Browser creative-document open requires a Workspace file.');
      }
      const kind = creativeDocumentKindForPath(item.locator.file.path);
      if (!kind) {
        throw new Error('Resource Browser creative-document open requires an NKC or OTIO file.');
      }
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        projectId: options.projectId,
        globalAssetRoot: options.globalAssetRoot,
        globalMediaLibraryRoot: options.globalMediaLibraryRoot,
        memberships: options.assetLibraryMemberships,
        item,
      });
      await options.openCreativeDocument({ identity, item, absolutePath, kind });
    },
    async reveal({ item }): Promise<void> {
      const absolutePath = await resolveResourceBrowserItemPath({
        workspace: options.workspace,
        projectId: options.projectId,
        globalAssetRoot: options.globalAssetRoot,
        globalMediaLibraryRoot: options.globalMediaLibraryRoot,
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
        projectId: options.projectId,
        globalAssetRoot: options.globalAssetRoot,
        globalMediaLibraryRoot: options.globalMediaLibraryRoot,
        memberships: options.assetLibraryMemberships,
        item,
      });
      return options.createThumbnail(absolutePath);
    },
    addToCanvas: options.addToCanvas,
    addToCut: options.addToCut,
  };
  return { source, interactions };

  async function createWorkspaceEntry(
    kind: 'file' | 'directory',
    parent: ResourceBrowserContentItem | undefined,
    name: string,
  ): Promise<void> {
    const targetDirectory = await resolveWorkspaceFileParent(options.workspace, parent);
    assertResourceBrowserProjectStorageMutable(joinWorkspaceEntryPath(targetDirectory, name));
    const result = await workspaceEntryCreation.create({ kind, targetDirectory, name });
    if (result.status === 'unavailable') {
      if (result.diagnostic.code === 'reserved-creative-document-extension') {
        const action = result.diagnostic.requiredKind === 'canvas' ? 'New Canvas' : 'New Cut';
        throw new Error(`Workspace entry creation requires ${action} for this file extension.`);
      }
      throw new Error(`Workspace entry creation failed: ${result.diagnostic.code}.`);
    }
  }

  async function associateMediaLibrary(libraryName: string, connectionId: string): Promise<void> {
    const requirement = await mediaAvailability.readRequirement(libraryName);
    if (!requirement) {
      await mediaBindingService.associate({ libraryName, connectionId });
      return;
    }
    await mediaBindingService.apply(
      confirmProjectMediaLibraryRecovery(
        await mediaBindingService.plan({ libraryName, connectionId }),
      ),
    );
  }
}

async function importWorkspaceFiles(input: {
  readonly workspaceRoot: string;
  readonly targetDirectory: string;
  readonly sourcePaths: readonly string[];
}): Promise<void> {
  const workspaceRoot = await realpath(input.workspaceRoot);
  const absoluteTarget = input.targetDirectory
    ? path.resolve(workspaceRoot, ...input.targetDirectory.split('/'))
    : workspaceRoot;
  const targetEntry = await lstat(absoluteTarget);
  if (
    !targetEntry.isDirectory() ||
    targetEntry.isSymbolicLink() ||
    (absoluteTarget !== workspaceRoot && !isPathInside(absoluteTarget, workspaceRoot))
  ) {
    throw new Error('Project file import target is outside the authorized Workspace.');
  }

  for (const sourcePath of input.sourcePaths) {
    const label = path.basename(sourcePath);
    let sourceEntry;
    try {
      sourceEntry = await lstat(sourcePath);
    } catch {
      throw new Error(`Selected import '${label}' is unavailable.`);
    }
    if (!sourceEntry.isFile() || sourceEntry.isSymbolicLink()) {
      throw new Error(`Selected import '${label}' must be a regular file.`);
    }
    const source = await realpath(sourcePath);
    await copyWorkspaceImportFile({
      absoluteTarget,
      label,
      source,
      targetDirectory: input.targetDirectory,
    });
  }
}

async function copyWorkspaceImportFile(input: {
  readonly absoluteTarget: string;
  readonly label: string;
  readonly source: string;
  readonly targetDirectory: string;
}): Promise<void> {
  const parsed = path.parse(input.label.normalize('NFC'));
  if (!parsed.base || parsed.base === '.' || parsed.base === '..' || parsed.base.includes('\0')) {
    throw new Error('Selected import has an invalid file name.');
  }
  for (let attempt = 1; attempt <= 1_000; attempt += 1) {
    const label = attempt === 1 ? parsed.base : `${parsed.name} (${attempt})${parsed.ext}`;
    assertResourceBrowserProjectStorageMutable(
      joinWorkspaceEntryPath(input.targetDirectory, label),
    );
    const destination = path.join(input.absoluteTarget, label);
    const temporary = path.join(input.absoluteTarget, `.${label}.${randomUUID()}.import`);
    try {
      await copyFile(input.source, temporary);
      await link(temporary, destination);
      return;
    } catch (error) {
      if (readErrorCode(error) !== 'EEXIST') {
        throw new Error(`Could not import '${input.label}'.`);
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  throw new Error(`Could not choose a unique project name for '${input.label}'.`);
}

async function resolveWorkspaceFileParent(
  workspace: AssetWorkspaceResolution,
  parent: ResourceBrowserContentItem | undefined,
): Promise<string> {
  const workspaceRoot = await realpath(workspace.workspacePath);
  if (!parent) return '';
  if (parent.source !== 'files' || parent.kind !== 'directory') {
    throw new Error('Resource Browser Workspace File parent must be a Files directory.');
  }
  const absoluteParent = await resolveWorkspaceContentLocator(
    workspace,
    requireWorkspaceFileLocator(parent),
  );
  const entry = await lstat(absoluteParent);
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    !isPathInside(absoluteParent, workspaceRoot)
  ) {
    throw new Error('Resource Browser Workspace File parent is outside the authorized Workspace.');
  }
  return path.relative(workspaceRoot, absoluteParent).split(path.sep).join('/');
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

function joinWorkspaceEntryPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function requireManagedLibraryRootName(item: ResourceBrowserItem): string {
  if (item.role !== 'library-root' || !item.libraryName) {
    throw new Error('Resource Browser media library management requires a library root.');
  }
  return item.libraryName;
}

function requireBrowsableMediaLibraryName(
  item: ResourceBrowserContentItem | ResourceBrowserMediaLibraryRootItem,
): string {
  if (item.role === 'library-root' && item.libraryName) return item.libraryName;
  if (
    item.role === 'directory' &&
    item.libraryName &&
    isWorkspaceFileContentLocator(item.locator) &&
    item.locator.selector === undefined &&
    parseWorkspaceMediaLibraryPath(item.locator.file.path)?.libraryName === item.libraryName
  ) {
    return item.libraryName;
  }
  throw new Error('Resource Browser Media parent must use its exact project Media locator.');
}

async function listWorkspaceProjection(
  options: ResourceBrowserNodeReadSourceOptions,
  query: string,
  limit: number,
): Promise<readonly ResourceBrowserContentEntry[]> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const entries: ResourceBrowserContentEntry[] = [];
  const readInput = {
    absoluteRoot: options.workspace.workspacePath,
    locatorPrefix: '',
    limit: Math.min(limit, FILE_SCAN_LIMIT),
    rootDepth: -1,
    excludedDirectoryNames: EXCLUDED_DIRECTORIES,
    excludedLocatorPaths: EXCLUDED_WORKSPACE_LOCATOR_PATHS,
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
  return dedupeProjection(entries).slice(0, limit);
}

async function listProjectMediaProjection(
  options: ResourceBrowserNodeReadSourceOptions,
  query: string,
  limit: number,
): Promise<readonly ResourceBrowserMediaEntry[]> {
  await initializeProjectMediaLibraryBindings({
    projectId: options.projectId,
    workspaceRoot: options.workspace.workspacePath,
    globalMediaLibraryRoot: options.globalMediaLibraryRoot,
  });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const inspection = await projectMediaLibraryAvailability(options).inspect();
  const roots = inspection.libraries.map((library) =>
    projectMediaLibraryRootEntry(
      library,
      inspection.requirements.find((requirement) => requirement.libraryName === library.libraryName)
        ?.referenceCount ?? 0,
      inspection.unavailableRelativePaths.find((entry) => entry.libraryName === library.libraryName)
        ?.relativePaths.length ?? 0,
    ),
  );
  if (!normalizedQuery) return roots.slice(0, limit);
  const content = await searchProjectMediaLibraryContentEntries({
    projectId: options.projectId,
    workspace: options.workspace,
    globalMediaLibraryRoot: options.globalMediaLibraryRoot,
    files: options.host.files,
    query,
    limit,
  });
  const matchingRoots = roots.filter((entry) =>
    `${entry.libraryName} ${entry.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  return [...matchingRoots, ...content].slice(0, limit);
}

async function readMediaLibraryChildren(
  options: ResourceBrowserNodeReadSourceOptions,
  parent: ResourceBrowserContentItem | ResourceBrowserMediaLibraryRootItem,
  limit: number,
): Promise<readonly ResourceBrowserContentEntry[]> {
  await initializeProjectMediaLibraryBindings({
    projectId: options.projectId,
    workspaceRoot: options.workspace.workspacePath,
    globalMediaLibraryRoot: options.globalMediaLibraryRoot,
  });
  const libraryName = requireBrowsableMediaLibraryName(parent);
  const relativeDirectory =
    parent.role === 'library-root'
      ? undefined
      : isWorkspaceFileContentLocator(parent.locator) &&
          parent.locator.selector === undefined &&
          parseWorkspaceMediaLibraryPath(parent.locator.file.path)?.libraryName === libraryName
        ? parseWorkspaceMediaLibraryPath(parent.locator.file.path)?.relativePath
        : failInvalidMediaParent();
  const context = {
    projectId: options.projectId,
    workspaceRoot: options.workspace.workspacePath,
    globalMediaLibraryRoot: options.globalMediaLibraryRoot,
  };
  const absoluteRoot = await resolveProjectMediaLibraryRootPath(context, libraryName);
  let absoluteDirectory: string | undefined;
  if (relativeDirectory) {
    await resolveProjectMediaLibraryContentPath(context, {
      file: {
        authority: 'workspace',
        path: `neko/assets/${libraryName}/${relativeDirectory}`,
      },
    });
    absoluteDirectory = path.join(absoluteRoot, ...relativeDirectory.split('/'));
  }
  const entries = await readResourceBrowserContentChildren({
    absoluteRoot,
    ...(absoluteDirectory ? { absoluteDirectory } : {}),
    locatorPrefix: '',
    limit: Math.min(limit, FILE_SCAN_LIMIT),
    rootDepth: 0,
    libraryName,
    excludedDirectoryNames: EXCLUDED_DIRECTORIES,
    files: options.host.files,
    joinAbsolutePath: path.join,
    relativePath: path.relative,
    classify: (locatorPath) => classifyContent(locatorPath, true),
  });
  return entries.map((entry) => projectBoundMediaEntry(libraryName, entry));
}

function failInvalidMediaParent(): never {
  throw new Error('Resource Browser Media parent must use its exact project Media locator.');
}

function projectMediaLibraryAvailability(
  options: ResourceBrowserNodeReadSourceOptions,
): ProjectMediaLibraryAvailabilityService {
  return new ProjectMediaLibraryAvailabilityService({
    projectId: options.projectId,
    workspaceRoot: options.workspace.workspacePath,
    globalMediaLibraryRoot: options.globalMediaLibraryRoot,
  });
}

function projectBoundMediaEntry(
  libraryName: string,
  entry: ResourceBrowserContentEntry,
): ResourceBrowserContentEntry {
  if (!isWorkspaceFileContentLocator(entry.locator) || entry.locator.selector) {
    throw new Error('Project Media Library scanner returned an unexpected locator owner.');
  }
  const parentLocator =
    entry.parentLocator &&
    isWorkspaceFileContentLocator(entry.parentLocator) &&
    entry.parentLocator.selector === undefined
      ? {
          file: {
            authority: 'workspace' as const,
            path: `neko/assets/${libraryName}/${entry.parentLocator.file.path}`,
          },
        }
      : undefined;
  return {
    ...entry,
    locator: {
      file: {
        authority: 'workspace',
        path: `neko/assets/${libraryName}/${entry.locator.file.path}`,
      },
    },
    ...(parentLocator ? { parentLocator } : {}),
    description: entry.description === '.' ? libraryName : `${libraryName}/${entry.description}`,
  };
}

function projectMediaLibraryRootEntry(
  library: ProjectMediaLibraryAvailability,
  referenceCount: number,
  missingCount: number,
): ResourceBrowserMediaLibraryRootEntry {
  const operationFingerprint = `sha256:${createHash('sha256')
    .update(
      JSON.stringify([
        library.libraryName,
        library.state,
        library.requiredRelativePaths,
        missingCount,
      ]),
    )
    .digest('base64url')}`;
  const libraryStatus: ResourceBrowserMediaLibraryStatus = {
    libraryName: library.libraryName,
    state: library.state,
    referenceCount,
    missingCount,
    operationFingerprint,
    ...(library.diagnostic
      ? {
          diagnostic: {
            code: library.diagnostic.code,
            severity: 'error' as const,
            message: library.diagnostic.message,
          },
        }
      : {}),
  };
  return {
    label: library.libraryName,
    description: library.diagnostic?.message ?? 'Workspace-linked Media Library.',
    role: 'library-root',
    depth: 0,
    libraryName: library.libraryName,
    libraryStatus,
  };
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
      if (
        entry.role !== 'content' ||
        !isWorkspaceFileContentLocator(entry.locator) ||
        entry.locator.selector
      ) {
        return [];
      }
      return [
        {
          membershipId: randomUUID(),
          sourceRelativePath: entry.locator.file.path,
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
  if (!isWorkspaceFileContentLocator(entry.locator) || entry.locator.selector) {
    throw new Error('Desktop global Media Library produced a non-file locator.');
  }
  const relativePath = entry.locator.file.path;
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

function creativeDocumentKindForPath(locatorPath: string): 'canvas' | 'cut' | undefined {
  if (isCanvasDocument(locatorPath)) return 'canvas';
  if (isCutDocument(locatorPath)) return 'cut';
  return undefined;
}

function presentCreatedCreativeDocument(
  locatorPath: string,
  kind: 'canvas' | 'cut',
): ResourceBrowserContentItem {
  const segments = locatorPath.split('/');
  const label = segments.at(-1);
  if (!label) throw new Error('Created creative document path has no filename.');
  const parentPath = segments.slice(0, -1).join('/');
  return presentResourceBrowserContentItem(
    {
      locator: { file: { authority: 'workspace', path: locatorPath } },
      ...(parentPath
        ? {
            parentLocator: {
              file: { authority: 'workspace' as const, path: parentPath },
            },
          }
        : {}),
      label,
      availability: 'available',
      capabilities: ['read', 'bind'],
      metadata: { mediaType: kind },
      role: 'content',
      depth: segments.length - 1,
    },
    'files',
    { canvasAvailable: true },
  );
}

export async function resolveResourceBrowserItemPath(input: {
  readonly workspace: AssetWorkspaceResolution;
  readonly projectId: string;
  readonly globalAssetRoot: string;
  readonly globalMediaLibraryRoot: string;
  readonly memberships?: AssetLibraryMembershipRepository;
  readonly item: Parameters<ResourceBrowserInteractionPort['preview']>[0]['item'];
}): Promise<string> {
  if (input.item.source === 'assets') {
    return resolveGlobalAssetItemPath({
      globalAssetRoot: input.globalAssetRoot,
      memberships: requireAssetLibraryMemberships(input.memberships),
      itemId: input.item.assetRef.assetId,
    });
  }
  if (input.item.role === 'library-root') {
    throw new Error('Resource Browser Media Library root has no content path.');
  }
  if (
    isWorkspaceFileContentLocator(input.item.locator) &&
    input.item.locator.selector === undefined &&
    parseWorkspaceMediaLibraryPath(input.item.locator.file.path)
  ) {
    return resolveProjectMediaLibraryContentPath(
      {
        projectId: input.projectId,
        workspaceRoot: input.workspace.workspacePath,
        globalMediaLibraryRoot: input.globalMediaLibraryRoot,
      },
      input.item.locator,
    );
  }
  if (isWorkspaceFileContentLocator(input.item.locator)) {
    return resolveWorkspaceContentLocator(input.workspace, input.item.locator);
  }
  throw new Error('Resource Browser item has no directly resolvable Host file path.');
}

function requireWorkspaceFileLocator(item: {
  readonly locator: import('@neko/content').ContentLocator;
}): WorkspaceFileContentLocator {
  if (!isWorkspaceFileContentLocator(item.locator) || item.locator.selector) {
    throw new Error('Resource Browser Files operation requires a Workspace File locator.');
  }
  return item.locator;
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
    if (!isWorkspaceFileContentLocator(entry.locator) || entry.locator.selector) continue;
    byLocator.set(entry.locator.file.path, entry);
  }
  return [...byLocator.values()];
}
