import {
  createDocumentAccessService,
  createDocumentReaderRuntime,
  type DocumentReaderRuntimeDeps,
  type IDocumentAccessService,
} from '@neko/content/document';
import AdmZipModule from 'adm-zip';
import * as Epub2Module from 'epub2';
import * as path from 'node:path';
import { loadHostContentPolicySnapshot, type NekoHostPorts } from '@neko/host';
import {
  PathResolver,
  normalizeWorkspaceContentPath,
  type ContentLocator,
  type GeneratedOutputContentLocator,
  type ResourceRef,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import {
  createHostDerivedContentRuntime,
  createNodeHostContentReadService,
  resolveGeneratedAssetResourceRef,
  type HostDerivedContentRuntime,
} from '@neko/shared/content-access';
import type { GeneratedAssetResourceResolver } from '@neko/platform';
import {
  createHostAgentContentAccessRuntime,
  createAgentDocumentReaderModuleUnavailableError,
  type AgentContentAccessRuntime,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
} from '@neko/agent/runtime';

const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

export interface CreateNodeContentAccessRuntimeOptions {
  readonly host: NekoHostPorts;
  readonly maxProviderAssetBytes?: number;
  readonly resolveGeneratedAsset?: GeneratedAssetResourceResolver;
  readonly derivedStorageHomedir?: string;
}

export interface NodeContentAccessRuntimeServices {
  readonly runtime: AgentContentAccessRuntime;
  readonly documentAccess: IDocumentAccessService;
  readonly derivedRuntime: HostDerivedContentRuntime;
}

export interface NodeContentAccessRuntime extends AgentContentAccessRuntime {
  dispose(): Promise<void>;
}

export function createNodeContentAccessRuntime(
  options: CreateNodeContentAccessRuntimeOptions,
): NodeContentAccessRuntime {
  return new LazyNodeContentAccessRuntime(options);
}

async function createNodeContentAccessRuntimeServices(
  options: CreateNodeContentAccessRuntimeOptions,
): Promise<NodeContentAccessRuntimeServices> {
  const builder = new NodeContentAccessRuntimeBuilder(options);
  return builder.create();
}

class LazyNodeContentAccessRuntime implements AgentContentAccessRuntime {
  private servicesPromise: Promise<NodeContentAccessRuntimeServices> | undefined;

  constructor(private readonly options: CreateNodeContentAccessRuntimeOptions) {}

  resolveImageMetadata(input: AgentImageMetadataInput): Promise<AgentImageMetadataResult> {
    return this.runtime().then((runtime) => runtime.resolveImageMetadata(input));
  }

  resolveDocumentContent(input: AgentDocumentContentInput): Promise<AgentDocumentContentResult> {
    return this.runtime().then((runtime) => runtime.resolveDocumentContent(input));
  }

  loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult> {
    return this.runtime().then((runtime) => runtime.loadProviderAsset(input));
  }

  loadContentAsset(input: {
    readonly locator: ContentLocator;
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
  }): Promise<AgentProviderAssetResult> {
    return this.runtime().then((runtime) => runtime.loadContentAsset(input));
  }

  async dispose(): Promise<void> {
    if (!this.servicesPromise) return;
    const services = await this.servicesPromise;
    await services.derivedRuntime.dispose();
  }

  private async runtime(): Promise<AgentContentAccessRuntime> {
    const services = await this.services();
    return services.runtime;
  }

  private services(): Promise<NodeContentAccessRuntimeServices> {
    this.servicesPromise ??= createNodeContentAccessRuntimeServices(this.options);
    return this.servicesPromise;
  }
}

class NodeContentAccessRuntimeBuilder {
  private readonly maxProviderAssetBytes: number;

  constructor(private readonly options: CreateNodeContentAccessRuntimeOptions) {
    this.maxProviderAssetBytes =
      options.maxProviderAssetBytes ?? DEFAULT_PROVIDER_ASSET_RANGE_BYTES;
  }

  async create(): Promise<NodeContentAccessRuntimeServices> {
    const workspace = await this.options.host.workspace.getWorkspace();
    const contentPolicy = await loadHostContentPolicySnapshot({ host: this.options.host });
    const workspaceRoot = contentPolicy.workspaceRoot ?? workspace.workspaceRoot;
    if (!workspaceRoot) {
      throw new Error('TUI content access requires a workspace root.');
    }

    const pathResolver = new PathResolver(new Map(contentPolicy.pathVariables));
    const resolveGeneratedAsset = async (ref: ResourceRef) =>
      (await this.options.resolveGeneratedAsset?.(ref)) ??
      resolveGeneratedAssetResourceRef(ref, pathResolver, workspaceRoot);
    const derivedRuntime = await createHostDerivedContentRuntime({
      target: {
        kind: 'workspace',
        workspaceRoot,
        ...(this.options.derivedStorageHomedir
          ? { homedir: this.options.derivedStorageHomedir }
          : {}),
      },
    });
    const documentAccess = this.createDocumentAccess();
    const contentRead = createNodeHostContentReadService({
      workspaceRoot,
      documentEntryReader: {
        readEntry: async (sourcePath, entryPath) => {
          const bytes = await this.readEntry(sourcePath, entryPath);
          if (!bytes) throw new Error(`Document entry not found: ${entryPath}`);
          return bytes;
        },
      },
    });
    const runtime = createHostAgentContentAccessRuntime({
      contentRead,
      documentAccess,
      resolveWorkspaceFileLocator: createWorkspaceFileLocatorResolver(workspaceRoot),
      resolveGeneratedOutputLocator: createGeneratedOutputLocatorResolver(
        workspaceRoot,
        resolveGeneratedAsset,
      ),
      resolveDocumentHostFilePath: (source) => path.join(workspaceRoot, ...source.path.split('/')),
    });

    return {
      runtime,
      documentAccess,
      derivedRuntime,
    };
  }

  private createDocumentAccess(): IDocumentAccessService {
    const runtime = this.createDocumentReaderDeps();
    const reader = createDocumentReaderRuntime(runtime);
    return createDocumentAccessService({
      reader,
      runtime,
      lowLevelAccess: {
        readFile: (filePath) => this.readBytes(filePath),
        readEntry: async (filePath, entryPath) => {
          const bytes = await this.readEntry(filePath, entryPath);
          if (!bytes) {
            throw new Error(`Document entry not found: ${entryPath}`);
          }
          return bytes;
        },
      },
    });
  }

  private createDocumentReaderDeps(): DocumentReaderRuntimeDeps {
    return {
      readTextFile: (filePath) => this.readText(filePath),
      readBinaryFile: (filePath) => this.readBytes(filePath),
      readEntry: (filePath, entryPath) => this.readEntry(filePath, entryPath),
      loadModule: <T>(packageName: string) => loadTuiDocumentReaderModule<T>(packageName),
    };
  }

  private async readText(filePath: string): Promise<string> {
    const resolved = await this.requireLocalPath(filePath);
    return this.options.host.files.readText(resolved);
  }

  private async readBytes(filePath: string): Promise<Uint8Array> {
    const resolved = await this.requireLocalPath(filePath);
    return this.options.host.files.readBytes(resolved);
  }

  private async readEntry(filePath: string, entryPath: string): Promise<Uint8Array | null> {
    const resolved = await this.requireLocalPath(filePath);
    const AdmZip = readAdmZipConstructor(AdmZipModule);
    if (!AdmZip) {
      throw new Error('Document archive entry reader is unavailable in this OpenNeko TUI build.');
    }
    const archive = new AdmZip(resolved);
    const entry = archive.getEntry(entryPath);
    if (!entry) {
      return null;
    }
    const bytes = entry.getData();
    if (bytes.byteLength > this.maxProviderAssetBytes) {
      throw new Error(`Document entry is too large for TUI content access: ${entryPath}`);
    }
    return bytes;
  }

  private async requireLocalPath(value: string): Promise<string> {
    const localPath = await this.resolveLocalPath(value);
    if (!localPath) {
      throw new Error(`TUI content access only supports local paths: ${value}`);
    }
    return localPath;
  }

  private async resolveLocalPath(value: string): Promise<string | undefined> {
    const workspace = await this.options.host.workspace.getWorkspace();
    const variables = new Map(workspace.pathVariables ?? []);
    const resolver = new PathResolver(variables);
    const resolved = this.options.host.paths.resolvePath({
      path: value,
      ...(workspace.workspaceRoot ? { baseDir: workspace.workspaceRoot } : {}),
      variables,
    });
    return resolved.type === 'local' && !resolver.hasVariable(resolved.path)
      ? resolved.path
      : undefined;
  }
}

function createWorkspaceFileLocatorResolver(
  workspaceRoot: string,
): (value: string) => WorkspaceFileContentLocator | undefined {
  return (value) => {
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

interface AdmZipEntry {
  getData(): Uint8Array;
}

interface AdmZipInstance {
  getEntry(entryPath: string): AdmZipEntry | null;
}

interface AdmZipConstructor {
  new (filePath: string): AdmZipInstance;
}

export async function loadTuiDocumentReaderModule<T>(packageName: string): Promise<T | null> {
  switch (packageName) {
    case 'adm-zip':
      return requireTuiDocumentReaderModule(packageName, readAdmZipConstructor(AdmZipModule)) as T;
    case 'epub2':
      return Epub2Module as T;
    default:
      throw createAgentDocumentReaderModuleUnavailableError({
        packageName,
        host: 'tui',
      });
  }
}

function requireTuiDocumentReaderModule<T>(packageName: string, value: T | null): T {
  if (!value) {
    throw createAgentDocumentReaderModuleUnavailableError({
      packageName,
      host: 'tui',
    });
  }
  return value;
}

function readAdmZipConstructor(value: unknown): AdmZipConstructor | null {
  return typeof value === 'function' ? (value as AdmZipConstructor) : null;
}
