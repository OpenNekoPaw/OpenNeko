import type { AgentLaunchConnectionIdentity } from '@neko/agent-contracts';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterVersion,
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
            characterProjectId: 'character-project-1',
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
                characterProjectId: 'character-project-1',
                characterVersionId: 'character-version-1',
              },
              {
                characterProjectId: 'character-project-2',
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
            characterProjectId: 'character-project-1',
            characterVersionId: 'character-version-1',
            roleProfileId: 'role-profile-1',
          },
        ]),
      }),
    ).resolves.toEqual({
      conversationId: 'conversation:character:character-run:launch:request-1:1',
      context: {
        kind: 'character',
        characterId: 'character-project-1',
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
          { characterProjectId: 'project-1', characterVersionId: 'character-version-1' },
          { characterProjectId: 'project-2', characterVersionId: 'character-version-2' },
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

  it('keeps complete World Experience launch unavailable without calling Chara', async () => {
    const launch = vi.fn();
    const service = createDesktopAgentRuntimeEntryService({
      characterConversations: { validateSelection: vi.fn(), launch },
      ...runtimeOwners(),
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
            worldExperienceId: 'experience-1',
            worldExperienceVersionId: 'experience-version-1',
            launch: { kind: 'new', participantId: 'participant-1', roleScopeId: 'role-1' },
          },
        },
      }),
    ).rejects.toThrow('[world/agent-world-experience-provider-unavailable]');
    expect(launch).not.toHaveBeenCalled();
  });

  it('validates exact CharacterProject ownership before issuing an Entry receipt', async () => {
    const validateSelection = vi.fn(async () => undefined);
    const validate = createDesktopAgentCharacterDialogueTargetValidator({
      conversations: { validateSelection },
      publications: {
        readPublication: async () => publication('character-project-1', 'character-version-1'),
      },
    });
    const binding = characterReceipt([
      { characterProjectId: 'character-project-1', characterVersionId: 'character-version-1' },
    ]).binding;

    await expect(validate(binding)).resolves.toBeUndefined();
    await expect(
      validate({
        ...binding,
        participants: [
          {
            characterProjectId: 'character-project-other',
            characterVersionId: 'character-version-1',
          },
        ],
      }),
    ).rejects.toThrow("does not belong to exact CharacterProject 'character-project-other'");
  });

  it('delegates the exact Narrative mode and participant node selection to Chara', async () => {
    const validateSelection = vi.fn(async () => undefined);
    const validate = createDesktopAgentCharacterDialogueTargetValidator({
      conversations: { validateSelection },
      publications: {
        readPublication: async () => publication('character-project-1', 'character-version-1'),
      },
    });
    const binding = {
      kind: 'character-dialogue' as const,
      mode: 'narrative' as const,
      participants: [
        {
          characterProjectId: 'character-project-1',
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
