import { readFile } from 'node:fs/promises';
import type { DshAcpDomainToolResponse } from '@neko/agent-contracts/dsh-acp';
import { CONTENT_IMAGE_DSH_CHUNK_BYTES } from '@neko/content-domain';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Document DSH plugin', () => {
  it('registers the canonical document Tool and delegates through Host', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly parameters: unknown;
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
    }> = [];
    let hostResponse: DshAcpDomainToolResponse = {
      outcome: 'success',
      result: { text: 'ok' },
    };
    const execute = vi.fn(async () => hostResponse);
    const ctx = {
      effect: (register: () => () => void) => register(),
      inject: (_services: readonly string[], callback: (child: unknown) => void) => callback(ctx),
      get: vi.fn(),
      attachments: attachmentStore(),
      tools: {
        register: vi.fn((value) => {
          definitions.push(value);
          return () => undefined;
        }),
      },
      opennekoHostTools: { execute },
    };

    apply(ctx as never);
    const definition = definitions.find((candidate) => candidate.name === 'openneko_document');
    if (!definition) throw new Error('Document DSH Tool was not registered.');
    expect(definition.name).toBe('openneko_document');
    expect(definition.parameters).toMatchObject({
      properties: {
        operation: { enum: ['read', 'continue', 'read-images'] },
        source: { type: 'object' },
      },
      required: ['operation', 'source'],
    });
    expect(definition.parameters).not.toHaveProperty('properties.input');
    await definition.execute(
      {
        operation: 'read',
        source: { file: { authority: 'workspace', path: 'neko/assets/Books/book.pdf' } },
      },
      {},
    );
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'openneko_document',
        operation: 'read',
        input: {
          source: { file: { authority: 'workspace', path: 'neko/assets/Books/book.pdf' } },
        },
      },
      {},
    );

    const selectedSource = {
      file: { authority: 'workspace' as const, path: 'neko/assets/Books/book.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };
    await definition.execute(
      { operation: 'read', source: selectedSource, mode: 'content', maxChars: 4_000 },
      {},
    );
    expect(execute).toHaveBeenLastCalledWith(
      {
        tool: 'openneko_document',
        operation: 'read',
        input: { source: selectedSource, mode: 'content', maxChars: 4_000 },
      },
      {},
    );

    hostResponse = {
      outcome: 'failure',
      diagnostic: { code: 'content-missing', message: 'Document content is unavailable.' },
    };
    await expect(
      definition.execute(
        {
          operation: 'read-images',
          source: { file: { authority: 'workspace', path: 'neko/assets/Books/missing.pdf' } },
        },
        {},
      ),
    ).rejects.toThrow('content-missing: Document content is unavailable.');

    await expect(
      definition.execute(
        {
          operation: 'read',
          source: { file: { authority: 'workspace', path: 'neko/assets/Books/book.pdf' } },
          input: { mode: 'manifest' },
        },
        {},
      ),
    ).rejects.toThrow(/arguments\.input is not supported/u);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('reads a Content locator into a durable DSH image result', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly description: string;
      readonly output: { readonly render: (args: unknown, value: never) => unknown };
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
      readonly isConcurrencySafe?: (args: unknown) => boolean;
    }> = [];
    const source = {
      file: { authority: 'workspace' as const, path: 'story.epub' },
      selector: { kind: 'entry' as const, path: 'OEBPS/images/page.png' },
    };
    const sourceBytes = await createNoisePng(512, 512);
    const totalBytes = sourceBytes.byteLength;
    expect(totalBytes).toBeGreaterThan(CONTENT_IMAGE_DSH_CHUNK_BYTES);
    const attachments = attachmentStore(totalBytes);
    const execute = vi.fn(async (request: { readonly input: { readonly offset: number } }) => {
      const offset = request.input.offset;
      const bytes = sourceBytes.slice(
        offset,
        Math.min(offset + CONTENT_IMAGE_DSH_CHUNK_BYTES, totalBytes),
      );
      return {
        outcome: 'success' as const,
        result: {
          source,
          offset,
          totalBytes,
          mimeType: 'image/png',
          data: Buffer.from(bytes).toString('base64'),
        },
      };
    });
    const llm = {
      resolveModelInfo: vi.fn(async () => ({ inputModalities: ['text', 'image'] })),
    };
    const ctx = {
      effect: (register: () => () => void) => register(),
      inject: (_services: readonly string[], callback: (child: unknown) => void) => callback(ctx),
      get: (service: string) => (service === 'llm' ? llm : undefined),
      attachments,
      tools: {
        register: vi.fn((value) => {
          definitions.push(value);
          return () => undefined;
        }),
      },
      opennekoHostTools: { execute },
    };

    apply(ctx as never);
    const definition = definitions.find((candidate) => candidate.name === 'openneko_read_image');
    if (!definition) throw new Error('Content image DSH Tool was not registered.');
    expect(definition.description).toContain('never pass a chapter, XHTML, HTML');
    expect(definition.isConcurrencySafe?.({ source })).toBe(false);
    const execution = {
      signal: new AbortController().signal,
      agent: {
        options: { provider: 'provider', model: 'vision-model' },
        session: { requestHeader: () => undefined },
      },
    };
    const result = await definition.execute({ source }, execution);
    const expectedOffsets = Array.from(
      { length: Math.ceil(totalBytes / CONTENT_IMAGE_DSH_CHUNK_BYTES) },
      (_, index) => index * CONTENT_IMAGE_DSH_CHUNK_BYTES,
    );
    expect(execute).toHaveBeenCalledTimes(expectedOffsets.length);
    expect(execute.mock.calls.map(([request]) => request.input.offset)).toEqual(expectedOffsets);
    const saved = attachments.saveImage.mock.calls[0]?.[0];
    expect(saved).toMatchObject({ mediaType: 'image/png', name: 'page.png' });
    expect(saved?.data).toHaveLength(totalBytes);
    expect(saved?.data).toEqual(sourceBytes);
    expect(definition.output.render({}, result as never)).toEqual([
      { type: 'text', text: `image/png image, 512x512 px, ${totalBytes} bytes` },
      {
        type: 'image',
        attachment: {
          attachmentId: 'attachment-1',
          mediaType: 'image/png',
          bytes: totalBytes,
          width: 512,
          height: 512,
          name: 'page.png',
        },
      },
    ]);
    expect(result).toMatchObject({ source, detail: 'original' });
  }, 10_000);

  it('rejects a text-only current model before reading Content bytes', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
    }> = [];
    const execute = vi.fn();
    const ctx = {
      effect: (register: () => () => void) => register(),
      inject: (_services: readonly string[], callback: (child: unknown) => void) => callback(ctx),
      get: (service: string) =>
        service === 'llm'
          ? { resolveModelInfo: vi.fn(async () => ({ inputModalities: ['text'] })) }
          : undefined,
      attachments: attachmentStore(),
      tools: {
        register: vi.fn((value) => {
          definitions.push(value);
          return () => undefined;
        }),
      },
      opennekoHostTools: { execute },
    };

    apply(ctx as never);
    const definition = definitions.find((candidate) => candidate.name === 'openneko_read_image');
    if (!definition) throw new Error('Content image DSH Tool was not registered.');
    await expect(
      definition.execute(
        {
          source: {
            file: { authority: 'workspace', path: 'story.epub' },
            selector: { kind: 'entry', path: 'OEBPS/images/page.png' },
          },
        },
        {
          signal: new AbortController().signal,
          agent: {
            options: { provider: 'provider', model: 'text-model' },
            session: { requestHeader: () => undefined },
          },
        },
      ),
    ).rejects.toThrow(
      'current Agent model "text-model" does not declare image input. Select an image-capable Agent model and retry.',
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses a bounded overview before preserving the selected original detail', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
    }> = [];
    const source = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: 'image/cover.jpg' },
    };
    const sourceBytes = new Uint8Array(
      await sharp({
        create: {
          width: 1511,
          height: 2160,
          channels: 3,
          background: { r: 32, g: 64, b: 96 },
        },
      })
        .jpeg()
        .toBuffer(),
    );
    const originalSourceBytes = sourceBytes.slice();
    const attachments = attachmentStore(sourceBytes.byteLength * 2, {
      maxImageDimension: 2_000,
      maxImagePixels: 40_000_000,
    });
    const execute = vi.fn(async (request: { readonly input: { readonly offset: number } }) => {
      const offset = request.input.offset;
      const bytes = sourceBytes.slice(
        offset,
        Math.min(offset + CONTENT_IMAGE_DSH_CHUNK_BYTES, sourceBytes.byteLength),
      );
      return {
        outcome: 'success' as const,
        result: {
          source,
          offset,
          totalBytes: sourceBytes.byteLength,
          mimeType: 'image/jpeg',
          data: Buffer.from(bytes).toString('base64'),
        },
      };
    });
    const ctx = {
      effect: (register: () => () => void) => register(),
      inject: (_services: readonly string[], callback: (child: unknown) => void) => callback(ctx),
      get: (service: string) =>
        service === 'llm'
          ? { resolveModelInfo: vi.fn(async () => ({ inputModalities: ['text', 'image'] })) }
          : undefined,
      attachments,
      tools: {
        register: vi.fn((value) => {
          definitions.push(value);
          return () => undefined;
        }),
      },
      opennekoHostTools: { execute },
    };

    apply(ctx as never);
    const definition = definitions.find((candidate) => candidate.name === 'openneko_read_image');
    if (!definition) throw new Error('Content image DSH Tool was not registered.');
    const execution = {
      signal: new AbortController().signal,
      agent: {
        options: { provider: 'provider', model: 'vision-model' },
        session: { requestHeader: () => undefined },
      },
    };
    const overview = (await definition.execute({ source, detail: 'overview' }, execution)) as {
      readonly source: unknown;
      readonly detail: string;
      readonly image: { readonly width: number; readonly height: number };
    };
    const original = (await definition.execute({ source, detail: 'original' }, execution)) as {
      readonly source: unknown;
      readonly detail: string;
      readonly image: { readonly width: number; readonly height: number };
    };

    expect(overview).toMatchObject({
      source,
      detail: 'overview',
      image: { width: 537, height: 768 },
    });
    expect(original).toMatchObject({
      source,
      detail: 'original',
      image: { width: 1399, height: 2000 },
    });
    const overviewSaved = attachments.saveImage.mock.calls[0]?.[0];
    const overviewMetadata = await sharp(overviewSaved?.data).metadata();
    expect(overviewMetadata).toMatchObject({ format: 'jpeg', width: 537, height: 768 });
    const originalSaved = attachments.saveImage.mock.calls[1]?.[0];
    const originalMetadata = await sharp(originalSaved?.data).metadata();
    expect(originalMetadata).toMatchObject({ format: 'jpeg', width: 1399, height: 2000 });
    expect(sourceBytes).toEqual(originalSourceBytes);
  });

  it.each([
    [1, 1024, 4_000_000],
    [2, 1024, 4_000_000],
    [3, 1024, 4_000_000],
    [4, 1024, 4_000_000],
    [5, 1024, 4_000_000],
    [10, 1024, 4_000_000],
    [16, 4096, 20_000_000],
    [8, 2048, 20_000_000],
    [16, 4096, 1_000_000],
  ])(
    'returns %i authorized images as ONE sheet within dimension %i and pixel %i limits',
    async (count, dimensionLimit, pixelLimit) => {
      const definitions: Array<{
        readonly name: string;
        readonly description: string;
        readonly output: { readonly render: (args: unknown, value: never) => unknown };
        readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
        readonly isConcurrencySafe?: (args: unknown) => boolean;
      }> = [];
      const sources = Array.from({ length: count }, (_, index) => ({
        file: { authority: 'workspace' as const, path: 'books/blame.epub' },
        selector: { kind: 'entry' as const, path: `image/page-${index + 1}.jpg` },
      }));
      const images = await Promise.all(
        sources.map(
          async (_source, index) =>
            new Uint8Array(
              await sharp({
                create: {
                  width: 360 + index * 20,
                  height: 520,
                  channels: 3,
                  background: { r: 30 + index * 10, g: 40, b: 50 },
                },
              })
                .jpeg()
                .toBuffer(),
            ),
        ),
      );
      const attachments = attachmentStore(4 * 1024 * 1024, {
        maxImageDimension: dimensionLimit,
        maxImagePixels: pixelLimit,
      });
      const execute = vi.fn(
        async (request: {
          readonly input: { readonly source: (typeof sources)[number]; readonly offset: number };
        }) => {
          const sourceIndex = sources.findIndex(
            (source) => source.selector.path === request.input.source.selector.path,
          );
          if (sourceIndex < 0) throw new Error('Unexpected source.');
          const image = images[sourceIndex]!;
          const offset = request.input.offset;
          const bytes = image.slice(
            offset,
            Math.min(offset + CONTENT_IMAGE_DSH_CHUNK_BYTES, image.byteLength),
          );
          return {
            outcome: 'success' as const,
            result: {
              source: sources[sourceIndex],
              offset,
              totalBytes: image.byteLength,
              mimeType: 'image/jpeg',
              data: Buffer.from(bytes).toString('base64'),
            },
          };
        },
      );
      const ctx = {
        effect: (register: () => () => void) => register(),
        inject: (_services: readonly string[], callback: (child: unknown) => void) => callback(ctx),
        get: (service: string) =>
          service === 'llm'
            ? { resolveModelInfo: vi.fn(async () => ({ inputModalities: ['text', 'image'] })) }
            : undefined,
        attachments,
        tools: {
          register: vi.fn((value) => {
            definitions.push(value);
            return () => undefined;
          }),
        },
        opennekoHostTools: { execute },
      };

      apply(ctx as never);
      const definition = definitions.find((candidate) => candidate.name === 'openneko_read_images');
      if (!definition) throw new Error('Content image overview DSH Tool was not registered.');
      expect(definition.description).toContain('never pass chapter, XHTML, HTML');
      expect(definition.isConcurrencySafe?.({ sources })).toBe(false);
      const result = (await definition.execute(
        { sources },
        {
          signal: new AbortController().signal,
          agent: {
            options: { provider: 'provider', model: 'vision-model' },
            session: { requestHeader: () => undefined },
          },
        },
      )) as {
        readonly slots: readonly { readonly label: string; readonly source: unknown }[];
        readonly image: { readonly width: number; readonly height: number };
      };

      expect(execute).toHaveBeenCalledTimes(count);
      expect(result.slots).toEqual(
        sources.map((source, index) => ({
          label: String(index + 1),
          source,
        })),
      );
      const columns = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / columns);
      const width = Math.min(768 * columns, dimensionLimit, Math.floor(Math.sqrt(pixelLimit)));
      const height = Math.floor((width * rows) / columns);
      expect(result.image).toMatchObject({ width, height });
      expect(width * height).toBeLessThanOrEqual(pixelLimit);
      expect(attachments.saveImage).toHaveBeenCalledTimes(1);
      const saved = attachments.saveImage.mock.calls[0]?.[0];
      expect(saved).toMatchObject({
        mediaType: 'image/jpeg',
        name: 'openneko-image-overview.jpg',
      });
      expect(await sharp(saved?.data).metadata()).toMatchObject({
        format: 'jpeg',
        width,
        height,
      });
      const pixels = await sharp(saved?.data).removeAlpha().raw().toBuffer();
      const cellWidth = Math.floor(width / columns);
      const cellHeight = Math.floor(height / rows);
      for (let index = 0; index < count; index += 1) {
        const x = (index % columns) * cellWidth + Math.floor(cellWidth / 2);
        const y = Math.floor(index / columns) * cellHeight + Math.floor(cellHeight / 2);
        expect(Math.abs(pixels[(y * width + x) * 3]! - (30 + index * 10))).toBeLessThan(6);
      }
      const rendered = definition.output.render({}, result as never) as readonly unknown[];
      expect(rendered).toHaveLength(2);
      expect(rendered[0]).toMatchObject({ type: 'text' });
      expect(rendered[1]).toMatchObject({ type: 'image' });
    },
  );

  it('fails an overview batch before publishing a partial contact sheet', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
    }> = [];
    const sources = Array.from({ length: 16 }, (_, index) => ({
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: `image/page-${index + 1}.jpg` },
    }));
    const image = new Uint8Array(
      await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#222' },
      })
        .jpeg()
        .toBuffer(),
    );
    const attachments = attachmentStore(1024 * 1024);
    const execute = vi.fn(
      async (request: { readonly input: { readonly source: (typeof sources)[number] } }) =>
        request.input.source.selector.path === 'image/page-16.jpg'
          ? {
              outcome: 'failure' as const,
              diagnostic: { code: 'content-denied', message: 'Image is not authorized.' },
            }
          : {
              outcome: 'success' as const,
              result: {
                source: request.input.source,
                offset: 0,
                totalBytes: image.byteLength,
                mimeType: 'image/jpeg',
                data: Buffer.from(image).toString('base64'),
              },
            },
    );
    const ctx = {
      effect: (register: () => () => void) => register(),
      inject: (_services: readonly string[], callback: (child: unknown) => void) => callback(ctx),
      get: (service: string) =>
        service === 'llm'
          ? { resolveModelInfo: vi.fn(async () => ({ inputModalities: ['text', 'image'] })) }
          : undefined,
      attachments,
      tools: {
        register: vi.fn((value) => {
          definitions.push(value);
          return () => undefined;
        }),
      },
      opennekoHostTools: { execute },
    };

    apply(ctx as never);
    const definition = definitions.find((candidate) => candidate.name === 'openneko_read_images');
    if (!definition) throw new Error('Content image overview DSH Tool was not registered.');
    const execution = {
      signal: new AbortController().signal,
      agent: {
        options: { provider: 'provider', model: 'vision-model' },
        session: { requestHeader: () => undefined },
      },
    };
    await expect(definition.execute({ sources }, execution)).rejects.toThrow(
      'Content image overview slot 16 failed: content-denied',
    );
    expect(execute).toHaveBeenCalledTimes(16);
    expect(attachments.saveImage).not.toHaveBeenCalled();
    await expect(definition.execute({ sources: [sources[0]] }, execution)).resolves.toMatchObject({
      slots: [{ label: '1', source: sources[0] }],
    });
    expect(attachments.saveImage).toHaveBeenCalledTimes(1);
  });

  it('does not contain a direct filesystem or legacy Pi path', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(
      /ReadDocument|ReadImage|read_document|read_document_image|readFile|node:fs/,
    );
    expect(source).toMatch(/ctx\.tools\.register/);
  });
});

function attachmentStore(
  maxImageBytes = 1024,
  options: { readonly maxImagePixels?: number; readonly maxImageDimension?: number } = {},
) {
  return {
    imageLimits: {
      maxImageBytes,
      maxMessageImageBytes: maxImageBytes,
      maxImagesPerMessage: 4,
      maxImagePixels: options.maxImagePixels ?? 1_000_000,
      maxImageDimension: options.maxImageDimension ?? 1024,
      mediaTypes: ['image/png', 'image/jpeg'],
    },
    saveImage: vi.fn(
      async (input: {
        readonly data: Uint8Array;
        readonly mediaType: 'image/png' | 'image/jpeg';
        readonly name?: string;
      }) => {
        const metadata = await sharp(input.data).metadata();
        if (metadata.width === undefined || metadata.height === undefined) {
          throw new Error('Saved test image has no dimensions.');
        }
        return {
          attachmentId: 'attachment-1',
          mediaType: input.mediaType,
          bytes: input.data.byteLength,
          width: metadata.width,
          height: metadata.height,
          ...(input.name === undefined ? {} : { name: input.name }),
        };
      },
    ),
  };
}

async function createNoisePng(width: number, height: number): Promise<Uint8Array> {
  const data = new Uint8Array(width * height * 3);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (index * 73 + Math.floor(index / 97)) % 256;
  }
  return new Uint8Array(
    await sharp(data, { raw: { width, height, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer(),
  );
}
