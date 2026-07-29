import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_DIFF_TIMEOUT,
  DEFAULT_VIDEO_DIFF_TIMEOUT,
  getMediaType,
  type DiffOptions,
  type DiffResult,
  type FileVersionPair,
  type GitCommitInfo,
  type MediaType,
} from '@neko-tools/contracts';
import type { IMediaRuntimeService } from '../../contracts/IMediaRuntimeService';
import type { IScheduledTask, IScheduler } from '../../contracts/IScheduler';
import type { ITempFileService } from '../../contracts/ITempFileService';
import type { IWorkspaceIO } from '../../contracts/IWorkspaceIO';
import { GitMediaService, type IGitMediaService } from './GitMediaService';
import { getLogger } from '../../utils/logger';

const logger = getLogger('MediaDiffService');

export type DiffProgressCallback = (progress: number, stage: string) => void;

export interface IMediaDiffService extends vscode.Disposable {
  analyze(
    uri: vscode.Uri,
    ref?: string,
    options?: DiffOptions,
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult>;
  analyzeLocalFiles(
    currentUri: vscode.Uri,
    previousUri: vscode.Uri,
    options?: DiffOptions,
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult>;
  getFileVersions(uri: vscode.Uri, ref?: string): Promise<FileVersionPair>;
  getLocalFileVersions(currentUri: vscode.Uri, previousUri: vscode.Uri): Promise<FileVersionPair>;
  cancel(): void;
  isSupported(uri: vscode.Uri): boolean;
  hasChanges(uri: vscode.Uri): Promise<boolean>;
  isTracked(uri: vscode.Uri): Promise<boolean>;
  getFileHistory(uri: vscode.Uri, maxCount?: number): Promise<GitCommitInfo[]>;
  extractPreviousToFile(uri: vscode.Uri, ref: string, outputPath: string): Promise<void>;
}

export class MediaDiffService implements IMediaDiffService {
  private readonly activeAnalyses = new Set<AbortController>();
  private readonly gitService: IGitMediaService;

  constructor(
    gitService: IGitMediaService | undefined,
    private readonly mediaRuntimeService: IMediaRuntimeService,
    private readonly workspaceIO: IWorkspaceIO,
    private readonly scheduler: IScheduler,
    private readonly tempFileService: ITempFileService,
  ) {
    this.gitService = gitService ?? new GitMediaService();
  }

  async analyze(
    uri: vscode.Uri,
    ref = 'HEAD',
    options: DiffOptions = {},
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult> {
    const mediaType = requireSupportedMediaType(uri.fsPath);
    const temporaryFiles: string[] = [];
    let result: DiffResult | undefined;
    let primaryFailure: { readonly error: unknown } | undefined;
    try {
      let currentPath = options.currentPath;
      let previousPath = options.previousPath;
      if (!currentPath || !previousPath) {
        onProgress?.(10, 'Fetching file versions...');
        const versions = await this.gitService.getFileVersions(uri, ref);
        if (versions.isNewFile) {
          onProgress?.(100, 'Complete');
          result = { mediaType, similarity: 0, details: { isNewFile: true } };
        } else {
          const extension = path.extname(uri.fsPath) || defaultExtension(mediaType);
          currentPath = await this.tempFileService.writeTempFile(
            'media-diff-current',
            extension,
            new Uint8Array(versions.current),
          );
          temporaryFiles.push(currentPath);
          previousPath = await this.tempFileService.writeTempFile(
            'media-diff-previous',
            extension,
            new Uint8Array(versions.previous),
          );
          temporaryFiles.push(previousPath);
        }
      }

      if (!result) {
        if (!currentPath || !previousPath) {
          throw new Error('Media comparison inputs were not materialized.');
        }
        onProgress?.(30, 'Analyzing differences...');
        result = await this.runComparison(mediaType, currentPath, previousPath, options, signal);
        onProgress?.(100, 'Complete');
      }
    } catch (error) {
      primaryFailure = { error };
    }

    const cleanupFailures = (
      await Promise.allSettled(
        temporaryFiles.map((file) => this.tempFileService.deleteTempFile(file)),
      )
    ).filter((cleanupResult): cleanupResult is PromiseRejectedResult => {
      return cleanupResult.status === 'rejected';
    });
    const cleanupError =
      cleanupFailures.length > 0
        ? new AggregateError(
            cleanupFailures.map((failure) => failure.reason),
            'Failed to clean up media comparison temporary files.',
          )
        : undefined;

    if (primaryFailure) {
      if (cleanupError) {
        logger.error(
          'Media comparison cleanup failed after the primary operation failed:',
          cleanupError,
        );
      }
      throw primaryFailure.error;
    }
    if (cleanupError) throw cleanupError;
    if (!result) throw new Error('Media comparison completed without a result.');
    return result;
  }

  async analyzeLocalFiles(
    currentUri: vscode.Uri,
    previousUri: vscode.Uri,
    options: DiffOptions = {},
    onProgress?: DiffProgressCallback,
    signal?: AbortSignal,
  ): Promise<DiffResult> {
    const currentType = requireSupportedMediaType(currentUri.fsPath);
    const previousType = requireSupportedMediaType(previousUri.fsPath);
    if (currentType !== previousType) {
      throw new Error(`Cannot compare different media types: ${currentType} vs ${previousType}`);
    }
    onProgress?.(10, 'Reading files...');
    const result = await this.runComparison(
      currentType,
      currentUri.fsPath,
      previousUri.fsPath,
      options,
      signal,
    );
    onProgress?.(100, 'Complete');
    return result;
  }

  async getFileVersions(uri: vscode.Uri, ref = 'HEAD'): Promise<FileVersionPair> {
    return this.gitService.getFileVersions(uri, ref);
  }

  async getLocalFileVersions(
    currentUri: vscode.Uri,
    previousUri: vscode.Uri,
  ): Promise<FileVersionPair> {
    const currentType = requireSupportedMediaType(currentUri.fsPath);
    const previousType = requireSupportedMediaType(previousUri.fsPath);
    if (currentType !== previousType) {
      throw new Error(`Media type mismatch: ${currentType} vs ${previousType}`);
    }
    const [current, previous] = await Promise.all([
      this.workspaceIO.readFile(currentUri),
      this.workspaceIO.readFile(previousUri),
    ]);
    return {
      current: toArrayBuffer(current),
      previous: toArrayBuffer(previous),
      currentPath: currentUri.fsPath,
      previousPath: previousUri.fsPath,
      mediaType: currentType,
    };
  }

  cancel(): void {
    for (const controller of this.activeAnalyses) {
      controller.abort(new Error('Media comparison cancelled.'));
    }
  }

  isSupported(uri: vscode.Uri): boolean {
    return getMediaType(uri.fsPath) !== null;
  }

  async hasChanges(uri: vscode.Uri): Promise<boolean> {
    const changes = await this.gitService.getChangedMediaFiles();
    return changes.some((change) => change.uri === uri.toString());
  }

  async isTracked(uri: vscode.Uri): Promise<boolean> {
    return this.gitService.isTracked(uri);
  }

  async getFileHistory(uri: vscode.Uri, maxCount?: number): Promise<GitCommitInfo[]> {
    return this.gitService.getFileHistory(uri, maxCount);
  }

  async extractPreviousToFile(uri: vscode.Uri, ref: string, outputPath: string): Promise<void> {
    return this.gitService.extractFileToPath(uri, ref, outputPath);
  }

  dispose(): void {
    this.cancel();
    this.gitService.dispose();
  }

  private async runComparison(
    mediaType: MediaType,
    currentPath: string,
    previousPath: string,
    options: DiffOptions,
    externalSignal: AbortSignal | undefined,
  ): Promise<DiffResult> {
    const controller = new AbortController();
    this.activeAnalyses.add(controller);
    const timeoutMs =
      options.timeout ??
      (mediaType === 'video' ? DEFAULT_VIDEO_DIFF_TIMEOUT : DEFAULT_DIFF_TIMEOUT);
    let timeoutTask: IScheduledTask | null = null;
    const forwardAbort = (): void => {
      controller.abort(externalSignal?.reason ?? new Error('Media comparison cancelled.'));
    };
    externalSignal?.addEventListener('abort', forwardAbort, { once: true });
    if (externalSignal?.aborted) forwardAbort();

    timeoutTask = this.scheduler.scheduleOnce(() => {
      controller.abort(new Error(`Media comparison timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    try {
      const result = await this.mediaRuntimeService.compare(
        mediaType,
        currentPath,
        previousPath,
        options,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      return result;
    } finally {
      timeoutTask.cancel();
      externalSignal?.removeEventListener('abort', forwardAbort);
      this.activeAnalyses.delete(controller);
    }
  }
}

function requireSupportedMediaType(filePath: string): MediaType {
  const mediaType = getMediaType(filePath);
  if (!mediaType) throw new Error(`Unsupported media file type: ${filePath}`);
  return mediaType;
}

function defaultExtension(mediaType: MediaType): string {
  switch (mediaType) {
    case 'image':
      return '.png';
    case 'audio':
      return '.wav';
    case 'video':
      return '.mp4';
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}
