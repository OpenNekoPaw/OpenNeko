/**
 * Asset Service
 *
 * Extension Host 层的素材管理服务，桥接 @neko/asset 和 Webview。
 * 负责：
 * - 素材库初始化和持久化
 * - 处理来自 Webview 的素材操作请求
 * - 协调 AI 分类（通过 Platform）
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  AssetLibrary,
  JsonFileStorage,
  InMemoryStorage,
  RuleClassifier,
  type IFileSystem,
} from '@neko/asset';
import type {
  AssetEntity,
  AssetVariant,
  AssetFile,
  AssetQuery,
  SearchResult,
  CreateEntityInput,
  UpdateEntityInput,
  CreateVariantInput,
  UpdateVariantInput,
  AddFileOptions,
  ClassificationResult,
  EntityCategory,
  MoveVariantInput,
  MoveVariantResult,
  MergeEntitiesInput,
  MergeEntitiesResult,
  VariantComparisonResult,
} from '@neko/shared';
import { createServiceId, getLogger, handleError } from '../base';

const logger = getLogger('AssetService');

// =============================================================================
// Service Identifier
// =============================================================================

export const IAssetService = createServiceId<AssetService>('assetService');

// =============================================================================
// Types
// =============================================================================

export interface AssetServiceConfig {
  /** Storage directory path (for JsonFileStorage) */
  storagePath?: string;
  /** Extension-private storage root used when no workspace is open */
  globalStoragePath?: string;
  /** Use in-memory storage (for testing) */
  useInMemory?: boolean;
}

export interface ImportOptions {
  entityId?: string;
  variantId?: string;
  entityInput?: CreateEntityInput;
  variantInput?: CreateVariantInput;
  fileOptions?: AddFileOptions;
  autoClassify?: boolean;
}

export interface ImportResult {
  entity: AssetEntity;
  variant: AssetVariant;
  file: AssetFile;
  isNewEntity: boolean;
  isNewVariant: boolean;
  classification?: ClassificationResult;
}

// =============================================================================
// Asset Service
// =============================================================================

export class AssetService implements vscode.Disposable {
  private library: AssetLibrary | null = null;
  private initialized = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly config: AssetServiceConfig = {}) {}

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Initialize the asset service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Create storage
    let storage;
    if (this.config.useInMemory) {
      storage = new InMemoryStorage();
    } else {
      const storagePath = this.config.storagePath ?? this.getDefaultStoragePath();
      const filePath = path.join(storagePath, 'library.json');
      const nodeFs: IFileSystem = {
        async readFile(p: string) {
          return fs.readFile(p, 'utf-8');
        },
        async writeFile(p: string, content: string) {
          await fs.mkdir(path.dirname(p), { recursive: true });
          await fs.writeFile(p, content, 'utf-8');
        },
        async exists(p: string) {
          try {
            await fs.access(p);
            return true;
          } catch {
            return false;
          }
        },
        async mkdir(p: string) {
          await fs.mkdir(p, { recursive: true });
        },
      };
      storage = new JsonFileStorage({
        filePath,
        fs: nodeFs,
        autoSaveDelay: 1000,
      });
    }

    // Create library with rule-based classifier
    this.library = new AssetLibrary({
      storage,
      classifier: new RuleClassifier(),
    });

    await this.library.initialize();
    this.initialized = true;
  }

  /**
   * Get default storage path
   */
  private getDefaultStoragePath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceFolder = workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.join(workspaceFolder.uri.fsPath, 'neko', 'assets');
    }
    if (this.config.globalStoragePath) {
      return path.join(this.config.globalStoragePath, 'assets');
    }
    throw new Error('AssetService requires a workspace or extension global storage path.');
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.library = null;
    this.initialized = false;
  }

  // =========================================================================
  // Entity Operations
  // =========================================================================

  /**
   * Create a new entity
   */
  async createEntity(input: CreateEntityInput): Promise<AssetEntity> {
    this.ensureInitialized();
    return this.library!.createEntity(input);
  }

  /**
   * Get entity by ID
   */
  async getEntity(id: string): Promise<AssetEntity | null> {
    this.ensureInitialized();
    return this.library!.getEntity(id);
  }

  /**
   * Get all entities
   */
  async getAllEntities(): Promise<AssetEntity[]> {
    this.ensureInitialized();
    return this.library!.getAllEntities();
  }

  /**
   * Update an entity
   */
  async updateEntity(id: string, updates: UpdateEntityInput): Promise<AssetEntity> {
    this.ensureInitialized();
    return this.library!.updateEntity(id, updates);
  }

  /**
   * Delete an entity
   */
  async deleteEntity(id: string): Promise<boolean> {
    this.ensureInitialized();
    return this.library!.deleteEntity(id);
  }

  /**
   * Get entities by category
   */
  async getByCategory(category: EntityCategory): Promise<AssetEntity[]> {
    this.ensureInitialized();
    return this.library!.getByCategory(category);
  }

  /**
   * Get entities by tags
   */
  async getByTags(tags: string[]): Promise<AssetEntity[]> {
    this.ensureInitialized();
    return this.library!.getByTags(tags);
  }

  /**
   * Get recent entities
   */
  async getRecent(limit?: number): Promise<AssetEntity[]> {
    this.ensureInitialized();
    return this.library!.getRecent(limit);
  }

  /**
   * Record usage of an entity
   */
  async recordUsage(id: string): Promise<AssetEntity> {
    this.ensureInitialized();
    return this.library!.recordUsage(id);
  }

  // =========================================================================
  // Variant Operations
  // =========================================================================

  /**
   * Add a variant to an entity
   */
  async addVariant(entityId: string, input: CreateVariantInput): Promise<AssetVariant> {
    this.ensureInitialized();
    return this.library!.addVariant(entityId, input);
  }

  /**
   * Get a variant
   */
  async getVariant(entityId: string, variantId: string): Promise<AssetVariant | null> {
    this.ensureInitialized();
    return this.library!.getVariant(entityId, variantId);
  }

  /**
   * Update a variant
   */
  async updateVariant(
    entityId: string,
    variantId: string,
    updates: UpdateVariantInput,
  ): Promise<AssetVariant> {
    this.ensureInitialized();
    return this.library!.updateVariant(entityId, variantId, updates);
  }

  /**
   * Delete a variant
   */
  async deleteVariant(entityId: string, variantId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.library!.deleteVariant(entityId, variantId);
  }

  /**
   * Move a variant to another entity
   */
  async moveVariant(input: MoveVariantInput): Promise<MoveVariantResult> {
    this.ensureInitialized();
    return this.library!.moveVariant(input);
  }

  /**
   * Merge two entities
   */
  async mergeEntities(input: MergeEntitiesInput): Promise<MergeEntitiesResult> {
    this.ensureInitialized();
    return this.library!.mergeEntities(input);
  }

  // =========================================================================
  // File Operations
  // =========================================================================

  /**
   * Add a file to a variant
   */
  async addFile(variantId: string, filePath: string, options?: AddFileOptions): Promise<AssetFile> {
    this.ensureInitialized();
    return this.library!.addFile(variantId, filePath, options);
  }

  /**
   * Remove a file from a variant
   */
  async removeFile(variantId: string, fileId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.library!.removeFile(variantId, fileId);
  }

  // =========================================================================
  // Search Operations
  // =========================================================================

  /**
   * Search entities
   */
  async search(query: AssetQuery): Promise<SearchResult> {
    this.ensureInitialized();
    return this.library!.search(query);
  }

  /**
   * Get all tags with counts
   */
  async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    this.ensureInitialized();
    return this.library!.getAllTags();
  }

  // =========================================================================
  // Import Operations
  // =========================================================================

  /**
   * Import a file into the library
   */
  async importFile(filePath: string, options?: ImportOptions): Promise<ImportResult> {
    this.ensureInitialized();
    return this.library!.importFile(filePath, options);
  }

  /**
   * Import files from a dialog
   */
  async importFromDialog(): Promise<ImportResult[]> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      filters: {
        'Media Files': [
          'png',
          'jpg',
          'jpeg',
          'gif',
          'webp',
          'mp4',
          'webm',
          'mov',
          'mp3',
          'wav',
          'ogg',
        ],
        Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
        Videos: ['mp4', 'webm', 'mov'],
        Audio: ['mp3', 'wav', 'ogg'],
      },
    });

    if (!uris || uris.length === 0) {
      return [];
    }

    const results: ImportResult[] = [];
    for (const uri of uris) {
      try {
        const result = await this.importFile(uri.fsPath, { autoClassify: true });
        results.push(result);
      } catch (error) {
        logger.error(`Failed to import ${uri.fsPath}:`, error);
        handleError(error, { showToUser: true, severity: 'error' });
      }
    }

    return results;
  }

  // =========================================================================
  // AI Classification
  // =========================================================================

  /**
   * Classify a file using AI
   */
  async classifyFile(filePath: string): Promise<ClassificationResult | null> {
    this.ensureInitialized();
    return this.library!.classifyFile(filePath);
  }

  /**
   * Suggest tags for a file
   */
  async suggestTags(filePath: string): Promise<string[]> {
    this.ensureInitialized();
    return this.library!.suggestTags(filePath);
  }

  // =========================================================================
  // Variant Comparison (delegated to neko-assets)
  // =========================================================================

  /**
   * Compare two variants of the same entity.
   * Delegates to neko-assets AssetDiffService via internal command.
   */
  async compareVariants(
    entityId: string,
    variantIdA: string,
    variantIdB: string,
  ): Promise<VariantComparisonResult> {
    this.ensureInitialized();

    const result = await vscode.commands.executeCommand<VariantComparisonResult | null>(
      'neko.assets.compareVariants',
      entityId,
      variantIdA,
      variantIdB,
    );

    if (!result) {
      throw new Error('Variant comparison failed. Is neko-assets active?');
    }

    return result;
  }

  // =========================================================================
  // Persistence
  // =========================================================================

  /**
   * Flush changes to storage
   */
  async flush(): Promise<void> {
    this.ensureInitialized();
    return this.library!.flush();
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.library) {
      throw new Error('AssetService not initialized. Call initialize() first.');
    }
  }
}
