import * as path from 'node:path';
import { AssetLibrary, JsonFileStorage, type IFileSystem } from '@neko/asset';
import type { NekoHostPorts } from '@neko/host';
import type { AssetEntity, NekoAssetsAPI } from '@neko/shared';
import { createNekoAssetsHeadlessCapabilityProvider } from 'neko-assets/agent-headless';

export interface CreateNodeAssetsCapabilityProviderOptions {
  readonly host: NekoHostPorts;
}

export function createNodeAssetsCapabilityProvider(
  options: CreateNodeAssetsCapabilityProviderOptions,
) {
  return createNekoAssetsHeadlessCapabilityProvider(createNodeAssetsApi(options.host));
}

function createNodeAssetsApi(host: NekoHostPorts): NekoAssetsAPI {
  let libraryPromise: Promise<AssetLibrary> | undefined;
  const ensureLibrary = () => {
    libraryPromise ??= createAssetLibrary(host);
    return libraryPromise;
  };
  return {
    getAllEntities: async () => (await ensureLibrary()).getAllEntities(),
    importFile: async (uri) => {
      const library = await ensureLibrary();
      const resolved = await resolveHostLocalPath(host, uri.fsPath);
      const result = await library.importFile(resolved);
      await library.flush();
      return result.entity;
    },
    promoteGeneratedCandidates: async () => {
      throw new Error('Generated candidate promotion is only available in the VS Code Host.');
    },
    getThumbnailPath: async () => undefined,
    getMediaLibraryRoots: async () => [],
    resolveEntityUri: async () => undefined,
    getCharacterThumbnail: async () => undefined,
    getBindingCandidate: async (entityId) => toBindingCandidate(await ensureLibrary(), entityId),
    getRepresentationPackageDetail: async () => undefined,
    onDidChangeEntities: () => ({ dispose() {} }),
    onDidChangeMediaLibraryRoots: () => ({ dispose() {} }),
  };
}

async function createAssetLibrary(host: NekoHostPorts): Promise<AssetLibrary> {
  const workspace = await host.workspace.getWorkspace();
  const assetLibraryPath = workspace.storageLayout?.project.facts.assetLibrary;
  if (!assetLibraryPath) {
    throw new Error('TUI asset provider requires a workspace storage layout.');
  }
  const pathVariables = workspace.pathVariables;
  const storage = new JsonFileStorage({
    filePath: assetLibraryPath,
    fs: createHostFileSystem(host),
    autoSaveDelay: 0,
  });
  const library = new AssetLibrary({
    storage,
    ...(pathVariables ? { pathVariables } : {}),
  });
  await library.initialize();
  return library;
}

function createHostFileSystem(host: NekoHostPorts): IFileSystem {
  return {
    readFile: (filePath) => host.files.readText(filePath),
    writeFile: async (filePath, content) => {
      await host.files.createDirectory(path.dirname(filePath));
      await host.files.writeText(filePath, content);
    },
    exists: async (filePath) => {
      try {
        await host.files.stat(filePath);
        return true;
      } catch {
        return false;
      }
    },
    mkdir: (dirPath) => host.files.createDirectory(dirPath),
  };
}

async function resolveHostLocalPath(host: NekoHostPorts, value: string): Promise<string> {
  const workspace = await host.workspace.getWorkspace();
  const resolved = host.paths.resolvePath({
    path: value,
    ...(workspace.workspaceRoot ? { baseDir: workspace.workspaceRoot } : {}),
    ...(workspace.pathVariables ? { variables: workspace.pathVariables } : {}),
  });
  if (resolved.type !== 'local' || resolved.path.includes('${')) {
    throw new Error(`TUI asset provider only supports local file paths: ${value}`);
  }
  return resolved.path;
}

async function toBindingCandidate(
  library: AssetLibrary,
  entityId: string,
): Promise<Awaited<ReturnType<NekoAssetsAPI['getBindingCandidate']>>> {
  const entity = await library.getEntity(entityId);
  if (!entity) {
    return undefined;
  }
  return {
    assetEntityId: entity.id,
    assetRef: `asset:${entity.id}`,
    suggestedRoles: inferAssetRoles(entity),
    confidence: 0.6,
    reason: 'Projected from the TUI asset library summary.',
  };
}

function inferAssetRoles(entity: AssetEntity) {
  switch (entity.category) {
    case 'character':
      return ['portrait', 'reference'] as const;
    case 'audio':
      return ['voice'] as const;
    case 'document':
      return ['reference'] as const;
    default:
      return ['reference'] as const;
  }
}
