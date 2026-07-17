/**
 * Asset Query Types
 *
 * Types for searching and filtering assets in the library.
 */

import type {
  AssetEntity,
  AssetSource,
  EntityCategory,
  OwnershipScope,
  ViewAngle,
  ExpressionState,
  ActionState,
} from './entity';

// =============================================================================
// Query Types
// =============================================================================

/** Sort field options */
export type AssetSortField = 'name' | 'createdAt' | 'updatedAt' | 'usageCount' | 'lastUsedAt';

/** Sort direction */
export type SortDirection = 'asc' | 'desc';

/** Variant attribute filter for queries */
export interface VariantAttributeQuery {
  /** View angles to include */
  views?: ViewAngle[];
  /** Expression states to include */
  expressions?: ExpressionState[];
  /** Action states to include */
  actions?: ActionState[];
  /** Outfit names to include */
  outfits?: string[];
}

/** Asset query parameters */
export interface AssetQuery {
  /** Search keyword (matches name, description, tags, aliases) */
  keyword?: string;
  /** Filter by categories */
  categories?: EntityCategory[];
  /** Filter by tags (AND logic) */
  tags?: string[];
  /** Filter by any of these tags (OR logic) */
  anyTags?: string[];
  /** Filter by source type */
  sourceTypes?: Array<AssetSource['type']>;
  /** Filter by creation date range */
  createdAfter?: number;
  createdBefore?: number;
  /** Filter by last used date range */
  usedAfter?: number;
  usedBefore?: number;
  /** Minimum usage count */
  minUsageCount?: number;
  /** Filter by variant attributes */
  variantAttributes?: VariantAttributeQuery;
  /** Sort field */
  sortBy?: AssetSortField;
  /** Sort direction */
  sortDirection?: SortDirection;
  /** Pagination: number of results to return */
  limit?: number;
  /** Pagination: number of results to skip */
  offset?: number;
  /** Filter by ownership scopes */
  ownershipScopes?: OwnershipScope[];
}

/** Search result */
export interface SearchResult {
  /** Matching entities */
  entities: AssetEntity[];
  /** Total count (before pagination) */
  total: number;
  /** Query that produced this result */
  query: AssetQuery;
  /** Whether there are more results */
  hasMore: boolean;
}

// =============================================================================
// Suggestion Types
// =============================================================================

/** Tag suggestion */
export interface TagSuggestion {
  /** Tag name */
  tag: string;
  /** Number of entities with this tag */
  count: number;
  /** Relevance score (0-1) */
  relevance?: number;
}

/** Entity suggestion for import */
export interface SuggestedEntity {
  /** Existing entity that may match */
  entity: AssetEntity;
  /** Similarity score (0-1) */
  similarity: number;
  /** Match type */
  matchType: 'visual' | 'semantic' | 'name';
  /** Suggested variant name if adding to this entity */
  suggestedVariantName?: string;
}
