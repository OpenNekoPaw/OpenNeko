/**
 * ModelIcon — category color tokens for model selectors.
 */

import type { ModelType } from '@neko/shared';

const CATEGORY_COLORS: Record<ModelType, string> = {
  llm: '#10A37F',
  image: '#A855F7',
  video: '#EF4444',
  audio: '#06B6D4',
};

export function getCategoryColor(category: ModelType | string | undefined): string {
  return category ? (CATEGORY_COLORS[category as ModelType] ?? '#6B7280') : '#6B7280';
}
