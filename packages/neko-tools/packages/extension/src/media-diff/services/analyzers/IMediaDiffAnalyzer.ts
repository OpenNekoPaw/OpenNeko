/**
 * IMediaDiffAnalyzer - Media Diff Analyzer Interface
 *
 * Defines the contract for media diff analyzers (image, video, audio).
 * Each analyzer implements type-specific comparison logic.
 *
 * Design:
 * - Strategy pattern: Different analyzers for different media types
 * - Async operations: All analysis is asynchronous
 * - Cancellable: Supports cancellation for long-running operations
 */

import type {
  MediaType,
  DiffOptions,
  DiffResult,
  ImageDiffDetails,
  VideoDiffDetails,
  AudioDiffDetails,
  TimelineDiffDetails,
} from '@neko/shared';

// =============================================================================
// Analyzer Interface
// =============================================================================

/**
 * Media diff analyzer interface
 */
export interface IMediaDiffAnalyzer {
  /** Media type this analyzer handles */
  readonly mediaType: MediaType;

  /**
   * Analyze differences between two media versions
   * @param current - Current version buffer
   * @param previous - Previous version buffer
   * @param options - Analysis options
   * @returns Diff result with similarity score and details
   */
  analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult>;

  /**
   * Cancel ongoing analysis
   */
  cancel(): void;

  /**
   * Check if analyzer supports the given file
   * @param filePath - File path to check
   */
  supports(filePath: string): boolean;
}

// =============================================================================
// Type Guards
// =============================================================================

type AnyDiffDetails = ImageDiffDetails | VideoDiffDetails | AudioDiffDetails | TimelineDiffDetails;

/**
 * Type guard for ImageDiffDetails
 */
export function isImageDiffDetails(details: AnyDiffDetails): details is ImageDiffDetails {
  return 'pixelDifference' in details && 'structuralSimilarity' in details;
}

/**
 * Type guard for VideoDiffDetails
 */
export function isVideoDiffDetails(details: AnyDiffDetails): details is VideoDiffDetails {
  return 'keyframeDiffs' in details && 'fps' in details;
}

/**
 * Type guard for AudioDiffDetails
 */
export function isAudioDiffDetails(details: AnyDiffDetails): details is AudioDiffDetails {
  return 'waveformSimilarity' in details && 'spectralDifference' in details;
}

/**
 * Type guard for TimelineDiffDetails
 */
export function isTimelineDiffDetails(details: AnyDiffDetails): details is TimelineDiffDetails {
  return 'trackChanges' in details && 'summary' in details;
}

// =============================================================================
// Analyzer Registry
// =============================================================================

/**
 * Registry for media diff analyzers
 * Manages analyzer instances by media type
 */
export class AnalyzerRegistry {
  private analyzers = new Map<MediaType, IMediaDiffAnalyzer>();

  /**
   * Register an analyzer for a media type
   */
  register(analyzer: IMediaDiffAnalyzer): void {
    this.analyzers.set(analyzer.mediaType, analyzer);
  }

  /**
   * Get analyzer for a media type
   */
  get(mediaType: MediaType): IMediaDiffAnalyzer | undefined {
    return this.analyzers.get(mediaType);
  }

  /**
   * Get analyzer that supports a specific file
   */
  getForFile(filePath: string): IMediaDiffAnalyzer | undefined {
    for (const analyzer of this.analyzers.values()) {
      if (analyzer.supports(filePath)) {
        return analyzer;
      }
    }
    return undefined;
  }

  /**
   * Check if a media type is supported
   */
  isSupported(mediaType: MediaType): boolean {
    return this.analyzers.has(mediaType);
  }

  /**
   * Get all registered media types
   */
  getSupportedTypes(): MediaType[] {
    return Array.from(this.analyzers.keys());
  }

  /**
   * Cancel all ongoing analyses
   */
  cancelAll(): void {
    for (const analyzer of this.analyzers.values()) {
      analyzer.cancel();
    }
  }

  /**
   * Clear all registered analyzers
   */
  clear(): void {
    this.cancelAll();
    this.analyzers.clear();
  }
}

// =============================================================================
// Base Analyzer Implementation
// =============================================================================

/**
 * Base class for media diff analyzers
 * Provides common functionality
 */
export abstract class BaseMediaDiffAnalyzer implements IMediaDiffAnalyzer {
  abstract readonly mediaType: MediaType;
  protected abortController: AbortController | null = null;
  protected readonly supportedExtensions: string[];

  constructor(supportedExtensions: string[]) {
    this.supportedExtensions = supportedExtensions.map((ext) => ext.toLowerCase());
  }

  abstract analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult>;

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  supports(filePath: string): boolean {
    const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
    return ext ? this.supportedExtensions.includes(ext) : false;
  }

  /**
   * Create a new abort controller for this analysis
   */
  protected createAbortController(): AbortController {
    this.cancel(); // Cancel any previous analysis
    this.abortController = new AbortController();
    return this.abortController;
  }

  /**
   * Check if analysis was aborted
   */
  protected isAborted(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }

  /**
   * Throw if analysis was aborted
   */
  protected throwIfAborted(): void {
    if (this.isAborted()) {
      throw new Error('Analysis was cancelled');
    }
  }
}
