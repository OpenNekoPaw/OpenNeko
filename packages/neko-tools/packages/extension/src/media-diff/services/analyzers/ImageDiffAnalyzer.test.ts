/**
 * ImageDiffAnalyzer 单元测试
 *
 * 测试图片 Diff 分析器的核心功能（委托给引擎）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { IEngineMediaService } from '../../../contracts/IEngineMediaService';
import type { ITempFileService } from '../../../contracts/ITempFileService';
import { ImageDiffAnalyzer } from './ImageDiffAnalyzer';

// =============================================================================
// Mock vscode
// =============================================================================

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

// =============================================================================
// Mock analyzer dependencies
// =============================================================================

const mockDiff = vi.fn();

// =============================================================================
// Test Suite
// =============================================================================

describe('ImageDiffAnalyzer', () => {
  let analyzer: ImageDiffAnalyzer;
  let engineMediaService: IEngineMediaService;
  let tempFileService: ITempFileService;

  beforeEach(() => {
    mockDiff.mockReset();
    engineMediaService = {
      ensureClient: vi.fn(),
      diff: mockDiff,
      detectSilence: vi.fn(),
      probe: vi.fn(),
    };
    tempFileService = {
      createTempPath: vi.fn(),
      writeTempFile: vi
        .fn()
        .mockResolvedValueOnce('/tmp/current.png')
        .mockResolvedValueOnce('/tmp/previous.png'),
      deleteTempFile: vi.fn().mockResolvedValue(undefined),
    };
    analyzer = new ImageDiffAnalyzer(engineMediaService, tempFileService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('mediaType', () => {
    it('should be image', () => {
      expect(analyzer.mediaType).toBe('image');
    });
  });

  describe('supports', () => {
    it('should support PNG files', () => {
      expect(analyzer.supports('/path/to/image.png')).toBe(true);
      expect(analyzer.supports('/path/to/image.PNG')).toBe(true);
    });

    it('should support JPEG files', () => {
      expect(analyzer.supports('/path/to/image.jpg')).toBe(true);
      expect(analyzer.supports('/path/to/image.jpeg')).toBe(true);
      expect(analyzer.supports('/path/to/image.JPEG')).toBe(true);
    });

    it('should support GIF files', () => {
      expect(analyzer.supports('/path/to/image.gif')).toBe(true);
    });

    it('should support WebP files', () => {
      expect(analyzer.supports('/path/to/image.webp')).toBe(true);
    });

    it('should support BMP files', () => {
      expect(analyzer.supports('/path/to/image.bmp')).toBe(true);
    });

    it('should support SVG files', () => {
      expect(analyzer.supports('/path/to/image.svg')).toBe(true);
    });

    it('should not support video files', () => {
      expect(analyzer.supports('/path/to/video.mp4')).toBe(false);
      expect(analyzer.supports('/path/to/video.mov')).toBe(false);
    });

    it('should not support audio files', () => {
      expect(analyzer.supports('/path/to/audio.mp3')).toBe(false);
      expect(analyzer.supports('/path/to/audio.wav')).toBe(false);
    });

    it('should not support other file types', () => {
      expect(analyzer.supports('/path/to/document.pdf')).toBe(false);
      expect(analyzer.supports('/path/to/file.txt')).toBe(false);
    });

    it('should handle files without extension', () => {
      expect(analyzer.supports('/path/to/noextension')).toBe(false);
    });

    it('should handle empty path', () => {
      expect(analyzer.supports('')).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should not throw when cancelled', () => {
      expect(() => analyzer.cancel()).not.toThrow();
    });
  });

  describe('analyze', () => {
    it('should return diff result from engine', async () => {
      mockDiff.mockResolvedValue({
        category: 'image',
        identical: false,
        diffCount: 1,
        totalFields: 4,
        fields: [],
        imageDiff: {
          ssim: 0.85,
          psnr: 35.0,
          mse: 10.0,
          diffPixelPercent: 15.0,
          diffPixelCount: 1500,
          totalPixels: 10000,
          widthA: 100,
          heightA: 100,
          widthB: 100,
          heightB: 100,
          heatmap: '',
          heatmapWidth: 100,
          heatmapHeight: 100,
        },
      });

      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      const result = await analyzer.analyze(current, previous);

      expect(result).toHaveProperty('mediaType', 'image');
      expect(result).toHaveProperty('similarity');
      expect(result.similarity).toBeCloseTo(0.85, 1);
      expect(mockDiff).toHaveBeenCalledWith('images', '/tmp/current.png', '/tmp/previous.png');
    });

    it('should throw when engine is unavailable', async () => {
      mockDiff.mockResolvedValue(null);

      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      await expect(analyzer.analyze(current, previous)).rejects.toThrow(
        'Engine image diff unavailable',
      );
    });

    it('should return image diff details with dimensions', async () => {
      mockDiff.mockResolvedValue({
        category: 'image',
        identical: false,
        diffCount: 0,
        totalFields: 4,
        fields: [],
        imageDiff: {
          ssim: 1.0,
          psnr: Infinity,
          mse: 0,
          diffPixelPercent: 0,
          diffPixelCount: 0,
          totalPixels: 10000,
          widthA: 100,
          heightA: 100,
          widthB: 200,
          heightB: 200,
          heatmap: '',
          heatmapWidth: 200,
          heatmapHeight: 200,
        },
      });

      const current = Buffer.from('current image data');
      const previous = Buffer.from('previous image data');

      const result = await analyzer.analyze(current, previous);
      const details = result.details as any;

      expect(details.dimensions.current).toEqual({ width: 100, height: 100 });
      expect(details.dimensions.previous).toEqual({ width: 200, height: 200 });
      expect(details.pixelDifference).toBe(0);
      expect(details.structuralSimilarity).toBe(1.0);
    });
  });
});
