import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { LocalAttachmentStore } from '@deepseek-ai/dsh-attachment-local';
import { CONTENT_IMAGE_DSH_CHUNK_BYTES } from '@neko/content-domain';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('Content image tools with the persistent DSH attachment store', () => {
  it.each(['openneko_read_images', 'openneko_read_image'])(
    '%s preserves normalized metadata through render, reopen, preview and model reads',
    async (toolName) => {
      const home = await mkdtemp(join(tmpdir(), 'neko-image-roundtrip-'));
      const storeContext = new Context();
      const reopenedContext = new Context();
      try {
        const config = { dshHome: home, normalizedImageMaxDimension: 256 };
        const attachments = new LocalAttachmentStore(storeContext, config);
        const save = vi.spyOn(attachments, 'saveImage');
        const sources = Array.from({ length: 16 }, (_, index) => ({
          file: { authority: 'workspace' as const, path: 'comic.epub' },
          selector: { kind: 'entry' as const, path: `images/page-${index + 1}.jpg` },
        }));
        const bytes = await sharp({
          create: { width: 600, height: 900, channels: 3, background: '#dddddd' },
        })
          .jpeg()
          .toBuffer();
        const definitions: Array<{
          name: string;
          output: {
            schema: unknown;
            render: (
              args: never,
              value: never,
            ) => readonly {
              type: string;
              attachment?: ImageAttachmentRef;
            }[];
          };
          execute: (args: unknown, execution: unknown) => Promise<unknown>;
        }> = [];
        const hostRead = vi.fn(
          async (request: { input: { source: (typeof sources)[number]; offset: number } }) => ({
            outcome: 'success',
            result: {
              source: request.input.source,
              offset: request.input.offset,
              totalBytes: bytes.length,
              mimeType: 'image/jpeg',
              data: bytes
                .subarray(
                  request.input.offset,
                  request.input.offset + CONTENT_IMAGE_DSH_CHUNK_BYTES,
                )
                .toString('base64'),
            },
          }),
        );
        const ctx = {
          effect: (register: () => () => void) => register(),
          inject: (_services: readonly string[], callback: (child: unknown) => void) =>
            callback(ctx),
          get: (service: string) =>
            service === 'llm'
              ? { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) }
              : undefined,
          attachments,
          tools: {
            register: (definition: (typeof definitions)[number]) => {
              definitions.push(definition);
              return () => undefined;
            },
          },
          opennekoHostTools: { execute: hostRead },
        };
        apply(ctx as never);
        const definition = definitions.find((entry) => entry.name === toolName);
        if (!definition) throw new Error('Image tool was not registered.');
        const args =
          toolName === 'openneko_read_images'
            ? { sources }
            : { source: sources[0], detail: 'original' };
        const result = await definition.execute(args, {
          signal: new AbortController().signal,
          agent: {
            options: { provider: 'fixture', model: 'vision' },
            session: { requestHeader: () => undefined },
          },
        });
        expect(save).toHaveBeenCalledTimes(1);
        const storedRef = await save.mock.results[0]!.value;
        expect(storedRef.mediaType).toBe('image/png');
        expect(storedRef.originalDimensions).toBeDefined();
        expect(result).toMatchObject({
          image: {
            mediaType: storedRef.mediaType,
            width: storedRef.width,
            height: storedRef.height,
            bytes: storedRef.bytes,
          },
        });
        expect(definition.output.schema).toMatchObject({
          properties: {
            image: {
              properties: {
                mediaType: { enum: expect.arrayContaining([storedRef.mediaType]) },
              },
            },
          },
        });
        const rendered = definition.output.render(args as never, result as never);
        const imageBlocks = rendered.filter((block) => block.type === 'image');
        expect(imageBlocks).toHaveLength(1);
        const ref = imageBlocks[0]?.attachment;
        if (!ref) throw new Error('Image tool did not render its attachment.');
        expect(hostRead).toHaveBeenCalledTimes(toolName === 'openneko_read_images' ? 16 : 1);

        const reopened = new LocalAttachmentStore(reopenedContext, config);
        const restoredRef: ImageAttachmentRef = JSON.parse(JSON.stringify(ref));
        const preview = await reopened.readImage(restoredRef);
        expect(await sharp(preview.data).metadata()).toMatchObject({
          format: 'png',
          width: ref.width,
          height: ref.height,
        });
        const modelInput = await reopened.readImageRequest(restoredRef, {
          maxPixels: 1_000_000,
          maxBytes: 1_000_000,
        });
        expect(modelInput.attachment).toEqual(ref);
        expect(modelInput.data.byteLength).toBeGreaterThan(0);
        await expect(reopened.readImage({ ...ref, mediaType: 'image/jpeg' })).rejects.toThrow(
          'Stored attachment metadata does not match its reference.',
        );
        await expect(reopened.readImage(restoredRef)).resolves.toMatchObject({ ref });
      } finally {
        await storeContext.fiber.dispose();
        await reopenedContext.fiber.dispose();
        await rm(home, { recursive: true, force: true });
      }
    },
  );
});
