/**
 * Asset Registry Protocol Types
 *
 * Defines the interfaces for the unified asset registry system.
 * These interfaces are implemented in @neko/asset and consumed
 * by all extensions via the Extension Host layer.
 */

import type { AssetManifest, AssetType } from './manifest';

// =============================================================================
// Asset Change Events
// =============================================================================

/** Change event types */
export type AssetChangeKind = 'registered' | 'unregistered' | 'updated';

/** Asset change event */
export interface AssetChangeEvent {
  /** Change type */
  kind: AssetChangeKind;
  /** Asset ID */
  id: string;
  /** Asset type */
  type: AssetType;
  /** Updated manifest (undefined for unregister) */
  manifest?: AssetManifest;
}

// =============================================================================
// Asset Handler
// =============================================================================

/** Validation result from a handler */
export interface AssetValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * IAssetHandler — type-specific asset lifecycle handler.
 *
 * Each asset type (shader, ai-model, plugin, etc.) registers a handler
 * that knows how to validate, extract metadata, and manage lifecycle.
 * Media types (video/audio/image/sequence) are handled internally
 * by the registry via AssetLibrary.
 */
export interface IAssetHandler<T extends AssetType = AssetType> {
  /** Asset type this handler manages */
  readonly type: T;

  /** Validate an asset at the given path */
  validate(path: string): Promise<AssetValidationResult>;

  /** Extract type-specific metadata from the asset */
  extractMetadata(path: string): Promise<Record<string, unknown>>;

  /** Generate a preview/thumbnail for the asset (returns path or undefined) */
  generatePreview?(id: string, path: string): Promise<string | undefined>;

  /** Called after an asset is registered */
  onInstall?(id: string, manifest: AssetManifest): Promise<void>;

  /** Called before an asset is unregistered */
  onUninstall?(id: string, manifest: AssetManifest): Promise<void>;

  /** Called after an asset is updated */
  onUpdate?(id: string, manifest: AssetManifest): Promise<void>;
}

// =============================================================================
// Asset Resolver
// =============================================================================

/**
 * IAssetResolver — resolves asset IDs to file paths or URIs.
 *
 * Abstracts away the storage location so consumers don't need
 * to know whether an asset is local, in Git LFS, or from a registry.
 */
export interface IAssetResolver {
  /** Resolve asset ID to an absolute file path */
  resolve(id: string): Promise<string | undefined>;

  /** Resolve a specific version of an asset */
  resolveVersion?(id: string, version: string): Promise<string | undefined>;
}

// =============================================================================
// Asset Registry
// =============================================================================

/** Query filter for the registry */
export interface AssetRegistryQuery {
  /** Filter by asset types */
  types?: AssetType[];
  /** Full-text search */
  text?: string;
  /** Filter by tags (from distribution) */
  tags?: string[];
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * IAssetRegistry — unified asset registry facade.
 *
 * Single entry point for all asset operations across all types.
 * Routes operations to type-specific IAssetHandler implementations.
 * Media assets (video/audio/image/sequence) are handled internally
 * via the existing AssetLibrary.
 */
export interface IAssetRegistry {
  // =========================================================================
  // CRUD
  // =========================================================================

  /** Register a new asset */
  register(manifest: AssetManifest): Promise<string>;

  /** Unregister an asset by ID */
  unregister(id: string): Promise<void>;

  /** Update an existing asset */
  update(id: string, patch: Partial<AssetManifest>): Promise<void>;

  // =========================================================================
  // Query
  // =========================================================================

  /** Get a single asset by ID */
  get(id: string): Promise<AssetManifest | undefined>;

  /** Query assets with filters */
  query(filter: AssetRegistryQuery): Promise<AssetManifest[]>;

  /** Full-text search across all assets */
  search(text: string, types?: AssetType[]): Promise<AssetManifest[]>;

  // =========================================================================
  // Handler Management
  // =========================================================================

  /** Register a type-specific handler */
  registerHandler(handler: IAssetHandler): void;

  // =========================================================================
  // Resolver
  // =========================================================================

  /** Resolve asset ID to file path */
  resolve(id: string): Promise<string | undefined>;
}
