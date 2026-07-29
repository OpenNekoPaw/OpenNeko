/**
 * Media Preprocessor
 *
 * Prepares image and video files for LLM vision input:
 * - Images: transform according to platform vision policy
 * - Videos: extract keyframes, resize, return as frame array
 *
 * Uses the canonical Node/FFmpeg runtime for video processing and sharp for images.
 */

import { getLogger } from '../../base';
import type { NodeMediaRuntime } from '@neko/media/node';
import { getMimeType } from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  VisionPreprocessor,
  type VisionMediaProcessOptions,
  type VisionProcessedMedia,
  type VisionVideoProcessor,
} from '@neko/platform/media';
import { createSharpVisionImageProcessor } from '../../services/visionImageProcessor';

const logger = getLogger('MediaPreprocessor');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProcessedMedia = VisionProcessedMedia;
export type MediaProcessOptions = VisionMediaProcessOptions;

// ─── Implementation ───────────────────────────────────────────────────────────

export class MediaPreprocessor {
  private readonly preprocessor: VisionPreprocessor;

  constructor(
    mediaRuntime: NodeMediaRuntime,
    private readonly contentAccessRuntime?: AgentContentAccessRuntime,
  ) {
    this.preprocessor = new VisionPreprocessor({
      readFile: (filePath) => this.readImageBytes(filePath),
      imageProcessor: createSharpVisionImageProcessor(),
      videoProcessor: createNodeVideoProcessor(mediaRuntime),
      logger,
    });
  }

  /**
   * Auto-detect file type and preprocess for LLM vision.
   * Returns processed images or 'unsupported' if not a media file.
   */
  async process(filePath: string, opts?: MediaProcessOptions): Promise<ProcessedMedia> {
    return this.preprocessor.process(filePath, opts);
  }

  /**
   * Process an image file: resize if exceeding vision thresholds.
   */
  async processImage(filePath: string): Promise<ProcessedMedia> {
    return this.preprocessor.processImage(filePath);
  }

  /**
   * Process a video file: extract keyframes, resize, return as frame array.
   * Requires engine to be available.
   */
  async processVideo(filePath: string, opts?: MediaProcessOptions): Promise<ProcessedMedia> {
    return this.preprocessor.processVideo(filePath, opts);
  }

  private async readImageBytes(filePath: string): Promise<Uint8Array> {
    if (!this.contentAccessRuntime) {
      throw new Error('Media image preprocessing requires AgentContentAccessRuntime.');
    }
    const mimeType = getMimeType(filePath);
    const loaded = await this.contentAccessRuntime.loadProviderAsset({
      source: {
        kind: 'file',
        path: filePath,
      },
      mimeTypeHint: mimeType,
    });
    if (loaded.status !== 'ready' || !loaded.bytes) {
      throw new Error(
        loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
          `Media image is not ready: ${loaded.status}`,
      );
    }
    return loaded.bytes;
  }
}

function createNodeVideoProcessor(mediaRuntime: NodeMediaRuntime): VisionVideoProcessor {
  return {
    probe: async (filePath) => {
      const probe = await mediaRuntime.probe(filePath);
      if (!probe.video) {
        throw new Error('Vision video preprocessing requires a video stream.');
      }
      return {
        duration: probe.durationSeconds,
        width: probe.video.width,
        height: probe.video.height,
      };
    },
    getKeyframes: (filePath) => mediaRuntime.keyframes(filePath),
    extractFrame: async (filePath, time, options) => {
      const dataUrl = await mediaRuntime.captureFrame(filePath, time, options);
      return decodeDataUrl(dataUrl);
    },
  };
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const separator = dataUrl.indexOf(',');
  if (separator < 0 || !dataUrl.slice(0, separator).endsWith(';base64')) {
    throw new Error('Media runtime returned an invalid frame data URL.');
  }
  return new Uint8Array(Buffer.from(dataUrl.slice(separator + 1), 'base64'));
}
