/**
 * Service Bootstrap
 * 核心服务初始化模块
 *
 * 职责：协调视频编辑器核心服务的初始化和注册
 */

import * as vscode from 'vscode';
import { ServiceCollection } from '../base';
import { getRootLogger } from '../base';
import { IEditorRegistry, EditorRegistry } from '../editor/common/editorRegistry';
import { VideoEditorModelProvider } from '../editor/video/videoEditorModel';
import { IStatusBar, StatusBar } from '../views/statusBar';
import {
  IVideoProjectOutlineProvider,
  VideoProjectOutlineProvider,
} from '../views/outlineProvider';
import {
  ConnectionStateManager,
  IConnectionStateManager,
} from '../services/connectionStateManager';
import { IProjectSessionService, ProjectSessionService } from '../services/ProjectSessionService';
import {
  CutProjectAuthoringService,
  ICutProjectAuthoringService,
} from '../services/CutProjectAuthoringService';
import { addCutProjectSource } from '../editor/video/cutProjectSourceIngest';
import { IAssetService, AssetService } from '../services/AssetService';
import { MarketShaderService } from '../services/MarketShaderService';

// =============================================================================
// Service Identifiers
// =============================================================================

// Re-export service IDs
export { IConnectionStateManager, IAssetService };

// =============================================================================
// Service Bootstrap Result
// =============================================================================

/**
 * 服务引导结果
 */
export interface IServiceBootstrapResult {
  editorRegistry: EditorRegistry;
  statusBar: StatusBar;
  outlineProvider: VideoProjectOutlineProvider;
  connectionStateManager: ConnectionStateManager;
  cutProjectAuthoringService: CutProjectAuthoringService;
  assetService: AssetService;
  marketShaderService: MarketShaderService;
}

// =============================================================================
// Service Bootstrap
// =============================================================================

/**
 * 初始化核心服务
 */
export async function bootstrapCoreServices(
  services: ServiceCollection,
  context: vscode.ExtensionContext,
): Promise<IServiceBootstrapResult> {
  // ==========================================================================
  // 1. 连接状态管理器
  // ==========================================================================
  const connectionStateManager = new ConnectionStateManager();
  services.set(IConnectionStateManager, connectionStateManager);
  context.subscriptions.push(connectionStateManager);

  // ==========================================================================
  // 2. 编辑器注册表
  // ==========================================================================
  const editorRegistry = new EditorRegistry();
  services.set(IEditorRegistry, editorRegistry);
  editorRegistry.registerModelProvider('video', new VideoEditorModelProvider());

  // ==========================================================================
  // 3. Project Session（用于无 Webview 的外部/HTTP 执行上下文）
  // ==========================================================================
  const projectSessionService = new ProjectSessionService();
  services.set(IProjectSessionService, projectSessionService);

  const cutProjectAuthoringService = new CutProjectAuthoringService(projectSessionService, {
    createProjectSession: () => new ProjectSessionService(),
    ingestSource: (documentUri, request) =>
      addCutProjectSource(vscode.Uri.parse(documentUri), request),
  });
  services.set(ICutProjectAuthoringService, cutProjectAuthoringService);

  // ==========================================================================
  // 4. 状态栏服务
  // ==========================================================================
  const statusBar = new StatusBar();
  services.set(IStatusBar, statusBar);
  context.subscriptions.push(statusBar);

  // ==========================================================================
  // 5. 大纲视图服务
  // ==========================================================================
  const outlineProvider = new VideoProjectOutlineProvider();
  services.set(IVideoProjectOutlineProvider, outlineProvider);

  // ==========================================================================
  // 6. Asset Service (素材管理)
  // ==========================================================================
  const assetService = new AssetService({ globalStoragePath: context.globalStorageUri.fsPath });
  services.set(IAssetService, assetService);
  context.subscriptions.push(assetService);

  // Initialize asset service in background
  assetService.initialize().catch((error) => {
    getRootLogger().error('Failed to initialize AssetService:', error);
  });

  // ==========================================================================
  // 7. Market Shader Service (marketplace-installed shaders)
  // ==========================================================================
  const marketShaderService = new MarketShaderService(getRootLogger().child('MarketShaderService'));
  context.subscriptions.push(marketShaderService);

  // Initialize in background (non-blocking)
  marketShaderService.initialize().catch((error) => {
    getRootLogger().error('Failed to initialize MarketShaderService:', error);
  });

  return {
    editorRegistry,
    statusBar,
    outlineProvider,
    connectionStateManager,
    cutProjectAuthoringService,
    assetService,
    marketShaderService,
  };
}

// =============================================================================
// Logging
// =============================================================================

/**
 * 打印服务初始化日志
 */
export function logServicesStatus(_result: IServiceBootstrapResult): void {
  // Logging disabled for cleaner output
}
