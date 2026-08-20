import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Document DSH plugin', () => {
  it('registers the canonical document Tool and delegates through Host', async () => {
    let definition:
      | {
          readonly name: string;
          readonly parameters: unknown;
          readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
        }
      | undefined;
    const execute = vi.fn(async () => ({ outcome: 'success', result: { text: 'ok' } }));
    const ctx = {
      effect: (register: () => () => void) => register(),
      tools: {
        register: vi.fn((value) => {
          definition = value;
          return () => undefined;
        }),
      },
      opennekoHostTools: { execute },
    };

    apply(ctx as never);
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

  it('does not contain a direct filesystem or legacy Pi path', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(
      /ReadDocument|ReadImage|read_document|read_document_image|readFile|node:fs/,
    );
    expect(source).toMatch(/ctx\.tools\.register/);
  });
});
