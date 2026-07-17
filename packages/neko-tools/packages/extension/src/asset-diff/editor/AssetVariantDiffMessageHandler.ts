/**
 * AssetVariantDiffMessageHandler - Message Handler for Asset Variant Diff
 *
 * Handles IPC messages between the webview and extension host
 * for asset variant diff operations.
 */

import * as vscode from 'vscode';
import type {
  AssetEntity,
  AssetVariant,
  VariantComparisonResult,
  VariantAttributes,
} from '@neko/shared';
import { getLogger } from '../../utils/logger';
import type { IAssetVariantDiffMessageHandler } from './AssetVariantDiffSession';

const logger = getLogger('AssetVariantDiffMessageHandler');

// =============================================================================
// Message Types
// =============================================================================

interface BaseMessage {
  type: string;
  requestId: string;
  timestamp: number;
}

interface InitMessage extends BaseMessage {
  type: 'assetDiff:init';
}

interface RequestAIMessage extends BaseMessage {
  type: 'assetDiff:requestAI';
}

type IncomingMessage = InitMessage | RequestAIMessage;

// =============================================================================
// Attribute Diff
// =============================================================================

interface AttributeDiff {
  attribute: keyof VariantAttributes;
  valueA: string | undefined;
  valueB: string | undefined;
}

// =============================================================================
// Handler Implementation
// =============================================================================

export class AssetVariantDiffMessageHandler implements IAssetVariantDiffMessageHandler {
  private isDisposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly entity: AssetEntity,
    private readonly variantA: AssetVariant,
    private readonly variantB: AssetVariant,
    private readonly compareVariants?: (
      entityId: string,
      variantIdA: string,
      variantIdB: string,
    ) => Promise<VariantComparisonResult>,
  ) {}

  /**
   * Initialize diff analysis
   */
  async initializeDiff(): Promise<void> {
    if (this.isDisposed) return;

    try {
      // Calculate attribute diffs
      const attributeDiffs = this.compareAttributes(
        this.variantA.attributes,
        this.variantB.attributes,
      );

      // Send attribute diffs
      this.sendMessage({
        type: 'assetDiff:attributeDiffs',
        payload: attributeDiffs,
      });

      // Calculate basic similarity (based on attribute match)
      const similarity = this.calculateSimilarity(attributeDiffs);

      // Send initial result
      this.sendMessage({
        type: 'assetDiff:result',
        payload: {
          similarity,
          attributeDiffs,
        },
      });

      // If compare service is available, get detailed comparison
      if (this.compareVariants) {
        try {
          const result = await this.compareVariants(
            this.entity.id,
            this.variantA.id,
            this.variantB.id,
          );

          // Update with detailed similarity if available
          if (result.fileDiff?.similarity !== undefined) {
            this.sendMessage({
              type: 'assetDiff:result',
              payload: {
                similarity: result.fileDiff.similarity,
                attributeDiffs: result.attributeDiffs,
              },
            });
          }

          // Send AI comparison if available
          if (result.aiComparison) {
            this.sendMessage({
              type: 'assetDiff:aiSummary',
              payload: result.aiComparison,
            });
          }
        } catch (error) {
          // Detailed comparison failed, but basic comparison is still valid
          logger.warn('Detailed variant comparison failed:', error);
        }
      }
    } catch (error) {
      this.sendError(`Failed to initialize diff: ${error}`);
    }
  }

  /**
   * Handle incoming messages from webview
   */
  async handleMessage(message: unknown): Promise<void> {
    if (this.isDisposed) return;

    const msg = message as IncomingMessage;

    switch (msg.type) {
      case 'assetDiff:init':
        await this.initializeDiff();
        break;

      case 'assetDiff:requestAI':
        await this.handleRequestAI();
        break;

      default:
        logger.warn('Unknown message type:', msg.type);
    }
  }

  /**
   * Handle AI analysis request
   */
  private async handleRequestAI(): Promise<void> {
    if (this.isDisposed) return;

    // Notify loading state
    this.sendMessage({
      type: 'assetDiff:aiLoading',
      payload: true,
    });

    try {
      if (!this.compareVariants) {
        // Generate a simple description without AI
        const description = this.generateBasicComparison();
        this.sendMessage({
          type: 'assetDiff:aiSummary',
          payload: description,
        });
        return;
      }

      // Get detailed comparison with AI
      const result = await this.compareVariants(this.entity.id, this.variantA.id, this.variantB.id);

      if (result.aiComparison) {
        this.sendMessage({
          type: 'assetDiff:aiSummary',
          payload: result.aiComparison,
        });
      } else {
        // Fallback to basic comparison
        const description = this.generateBasicComparison();
        this.sendMessage({
          type: 'assetDiff:aiSummary',
          payload: description,
        });
      }
    } catch (error) {
      this.sendMessage({
        type: 'assetDiff:aiLoading',
        payload: false,
      });
      this.sendError(`AI analysis failed: ${error}`);
    }
  }

  /**
   * Compare variant attributes
   */
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

  /**
   * Calculate similarity based on attribute diffs
   */
  private calculateSimilarity(diffs: AttributeDiff[]): number {
    // Count total attributes and matching attributes
    const allAttrsA = Object.keys(this.variantA.attributes).length;
    const allAttrsB = Object.keys(this.variantB.attributes).length;
    const totalAttrs = Math.max(allAttrsA, allAttrsB, 1);
    const diffCount = diffs.length;

    // Simple similarity: 1 - (diff_count / total_attrs)
    return Math.max(0, 1 - diffCount / totalAttrs);
  }

  /**
   * Generate basic comparison description
   */
  private generateBasicComparison(): string {
    const diffs = this.compareAttributes(this.variantA.attributes, this.variantB.attributes);

    const lines: string[] = [];
    lines.push(`Comparing "${this.variantA.name}" vs "${this.variantB.name}"`);
    lines.push('');

    if (diffs.length === 0) {
      lines.push('These variants have identical attributes.');
    } else {
      lines.push(`Found ${diffs.length} attribute difference(s):`);
      lines.push('');

      for (const diff of diffs) {
        if (diff.valueA && diff.valueB) {
          lines.push(`• ${diff.attribute}: "${diff.valueA}" → "${diff.valueB}"`);
        } else if (diff.valueA) {
          lines.push(`• ${diff.attribute}: "${diff.valueA}" (removed)`);
        } else if (diff.valueB) {
          lines.push(`• ${diff.attribute}: (added) "${diff.valueB}"`);
        }
      }
    }

    // File info
    lines.push('');
    lines.push(`Files: ${this.variantA.files.length} vs ${this.variantB.files.length}`);

    return lines.join('\n');
  }

  /**
   * Send message to webview
   */
  private sendMessage(message: { type: string; payload?: unknown }): void {
    if (this.isDisposed) return;
    this.webview.postMessage(message);
  }

  /**
   * Send error to webview
   */
  private sendError(error: string): void {
    if (this.isDisposed) return;
    this.webview.postMessage({
      type: 'assetDiff:error',
      error,
    });
  }

  async disposeAsync(): Promise<void> {
    this.disposePromise ??= this.disposeInternal();
    return this.disposePromise;
  }

  dispose(): void {
    void this.disposeAsync();
  }

  private async disposeInternal(): Promise<void> {
    this.isDisposed = true;
  }
}
