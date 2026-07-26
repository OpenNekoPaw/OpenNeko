/**
 * ImageDiffAnalyzer - Image Diff Analyzer
 *
 * Delegates image comparison to the canonical Node/FFmpeg media runtime.
 */

import type { DiffOptions, DiffResult, ImageDiffDetails } from '@neko/shared';
import type { IMediaRuntimeService } from '../../../contracts/IMediaRuntimeService';
import type { ITempFileService } from '../../../contracts/ITempFileService';
import { TempFileBackedMediaDiffAnalyzer } from './TempFileBackedMediaDiffAnalyzer';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

export class ImageDiffAnalyzer extends TempFileBackedMediaDiffAnalyzer {
  readonly mediaType = 'image' as const;

  constructor(
    private readonly mediaRuntimeService: IMediaRuntimeService,
    tempFileService: ITempFileService,
  ) {
    super(IMAGE_EXTENSIONS, tempFileService);
  }

  async analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult> {
    this.createAbortController();
    await this.waitForPendingCleanup();
    const localTempFiles: string[] = [];

    try {
      const ext = options?.fileExtension ?? '.png';
      const [currentPath, previousPath] = await this.writeTempFiles(
        'image-diff',
        current,
        previous,
        ext,
        localTempFiles,
      );
      this.throwIfAborted();

      const runtimeResult = await this.mediaRuntimeService.diff(
        'images',
        currentPath,
        previousPath,
      );

      this.throwIfAborted();

      const imageDiff = runtimeResult.imageDiff;

      const details: ImageDiffDetails = {
        dimensions: {
          current: { width: imageDiff?.widthA ?? 0, height: imageDiff?.heightA ?? 0 },
          previous: { width: imageDiff?.widthB ?? 0, height: imageDiff?.heightB ?? 0 },
        },
        pixelDifference: (imageDiff?.diffPixelPercent ?? 0) / 100,
        structuralSimilarity: imageDiff?.ssim ?? 0,
        colorHistogramDiff: 0, // The FFmpeg adapter does not compute a histogram.
      };

      // Use FFmpeg SSIM as the primary similarity metric.
      const similarity = imageDiff?.ssim ?? 0;

      // Build visualization from the runtime heatmap when available.
      let visualization: DiffResult['visualization'];
      if (options?.generateHeatmap && imageDiff?.heatmap) {
        const heatmapBuffer = Buffer.from(imageDiff.heatmap, 'base64');
        visualization = {
          heatmap: heatmapBuffer.buffer.slice(
            heatmapBuffer.byteOffset,
            heatmapBuffer.byteOffset + heatmapBuffer.byteLength,
          ),
        };
      }

      return {
        mediaType: 'image',
        similarity: Math.max(0, Math.min(1, similarity)),
        details,
        visualization,
      };
    } finally {
      await this.cleanupTempFiles(localTempFiles);
    }
  }
}
