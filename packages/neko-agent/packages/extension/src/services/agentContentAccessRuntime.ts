import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  createNodeDocumentLowLevelAccess,
  createNodeDocumentRasterRepresentationGenerator,
  loadNodeDocumentModule,
  type NodeDocumentLowLevelAccess,
} from '@neko/content/document/node';
import {
  createDocumentAccessService,
  createDocumentReaderRuntime,
  type DocumentReaderRuntimeDeps,
  type IDocumentAccessService,
} from '@neko/content/document';
import type {
  ContentReadService,
  GeneratedOutputContentLocator,
  ContentRepresentationService,
  ResourceRef,
  PathResolver,
  WorkspaceFileContentLocator,
} from '@neko/shared';
import { normalizeWorkspaceContentPath } from '@neko/shared';
import {
  createHostDerivedContentRuntime,
  createNodeHostContentReadService,
  type GeneratedAssetResourceResolverResult,
  type HostDerivedContentRuntime,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import {
  createAgentDocumentReaderModuleUnavailableError,
  type AgentContentAccessRuntime,
} from '@neko/agent/runtime';
import { createExtensionAgentContentAccessRuntimeAdapter } from './agentContentAccessRuntimeAdapter';
import { getLogger } from '../base';
import { createSharpGeneratedImageRepresentationGenerator } from './visionImageProcessor';

const logger = getLogger('AgentContentAccessRuntime');
type GeneratedAssetResourceResolver = (
  ref: ResourceRef,
) => Promise<GeneratedAssetResourceResolverResult | undefined>;

export interface AgentContentAccessRuntimeServices {
  readonly contentRepresentation: ContentRepresentationService;
  readonly localResourceAccess?: LocalResourceAccessService;
}

export interface CreateExtensionAgentContentAccessRuntimeOptions {
  readonly context?: vscode.ExtensionContext;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly resolveGeneratedAsset?: GeneratedAssetResourceResolver;
  /** Test/alternate Host root; production uses the operating-system home directory. */
  readonly derivedStorageHomedir?: string;
}

export interface CreateExtensionAgentContentAccessRuntimeResult extends AgentContentAccessRuntimeServices {
  readonly runtime: AgentContentAccessRuntime;
  readonly derivedRuntime: HostDerivedContentRuntime;
}

export async function createExtensionAgentContentAccessRuntime(
  options: CreateExtensionAgentContentAccessRuntimeOptions,
): Promise<CreateExtensionAgentContentAccessRuntimeResult> {
  const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const documentLowLevelAccess = createNodeDocumentLowLevelAccess({
    resolvePath: createDocumentPathResolver(options.pathResolver, workspaceRoot),
  });
  const documentAccess = createHostDocumentAccess(documentLowLevelAccess);

  const target = workspaceRoot
    ? ({
        kind: 'workspace',
        workspaceRoot,
        ...(options.derivedStorageHomedir ? { homedir: options.derivedStorageHomedir } : {}),
      } as const)
    : ({
        kind: 'extension-private',
        ...(options.derivedStorageHomedir ? { homedir: options.derivedStorageHomedir } : {}),
      } as const);
  if (!workspaceRoot && !options.context) {
    throw new Error('Agent derived content requires a workspace or ExtensionContext.');
  }
  const contentRead = workspaceRoot
    ? createNodeHostContentReadService({
        workspaceRoot,
        documentEntryReader: {
          readEntry: (sourcePath, entryPath) =>
            documentLowLevelAccess.readEntry(sourcePath, entryPath),
        },
      })
    : undefined;
  const sharedRuntime = await createHostDerivedContentRuntime({
    target,
    ...(options.context
      ? { context: options.context, extensionUri: options.context.extensionUri }
      : {}),
    localResourceAccess: options.localResourceAccess,
    representationGenerators:
      contentRead && workspaceRoot
        ? [
            createSharpGeneratedImageRepresentationGenerator(contentRead),
            createNodeDocumentRasterRepresentationGenerator({
              workspaceRoot,
              contentRead,
            }),
          ]
        : [],
    logger,
  });

  return {
    runtime: createExtensionAgentContentAccessRuntimeAdapter({
      contentRead: contentRead ?? createUnavailableContentReadService(),
      documentAccess,
      resolveWorkspaceFileLocator: createWorkspaceFileLocatorResolver(workspaceRoot),
      ...(options.resolveGeneratedAsset && workspaceRoot
        ? {
            resolveGeneratedOutputLocator: createGeneratedOutputLocatorResolver(
              workspaceRoot,
              options.resolveGeneratedAsset,
            ),
          }
        : {}),
      resolveDocumentHostFilePath: (source) =>
        workspaceRoot ? path.join(workspaceRoot, ...source.path.split('/')) : undefined,
      contentRepresentation: sharedRuntime.contentRepresentation,
    }),
    contentRepresentation: sharedRuntime.contentRepresentation,
    ...(sharedRuntime.localResourceAccess
      ? { localResourceAccess: sharedRuntime.localResourceAccess }
      : {}),
    derivedRuntime: sharedRuntime,
  };
}

function createWorkspaceFileLocatorResolver(
  workspaceRoot: string | undefined,
): (value: string) => WorkspaceFileContentLocator | undefined {
  return (value) => {
    if (!workspaceRoot) return undefined;
    const absolutePath = path.isAbsolute(value)
      ? path.resolve(value)
      : path.resolve(workspaceRoot, value);
    const relativePath = path.relative(workspaceRoot, absolutePath).replaceAll(path.sep, '/');
    const normalized = normalizeWorkspaceContentPath(relativePath);
    return normalized && normalized === relativePath
      ? { kind: 'workspace-file', path: normalized }
      : undefined;
  };
}

function createGeneratedOutputLocatorResolver(
  workspaceRoot: string,
  resolveGeneratedAsset: GeneratedAssetResourceResolver,
): (ref: ResourceRef) => Promise<GeneratedOutputContentLocator | undefined> {
  const resolveWorkspaceFile = createWorkspaceFileLocatorResolver(workspaceRoot);
  return async (ref) => {
    if (ref.source.kind !== 'generated-asset') return undefined;
    const resolved = await resolveGeneratedAsset(ref);
    const workspaceFile = resolved?.path ? resolveWorkspaceFile(resolved.path) : undefined;
    const revision = readNonEmptyString(ref.source.metadata?.['revision']);
    const digest = readNonEmptyString(ref.source.metadata?.['contentDigest']);
    const outputId = readNonEmptyString(ref.source.generatedAssetId);
    return workspaceFile && revision && digest && outputId
      ? {
          kind: 'generated-output',
          outputId,
          revision,
          digest,
          path: workspaceFile.path,
        }
      : undefined;
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function createUnavailableContentReadService(): ContentReadService {
  return {
    stat: async (locator) => ({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unsupported' },
    }),
    read: async (locator) => ({
      status: 'unavailable',
      locator,
      diagnostic: { code: 'content-unsupported' },
    }),
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
