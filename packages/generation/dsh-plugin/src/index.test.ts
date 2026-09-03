import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { decodeGenerationDshToolInput } from '@neko/generation-domain';

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
    const execute = vi.fn(
      async (request: { readonly operation: unknown; readonly input: unknown }) => {
        decodeGenerationDshToolInput(request.operation, request.input);
        return { outcome: 'success' as const, result: { jobId: 'job-1' } };
      },
    );
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
    expect(definition.name).toBe('openneko_generation');
    expect(definition.parameters).toMatchObject({
      type: 'object',
      properties: {
        operation: { enum: ['submit', 'submit-comfyui', 'describe'] },
        input: {
          oneOf: expect.arrayContaining([
            expect.objectContaining({ title: 'describe input', required: ['jobId'] }),
            expect.objectContaining({
              title: 'ComfyUI workflow submit input',
              required: ['lifecycleMode', 'workflow', 'outputKind', 'inputBindings'],
              additionalProperties: false,
            }),
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
        tool: 'openneko_generation',
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
        tool: 'openneko_generation',
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
            purpose: 'image.generate',
            generationType: 'image-to-image',
            lifecycleMode: 'detached',
            request: {
              prompt: 'Preserve the character silhouette',
              operation: 'edit',
              referenceImageLocator: {
                file: { authority: 'workspace', path: 'books/volume.epub' },
                selector: { kind: 'entry', path: 'images/page-12.jpg' },
              },
            },
          },
        },
        {},
      ),
    ).resolves.toEqual({ jobId: 'job-1' });
    expect(execute).toHaveBeenLastCalledWith(
      {
        tool: 'openneko_generation',
        operation: 'submit',
        input: {
          purpose: 'image.generate',
          generationType: 'image-to-image',
          lifecycleMode: 'detached',
          request: {
            prompt: 'Preserve the character silhouette',
            operation: 'edit',
            referenceImageLocator: {
              file: { authority: 'workspace', path: 'books/volume.epub' },
              selector: { kind: 'entry', path: 'images/page-12.jpg' },
            },
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
            purpose: 'image.generate',
            generationType: 'image-to-image',
            lifecycleMode: 'detached',
            request: {
              prompt: 'Retired locator shape',
              operation: 'edit',
              referenceImageLocator: {
                kind: 'document-entry',
                file: { authority: 'workspace', path: 'books/volume.epub' },
                selector: { kind: 'entry', path: 'images/page-12.jpg' },
              },
            },
          },
        },
        {},
      ),
    ).rejects.toThrow(/input.*oneOf|oneOf|additional propert/iu);
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
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('uses only the public DSH ToolRuntime and Host port', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/ctx\.tools\.register/);
    expect(source).not.toMatch(
      /@modelcontextprotocol|CanvasProjectAuthoringService|PurposeGenerationJobPort|try-next|fallback/i,
    );
  });
});
