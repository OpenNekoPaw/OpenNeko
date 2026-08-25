import { describe, expect, it } from 'vitest';
import {
  createCharacterFoundationHostRequest,
  createCharacterFoundationCommandHostRequest,
  parseCharacterFoundationAnyHostRequest,
  parseCharacterFoundationHostRequest,
  parseCharacterFoundationHostResult,
  parseCharacterFoundationSnapshot,
} from '../character-foundation-host';

function emptySnapshot() {
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

describe('Character Foundation host contract', () => {
  it('creates and parses the one canonical snapshot request', () => {
    const request = createCharacterFoundationHostRequest('foundation-request-1');

    expect(parseCharacterFoundationHostRequest(request)).toEqual(request);
    expect(() => parseCharacterFoundationHostRequest({ ...request, ownerId: 'implicit' })).toThrow(
      /unsupported fields/u,
    );
    expect(() =>
      parseCharacterFoundationHostRequest({ ...request, operation: 'snapshot-rebuild' }),
    ).toThrow(/Unknown Character Foundation operation/u);
  });

  it('rejects response identity mismatch and unsupported snapshot fields', () => {
    expect(() =>
      parseCharacterFoundationHostResult(
        { requestId: 'foreign-request', snapshot: emptySnapshot() },
        'foundation-request-1',
      ),
    ).toThrow(/request identity mismatch/u);
    expect(() =>
      parseCharacterFoundationSnapshot({ ...emptySnapshot(), activeWorldId: 'world-a' }),
    ).toThrow(/unsupported fields/u);
    expect(() =>
      parseCharacterFoundationSnapshot({
        ...emptySnapshot(),
        character: { ...emptySnapshot().character, storylineRuns: [] },
      }),
    ).toThrow(/Character catalog contains unsupported fields/u);
  });

  it('accepts only exact GlobalCharacterVersion ownership in the management snapshot', () => {
    const snapshot = emptySnapshot();
    const definition = {
      summary: 'A global character.',
      backgroundStory: {
        overview: '',
        origins: [],
        personalHistory: [],
        formativeEvents: [],
        establishedRelationships: [],
      },
      originSetting: {
        overview: '',
        eras: [],
        cultures: [],
        socialEnvironment: [],
        importantPlaces: [],
        organizations: [],
        believedRules: [],
      },
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    };
    expect(
      parseCharacterFoundationSnapshot({
        ...snapshot,
        character: {
          ...snapshot.character,
          versions: [
            {
              characterVersionId: 'character-version-a',
              globalCharacterId: 'global-character-a',
              label: 'v1',
              definition,
              acceptedEvidenceIds: [],
              publishedAt: '2026-08-15T00:00:00.000Z',
            },
          ],
        },
      }).character.versions[0],
    ).toMatchObject({ globalCharacterId: 'global-character-a' });
    expect(() =>
      parseCharacterFoundationSnapshot({
        ...snapshot,
        character: {
          ...snapshot.character,
          versions: [
            {
              characterVersionId: 'character-version-a',
              characterProjectId: 'character-project-a',
              label: 'v1',
              definition,
              acceptedEvidenceIds: [],
              publishedAt: '2026-08-15T00:00:00.000Z',
            },
          ],
        },
      }),
    ).toThrow(/GlobalCharacterVersion contains unsupported fields|owner identity/u);
  });

  it('strictly parses registered commands and rejects unavailable interaction routes', () => {
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        requestId: 'foundation-command-removed-authoring',
        operation: 'character-project-create',
        input: {},
      }),
    ).toThrow(/Unknown Character Foundation operation 'character-project-create'/u);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        requestId: 'foundation-command-unavailable',
        operation: 'room-turn-submit',
        input: {},
      }),
    ).toThrow(/Unknown Character Foundation operation 'room-turn-submit'/u);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        requestId: 'foundation-command-play',
        operation: 'play-use',
        input: {},
      }),
    ).toThrow(/Unknown Character Foundation operation 'play-use'/u);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        requestId: 'foundation-command-removed-world',
        operation: 'world-project-create',
        input: {},
      }),
    ).toThrow(/Unknown Character Foundation operation 'world-project-create'/u);
    expect(() =>
      parseCharacterFoundationSnapshot({
        ...emptySnapshot(),
        world: { projects: [], versions: [], runtimes: [] },
      }),
    ).toThrow(/unsupported fields/u);
  });

  it('strictly parses the canonical RoomRun aggregate command', () => {
    const request = createCharacterFoundationCommandHostRequest('foundation-room-run-1', {
      operation: 'room-run-create',
      input: {
        roomRunId: 'room-run-a',
        characterRoomId: 'room-a',
        mode: 'companion',
        companionBindings: [
          {
            participantId: 'participant-template-a',
            companionContinuityId: 'continuity-a',
            relationshipId: 'relationship-a',
          },
        ],
      },
    });

    expect(parseCharacterFoundationAnyHostRequest(request)).toEqual(request);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        ...request,
        input: { ...request.input, activeWorldRunId: 'world-run-recent' },
      }),
    ).toThrow(/unsupported fields/u);
  });

  it('strictly parses per-CharacterRun presentation configuration', () => {
    const request = createCharacterFoundationCommandHostRequest('foundation-presentation-1', {
      operation: 'character-presentation-configure',
      input: {
        characterRunId: 'character-run-a',
        participantId: 'participant-a',
        tts: {
          providerRef: 'provider:tts-a',
          voiceRepresentationId: 'voice-a',
          speed: 1,
          autoRead: true,
        },
        updatedAt: '2026-08-10T00:00:00.000Z',
      },
    });

    expect(parseCharacterFoundationAnyHostRequest(request)).toEqual(request);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        ...request,
        input: { ...request.input, fallbackModelRef: 'model:other' },
      }),
    ).toThrow(/unsupported fields/u);
  });

  it('rejects Project authoring and parses memory review commands', () => {
    const memory = createCharacterFoundationCommandHostRequest('foundation-memory-1', {
      operation: 'companion-memory-candidate-accept',
      input: {
        companionContinuityId: 'companion-continuity-a',
        companionMemoryCandidateId: 'companion-memory-candidate-a',
        companionMemoryEntryId: 'companion-memory-entry-a',
        expectedContinuityRevision: 2,
      },
    });

    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        requestId: 'foundation-storyline-removed',
        operation: 'character-storyline-publish',
        input: {},
      }),
    ).toThrow(/Unknown Character Foundation operation 'character-storyline-publish'/u);
    expect(parseCharacterFoundationAnyHostRequest(memory)).toEqual(memory);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        ...memory,
        input: { ...memory.input, expectedContinuityRevision: -1 },
      }),
    ).toThrow(/non-negative integer/u);

    const relationship = createCharacterFoundationCommandHostRequest(
      'foundation-relationship-memory-1',
      {
        operation: 'relationship-memory-candidate-propose',
        input: {
          relationshipId: 'relationship-a',
          candidateId: 'relationship-memory-candidate-a',
          sourceCharacterVersionId: 'character-version-a',
          provenance: {
            kind: 'room-event',
            roomRunId: 'room-run-a',
            roomEventId: 'room-event-rain',
          },
          content: 'The user waited in the rain.',
          expectedRelationshipRevision: 1,
        },
      },
    );
    expect(parseCharacterFoundationAnyHostRequest(relationship)).toEqual(relationship);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        ...relationship,
        input: {
          ...relationship.input,
          provenance: { kind: 'room-event', roomRunId: 'room-run-a' },
        },
      }),
    ).toThrow(/RoomEvent identity/u);
  });
});
