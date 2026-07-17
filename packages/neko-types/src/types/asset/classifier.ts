/**
 * Asset Classifier Types
 *
 * Types for AI-powered asset classification and analysis.
 */

import type { EntityCategory, ExpressionState, VariantAttributes } from './entity';
import type { SuggestedEntity } from './query';

// =============================================================================
// Classification Result
// =============================================================================

/** Character recognition info */
export interface CharacterRecognitionInfo {
  /** Whether a face was detected */
  faceDetected: boolean;
  /** Estimated age range */
  estimatedAge?: string;
  /** Detected gender */
  gender?: string;
  /** Detected expression */
  expression?: ExpressionState;
  /** Number of people detected */
  peopleCount?: number;
  /** Detected pose */
  pose?: string;
}

/** Scene recognition info */
export interface SceneRecognitionInfo {
  /** Whether the scene is indoor */
  indoor: boolean;
  /** Detected time of day */
  timeOfDay?: string;
  /** Detected weather condition */
  weather?: string;
  /** Visual style */
  style?: string;
  /** Scene type (e.g., "office", "forest", "city") */
  sceneType?: string;
  /** Dominant colors */
  dominantColors?: string[];
}

/** Object recognition info */
export interface ObjectRecognitionInfo {
  /** Detected object type */
  objectType?: string;
  /** Detected material */
  material?: string;
  /** Detected size category */
  sizeCategory?: 'small' | 'medium' | 'large';
  /** Related objects detected in the same image */
  relatedObjects?: string[];
}

/** Classification result from AI analysis */
export interface ClassificationResult {
  /** Suggested entity category */
  suggestedCategory: EntityCategory;
  /** Source path that produced the classification */
  source?: 'llm' | 'fallback';
  /** Whether the classification was produced by a degraded/local path */
  degraded?: boolean;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected variant attributes */
  detectedAttributes: Partial<VariantAttributes>;
  /** Generated description */
  description: string;
  /** Suggested entity name */
  suggestedName: string;
  /** Suggested tags */
  suggestedTags: string[];
  /** Character-specific recognition (if applicable) */
  characterInfo?: CharacterRecognitionInfo;
  /** Scene-specific recognition (if applicable) */
  sceneInfo?: SceneRecognitionInfo;
  /** Object-specific recognition (if applicable) */
  objectInfo?: ObjectRecognitionInfo;
  /** Raw AI response (for debugging) */
  rawResponse?: string;
}

// =============================================================================
// Similar Entity Matching
// =============================================================================

/** Similar entity match result */
export interface SimilarEntityMatch extends SuggestedEntity {
  /** Matched features description */
  matchedFeatures?: string[];
}

// =============================================================================
// Classifier Interface Types
// =============================================================================

/** Classifier options */
export interface ClassifierOptions {
  /** Maximum number of similar entities to return */
  maxSimilarEntities?: number;
  /** Minimum similarity threshold (0-1) */
  similarityThreshold?: number;
  /** Whether to include raw AI response */
  includeRawResponse?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/** Batch classification request */
export interface BatchClassificationRequest {
  /** File paths to classify */
  filePaths: string[];
  /** Shared options */
  options?: ClassifierOptions;
}

/** Batch classification result */
export interface BatchClassificationResult {
  /** Results keyed by file path */
  results: Map<string, ClassificationResult>;
  /** Errors keyed by file path */
  errors: Map<string, Error>;
  /** Total processing time in ms */
  processingTime: number;
}
