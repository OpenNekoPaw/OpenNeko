import * as vscode from 'vscode';
import { createEngineContentAccessAdapter } from '@neko/neko-client/engine-file-access';
import {
  createNodeDocumentLowLevelAccess,
  loadNodeDocumentModule,
  type NodeDocumentLowLevelAccess,
} from '@neko/content/document/node';
import {
  createDocumentAccessService,
  createDocumentReaderRuntime,
  type DocumentReaderRuntimeDeps,
  type IDocumentAccessService,
} from '@neko/content/document';
import type { ContentAccessRequest, PathResolver, WorkspaceMediaPathContext } from '@neko/shared';
import {
  DocumentResourceCacheProvider,
  GeneratedAssetDerivativeResourceCacheProvider,
  createHostContentAccessRuntime,
  createWorkspaceResourceCacheOptions,
  type ContentAccessFileExists,
  type ContentAccessService,
  type GeneratedAssetDerivativeResourceCacheProviderOptions,
  type LocalResourceAccessService,
  type ResourceCacheService,
  type ResourceCacheManifestStore,
} from '@neko/shared/vscode/extension';
import {
  createAgentDocumentReaderModuleUnavailableError,
  type AgentContentAccessRuntime,
} from '@neko/agent/runtime';
import type { IEngineClientProvider } from './engineClientProvider';
import { createExtensionAgentContentAccessRuntimeAdapter } from './agentContentAccessRuntimeAdapter';
import { getLogger } from '../base';
import { createSharpGeneratedImageVariantGenerator } from './visionImageProcessor';

const logger = getLogger('AgentContentAccessRuntime');
const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

type GeneratedAssetResourceResolver = NonNullable<
  GeneratedAssetDerivativeResourceCacheProviderOptions['resolveAsset']
>;

export interface AgentContentAccessRuntimeServices {
  readonly contentAccess: ContentAccessService;
  readonly resourceCache?: ResourceCacheService;
  readonly localResourceAccess?: LocalResourceAccessService;
}

export interface CreateExtensionAgentContentAccessRuntimeOptions {
  readonly context?: vscode.ExtensionContext;
  readonly engineClientProvider: IEngineClientProvider;
  readonly resourceCache?: ResourceCacheService;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly webviewResolver?: (request: ContentAccessRequest) => vscode.Webview | undefined;
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly mediaPathContext?: WorkspaceMediaPathContext;
  readonly fileExists?: ContentAccessFileExists;
  readonly maxProviderAssetBytes?: number;
  readonly resourceCacheManifestStore?: ResourceCacheManifestStore;
  readonly resolveGeneratedAsset?: GeneratedAssetResourceResolver;
}

export interface CreateExtensionAgentContentAccessRuntimeResult extends AgentContentAccessRuntimeServices {
  readonly runtime: AgentContentAccessRuntime;
}

export function createExtensionAgentContentAccessRuntime(
  options: CreateExtensionAgentContentAccessRuntimeOptions,
): CreateExtensionAgentContentAccessRuntimeResult {
  const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const engineContentAccess = createEngineContentAccessAdapter({
    engineClientProvider: options.engineClientProvider,
    maxProviderAssetBytes: options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES,
  });
  const documentLowLevelAccess = createNodeDocumentLowLevelAccess({
    resolvePath: createDocumentPathResolver(options.pathResolver, workspaceRoot),
  });
  const documentAccess = createHostDocumentAccess(documentLowLevelAccess);

  const sharedRuntime = createHostContentAccessRuntime({
    context: options.context,
    extensionUri: options.context?.extensionUri,
    workspaceRoot,
    resourceCache: options.resourceCache,
    localResourceAccess: options.localResourceAccess,
    pathResolver: options.pathResolver,
    mediaPathContext: options.mediaPathContext,
    fileExists: options.fileExists,
    webviewResolver: options.webviewResolver,
    resourceCacheOptions:
      workspaceRoot && options.resourceCacheManifestStore
        ? {
            ...createWorkspaceResourceCacheOptions(
              workspaceRoot,
              options.resourceCacheManifestStore,
            ),
            providers: [
              new GeneratedAssetDerivativeResourceCacheProvider({
                pathResolver: options.pathResolver,
                ...(workspaceRoot ? { projectRoot: workspaceRoot } : {}),
                ...(options.resolveGeneratedAsset
                  ? { resolveAsset: options.resolveGeneratedAsset }
                  : {}),
                generator: createSharpGeneratedImageVariantGenerator(),
              }),
              new DocumentResourceCacheProvider({
                pathResolver: options.pathResolver,
                ...(workspaceRoot ? { projectRoot: workspaceRoot } : {}),
                entryReader: {
                  readEntry: (source, entryPath) =>
                    documentLowLevelAccess.readEntry(source.filePath, entryPath),
                },
              }),
            ],
          }
        : undefined,
    ...(options.resolveGeneratedAsset
      ? {
          generatedAssetSourceProvider: {
            resolveAsset: options.resolveGeneratedAsset,
          },
        }
      : {}),
    sourceFileProvider: {
      enabled: Boolean(workspaceRoot),
      engineSourceResolver: ({ request, path: filePath }) =>
        engineContentAccess.createEngineSource(request, filePath),
      bytesResolver: ({ request, path: filePath }) =>
        engineContentAccess.readProviderAssetBytes({
          request,
          filePath,
          maxBytes: options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES,
        }),
    },
    documentEntryProvider: {
      enabled: Boolean(workspaceRoot),
      entryReader: ({ sourcePath, entryPath }) => {
        if (!sourcePath || !entryPath) {
          throw new Error('Document entry requires a local source path and archive entry path.');
        }
        return documentLowLevelAccess.readEntry(sourcePath, entryPath);
      },
    },
    ingest: { enabled: false },
    logger,
  });

  return {
    runtime: createExtensionAgentContentAccessRuntimeAdapter({
      contentAccess: sharedRuntime.contentAccess,
      documentAccess,
      resolveDocumentResourceScope: () =>
        vscode.workspace.workspaceFolders?.[0] ? 'project' : 'extension-private',
    }),
    contentAccess: sharedRuntime.contentAccess,
    ...(sharedRuntime.resourceCache ? { resourceCache: sharedRuntime.resourceCache } : {}),
    ...(options.localResourceAccess ? { localResourceAccess: options.localResourceAccess } : {}),
  };
}

function createHostDocumentAccess(
  lowLevelAccess: NodeDocumentLowLevelAccess,
): IDocumentAccessService {
  const runtimeDeps: DocumentReaderRuntimeDeps = {
    readTextFile: async (filePath) =>
      new TextDecoder().decode(await lowLevelAccess.readFile(filePath)),
    readBinaryFile: (filePath) => lowLevelAccess.readFile(filePath),
    readEntry: (filePath, entryPath) => lowLevelAccess.readEntry(filePath, entryPath),
    loadModule: <T>(packageName: string) => tryImport<T>(packageName),
    logger,
  };
  const reader = createDocumentReaderRuntime(runtimeDeps);
  return createDocumentAccessService({
    reader,
    runtime: runtimeDeps,
    lowLevelAccess,
  });
}

function createDocumentPathResolver(
  pathResolver: PathResolver | undefined,
  workspaceRoot: string | undefined,
): (filePath: string) => string {
  return (filePath) => {
    if (!pathResolver || !workspaceRoot) return filePath;
    const resolved = pathResolver.resolveSource(filePath, workspaceRoot);
    if (resolved.type === 'remote') {
      throw new Error(`Remote document sources are not supported by the local reader: ${filePath}`);
    }
    if (pathResolver.hasVariable(resolved.path)) {
      throw new Error(`Document source uses an unknown path variable: ${filePath}`);
    }
    return resolved.path;
  };
}

async function tryImport<T>(packageName: string): Promise<T | null> {
  try {
    return await loadNodeDocumentModule<T>(packageName);
  } catch (error) {
    throw createAgentDocumentReaderModuleUnavailableError({
      packageName,
      host: 'extension',
      cause: error,
    });
  }
}
