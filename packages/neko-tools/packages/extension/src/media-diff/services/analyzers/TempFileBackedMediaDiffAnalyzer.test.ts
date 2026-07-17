import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffOptions, DiffResult } from '@neko/shared';
import type { ITempFileService } from '../../../contracts/ITempFileService';
import { TempFileBackedMediaDiffAnalyzer } from './TempFileBackedMediaDiffAnalyzer';

class TestTempFileAnalyzer extends TempFileBackedMediaDiffAnalyzer {
  readonly mediaType = 'image' as const;
  reachedAnalyzeBody = false;

  constructor(tempFileService: ITempFileService) {
    super(['.png'], tempFileService);
  }

  async seedTempFiles(): Promise<void> {
    const localTempFiles: string[] = [];
    await this.writeTempFiles(
      'temp-file-backed-analyzer',
      Buffer.from('current'),
      Buffer.from('previous'),
      '.png',
      localTempFiles,
    );
  }

  async analyze(_current: Buffer, _previous: Buffer, _options?: DiffOptions): Promise<DiffResult> {
    this.createAbortController();
    await this.waitForPendingCleanup();
    this.reachedAnalyzeBody = true;

    return {
      mediaType: 'image',
      similarity: 1,
      details: {
        dimensions: {
          current: { width: 1, height: 1 },
          previous: { width: 1, height: 1 },
        },
        pixelDifference: 0,
        structuralSimilarity: 1,
        colorHistogramDiff: 0,
      },
    };
  }
}

describe('TempFileBackedMediaDiffAnalyzer', () => {
  let tempFileService: ITempFileService;

  beforeEach(() => {
    tempFileService = {
      createTempPath: vi.fn(),
      writeTempFile: vi
        .fn()
        .mockResolvedValueOnce('/tmp/current.png')
        .mockResolvedValueOnce('/tmp/previous.png'),
      deleteTempFile: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should wait for pending cleanup before starting the next analysis', async () => {
    let resolveDelete: (() => void) | undefined;
    tempFileService.deleteTempFile = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );

    const analyzer = new TestTempFileAnalyzer(tempFileService);
    await analyzer.seedTempFiles();

    analyzer.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tempFileService.deleteTempFile).toHaveBeenCalledTimes(2);

    const analyzePromise = analyzer.analyze(Buffer.from('a'), Buffer.from('b'));
    await Promise.resolve();

    expect(analyzer.reachedAnalyzeBody).toBe(false);

    resolveDelete?.();
    await analyzePromise;

    expect(analyzer.reachedAnalyzeBody).toBe(true);
  });
});
