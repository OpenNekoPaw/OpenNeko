import { describe, expect, it, vi } from 'vitest';
import { createAgentDomainBindingApplicationService } from './agent-domain-binding-service';

const assistantBinding = {
  kind: 'assistant' as const,
  assistantSpaceId: 'assistant:local',
  baseGrantIds: [],
};
const workspaceBinding = {
  kind: 'workspace' as const,
  workspaceId: 'workspace:one',
  workspaceGrantId: 'grant:one',
};

describe('Agent domain binding application service', () => {
  it('delegates only to the exact explicit Assistant or Workspace provider', async () => {
    const assistant = vi.fn(async () => ({
      status: 'available' as const,
      binding: assistantBinding,
      contextPayloads: [],
    }));
    const workspace = vi.fn(async () => ({
      status: 'available' as const,
      binding: workspaceBinding,
      contextPayloads: [],
    }));
    const service = createAgentDomainBindingApplicationService({
      assistant: { resolve: assistant },
      workspace: { resolve: workspace },
    });

    await expect(service.resolve(assistantBinding)).resolves.toMatchObject({
      status: 'available',
      binding: assistantBinding,
    });
    expect(assistant).toHaveBeenCalledWith(assistantBinding);
    expect(workspace).not.toHaveBeenCalled();

    await expect(service.resolve(workspaceBinding)).resolves.toMatchObject({
      status: 'available',
      binding: workspaceBinding,
    });
    expect(workspace).toHaveBeenCalledWith(workspaceBinding);
  });

  it('returns owner-qualified unavailable results for uncomposed Chara, Room and World providers', async () => {
    const service = createAgentDomainBindingApplicationService({
      assistant: { resolve: async () => available(assistantBinding) },
      workspace: { resolve: async () => available(workspaceBinding) },
    });

    await expect(
      service.resolve({
        kind: 'room',
        scope: 'interaction',
        roomId: 'room:one',
        roomRunId: 'room-run:two',
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: {
        code: 'room-binding-provider-unavailable',
        owner: 'room:room:one:room-run:two',
      },
    });
    await expect(
      service.resolve({
        kind: 'character',
        characterId: 'character:one',
        characterVersionId: 'character-version:two',
        roleProfileId: 'role:lead',
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      diagnostic: {
        code: 'character-binding-provider-unavailable',
        owner: 'character:character:one:character-version:two',
        message:
          "Agent character binding provider is unavailable for 'character:character:one:character-version:two'.",
      },
    });
    await expect(
      service.resolve({
        kind: 'world',
        worldExperienceId: 'world:one',
        worldExperienceVersionId: 'world-version:two',
        participantId: 'participant:one',
        roleScopeId: 'scope:one',
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: {
        code: 'world-binding-provider-unavailable',
        owner: 'world:world:one:world-version:two',
      },
    });

    await expect(service.resolve(workspaceBinding)).resolves.toMatchObject({ status: 'available' });
  });

  it('accepts a bounded World provider without transferring World commit authority', async () => {
    const resolveWorld = vi.fn(async (binding) => ({
      status: 'available' as const,
      binding: { ...binding, worldRunId: 'world-run:one' },
      contextPayloads: [
        {
          type: 'scene' as const,
          id: 'world-view:participant:one',
          label: 'Participant view',
          summary: 'Authorized participant-scoped World view',
          data: { participantId: binding.participantId, roleScopeId: binding.roleScopeId },
        },
      ],
    }));
    const service = createAgentDomainBindingApplicationService({
      assistant: { resolve: async () => available(assistantBinding) },
      workspace: { resolve: async () => available(workspaceBinding) },
      world: { resolve: resolveWorld },
    });
    const requested = {
      kind: 'world' as const,
      worldExperienceId: 'world:one',
      worldExperienceVersionId: 'world-version:one',
      participantId: 'participant:one',
      roleScopeId: 'role-scope:one',
    };

    await expect(service.resolve(requested)).resolves.toEqual({
      status: 'available',
      binding: { ...requested, worldRunId: 'world-run:one' },
      contextPayloads: [
        expect.objectContaining({
          id: 'world-view:participant:one',
          data: { participantId: 'participant:one', roleScopeId: 'role-scope:one' },
        }),
      ],
    });
    expect(resolveWorld).toHaveBeenCalledWith(requested);
  });

  it('delegates an exact Character Version to Chara and preserves its bounded context', async () => {
    const requested = {
      kind: 'character' as const,
      characterId: 'character:lin',
      characterVersionId: 'character-version:lin-published',
      roleProfileId: 'role-profile:lin',
    };
    const characterFacts = {
      binding: { ...requested, characterRunId: 'character-run:lin-1' },
      contextPayloads: [
        {
          type: 'character' as const,
          id: 'role-profile:lin',
          label: 'Lin',
          summary: 'A careful archivist.',
          data: {
            knowledgeBoundaryId: 'knowledge:lin',
            memoryViewId: 'memory-view:character-run:lin-1',
            memoryIds: ['memory:public', 'memory:relationship'],
          },
        },
      ],
    };
    const factsBefore = structuredClone(characterFacts);
    const resolveCharacter = vi.fn(async () => ({
      status: 'available' as const,
      ...characterFacts,
    }));
    const service = createAgentDomainBindingApplicationService({
      assistant: { resolve: async () => available(assistantBinding) },
      workspace: { resolve: async () => available(workspaceBinding) },
      chara: { resolve: resolveCharacter },
    });

    await expect(service.resolve(requested)).resolves.toEqual({
      status: 'available',
      binding: { ...requested, characterRunId: 'character-run:lin-1' },
      contextPayloads: characterFacts.contextPayloads,
    });
    expect(resolveCharacter).toHaveBeenCalledWith(requested);
    expect(characterFacts).toEqual(factsBefore);
  });

  it('rejects a Chara result materialized from another Character owner', async () => {
    const requested = {
      kind: 'character' as const,
      characterId: 'character:lin',
      characterVersionId: 'character-version:lin-published',
      roleProfileId: 'role-profile:lin',
    };
    const service = createAgentDomainBindingApplicationService({
      assistant: { resolve: async () => available(assistantBinding) },
      workspace: { resolve: async () => available(workspaceBinding) },
      chara: {
        resolve: async () => ({
          status: 'available',
          binding: {
            ...requested,
            characterVersionId: 'character-version:other',
            characterRunId: 'character-run:other',
          },
          contextPayloads: [],
        }),
      },
    });

    await expect(service.resolve(requested)).rejects.toThrow('resolved a different domain owner');
  });

  it('rejects cross-owner provider results and duplicate bounded context', async () => {
    const crossOwner = createAgentDomainBindingApplicationService({
      assistant: { resolve: async () => available(assistantBinding) },
      workspace: {
        resolve: async () => available({ ...workspaceBinding, workspaceId: 'workspace:other' }),
      },
    });
    await expect(crossOwner.resolve(workspaceBinding)).rejects.toThrow(
      'resolved a different domain owner',
    );

    const duplicateContext = createAgentDomainBindingApplicationService({
      assistant: {
        resolve: async () => ({
          status: 'available',
          binding: assistantBinding,
          contextPayloads: [context('same'), context('same')],
        }),
      },
      workspace: { resolve: async () => available(workspaceBinding) },
    });
    await expect(duplicateContext.resolve(assistantBinding)).rejects.toThrow(
      "duplicate 'file:same'",
    );
  });
});

function available<Binding>(binding: Binding) {
  return { status: 'available' as const, binding, contextPayloads: [] };
}

function context(id: string) {
  return { type: 'file' as const, id, label: id, summary: id, data: {} };
}
