import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  HostAccessDecision,
  HostAccessOperation,
  HostAccessPolicyPort,
  HostDeleteOptions,
  HostDirEntry,
  HostEnvironmentPort,
  HostFileStat,
  HostFileSystemPort,
  HostFileType,
  HostPathContainmentRequest,
  HostPathContractRequest,
  HostPathPort,
  HostPathResolveRequest,
  HostRuntimeInfo,
  HostWorkspacePort,
  HostWorkspaceSnapshot,
  HostWorkspaceTrust,
  NekoHostIdentity,
  NekoHostPorts,
} from '@neko/host';
import { createHostWorkspacePathVariables } from '@neko/host';
import { PathResolver, resolveStorageLayout, type PathVariableMap } from '@neko/shared';

export interface NodeHostAdapterOptions {
  readonly workDir: string;
  readonly homedir?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly locale?: string;
  readonly trust?: HostWorkspaceTrust;
  readonly hostId?: string;
  readonly displayName?: string;
  readonly extraPathVariables?: PathVariableMap | ReadonlyMap<string, string>;
}

export interface NodeHostAdapter extends NekoHostPorts {
  readonly pathVariables: PathVariableMap;
}

export function createNodeHostAdapter(options: NodeHostAdapterOptions): NodeHostAdapter {
  const workspaceRoot = path.resolve(options.workDir);
  const homedir = path.resolve(options.homedir ?? os.homedir());
  const pathVariables = createNodeHostPathVariables({
    workspaceRoot,
    homedir,
    extraPathVariables: options.extraPathVariables,
  });
  const environment = createNodeEnvironmentPort(options);
  const workspace = createNodeWorkspacePort({
    workspaceRoot,
    homedir,
    pathVariables,
    trust: options.trust ?? 'trusted',
  });
  const paths = createNodePathPort({ workspaceRoot, pathVariables });
  const files = createNodeFileSystemPort();
  const accessPolicy = createNodeAccessPolicyPort({ workspaceRoot, paths });

  return {
    environment,
    workspace,
    files,
    paths,
    accessPolicy,
    pathVariables,
  };
}

export function createNodeHostPathVariables(input: {
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly extraPathVariables?: PathVariableMap | ReadonlyMap<string, string>;
}): PathVariableMap {
  return createHostWorkspacePathVariables({
    workspaceRoot: input.workspaceRoot,
    homedir: input.homedir,
    nekoHome: path.join(input.homedir, '.neko'),
    extraPathVariables: input.extraPathVariables,
  });
}

function createNodeEnvironmentPort(options: NodeHostAdapterOptions): HostEnvironmentPort {
  return {
    getHostIdentity(): NekoHostIdentity {
      return {
        id: options.hostId ?? 'neko-cli-tui',
        kind: 'node',
        ui: 'headless',
        displayName: options.displayName ?? 'OpenNeko TUI',
      };
    },
    getRuntimeInfo(): HostRuntimeInfo {
      return {
        platform: readNodePlatform(process.platform),
        arch: process.arch,
        locale: options.locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
        env: options.env ?? process.env,
      };
    },
  };
}

function createNodeWorkspacePort(input: {
  readonly workspaceRoot: string;
  readonly homedir: string;
  readonly pathVariables: PathVariableMap;
  readonly trust: HostWorkspaceTrust;
}): HostWorkspacePort {
  return {
    getWorkspace(): HostWorkspaceSnapshot {
      return {
        workspaceRoot: input.workspaceRoot,
        workspaceName: path.basename(input.workspaceRoot),
        storageLayout: resolveStorageLayout(input.workspaceRoot, input.homedir),
        pathVariables: new Map(input.pathVariables),
        trust: input.trust,
      };
    },
  };
}

function createNodePathPort(input: {
  readonly workspaceRoot: string;
  readonly pathVariables: PathVariableMap;
}): HostPathPort {
  return {
    resolvePath(request: HostPathResolveRequest) {
      const variables = request.variables ?? input.pathVariables;
      const resolver = new PathResolver(new Map(variables));
      const rawPath = expandHomeMarker(request.path);
      return resolver.resolveSource(rawPath, request.baseDir ?? input.workspaceRoot);
    },
    contractPath(request: HostPathContractRequest): string {
      const variables = request.variables ?? input.pathVariables;
      return new PathResolver(new Map(variables)).contract(path.resolve(request.absolutePath));
    },
    normalizePath(value: string): string {
      return path.normalize(value);
    },
    join(...segments: readonly string[]): string {
      return path.join(...segments);
    },
    dirname(value: string): string {
      return path.dirname(value);
    },
    basename(value: string): string {
      return path.basename(value);
    },
    isAbsolute(value: string): boolean {
      return path.isAbsolute(value);
    },
    isInside(request: HostPathContainmentRequest): boolean {
      return isInsidePath(request.path, request.root);
    },
  };
}

function createNodeFileSystemPort(): HostFileSystemPort {
  return {
    async readText(filePath: string): Promise<string> {
      return fs.readFile(filePath, 'utf8');
    },
    async readBytes(filePath: string): Promise<Uint8Array> {
      return fs.readFile(filePath);
    },
    async writeText(filePath: string, content: string): Promise<void> {
      await fs.writeFile(filePath, content, 'utf8');
    },
    async writeBytes(filePath: string, content: Uint8Array): Promise<void> {
      await fs.writeFile(filePath, content);
    },
    async rename(oldPath: string, newPath: string): Promise<void> {
      await fs.rename(oldPath, newPath);
    },
    async readDirectory(dirPath: string): Promise<readonly HostDirEntry[]> {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        type: readDirentType(entry),
      }));
    },
    async stat(filePath: string): Promise<HostFileStat> {
      const stat = await fs.stat(filePath);
      return {
        type: readStatType(stat),
        sizeBytes: stat.size,
        modifiedAtMs: stat.mtimeMs,
        createdAtMs: stat.birthtimeMs,
      };
    },
    async createDirectory(dirPath: string): Promise<void> {
      await fs.mkdir(dirPath, { recursive: true });
    },
    async delete(targetPath: string, options?: HostDeleteOptions): Promise<void> {
      await fs.rm(targetPath, {
        recursive: options?.recursive ?? false,
        force: options?.idempotent ?? false,
      });
    },
  };
}

function createNodeAccessPolicyPort(input: {
  readonly workspaceRoot: string;
  readonly paths: HostPathPort;
}): HostAccessPolicyPort {
  return {
    decide(request): HostAccessDecision {
      if (request.actor !== 'agent') {
        return { allowed: true };
      }
      if (!isManagedStorageRequest(request.operation, request.scope, request.path, input)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        diagnostic: {
          code: 'host-access-denied-managed-storage',
          severity: 'error',
          message:
            'Agent tools cannot directly access workspace .neko managed storage. Use owning domain projections or client-approved mutation paths instead.',
          metadata: {
            actor: request.actor,
            operation: request.operation,
            scope: request.scope,
            path: request.path,
            reason: request.reason,
          },
        },
      };
    },
  };
}

function isManagedStorageRequest(
  operation: HostAccessOperation,
  scope: string | undefined,
  targetPath: string | undefined,
  input: {
    readonly workspaceRoot: string;
    readonly paths: HostPathPort;
  },
): boolean {
  if (scope === 'workspace-local' || scope === 'workspace-cache' || scope === 'temporary') {
    return true;
  }
  if (!targetPath) {
    return false;
  }
  if (!['read', 'write', 'delete', 'list', 'execute', 'project'].includes(operation)) {
    return false;
  }
  const managedRoot = path.join(input.workspaceRoot, '.neko');
  return input.paths.isInside({ path: targetPath, root: managedRoot });
}

function expandHomeMarker(value: string): string {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function readNodePlatform(value: NodeJS.Platform): HostRuntimeInfo['platform'] {
  return value === 'darwin' || value === 'linux' || value === 'win32' ? value : 'unknown';
}

function readDirentType(entry: import('node:fs').Dirent): HostFileType {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  if (entry.isSymbolicLink()) return 'symlink';
  return 'unknown';
}

function readStatType(stat: import('node:fs').Stats): HostFileType {
  if (stat.isFile()) return 'file';
  if (stat.isDirectory()) return 'directory';
  if (stat.isSymbolicLink()) return 'symlink';
  return 'unknown';
}

function isInsidePath(targetPath: string, root: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(root);
  if (resolvedTarget === resolvedRoot) {
    return true;
  }
  const relativePath = path.relative(resolvedRoot, resolvedTarget);
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}
