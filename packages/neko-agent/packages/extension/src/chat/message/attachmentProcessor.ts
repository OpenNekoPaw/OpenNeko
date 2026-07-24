/**
 * Attachment Processor
 *
 * Extension-host bridge for attachment projection.
 */

import * as fs from 'fs';
import { getLogger } from '../../base';
import {
  projectAgentMessageAttachments,
  type AgentBase64ImageAttachment,
  type AgentThreeReferenceImageResource,
  type AgentProcessedAttachments,
  type AgentRuntimePromptLocale,
} from '@neko/agent/runtime';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  isVisionImageMime,
  planVisionImagePreprocess,
  resolveVisionImageAttachmentMediaType,
} from '@neko/platform/media/vision-preprocess-policy';
import type { MessageAttachment } from '../types';

const logger = getLogger('AttachmentProcessor');

/**
 * Processed attachment result
 */
export type ProcessedAttachments = AgentProcessedAttachments;

export interface AttachmentProcessorDeps {
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
}

/**
 * Bridge for message attachments.
 *
 * Projection rules live in @neko/agent. This class only injects local file IO
 * and image encoding capabilities from the extension host.
 */
export class AttachmentProcessor {
  constructor(private readonly deps: AttachmentProcessorDeps = {}) {}

  /**
   * Process attachments using agent-owned projection rules.
   */
  async processAttachments(
    attachments?: MessageAttachment[],
    options: { readonly locale?: AgentRuntimePromptLocale | string } = {},
  ): Promise<ProcessedAttachments> {
    return projectAgentMessageAttachments(attachments, {
      readTextFile: async (path) => fs.promises.readFile(path, 'utf-8'),
      readImageFileAsBase64: (path) => this.readFileAsBase64(path),
      locale: options.locale,
      onError: ({ operation, error }) => {
        logger.error(`Failed to ${operation} attachment`, error);
      },
    });
  }

  /**
   * Read file as base64 for image attachments.
   * Image policy is provided by @neko/platform; this method only performs IO
   * and sharp-based encoding in the extension host.
   */
  async readFileAsBase64(filePath: string): Promise<{
    type: 'base64';
    media_type: string;
    data: string;
  } | null> {
    try {
      const mediaType = resolveVisionImageAttachmentMediaType(filePath);
      const contentAccessRuntime = this.deps.contentAccessRuntime;
      if (!contentAccessRuntime) {
        throw new Error('Image attachment reading requires AgentContentAccessRuntime.');
      }
      const loaded = await contentAccessRuntime.loadProviderAsset({
        source: {
          kind: 'file',
          path: filePath,
        },
        mimeTypeHint: mediaType,
      });
      if (loaded.status !== 'ready' || !loaded.bytes) {
        throw new Error(
          loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
            `Image attachment is not ready: ${loaded.status}`,
        );
      }
      const buffer = Buffer.from(loaded.bytes);
      const outputMediaType = loaded.mimeType ?? mediaType;

      if (isVisionImageMime(outputMediaType)) {
        const encoded = await this.maybeEncodeVisionImage(buffer);
        if (encoded) {
          return encoded;
        }
      }

      return { type: 'base64', media_type: outputMediaType, data: buffer.toString('base64') };
    } catch (err) {
      logger.error('Failed to read file as base64:', err);
      return null;
    }
  }

  async processContextImageResources(
    resources: readonly AgentThreeReferenceImageResource[],
  ): Promise<AgentBase64ImageAttachment[]> {
    const contentAccessRuntime = this.deps.contentAccessRuntime;
    if (!contentAccessRuntime) {
      throw new Error('3D Reference image projection requires AgentContentAccessRuntime.');
    }
    const attachments: AgentBase64ImageAttachment[] = [];
    for (const input of resources) {
      const loaded = await contentAccessRuntime.loadProviderAsset({
        source: input.resource,
        mimeTypeHint: 'image/png',
        metadata: { threeReferenceRole: input.role },
      });
      if (loaded.status !== 'ready' || !loaded.bytes) {
        const diagnostic = loaded.diagnostics.find(
          (candidate) => candidate.severity === 'error',
        )?.message;
        throw new Error(
          `Unable to load ${input.role} 3D Reference image: ${diagnostic ?? loaded.status}`,
        );
      }
      const mediaType = loaded.mimeType ?? 'image/png';
      if (!isVisionImageMime(mediaType)) {
        throw new Error(
          `Unable to load ${input.role} 3D Reference image: unsupported MIME ${mediaType}.`,
        );
      }
      const buffer = Buffer.from(loaded.bytes);
      const encoded = await this.maybeEncodeVisionImage(buffer);
      attachments.push(
        encoded ?? {
          type: 'base64',
          media_type: mediaType,
          data: buffer.toString('base64'),
        },
      );
    }
    return attachments;
  }

  /**
   * Encode image only when the platform policy asks for a transform.
   */
  private async maybeEncodeVisionImage(buffer: Buffer): Promise<AgentBase64ImageAttachment | null> {
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const plan = planVisionImagePreprocess({
        width: w,
        height: h,
        byteLength: buffer.length,
      });

      if (!plan.shouldResize) return null;

      const resized = await sharp(buffer)
        .resize({
          width: plan.maxWidth,
          height: plan.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: plan.jpegQuality })
        .toBuffer();

      logger.debug(`Resized image: ${w}x${h} (${buffer.length}B) -> ${resized.length}B`);
      return {
        type: 'base64',
        media_type: plan.outputMediaType,
        data: resized.toString('base64'),
      };
    } catch (err) {
      logger.warn('Image resize failed, using original:', err);
      return null;
    }
  }
}
