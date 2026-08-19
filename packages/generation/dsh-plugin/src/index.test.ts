import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Generation DSH plugin', () => {
  it('registers exactly the Generation Tool and delegates through the Host port', async () => {
    let definition:
      | {
          readonly name: string;
          readonly parameters: unknown;
          readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
        }
      | undefined;
    const execute = vi.fn(async () => ({ outcome: 'success', result: { jobId: 'job-1' } }));
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
    if (definition === undefined) throw new Error('Generation DSH Tool was not registered.');
    expect(definition.name).toBe('openneko.generation');
    expect(definition.parameters).toMatchObject({
      type: 'object',
      properties: {
        operation: { enum: ['submit', 'describe'] },
        input: {
          oneOf: expect.arrayContaining([
            expect.objectContaining({ title: 'describe input', required: ['jobId'] }),
            expect.objectContaining({
              title: 'image submit input',
              required: ['purpose', 'lifecycleMode', 'generationType', 'request'],
              additionalProperties: false,
            }),
          ]),
        },
      },
      required: ['operation', 'input'],
    });
    await expect(
      definition.execute({ operation: 'describe', input: { jobId: 'job-1' } }, {}),
    ).resolves.toEqual({ jobId: 'job-1' });
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'openneko.generation',
        operation: 'describe',
        input: { jobId: 'job-1' },
      },
      {},
    );
    await expect(
      definition.execute(
        {
          operation: 'submit',
          input: {
            purpose: 'image.generate',
            generationType: 'text-to-image',
            lifecycleMode: 'detached',
            request: {
              prompt: 'A quiet harbor',
              negativePrompt: 'text',
              operation: 'generate',
              count: 1,
              aspectRatio: '4:3',
            },
          },
        },
        {},
      ),
    ).resolves.toEqual({ jobId: 'job-1' });
    expect(execute).toHaveBeenLastCalledWith(
      {
        tool: 'openneko.generation',
        operation: 'submit',
        input: {
          purpose: 'image.generate',
          generationType: 'text-to-image',
          lifecycleMode: 'detached',
          request: {
            prompt: 'A quiet harbor',
            negativePrompt: 'text',
            operation: 'generate',
            count: 1,
            aspectRatio: '4:3',
          },
        },
      },
      {},
    );
    await expect(
      definition.execute(
        {
          operation: 'submit',
          input: {
            prompt: 'A quiet harbor',
            negative_prompt: 'text',
            operation: 'generate',
            count: 1,
            aspect_ratio: '4:3',
          },
        },
        {},
      ),
    ).rejects.toThrow(/input.*oneOf|oneOf/i);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('uses only the public DSH ToolRuntime and Host port', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/ctx\.tools\.register/);
    expect(source).not.toMatch(
      /@modelcontextprotocol|CanvasProjectAuthoringService|PurposeGenerationJobPort|try-next|fallback/i,
    );
  });
});
