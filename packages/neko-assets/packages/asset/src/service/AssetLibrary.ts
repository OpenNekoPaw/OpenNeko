/**
 * Asset Library Service (Facade)
 *
 * Main entry point for the asset management system.
 * Coordinates entity, variant, file services and search functionality.
 */

import type {
  AssetEntity,
  AssetFile,
  AssetVariant,
  AssetQuery,
  CreateEntityInput,
  CreateVariantInput,
  EntityCategory,
  SearchResult,
  UpdateEntityInput,
  UpdateVariantInput,
  AddFileOptions,
  ClassificationResult,
  SuggestedEntity,
  MoveVariantInput,
  MoveVariantResult,
  MergeEntitiesInput,
  MergeEntitiesResult,
} from '@neko/shared';
import { PathResolver } from '@neko/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';
import type { IAssetClassifier } from '../classifier/IClassifier';
import { EntityService } from './EntityService';
import { VariantService } from './VariantService';
import { FileService, type MetadataExtractor } from './FileService';
import { AssetHealthService } from './AssetHealthService';
import type {
  FileAccessChecker,
  FileHealthResult,
  HealthCheckProgress,
  PathVariableMap,
} from './types';

/**
 * Thumbnail generator result
 */
export interface ThumbnailGeneratorResult {
  /** Absolute path to the generated thumbnail */
  path: string;
  /** Width of the thumbnail */
  width: number;
  /** Height of the thumbnail */
  height: number;
}

/**
 * Thumbnail generator callback.
 * Keeps the core library free of vscode/Node.js dependencies.
 * Returns null if thumbnail generation is not available or not applicable.
 */
export type ThumbnailGenerator = (filePath: string) => Promise<ThumbnailGeneratorResult | null>;

/**
 * Asset library configuration
 */
export interface AssetLibraryConfig {
  /** Storage implementation */
  storage: IAssetStorage;
  /** Optional AI classifier */
  classifier?: IAssetClassifier;
  /** Optional metadata extractor */
  metadataExtractor?: MetadataExtractor;
  /** Optional thumbnail generator (injected from extension host) */
  thumbnailGenerator?: ThumbnailGenerator;
  /** Optional file access checker for health monitoring */
  fileAccessChecker?: FileAccessChecker;
  /** Optional path variable map for resolving ${VAR} paths */
  pathVariables?: PathVariableMap;
}

/**
 * Import options
 */
export interface ImportOptions {
  /** If provided, add to existing entity */
  entityId?: string;
  /** If provided with entityId, add to existing variant */
  variantId?: string;
  /** Options for creating new entity */
  entityInput?: CreateEntityInput;
  /** Options for creating new variant */
  variantInput?: CreateVariantInput;
  /** Options for the file */
  fileOptions?: AddFileOptions;
  /** Auto-classify the file */
  autoClassify?: boolean;
}

/**
 * Import result
 */
export interface ImportResult {
  entity: AssetEntity;
  variant: AssetVariant;
  file: AssetFile;
  isNewEntity: boolean;
  isNewVariant: boolean;
  classification?: ClassificationResult;
}

/**
 * Asset Library - Main facade for asset management
 */
export class AssetLibrary {
  private storage: IAssetStorage;
  private entityService: EntityService;
  private variantService: VariantService;
  private fileService: FileService;
  private classifier?: IAssetClassifier;
  private thumbnailGenerator?: ThumbnailGenerator;
  private healthService?: AssetHealthService;
  private pathResolver: PathResolver;

  constructor(config: AssetLibraryConfig) {
    this.storage = config.storage;
    this.classifier = config.classifier;
    this.thumbnailGenerator = config.thumbnailGenerator;

    this.entityService = new EntityService(this.storage);
    this.variantService = new VariantService(this.storage);
    this.fileService = new FileService(this.storage, {
      metadataExtractor: config.metadataExtractor,
    });

    // Initialize health service if checker provided
    if (config.fileAccessChecker) {
      this.healthService = new AssetHealthService({
        storage: this.storage,
        fileAccessChecker: config.fileAccessChecker,
      });
    }

    // Initialize path resolver
    this.pathResolver = new PathResolver();
    if (config.pathVariables) {
      this.pathResolver.setVariables(config.pathVariables);
    }
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Initialize the library (load data from storage)
   */
  async initialize(): Promise<void> {
    if (!this.storage.isInitialized()) {
      await this.storage.load();
    }
  }

  /**
   * Flush pending changes to storage
   */
  async flush(): Promise<void> {
    await this.storage.flush();
  }

  // =========================================================================
  // Entity Operations
  // =========================================================================

  /**
   * Create a new entity
   */
  async createEntity(input: CreateEntityInput): Promise<AssetEntity> {
    return this.entityService.create(input);
  }

  /**
   * Get entity by ID
   */
  async getEntity(id: string): Promise<AssetEntity | null> {
    return this.entityService.get(id);
  }

  /**
   * Get all entities
   */
  async getAllEntities(): Promise<AssetEntity[]> {
    return this.entityService.getAll();
  }

  /**
   * Update an entity
   */
  async updateEntity(id: string, updates: UpdateEntityInput): Promise<AssetEntity> {
    return this.entityService.update(id, updates);
  }

  /**
   * Delete an entity
   */
  async deleteEntity(id: string): Promise<boolean> {
    return this.entityService.delete(id);
  }

  /**
   * Get entities by category
   */
  async getByCategory(category: EntityCategory): Promise<AssetEntity[]> {
    return this.entityService.getByCategory(category);
  }

  /**
   * Get entities by tags
   */
  async getByTags(tags: string[]): Promise<AssetEntity[]> {
    return this.entityService.getByTags(tags);
  }

  /**
   * Get recent entities
   */
  async getRecent(limit?: number): Promise<AssetEntity[]> {
    return this.entityService.getRecent(limit);
  }

  /**
   * Record usage of an entity
   */
  async recordUsage(id: string): Promise<AssetEntity> {
    return this.entityService.recordUsage(id);
  }

  // =========================================================================
  // Variant Operations
  // =========================================================================

  /**
   * Add a variant to an entity
   */
  async addVariant(entityId: string, input: CreateVariantInput): Promise<AssetVariant> {
    return this.variantService.add(entityId, input);
  }

  /**
   * Get a variant
   */
  async getVariant(entityId: string, variantId: string): Promise<AssetVariant | null> {
    return this.variantService.get(entityId, variantId);
  }

  /**
   * Update a variant
   */
  async updateVariant(
    entityId: string,
    variantId: string,
    updates: UpdateVariantInput,
  ): Promise<AssetVariant> {
    return this.variantService.update(entityId, variantId, updates);
  }

  /**
   * Delete a variant
   */
  async deleteVariant(entityId: string, variantId: string): Promise<boolean> {
    return this.variantService.delete(entityId, variantId);
  }

  /**
   * Move a variant from one entity to another
   */
  async moveVariant(input: MoveVariantInput): Promise<MoveVariantResult> {
    return this.variantService.moveToEntity(input);
  }

  /**
   * Merge two entities - moves all variants from source to target
   */
  async mergeEntities(input: MergeEntitiesInput): Promise<MergeEntitiesResult> {
    return this.entityService.merge(input);
  }

  // =========================================================================
  // File Operations
  // =========================================================================

  /**
   * Add a file to a variant
   */
  async addFile(variantId: string, filePath: string, options?: AddFileOptions): Promise<AssetFile> {
    return this.fileService.add(variantId, filePath, options);
  }

  /**
   * Remove a file
   */
  async removeFile(variantId: string, fileId: string): Promise<boolean> {
    return this.fileService.remove(variantId, fileId);
  }

  // =========================================================================
  // Search Operations
  // =========================================================================

  /**
   * Search entities
   */
  async search(query: AssetQuery): Promise<SearchResult> {
    return this.storage.search(query);
  }

  /**
   * Get all tags with counts
   */
  async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    return this.storage.getAllTags();
  }

  // =========================================================================
  // AI Classification
  // =========================================================================

  /**
   * Classify a file using AI
   */
  async classifyFile(filePath: string): Promise<ClassificationResult | null> {
    if (!this.classifier) {
      return null;
    }
    return this.classifier.analyze(filePath);
  }

  /**
   * Find similar entities for a file
   */
  async findSimilarEntities(filePath: string): Promise<SuggestedEntity[]> {
    if (!this.classifier) {
      return [];
    }
    return this.classifier.findSimilarEntities(filePath);
  }

  /**
   * Suggest tags for a file
   */
  async suggestTags(filePath: string): Promise<string[]> {
    if (!this.classifier) {
      return [];
    }
    return this.classifier.suggestTags(filePath);
  }

  // =========================================================================
  // Import
  // =========================================================================

  /**
   * Find the entity/variant/file that already holds a given stored path.
   * Used by importFile to prevent duplicate imports of the same file.
   */
  private async findByStoredPath(
    storedPath: string,
  ): Promise<{ entity: AssetEntity; variant: AssetVariant; file: AssetFile } | null> {
    const entities = await this.getAllEntities();
    for (const entity of entities) {
      for (const variant of entity.variants) {
        const file = variant.files.find((f) => f.path === storedPath);
        if (file) {
          return { entity, variant, file };
        }
      }
    }
    return null;
  }

  /**
   * Import a file into the library
   */
  async importFile(filePath: string, options?: ImportOptions): Promise<ImportResult> {
    // Contract path to use variables if possible
    const storedPath = this.pathResolver.contract(filePath);

    // Deduplicate: if this exact path is already in the library and the caller
    // did not request a specific entity/variant, return the existing record.
    if (!options?.entityId && !options?.variantId) {
      const existing = await this.findByStoredPath(storedPath);
      if (existing) {
        return {
          entity: existing.entity,
          variant: existing.variant,
          file: existing.file,
          isNewEntity: false,
          isNewVariant: false,
          classification: undefined,
        };
      }
    }

    let entity: AssetEntity;
    let variant: AssetVariant;
    let isNewEntity = false;
    let isNewVariant = false;
    let classification: ClassificationResult | undefined;

    // Auto-classify if requested and classifier available
    if (options?.autoClassify && this.classifier) {
      classification = await this.classifier.analyze(filePath);
    }

    // Extract file extension for auto-tagging
    const fileExtension = this.extractExtension(filePath);

    // Determine entity
    if (options?.entityId) {
      // Use existing entity
      const existingEntity = await this.entityService.get(options.entityId);
      if (!existingEntity) {
        throw new Error(`Entity not found: ${options.entityId}`);
      }
      entity = existingEntity;
    } else {
      // Create new entity with category-based tags
      const category = classification?.suggestedCategory ?? 'object';
      const categoryTags = this.getCategoryTags(category);
      const entityInput: CreateEntityInput = options?.entityInput ?? {
        name: classification?.suggestedName ?? this.extractName(filePath),
        category,
        description: classification?.description,
        tags: [...new Set([...(classification?.suggestedTags ?? []), ...categoryTags])],
      };
      entity = await this.entityService.create(entityInput);
      isNewEntity = true;
    }

    // Determine variant
    if (options?.variantId && !isNewEntity) {
      // Use existing variant
      const existingVariant = await this.variantService.get(entity.id, options.variantId);
      if (!existingVariant) {
        throw new Error(`Variant not found: ${options.variantId}`);
      }
      variant = existingVariant;
    } else {
      // Create new variant with file type tag
      const variantTags = fileExtension ? [fileExtension] : [];
      const variantInput: CreateVariantInput = options?.variantInput ?? {
        name:
          classification?.detectedAttributes?.view ??
          classification?.detectedAttributes?.expression ??
          'Default',
        attributes: classification?.detectedAttributes ?? {},
        tags: variantTags,
      };
      variant = await this.variantService.add(entity.id, variantInput);
      isNewVariant = true;
    }

    // Add file (use contracted path for storage, absolute path for operations)
    const file = await this.fileService.add(variant.id, storedPath, options?.fileOptions);

    // Update thumbnail if this is the first file
    if (variant.files.length === 1 && (file.mediaType === 'image' || file.mediaType === 'video')) {
      const thumbnailUpdate: UpdateVariantInput = {
        thumbnailFileId: file.id,
      };

      // Generate thumbnail if generator is available
      if (this.thumbnailGenerator) {
        try {
          const thumb = await this.thumbnailGenerator(filePath);
          if (thumb) {
            thumbnailUpdate.thumbnailPath = thumb.path;
          }
        } catch {
          // Thumbnail generation failure is non-fatal
        }
      }

      await this.variantService.update(entity.id, variant.id, thumbnailUpdate);
    }

    // Re-fetch to get updated state
    entity = (await this.entityService.get(entity.id))!;
    variant = (await this.variantService.get(entity.id, variant.id))!;

    return {
      entity,
      variant,
      file,
      isNewEntity,
      isNewVariant,
      classification,
    };
  }

  // =========================================================================
  // Health Check & Path Resolution
  // =========================================================================

  /**
   * Validate all asset files for accessibility
   */
  async validateAll(onProgress?: HealthCheckProgress): Promise<FileHealthResult[]> {
    if (!this.healthService) return [];
    return this.healthService.validateAll(onProgress);
  }

  /**
   * Relocate a file to a new path
   */
  async relocateFile(
    variantId: string,
    fileId: string,
    newPath: string,
  ): Promise<FileHealthResult | null> {
    if (!this.healthService) return null;
    return this.healthService.relocateFile(variantId, fileId, newPath);
  }

  /**
   * Get health summary counts
   */
  async getHealthSummary(): Promise<{
    total: number;
    online: number;
    offline: number;
    missing: number;
    remapped: number;
  } | null> {
    if (!this.healthService) return null;
    return this.healthService.getSummary();
  }

  /**
   * Update path variables (when settings change)
   */
  updatePathVariables(variables: PathVariableMap): void {
    this.pathResolver.setVariables(variables);
  }

  /**
   * Resolve a stored path to absolute (expanding variables)
   */
  resolvePath(storedPath: string): string {
    return this.pathResolver.resolve(storedPath);
  }

  /**
   * Contract absolute path to use variables if possible
   */
  contractPath(absolutePath: string): string {
    return this.pathResolver.contract(absolutePath);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Extract name from file path
   */
  private extractName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    const fileName = parts[parts.length - 1] ?? filePath;
    // Remove extension
    return fileName.replace(/\.[^.]+$/, '');
  }

  /**
   * Extract file extension (without dot, lowercase)
   */
  private extractExtension(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    const fileName = parts[parts.length - 1] ?? filePath;
    const match = fileName.match(/\.([^.]+)$/);
    return match?.[1]?.toLowerCase() ?? '';
  }

  /**
   * Get category-based tags for entity
   */
  private getCategoryTags(category: EntityCategory): string[] {
    const categoryTagMap: Record<EntityCategory, string[]> = {
      character: ['character'],
      creature: ['creature', 'animal'],
      object: ['prop'],
      vehicle: ['vehicle', 'transport'],
      environment: ['background', 'scene'],
      effect: ['effect', 'vfx'],
      ui: ['ui', 'icon'],
      audio: ['audio', 'sound'],
      document: ['document', 'reference'],
    };
    return categoryTagMap[category] ?? [];
  }
}
