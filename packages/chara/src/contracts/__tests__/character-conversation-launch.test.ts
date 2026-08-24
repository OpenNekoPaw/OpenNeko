import { describe, expect, it } from 'vitest';
import {
  parseCharacterConversationLaunchInput,
  parseCharacterConversationLaunchResult,
  parseCharacterConversationLaunchSelection,
} from '../character-conversation-launch';

describe('Character conversation launch contract', () => {
  it('parses exact Companion and free Narrative selections', () => {
    expect(
      parseCharacterConversationLaunchSelection({
        mode: 'companion',
        characters: [{ characterVersionId: 'character-version-a' }],
      }),
    ).toEqual({
      mode: 'companion',
      characters: [{ characterVersionId: 'character-version-a' }],
    });

    expect(
      parseCharacterConversationLaunchSelection({
        mode: 'narrative',
        characters: [{ characterVersionId: 'character-version-a' }],
      }),
    ).toEqual({
      mode: 'narrative',
      characters: [{ characterVersionId: 'character-version-a' }],
    });
  });

  it('parses one exact Narrative Storyline publication and node', () => {
    expect(
      parseCharacterConversationLaunchInput({
        requestId: 'request-a',
        userId: 'user-a',
        userDisplayName: 'User',
        selection: {
          mode: 'narrative',
          characters: [
            {
              characterVersionId: 'character-version-a',
              storyline: {
                characterStorylineId: 'storyline-a',
                characterStorylineVersionId: 'storyline-version-a',
                storylineNodeId: 'storyline-node-a',
              },
            },
          ],
        },
      }).selection,
    ).toEqual({
      mode: 'narrative',
      characters: [
        {
          characterVersionId: 'character-version-a',
          storyline: {
            characterStorylineId: 'storyline-a',
            characterStorylineVersionId: 'storyline-version-a',
            storylineNodeId: 'storyline-node-a',
          },
        },
      ],
    });
  });

  it('keeps Narrative Room Storyline nodes participant-specific', () => {
    const selection = parseCharacterConversationLaunchSelection({
      mode: 'narrative',
      characters: [
        {
          characterVersionId: 'character-version-a',
          storyline: {
            characterStorylineId: 'storyline-a',
            characterStorylineVersionId: 'storyline-version-a',
            storylineNodeId: 'storyline-node-a',
          },
        },
        {
          characterVersionId: 'character-version-b',
          storyline: {
            characterStorylineId: 'storyline-b',
            characterStorylineVersionId: 'storyline-version-b',
            storylineNodeId: 'storyline-node-b',
          },
        },
      ],
    });

    expect(selection).toEqual({
      mode: 'narrative',
      characters: [
        expect.objectContaining({
          characterVersionId: 'character-version-a',
          storyline: expect.objectContaining({ storylineNodeId: 'storyline-node-a' }),
        }),
        expect.objectContaining({
          characterVersionId: 'character-version-b',
          storyline: expect.objectContaining({ storylineNodeId: 'storyline-node-b' }),
        }),
      ],
    });
  });

  it('rejects caller-supplied display text, removed launch fields and cross-mode context', () => {
    expect(() =>
      parseCharacterConversationLaunchSelection({
        mode: 'companion',
        characters: [{ characterVersionId: 'character-version-a', displayName: 'Neko' }],
      }),
    ).toThrow(/unsupported fields/u);

    expect(() =>
      parseCharacterConversationLaunchSelection({
        runtimeKind: 'companion',
        characters: [{ characterVersionId: 'character-version-a' }],
      }),
    ).toThrow(/unsupported fields/u);

    expect(() =>
      parseCharacterConversationLaunchSelection({
        mode: 'companion',
        characters: [
          {
            characterVersionId: 'character-version-a',
            characterStorylineVersionId: 'storyline-version-a',
          },
        ],
      }),
    ).toThrow(/unsupported fields/u);

    expect(() =>
      parseCharacterConversationLaunchSelection({
        mode: 'narrative',
        characters: [
          {
            characterVersionId: 'character-version-a',
            storyline: {
              characterStorylineId: 'storyline-a',
              characterStorylineVersionId: 'storyline-version-a',
            },
          },
        ],
      }),
    ).toThrow(/StorylineNode identity/u);

    expect(() =>
      parseCharacterConversationLaunchSelection({
        mode: 'narrative',
        characters: [{ characterVersionId: 'character-version-a' }],
        externalCompositionRef: 'composition-a',
      }),
    ).toThrow(/unsupported fields/u);

    expect(() =>
      parseCharacterConversationLaunchSelection({
        mode: 'companion',
        characters: [
          {
            characterVersionId: 'character-version-a',
            characterMemoryScopeId: 'memory-scope-a',
          },
        ],
      }),
    ).toThrow(/unsupported fields/u);

    expect(() =>
      parseCharacterConversationLaunchSelection({
        mode: 'narrative',
        characters: [
          {
            characterVersionId: 'character-version-a',
            characterStorylineRunId: 'storyline-run-a',
          },
        ],
        externalMaterials: [{ kind: 'file', id: 'file-a' }],
      }),
    ).toThrow(/unsupported fields/u);
  });

  it('parses exact Dialogue and Room owners without runtimeKind', () => {
    expect(
      parseCharacterConversationLaunchResult({
        topology: 'dialogue',
        mode: 'companion',
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a',
        characterRunId: 'character-run-a',
        dialogueRunId: 'dialogue-run-a',
        primaryAgentSessionId: 'agent-session-a',
      }),
    ).toEqual(
      expect.objectContaining({
        topology: 'dialogue',
        mode: 'companion',
        dialogueRunId: 'dialogue-run-a',
      }),
    );

    expect(
      parseCharacterConversationLaunchResult({
        topology: 'dialogue',
        mode: 'narrative',
        characterProjectId: 'character-project-a',
        characterVersionId: 'character-version-a',
        characterRunId: 'character-run-narrative',
        dialogueRunId: 'dialogue-run-narrative',
        primaryAgentSessionId: 'agent-session-narrative',
      }),
    ).toMatchObject({ topology: 'dialogue', mode: 'narrative' });

    expect(
      parseCharacterConversationLaunchResult({
        topology: 'chatroom',
        mode: 'companion',
        characterRoomId: 'room-a',
        roomRunId: 'room-run-a',
        interactionAgentSessionId: 'agent-session-a',
        participants: [
          {
            participantId: 'participant-a',
            characterVersionId: 'character-version-a',
            characterRunId: 'character-run-a',
            primaryAgentSessionId: 'agent-session-a',
          },
          {
            participantId: 'participant-b',
            characterVersionId: 'character-version-b',
            characterRunId: 'character-run-b',
            primaryAgentSessionId: 'agent-session-b',
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        topology: 'chatroom',
        mode: 'companion',
        characterRoomId: 'room-a',
        roomRunId: 'room-run-a',
      }),
    );
  });
});
