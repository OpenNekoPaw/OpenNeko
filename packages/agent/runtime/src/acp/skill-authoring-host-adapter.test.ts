import { describe, expect, it, vi } from 'vitest';

import { SkillAuthoringDshHostAdapter } from './skill-authoring-host-adapter';

describe('Skill authoring DSH Host adapter', () => {
  it('resolves the exact Session context and delegates a strict package', async () => {
    const create = vi.fn(async () => ({
      status: 'ready' as const,
      name: 'sample-skill',
      layout: 'directory' as const,
      source: 'project-agents',
      provider: 'local',
    }));
    const adapter = new SkillAuthoringDshHostAdapter({
      contexts: {
        resolve: vi.fn(async () => ({
          conversationId: 'conversation:one',
          binding: {
            kind: 'workspace' as const,
            workspaceId: 'workspace:one',
            workspaceGrantId: 'grant:one',
          },
        })),
      },
      service: { create },
    });

    await expect(
      adapter.execute(
        {
          sessionId: 'dsh:one',
          turn: 1,
          toolCallId: 'call:one',
          sandboxMode: 'workspace-write',
          tool: 'CreateSkill',
          operation: 'create',
          input: {
            layout: 'directory',
            skillMarkdown: '---\nname: sample-skill\ndescription: Sample.\n---\n# Sample\n',
            resources: [],
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ outcome: 'success', result: { name: 'sample-skill' } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'dsh:one',
        context: expect.objectContaining({ workspaceId: 'workspace:one' }),
      }),
    );
  });

  it('denies read-only execution before resolving Conversation authority', async () => {
    const resolve = vi.fn();
    const create = vi.fn();
    const adapter = new SkillAuthoringDshHostAdapter({
      contexts: { resolve },
      service: { create },
    });

    await expect(
      adapter.execute(
        {
          sessionId: 'dsh:one',
          turn: 1,
          toolCallId: 'call:one',
          sandboxMode: 'read-only',
          tool: 'CreateSkill',
          operation: 'create',
          input: { layout: 'directory', skillMarkdown: '# Sample', resources: [] },
        },
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'SKILL_AUTHORING_WRITE_DENIED',
        message: 'CreateSkill requires a writable DSH permission preset.',
      },
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
