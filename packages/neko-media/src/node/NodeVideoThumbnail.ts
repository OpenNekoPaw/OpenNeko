import { NodeFfmpegProcess, type FfmpegProcessPort } from './NodeFfmpegProcess';

export interface VideoThumbnailRequest {
  readonly sourcePath: string;
  readonly width: number;
  readonly height: number;
  readonly signal?: AbortSignal;
}

export class NodeVideoThumbnail {
  constructor(private readonly process: FfmpegProcessPort = new NodeFfmpegProcess()) {}

  async createPng(request: VideoThumbnailRequest): Promise<Uint8Array> {
    requireDimension(request.width, 'width');
    requireDimension(request.height, 'height');
    try {
      const result = await this.process.run(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          '0.25',
          '-i',
          request.sourcePath,
          '-frames:v',
          '1',
          '-vf',
          `scale=${request.width}:${request.height}:force_original_aspect_ratio=decrease`,
          '-f',
          'image2pipe',
          '-vcodec',
          'png',
          'pipe:1',
        ],
        request.signal,
      );
      if (result.stdout.byteLength === 0) {
        throw new Error('FFmpeg returned an empty thumbnail.');
      }
      return result.stdout;
    } catch (error: unknown) {
      if (request.signal?.aborted) {
        throw request.signal.reason instanceof Error
          ? request.signal.reason
          : new Error('Video thumbnail generation was cancelled.');
      }
      throw new VideoThumbnailError(error);
    }
  }
}

export class VideoThumbnailError extends Error {
  constructor(cause: unknown) {
    super('Media video thumbnail generation failed.', { cause });
    this.name = 'VideoThumbnailError';
  }
}

function requireDimension(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 2048) {
    throw new Error(`Video thumbnail ${field} must be an integer between 1 and 2048.`);
  }
}
