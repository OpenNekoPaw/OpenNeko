import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { NEKO_EXTENSION_IDS, type NekoAssetsAPI } from '../../types/extension-api';

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

export interface MediaLibraryLocalResourceRootProviderOptions {
  readonly id?: string;
  readonly command?: string;
  readonly extensionId?: string;
  readonly logger?: LocalResourceAccessLogger;
  readonly getExtension?: (extensionId: string) => MediaLibraryExtensionHandle | undefined;
  readonly executeCommand?: (
    command: string,
    ...args: readonly unknown[]
  ) => Promise<unknown> | Thenable<unknown> | unknown;
}

export interface MediaLibraryExtensionHandle {
  readonly isActive: boolean;
  readonly exports: unknown;
  activate(): Promise<unknown> | Thenable<unknown>;
}

export interface DefaultLocalResourceAccessServiceOptions {
  readonly extensionUri: vscode.Uri;
  readonly context?: vscode.ExtensionContext;
  readonly extensionAssetSegments?: readonly string[];
  readonly includeExtensionCache?: boolean;
  readonly includeWorkspaceCache?: boolean;
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
      uri: webview.asWebviewUri(vscode.Uri.file(localPath)).toString(),
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

      return webview.asWebviewUri(vscode.Uri.file(localPath)).toString();
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
  const uri = segments.length > 0 ? vscode.Uri.joinPath(extensionUri, ...segments) : extensionUri;
  return createStaticLocalResourceRootProvider('extension-assets', 'extension-asset', [uri]);
}

export function createExtensionCacheLocalResourceRootProvider(
  context: vscode.ExtensionContext,
  ...segments: string[]
): LocalResourceRootProvider {
  const uri =
    segments.length > 0
      ? vscode.Uri.joinPath(context.globalStorageUri, ...segments)
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
        uri: vscode.Uri.joinPath(folder.uri, '.neko', '.cache'),
        kind: 'workspace-cache' as const,
        providerId: 'workspace-neko-cache',
      })),
  };
}

export function createMediaLibraryLocalResourceRootProvider(
  options: MediaLibraryLocalResourceRootProviderOptions = {},
): LocalResourceRootProvider {
  const id = options.id ?? 'neko-assets-media-libraries';
  const command = options.command ?? 'neko.assets.getMediaLibraryRoots';
  const extensionId = options.extensionId ?? NEKO_EXTENSION_IDS.NEKO_ASSETS;
  const executeCommand =
    options.executeCommand ?? ((name: string) => vscode.commands.executeCommand(name));
  const extensionLookup = createMediaLibraryExtensionLookup(options.getExtension);

  return {
    id,
    async getRoots() {
      if (extensionLookup) {
        const extensionResult = await getMediaLibraryRootsFromExtension(
          extensionLookup,
          extensionId,
        );
        if (extensionResult.kind === 'roots') {
          return createMediaLibraryRoots(extensionResult.roots, id);
        }
        if (extensionResult.kind === 'error') {
          options.logger?.warn('Failed to get neko-assets media library roots', {
            error: extensionResult.error,
          });
          return [];
        }
      }

      try {
        const result = await executeCommand(command);
        if (!Array.isArray(result)) return [];
        return createMediaLibraryRoots(result, id);
      } catch (error) {
        if (isCommandUnavailableError(error, command)) {
          return [];
        }
        options.logger?.warn('Failed to get neko-assets media library roots', { error });
        return [];
      }
    },
  };
}

function createMediaLibraryRoots(
  roots: readonly unknown[],
  providerId: string,
): LocalResourceRoot[] {
  return roots
    .filter((root): root is string => typeof root === 'string' && root.trim().length > 0)
    .map((root) => ({
      uri: vscode.Uri.file(root),
      kind: 'media-library' as const,
      providerId,
    }));
}

function createMediaLibraryExtensionLookup(
  getExtension: MediaLibraryLocalResourceRootProviderOptions['getExtension'],
): ((extensionId: string) => MediaLibraryExtensionHandle | undefined) | undefined {
  if (getExtension) {
    return getExtension;
  }

  const extensions = (vscode as { extensions?: unknown }).extensions;
  if (!isExtensionRegistry(extensions)) {
    return undefined;
  }

  return (extensionId: string) => extensions.getExtension(extensionId);
}

async function getMediaLibraryRootsFromExtension(
  getExtension: (extensionId: string) => MediaLibraryExtensionHandle | undefined,
  extensionId: string,
): Promise<
  | { readonly kind: 'roots'; readonly roots: readonly unknown[] }
  | { readonly kind: 'missing' }
  | { readonly kind: 'no-api' }
  | { readonly kind: 'error'; readonly error: unknown }
> {
  const extension = getExtension(extensionId);
  if (!extension) {
    return { kind: 'missing' };
  }

  try {
    const activatedExports = extension.isActive ? extension.exports : await extension.activate();
    const api = isMediaLibraryRootsAPI(activatedExports)
      ? activatedExports
      : isMediaLibraryRootsAPI(extension.exports)
        ? extension.exports
        : undefined;

    if (!api) {
      return { kind: 'no-api' };
    }

    return { kind: 'roots', roots: await api.getMediaLibraryRoots() };
  } catch (error) {
    return { kind: 'error', error };
  }
}

function isExtensionRegistry(value: unknown): value is {
  getExtension(extensionId: string): MediaLibraryExtensionHandle | undefined;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getExtension?: unknown }).getExtension === 'function'
  );
}

function isMediaLibraryRootsAPI(
  value: unknown,
): value is Pick<NekoAssetsAPI, 'getMediaLibraryRoots'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getMediaLibraryRoots?: unknown }).getMediaLibraryRoots === 'function'
  );
}

function isCommandUnavailableError(error: unknown, command: string): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  return message.includes(command) && /not found|not registered|unknown command/i.test(message);
}

export function createDefaultLocalResourceAccessService(
  options: DefaultLocalResourceAccessServiceOptions,
): LocalResourceAccessService {
  const extensionAssetSegments = options.extensionAssetSegments ?? ['dist', 'webview'];
  const rootProviders: LocalResourceRootProvider[] = [
    createExtensionAssetLocalResourceRootProvider(options.extensionUri, ...extensionAssetSegments),
    createWorkspaceLocalResourceRootProvider(),
    createMediaLibraryLocalResourceRootProvider({ logger: options.logger }),
  ];

  if (options.context && options.includeExtensionCache !== false) {
    rootProviders.push(createExtensionCacheLocalResourceRootProvider(options.context));
  }

  if (options.includeWorkspaceCache !== false) {
    rootProviders.push(createWorkspaceCacheLocalResourceRootProvider());
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
      const uri = vscode.Uri.parse(trimmed);
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
    return (
      vscode as unknown as {
        workspace?: { workspaceFolders?: readonly { readonly uri: vscode.Uri }[] };
      }
    ).workspace?.workspaceFolders;
  } catch {
    return undefined;
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
