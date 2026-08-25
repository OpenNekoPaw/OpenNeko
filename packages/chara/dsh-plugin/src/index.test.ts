import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Character DSH plugin', () => {
  it('registers exactly the Character Tool and delegates through the Host port', async () => {
    let definition:
      | {
          readonly name: string;
          readonly parameters: unknown;
          readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
        }
      | undefined;
    const execute = vi.fn(async () => ({
      outcome: 'success',
      result: { characterProjectId: 'character-1', displayName: 'Mira' },
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
    if (!definition) throw new Error('Character DSH Tool was not registered.');
    expect(definition.name).toBe('openneko.character');
    expect(definition.parameters).toMatchObject({
      properties: { operation: { enum: ['query', 'fill-draft'] } },
      required: ['operation', 'input'],
    });
    await expect(
      definition.execute({ operation: 'query', input: { characterProjectId: 'character-1' } }, {}),
    ).resolves.toEqual({ characterProjectId: 'character-1', displayName: 'Mira' });
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'openneko.character',
        operation: 'query',
        input: { characterProjectId: 'character-1' },
      },
      {},
    );
    await expect(
      definition.execute(
        {
          operation: 'query',
          input: { characterProjectId: 'character-1', activeCharacterId: 'other-character' },
        },
        {},
      ),
    ).rejects.toThrow(/activeCharacterId|unsupported/i);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('uses only the public DSH ToolRuntime and Host port', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/ctx\.tools\.register/);
    expect(source).not.toMatch(
      /@modelcontextprotocol|CharacterAuthoringService|try-next|fallback|node:fs/i,
    );
  });
});
