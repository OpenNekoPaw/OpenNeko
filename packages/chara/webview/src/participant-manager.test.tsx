import {
  createEmptyCharacterDefinition,
  type CharacterFoundationSnapshot,
} from '@neko/chara-domain/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CharacterParticipantIdentityAvatar,
  CharacterParticipantManagerSurface,
  projectCharacterParticipantManager,
} from './participant-manager';

describe('CharacterParticipantManagerSurface', () => {
  it('renders an authorized portrait with bounded hover details and exact activation', () => {
    const participant = projectCharacterParticipantManager(dialogueSnapshot(), {
      kind: 'character',
      characterRunId: 'character-run:neko',
    }).participants[0];
    if (!participant) throw new Error('Expected an exact participant projection.');
    const onSelect = vi.fn();
    const { container } = render(
      <CharacterParticipantIdentityAvatar
        locale="en"
        onSelect={onSelect}
        participant={participant}
        portraitState="ready"
        portraitUrl="openneko://resource/portrait-neko"
        size="compact"
      />,
    );

    const image = container.querySelector('img');
    const trigger = screen.getByRole('button', { name: 'Select Neko' });
    const profile = screen.getByRole('tooltip');
    expect(image?.getAttribute('src')).toBe('openneko://resource/portrait-neko');
    expect(trigger.classList.contains('character-participant-identity__trigger')).toBe(true);
    expect(profile.classList.contains('character-participant-identity__trigger')).toBe(false);
    expect(profile.textContent).toContain('Initial release');
    expect(container.textContent).not.toContain('character-run:neko');
    fireEvent.click(trigger);
    expect(onSelect).toHaveBeenCalledWith('participant:neko');
  });

  it('renders one expanded Dialogue participant without Room catalog chrome or raw identities', () => {
    const snapshot = dialogueSnapshot();
    const { container } = render(
      <CharacterParticipantManagerSurface
        locale="zh-cn"
        owner={{ kind: 'character', characterRunId: 'character-run:neko' }}
        snapshot={snapshot}
      />,
    );

    expect(screen.getByText('Neko')).toBeTruthy();
    expect(screen.getByText('角色版本')).toBeTruthy();
    expect(screen.getByText('Initial release')).toBeTruthy();
    expect(screen.getByText('日常')).toBeTruthy();
    expect(screen.getByText('已绑定')).toBeTruthy();
    expect(screen.getByText('自动朗读 · 1.2×')).toBeTruthy();
    expect(screen.getByText('VRM 3D')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Neko/u })).toBeNull();
    expect(container.textContent).not.toContain('character-run:neko');
    expect(container.textContent).not.toContain('character-version:neko');
    expect(container.textContent).not.toContain('agent-session:neko');
  });

  it('renders every Room participant and changes only local detail selection', () => {
    const snapshot = roomSnapshot();
    const before = structuredClone(snapshot);
    const { container } = render(
      <CharacterParticipantManagerSurface
        locale="en"
        owner={{ kind: 'room', roomRunId: 'room-run:archive' }}
        snapshot={snapshot}
      />,
    );

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Neko/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reader/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Moderator/u })).toBeTruthy();
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Reader/u }));
    expect(screen.getByRole('region', { name: 'Reader details' })).toBeTruthy();
    expect(screen.getAllByText('User controlled')).toHaveLength(3);
    expect(snapshot).toEqual(before);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search participants' }), {
      target: { value: 'neko' },
    });
    expect(screen.getByRole('button', { name: /Neko/u })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reader/u })).toBeNull();
    expect(container.textContent).not.toContain('participant:neko');
  });

  it('accepts exact external selection from a Room message avatar', () => {
    const snapshot = roomSnapshot();
    const before = structuredClone(snapshot);
    function Harness(): JSX.Element {
      const [selectedParticipantId, setSelectedParticipantId] = useState('participant:reader');
      return (
        <>
          <button type="button" onClick={() => setSelectedParticipantId('participant:neko')}>
            Select message author
          </button>
          <CharacterParticipantManagerSurface
            locale="en"
            onSelectedParticipantChange={setSelectedParticipantId}
            owner={{ kind: 'room', roomRunId: 'room-run:archive' }}
            selectedParticipantId={selectedParticipantId}
            snapshot={snapshot}
          />
        </>
      );
    }
    render(<Harness />);

    expect(screen.getByRole('region', { name: 'Reader details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Select message author' }));
    expect(screen.getByRole('region', { name: 'Neko details' })).toBeTruthy();
    expect(snapshot).toEqual(before);
  });

  it('projects the exact Narrative node title and fails visibly for broken authority', () => {
    const snapshot = dialogueSnapshot('narrative');
    const projection = projectCharacterParticipantManager(snapshot, {
      kind: 'character',
      characterRunId: 'character-run:neko',
    });
    expect(projection.participants[0]?.character?.storylineNodeTitle).toBe('Moonlit archive');

    expect(() =>
      projectCharacterParticipantManager(
        {
          ...snapshot,
          character: { ...snapshot.character, versions: [] },
        },
        { kind: 'character', characterRunId: 'character-run:neko' },
      ),
    ).toThrow("CharacterVersion 'character-version:neko' is unavailable.");
  });
});

function emptySnapshot(): CharacterFoundationSnapshot {
  return {
    character: {
      globalCharacters: [],
      versions: [],
      relationships: [],
      characterRuns: [],
      dialogueRuns: [],
      rooms: [],
      roomRuns: [],
      storylines: [],
      storylineDrafts: [],
      storylineVersions: [],
      companionContinuities: [],
      presentationConfigurations: [],
    },
    diagnostics: [],
  };
}

function dialogueSnapshot(mode: 'companion' | 'narrative' = 'companion') {
  const snapshot = emptySnapshot();
  const definition = {
    ...createEmptyCharacterDefinition(),
    representationRefs: [
      {
        representationId: 'avatar:neko',
        kind: 'vrm' as const,
        resourceRef: 'global-asset-library:avatar-neko',
      },
      {
        representationId: 'voice:neko',
        kind: 'voice' as const,
        resourceRef: 'global-asset-library:voice-neko',
      },
      {
        representationId: 'portrait:neko',
        kind: 'portrait' as const,
        resourceRef: 'global-asset-library:portrait-neko',
      },
    ],
    representationDefaults: {
      avatarRepresentationId: 'avatar:neko',
      portraitRepresentationId: 'portrait:neko',
    },
    voiceDefaults: {
      providerRef: 'provider:tts',
      voiceRepresentationId: 'voice:neko',
      speed: 1.2,
      autoRead: true,
    },
  };
  return {
    ...snapshot,
    character: {
      ...snapshot.character,
      globalCharacters: [
        {
          globalCharacterId: 'global-character:neko',
          displayName: 'Neko',
          currentCharacterVersionId: 'character-version:neko',
          characterVersionIds: ['character-version:neko'],
          createdAt: '2026-08-25T00:00:00.000Z',
          updatedAt: '2026-08-25T00:00:00.000Z',
        },
      ],
      versions: [
        {
          characterVersionId: 'character-version:neko',
          globalCharacterId: 'global-character:neko',
          label: 'Initial release',
          definition,
          acceptedEvidenceIds: [],
          publishedAt: '2026-08-25T00:00:00.000Z',
        },
      ],
      characterRuns: [
        {
          characterRunId: 'character-run:neko',
          characterVersionId: 'character-version:neko',
          participantId: 'participant:neko',
          controller: { kind: 'agent' as const, primaryAgentSessionId: 'agent-session:neko' },
          runtimeBinding:
            mode === 'companion'
              ? {
                  kind: 'companion' as const,
                  companionContinuityId: 'continuity:neko',
                  relationshipId: 'relationship:neko',
                }
              : {
                  kind: 'narrative' as const,
                  storyline: {
                    characterStorylineId: 'storyline:neko',
                    characterStorylineVersionId: 'storyline-version:neko',
                    storylineNodeId: 'storyline-node:archive',
                  },
                },
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
      storylineVersions:
        mode === 'narrative'
          ? [
              {
                characterStorylineVersionId: 'storyline-version:neko',
                characterStorylineId: 'storyline:neko',
                characterVersionId: 'character-version:neko',
                label: 'Archive story initial release',
                premise: 'Neko enters the archive.',
                constraints: [],
                nodeOrder: ['storyline-node:archive'],
                nodes: [
                  {
                    storylineNodeId: 'storyline-node:archive',
                    title: 'Moonlit archive',
                    spoilerVisibility: 'visible' as const,
                    context: {
                      situation: 'At the archive entrance.',
                      time: 'Night',
                      location: 'Archive',
                      characterState: 'Curious',
                      relationshipState: 'Meeting the reader',
                      allowedStoryFacts: [],
                      forbiddenStoryFacts: [],
                      narrativeMemories: [],
                      knowledgeBoundary: [],
                      behaviorConstraints: [],
                      expressionConstraints: [],
                      authorOnlyNotes: [],
                    },
                  },
                ],
                edges: [],
                publishedAt: '2026-08-25T00:00:00.000Z',
              },
            ]
          : [],
      presentationConfigurations: [
        {
          characterRunId: 'character-run:neko',
          participantId: 'participant:neko',
          tts: {
            providerRef: 'provider:tts',
            voiceRepresentationId: 'voice:neko',
            speed: 1.2,
            autoRead: true,
          },
          updatedAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    },
  } satisfies CharacterFoundationSnapshot;
}

function roomSnapshot(): CharacterFoundationSnapshot {
  const snapshot = dialogueSnapshot();
  return {
    ...snapshot,
    character: {
      ...snapshot.character,
      roomRuns: [
        {
          topology: 'chatroom',
          roomRunId: 'room-run:archive',
          characterRoomId: 'room:archive',
          roomRevision: 0,
          participants: [
            {
              participantId: 'participant:reader',
              displayName: 'Reader',
              controller: { kind: 'human', userId: 'user:local' },
            },
            {
              participantId: 'participant:neko',
              displayName: 'Neko',
              characterVersionId: 'character-version:neko',
              controller: {
                kind: 'agent',
                characterRunId: 'character-run:neko',
                primaryAgentSessionId: 'agent-session:neko',
              },
            },
            {
              participantId: 'participant:moderator',
              displayName: 'Moderator',
              controller: { kind: 'system', systemId: 'system:moderator' },
            },
          ],
          schedulingPolicy: {
            kind: 'bounded-autonomous',
            maxResponsesPerCycle: 1,
            eligibleParticipantIds: ['participant:neko'],
          },
          events: [],
          mode: 'companion',
          relationshipIds: ['relationship:neko'],
          createdAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    },
  };
}
