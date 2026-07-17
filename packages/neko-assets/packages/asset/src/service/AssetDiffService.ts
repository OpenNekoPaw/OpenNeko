/**
 * Asset Diff Service
 *
 * Service for comparing asset versions and variants.
 */

import type {
  AssetDiffRequest,
  AssetDiffResult,
  AssetDiffOptions,
  AssetDiffSource,
  AssetDiffSourceInfo,
  AssetChangeAnalysis,
  VariantComparisonResult,
  FileVersion,
  AttributeDiff,
  VariantAttributes,
} from '@neko/shared';
import { detectMediaType } from '@neko/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';

// =============================================================================
// Interface
// =============================================================================

export interface IAssetDiffService {
  /**
   * Compare two asset sources
   */
  compare(request: AssetDiffRequest): Promise<AssetDiffResult>;

  /**
   * Compare with Git version
   */
  compareWithGit(filePath: string, ref?: string): Promise<AssetDiffResult>;

  /**
   * Compare two variants of the same entity
   */
  compareVariants(
    entityId: string,
    variantIdA: string,
    variantIdB: string,
  ): Promise<VariantComparisonResult>;

  /**
   * Get Git version history for a file
   */
  getVersionHistory(filePath: string): Promise<FileVersion[]>;

  /**
   * Generate AI analysis report
   */
  generateAIReport(diffResult: AssetDiffResult): Promise<string>;
}

// =============================================================================
// Implementation
// =============================================================================

export class AssetDiffService implements IAssetDiffService {
  private statFile?: (filePath: string) => Promise<{ size: number } | null>;

  constructor(
    private storage: IAssetStorage,
    private gitService?: IGitService,
    private aiService?: IAIAnalysisService,
    options?: { statFile?: (filePath: string) => Promise<{ size: number } | null> },
  ) {
    this.statFile = options?.statFile;
  }

  // =========================================================================
  // Compare
  // =========================================================================

  async compare(request: AssetDiffRequest): Promise<AssetDiffResult> {
    const startTime = Date.now();
    const options = request.options ?? {};

    // Resolve source info
    const [currentInfo, previousInfo] = await Promise.all([
      this.resolveSourceInfo(request.current),
      this.resolveSourceInfo(request.previous),
    ]);

    // Detect media type (map AssetMediaType to diff-compatible type)
    const assetType = detectMediaType(currentInfo.path);
    const mediaType: 'image' | 'video' | 'audio' =
      assetType === 'video' ? 'video' : assetType === 'audio' ? 'audio' : 'image';

    // Analyze changes
    const changes = await this.analyzeChanges(currentInfo, previousInfo, mediaType, options);

    // Calculate similarity
    const similarity = this.calculateSimilarity(changes);

    // Generate AI summary if requested
    let aiSummary: string | undefined;
    if (options.generateAIReport && this.aiService) {
      aiSummary = await this.aiService.analyzeDiff(currentInfo, previousInfo, changes);
    }

    return {
      current: currentInfo,
      previous: previousInfo,
      mediaType,
      similarity,
      changes,
      aiSummary,
      processingTime: Date.now() - startTime,
    };
  }

  // =========================================================================
  // Git Compare
  // =========================================================================

  async compareWithGit(filePath: string, ref: string = 'HEAD'): Promise<AssetDiffResult> {
    if (!this.gitService) {
      throw new Error('Git service not available');
    }

    // Get previous version content
    const previousPath = await this.gitService.getFileAtRef(filePath, ref);

    return this.compare({
      current: { type: 'path', path: filePath },
      previous: { type: 'path', path: previousPath },
    });
  }

  // =========================================================================
  // Variant Compare
  // =========================================================================

  async compareVariants(
    entityId: string,
    variantIdA: string,
    variantIdB: string,
  ): Promise<VariantComparisonResult> {
    const entity = await this.storage.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const variantA = entity.variants.find((v) => v.id === variantIdA);
    const variantB = entity.variants.find((v) => v.id === variantIdB);

    if (!variantA) {
      throw new Error(`Variant not found: ${variantIdA}`);
    }
    if (!variantB) {
      throw new Error(`Variant not found: ${variantIdB}`);
    }

    // Compare attributes
    const attributeDiffs = this.compareAttributes(variantA.attributes, variantB.attributes);

    // Compare files if both have files
    let fileDiff: AssetDiffResult | undefined;
    if (variantA.files.length > 0 && variantB.files.length > 0) {
      const fileA = variantA.files[0];
      const fileB = variantB.files[0];
      if (fileA && fileB) {
        fileDiff = await this.compare({
          current: { type: 'file', file: fileA },
          previous: { type: 'file', file: fileB },
        });
      }
    }

    // Generate AI comparison if available
    let aiComparison: string | undefined;
    if (this.aiService) {
      aiComparison = await this.aiService.compareVariants(variantA, variantB);
    }

    return {
      entity,
      variantA,
      variantB,
      attributeDiffs,
      fileDiff,
      aiComparison,
    };
  }

  // =========================================================================
  // Version History
  // =========================================================================

  async getVersionHistory(filePath: string): Promise<FileVersion[]> {
    if (!this.gitService) {
      return [];
    }

    return this.gitService.getFileHistory(filePath);
  }

  // =========================================================================
  // AI Report
  // =========================================================================

  async generateAIReport(diffResult: AssetDiffResult): Promise<string> {
    if (!this.aiService) {
      throw new Error('AI service not available');
    }

    return this.aiService.generateReport(diffResult);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private async resolveSourceInfo(source: AssetDiffSource): Promise<AssetDiffSourceInfo> {
    switch (source.type) {
      case 'path':
        return {
          name: source.path.split('/').pop() ?? source.path,
          path: source.path,
        };

      case 'file':
        return {
          name: source.file.name,
          path: source.file.path,
        };

      case 'variant': {
        const entity = await this.storage.getEntity(source.entityId);
        const file = source.variant.files[0];
        return {
          name: `${entity?.name ?? 'Unknown'} - ${source.variant.name}`,
          path: file?.path ?? '',
        };
      }

      case 'git': {
        if (!this.gitService) {
          throw new Error('Git service not available for git source resolution');
        }
        const resolvedPath = await this.gitService.getFileAtRef(source.filePath, source.ref);
        return {
          name: `${source.filePath.split('/').pop() ?? source.filePath} @ ${source.ref}`,
          path: resolvedPath,
        };
      }

      default:
        throw new Error(`Unknown source type`);
    }
  }

  private async analyzeChanges(
    current: AssetDiffSourceInfo,
    previous: AssetDiffSourceInfo,
    _mediaType: 'image' | 'video' | 'audio',
    _options: AssetDiffOptions,
  ): Promise<AssetChangeAnalysis> {
    const changeTypes: AssetChangeAnalysis['changeTypes'] = [];

    // Basic analysis via file stat comparison (works without native dependencies)
    if (current.path && previous.path && this.statFile) {
      try {
        const [currentStat, previousStat] = await Promise.all([
          this.statFile(current.path),
          this.statFile(previous.path),
        ]);

        if (currentStat && previousStat) {
          // Size difference implies content change
          if (currentStat.size !== previousStat.size) {
            changeTypes.push('content');
          }

          // Format change (different extensions)
          const currentExt = current.path.split('.').pop()?.toLowerCase();
          const previousExt = previous.path.split('.').pop()?.toLowerCase();
          if (currentExt !== previousExt) {
            changeTypes.push('format');
          }
        }
      } catch {
        // stat not available — return empty analysis
      }
    }

    return {
      changeTypes,
      changedRegions: [],
      changedTimeRanges: [],
    };
  }

  private calculateSimilarity(changes: AssetChangeAnalysis): number {
    // Simple similarity calculation
    // More sophisticated analysis would be needed for production
    if (changes.changeTypes.length === 0) {
      return 1.0;
    }

    // Reduce similarity based on number and type of changes
    let similarity = 1.0;
    for (const changeType of changes.changeTypes) {
      switch (changeType) {
        case 'dimension':
          similarity -= 0.1;
          break;
        case 'color':
          similarity -= 0.15;
          break;
        case 'content':
          similarity -= 0.3;
          break;
        case 'quality':
          similarity -= 0.05;
          break;
        case 'duration':
          similarity -= 0.2;
          break;
        case 'audio':
          similarity -= 0.15;
          break;
        case 'metadata':
          similarity -= 0.02;
          break;
        case 'format':
          similarity -= 0.05;
          break;
      }
    }

    return Math.max(0, similarity);
  }

  private compareAttributes(attrsA: VariantAttributes, attrsB: VariantAttributes): AttributeDiff[] {
    const diffs: AttributeDiff[] = [];
    const allKeys = new Set([...Object.keys(attrsA), ...Object.keys(attrsB)]) as Set<
      keyof VariantAttributes
    >;

    for (const key of allKeys) {
      const valueA = attrsA[key];
      const valueB = attrsB[key];

      if (valueA !== valueB) {
        diffs.push({
          attribute: key,
          valueA: valueA as string | undefined,
          valueB: valueB as string | undefined,
        });
      }
    }

    return diffs;
  }
}

// =============================================================================
// Service Interfaces (to be implemented)
// =============================================================================

export interface IGitService {
  getFileAtRef(filePath: string, ref: string): Promise<string>;
  getFileHistory(filePath: string): Promise<FileVersion[]>;
}

export interface IAIAnalysisService {
  analyzeDiff(
    current: AssetDiffSourceInfo,
    previous: AssetDiffSourceInfo,
    changes: AssetChangeAnalysis,
  ): Promise<string>;
  compareVariants(variantA: unknown, variantB: unknown): Promise<string>;
  generateReport(diffResult: AssetDiffResult): Promise<string>;
}
