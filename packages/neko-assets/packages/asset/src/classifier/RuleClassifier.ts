/**
 * Rule-based Classifier
 *
 * Simple classifier based on file names and patterns.
 * Used as fallback when AI classifier is not available.
 */

import type {
  AssetEntity,
  ClassificationResult,
  SuggestedEntity,
  VariantAttributes,
  EntityCategory,
  ViewAngle,
  ExpressionState,
  ActionState,
  ClassifierOptions,
} from '@neko/shared';
import type { IAssetClassifier } from './IClassifier';

/** Injectable entity loader for similarity matching */
export type EntityLoader = () => Promise<readonly AssetEntity[]>;

/**
 * Rule-based classifier implementation
 */
export class RuleClassifier implements IAssetClassifier {
  constructor(private readonly loadEntities?: EntityLoader) {}
  /**
   * Analyze a file based on naming patterns
   */
  async analyze(filePath: string, _options?: ClassifierOptions): Promise<ClassificationResult> {
    const fileName = this.extractFileName(filePath).toLowerCase();
    const category = this.detectCategory(fileName);
    const attributes = this.detectAttributes(fileName);
    const suggestedName = this.suggestName(filePath);

    return {
      suggestedCategory: category,
      confidence: 0.5, // Rule-based is less confident
      detectedAttributes: attributes,
      description: this.generateDescription(suggestedName, category, attributes),
      suggestedName,
      suggestedTags: this.extractTags(fileName),
    };
  }

  /**
   * Suggest variant attributes based on file name
   */
  async suggestVariantAttributes(_entityId: string, filePath: string): Promise<VariantAttributes> {
    const fileName = this.extractFileName(filePath).toLowerCase();
    return this.detectAttributes(fileName);
  }

  /**
   * Suggest tags based on file name
   */
  async suggestTags(filePath: string): Promise<string[]> {
    const fileName = this.extractFileName(filePath).toLowerCase();
    return this.extractTags(fileName);
  }

  /**
   * Find similar entities by matching file name/path against entity names,
   * aliases, tags, and directory structure.
   */
  async findSimilarEntities(
    filePath: string,
    options?: ClassifierOptions,
  ): Promise<SuggestedEntity[]> {
    if (!this.loadEntities) {
      return [];
    }

    const entities = await this.loadEntities();
    if (entities.length === 0) {
      return [];
    }

    const threshold = options?.similarityThreshold ?? 0.3;
    const maxResults = options?.maxSimilarEntities ?? 5;
    const fileTokens = extractFileTokens(filePath);

    const scored: Array<{ entity: AssetEntity; score: number }> = [];

    for (const entity of entities) {
      const score = computeMatchScore(entity, fileTokens);
      if (score >= threshold) {
        scored.push({ entity, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults).map(({ entity, score }) => ({
      entity,
      similarity: score,
      matchType: 'name' as const,
      suggestedVariantName: this.suggestName(filePath),
    }));
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private extractFileName(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] ?? filePath;
  }

  private suggestName(filePath: string): string {
    const fileName = this.extractFileName(filePath);
    // Remove extension and common suffixes
    return fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[-_](front|back|side|left|right|top|bottom)/gi, '')
      .replace(/[-_](idle|walk|run|jump|attack)/gi, '')
      .replace(/[-_](happy|sad|angry|neutral)/gi, '')
      .replace(/[-_]\d+$/, '')
      .replace(/[-_]/g, ' ')
      .trim();
  }

  private detectCategory(fileName: string): EntityCategory {
    // Character patterns
    if (/character|person|avatar|human|man|woman|boy|girl|face/i.test(fileName)) {
      return 'character';
    }

    // Creature patterns
    if (/animal|creature|monster|pet|dog|cat|bird/i.test(fileName)) {
      return 'creature';
    }

    // Vehicle patterns
    if (/car|vehicle|truck|bike|plane|ship|boat/i.test(fileName)) {
      return 'vehicle';
    }

    // Environment patterns
    if (/background|scene|environment|landscape|sky|ground|floor|wall/i.test(fileName)) {
      return 'environment';
    }

    // Effect patterns
    if (/effect|particle|fx|explosion|fire|smoke|magic/i.test(fileName)) {
      return 'effect';
    }

    // UI patterns
    if (/ui|icon|button|menu|hud|interface/i.test(fileName)) {
      return 'ui';
    }

    // Audio patterns (based on extension)
    if (/\.(mp3|wav|ogg|aac|m4a|flac)$/i.test(fileName)) {
      return 'audio';
    }

    // Document patterns (based on extension and keywords)
    if (
      /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|epub|cbz|fdx)$/i.test(fileName) ||
      /storyboard|brief|reference|script|screenplay|outline|research/i.test(fileName)
    ) {
      return 'document';
    }

    // Text patterns (based on extension and keywords)
    if (
      /\.(txt|md|json|yaml|yml|csv)$/i.test(fileName) ||
      /description|bio|profile|script|dialogue|note/i.test(fileName)
    ) {
      // Determine category based on content keywords
      if (/character|person|avatar|bio|profile/i.test(fileName)) {
        return 'character';
      }
      if (/creature|animal|monster/i.test(fileName)) {
        return 'creature';
      }
      if (/object|item|prop/i.test(fileName)) {
        return 'object';
      }
      if (/vehicle/i.test(fileName)) {
        return 'vehicle';
      }
      if (/environment|scene|location/i.test(fileName)) {
        return 'environment';
      }
      if (/effect/i.test(fileName)) {
        return 'effect';
      }
      if (/ui|interface/i.test(fileName)) {
        return 'ui';
      }
      if (/audio|sound|voice|music/i.test(fileName)) {
        return 'audio';
      }
    }

    // Default to object
    return 'object';
  }

  private detectAttributes(fileName: string): Partial<VariantAttributes> {
    const attrs: Partial<VariantAttributes> = {};

    // Detect view angle
    const viewPatterns: Record<string, ViewAngle> = {
      front: 'front',
      back: 'back',
      left: 'left',
      right: 'right',
      side: 'left',
      top: 'top',
      bottom: 'bottom',
      iso: 'isometric',
      isometric: 'isometric',
      '3-4': '3/4',
      'three-quarter': '3/4',
    };

    for (const [pattern, view] of Object.entries(viewPatterns)) {
      if (new RegExp(`[-_]?${pattern}[-_]?`, 'i').test(fileName)) {
        attrs.view = view;
        break;
      }
    }

    // Detect expression
    const expressionPatterns: Record<string, ExpressionState> = {
      happy: 'happy',
      smile: 'happy',
      sad: 'sad',
      angry: 'angry',
      surprised: 'surprised',
      talk: 'talking',
      speaking: 'talking',
      sleep: 'sleeping',
      neutral: 'neutral',
      normal: 'neutral',
    };

    for (const [pattern, expression] of Object.entries(expressionPatterns)) {
      if (new RegExp(`[-_]?${pattern}[-_]?`, 'i').test(fileName)) {
        attrs.expression = expression;
        break;
      }
    }

    // Detect action
    const actionPatterns: Record<string, ActionState> = {
      idle: 'idle',
      stand: 'idle',
      walk: 'walk',
      walking: 'walk',
      run: 'run',
      running: 'run',
      jump: 'jump',
      jumping: 'jump',
      attack: 'attack',
      sit: 'sit',
      sitting: 'sit',
      lie: 'lie',
      lying: 'lie',
    };

    for (const [pattern, action] of Object.entries(actionPatterns)) {
      if (new RegExp(`[-_]?${pattern}[-_]?`, 'i').test(fileName)) {
        attrs.action = action;
        break;
      }
    }

    return attrs;
  }

  private extractTags(fileName: string): string[] {
    const tags: string[] = [];

    // Extract meaningful words from file name
    const words = fileName
      .replace(/\.[^.]+$/, '') // Remove extension
      .split(/[-_\s]+/)
      .filter((w) => w.length > 2);

    // Add category-related tags
    const categoryKeywords = [
      'character',
      'person',
      'object',
      'item',
      'prop',
      'background',
      'scene',
      'effect',
      'particle',
      'ui',
      'icon',
      'animal',
      'creature',
      'vehicle',
    ];

    for (const word of words) {
      if (categoryKeywords.includes(word.toLowerCase())) {
        tags.push(word.toLowerCase());
      }
    }

    // Add style-related tags
    const styleKeywords = [
      'pixel',
      'cartoon',
      'anime',
      'realistic',
      'stylized',
      '2d',
      '3d',
      'flat',
      'sketch',
    ];

    for (const keyword of styleKeywords) {
      if (fileName.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)]; // Deduplicate
  }

  /**
   * Suggest name is also used by findSimilarEntities, so kept accessible.
   */

  /**
   * Generate a human-readable description
   */
  private generateDescription(
    name: string,
    category: EntityCategory,
    attributes: Partial<VariantAttributes>,
  ): string {
    const parts: string[] = [];

    // Category description
    const categoryNames: Record<EntityCategory, string> = {
      character: 'Character asset',
      creature: 'Creature asset',
      object: 'Object asset',
      vehicle: 'Vehicle asset',
      environment: 'Environment asset',
      effect: 'Visual effect',
      ui: 'UI element',
      audio: 'Audio asset',
      document: 'Document',
    };
    parts.push(categoryNames[category] || 'Asset');

    // Add name
    if (name) {
      parts.push(`"${name}"`);
    }

    // Add attribute details
    const attrDetails: string[] = [];
    if (attributes.view) {
      attrDetails.push(`${attributes.view} view`);
    }
    if (attributes.expression) {
      attrDetails.push(`${attributes.expression} expression`);
    }
    if (attributes.action) {
      attrDetails.push(`${attributes.action} action`);
    }

    if (attrDetails.length > 0) {
      parts.push(`with ${attrDetails.join(', ')}`);
    }

    return parts.join(' ');
  }
}

// =============================================================================
// Rule-based similarity helpers
// =============================================================================

interface FileTokens {
  /** Lowercase base name without extension */
  readonly baseName: string;
  /** Lowercase parent directory name */
  readonly dirName: string;
  /** Individual word tokens from base name */
  readonly words: readonly string[];
}

function extractFileTokens(filePath: string): FileTokens {
  const parts = filePath.split(/[/\\]/);
  const rawName = parts[parts.length - 1] ?? filePath;
  const baseName = rawName.replace(/\.[^.]+$/, '').toLowerCase();
  const dirName = (parts[parts.length - 2] ?? '').toLowerCase();
  const words = baseName.split(/[-_\s]+/).filter((w) => w.length > 1);
  return { baseName, dirName, words };
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ');
}

function computeMatchScore(entity: AssetEntity, tokens: FileTokens): number {
  let best = 0;

  // Name match (0.9): entity name contained in filename or vice versa
  const normalizedName = normalize(entity.name);
  if (tokens.baseName.includes(normalizedName) || normalizedName.includes(tokens.baseName)) {
    best = Math.max(best, 0.9);
  }

  // Alias match (0.8)
  if (entity.aliases) {
    for (const alias of entity.aliases) {
      const normalizedAlias = normalize(alias);
      if (tokens.baseName.includes(normalizedAlias) || normalizedAlias.includes(tokens.baseName)) {
        best = Math.max(best, 0.8);
        break;
      }
    }
  }

  // Tag match (0.6)
  for (const tag of entity.tags) {
    const normalizedTag = normalize(tag);
    if (tokens.words.some((w) => w === normalizedTag || normalizedTag.includes(w))) {
      best = Math.max(best, 0.6);
      break;
    }
  }

  // Directory match (0.5): parent dir matches entity name or category
  if (tokens.dirName.length > 1) {
    if (
      tokens.dirName.includes(normalizedName) ||
      normalizedName.includes(tokens.dirName) ||
      tokens.dirName === entity.category
    ) {
      best = Math.max(best, 0.5);
    }
  }

  return best;
}
