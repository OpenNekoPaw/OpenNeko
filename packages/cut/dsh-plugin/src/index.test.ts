import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Cut DSH plugin', () => {
  it('registers exactly the Cut Tool and delegates through the Host port', async () => {
    let definition:
      | {
          readonly name: string;
          readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
        }
      | undefined;
    const execute = vi.fn(async () => ({
      outcome: 'success',
      result: { documentPath: 'cuts/story.otio' },
    }));
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
    if (definition === undefined) throw new Error('Cut DSH Tool was not registered.');
    expect(definition.name).toBe('openneko_cut');
    await expect(
      definition.execute({ operation: 'query', input: { documentPath: 'cuts/story.otio' } }, {}),
    ).resolves.toEqual({ documentPath: 'cuts/story.otio' });
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'openneko_cut',
        operation: 'query',
        input: { documentPath: 'cuts/story.otio' },
      },
      {},
    );
  });

  it('uses only the public DSH ToolRuntime and Host port', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/ctx\.tools\.register/);
    expect(source).not.toMatch(
      /@modelcontextprotocol|CutProjectAuthoringService|CutApplicationRuntime|try-next|fallback/i,
    );
  });
});
