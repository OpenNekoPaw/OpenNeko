import { readFile } from 'node:fs/promises';
import { CONTENT_IMAGE_DSH_CHUNK_BYTES } from '@neko/content';
import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Document DSH plugin', () => {
  it('registers the canonical document Tool and delegates through Host', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly parameters: unknown;
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
    }> = [];
    const execute = vi.fn(async () => ({ outcome: 'success', result: { text: 'ok' } }));
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
      properties: { operation: { enum: ['read', 'continue', 'read-images'] } },
      required: ['operation', 'input'],
    });
    await definition.execute(
      {
        operation: 'read',
        input: {
          source: { file: { authority: 'workspace', path: 'neko/assets/Books/book.pdf' } },
        },
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
    const totalBytes = CONTENT_IMAGE_DSH_CHUNK_BYTES + 3;
    const attachments = attachmentStore(totalBytes);
    const execute = vi.fn(async (request: { readonly input: { readonly offset: number } }) => {
      const offset = request.input.offset;
      const bytes =
        offset === 0
          ? new Uint8Array(CONTENT_IMAGE_DSH_CHUNK_BYTES).fill(1)
          : new Uint8Array([2, 3, 4]);
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
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(([request]) => request.input.offset)).toEqual([
      0,
      CONTENT_IMAGE_DSH_CHUNK_BYTES,
    ]);
    const saved = attachments.saveImage.mock.calls[0]?.[0];
    expect(saved).toMatchObject({ mediaType: 'image/png', name: 'page.png' });
    expect(saved?.data).toHaveLength(totalBytes);
    expect(saved?.data.at(0)).toBe(1);
    expect(saved?.data.at(-1)).toBe(4);
    expect(definition.output.render({}, result as never)).toEqual([
      { type: 'text', text: `image/png image, 1x1 px, ${totalBytes} bytes` },
      {
        type: 'image',
        attachment: {
          attachmentId: 'attachment-1',
          mediaType: 'image/png',
          bytes: totalBytes,
          width: 1,
          height: 1,
          name: 'page.png',
        },
      },
    ]);
  });

  it('does not contain a direct filesystem or legacy Pi path', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(
      /ReadDocument|ReadImage|read_document|read_document_image|readFile|node:fs/,
    );
    expect(source).toMatch(/ctx\.tools\.register/);
  });
});

function attachmentStore(maxImageBytes = 1024) {
  return {
    imageLimits: {
      maxImageBytes,
      maxMessageImageBytes: maxImageBytes,
      maxImagesPerMessage: 4,
      maxImagePixels: 1024,
      maxImageDimension: 1024,
      mediaTypes: ['image/png'],
    },
    saveImage: vi.fn(
      async (input: {
        readonly data: Uint8Array;
        readonly mediaType: 'image/png';
        readonly name?: string;
      }) => ({
        attachmentId: 'attachment-1',
        mediaType: 'image/png' as const,
        bytes: input.data.byteLength,
        width: 1,
        height: 1,
        ...(input.name === undefined ? {} : { name: input.name }),
      }),
    ),
  };
}
