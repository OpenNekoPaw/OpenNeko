/**
 * Media Adapter Registry - Factory for creating media adapters
 *
 * Extends BaseRegistry to provide media adapter management.
 */

import { BaseRegistry } from '../../core/base-registry';
import type { MediaAdapter } from '../types';
import type { ProviderType } from '../../types/provider';

/**
 * Media adapter registry for creating adapters by provider type
 *
 * Inherits from BaseRegistry to share common registry functionality
 * with AdapterRegistry.
 *
 * Unlike AdapterRegistry, MediaAdapterRegistry uses lazy initialization
 * via registerBuiltin() to support dynamic adapter registration.
 */
export class MediaAdapterRegistry extends BaseRegistry<ProviderType, MediaAdapter> {
  /**
   * Register a built-in adapter
   *
   * This method is used for lazy initialization of media adapters,
   * allowing adapters to be registered dynamically.
   */
  registerBuiltin(type: ProviderType, adapter: MediaAdapter): void {
    this.builtinItems.set(type, adapter);
  }

  /**
   * Unregister a built-in adapter
   */
  unregisterBuiltin(type: ProviderType): void {
    this.builtinItems.delete(type);
  }
}

// Singleton instance
let registryInstance: MediaAdapterRegistry | null = null;

/**
 * Get the global media adapter registry instance
 */
export function getMediaAdapterRegistry(): MediaAdapterRegistry {
  if (!registryInstance) {
    registryInstance = new MediaAdapterRegistry();
  }
  return registryInstance;
}

/**
 * Create a new media adapter registry (for testing)
 */
export function createMediaAdapterRegistry(): MediaAdapterRegistry {
  return new MediaAdapterRegistry();
}
