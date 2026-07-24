import * as vscode from 'vscode';
import {
  stripGeneratedAssetPath,
  type RenderableGeneratedAsset,
  type GeneratedAsset,
} from '@neko/shared';
import {
  VSCodeLocalResourceAccessService,
  createExtensionAssetLocalResourceRootProvider,
  createWorkspaceLocalResourceRootProvider,
  normalizeLocalFilePath,
  type LocalResourceAccessService,
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
  private readonly projectors = new Map<vscode.Webview, (source: string) => string | undefined>();
  private readonly webviews = new Set<vscode.Webview>();

  constructor(extensionUri: vscode.Uri, _context: vscode.ExtensionContext) {
    this.service = new VSCodeLocalResourceAccessService({
      logger,
      rootProviders: [
        createExtensionAssetLocalResourceRootProvider(extensionUri, 'dist', 'webview'),
        createWorkspaceLocalResourceRootProvider(() => vscode.workspace.workspaceFolders),
      ],
    });
  }

  async configureChatWebview(webview: vscode.Webview): Promise<void> {
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
    if (isWorkspaceDerivedStoragePath(source)) {
      logger.warn('Rejected Host-private derived storage path for Webview display', { caller });
      return undefined;
    }
    const roots = webview.options.localResourceRoots ?? [];
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
  }

  private async ensureConfigured(webview: vscode.Webview): Promise<void> {
    if (webview.options.localResourceRoots && webview.options.localResourceRoots.length > 0) {
      this.webviews.add(webview);
      return;
    }

    await this.configureChatWebview(webview);
  }
}

function isWorkspaceDerivedStoragePath(source: string): boolean {
  const localPath = normalizeLocalFilePath(source);
  if (!localPath) return false;
  const normalized = localPath.replace(/\\/gu, '/');
  return normalized.includes('/.neko/.cache/') || normalized.endsWith('/.neko/.cache');
}
