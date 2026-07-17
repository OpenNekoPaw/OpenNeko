import {
  DEFAULT_VISION_PREPROCESS_POLICY,
  VISION_IMAGE_OUTPUT_MEDIA_TYPE,
  calculateVisionVideoFrameSize,
  calculateVisionVideoSampleRange,
  getDefaultVisionVideoMaxFrames,
  getVisionMediaKindFromPath,
  planVisionImagePreprocess,
  selectVisionVideoSampleTimestamps,
  uniformVisionVideoSample,
  type VisionVideoSegment,
} from './vision-preprocess-policy';

export interface VisionProcessedMedia {
  type: 'image' | 'video-frames' | 'unsupported';
  images: Array<{ media_type: string; data: string }>;
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    frameCount?: number;
  };
}

export interface VisionMediaProcessOptions {
  segment?: VisionVideoSegment;
  maxFrames?: number;
}

export interface VisionImageMetadataResult {
  width?: number;
  height?: number;
}

export interface VisionImageTransformInput {
  buffer: Uint8Array;
  jpegQuality: number;
  resize?: {
    width?: number;
    height?: number;
    fit: 'inside';
    withoutEnlargement: true;
  };
}

export interface VisionImageProcessor {
  metadata(buffer: Uint8Array): Promise<VisionImageMetadataResult>;
  toJpeg(input: VisionImageTransformInput): Promise<Uint8Array>;
}

export interface VisionVideoProbeResult {
  duration: number;
  width: number;
  height: number;
}

export interface VisionVideoProcessor {
  probe(filePath: string): Promise<VisionVideoProbeResult>;
  getKeyframes(filePath: string): Promise<readonly number[]>;
  extractFrame(
    filePath: string,
    time: number,
    options: {
      quality: number;
      width?: number;
      height?: number;
    },
  ): Promise<Uint8Array | null>;
}

export interface VisionPreprocessorLogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export interface VisionPreprocessorDeps {
  readFile(filePath: string): Promise<Uint8Array>;
  imageProcessor: VisionImageProcessor;
  videoProcessor?: VisionVideoProcessor | null;
  logger?: VisionPreprocessorLogger;
}

export class VisionPreprocessor {
  constructor(private readonly deps: VisionPreprocessorDeps) {}

  async process(filePath: string, opts?: VisionMediaProcessOptions): Promise<VisionProcessedMedia> {
    const kind = getVisionMediaKindFromPath(filePath);
    if (kind === 'image') return this.processImage(filePath);
    if (kind === 'video') return this.processVideo(filePath, opts);
    return { type: 'unsupported', images: [] };
  }

  async processImage(filePath: string): Promise<VisionProcessedMedia> {
    try {
      const buffer = await this.deps.readFile(filePath);
      const meta = await this.deps.imageProcessor.metadata(buffer);
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;

      const plan = planVisionImagePreprocess({
        width,
        height,
        byteLength: buffer.byteLength,
      });
      const output = await this.deps.imageProcessor.toJpeg({
        buffer,
        jpegQuality: plan.jpegQuality,
        ...(plan.shouldResize && {
          resize: {
            width: plan.maxWidth,
            height: plan.maxHeight,
            fit: 'inside',
            withoutEnlargement: true,
          },
        }),
      });

      if (plan.shouldResize) {
        this.deps.logger?.info(
          `Resized image: ${width}x${height} (${buffer.byteLength}B) -> ${output.byteLength}B`,
        );
      }

      return {
        type: 'image',
        images: [{ media_type: plan.outputMediaType, data: toBase64(output) }],
        metadata: { width, height },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to process image', { filePath, error });
      return { type: 'unsupported', images: [] };
    }
  }

  async processVideo(
    filePath: string,
    opts?: VisionMediaProcessOptions,
  ): Promise<VisionProcessedMedia> {
    if (!this.deps.videoProcessor) {
      this.deps.logger?.warn('Engine unavailable, cannot extract video frames');
      return { type: 'unsupported', images: [], metadata: { duration: 0 } };
    }

    try {
      const probe = await this.deps.videoProcessor.probe(filePath);
      const duration = probe.duration;
      if (duration <= 0) {
        return { type: 'unsupported', images: [], metadata: { duration: 0 } };
      }

      const { rangeIn, rangeOut } = calculateVisionVideoSampleRange(duration, opts?.segment);
      const maxFrames = opts?.maxFrames ?? getDefaultVisionVideoMaxFrames();
      const timestamps = await this.getSampleTimestamps(filePath, rangeIn, rangeOut, maxFrames);
      const { width, height } = calculateVisionVideoFrameSize(probe.width, probe.height);

      const images: Array<{ media_type: string; data: string }> = [];
      for (const time of timestamps) {
        const frame = await this.deps.videoProcessor.extractFrame(filePath, time, {
          quality: DEFAULT_VISION_PREPROCESS_POLICY.resizedImageQuality,
          width,
          height,
        });
        if (frame) {
          images.push({ media_type: VISION_IMAGE_OUTPUT_MEDIA_TYPE, data: toBase64(frame) });
        }
      }

      this.deps.logger?.info(
        `Extracted ${images.length} frames from video (${duration.toFixed(1)}s, ` +
          `range ${rangeIn.toFixed(1)}-${rangeOut.toFixed(1)}s)`,
      );

      return {
        type: 'video-frames',
        images,
        metadata: {
          duration,
          width: probe.width,
          height: probe.height,
          frameCount: images.length,
        },
      };
    } catch (error) {
      this.deps.logger?.error('Failed to process video', { filePath, error });
      return { type: 'unsupported', images: [] };
    }
  }

  private async getSampleTimestamps(
    filePath: string,
    rangeIn: number,
    rangeOut: number,
    maxFrames: number,
  ): Promise<number[]> {
    if (!this.deps.videoProcessor) {
      return uniformVisionVideoSample(rangeIn, rangeOut, maxFrames);
    }

    try {
      const keyframes = await this.deps.videoProcessor.getKeyframes(filePath);
      return selectVisionVideoSampleTimestamps({ keyframes, rangeIn, rangeOut, maxFrames });
    } catch {
      return uniformVisionVideoSample(rangeIn, rangeOut, maxFrames);
    }
  }
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}
