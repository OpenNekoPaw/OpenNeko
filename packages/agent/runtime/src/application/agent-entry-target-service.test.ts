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
  it.each([
    ['contentAuthoring', { kind: 'content-project', contentProjectId: 'content-1' }],
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
      binding: authoringBinding({ kind: 'content-project', contentProjectId: 'content-other' }),
    });
    await expect(
      fixture.service.configure({
        connection,
        draftId: 'draft-1',
        mode: 'authoring',
        binding: authoringBinding({ kind: 'content-project', contentProjectId: 'content-1' }),
      }),
    ).rejects.toThrow('different authority');
  });
});

function createFixture() {
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
    providers,
    service: createAgentEntryTargetApplicationService({
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
    target,
  };
}
