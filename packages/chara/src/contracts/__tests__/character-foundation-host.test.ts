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
      projects: [],
      versions: [],
      relationships: [],
      characterRuns: [],
      dialogueRuns: [],
      rooms: [],
      roomRuns: [],
    },
    world: { projects: [], versions: [], runtimes: [] },
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
});
