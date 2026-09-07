import type { DshAcpDomainToolResponse } from '@neko/agent-contracts/dsh-acp';
import { describe, expect, it, vi } from 'vitest';

import { apply, nativeTextFileDenial } from './index';

describe('OpenNeko Agent DSH plugin', () => {
  it('registers one approval-gated CreateSkill Tool and delegates through Host', async () => {
    const definitions: Array<{
      readonly name: string;
      readonly parameters: unknown;
      readonly execute: (args: unknown, execution: unknown) => Promise<unknown>;
    }> = [];
    const gates: Array<
      (
        execution: { readonly name: string },
        next: () => Promise<{ readonly kind: 'allow' }>,
      ) => Promise<unknown>
    > = [];
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
        gates.push(listener);
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
    expect(await gates[0]?.({ name: 'CreateSkill' }, async () => ({ kind: 'allow' }))).toEqual({
      kind: 'ask',
      reason: 'Create a new DSH Skill in the exact current Conversation scope.',
    });
    expect(await gates[0]?.({ name: 'other' }, async () => ({ kind: 'allow' }))).toEqual({
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

  it('confines native text tools to the exact calling Session Workspace', async () => {
    const signal = new AbortController().signal;
    const fs = {
      resolve: vi.fn(async (path: string, options?: { readonly cwd?: string }) => ({
        targetKey: path,
        displayPath:
          path === 'notes/link.md'
            ? '/outside/linked.md'
            : options?.cwd === undefined || path.startsWith('/')
              ? path
              : `${options.cwd}/${path}`,
      })),
      contains: vi.fn(
        (parent: { readonly displayPath: string }, child: { readonly displayPath: string }) =>
          child.displayPath === parent.displayPath ||
          child.displayPath.startsWith(`${parent.displayPath}/`),
      ),
    };
    const agent = { session: { header: { cwd: '/workspace/one' } } } as never;

    await expect(
      nativeTextFileDenial(fs as never, {
        name: 'write',
        arguments: { file_path: 'notes/plan.md', content: '# Plan' },
        agent,
        signal,
      }),
    ).resolves.toBeUndefined();
    await expect(
      nativeTextFileDenial(fs as never, {
        name: 'read',
        arguments: { file_path: '/workspace/two/private.md' },
        agent,
        signal,
      }),
    ).resolves.toContain('outside the exact Session Workspace');
    await expect(
      nativeTextFileDenial(fs as never, {
        name: 'write',
        arguments: { file_path: '/workspace/one/notes/plan.md', content: '# Plan' },
        agent,
        signal,
      }),
    ).resolves.toContain('normalized Workspace-relative file_path');
    await expect(
      nativeTextFileDenial(fs as never, {
        name: 'edit',
        arguments: { file_path: 'notes/link.md', old_string: 'before', new_string: 'after' },
        agent,
        signal,
      }),
    ).resolves.toContain('outside the exact Session Workspace');
    expect(fs.resolve).toHaveBeenCalledWith('notes/plan.md', {
      cwd: '/workspace/one',
      signal,
    });
  });

  it.each(['read', 'write', 'edit'])(
    'rejects protected projects through native %s',
    async (name) => {
      const signal = new AbortController().signal;
      const fs = {
        resolve: vi.fn(async (path: string, options?: { readonly cwd?: string }) => ({
          targetKey: path,
          displayPath:
            options?.cwd === undefined || path.startsWith('/') ? path : `${options.cwd}/${path}`,
        })),
        contains: vi.fn(() => true),
      };

      await expect(
        nativeTextFileDenial(fs as never, {
          name,
          arguments: { file_path: name === 'read' ? 'boards/main.NKC' : 'cuts/main.OTIO' },
          agent: { session: { header: { cwd: '/workspace/one' } } } as never,
          signal,
        }),
      ).resolves.toMatch(/protected structured project format/u);
    },
  );

  it('leaves unrelated DSH and owning-domain tools outside the generic file policy', async () => {
    await expect(
      nativeTextFileDenial({} as never, {
        name: 'openneko_canvas',
        arguments: { operation: 'inspect' },
        signal: new AbortController().signal,
      }),
    ).resolves.toBeUndefined();
  });
});
