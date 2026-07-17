import * as vscode from 'vscode';
import type { ITempFileService } from '../../contracts/ITempFileService';

export interface IMediaDiffRequestState extends vscode.Disposable {
  currentAbortController: AbortController | null;
  fetchPromise: Promise<void> | null;
  previousFilePath: string | null;
  previousFileRef: string | null;
  beginAnalysis(): AbortController;
  cancelCurrentAnalysis(): void;
  clearAbortController(controller: AbortController): void;
  clearFetchPromise(fetchPromise?: Promise<void> | null): void;
  hasPreviousFileForRef(ref: string): boolean;
  setPreviousFilePath(filePath: string, ref: string): Promise<void>;
  clearPreviousFilePath(): Promise<void>;
  disposeAsync(): Promise<void>;
}

export class MediaDiffRequestState implements IMediaDiffRequestState {
  currentAbortController: AbortController | null = null;
  fetchPromise: Promise<void> | null = null;
  previousFilePath: string | null = null;
  previousFileRef: string | null = null;
  private disposePromise: Promise<void> | null = null;

  constructor(private readonly tempFileService: ITempFileService) {}

  beginAnalysis(): AbortController {
    this.cancelCurrentAnalysis();
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    return abortController;
  }

  cancelCurrentAnalysis(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    this.fetchPromise = null;
  }

  clearAbortController(controller: AbortController): void {
    if (this.currentAbortController === controller) {
      this.currentAbortController = null;
    }
  }

  clearFetchPromise(fetchPromise?: Promise<void> | null): void {
    if (!fetchPromise || this.fetchPromise === fetchPromise) {
      this.fetchPromise = null;
    }
  }

  hasPreviousFileForRef(ref: string): boolean {
    return this.previousFilePath !== null && this.previousFileRef === ref;
  }

  async setPreviousFilePath(filePath: string, ref: string): Promise<void> {
    if (this.previousFilePath === filePath && this.previousFileRef === ref) {
      return;
    }

    await this.clearPreviousFilePath();
    this.previousFilePath = filePath;
    this.previousFileRef = ref;
  }

  async clearPreviousFilePath(): Promise<void> {
    const filePath = this.previousFilePath;

    this.previousFilePath = null;
    this.previousFileRef = null;

    if (!filePath) {
      return;
    }

    await this.tempFileService.deleteTempFile(filePath);
  }

  async disposeAsync(): Promise<void> {
    this.disposePromise ??= this.disposeInternal();
    return this.disposePromise;
  }

  dispose(): void {
    void this.disposeAsync();
  }

  private async disposeInternal(): Promise<void> {
    this.cancelCurrentAnalysis();
    await this.clearPreviousFilePath();
  }
}
