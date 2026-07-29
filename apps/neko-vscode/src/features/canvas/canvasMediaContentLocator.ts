import { isContentLocator, type ContentLocator, type StoryboardMediaRef } from '@neko/shared';

/**
 * Read the canonical durable content location from Canvas storyboard lineage.
 * Storyboard locators and ResourceRef values are legacy semantic projections;
 * callers must not infer content identity from them.
 */
export function toCanvasStableMediaContentLocator(ref: StoryboardMediaRef): ContentLocator {
  if (isContentLocator(ref.contentLocator)) return ref.contentLocator;
  throw new Error(
    `storyboard-media-content-locator-migration-required: Storyboard media ref ${ref.refId} requires contentLocator.`,
  );
}
