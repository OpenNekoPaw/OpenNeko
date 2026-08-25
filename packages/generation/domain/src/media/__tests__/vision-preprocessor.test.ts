import { describe, expect, it, vi } from 'vitest';
import {
  VisionPreprocessor,
  type VisionImageProcessor,
  type VisionVideoProcessor,
} from '../vision-preprocessor';

describe('VisionPreprocessor', () => {
  it('processes images through injected image host effects', async () => {
    const readFile = vi.fn(async () => Buffer.alloc(5));
    const imageProcessor: VisionImageProcessor = {
      metadata: vi.fn(async () => ({ width: 2000, height: 1000 })),
      toJpeg: vi.fn(async () => Buffer.from('jpeg')),
    };

    const result = await new VisionPreprocessor({
      readFile,
      imageProcessor,
    }).process('/tmp/input.png');

    expect(readFile).toHaveBeenCalledWith('/tmp/input.png');
    expect(imageProcessor.toJpeg).toHaveBeenCalledWith({
      buffer: Buffer.alloc(5),
      jpegQuality: 85,
      resize: {
        width: 1568,
        height: 1568,
        fit: 'inside',
        withoutEnlargement: true,
      },
    });
    expect(result).toEqual({
      type: 'image',
      images: [{ media_type: 'image/jpeg', data: Buffer.from('jpeg').toString('base64') }],
      metadata: { width: 2000, height: 1000 },
    });
  });

  it('processes videos through injected engine host effects', async () => {
    const videoProcessor: VisionVideoProcessor = {
      probe: vi.fn(async () => ({ duration: 100, width: 2000, height: 1000 })),
      getKeyframes: vi.fn(async () => [0, 10, 20, 30, 40, 50]),
      extractFrame: vi.fn(async (_filePath, time) => Buffer.from(`frame-${time}`)),
    };

    const result = await new VisionPreprocessor({
      readFile: vi.fn(),
      imageProcessor: createUnusedImageProcessor(),
      videoProcessor,
    }).process('/tmp/input.mp4', { maxFrames: 3 });

    expect(videoProcessor.extractFrame).toHaveBeenCalledTimes(3);
    expect(videoProcessor.extractFrame).toHaveBeenNthCalledWith(1, '/tmp/input.mp4', 10, {
      quality: 85,
      width: 1568,
      height: undefined,
    });
    expect(result).toEqual({
      type: 'video-frames',
      images: [
        { media_type: 'image/jpeg', data: Buffer.from('frame-10').toString('base64') },
        { media_type: 'image/jpeg', data: Buffer.from('frame-30').toString('base64') },
        { media_type: 'image/jpeg', data: Buffer.from('frame-50').toString('base64') },
      ],
      metadata: { duration: 100, width: 2000, height: 1000, frameCount: 3 },
    });
  });

  it('falls back to unsupported when video host effects are unavailable', async () => {
    await expect(
      new VisionPreprocessor({
        readFile: vi.fn(),
        imageProcessor: createUnusedImageProcessor(),
      }).process('/tmp/input.mp4'),
    ).resolves.toEqual({
      type: 'unsupported',
      images: [],
      metadata: { duration: 0 },
    });
  });

  it('uses uniform sampling when keyframes cannot be read', async () => {
    const videoProcessor: VisionVideoProcessor = {
      probe: vi.fn(async () => ({ duration: 10, width: 800, height: 600 })),
      getKeyframes: vi.fn(async () => {
        throw new Error('no keyframes');
      }),
      extractFrame: vi.fn(async (_filePath, time) => Buffer.from(`frame-${time}`)),
    };

    await new VisionPreprocessor({
      readFile: vi.fn(),
      imageProcessor: createUnusedImageProcessor(),
      videoProcessor,
    }).process('/tmp/input.mp4', { maxFrames: 3 });

    expect(videoProcessor.extractFrame).toHaveBeenNthCalledWith(1, '/tmp/input.mp4', 0.5, {
      quality: 85,
      width: undefined,
      height: undefined,
    });
    expect(videoProcessor.extractFrame).toHaveBeenNthCalledWith(2, '/tmp/input.mp4', 5, {
      quality: 85,
      width: undefined,
      height: undefined,
    });
    expect(videoProcessor.extractFrame).toHaveBeenNthCalledWith(3, '/tmp/input.mp4', 9.5, {
      quality: 85,
      width: undefined,
      height: undefined,
    });
  });

  it('ignores unsupported file types', async () => {
    await expect(
      new VisionPreprocessor({
        readFile: vi.fn(),
        imageProcessor: createUnusedImageProcessor(),
      }).process('/tmp/input.txt'),
    ).resolves.toEqual({ type: 'unsupported', images: [] });
  });
});

function createUnusedImageProcessor(): VisionImageProcessor {
  return {
    metadata: vi.fn(async () => {
      throw new Error('unused');
    }),
    toJpeg: vi.fn(async () => {
      throw new Error('unused');
    }),
  };
}
