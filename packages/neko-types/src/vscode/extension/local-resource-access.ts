import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import type * as vscode from 'vscode';

const requireModule = createRequire(
  typeof __filename === 'string' ? __filename : path.join(process.cwd(), 'package.json'),
);

export type LocalResourceRootKind =
  | 'extension-asset'
  | 'workspace'
  | 'media-library'
  | 'extension-cache'
  | 'workspace-cache'
  | 'feature';

export interface LocalResourceRoot {
  readonly uri: vscode.Uri;
  readonly kind: LocalResourceRootKind;
  readonly providerId?: string;
}

export type LocalResourceRootInput = vscode.Uri | LocalResourceRoot;

export interface LocalResourceRootProvider {
  readonly id: string;
  readonly getRoots: () =>
    Promise<readonly LocalResourceRootInput[]> | readonly LocalResourceRootInput[];
}

export interface LocalResourceAccessLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface LocalResourceAccessOptions {
  readonly rootProviders?: readonly LocalResourceRootProvider[];
  readonly logger?: LocalResourceAccessLogger;
}

export interface DefaultLocalResourceAccessServiceOptions {
  readonly extensionUri: vscode.Uri;
  readonly context?: vscode.ExtensionContext;
  readonly extensionAssetSegments?: readonly string[];
  readonly includeExtensionCache?: boolean;
  readonly includeWorkspaceCache?: boolean;
  readonly getWorkspaceFolders?: () => readonly { readonly uri: vscode.Uri }[] | undefined;
  readonly extraRootProviders?: readonly LocalResourceRootProvider[];
  readonly logger?: LocalResourceAccessLogger;
}

export interface LocalResourceProjectionOptions {
  readonly extraRoots?: readonly LocalResourceRootInput[];
  readonly caller?: string;
}

export type LocalResourceProjectionResult =
  | {
      readonly ok: true;
      readonly kind: 'local' | 'remote';
      readonly source: string;
      readonly uri: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'invalid-path' | 'unauthorized';
      readonly source: string;
      readonly message: string;
    };

export interface LocalResourceWebviewOptions {
  readonly enableScripts?: boolean;
  readonly extraRoots?: readonly LocalResourceRootInput[];
}

export interface LocalResourceAccessService {
  getLocalResourceRoots(
    options?: Pick<LocalResourceProjectionOptions, 'extraRoots'>,
  ): Promise<vscode.Uri[]>;
  configureWebview(webview: vscode.Webview, options?: LocalResourceWebviewOptions): Promise<void>;
  isAuthorizedPath(
    filePath: string,
    options?: Pick<LocalResourceProjectionOptions, 'extraRoots'>,
  ): Promise<boolean>;
  toWebviewUri(
    webview: vscode.Webview,
    source: string,
    options?: LocalResourceProjectionOptions,
  ): Promise<LocalResourceProjectionResult>;
  createSyncProjector(
    webview: vscode.Webview,
    roots: readonly vscode.Uri[],
    options?: Pick<LocalResourceProjectionOptions, 'caller'>,
  ): (source: string) => string | undefined;
}

export class VSCodeLocalResourceAccessService implements LocalResourceAccessService {
  private readonly rootProviders: readonly LocalResourceRootProvider[];
  private readonly logger?: LocalResourceAccessLogger;

  constructor(options: LocalResourceAccessOptions = {}) {
    this.rootProviders = options.rootProviders ?? [];
    this.logger = options.logger;
  }

  async getLocalResourceRoots(
    options: Pick<LocalResourceProjectionOptions, 'extraRoots'> = {},
  ): Promise<vscode.Uri[]> {
    const inputs: LocalResourceRootInput[] = [];

    for (const provider of this.rootProviders) {
      const roots = await provider.getRoots();
      for (const root of roots) {
        inputs.push(withProviderId(root, provider.id));
      }
    }

    for (const root of options.extraRoots ?? []) {
      inputs.push(root);
    }

    return dedupeUris(
      inputs
        .map(toLocalResourceRoot)
        .filter((root) => !isBroadLocalRoot(root.uri) && !isSystemTempUri(root.uri))
        .map((root) => root.uri),
    );
  }

  async configureWebview(
    webview: vscode.Webview,
    options: LocalResourceWebviewOptions = {},
  ): Promise<void> {
    const localResourceRoots = await this.getLocalResourceRoots({
      extraRoots: options.extraRoots,
    });
    webview.options = {
      ...webview.options,
      ...(options.enableScripts === undefined ? {} : { enableScripts: options.enableScripts }),
      localResourceRoots,
    };
  }

  async isAuthorizedPath(
    filePath: string,
    options: Pick<LocalResourceProjectionOptions, 'extraRoots'> = {},
  ): Promise<boolean> {
    const localPath = normalizeLocalFilePath(filePath);
    if (!localPath) return false;
    if (isSystemTempPath(localPath)) return false;

    const roots = await this.getLocalResourceRoots(options);
    return roots.some((root) => isPathInsideRoot(localPath, root));
  }

  async toWebviewUri(
    webview: vscode.Webview,
    source: string,
    options: LocalResourceProjectionOptions = {},
  ): Promise<LocalResourceProjectionResult> {
    if (isRemoteUrl(source)) {
      return { ok: true, kind: 'remote', source, uri: source };
    }

    const localPath = normalizeLocalFilePath(source);
    if (!localPath) {
      return {
        ok: false,
        reason: 'invalid-path',
        source,
        message: 'Local resource path is empty or not a local file path.',
      };
    }
    if (isSystemTempPath(localPath)) {
      this.logger?.warn('Local resource path is in system temp and cannot be projected', {
        path: localPath,
        caller: options.caller,
      });
      return {
        ok: false,
        reason: 'unauthorized',
        source,
        message: 'Local resource path is in system temp and cannot be projected.',
      };
    }

    if (!(await this.isAuthorizedPath(localPath, { extraRoots: options.extraRoots }))) {
      this.logger?.warn('Local resource path is outside authorized roots', {
        path: localPath,
        caller: options.caller,
      });
      return {
        ok: false,
        reason: 'unauthorized',
        source,
        message: 'Local resource path is outside authorized roots.',
      };
    }

    return {
      ok: true,
      kind: 'local',
      source,
      uri: webview.asWebviewUri(getVSCode().Uri.file(localPath)).toString(),
    };
  }

  createSyncProjector(
    webview: vscode.Webview,
    roots: readonly vscode.Uri[],
    options: Pick<LocalResourceProjectionOptions, 'caller'> = {},
  ): (source: string) => string | undefined {
    return (source) => {
      if (isRemoteUrl(source)) return source;

      const localPath = normalizeLocalFilePath(source);
      if (!localPath) return undefined;
      if (isSystemTempPath(localPath)) {
        this.logger?.warn('Local resource path is in system temp and cannot be projected', {
          path: localPath,
          caller: options.caller,
        });
        return undefined;
      }

      if (!roots.some((root) => isPathInsideRoot(localPath, root))) {
        this.logger?.warn('Local resource path is outside authorized roots', {
          path: localPath,
          caller: options.caller,
        });
        return undefined;
      }

      return webview.asWebviewUri(getVSCode().Uri.file(localPath)).toString();
    };
  }
}

export function revokeWebviewLocalResourceAccess(webview: Pick<vscode.Webview, 'options'>): void {
  webview.options = {
    ...webview.options,
    localResourceRoots: [],
  };
}

export function createStaticLocalResourceRootProvider(
  id: string,
  kind: LocalResourceRootKind,
  roots: readonly vscode.Uri[],
): LocalResourceRootProvider {
  return {
    id,
    getRoots: () => roots.map((uri) => ({ uri, kind, providerId: id })),
  };
}

export function createWorkspaceLocalResourceRootProvider(
  getWorkspaceFolders: () =>
    readonly { readonly uri: vscode.Uri }[] | undefined = getDefaultWorkspaceFolders,
): LocalResourceRootProvider {
  return {
    id: 'workspace',
    getRoots: () =>
      (getWorkspaceFolders() ?? []).map((folder) => ({
        uri: folder.uri,
        kind: 'workspace' as const,
        providerId: 'workspace',
      })),
  };
}

export function createExtensionAssetLocalResourceRootProvider(
  extensionUri: vscode.Uri,
  ...segments: string[]
): LocalResourceRootProvider {
  const uri =
    segments.length > 0 ? getVSCode().Uri.joinPath(extensionUri, ...segments) : extensionUri;
  return createStaticLocalResourceRootProvider('extension-assets', 'extension-asset', [uri]);
}

export function createExtensionCacheLocalResourceRootProvider(
  context: vscode.ExtensionContext,
  ...segments: string[]
): LocalResourceRootProvider {
  const uri =
    segments.length > 0
      ? getVSCode().Uri.joinPath(context.globalStorageUri, ...segments)
      : context.globalStorageUri;
  return createStaticLocalResourceRootProvider('extension-cache', 'extension-cache', [uri]);
}

export function createWorkspaceCacheLocalResourceRootProvider(
  getWorkspaceFolders: () =>
    readonly { readonly uri: vscode.Uri }[] | undefined = getDefaultWorkspaceFolders,
): LocalResourceRootProvider {
  return {
    id: 'workspace-neko-cache',
    getRoots: () =>
      (getWorkspaceFolders() ?? []).map((folder) => ({
        uri: getVSCode().Uri.joinPath(folder.uri, '.neko', '.cache'),
        kind: 'workspace-cache' as const,
        providerId: 'workspace-neko-cache',
      })),
  };
}

export function createDefaultLocalResourceAccessService(
  options: DefaultLocalResourceAccessServiceOptions,
): LocalResourceAccessService {
  const extensionAssetSegments = options.extensionAssetSegments ?? ['dist', 'webview'];
  const rootProviders: LocalResourceRootProvider[] = [
    createExtensionAssetLocalResourceRootProvider(options.extensionUri, ...extensionAssetSegments),
    createWorkspaceLocalResourceRootProvider(options.getWorkspaceFolders),
  ];

  if (options.context && options.includeExtensionCache === true) {
    rootProviders.push(createExtensionCacheLocalResourceRootProvider(options.context));
  }

  if (options.includeWorkspaceCache === true) {
    rootProviders.push(createWorkspaceCacheLocalResourceRootProvider(options.getWorkspaceFolders));
  }

  rootProviders.push(...(options.extraRootProviders ?? []));

  return new VSCodeLocalResourceAccessService({
    logger: options.logger,
    rootProviders,
  });
}

export function normalizeLocalFilePath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || isRemoteUrl(trimmed)) return undefined;

  if (hasUriScheme(trimmed) && !isWindowsDrivePath(trimmed)) {
    try {
      const uri = getVSCode().Uri.parse(trimmed);
      if (uri.scheme && uri.scheme !== 'file') {
        return undefined;
      }
      if (uri.scheme === 'file') {
        return normalizeFsPath(uri.fsPath);
      }
    } catch {
      return undefined;
    }
  }

  return normalizeFsPath(trimmed);
}

export function isRemoteUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function withProviderId(root: LocalResourceRootInput, providerId: string): LocalResourceRootInput {
  if (isLocalResourceRoot(root)) {
    return root.providerId ? root : { ...root, providerId };
  }
  return root;
}

function toLocalResourceRoot(root: LocalResourceRootInput): LocalResourceRoot {
  if (isLocalResourceRoot(root)) return root;
  return { uri: root, kind: 'feature' };
}

function isLocalResourceRoot(root: LocalResourceRootInput): root is LocalResourceRoot {
  return 'uri' in root && 'kind' in root;
}

function dedupeUris(uris: readonly vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  const result: vscode.Uri[] = [];
  for (const uri of uris) {
    const key = `${uri.scheme}:${normalizeFsPath(uri.fsPath)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(uri);
  }
  return result;
}

function isBroadLocalRoot(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') return false;
  const fsPath = normalizeFsPath(uri.fsPath);
  const parsed = path.parse(fsPath);
  const homeDir = getOsPath('homedir');
  const tempDir = getOsPath('tmpdir');
  return (
    fsPath === normalizeFsPath(parsed.root) ||
    (homeDir !== undefined && fsPath === normalizeFsPath(homeDir)) ||
    (tempDir !== undefined && fsPath === normalizeFsPath(tempDir))
  );
}

function isSystemTempUri(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && isSystemTempPath(normalizeFsPath(uri.fsPath));
}

function isSystemTempPath(filePath: string): boolean {
  const normalized = normalizeFsPath(filePath).replace(/\\/g, '/');
  const tempDir = getOsPath('tmpdir');
  if (tempDir !== undefined) {
    const normalizedTemp = normalizeFsPath(tempDir).replace(/\\/g, '/');
    if (normalized === normalizedTemp || normalized.startsWith(`${normalizedTemp}/`)) {
      return true;
    }
  }
  return (
    normalized === '/tmp' ||
    normalized.startsWith('/tmp/') ||
    normalized === '/private/tmp' ||
    normalized.startsWith('/private/tmp/') ||
    normalized === '/var/tmp' ||
    normalized.startsWith('/var/tmp/') ||
    normalized === '/private/var/tmp' ||
    normalized.startsWith('/private/var/tmp/') ||
    /^\/(?:private\/)?var\/folders\/[^/]+\/[^/]+(?:\/[^/]+)?\/T(?:\/|$)/.test(normalized) ||
    /\/AppData\/Local\/Temp(?:\/|$)/i.test(normalized)
  );
}

function isPathInsideRoot(filePath: string, root: vscode.Uri): boolean {
  if (root.scheme !== 'file') return false;
  const rootPath = normalizeFsPath(root.fsPath);
  const relative = path.relative(rootPath, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeFsPath(fsPath: string): string {
  return path.normalize(fsPath);
}

function getDefaultWorkspaceFolders(): readonly { readonly uri: vscode.Uri }[] | undefined {
  try {
    return getVSCode().workspace.workspaceFolders;
  } catch {
    return undefined;
  }
}

interface VSCodeRuntimeApi {
  readonly Uri: {
    file(filePath: string): vscode.Uri;
    parse(value: string): vscode.Uri;
    joinPath(base: vscode.Uri, ...segments: string[]): vscode.Uri;
  };
  readonly workspace: {
    readonly workspaceFolders: readonly { readonly uri: vscode.Uri }[] | undefined;
  };
}

function getVSCode(): VSCodeRuntimeApi {
  try {
    const candidate: unknown = requireModule('vscode');
    if (!isVSCodeRuntimeApi(candidate)) {
      throw new Error('The vscode runtime module does not expose the required URI API.');
    }
    return candidate;
  } catch (error) {
    if (process.env['VITEST']) return createVitestVSCodeUriApi();
    throw error;
  }
}

function isVSCodeRuntimeApi(value: unknown): value is VSCodeRuntimeApi {
  if (typeof value !== 'object' || value === null) return false;
  const uri = Reflect.get(value, 'Uri');
  const workspace = Reflect.get(value, 'workspace');
  return (
    (typeof uri === 'object' || typeof uri === 'function') &&
    uri !== null &&
    typeof Reflect.get(uri, 'file') === 'function' &&
    typeof Reflect.get(uri, 'parse') === 'function' &&
    typeof Reflect.get(uri, 'joinPath') === 'function' &&
    typeof workspace === 'object' &&
    workspace !== null
  );
}

function createVitestVSCodeUriApi(): VSCodeRuntimeApi {
  return {
    Uri: {
      file: (filePath) => new VitestUri('file', filePath),
      parse: (value) => {
        const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
        const scheme = schemeMatch?.[1] ?? '';
        const fsPath = scheme === 'file' ? value.replace(/^file:\/\//u, '') : value;
        return new VitestUri(scheme, fsPath);
      },
      joinPath: (base, ...segments) => {
        const basePath = base.fsPath || base.path;
        if (!basePath) {
          throw new Error('Cannot join a VS Code URI without a filesystem path.');
        }
        return new VitestUri(base.scheme, path.join(basePath, ...segments));
      },
    },
    workspace: { workspaceFolders: undefined },
  };
}

class VitestUri implements vscode.Uri {
  readonly authority = '';
  readonly query = '';
  readonly fragment = '';
  readonly path: string;

  constructor(
    readonly scheme: string,
    readonly fsPath: string,
  ) {
    this.path = fsPath.replace(/\\/gu, '/');
  }

  with(change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): vscode.Uri {
    return new VitestUri(change.scheme ?? this.scheme, change.path ?? this.fsPath);
  }

  toString(_skipEncoding?: boolean): string {
    return this.scheme === 'file' ? `file://${this.path}` : `${this.scheme}:${this.path}`;
  }

  toJSON(): unknown {
    return { scheme: this.scheme, path: this.path };
  }
}

function getOsPath(method: 'homedir' | 'tmpdir'): string | undefined {
  try {
    const fn = (os as unknown as Record<typeof method, unknown>)[method];
    return typeof fn === 'function' ? fn() : undefined;
  } catch {
    return undefined;
  }
}

function hasUriScheme(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}
