/**
 * MediaDiffService - Media Diff Service Facade
 *
 * Orchestrates Git operations and diff analyzers to provide
 * a unified interface for media diff functionality.
 *
 * Design:
 * - Facade pattern: Single entry point for diff operations
 * - Dependency injection: Analyzers injected via registry
 * - Progress reporting: Callback-based progress updates
 */

import * as vscode from 'vscode';
import {
  type MediaType,
  type DiffOptions,
  type DiffResult,
  type FileVersionPair,
  type GitCommitInfo,
  getMediaType,
  DEFAULT_DIFF_TIMEOUT,
  DEFAULT_VIDEO_DIFF_TIMEOUT,
} from '@neko/shared';
import { GitMediaService, type IGitMediaService } from './GitMediaService';
import { AnalyzerRegistry, type IMediaDiffAnalyzer } from './analyzers/IMediaDiffAnalyzer';
import type { IScheduler } from '../../contracts/IScheduler';
import type { IWorkspaceIO } from '../../contracts/IWorkspaceIO';

// =============================================================================
// Service Interface
// =============================================================================

/**
 * Progress callback
 */
export type DiffProgressCallback = (progress: number, stage: string) => void;

/**
 * Media diff service interface
 */
export interface IMediaDiffService extends vscode.Disposable {
  /**
   * Analyze media file diff against Git ref
   * @param uri - File URI to analyze
   * @param ref - Git ref to compare against (default: HEAD)
   * @param options - Analysis options
   * @param onProgress - Progress callback
   */
  analyze(
    uri: vscode.Uri,
    ref?: string,
    options?: DiffOptions,
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult>;

  /**
   * Analyze diff between two local files (not Git-based)
   * @param currentUri - Current file URI (shown on the right)
   * @param previousUri - Previous file URI (shown on the left)
   * @param options - Analysis options
   * @param onProgress - Progress callback
   * @param signal - Optional AbortSignal for per-caller cancellation
   */
  analyzeLocalFiles(
    currentUri: vscode.Uri,
    previousUri: vscode.Uri,
    options?: DiffOptions,
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult>;

  /**
   * Get file versions for comparison
   */
  getFileVersions(uri: vscode.Uri, ref?: string): Promise<FileVersionPair>;

  /**
   * Get file versions for local file comparison
   */
  getLocalFileVersions(currentUri: vscode.Uri, previousUri: vscode.Uri): Promise<FileVersionPair>;

  /**
   * Cancel ongoing analysis
   */
  cancel(): void;

  /**
   * Check if file is supported for diff
   */
  isSupported(uri: vscode.Uri): boolean;

  /**
   * Check if file has changes in Git
   */
  hasChanges(uri: vscode.Uri): Promise<boolean>;

  /**
   * Check if file is tracked by Git
   */
  isTracked(uri: vscode.Uri): Promise<boolean>;

  /**
   * Get file commit history
   * @param uri - File URI
   * @param maxCount - Maximum number of commits to return
   */
  getFileHistory(uri: vscode.Uri, maxCount?: number): Promise<GitCommitInfo[]>;

  /**
   * Register an analyzer
   */
  registerAnalyzer(analyzer: IMediaDiffAnalyzer): void;

  /**
   * Get commit history for a file
   */
  getFileHistory(
    uri: vscode.Uri,
    maxCount?: number,
  ): Promise<import('@neko/shared').GitCommitInfo[]>;

  /**
   * Extract previous version of a file directly to a local path (zero-copy).
   * Never loads file content into extension memory.
   */
  extractPreviousToFile(uri: vscode.Uri, ref: string, outputPath: string): Promise<void>;
}

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Media diff service implementation
 */
export class MediaDiffService implements IMediaDiffService {
  private readonly gitService: IGitMediaService;
  private readonly registry: AnalyzerRegistry;
  private readonly workspaceIO: IWorkspaceIO;
  private readonly scheduler: IScheduler;
  /** Track all active analyses for this service instance */
  private activeAnalyses = new Set<AbortController>();

  constructor(
    gitService: IGitMediaService | undefined,
    registry: AnalyzerRegistry | undefined,
    workspaceIO: IWorkspaceIO,
    scheduler: IScheduler,
  ) {
    this.gitService = gitService ?? new GitMediaService();
    this.registry = registry ?? new AnalyzerRegistry();
    this.workspaceIO = workspaceIO;
    this.scheduler = scheduler;
  }

  async analyze(
    uri: vscode.Uri,
    ref: string = 'HEAD',
    options?: DiffOptions,
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult> {
    const abortController = new AbortController();
    this.activeAnalyses.add(abortController);

    // Link external signal to our internal controller
    if (signal) {
      if (signal.aborted) {
        this.activeAnalyses.delete(abortController);
        throw new Error('Analysis cancelled');
      }
      const onAbort = () => abortController.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      // Clean up listener when analysis finishes
      abortController.signal.addEventListener(
        'abort',
        () => {
          signal.removeEventListener('abort', onAbort);
        },
        { once: true },
      );
    }

    const mediaType = getMediaType(uri.fsPath);
    if (!mediaType) {
      this.activeAnalyses.delete(abortController);
      throw new Error(`Unsupported file type: ${uri.fsPath}`);
    }

    const analyzer = this.registry.get(mediaType);
    if (!analyzer) {
      this.activeAnalyses.delete(abortController);
      throw new Error(`No analyzer registered for type: ${mediaType}`);
    }

    try {
      const ext = uri.fsPath.toLowerCase().match(/\.[^.]+$/)?.[0];
      const defaultTimeout =
        mediaType === 'video' ? DEFAULT_VIDEO_DIFF_TIMEOUT : DEFAULT_DIFF_TIMEOUT;

      // Fast path: caller provided file paths (video/audio Git mode).
      // Analyzers use paths directly — skip reading files into memory.
      // This avoids the costly Buffer round-trip for large media files.
      const hasDirectPaths = !!(options?.currentPath && options?.previousPath);

      let currentBuf: Buffer;
      let previousBuf: Buffer;

      if (hasDirectPaths) {
        // Paths provided — empty buffers (analyzers ignore them when paths exist)
        currentBuf = Buffer.alloc(0);
        previousBuf = Buffer.alloc(0);
        onProgress?.(20, 'Analyzing differences...');
      } else {
        onProgress?.(10, 'Fetching file versions...');
        const versions = await this.gitService.getFileVersions(uri, ref);

        // Handle new file case - no diff analysis needed
        if (versions.isNewFile) {
          onProgress?.(100, 'Complete');
          return {
            mediaType,
            similarity: 0,
            details: {
              isNewFile: true,
            },
          };
        }

        currentBuf = Buffer.from(versions.current);
        previousBuf = Buffer.from(versions.previous);
        onProgress?.(30, 'Analyzing differences...');
      }

      this.throwIfAborted(abortController);

      // Run analysis with timeout
      const analysisOptions: DiffOptions = {
        timeout: defaultTimeout,
        generateHeatmap: true,
        ...options,
        fileExtension: ext ?? undefined,
      };

      const result = await this.withTimeout(
        analyzer.analyze(currentBuf, previousBuf, analysisOptions),
        analysisOptions.timeout ?? defaultTimeout,
      );

      this.throwIfAborted(abortController);
      onProgress?.(100, 'Complete');

      return result;
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Analysis cancelled');
      }
      throw error;
    } finally {
      this.activeAnalyses.delete(abortController);
    }
  }

  async getFileVersions(uri: vscode.Uri, ref: string = 'HEAD'): Promise<FileVersionPair> {
    return this.gitService.getFileVersions(uri, ref);
  }

  async getLocalFileVersions(
    currentUri: vscode.Uri,
    previousUri: vscode.Uri,
  ): Promise<FileVersionPair> {
    const currentMediaType = getMediaType(currentUri.fsPath);
    const previousMediaType = getMediaType(previousUri.fsPath);

    if (!currentMediaType) {
      throw new Error(`Unsupported file type: ${currentUri.fsPath}`);
    }
    if (!previousMediaType) {
      throw new Error(`Unsupported file type: ${previousUri.fsPath}`);
    }
    if (currentMediaType !== previousMediaType) {
      throw new Error(`Media type mismatch: ${currentMediaType} vs ${previousMediaType}`);
    }

    const [currentBuffer, previousBuffer] = await Promise.all([
      this.workspaceIO.readFile(currentUri),
      this.workspaceIO.readFile(previousUri),
    ]);

    return {
      current: currentBuffer.buffer.slice(
        currentBuffer.byteOffset,
        currentBuffer.byteOffset + currentBuffer.byteLength,
      ) as ArrayBuffer,
      previous: previousBuffer.buffer.slice(
        previousBuffer.byteOffset,
        previousBuffer.byteOffset + previousBuffer.byteLength,
      ) as ArrayBuffer,
      currentPath: currentUri.fsPath,
      previousPath: previousUri.fsPath,
      mediaType: currentMediaType,
    };
  }

  async analyzeLocalFiles(
    currentUri: vscode.Uri,
    previousUri: vscode.Uri,
    options?: DiffOptions,
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult> {
    const abortController = new AbortController();
    this.activeAnalyses.add(abortController);

    // Link external signal to our internal controller
    if (signal) {
      if (signal.aborted) {
        this.activeAnalyses.delete(abortController);
        throw new Error('Analysis cancelled');
      }
      const onAbort = () => abortController.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      abortController.signal.addEventListener(
        'abort',
        () => {
          signal.removeEventListener('abort', onAbort);
        },
        { once: true },
      );
    }

    const currentMediaType = getMediaType(currentUri.fsPath);
    const previousMediaType = getMediaType(previousUri.fsPath);

    if (!currentMediaType) {
      this.activeAnalyses.delete(abortController);
      throw new Error(`Unsupported file type: ${currentUri.fsPath}`);
    }
    if (!previousMediaType) {
      this.activeAnalyses.delete(abortController);
      throw new Error(`Unsupported file type: ${previousUri.fsPath}`);
    }
    if (currentMediaType !== previousMediaType) {
      this.activeAnalyses.delete(abortController);
      throw new Error(
        `Cannot compare different media types: ${currentMediaType} vs ${previousMediaType}`,
      );
    }

    const analyzer = this.registry.get(currentMediaType);
    if (!analyzer) {
      this.activeAnalyses.delete(abortController);
      throw new Error(`No analyzer registered for type: ${currentMediaType}`);
    }

    try {
      // Report progress: fetching versions
      onProgress?.(10, 'Reading files...');

      // Get file versions
      const versions = await this.getLocalFileVersions(currentUri, previousUri);

      this.throwIfAborted(abortController);
      onProgress?.(30, 'Analyzing differences...');

      // Run analysis with timeout
      const ext = currentUri.fsPath.toLowerCase().match(/\.[^.]+$/)?.[0];
      const defaultTimeout =
        currentMediaType === 'video' ? DEFAULT_VIDEO_DIFF_TIMEOUT : DEFAULT_DIFF_TIMEOUT;
      const analysisOptions: DiffOptions = {
        timeout: defaultTimeout,
        generateHeatmap: true,
        ...options,
        fileExtension: ext ?? undefined,
        currentPath: currentUri.fsPath,
        previousPath: previousUri.fsPath,
      };

      const result = await this.withTimeout(
        analyzer.analyze(
          Buffer.from(versions.current),
          Buffer.from(versions.previous),
          analysisOptions,
        ),
        analysisOptions.timeout ?? defaultTimeout,
      );

      this.throwIfAborted(abortController);
      onProgress?.(100, 'Complete');

      return result;
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error('Analysis cancelled');
      }
      throw error;
    } finally {
      this.activeAnalyses.delete(abortController);
    }
  }

  cancel(): void {
    for (const ac of this.activeAnalyses) {
      ac.abort();
    }
    this.activeAnalyses.clear();
    this.registry.cancelAll();
  }

  isSupported(uri: vscode.Uri): boolean {
    const mediaType = getMediaType(uri.fsPath);
    return mediaType !== null && this.registry.isSupported(mediaType);
  }

  async hasChanges(uri: vscode.Uri): Promise<boolean> {
    const changes = await this.gitService.getChangedMediaFiles();
    return changes.some((c) => c.uri === uri.toString());
  }

  async isTracked(uri: vscode.Uri): Promise<boolean> {
    return this.gitService.isTracked(uri);
  }

  async getFileHistory(uri: vscode.Uri, maxCount?: number): Promise<GitCommitInfo[]> {
    return this.gitService.getFileHistory(uri, maxCount);
  }

  registerAnalyzer(analyzer: IMediaDiffAnalyzer): void {
    this.registry.register(analyzer);
  }

  async extractPreviousToFile(uri: vscode.Uri, ref: string, outputPath: string): Promise<void> {
    return this.gitService.extractFileToPath(uri, ref, outputPath);
  }

  /**
   * Throw if analysis was aborted
   */
  private throwIfAborted(ac: AbortController): void {
    if (ac.signal.aborted) {
      throw new Error('Analysis cancelled');
    }
  }

  /**
   * Wrap promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutTask: ReturnType<IScheduler['scheduleOnce']> | null = null;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutTask = this.scheduler.scheduleOnce(() => {
        reject(new Error('Analysis timed out'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      timeoutTask?.cancel();
    }
  }

  dispose(): void {
    this.cancel();
    this.gitService.dispose();
    this.registry.clear();
  }
}
