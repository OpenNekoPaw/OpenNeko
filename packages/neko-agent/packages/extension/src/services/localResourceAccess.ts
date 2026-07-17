import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  NEKO_EXTENSION_IDS,
  stripGeneratedAssetPath,
  type NekoAssetsAPI,
  type RenderableGeneratedAsset,
  type GeneratedAsset,
} from '@neko/shared';
import {
  VSCodeLocalResourceAccessService,
  createExtensionAssetLocalResourceRootProvider,
  createWorkspaceCacheLocalResourceRootProvider,
  createWorkspaceLocalResourceRootProvider,
  normalizeLocalFilePath,
  type LocalResourceAccessService,
  type LocalResourceRootProvider,
} from '@neko/shared/vscode/extension';
import { getLogger } from '../base';

const logger = getLogger('AgentLocalResourceAccess');

export interface AgentLocalResourceAccess {
  readonly service: LocalResourceAccessService;
  configureChatWebview(webview: vscode.Webview): Promise<void>;
  createProjector(
    webview: vscode.Webview,
    caller: string,
  ): Promise<(source: string) => string | undefined>;
  toWebviewUri(webview: vscode.Webview, source: string, caller: string): string | undefined;
  toWebviewAsset<T extends GeneratedAsset>(
    webview: vscode.Webview,
    asset: T,
  ): RenderableGeneratedAsset<T>;
  dispose(): void;
}

export function createAgentLocalResourceAccess(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
): AgentLocalResourceAccess {
  return new VSCodeAgentLocalResourceAccess(extensionUri, context);
}

class VSCodeAgentLocalResourceAccess implements AgentLocalResourceAccess {
  readonly service: LocalResourceAccessService;
  private readonly mediaLibraryRoots = new MediaLibraryRootProvider();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly projectors = new Map<vscode.Webview, (source: string) => string | undefined>();
  private readonly webviews = new Set<vscode.Webview>();
  private readonly requiredWorkspaceCacheRoots: readonly vscode.Uri[];

  constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this.requiredWorkspaceCacheRoots = getWorkspaceCacheRoots();
    this.service = new VSCodeLocalResourceAccessService({
      logger,
      rootProviders: [
        createExtensionAssetLocalResourceRootProvider(extensionUri, 'dist', 'webview'),
        createWorkspaceLocalResourceRootProvider(),
        this.mediaLibraryRoots,
        createWorkspaceCacheLocalResourceRootProvider(),
      ],
    });

    this.disposables.push(
      this.mediaLibraryRoots.onDidChange(() => {
        for (const webview of Array.from(this.webviews)) {
          void this.configureChatWebview(webview);
        }
      }),
    );
  }

  async configureChatWebview(webview: vscode.Webview): Promise<void> {
    await this.mediaLibraryRoots.refresh();
    await this.service.configureWebview(webview, { enableScripts: true });
    this.webviews.add(webview);
    this.projectors.set(
      webview,
      this.service.createSyncProjector(webview, webview.options.localResourceRoots ?? [], {
        caller: 'neko-agent.chat',
      }),
    );
  }

  async createProjector(
    webview: vscode.Webview,
    caller: string,
  ): Promise<(source: string) => string | undefined> {
    await this.ensureConfigured(webview);
    const roots =
      webview.options.localResourceRoots ?? (await this.service.getLocalResourceRoots());
    const projector = this.service.createSyncProjector(webview, roots, { caller });
    this.projectors.set(webview, projector);
    return projector;
  }

  toWebviewUri(webview: vscode.Webview, source: string, caller: string): string | undefined {
    const roots = this.ensureRequiredWorkspaceCacheRoots(webview, source);
    const projector = this.service.createSyncProjector(webview, roots, { caller });
    this.projectors.set(webview, projector);
    const uri = projector(source);
    if (uri === undefined) {
      logger.warn('Unable to project local resource for Webview display', { source, caller });
    }
    return uri;
  }

  toWebviewAsset<T extends GeneratedAsset>(
    webview: vscode.Webview,
    asset: T,
  ): RenderableGeneratedAsset<T> {
    const renderUri = this.toWebviewUri(webview, asset.path, 'neko-agent.generated-asset');
    if (!renderUri) {
      throw new Error(`Unable to project generated asset for Webview display: ${asset.id}`);
    }
    return {
      ...stripGeneratedAssetPath(asset),
      renderUri,
    } as unknown as RenderableGeneratedAsset<T>;
  }

  dispose(): void {
    this.projectors.clear();
    this.webviews.clear();
    this.mediaLibraryRoots.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private async ensureConfigured(webview: vscode.Webview): Promise<void> {
    if (webview.options.localResourceRoots && webview.options.localResourceRoots.length > 0) {
      this.webviews.add(webview);
      return;
    }

    await this.configureChatWebview(webview);
  }

  private ensureRequiredWorkspaceCacheRoots(
    webview: vscode.Webview,
    source: string,
  ): readonly vscode.Uri[] {
    const currentRoots = webview.options.localResourceRoots ?? [];
    const localPath = normalizeLocalFilePath(source);
    if (!localPath) return currentRoots;

    const matchingRoots = this.requiredWorkspaceCacheRoots.filter((root) =>
      isPathInsideRoot(localPath, root),
    );
    if (matchingRoots.length === 0) return currentRoots;

    const nextRoots = dedupeUris([...currentRoots, ...matchingRoots]);
    if (nextRoots.length === currentRoots.length) return currentRoots;

    webview.options = {
      ...webview.options,
      localResourceRoots: nextRoots,
    };
    return nextRoots;
  }
}

class MediaLibraryRootProvider implements LocalResourceRootProvider, vscode.Disposable {
  readonly id = 'neko-assets-media-libraries';
  private readonly roots = new Set<string>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private subscribed = false;

  async getRoots(): Promise<vscode.Uri[]> {
    await this.refresh();
    return Array.from(this.roots).map((root) => vscode.Uri.file(root));
  }

  async refresh(): Promise<void> {
    const api = await getNekoAssetsApi();
    if (!api) {
      this.roots.clear();
      return;
    }

    this.subscribe(api);

    const nextRoots = await api.getMediaLibraryRoots();
    this.roots.clear();
    for (const root of nextRoots) {
      this.roots.add(root);
    }
  }

  dispose(): void {
    this.roots.clear();
    this.onDidChangeEmitter.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private subscribe(api: NekoAssetsAPI): void {
    if (this.subscribed) return;
    this.subscribed = true;
    this.disposables.push(
      api.onDidChangeMediaLibraryRoots(() => {
        void this.refresh().finally(() => {
          this.onDidChangeEmitter.fire();
        });
      }),
    );
  }
}

async function getNekoAssetsApi(): Promise<NekoAssetsAPI | undefined> {
  const extension = vscode.extensions.getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS);
  if (!extension) return undefined;

  try {
    return extension.isActive ? extension.exports : await extension.activate();
  } catch (error) {
    logger.warn('Failed to activate neko-assets for media library roots', { error });
    return undefined;
  }
}

function getWorkspaceCacheRoots(): readonly vscode.Uri[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) =>
    vscode.Uri.joinPath(folder.uri, '.neko', '.cache'),
  );
}

function dedupeUris(uris: readonly vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  const result: vscode.Uri[] = [];
  for (const uri of uris) {
    const key = `${uri.scheme}:${path.normalize(uri.fsPath)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(uri);
  }
  return result;
}

function isPathInsideRoot(filePath: string, root: vscode.Uri): boolean {
  if (root.scheme !== 'file') return false;
  const rootPath = path.normalize(root.fsPath);
  const relative = path.relative(rootPath, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
