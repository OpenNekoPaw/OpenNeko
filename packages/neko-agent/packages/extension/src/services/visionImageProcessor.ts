import type { VisionImageProcessor } from '@neko/platform/media';
import type { GeneratedImageVariantGenerator } from '@neko/shared/vscode/extension';

export function createSharpVisionImageProcessor(): VisionImageProcessor {
  return {
    metadata: async (buffer) => {
      const sharp = (await import('sharp')).default;
      return sharp(buffer).metadata();
    },
    toJpeg: async (input) => {
      const sharp = (await import('sharp')).default;
      let image = sharp(input.buffer);
      if (input.resize) {
        image = image.resize(input.resize);
      }
      return image.jpeg({ quality: input.jpegQuality }).toBuffer();
    },
  };
}

export function createSharpGeneratedImageVariantGenerator(): GeneratedImageVariantGenerator {
  return {
    generate: async (sourcePath, request) => {
      const sharp = (await import('sharp')).default;
      const result = await sharp(sourcePath)
        .resize({
          width: request.width,
          height: request.height,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      if (!result.info.width || !result.info.height) {
        throw new Error('Sharp generated thumbnail without dimensions.');
      }
      return {
        bytes: result.data,
        width: result.info.width,
        height: result.info.height,
        mimeType: 'image/webp',
      };
    },
  };
}
