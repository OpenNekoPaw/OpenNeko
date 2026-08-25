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
    const definition = definitions.find((candidate) => candidate.name === 'openneko.document');
    if (!definition) throw new Error('Document DSH Tool was not registered.');
    expect(definition.name).toBe('openneko.document');
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
        tool: 'openneko.document',
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
        tool: 'openneko.document',
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
    const definition = definitions.find((candidate) => candidate.name === 'openneko.read_image');
    if (!definition) throw new Error('Content image DSH Tool was not registered.');
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
  });

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
    const definition = definitions.find((candidate) => candidate.name === 'openneko.read_image');
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

  it('fits a dimension-only oversized EPUB cover into the active attachment limit', async () => {
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
    const definition = definitions.find((candidate) => candidate.name === 'openneko.read_image');
    if (!definition) throw new Error('Content image DSH Tool was not registered.');
    const result = (await definition.execute(
      { source },
      {
        signal: new AbortController().signal,
        agent: {
          options: { provider: 'provider', model: 'vision-model' },
          session: { requestHeader: () => undefined },
        },
      },
    )) as {
      readonly source: unknown;
      readonly image: { readonly width: number; readonly height: number };
    };

    expect(result.source).toEqual(source);
    expect(result.image).toMatchObject({ width: 1399, height: 2000 });
    const saved = attachments.saveImage.mock.calls[0]?.[0];
    const savedMetadata = await sharp(saved?.data).metadata();
    expect(savedMetadata).toMatchObject({ format: 'jpeg', width: 1399, height: 2000 });
    expect(sourceBytes).toEqual(originalSourceBytes);
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
