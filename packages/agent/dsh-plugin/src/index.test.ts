import type { DshAcpDomainToolResponse } from '@neko/agent-contracts/dsh-acp';
import { describe, expect, it, vi } from 'vitest';

import { apply } from './index';

describe('OpenNeko Agent DSH plugin', () => {
  it('registers one approval-gated CreateSkill Tool and delegates through Host', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly parameters: unknown;
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
    }> = [];
    let gate:
      | ((
          execution: { readonly name: string },
          next: () => Promise<{ readonly kind: 'allow' }>,
        ) => Promise<unknown>)
      | undefined;
    const execute = vi.fn(async (): Promise<DshAcpDomainToolResponse> => ({
      outcome: 'success',
      result: {
        status: 'ready',
        name: 'sample-skill',
        layout: 'directory',
        source: 'project-agents',
        provider: 'local',
      },
    }));
    const ctx = {
      effect: (register: () => () => void) => register(),
      on: vi.fn((_event, listener) => {
        gate = listener;
        return () => undefined;
      }),
      tools: {
        register: vi.fn((definition) => {
          definitions.push(definition);
          return () => undefined;
        }),
      },
      opennekoHostTools: { execute },
    };

    apply(ctx as never);
    expect(definitions.map((definition) => definition.name)).toEqual(['CreateSkill']);
    expect(await gate?.({ name: 'CreateSkill' }, async () => ({ kind: 'allow' }))).toEqual({
      kind: 'ask',
      reason: 'Create a new DSH Skill in the exact current Conversation scope.',
    });
    expect(await gate?.({ name: 'other' }, async () => ({ kind: 'allow' }))).toEqual({
      kind: 'allow',
    });

    await expect(
      definitions[0]?.execute(
        {
          layout: 'directory',
          skillMarkdown: '---\nname: sample-skill\ndescription: Sample.\n---\n# Sample',
          resources: [],
        },
        {},
      ),
    ).resolves.toMatchObject({ status: 'ready', name: 'sample-skill' });
    expect(execute).toHaveBeenCalledWith(
      {
        tool: 'CreateSkill',
        operation: 'create',
        input: {
          layout: 'directory',
          skillMarkdown: '---\nname: sample-skill\ndescription: Sample.\n---\n# Sample',
          resources: [],
        },
      },
      {},
    );
  });
});
