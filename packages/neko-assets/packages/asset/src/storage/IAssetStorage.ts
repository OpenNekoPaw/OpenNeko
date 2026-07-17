/**
 * Asset Storage Interface
 *
 * Abstraction layer for persisting asset library data.
 * Implementations can be JSON file, SQLite, or in-memory (for testing).
 */

import type { AssetEntity, AssetFile, AssetVariant, AssetQuery, SearchResult } from '@neko/shared';

/**
 * Asset storage interface
 */
export interface IAssetStorage {
  // =========================================================================
  // Entity Operations
  // =========================================================================

  /**
   * Get entity by ID
   */
  getEntity(id: string): Promise<AssetEntity | null>;

  /**
   * Get all entities
   */
  getAllEntities(): Promise<AssetEntity[]>;

  /**
   * Save entity (create or update)
   */
  saveEntity(entity: AssetEntity): Promise<void>;

  /**
   * Delete entity by ID
   */
  deleteEntity(id: string): Promise<boolean>;

  // =========================================================================
  // Variant Operations
  // =========================================================================

  /**
   * Get variant by ID
   */
  getVariant(entityId: string, variantId: string): Promise<AssetVariant | null>;

  /**
   * Save variant (create or update)
   */
  saveVariant(entityId: string, variant: AssetVariant): Promise<void>;

  /**
   * Delete variant
   */
  deleteVariant(entityId: string, variantId: string): Promise<boolean>;

  // =========================================================================
  // File Operations
  // =========================================================================

  /**
   * Get file by ID
   */
  getFile(variantId: string, fileId: string): Promise<AssetFile | null>;

  /**
   * Save file (create or update)
   */
  saveFile(variantId: string, file: AssetFile): Promise<void>;

  /**
   * Delete file
   */
  deleteFile(variantId: string, fileId: string): Promise<boolean>;

  // =========================================================================
  // Search Operations
  // =========================================================================

  /**
   * Search entities with query
   */
  search(query: AssetQuery): Promise<SearchResult>;

  /**
   * Get all unique tags with counts
   */
  getAllTags(): Promise<Array<{ tag: string; count: number }>>;

  // =========================================================================
  // Persistence
  // =========================================================================

  /**
   * Flush pending changes to storage
   */
  flush(): Promise<void>;

  /**
   * Load data from storage
   */
  load(): Promise<void>;

  /**
   * Check if storage is initialized
   */
  isInitialized(): boolean;
}

/**
 * Storage event types
 */
export type StorageEventType =
  | 'entity:created'
  | 'entity:updated'
  | 'entity:deleted'
  | 'variant:created'
  | 'variant:updated'
  | 'variant:deleted'
  | 'file:created'
  | 'file:deleted'
  | 'storage:loaded'
  | 'storage:flushed';

/**
 * Storage event listener
 */
export type StorageEventListener = (event: {
  type: StorageEventType;
  entityId?: string;
  variantId?: string;
  fileId?: string;
}) => void;

/**
 * Extended storage interface with events
 */
export interface IAssetStorageWithEvents extends IAssetStorage {
  /**
   * Add event listener
   */
  addEventListener(listener: StorageEventListener): void;

  /**
   * Remove event listener
   */
  removeEventListener(listener: StorageEventListener): void;
}
