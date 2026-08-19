import type { AgentAuthoringBinding, AgentLaunchConnectionIdentity } from '@neko/agent-contracts';
import { describe, expect, it, vi } from 'vitest';
import { createAgentEntryTargetApplicationService } from './agent-entry-target-service';

const connection: AgentLaunchConnectionIdentity = {
  applicationInstanceId: 'app-1',
  windowId: 'window-1',
  workbenchInstanceId: 'workbench-1',
  agentSurfaceId: 'surface-1',
  viewId: 'view-1',
  draftId: 'draft-1',
  connectionId: 'connection-1',
};

describe('AgentEntryTargetApplicationService', () => {
  it('binds an exact Project authoring context without fabricating a domain target', async () => {
    const fixture = createFixture();
    const binding = authoringBinding(null);

    const result = await fixture.service.configure({
      connection,
      draftId: 'draft-1',
      mode: 'authoring',
      binding,
    });

    expect(result).toMatchObject({
      mode: 'authoring',
      targetReceipt: { binding },
    });
    expect(fixture.projectAuthoring.validate).toHaveBeenCalledWith(connection, binding);
    expect(fixture.providers.contentAuthoring.validate).not.toHaveBeenCalled();
    expect(fixture.providers.characterAuthoring.validate).not.toHaveBeenCalled();
    expect(fixture.providers.worldAuthoring.validate).not.toHaveBeenCalled();
  });

  it.each([
    ['contentAuthoring', { kind: 'content-document', documentId: 'documents/story.md' }],
    ['characterAuthoring', { kind: 'character-project', characterProjectId: 'character-1' }],
    ['worldAuthoring', { kind: 'world-project', worldProjectId: 'world-1' }],
  ] as const)(
    'routes %s through its exact provider and issues a Draft receipt',
    async (owner, target) => {
      const fixture = createFixture();
      const binding = authoringBinding(target);
      const result = await fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'authoring',
        binding,
      });

      expect(fixture.providers[owner].validate).toHaveBeenCalledWith(connection, binding);
      expect(result).toEqual({
        mode: 'authoring',
        targetReceipt: {
          targetReceiptId: 'entry-target:connection-1:receipt-1',
          draftId: 'draft-1',
          connectionId: 'connection-1',
          mode: 'authoring',
          binding,
        },
      });
    },
  );

  it('validates an explicit Character draft target without changing Assistant Entry mode', async () => {
    const fixture = createFixture();
    const binding = authoringBinding({
      kind: 'character-project',
      characterProjectId: 'character-1',
    });

    const result = await fixture.service.configure({
      connection,
      draftId: 'draft-1',
      mode: 'assistant',
      binding,
    });

    expect(fixture.providers.characterAuthoring.validate).toHaveBeenCalledWith(connection, binding);
    expect(result).toMatchObject({
      mode: 'assistant',
      targetReceipt: { mode: 'assistant', binding },
    });
  });

  it('keeps selection without authority as a visible incomplete mode', async () => {
    const { service } = createFixture();
    await expect(
      service.configure({ connection, draftId: 'draft-1', mode: 'character-dialogue' }),
    ).resolves.toEqual({ mode: 'character-dialogue', targetReceipt: null });
  });

  it('rejects cross-Draft, cross-mode, and unavailable authorities locally', async () => {
    const fixture = createFixture();
    const binding = authoringBinding({
      kind: 'character-project',
      characterProjectId: 'character-1',
    });
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-other',
        mode: 'authoring',
        binding,
      }),
    ).rejects.toThrow('another Draft');
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'world-experience',
        binding,
      }),
    ).rejects.toThrow('does not match');
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'assistant',
        binding: {
          kind: 'character-dialogue',
          mode: 'companion',
          participants: [{ globalCharacterId: 'character-1', characterVersionId: 'version-1' }],
        },
      }),
    ).rejects.toThrow('does not match');

    fixture.providers.characterAuthoring.validate.mockResolvedValueOnce({
      status: 'unavailable',
      diagnostic: {
        code: 'agent-character-authoring-unavailable',
        owner: 'character',
        message: 'Character target is unavailable.',
      },
    });
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'authoring',
        binding,
      }),
    ).rejects.toThrow('[character/agent-character-authoring-unavailable]');
  });

  it('rejects a provider that rewrites the exact authority', async () => {
    const fixture = createFixture();
    fixture.providers.contentAuthoring.validate.mockResolvedValueOnce({
      status: 'ready',
      binding: {
        ...authoringBinding({ kind: 'content-document', documentId: 'documents/story.md' }),
        authority: { kind: 'project', projectId: 'project-other' },
      },
    });
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'authoring',
        binding: authoringBinding({
          kind: 'content-document',
          documentId: 'documents/story.md',
        }),
      }),
    ).rejects.toThrow('different authority');
  });
});

function createFixture() {
  const projectAuthoring = {
    validate: vi.fn(async (_connection, binding) => ({ status: 'ready' as const, binding })),
  } satisfies Parameters<typeof createAgentEntryTargetApplicationService>[0]['projectAuthoring'];
  const contentAuthoring = {
    validate: vi.fn(async (_connection, binding) => ({ status: 'ready' as const, binding })),
  } satisfies Parameters<typeof createAgentEntryTargetApplicationService>[0]['contentAuthoring'];
  const characterAuthoring = {
    validate: vi.fn(async (_connection, binding) => ({ status: 'ready' as const, binding })),
  } satisfies Parameters<typeof createAgentEntryTargetApplicationService>[0]['characterAuthoring'];
  const worldAuthoring = {
    validate: vi.fn(async (_connection, binding) => ({ status: 'ready' as const, binding })),
  } satisfies Parameters<typeof createAgentEntryTargetApplicationService>[0]['worldAuthoring'];
  const characterDialogue = {
    validate: vi.fn(async (_connection, binding) => ({ status: 'ready' as const, binding })),
  } satisfies Parameters<typeof createAgentEntryTargetApplicationService>[0]['characterDialogue'];
  const worldExperience = {
    validate: vi.fn(async (_connection, binding) => ({ status: 'ready' as const, binding })),
  } satisfies Parameters<typeof createAgentEntryTargetApplicationService>[0]['worldExperience'];
  const providers = {
    contentAuthoring,
    characterAuthoring,
    worldAuthoring,
    characterDialogue,
    worldExperience,
  };
  return {
    projectAuthoring,
    providers,
    service: createAgentEntryTargetApplicationService({
      projectAuthoring,
      ...providers,
      createIdentity: () => 'receipt-1',
    }),
  };
}

function authoringBinding(target: AgentAuthoringBinding['target']): AgentAuthoringBinding {
  return {
    kind: 'authoring',
    workspaceId: 'workspace-1',
    workspaceGrantId: 'grant-1',
    authority: { kind: 'project', projectId: 'project-1' },
    target,
  };
}
