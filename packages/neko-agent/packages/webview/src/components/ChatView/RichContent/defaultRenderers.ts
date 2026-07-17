/**
 * Default renderer registration — call once at app init to populate the registry
 * with all built-in content renderers.
 */

import { richContentRegistry } from './RichContentRegistry';
import {
  imageRendererEntry,
  imageGridRendererEntry,
  panoramicImageRendererEntry,
  panoramicVideoRendererEntry,
  videoRendererEntry,
  audioRendererEntry,
  storyboardRendererEntry,
  compositeArtifactRendererEntry,
  storyboardTableRendererEntry,
  comparisonGridRendererEntry,
  assetGalleryRendererEntry,
} from './renderers';

let initialized = false;

/**
 * Register all built-in renderers. Safe to call multiple times (idempotent).
 */
export function registerDefaultRenderers(): void {
  if (initialized) return;
  initialized = true;

  richContentRegistry.register(imageRendererEntry);
  richContentRegistry.register(imageGridRendererEntry);
  richContentRegistry.register(panoramicImageRendererEntry);
  richContentRegistry.register(panoramicVideoRendererEntry);
  richContentRegistry.register(videoRendererEntry);
  richContentRegistry.register(audioRendererEntry);
  richContentRegistry.register(storyboardRendererEntry);
  richContentRegistry.register(compositeArtifactRendererEntry);
  richContentRegistry.register(storyboardTableRendererEntry);
  richContentRegistry.register(comparisonGridRendererEntry);
  richContentRegistry.register(assetGalleryRendererEntry);
}
