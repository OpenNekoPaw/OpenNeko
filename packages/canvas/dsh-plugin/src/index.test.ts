import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Canvas DSH plugin', () => {
  it('registers exactly the Canvas Tool and delegates through the Host port', async () => {
    let definition:
      | {
          readonly name: string;
          readonly parameters: unknown;
          readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
        }
      | undefined;
    const execute = vi.fn(async () => ({ outcome: 'success', result: { nodeId: 'node-1' } }));
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
    if (definition === undefined) throw new Error('Canvas DSH Tool was not registered.');
    expect(definition.name).toBe('openneko.canvas');
    expect(definition.parameters).toMatchObject({
      type: 'object',
      properties: {
        operation: { enum: ['query', 'create-node'] },
        input: {
          oneOf: [
            {
              title: 'query input',
              required: ['documentPath'],
              additionalProperties: false,
            },
            {
              title: 'create-node input',
              required: ['documentPath', 'expectedFingerprint', 'node'],
              additionalProperties: false,
            },
          ],
        },
      },
      required: ['operation', 'input'],
    });
    await expect(
      definition.execute({ operation: 'query', input: { documentPath: 'boards/story.nkc' } }, {}),
    ).resolves.toEqual({ nodeId: 'node-1' });
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'openneko.canvas',
        operation: 'query',
        input: { documentPath: 'boards/story.nkc' },
      },
      {},
    );
    await expect(
      definition.execute(
        {
          operation: 'query',
          input: { documentPath: 'boards/story.nkc', include: 'summary' },
        },
        {},
      ),
    ).rejects.toThrow(/input.*oneOf/i);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('uses only the public DSH ToolRuntime and Host port', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/ctx\.tools\.register/);
    expect(source).not.toMatch(
      /@modelcontextprotocol|CanvasProjectAuthoringService|PurposeGenerationJobPort|try-next|fallback/i,
    );
  });
});
