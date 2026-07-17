/**
 * Asset Diff Types
 *
 * Types for comparing asset versions and variants.
 */

import type { AssetEntity, AssetVariant, AssetFile, VariantAttributes } from './entity';

// =============================================================================
// Diff View Modes
// =============================================================================

/** Asset diff view display mode (more modes than MediaDiff) */
export type AssetDiffViewMode =
  | 'side-by-side' // Two panels side by side
  | 'slider' // Slider to reveal/hide
  | 'overlay' // Overlay with opacity
  | 'onion-skin' // Multiple frames blended
  | 'difference' // Show pixel difference
  | 'heatmap'; // Highlight changed regions

// =============================================================================
// Diff Source Types
// =============================================================================

/** Source for diff comparison */
export type AssetDiffSource =
  | { type: 'git'; filePath: string; ref: string } // Git reference (commit, branch, HEAD)
  | { type: 'file'; file: AssetFile } // Specific asset file
  | { type: 'variant'; entityId: string; variant: AssetVariant } // Asset variant
  | { type: 'path'; path: string }; // File path

// =============================================================================
// Diff Request
// =============================================================================

/** Diff comparison request */
export interface AssetDiffRequest {
  /** Current (new) version */
  current: AssetDiffSource;
  /** Previous (old) version to compare against */
  previous: AssetDiffSource;
  /** Diff options */
  options?: AssetDiffOptions;
}

/** Diff options */
export interface AssetDiffOptions {
  /** Initial view mode */
  viewMode?: AssetDiffViewMode;
  /** Comparison precision (0-1) */
  precision?: number;
  /** Generate difference heatmap */
  generateHeatmap?: boolean;
  /** Generate AI analysis report */
  generateAIReport?: boolean;
  /** Timeout in ms */
  timeout?: number;
}

// =============================================================================
// Diff Result
// =============================================================================

/** Diff result base */
export interface AssetDiffResult {
  /** Current source info */
  current: AssetDiffSourceInfo;
  /** Previous source info */
  previous: AssetDiffSourceInfo;
  /** Media type */
  mediaType: 'image' | 'video' | 'audio';
  /** Overall similarity score (0-1) */
  similarity: number;
  /** Detected changes */
  changes: AssetChangeAnalysis;
  /** AI-generated summary */
  aiSummary?: string;
  /** Processing time in ms */
  processingTime: number;
}

/** Source info for display */
export interface AssetDiffSourceInfo {
  /** Display name */
  name: string;
  /** File path or URI */
  path: string;
  /** Webview-accessible URI */
  uri?: string;
  /** Timestamp */
  timestamp?: number;
  /** File size in bytes */
  size?: number;
  /** Dimensions (for image/video) */
  dimensions?: { width: number; height: number };
  /** Duration in seconds (for video/audio) */
  duration?: number;
}

// =============================================================================
// Change Analysis
// =============================================================================

/** Types of changes */
export type AssetChangeType =
  | 'dimension' // Size/resolution changed
  | 'color' // Color/tone changed
  | 'content' // Content changed (AI-detected)
  | 'quality' // Quality changed (compression, resolution)
  | 'duration' // Duration changed (video/audio)
  | 'audio' // Audio track changed
  | 'metadata' // Metadata changed
  | 'format'; // File format changed

/** Bounding box for changed region */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Change intensity (0-1) */
  intensity: number;
  /** Description of change */
  description?: string;
}

/** Time range for changed section (asset-specific) */
export interface AssetTimeRange {
  start: number;
  end: number;
  /** Change intensity (0-1) */
  intensity: number;
  /** Description of change */
  description?: string;
}

/** Color change information */
export interface ColorChangeInfo {
  /** Average hue shift in degrees */
  hueShift: number;
  /** Saturation change (-1 to 1) */
  saturationChange: number;
  /** Brightness change (-1 to 1) */
  brightnessChange: number;
  /** Dominant color changes */
  dominantColorChanges: Array<{
    from: string; // hex color
    to: string; // hex color
    area: number; // percentage of area affected
  }>;
}

/** Content change information (AI-detected) */
export interface ContentChangeInfo {
  /** Elements added */
  added: string[];
  /** Elements removed */
  removed: string[];
  /** Elements modified */
  modified: Array<{
    element: string;
    description: string;
  }>;
  /** Overall summary */
  summary: string;
}

/** Metadata change */
export interface MetadataChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Asset change analysis */
export interface AssetChangeAnalysis {
  /** Types of changes detected */
  changeTypes: AssetChangeType[];
  /** Changed regions (for image/video) */
  changedRegions?: BoundingBox[];
  /** Changed time ranges (for video/audio) */
  changedTimeRanges?: AssetTimeRange[];
  /** Color changes */
  colorChanges?: ColorChangeInfo;
  /** Content changes (AI-detected) */
  contentChanges?: ContentChangeInfo;
  /** Metadata changes */
  metadataChanges?: MetadataChange[];
}

// =============================================================================
// Variant Comparison
// =============================================================================

/** Variant comparison result */
export interface VariantComparisonResult {
  /** Parent entity */
  entity: AssetEntity;
  /** First variant */
  variantA: AssetVariant;
  /** Second variant */
  variantB: AssetVariant;
  /** Attribute differences */
  attributeDiffs: AttributeDiff[];
  /** File comparison (if applicable) */
  fileDiff?: AssetDiffResult;
  /** AI comparison summary */
  aiComparison?: string;
}

/** Attribute difference */
export interface AttributeDiff {
  attribute: keyof VariantAttributes;
  valueA: string | undefined;
  valueB: string | undefined;
}

// =============================================================================
// Version History
// =============================================================================

/** File version from Git */
export interface FileVersion {
  /** Git commit hash */
  commitHash: string;
  /** Short hash for display */
  shortHash: string;
  /** Commit timestamp */
  timestamp: number;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Change type */
  changeType: 'added' | 'modified' | 'renamed' | 'deleted';
  /** Previous path (if renamed) */
  previousPath?: string;
}

// =============================================================================
// Diff Protocol Messages
// =============================================================================

/** Asset diff request messages */
export type AssetDiffRequestMessage =
  | { type: 'assetDiff:compare'; payload: AssetDiffRequest }
  | { type: 'assetDiff:compareWithGit'; payload: { filePath: string; ref?: string } }
  | {
      type: 'assetDiff:compareVariants';
      payload: { entityId: string; variantIdA: string; variantIdB: string };
    }
  | { type: 'assetDiff:getVersionHistory'; payload: { filePath: string } }
  | { type: 'assetDiff:generateAIReport'; payload: { diffResult: AssetDiffResult } };

/** Asset diff response messages */
export type AssetDiffResponseMessage =
  | { type: 'assetDiff:result'; payload: AssetDiffResult }
  | { type: 'assetDiff:progress'; payload: { progress: number; stage: string } }
  | { type: 'assetDiff:variantComparison'; payload: VariantComparisonResult }
  | { type: 'assetDiff:versionHistory'; payload: FileVersion[] }
  | { type: 'assetDiff:aiReport'; payload: string }
  | { type: 'assetDiff:error'; payload: { message: string; code: string } };
