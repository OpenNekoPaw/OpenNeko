import type { AgentLaunchConnectionIdentity } from '@neko/agent-contracts';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterVersion,
  parseGlobalCharacterVersion,
} from '@neko/chara/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopAgentCharacterDialogueTargetValidator,
  createDesktopAgentRuntimeEntryService,
} from './desktop-agent-runtime-entry-service';

const connection: AgentLaunchConnectionIdentity = {
  applicationInstanceId: 'app-1',
  windowId: 'window-1',
  workbenchInstanceId: 'workbench-1',
  agentSurfaceId: 'surface-1',
  viewId: 'view-1',
  draftId: 'draft-1',
  connectionId: 'connection-1',
};

describe('Desktop Agent runtime Entry service', () => {
  it('rejects Narrative references before creating any Chara runtime records', async () => {
    const launch = vi.fn();
    const service = createDesktopAgentRuntimeEntryService({
      characterConversations: { validateSelection: vi.fn(), launch },
      ...runtimeOwners(),
      userId: 'user:local',
      userDisplayName: 'You',
    });
    const receipt = {
      targetReceiptId: 'target-character',
      draftId: 'draft-1',
      connectionId: 'connection-1',
      mode: 'character-dialogue' as const,
      binding: {
        kind: 'character-dialogue' as const,
        mode: 'narrative' as const,
        participants: [
          {
            globalCharacterId: 'global-character-1',
            characterVersionId: 'character-version-1',
            storyline: {
              characterStorylineId: 'storyline-1',
              characterStorylineVersionId: 'storyline-version-1',
              storylineNodeId: 'node-1',
            },
          },
        ],
      },
    };

    await expect(
      service.validate({
        receipt,
        input: { kind: 'message', text: 'Hello' },
        references: [
          {
            catalogEntryId: 'reference:1',
            referenceId: 'reference:1',
            ownerKind: 'character',
            ownerId: 'character-project-1',
          },
        ],
        resourceGrantIds: [],
      }),
    ).rejects.toThrow('forbids external references');
    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects unqualified Room references instead of silently dropping participant context', async () => {
    const launch = vi.fn();
    const service = createDesktopAgentRuntimeEntryService({
      characterConversations: { validateSelection: vi.fn(), launch },
      ...runtimeOwners(),
      userId: 'user:local',
      userDisplayName: 'You',
    });

    await expect(
      service.validate({
        receipt: {
          targetReceiptId: 'target-room',
          draftId: 'draft-1',
          connectionId: 'connection-1',
          mode: 'character-dialogue',
          binding: {
            kind: 'character-dialogue',
            mode: 'companion',
            participants: [
              {
                globalCharacterId: 'global-character-1',
                characterVersionId: 'character-version-1',
              },
              {
                globalCharacterId: 'global-character-2',
                characterVersionId: 'character-version-2',
              },
            ],
          },
        },
        input: { kind: 'message', text: 'Read this together.' },
        references: [
          {
            catalogEntryId: 'reference:1',
            referenceId: 'reference:1',
            ownerKind: 'character',
            ownerId: 'character-project-1',
          },
        ],
        resourceGrantIds: [],
      }),
    ).rejects.toThrow('require an exact participant turn');
    expect(launch).not.toHaveBeenCalled();
  });

  it('materializes one exact Chara Dialogue and preserves its role profile', async () => {
    const launch = vi.fn(async () => ({
      topology: 'dialogue' as const,
      mode: 'companion' as const,
      characterProjectId: 'character-project-1',
      characterVersionId: 'character-version-1',
      characterRunId: 'character-run:launch:request-1:1',
      dialogueRunId: 'dialogue-run:launch:request-1',
      primaryAgentSessionId: 'conversation:character:character-run:launch:request-1:1',
    }));
    const service = createDesktopAgentRuntimeEntryService({
      characterConversations: { validateSelection: vi.fn(), launch },
      ...runtimeOwners(),
      userId: 'user:local',
      userDisplayName: 'You',
    });

    await expect(
      service.materialize({
        requestId: 'request-1',
        connection,
        input: { kind: 'message', text: 'Hello' },
        receipt: characterReceipt([
          {
            globalCharacterId: 'global-character-1',
            characterVersionId: 'character-version-1',
            roleProfileId: 'role-profile-1',
          },
        ]),
      }),
    ).resolves.toEqual({
      conversationId: 'conversation:character:character-run:launch:request-1:1',
      context: {
        kind: 'character',
        characterId: 'global-character-1',
        characterVersionId: 'character-version-1',
        characterRunId: 'character-run:launch:request-1:1',
        dialogueRunId: 'dialogue-run:launch:request-1',
        roleProfileId: 'role-profile-1',
      },
    });
    expect(launch).toHaveBeenCalledWith({
      requestId: 'request-1',
      userId: 'user:local',
      userDisplayName: 'You',
      selection: {
        mode: 'companion',
        characters: [
          { characterVersionId: 'character-version-1', roleProfileId: 'role-profile-1' },
        ],
      },
    });
  });

  it('materializes multiple exact Characters as one Room owner', async () => {
    const launch = vi.fn(async () => ({
      topology: 'chatroom' as const,
      mode: 'companion' as const,
      characterRoomId: 'character-room:launch:request-room',
      roomRunId: 'room-run:launch:request-room',
      interactionAgentSessionId: 'conversation:character:run-1',
      participants: [
        {
          participantId: 'participant:character:1',
          characterVersionId: 'character-version-1',
          characterRunId: 'run-1',
          primaryAgentSessionId: 'conversation:character:run-1',
        },
        {
          participantId: 'participant:character:2',
          characterVersionId: 'character-version-2',
          characterRunId: 'run-2',
          primaryAgentSessionId: 'conversation:character:run-2',
        },
      ],
    }));
    const service = createDesktopAgentRuntimeEntryService({
      characterConversations: { validateSelection: vi.fn(), launch },
      ...runtimeOwners(),
      userId: 'user:local',
      userDisplayName: 'You',
    });

    await expect(
      service.materialize({
        requestId: 'request-room',
        connection,
        input: { kind: 'message', text: 'Hello room' },
        receipt: characterReceipt([
          { globalCharacterId: 'global-1', characterVersionId: 'character-version-1' },
          { globalCharacterId: 'global-2', characterVersionId: 'character-version-2' },
        ]),
      }),
    ).resolves.toEqual({
      conversationId: 'conversation:room:room-run:launch:request-room',
      context: {
        kind: 'room',
        scope: 'interaction',
        roomId: 'character-room:launch:request-room',
        roomRunId: 'room-run:launch:request-room',
      },
    });
  });

  it('materializes one exact global World with the selected Character participants', async () => {
    const launch = vi.fn();
    const owners = runtimeOwners();
    const service = createDesktopAgentRuntimeEntryService({
      characterConversations: { validateSelection: vi.fn(), launch },
      ...owners,
      userId: 'user:local',
      userDisplayName: 'You',
    });

    await expect(
      service.materialize({
        requestId: 'request-world',
        connection,
        input: { kind: 'message', text: 'Enter world' },
        receipt: {
          targetReceiptId: 'target-world',
          draftId: 'draft-1',
          connectionId: 'connection-1',
          mode: 'world-experience',
          binding: {
            kind: 'world-experience',
            globalWorldId: 'global-world-1',
            worldVersionId: 'world-version-1',
            participants: [
              {
                globalCharacterId: 'global-character-1',
                characterVersionId: 'character-version-1',
              },
            ],
            launch: { kind: 'new' },
          },
        },
      }),
    ).resolves.toEqual({
      conversationId:
        'conversation:world:world-run:request-world:world-participant:request-world',
      context: {
        kind: 'world',
        worldExperienceId: 'global-world-1',
        worldExperienceVersionId: 'world-version-1',
        worldRunId: 'world-run:request-world',
        participantId: 'world-participant:request-world',
        roleScopeId: 'world-role:request-world',
        characters: [
          {
        characterId: 'global-character-1',
            characterVersionId: 'character-version-1',
          },
        ],
      },
    });
    expect(owners.validateWorldExperience).toHaveBeenCalledOnce();
    expect(owners.worldRuntime.createRun).toHaveBeenCalledWith({
      worldVersionId: 'world-version-1',
      worldRunId: 'world-run:request-world',
      worldSaveId: 'world-save:request-world',
      branchId: 'world-branch:request-world',
      saveLabel: 'Agent World Experience',
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it('continues only the exact World Run, Save, and branch without creating another Run', async () => {
    const owners = runtimeOwners();
    const service = createDesktopAgentRuntimeEntryService({
      characterConversations: { validateSelection: vi.fn(), launch: vi.fn() },
      ...owners,
      userId: 'user:local',
      userDisplayName: 'You',
    });

    await expect(
      service.materialize({
        requestId: 'request-world-continue',
        connection,
        input: { kind: 'message', text: 'Continue world' },
        receipt: {
          targetReceiptId: 'target-world-continue',
          draftId: 'draft-1',
          connectionId: 'connection-1',
          mode: 'world-experience',
          binding: {
            kind: 'world-experience',
            globalWorldId: 'global-world-1',
            worldVersionId: 'world-version-1',
            participants: [],
            launch: {
              kind: 'continue',
              worldRunId: 'world-run-existing',
              worldSaveId: 'world-save-existing',
              branchId: 'world-branch-existing',
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      context: {
        kind: 'world',
        worldExperienceId: 'global-world-1',
        worldExperienceVersionId: 'world-version-1',
        worldRunId: 'world-run-existing',
        characters: [],
      },
    });
    expect(owners.worldRuntime.validateBinding).toHaveBeenCalledWith({
      worldVersionId: 'world-version-1',
      worldRunId: 'world-run-existing',
      worldSaveId: 'world-save-existing',
      branchId: 'world-branch-existing',
    });
    expect(owners.worldRuntime.createRun).not.toHaveBeenCalled();
  });

  it('validates exact GlobalCharacter ownership before issuing an Entry receipt', async () => {
    const validateSelection = vi.fn(async () => undefined);
    const validate = createDesktopAgentCharacterDialogueTargetValidator({
      conversations: { validateSelection },
      publications: {
        readPublication: async () => publication('character-project-1', 'character-version-1'),
        readCatalog: async () =>
          globalCatalog(
            'global-character-1',
            'character-project-1',
            'character-version-1',
          ),
      },
    });
    const binding = characterReceipt([
      { globalCharacterId: 'global-character-1', characterVersionId: 'character-version-1' },
    ]).binding;

    await expect(validate(binding)).resolves.toBeUndefined();
    await expect(
      validate({
        ...binding,
        participants: [
          {
            globalCharacterId: 'global-character-other',
            characterVersionId: 'character-version-1',
          },
        ],
      }),
    ).rejects.toThrow("does not belong to exact GlobalCharacter 'global-character-other'");
  });

  it('delegates the exact Narrative mode and participant node selection to Chara', async () => {
    const validateSelection = vi.fn(async () => undefined);
    const validate = createDesktopAgentCharacterDialogueTargetValidator({
      conversations: { validateSelection },
      publications: {
        readPublication: async () => publication('character-project-1', 'character-version-1'),
        readCatalog: async () =>
          globalCatalog(
            'global-character-1',
            'character-project-1',
            'character-version-1',
          ),
      },
    });
    const binding = {
      kind: 'character-dialogue' as const,
      mode: 'narrative' as const,
      participants: [
        {
          globalCharacterId: 'global-character-1',
          characterVersionId: 'character-version-1',
          storyline: {
            characterStorylineId: 'storyline-1',
            characterStorylineVersionId: 'storyline-version-1',
            storylineNodeId: 'storyline-node-1',
          },
        },
      ],
    };

    await expect(validate(binding)).resolves.toBeUndefined();
    expect(validateSelection).toHaveBeenCalledWith({
      mode: 'narrative',
      characters: [
        {
          characterVersionId: 'character-version-1',
          storyline: {
            characterStorylineId: 'storyline-1',
            characterStorylineVersionId: 'storyline-version-1',
            storylineNodeId: 'storyline-node-1',
          },
        },
      ],
    });
  });

});

function runtimeOwners() {
  return {
    characterInteractions: {
      validateDialogueBinding: vi.fn(async () => undefined),
    },
    characterRooms: {
      readRun: vi.fn(async () => ({ characterRoomId: 'character-room-1' })),
    },
    characterPublications: {
      readPublication: vi.fn(async (characterVersionId: string) =>
        publication('character-project-1', characterVersionId),
      ),
      readCatalog: vi.fn(async () =>
        globalCatalog(
          'global-character-1',
          'character-project-1',
          'character-version-1',
        ),
      ),
    },
    validateCharacterDialogue: vi.fn(async () => undefined),
    worldRuntime: {
      createRun: vi.fn(async () => undefined),
      validateBinding: vi.fn(async () => undefined),
      readRuntime: vi.fn(async () => undefined),
    },
    validateWorldExperience: vi.fn(async () => undefined),
  };
}

function characterReceipt(
  participants: readonly import('@neko/agent-contracts').AgentCompanionCharacterDialogueParticipant[],
) {
  return {
    targetReceiptId: 'target-character',
    draftId: 'draft-1',
    connectionId: 'connection-1',
    mode: 'character-dialogue' as const,
    binding: { kind: 'character-dialogue' as const, mode: 'companion' as const, participants },
  };
}

function publication(characterProjectId: string, characterVersionId: string) {
  return parseCharacterVersion({
    characterVersionId,
    characterProjectId,
    label: 'Character',
    definition: {
      summary: '',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-11T00:00:00.000Z',
  });
}

function globalCatalog(
  globalCharacterId: string,
  _characterProjectId: string,
  characterVersionId: string,
) {
  return {
    characters: [
      {
        globalCharacterId,
        displayName: 'Character',
        currentCharacterVersionId: characterVersionId,
        characterVersionIds: [characterVersionId],
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-11T00:00:00.000Z',
      },
    ],
    versions: [
      parseGlobalCharacterVersion({
        characterVersionId,
        globalCharacterId,
        label: 'Character',
        definition: publication(globalCharacterId, characterVersionId).definition,
        acceptedEvidenceIds: [],
        publishedAt: '2026-08-11T00:00:00.000Z',
      }),
    ],
    links: [],
    diagnostics: [],
  };
}
