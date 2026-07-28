import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  HostAccessDecision,
  HostAccessOperation,
  HostAccessPolicyPort,
  HostDeleteOptions,
  HostDiagnostic,
  HostDiagnosticSink,
  HostDirEntry,
  HostEnvironmentPort,
  HostExternalPort,
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
} from '@neko/host/ports';
import type { ILogger } from '@neko/shared/logger';
import { PathResolver, type PathVariableMap } from '@neko/shared/path';
import { resolveStorageLayout } from '@neko/shared/types/storage';

export interface ElectronNekoHostPortsOptions {
  readonly homedir: string;
  readonly nekoHome: string;
  readonly version: string;
  readonly logger: ILogger;
  readonly workspaceRoot?: string;
  readonly trust?: HostWorkspaceTrust;
  readonly locale?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly openExternal?: (uri: string) => Promise<void>;
  readonly revealPath?: (targetPath: string) => void;
}

export interface ElectronNekoHostPorts extends NekoHostPorts {
  readonly pathVariables: PathVariableMap;
}

export function createElectronNekoHostPorts(
  options: ElectronNekoHostPortsOptions,
): ElectronNekoHostPorts {
  const homedir = path.resolve(options.homedir);
  const nekoHome = path.resolve(options.nekoHome);
  const workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : undefined;
  const pathVariables = createDesktopPathVariables({ homedir, nekoHome, workspaceRoot });
  const paths = createDesktopPathPort({ homedir, workspaceRoot, pathVariables });
  const diagnostics = createDesktopDiagnosticSink(options.logger);

  return {
    environment: createDesktopEnvironmentPort(options),
    workspace: createDesktopWorkspacePort({
      homedir,
      workspaceRoot,
      pathVariables,
      trust: options.trust ?? 'unknown',
    }),
    files: createDesktopFileSystemPort(),
    paths,
    accessPolicy: createDesktopAccessPolicyPort({ workspaceRoot, paths }),
    contentPolicy: {
      getSnapshot: () => ({
        ...(workspaceRoot ? { workspaceRoot } : {}),
        pathVariables: new Map(pathVariables),
        mediaLibraries: [],
        authorizedReadRoots: workspaceRoot ? [workspaceRoot] : [],
      }),
    },
    ...(options.openExternal || options.revealPath
      ? {
          external: createDesktopExternalPort({
            openExternal: options.openExternal,
            revealPath: options.revealPath,
          }),
        }
      : {}),
    diagnostics,
    pathVariables,
  };
}

function createDesktopPathVariables(input: {
  readonly homedir: string;
  readonly nekoHome: string;
  readonly workspaceRoot?: string;
}): PathVariableMap {
  const variables: PathVariableMap = new Map([
    ['HOME', input.homedir],
    ['NEKO_HOME', input.nekoHome],
  ]);
  if (input.workspaceRoot) {
    variables.set('WORKSPACE', input.workspaceRoot);
    variables.set('PROJECT', input.workspaceRoot);
  }
  return variables;
}

function createDesktopEnvironmentPort(
  options: ElectronNekoHostPortsOptions,
): HostEnvironmentPort {
  return {
    getHostIdentity(): NekoHostIdentity {
      return {
        id: 'openneko-desktop-electron',
        kind: 'electron',
        ui: 'graphical',
        displayName: 'OpenNeko Desktop',
        version: options.version,
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

function createDesktopWorkspacePort(input: {
  readonly homedir: string;
  readonly workspaceRoot?: string;
  readonly pathVariables: PathVariableMap;
  readonly trust: HostWorkspaceTrust;
}): HostWorkspacePort {
  return {
    getWorkspace(): HostWorkspaceSnapshot {
      if (!input.workspaceRoot) {
        return {
          pathVariables: new Map(input.pathVariables),
          trust: input.trust,
        };
      }
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

function createDesktopPathPort(input: {
  readonly homedir: string;
  readonly workspaceRoot?: string;
  readonly pathVariables: PathVariableMap;
}): HostPathPort {
  return {
    resolvePath(request: HostPathResolveRequest) {
      const variables = new Map(request.variables ?? input.pathVariables);
      const source = expandHomeMarker(request.path, input.homedir);
      const baseDir = request.baseDir ?? input.workspaceRoot;
      if (!baseDir && !isAbsoluteOrRemoteOrVariable(source)) {
        throw new Error(`Cannot resolve relative Desktop path '${source}' without a workspace.`);
      }
      const resolved = new PathResolver(variables).resolveSource(source, baseDir ?? input.homedir);
      if (resolved.type === 'local' && resolved.path.includes('${')) {
        throw new Error(`Desktop path '${request.path}' references an unknown variable.`);
      }
      return resolved.type === 'local'
        ? { type: 'local' as const, path: path.normalize(resolved.path) }
        : resolved;
    },
    contractPath(request: HostPathContractRequest): string {
      const absolutePath = path.resolve(request.absolutePath);
      const variables = new Map(request.variables ?? input.pathVariables);
      const contracted = new PathResolver(variables).contract(absolutePath);
      if (contracted === absolutePath) {
        throw new Error(
          `Desktop path '${absolutePath}' is outside configured path-variable roots.`,
        );
      }
      return contracted;
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

function createDesktopFileSystemPort(): HostFileSystemPort {
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
    async readDirectory(directoryPath: string): Promise<readonly HostDirEntry[]> {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
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
    async createDirectory(directoryPath: string): Promise<void> {
      await fs.mkdir(directoryPath, { recursive: true });
    },
    async delete(targetPath: string, options?: HostDeleteOptions): Promise<void> {
      await fs.rm(targetPath, {
        recursive: options?.recursive ?? false,
        force: options?.idempotent ?? false,
      });
    },
  };
}

function createDesktopAccessPolicyPort(input: {
  readonly workspaceRoot?: string;
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
          code: 'desktop-host-access-denied-managed-storage',
          severity: 'error',
          message:
            'Agent tools cannot directly access Desktop-managed storage. Use an owning domain port.',
          metadata: {
            operation: request.operation,
            scope: request.scope,
            reason: request.reason,
          },
        },
      };
    },
  };
}

function createDesktopExternalPort(input: {
  readonly openExternal?: (uri: string) => Promise<void>;
  readonly revealPath?: (targetPath: string) => void;
}): HostExternalPort {
  return {
    async openExternal(uri: string): Promise<void> {
      if (!input.openExternal) {
        throw new Error('Desktop openExternal capability is not registered.');
      }
      const parsed = new URL(uri);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
        throw new Error(`Desktop refuses external URI protocol '${parsed.protocol}'.`);
      }
      await input.openExternal(uri);
    },
    async revealPath(targetPath: string): Promise<void> {
      if (!input.revealPath) {
        throw new Error('Desktop revealPath capability is not registered.');
      }
      input.revealPath(path.resolve(targetPath));
    },
  };
}

function createDesktopDiagnosticSink(logger: ILogger): HostDiagnosticSink {
  return {
    report(diagnostic: HostDiagnostic): void {
      const data = {
        code: diagnostic.code,
        metadata: diagnostic.metadata,
      };
      if (diagnostic.severity === 'error') logger.error(diagnostic.message, data);
      else if (diagnostic.severity === 'warning') logger.warn(diagnostic.message, data);
      else logger.info(diagnostic.message, data);
    },
  };
}

function isManagedStorageRequest(
  operation: HostAccessOperation,
  scope: string | undefined,
  targetPath: string | undefined,
  input: {
    readonly workspaceRoot?: string;
    readonly paths: HostPathPort;
  },
): boolean {
  if (scope === 'workspace-local' || scope === 'workspace-cache' || scope === 'temporary') {
    return true;
  }
  if (!targetPath || !input.workspaceRoot) return false;
  if (!['read', 'write', 'delete', 'list', 'execute', 'project'].includes(operation)) return false;
  return input.paths.isInside({
    path: targetPath,
    root: path.join(input.workspaceRoot, '.neko'),
  });
}

function expandHomeMarker(value: string, homedir: string): string {
  if (value === '~') return homedir;
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir, value.slice(2));
  }
  return value;
}

function isAbsoluteOrRemoteOrVariable(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    /^\/?\$\{[^}]+\}/.test(value)
  );
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
  if (resolvedTarget === resolvedRoot) return true;
  const relativePath = path.relative(resolvedRoot, resolvedTarget);
  return (
    relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
  );
}
