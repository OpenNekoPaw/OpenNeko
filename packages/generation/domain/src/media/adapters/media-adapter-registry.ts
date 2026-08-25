/**
 * Media Adapter Registry
 *
 * Exact-identity map from provider type to the single canonical polling media adapter.
 * Provider types owned by the AI SDK (`openai`, `newapi`, `oneapi`, `generic`, `xai`,
 * `kling`) are deliberately absent: they execute through the AI SDK stack only.
 */

import type { MediaAdapter } from '@neko/generation-domain';
import type { ProviderType } from '@neko/ai-contracts';

export class MediaAdapterRegistry {
  private readonly adapters = new Map<ProviderType, MediaAdapter>();

  registerBuiltin(type: ProviderType, adapter: MediaAdapter): void {
    this.adapters.set(type, adapter);
  }

  unregisterBuiltin(type: ProviderType): void {
    this.adapters.delete(type);
  }

  getForType(type: string): MediaAdapter | undefined {
    return this.adapters.get(type as ProviderType);
  }
}

// Singleton instance shared by createMediaPlatform and MediaGenerationExecutor.
let registryInstance: MediaAdapterRegistry | null = null;

export function getMediaAdapterRegistry(): MediaAdapterRegistry {
  if (!registryInstance) {
    registryInstance = new MediaAdapterRegistry();
  }
  return registryInstance;
}

export function createMediaAdapterRegistry(): MediaAdapterRegistry {
  return new MediaAdapterRegistry();
}
