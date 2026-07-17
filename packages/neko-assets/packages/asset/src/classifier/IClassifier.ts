/**
 * Asset Classifier Interface
 *
 * Interface for AI-powered asset classification.
 */

import type {
  ClassificationResult,
  SuggestedEntity,
  VariantAttributes,
  ClassifierOptions,
} from '@neko/shared';

/**
 * Asset classifier interface
 */
export interface IAssetClassifier {
  /**
   * Analyze a media file and classify it
   */
  analyze(filePath: string, options?: ClassifierOptions): Promise<ClassificationResult>;

  /**
   * Suggest variant attributes for a file
   */
  suggestVariantAttributes(entityId: string, filePath: string): Promise<VariantAttributes>;

  /**
   * Suggest tags for a file
   */
  suggestTags(filePath: string): Promise<string[]>;

  /**
   * Find similar entities in the library
   */
  findSimilarEntities(filePath: string, options?: ClassifierOptions): Promise<SuggestedEntity[]>;
}
