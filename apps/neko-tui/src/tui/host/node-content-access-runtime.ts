import {
  createDocumentAccessService,
  createDocumentReaderRuntime,
  type DocumentReaderRuntimeDeps,
  type IDocumentAccessService,
} from '@neko/content/document';
import AdmZipModule from 'adm-zip';
import * as Epub2Module from 'epub2';
import { loadHostContentPolicySnapshot, type NekoHostPorts } from '@neko/host';
import { PathResolver, type WorkspaceMediaPathContext } from '@neko/shared';
import {
  DocumentEntryContentAccessProvider,
  DocumentResourceCacheProvider,
  GeneratedAssetSourceContentAccessProvider,
  HostContentAccessService,
  HostResourceCacheService,
  ResourceCacheContentAccessProvider,
  resolveGeneratedAssetResourceRef,
  SourceFileContentAccessProvider,
  type ContentAccessFileOps,
  type ContentAccessService,
  type DocumentResourceCacheFsOps,
  type GeneratedAssetDerivativeResourceCacheProviderOptions,
  type ResourceCacheFsOps,
  type ResourceCacheManifestStore,
  type ResourceCacheService,
} from '@neko/shared/content-access';
import {
  createHostAgentContentAccessRuntime,
  createAgentDocumentReaderModuleUnavailableError,
  type AgentContentAccessRuntime,
  type AgentContentAccessRuntimeRequest,
  type AgentDocumentContentInput,
  type AgentDocumentContentResult,
  type AgentImageMetadataInput,
  type AgentImageMetadataResult,
  type AgentProviderAssetInput,
  type AgentProviderAssetResult,
  type AgentResourceProjectionInput,
  type AgentResourceProjectionResult,
} from '@neko/agent/runtime';

const DEFAULT_PROVIDER_ASSET_RANGE_BYTES = 20 * 1024 * 1024;

type GeneratedAssetResourceResolver = NonNullable<
  GeneratedAssetDerivativeResourceCacheProviderOptions['resolveAsset']
>;

export interface CreateNodeContentAccessRuntimeOptions {
  readonly host: NekoHostPorts;
  readonly maxProviderAssetBytes?: number;
  readonly resourceCacheManifestStore?: ResourceCacheManifestStore;
  readonly resolveGeneratedAsset?: GeneratedAssetResourceResolver;
}

export interface NodeContentAccessRuntimeServices {
  readonly runtime: AgentContentAccessRuntime;
  readonly contentAccess: ContentAccessService;
  readonly documentAccess: IDocumentAccessService;
  readonly resourceCache?: ResourceCacheService;
}

export function createNodeContentAccessRuntime(
  options: CreateNodeContentAccessRuntimeOptions,
): AgentContentAccessRuntime {
  return new LazyNodeContentAccessRuntime(options);
}

export async function createNodeContentAccessRuntimeServices(
  options: CreateNodeContentAccessRuntimeOptions,
): Promise<NodeContentAccessRuntimeServices> {
  const builder = new NodeContentAccessRuntimeBuilder(options);
  return builder.create();
}

class LazyNodeContentAccessRuntime implements AgentContentAccessRuntime {
  private servicesPromise: Promise<NodeContentAccessRuntimeServices> | undefined;

  constructor(private readonly options: CreateNodeContentAccessRuntimeOptions) {}

  resolve(input: AgentContentAccessRuntimeRequest) {
    return this.runtime().then((runtime) => runtime.resolve(input));
  }

  resolveImageMetadata(input: AgentImageMetadataInput): Promise<AgentImageMetadataResult> {
    return this.runtime().then((runtime) => runtime.resolveImageMetadata(input));
  }

  resolveDocumentContent(input: AgentDocumentContentInput): Promise<AgentDocumentContentResult> {
    return this.runtime().then((runtime) => runtime.resolveDocumentContent(input));
  }

  loadProviderAsset(input: AgentProviderAssetInput): Promise<AgentProviderAssetResult> {
    return this.runtime().then((runtime) => runtime.loadProviderAsset(input));
  }

  projectResource(input: AgentResourceProjectionInput) {
    return this.runtime().then((runtime) => runtime.projectResource(input));
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
    const mediaPathContext: WorkspaceMediaPathContext = {
      owningWorkspaceRoot: workspaceRoot,
      workspaceRoots: [workspaceRoot],
      pathVariables: contentPolicy.pathVariables,
      allowedRoots: contentPolicy.authorizedReadRoots,
    };
    const fileOps: Pick<ContentAccessFileOps, 'readFile'> = {
      readFile: (filePath) => this.readBytes(filePath),
    };
    const resourceCacheFsOps = this.createResourceCacheFsOps();
    const documentResourceCacheFsOps = this.createDocumentResourceCacheFsOps();
    const resourceCacheManifestStore = this.options.resourceCacheManifestStore;
    let resourceCache: ResourceCacheService | undefined;
    if (workspace.storageLayout) {
      if (!resourceCacheManifestStore) {
        throw new Error('TUI ResourceCache requires a LocalMetadata manifest store.');
      }
      resourceCache = this.createResourceCache({
        workspaceRoot,
        pathResolver,
        fileOps,
        resourceCacheFsOps,
        documentResourceCacheFsOps,
        cacheRoot: workspace.storageLayout.project.local.cache.resources,
        manifestStore: resourceCacheManifestStore,
        ...(this.options.resolveGeneratedAsset
          ? { resolveGeneratedAsset: this.options.resolveGeneratedAsset }
          : {}),
      });
    }
    const contentAccess = this.createContentAccess({
      workspaceRoot,
      pathResolver,
      mediaPathContext,
      fileOps,
      resourceCache,
      resolveGeneratedAsset: async (ref) =>
        (await this.options.resolveGeneratedAsset?.(ref)) ??
        resolveGeneratedAssetResourceRef(ref, pathResolver, workspaceRoot),
    });
    const documentAccess = this.createDocumentAccess();
    const runtime = createHostAgentContentAccessRuntime({
      contentAccess,
      documentAccess,
      resolveDocumentResourceScope: () => 'project',
    });

    return {
      runtime,
      contentAccess,
      documentAccess,
      ...(resourceCache ? { resourceCache } : {}),
    };
  }

  private createContentAccess(input: {
    readonly workspaceRoot: string;
    readonly pathResolver: PathResolver;
    readonly mediaPathContext: WorkspaceMediaPathContext;
    readonly fileOps: Pick<ContentAccessFileOps, 'readFile'>;
    readonly resourceCache?: ResourceCacheService;
    readonly resolveGeneratedAsset?: GeneratedAssetResourceResolver;
  }): ContentAccessService {
    const contentAccess = new HostContentAccessService();
    if (input.resolveGeneratedAsset) {
      contentAccess.registerProvider(
        new GeneratedAssetSourceContentAccessProvider({
          resolveAsset: input.resolveGeneratedAsset,
          fileOps: input.fileOps,
        }),
      );
    }
    if (input.resourceCache) {
      contentAccess.registerProvider(
        new ResourceCacheContentAccessProvider({
          resourceCache: input.resourceCache,
          fileOps: input.fileOps,
        }),
      );
    }
    contentAccess.registerProvider(
      new DocumentEntryContentAccessProvider({
        projectRoot: input.workspaceRoot,
        mediaPathContext: input.mediaPathContext,
        fileExists: (filePath) => this.isExistingLocalFile(filePath),
        ...(input.resourceCache ? { resourceCache: input.resourceCache } : {}),
        fileOps: input.fileOps,
        entryReader: async ({ sourcePath, entryPath }) => {
          if (!entryPath) {
            throw new Error('Document entry path is required.');
          }
          const bytes = await this.readEntry(sourcePath, entryPath);
          if (!bytes) {
            throw new Error(`Document entry not found: ${entryPath}`);
          }
          return bytes;
        },
      }),
    );
    contentAccess.registerProvider(
      new SourceFileContentAccessProvider({
        projectRoot: input.workspaceRoot,
        mediaPathContext: input.mediaPathContext,
        fileExists: (filePath) => this.isExistingLocalFile(filePath),
        fileOps: input.fileOps,
        bytesResolver: async ({ path: filePath }) => {
          const bytes = await this.readBytes(filePath);
          return { bytes, sizeBytes: bytes.byteLength };
        },
      }),
    );
    return contentAccess;
  }

  private createResourceCache(input: {
    readonly workspaceRoot: string;
    readonly pathResolver: PathResolver;
    readonly fileOps: Pick<ContentAccessFileOps, 'readFile'>;
    readonly resourceCacheFsOps: ResourceCacheFsOps;
    readonly documentResourceCacheFsOps: DocumentResourceCacheFsOps;
    readonly cacheRoot: string;
    readonly manifestStore: ResourceCacheManifestStore;
    readonly resolveGeneratedAsset?: GeneratedAssetResourceResolver;
  }): ResourceCacheService {
    return new HostResourceCacheService({
      cacheRoot: input.cacheRoot,
      manifestStore: input.manifestStore,
      projectRoot: input.workspaceRoot,
      fsOps: input.resourceCacheFsOps,
      providers: [
        new DocumentResourceCacheProvider({
          pathResolver: input.pathResolver,
          projectRoot: input.workspaceRoot,
          fsOps: input.documentResourceCacheFsOps,
          entryReader: {
            readEntry: (source, entryPath) => this.readEntry(source.filePath, entryPath),
          },
        }),
      ],
    });
  }

  private async isExistingLocalFile(filePath: string): Promise<boolean> {
    try {
      const stat = await this.options.host.files.stat(filePath);
      return stat.type === 'file';
    } catch {
      return false;
    }
  }

  private createResourceCacheFsOps(): ResourceCacheFsOps {
    return {
      readFile: (filePath, encoding) => {
        if (encoding !== 'utf-8') {
          throw new Error(`TUI resource cache only supports utf-8 text reads: ${encoding}`);
        }
        return this.options.host.files.readText(filePath);
      },
      writeFile: async (filePath, content, encoding) => {
        if (encoding !== 'utf-8') {
          throw new Error(`TUI resource cache only supports utf-8 text writes: ${encoding}`);
        }
        await this.options.host.files.writeText(filePath, content);
      },
      rename: (oldPath, newPath) => this.options.host.files.rename(oldPath, newPath),
      mkdir: async (dirPath) => {
        await this.options.host.files.createDirectory(dirPath);
      },
      stat: async (filePath) => {
        const stat = await this.options.host.files.stat(filePath);
        return {
          size: stat.sizeBytes ?? 0,
          ...(stat.modifiedAtMs !== undefined ? { mtimeMs: stat.modifiedAtMs } : {}),
        };
      },
      rm: (filePath, options) =>
        this.options.host.files.delete(filePath, { idempotent: options.force }),
    };
  }

  private createDocumentResourceCacheFsOps(): DocumentResourceCacheFsOps {
    return {
      writeFile: (filePath, data) => this.options.host.files.writeBytes(filePath, data),
      mkdir: async (dirPath) => {
        await this.options.host.files.createDirectory(dirPath);
      },
      stat: async (filePath) => {
        const stat = await this.options.host.files.stat(filePath);
        return { size: stat.sizeBytes ?? 0 };
      },
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
