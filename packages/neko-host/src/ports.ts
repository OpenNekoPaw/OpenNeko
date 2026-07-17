import type { IStorageLayout, PathVariableMap, ResolvedPath } from '@neko/shared';
import type { HostContentPolicySnapshot } from './workspace-content-settings';

export type HostMaybePromise<T> = T | Promise<T>;

export type NekoHostKind =
  'vscode' | 'node' | 'electron' | 'tauri' | 'rust-native' | 'test' | 'unknown';

export type NekoHostUiKind = 'graphical' | 'headless' | 'test';

export interface NekoHostIdentity {
  readonly id: string;
  readonly kind: NekoHostKind;
  readonly ui: NekoHostUiKind;
  readonly displayName?: string;
  readonly version?: string;
}

export interface HostRuntimeInfo {
  readonly platform: 'darwin' | 'linux' | 'win32' | 'browser' | 'unknown';
  readonly arch?: string;
  readonly locale?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface HostEnvironmentPort {
  getHostIdentity(): HostMaybePromise<NekoHostIdentity>;
  getRuntimeInfo(): HostMaybePromise<HostRuntimeInfo>;
}

export type HostWorkspaceTrust = 'trusted' | 'untrusted' | 'unknown';

export interface HostWorkspaceSnapshot {
  readonly workspaceRoot?: string;
  readonly workspaceName?: string;
  readonly storageLayout?: IStorageLayout;
  readonly pathVariables?: PathVariableMap;
  readonly trust: HostWorkspaceTrust;
}

export interface HostWorkspacePort {
  getWorkspace(): HostMaybePromise<HostWorkspaceSnapshot>;
}

export type HostFileType = 'file' | 'directory' | 'symlink' | 'unknown';

export interface HostFileStat {
  readonly type: HostFileType;
  readonly sizeBytes?: number;
  readonly modifiedAtMs?: number;
  readonly createdAtMs?: number;
}

export interface HostDirEntry {
  readonly name: string;
  readonly type: HostFileType;
}

export interface HostFileSystemPort {
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  writeText(path: string, content: string): Promise<void>;
  writeBytes(path: string, content: Uint8Array): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  readDirectory(path: string): Promise<readonly HostDirEntry[]>;
  stat(path: string): Promise<HostFileStat>;
  createDirectory(path: string): Promise<void>;
  delete(path: string, options?: HostDeleteOptions): Promise<void>;
}

export interface HostDeleteOptions {
  readonly recursive?: boolean;
  readonly idempotent?: boolean;
}

export interface HostPathResolveRequest {
  readonly path: string;
  readonly baseDir?: string;
  readonly variables?: PathVariableMap;
}

export interface HostPathContractRequest {
  readonly absolutePath: string;
  readonly variables?: PathVariableMap;
}

export interface HostPathContainmentRequest {
  readonly path: string;
  readonly root: string;
}

export interface HostPathPort {
  resolvePath(request: HostPathResolveRequest): ResolvedPath;
  contractPath(request: HostPathContractRequest): string;
  normalizePath(path: string): string;
  join(...segments: readonly string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  isAbsolute(path: string): boolean;
  isInside(request: HostPathContainmentRequest): boolean;
}

export interface HostSecretPort {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface HostExternalPort {
  openExternal(uri: string): Promise<void>;
  revealPath?(path: string): Promise<void>;
}

export type HostAccessActor = 'client' | 'domain-runtime' | 'agent' | 'test';

export type HostStorageScope =
  | 'workspace-facts'
  | 'workspace-local'
  | 'workspace-cache'
  | 'user-global'
  | 'temporary'
  | 'external';

export type HostAccessOperation = 'read' | 'write' | 'delete' | 'list' | 'execute' | 'project';

export interface HostAccessPolicyRequest {
  readonly actor: HostAccessActor;
  readonly operation: HostAccessOperation;
  readonly path?: string;
  readonly scope?: HostStorageScope;
  readonly reason?: string;
}

export interface HostAccessDecision {
  readonly allowed: boolean;
  readonly diagnostic?: HostDiagnostic;
}

export interface HostAccessPolicyPort {
  decide(request: HostAccessPolicyRequest): HostMaybePromise<HostAccessDecision>;
}

export interface HostContentPolicyPort {
  getSnapshot(): HostMaybePromise<HostContentPolicySnapshot>;
}

export type HostDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface HostDiagnostic {
  readonly code: string;
  readonly severity: HostDiagnosticSeverity;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface HostDiagnosticSink {
  report(diagnostic: HostDiagnostic): void;
}

export interface NekoHostPorts {
  readonly environment: HostEnvironmentPort;
  readonly workspace: HostWorkspacePort;
  readonly files: HostFileSystemPort;
  readonly paths: HostPathPort;
  readonly accessPolicy?: HostAccessPolicyPort;
  readonly contentPolicy?: HostContentPolicyPort;
  readonly secrets?: HostSecretPort;
  readonly external?: HostExternalPort;
  readonly diagnostics?: HostDiagnosticSink;
}
