import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '../character-lore-storyline-memory';
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
      projects: [],
      versions: [],
      relationships: [],
      characterRuns: [],
      dialogueRuns: [],
      rooms: [],
      roomRuns: [],
      storylineVersions: [],
      storylineRuns: [],
      storylineObservationCandidates: [],
      memoryScopes: [],
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
  });

  it('strictly parses registered commands and rejects unavailable interaction routes', () => {
    const request = createCharacterFoundationCommandHostRequest('foundation-command-1', {
      operation: 'character-project-create',
      input: {
        characterProjectId: 'character-project-a',
        displayName: 'Lin',
        draft: {
          summary: 'An archivist.',
          backgroundStory: createEmptyCharacterBackgroundStory(),
          originSetting: createEmptyCharacterOriginSetting(),
          canon: [],
          knowledgeBoundary: [],
          behaviorPolicy: [],
          expressionPolicy: [],
          representationRefs: [],
        },
      },
    });

    expect(parseCharacterFoundationAnyHostRequest(request)).toEqual(request);
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
        runtimeKind: 'companion',
        relationshipBindings: [
          { participantId: 'participant-template-a', relationshipId: 'relationship-a' },
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
        chat: { providerRef: 'provider:chat-a', modelRef: 'model:chat-a' },
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

  it('strictly parses storyline publication and memory review commands', () => {
    const storyline = createCharacterFoundationCommandHostRequest('foundation-storyline-1', {
      operation: 'character-storyline-publish',
      input: {
        characterStorylineVersionId: 'character-storyline-version-a',
        characterVersionId: 'character-version-a',
        label: 'Trust arc',
        premise: 'The sealed archive opens.',
        desire: 'Protect its record.',
        conflict: 'The record must be shared.',
        growthArc: 'Learn to trust a witness.',
        stages: [{ stageId: 'guarded', title: 'Guarded', description: 'Keeps distance.' }],
        turningPoints: [],
        constraints: [],
        acceptedEvidenceIds: [],
      },
    });
    const memory = createCharacterFoundationCommandHostRequest('foundation-memory-1', {
      operation: 'character-memory-candidate-accept',
      input: {
        characterMemoryScopeId: 'character-memory-scope-a',
        characterMemoryCandidateId: 'character-memory-candidate-a',
        characterMemoryEntryId: 'character-memory-entry-a',
        expectedMemoryRevision: 2,
      },
    });

    expect(parseCharacterFoundationAnyHostRequest(storyline)).toEqual(storyline);
    expect(parseCharacterFoundationAnyHostRequest(memory)).toEqual(memory);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        ...memory,
        input: { ...memory.input, expectedMemoryRevision: -1 },
      }),
    ).toThrow(/non-negative integer/u);

    const relationship = createCharacterFoundationCommandHostRequest(
      'foundation-relationship-memory-1',
      {
        operation: 'relationship-memory-candidate-propose',
        input: {
          relationshipId: 'relationship-a',
          candidateId: 'relationship-memory-candidate-a',
          content: 'The user waited in the rain.',
          sourceRef: 'room-event:rain',
        },
      },
    );
    expect(parseCharacterFoundationAnyHostRequest(relationship)).toEqual(relationship);
    expect(() =>
      parseCharacterFoundationAnyHostRequest({
        ...relationship,
        input: { ...relationship.input, sourceRef: 'file:/private/transcript.json' },
      }),
    ).toThrow(/opaque non-file reference/u);
  });
});
