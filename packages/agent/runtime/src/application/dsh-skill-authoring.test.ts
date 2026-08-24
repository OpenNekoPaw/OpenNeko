import { describe, expect, it, vi } from 'vitest';

import { DshSkillAuthoringService } from './dsh-skill-authoring';

const packageInput = {
  layout: 'directory' as const,
  skillMarkdown: '---\nname: sample-skill\ndescription: Sample.\n---\n# Sample',
  resources: [],
};

describe('DSH Skill authoring service', () => {
  it('resolves authority before staging and reports the exact observed winner', async () => {
    const order: string[] = [];
    const discard = vi.fn(async () => order.push('discard'));
    const service = new DshSkillAuthoringService({
      targets: {
        resolve: vi.fn(async () => {
          order.push('target');
          return {
            kind: 'workspace' as const,
            workspaceId: 'workspace-1',
            workspaceGrantId: 'grant-1',
            expectedSource: 'project-agents' as const,
          };
        }),
      },
      staging: {
        stage: vi.fn(async () => {
          order.push('stage');
          return { stagingId: 'staging-1' };
        }),
        publish: vi.fn(async () => order.push('publish')),
        discard,
      },
      validation: {
        validate: vi.fn(async () => {
          order.push('validate');
          return { name: 'sample-skill' };
        }),
      },
      catalog: {
        observe: vi.fn(async () => {
          order.push('observe');
          return {
            complete: true,
            skill: {
              name: 'sample-skill',
              source: 'project-agents',
              provider: 'local',
              userInvocable: true,
              modelInvocable: true,
            },
          };
        }),
      },
    });

    await expect(
      service.create({
        sessionId: 'dsh-1',
        context: { kind: 'workspace', workspaceId: 'workspace-1', workspaceGrantId: 'grant-1' },
        package: packageInput,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: 'ready',
      name: 'sample-skill',
      layout: 'directory',
      source: 'project-agents',
      provider: 'local',
    });
    expect(order).toEqual(['target', 'stage', 'validate', 'publish', 'observe', 'discard']);
  });

  it('cleans staging after validation failure without publishing', async () => {
    const publish = vi.fn();
    const discard = vi.fn(async () => undefined);
    const service = new DshSkillAuthoringService({
      targets: {
        resolve: vi.fn(async () => ({
          kind: 'personal' as const,
          assistantSpaceId: 'assistant-1',
          expectedSource: 'user-dsh' as const,
        })),
      },
      staging: {
        stage: vi.fn(async () => ({ stagingId: 'staging-1' })),
        publish,
        discard,
      },
      validation: { validate: vi.fn(async () => Promise.reject(new Error('DSH rejected'))) },
      catalog: { observe: vi.fn() },
    });

    await expect(
      service.create({
        sessionId: 'dsh-1',
        context: { kind: 'assistant', assistantSpaceId: 'assistant-1', baseGrantIds: [] },
        package: packageInput,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('DSH rejected');
    expect(publish).not.toHaveBeenCalled();
    expect(discard).toHaveBeenCalledWith({ stagingId: 'staging-1' });
  });

  it('reports a higher-priority winner as shadowing the created package', async () => {
    const service = new DshSkillAuthoringService({
      targets: {
        resolve: vi.fn(async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          expectedSource: 'project-agents' as const,
        })),
      },
      staging: {
        stage: vi.fn(async () => ({ stagingId: 'staging-1' })),
        publish: vi.fn(async () => undefined),
        discard: vi.fn(async () => undefined),
      },
      validation: { validate: vi.fn(async () => ({ name: 'sample-skill' })) },
      catalog: {
        observe: vi.fn(async () => ({
          complete: true,
          skill: {
            name: 'sample-skill',
            source: 'project-dsh',
            provider: 'local',
            userInvocable: true,
            modelInvocable: true,
          },
        })),
      },
    });

    await expect(
      service.create({
        sessionId: 'dsh-1',
        context: { kind: 'workspace', workspaceId: 'workspace-1', workspaceGrantId: 'grant-1' },
        package: packageInput,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'created-shadowed', source: 'project-dsh' });
  });

  it('preserves both the operation and cleanup failures', async () => {
    const service = new DshSkillAuthoringService({
      targets: {
        resolve: vi.fn(async () => ({
          kind: 'personal' as const,
          assistantSpaceId: 'assistant-1',
          expectedSource: 'user-dsh' as const,
        })),
      },
      staging: {
        stage: vi.fn(async () => ({ stagingId: 'staging-1' })),
        publish: vi.fn(),
        discard: vi.fn(async () => Promise.reject(new Error('cleanup failed'))),
      },
      validation: { validate: vi.fn(async () => Promise.reject(new Error('validation failed'))) },
      catalog: { observe: vi.fn() },
    });

    const failure = await service
      .create({
        sessionId: 'dsh-1',
        context: { kind: 'assistant', assistantSpaceId: 'assistant-1', baseGrantIds: [] },
        package: packageInput,
        signal: new AbortController().signal,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'validation failed' }),
      expect.objectContaining({ message: 'cleanup failed' }),
    ]);
  });
});
