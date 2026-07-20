/**
 * AssetRegistry — Unified Asset Registry Facade
 *
 * Single entry point for all asset operations across all types.
 * Media assets (video/audio/image/sequence) delegate to AssetLibrary.
 * Other types (shader, ai-model, plugin, preset, etc.) route to
 * pluggable IAssetHandler implementations.
 *
 * Design:
 * - Facade pattern: unifies AssetLibrary + handler-based assets
 * - Strategy pattern: IAssetHandler per asset type
 * - Observer pattern: AssetChangeEvent for reactive updates
 */

import type {
  AssetManifest,
  AssetType,
  AssetChangeEvent,
  AssetRegistryQuery,
  IAssetRegistry,
  IAssetHandler,
  AssetEntity,
  AssetMediaType,
  MediaKind,
} from '@neko/shared';
import { AssetLibrary, type AssetLibraryConfig } from './AssetLibrary';

// =============================================================================
// Types
// =============================================================================

/** Listener for asset change events */
export type AssetChangeListener = (event: AssetChangeEvent) => void;

function isMediaType(type: AssetType): boolean {
  return type === 'media';
}

// =============================================================================
// AssetRegistry Configuration
// =============================================================================

export interface AssetRegistryConfig extends AssetLibraryConfig {
  /** Pre-registered handlers */
  handlers?: IAssetHandler[];
}

// =============================================================================
// AssetRegistry Implementation
// =============================================================================

export class AssetRegistry implements IAssetRegistry {
  private readonly library: AssetLibrary;
  private readonly handlers = new Map<AssetType, IAssetHandler>();
  private readonly manifests = new Map<string, AssetManifest>();
  private readonly listeners: AssetChangeListener[] = [];

  constructor(config: AssetRegistryConfig) {
    this.library = new AssetLibrary(config);

    // Register pre-configured handlers
    if (config.handlers) {
      for (const handler of config.handlers) {
        this.registerHandler(handler);
      }
    }
  }

  /** Access the underlying AssetLibrary (for media-specific operations) */
  get mediaLibrary(): AssetLibrary {
    return this.library;
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  async initialize(): Promise<void> {
    await this.library.initialize();
  }

  async flush(): Promise<void> {
    await this.library.flush();
  }

  // =========================================================================
  // CRUD
  // =========================================================================

  async register(manifest: AssetManifest): Promise<string> {
    const handler = this.handlers.get(manifest.type);

    // Validate via handler if available
    if (handler && manifest.source.kind === 'local') {
      const validation = await handler.validate(manifest.source.path);
      if (!validation.valid) {
        throw new Error(`Validation failed for ${manifest.type}: ${validation.errors?.join(', ')}`);
      }
    }

    // Store manifest
    this.manifests.set(manifest.id, { ...manifest, updatedAt: Date.now() });

    // Notify handler
    if (handler?.onInstall) {
      await handler.onInstall(manifest.id, manifest);
    }

    this.emit({ kind: 'registered', id: manifest.id, type: manifest.type, manifest });
    return manifest.id;
  }

  async unregister(id: string): Promise<void> {
    const manifest = this.manifests.get(id);
    if (!manifest) return;

    const handler = this.handlers.get(manifest.type);
    if (handler?.onUninstall) {
      await handler.onUninstall(id, manifest);
    }

    this.manifests.delete(id);
    this.emit({ kind: 'unregistered', id, type: manifest.type });
  }

  async update(id: string, patch: Partial<AssetManifest>): Promise<void> {
    const existing = this.manifests.get(id);
    if (!existing) {
      throw new Error(`Asset not found: ${id}`);
    }

    const updated: AssetManifest = {
      ...existing,
      ...patch,
      id: existing.id, // ID is immutable
      type: existing.type, // Type is immutable
      updatedAt: Date.now(),
    };

    this.manifests.set(id, updated);

    const handler = this.handlers.get(updated.type);
    if (handler?.onUpdate) {
      await handler.onUpdate(id, updated);
    }

    this.emit({ kind: 'updated', id, type: updated.type, manifest: updated });
  }

  // =========================================================================
  // Query
  // =========================================================================

  async get(id: string): Promise<AssetManifest | undefined> {
    // Check non-media manifests first
    const manifest = this.manifests.get(id);
    if (manifest) return manifest;

    // Check media library (convert entity to manifest)
    const entity = await this.library.getEntity(id);
    if (entity) {
      return this.entityToManifest(entity);
    }

    return undefined;
  }

  async query(filter: AssetRegistryQuery): Promise<AssetManifest[]> {
    const results: AssetManifest[] = [];

    // Query non-media manifests
    for (const manifest of this.manifests.values()) {
      if (this.matchesFilter(manifest, filter)) {
        results.push(manifest);
      }
    }

    // Query media library if media types are included (or no type filter)
    if (!filter.types || filter.types.some((t) => isMediaType(t))) {
      const entities = await this.library.getAllEntities();
      for (const entity of entities) {
        const manifest = this.entityToManifest(entity);
        if (this.matchesFilter(manifest, filter)) {
          results.push(manifest);
        }
      }
    }

    // Apply pagination
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async search(text: string, types?: AssetType[]): Promise<AssetManifest[]> {
    const lowerText = text.toLowerCase();
    return this.query({
      types,
      text: lowerText,
    });
  }

  // =========================================================================
  // Handler Management
  // =========================================================================

  registerHandler(handler: IAssetHandler): void {
    this.handlers.set(handler.type, handler);
  }

  // =========================================================================
  // Resolver
  // =========================================================================

  async resolve(id: string): Promise<string | undefined> {
    const manifest = this.manifests.get(id);
    if (manifest) {
      if (manifest.source.kind === 'local') return manifest.source.path;
      if (manifest.source.kind === 'git-lfs') return manifest.source.path;
      return undefined;
    }

    // Check media library
    const entity = await this.library.getEntity(id);
    if (entity) {
      const defaultVariant =
        entity.variants.find((v) => v.id === entity.defaultVariantId) ?? entity.variants[0];
      return defaultVariant?.files[0]?.path;
    }

    return undefined;
  }

  // =========================================================================
  // Event System
  // =========================================================================

  onDidChange(listener: AssetChangeListener): { dispose: () => void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) this.listeners.splice(index, 1);
      },
    };
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private emit(event: AssetChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors are non-fatal
      }
    }
  }

  private matchesFilter(manifest: AssetManifest, filter: AssetRegistryQuery): boolean {
    if (filter.types && !filter.types.includes(manifest.type)) {
      return false;
    }
    if (filter.text) {
      const searchText = filter.text.toLowerCase();
      const nameMatch = manifest.name.toLowerCase().includes(searchText);
      const tagMatch = manifest.distribution?.tags?.some((t) =>
        t.toLowerCase().includes(searchText),
      );
      if (!nameMatch && !tagMatch) return false;
    }
    if (filter.tags) {
      const manifestTags = manifest.distribution?.tags ?? [];
      if (!filter.tags.some((t) => manifestTags.includes(t))) return false;
    }
    return true;
  }

  /** Convert an AssetEntity to an AssetManifest for unified query results */
  private entityToManifest(entity: AssetEntity): AssetManifest {
    const primaryFile = entity.variants[0]?.files[0];
    const mediaType = primaryFile?.mediaType ?? 'image';

    return {
      id: entity.id,
      name: entity.name,
      version: '1.0.0',
      type: 'media',
      source: {
        kind: 'local',
        path: primaryFile?.path ?? '',
      },
      distributionKind: 'archive',
      typeMetadata: {
        type: 'media',
        data: {
          mediaKind: toMediaKind(mediaType),
          fileSize: primaryFile?.metadata.fileSize ?? 0,
        },
      },
      thumbnail: entity.variants[0]?.thumbnailPath,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

function toMediaKind(mediaType: AssetMediaType): MediaKind {
  return mediaType === 'text' ? 'document' : mediaType;
}
