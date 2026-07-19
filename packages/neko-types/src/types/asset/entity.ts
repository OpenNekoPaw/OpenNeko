/**
 * Asset Entity Types
 *
 * Core type definitions for the asset management system.
 * Defines the hierarchical structure: Entity → Variant → File
 */

import type { BundleEntryLocator, MediaAssetStorageMode } from '../bundle-locator';
import type { CharacterAssetDimension, CharacterAssetMediaKind } from '../media-import';

// =============================================================================
// Entity Categories
// =============================================================================

/** Entity category - semantic classification */
export type EntityCategory =
  | 'character' // Characters, people, avatars
  | 'creature' // Animals, monsters, creatures
  | 'object' // Props, items, objects
  | 'vehicle' // Vehicles, transportation
  | 'environment' // Scenes, backgrounds, environments
  | 'effect' // Visual effects, particles
  | 'ui' // UI elements, icons
  | 'audio' // Audio asset collections
  | 'document'; // Documents, references, scripts

// =============================================================================
// Variant Attributes
// =============================================================================

/** View angle dimension */
export type ViewAngle =
  'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric' | '3/4';

/** Expression/emotion state */
export type ExpressionState =
  'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'talking' | 'sleeping' | 'custom';

/** Action/animation state */
export type ActionState = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'sit' | 'lie' | 'custom';

/** Texture/material type */
export type TextureType =
  | 'diffuse' // Base color / albedo
  | 'normal' // Normal map
  | 'roughness' // Roughness map
  | 'metallic' // Metallic map
  | 'emission' // Emissive map
  | 'alpha' // Alpha / opacity map
  | 'ao'; // Ambient occlusion

/** Time of day */
export type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk';

/** Variant attributes - combinable dimensions */
export interface VariantAttributes {
  /** View angle */
  view?: ViewAngle;
  /** Expression/emotion state */
  expression?: ExpressionState;
  /** Action/animation state */
  action?: ActionState;
  /** Texture type (for texture assets) */
  texture?: TextureType;
  /** Outfit/costume name */
  outfit?: string;
  /** Lighting condition */
  lighting?: string;
  /** Time of day */
  timeOfDay?: TimeOfDay;
  /** Weather condition (for environment) */
  weather?: string;
  /** Custom dimensions */
  custom?: Record<string, string>;
}

// =============================================================================
// Entity Metadata
// =============================================================================

/** Character-specific metadata */
export interface CharacterMetadata {
  /** Stable character registry ID from characters.json */
  registryId?: string;
  /** Role in story: protagonist, antagonist, supporting, npc */
  role?: string;
  /** Personality traits */
  personality?: string[];
  /** Voice actor name */
  voiceActor?: string;
  /** Age range */
  ageRange?: string;
  /** Gender */
  gender?: string;
}

/** Object-specific metadata */
export interface ObjectMetadata {
  /** Material type */
  material?: string;
  /** Size category */
  size?: 'small' | 'medium' | 'large';
  /** Whether the object is interactive */
  interactive?: boolean;
  /** Category/subcategory */
  subcategory?: string;
}

/** Environment-specific metadata */
export interface EnvironmentMetadata {
  /** Visual style: realistic, cartoon, pixel, etc. */
  style?: string;
  /** Whether indoor or outdoor */
  indoor?: boolean;
  /** Ambiance/mood */
  ambiance?: string;
  /** Location type */
  locationType?: string;
}

/** Effect-specific metadata */
export interface EffectMetadata {
  /** Effect type */
  effectType?: 'particle' | 'filter' | 'transition' | 'animation';
  /** Whether the effect loops */
  loopable?: boolean;
  /** Blend mode for compositing */
  blendMode?: string;
  /** Effect category */
  category?: string;
}

/** Document-specific metadata */
export interface DocumentEntityMetadata {
  /** Document role in the project */
  subtype?: 'reference' | 'script' | 'storyboard' | 'brief' | 'research' | 'other';
  /** File format hint (pdf, docx, etc.) */
  format?: string;
}

// =============================================================================
// Ownership Types
// =============================================================================

/** Asset ownership scope */
export type OwnershipScope = 'personal' | 'project' | 'team' | 'purchased' | 'public';

/** Asset access level */
export type AccessLevel = 'private' | 'readonly' | 'editable';

/** Asset ownership information */
export interface AssetOwnership {
  /** Scope of ownership */
  scope: OwnershipScope;
  /** Owner identifier (userId, teamId, etc.) */
  ownerId?: string;
  /** Access level */
  access: AccessLevel;
}

/** Asset source information */
export interface AssetSource {
  /** Source type */
  type: 'manual' | 'ai-generated' | 'imported' | 'stock';
  /** AI provider name (if ai-generated) */
  provider?: string;
  /** Generation prompt (if ai-generated) */
  prompt?: string;
  /** License information */
  license?: string;
  /** Original source URL */
  sourceUrl?: string;
  /** Stable provenance for an explicitly promoted generated candidate. */
  generated?: {
    readonly projectionId: string;
    readonly candidateId: string;
    readonly taskId: string;
    readonly runId?: string;
    readonly revision: string;
    readonly contentDigest: string;
  };
}

/** Entity metadata - category-specific information */
export interface EntityMetadata {
  /** Character metadata */
  character?: CharacterMetadata;
  /** Object metadata */
  object?: ObjectMetadata;
  /** Environment metadata */
  environment?: EnvironmentMetadata;
  /** Effect metadata */
  effect?: EffectMetadata;
  /** Document metadata */
  document?: DocumentEntityMetadata;
  /** Source information */
  source?: AssetSource;
}

// =============================================================================
// Core Data Structures
// =============================================================================

// =============================================================================
// File Status Types
// =============================================================================

/** Asset file accessibility status */
export type AssetFileStatus =
  | 'online' // File accessible at path
  | 'offline' // Path not accessible (NAS disconnected, mount unavailable)
  | 'missing' // Parent directory accessible but file not found (deleted/moved)
  | 'remapped'; // Original path invalid, user provided new path

/** Remap record for relocated files */
export interface AssetFileRemap {
  /** Original path that was invalid */
  originalPath: string;
  /** New path provided by user */
  remappedPath: string;
  /** Timestamp of remapping */
  remappedAt: number;
}

// =============================================================================
// File Types
// =============================================================================

/** File purpose in the variant */
export type FilePurpose =
  | 'main' // Primary display file
  | 'thumbnail' // Thumbnail image
  | 'preview' // Preview (video/audio clip)
  | 'texture' // Texture map
  | 'reference' // Reference image
  | 'source'; // Source file (PSD, AI, etc.)

/** Media file type */
export type AssetMediaType = 'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

/** Media file metadata */
export interface MediaFileMetadata {
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Width (for visual media) */
  width?: number;
  /** Height (for visual media) */
  height?: number;
  /** Duration in seconds (for time-based media) */
  duration?: number;
  /** Frame rate (for video) */
  frameRate?: number;
  /** Sample rate (for audio) */
  sampleRate?: number;
  /** Channel count (for audio) */
  channels?: number;
  /** Frame count (for image sequence) */
  frameCount?: number;
  /** Frame pattern (for image sequence, e.g., "frame_%04d.png") */
  framePattern?: string;
  /** Codec name */
  codec?: string;
  /** Bit rate */
  bitrate?: number;
  /** Character count (for text files) */
  characterCount?: number;
  /** Word count (for text files) */
  wordCount?: number;
  /** Line count (for text files) */
  lineCount?: number;
  /** Text encoding (for text files, e.g., "utf-8") */
  encoding?: string;
  /** Language (for text files, e.g., "en", "zh-CN") */
  language?: string;
}

export interface CharacterAssetDimensionMetadata {
  /** Character asset dimension represented by this file. */
  assetDimension?: CharacterAssetDimension;
  /** Domain media kind used by Search and Agent tools. */
  mediaKind?: CharacterAssetMediaKind;
  /** Storage mode for direct files, bundle-memory entries, and market assets. */
  storageMode?: MediaAssetStorageMode;
  /** Bundle entry metadata for bundle-memory assets. */
  bundleLocator?: BundleEntryLocator;
  /** Original import source path or package id when available. */
  sourceOrigin?: string;
  /** Content hash for source recovery and stale reference checks. */
  sourceHash?: string;
}

/** Asset file - concrete media resource */
export interface AssetFile {
  /** Unique file ID */
  id: string;
  /** Parent variant ID */
  variantId: string;
  /** File display name */
  name: string;
  /** Relative path from project root */
  path: string;
  /** Media type */
  mediaType: AssetMediaType;
  /** File metadata */
  metadata: MediaFileMetadata;
  /** File purpose */
  purpose?: FilePurpose;
  /** Creation timestamp */
  createdAt: number;
  /** File accessibility status (undefined treated as 'online' for backward compat) */
  status?: AssetFileStatus;
  /** Last time status was checked */
  lastCheckedAt?: number;
  /** Remap history when path was relocated */
  remap?: AssetFileRemap;
  /** Character representation metadata used by Search and Agent. */
  characterAsset?: CharacterAssetDimensionMetadata;
}

/** Asset variant - different representation of the same entity */
export interface AssetVariant {
  /** Unique variant ID */
  id: string;
  /** Parent entity ID */
  entityId: string;
  /** Variant display name */
  name: string;
  /** Variant attributes */
  attributes: VariantAttributes;
  /** Associated files */
  files: AssetFile[];
  /** Thumbnail source file ID (references AssetFile.id) */
  thumbnailFileId?: string;
  /** Generated thumbnail image path (absolute or relative to workspace) */
  thumbnailPath?: string;
  /** Notes/description */
  notes?: string;
  /** Variant-level tags */
  tags?: string[];
  /** Creation timestamp */
  createdAt: number;
}

/** Asset entity - top-level concept (e.g., a character, an object) */
export interface AssetEntity {
  /** Unique entity ID */
  id: string;
  /** Entity display name */
  name: string;
  /** Entity category */
  category: EntityCategory;
  /** Description */
  description?: string;
  /** Entity metadata */
  metadata: EntityMetadata;
  /** Variants of this entity */
  variants: AssetVariant[];
  /** Default variant ID for quick access */
  defaultVariantId?: string;
  /** Tags for search */
  tags: string[];
  /** Aliases for search */
  aliases?: string[];
  /** Usage count */
  usageCount: number;
  /** Last used timestamp */
  lastUsedAt?: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Ownership information (default: project scope, editable) */
  ownership?: AssetOwnership;
}

// =============================================================================
// Input Types for CRUD Operations
// =============================================================================

/** Input for creating an entity */
export interface CreateEntityInput {
  name: string;
  category: EntityCategory;
  description?: string;
  metadata?: EntityMetadata;
  tags?: string[];
  aliases?: string[];
  ownership?: AssetOwnership;
}

/** Input for updating an entity */
export interface UpdateEntityInput {
  name?: string;
  category?: EntityCategory;
  description?: string;
  metadata?: EntityMetadata;
  tags?: string[];
  aliases?: string[];
  defaultVariantId?: string;
  ownership?: AssetOwnership;
}

/** Input for creating a variant */
export interface CreateVariantInput {
  name: string;
  attributes?: VariantAttributes;
  notes?: string;
  tags?: string[];
}

/** Input for updating a variant */
export interface UpdateVariantInput {
  name?: string;
  attributes?: VariantAttributes;
  notes?: string;
  tags?: string[];
  thumbnailFileId?: string;
  thumbnailPath?: string;
}

/** Options for adding a file */
export interface AddFileOptions {
  name?: string;
  purpose?: FilePurpose;
  /** Pre-extracted metadata (skip extraction) */
  metadata?: Partial<MediaFileMetadata>;
  /** Character asset dimension metadata for Search and Agent. */
  characterAsset?: CharacterAssetDimensionMetadata;
}

// =============================================================================
// Variant Association Types
// =============================================================================

/** Input for moving a variant to another entity */
export interface MoveVariantInput {
  /** Source entity ID */
  sourceEntityId: string;
  /** Variant ID to move */
  variantId: string;
  /** Target entity ID */
  targetEntityId: string;
}

/** Result of moving a variant */
export interface MoveVariantResult {
  /** The moved variant (with updated entityId) */
  variant: AssetVariant;
  /** Updated source entity (null if deleted due to becoming empty) */
  sourceEntity: AssetEntity | null;
  /** Updated target entity */
  targetEntity: AssetEntity;
  /** Whether the source entity was deleted (became empty) */
  sourceEntityDeleted: boolean;
}

/** Input for merging two entities */
export interface MergeEntitiesInput {
  /** Entity to be merged (source, will be deleted) */
  sourceEntityId: string;
  /** Entity to keep (target) */
  targetEntityId: string;
  /** Whether to merge tags from source to target (default: true) */
  mergeTags?: boolean;
  /** Whether to merge aliases from source to target (default: true) */
  mergeAliases?: boolean;
}

/** Result of merging entities */
export interface MergeEntitiesResult {
  /** The merged entity (target with source's variants) */
  entity: AssetEntity;
  /** Number of variants moved from source */
  variantsMoved: number;
  /** Tags that were merged from source */
  tagsMerged: string[];
  /** Aliases that were merged from source */
  aliasesMerged: string[];
}
