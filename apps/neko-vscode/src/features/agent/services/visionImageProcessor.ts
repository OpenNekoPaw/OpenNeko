import type { VisionImageProcessor } from '@neko/platform/media';
import type {
  ContentReadService,
  ContentRepresentationGenerator,
  ContentRepresentationGeneratorInput,
} from '@neko/shared';

const MAX_GENERATED_IMAGE_SOURCE_BYTES = 64 * 1024 * 1024;

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

export function createSharpGeneratedImageRepresentationGenerator(
  contentRead: ContentReadService,
): ContentRepresentationGenerator {
  return {
    id: 'neko-agent.sharp-image-representation',
    revision: '1',
    kinds: ['thumbnail', 'preview'],
    generate: async (input) => {
      const request = imageRepresentationRequest(input);
      const source = await contentRead.read(input.source, {
        maxBytes: MAX_GENERATED_IMAGE_SOURCE_BYTES,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (source.status !== 'ready') {
        throw new Error(`Generated image source is unavailable: ${source.diagnostic.code}.`);
      }
      const sharp = (await import('sharp')).default;
      const result = await sharp(source.bytes)
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
        metadata: {
          width: result.info.width,
          height: result.info.height,
          mimeType: 'image/webp',
          byteLength: result.data.byteLength,
        },
      };
    },
  };
}

function imageRepresentationRequest(input: ContentRepresentationGeneratorInput): {
  readonly width?: number;
  readonly height?: number;
} {
  if (input.spec.kind !== 'thumbnail' && input.spec.kind !== 'preview') {
    throw new Error(`Unsupported Sharp image representation: ${input.spec.kind}.`);
  }
  return {
    ...(input.spec.maxWidth !== undefined ? { width: input.spec.maxWidth } : {}),
    ...(input.spec.maxHeight !== undefined ? { height: input.spec.maxHeight } : {}),
  };
}
