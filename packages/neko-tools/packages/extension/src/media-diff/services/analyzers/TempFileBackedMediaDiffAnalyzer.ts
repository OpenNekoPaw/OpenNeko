import type { ITempFileService } from '../../../contracts/ITempFileService';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';

export abstract class TempFileBackedMediaDiffAnalyzer extends BaseMediaDiffAnalyzer {
  private readonly activeTempFiles = new Set<string>();
  private pendingCleanup: Promise<void> = Promise.resolve();

  constructor(
    supportedExtensions: string[],
    protected readonly tempFileService: ITempFileService,
  ) {
    super(supportedExtensions);
  }

  protected async writeTempFiles(
    prefix: string,
    current: Buffer,
    previous: Buffer,
    extension: string,
    localTempFiles: string[],
  ): Promise<[string, string]> {
    const [currentPath, previousPath] = await Promise.all([
      this.tempFileService.writeTempFile(`${prefix}-a`, extension, current),
      this.tempFileService.writeTempFile(`${prefix}-b`, extension, previous),
    ]);

    localTempFiles.push(currentPath, previousPath);
    this.activeTempFiles.add(currentPath);
    this.activeTempFiles.add(previousPath);
    return [currentPath, previousPath];
  }

  protected async cleanupTempFiles(files: readonly string[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    await Promise.all(
      files.map(async (filePath) => {
        await this.tempFileService.deleteTempFile(filePath);
        this.activeTempFiles.delete(filePath);
      }),
    );
  }

  protected async waitForPendingCleanup(): Promise<void> {
    await this.pendingCleanup;
  }

  override cancel(): void {
    super.cancel();
    const files = [...this.activeTempFiles];
    this.activeTempFiles.clear();
    this.pendingCleanup = this.pendingCleanup
      .catch(() => {})
      .then(async () => {
        await this.cleanupTempFiles(files);
      });
  }
}
