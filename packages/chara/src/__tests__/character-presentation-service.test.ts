import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterRunPresentationConfiguration,
  parseCharacterTurnPresentationReceipt,
  type CharacterRun,
  type CharacterRunPresentationConfiguration,
  type CharacterTurnPresentationReceipt,
  type CharacterVersion,
} from '@neko/chara/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  CharacterAvatarSurfaceService,
  CharacterAvatarAuthorityService,
  CharacterPresentationService,
  type CharacterPresentationRepository,
} from '../application/character-presentation-service';

const NOW = '2026-08-10T01:00:00.000Z';

describe('CharacterPresentationService', () => {
  it('isolates participant presentation configuration and freezes next-turn-only receipts', async () => {
    const repository = fixtureRepository();
    const service = new CharacterPresentationService(repository, { now: () => NOW });
    await service.initializeConfiguration({
      characterRunId: 'run-a',
      participantId: 'participant-a',
    });
    await service.initializeConfiguration({
      characterRunId: 'run-b',
      participantId: 'participant-b',
    });

    const receipt = await service.startTurn({ turnId: 'turn-a', characterRunId: 'run-a' });
    await service.updateConfigurations([
      {
        ...repository.configurations.get('run-a')!,
        tts: { ...repository.configurations.get('run-a')!.tts, speed: 1.25 },
      },
    ]);

    expect(receipt.tts.speed).toBe(1);
    expect(repository.receipts.get('turn-a')?.tts.speed).toBe(1);
    expect(repository.configurations.get('run-a')?.tts.speed).toBe(1.25);
    expect(repository.configurations.get('run-b')?.tts.speed).toBe(1);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('requires explicit bounded batch updates and exact participant/voice authority', async () => {
    const repository = fixtureRepository();
    const service = new CharacterPresentationService(repository, { now: () => NOW });
    const configuration = {
      characterRunId: 'run-a',
      participantId: 'participant-a',
      tts: {
        providerRef: 'provider:tts-a',
        voiceRepresentationId: 'voice-a',
        speed: 1,
        autoRead: true,
      },
      updatedAt: NOW,
    } as const;
    await expect(service.updateConfigurations([])).rejects.toMatchObject({
      code: 'character-presentation-batch-invalid',
    });
    await expect(
      service.updateConfigurations([configuration, configuration]),
    ).rejects.toMatchObject({ code: 'character-presentation-batch-invalid' });
    await expect(
      service.initializeConfiguration({
        characterRunId: 'run-a',
        participantId: 'participant-other',
      }),
    ).rejects.toMatchObject({ code: 'character-presentation-participant-mismatch' });
    await expect(
      service.updateConfigurations([
        { ...configuration, tts: { ...configuration.tts, voiceRepresentationId: 'voice-other' } },
      ]),
    ).rejects.toMatchObject({ code: 'character-presentation-voice-unavailable' });
  });

  it('keeps a TTS provider failure local to its exact frozen turn', async () => {
    const repository = fixtureRepository();
    const service = new CharacterPresentationService(repository, {
      now: () => NOW,
      ttsProviders: [
        {
          providerRef: 'provider:tts-a',
          synthesize: async ({ receipt }) => {
            if (receipt.characterRunId === 'run-a') throw new Error('provider failed');
            return { turnId: receipt.turnId, audioRef: 'asset:audio-b', visemes: [] };
          },
        },
      ],
    });
    for (const suffix of ['a', 'b']) {
      await service.initializeConfiguration({
        characterRunId: `run-${suffix}`,
        participantId: `participant-${suffix}`,
      });
      await service.startTurn({ turnId: `turn-${suffix}`, characterRunId: `run-${suffix}` });
    }

    await expect(service.synthesizeTurn({ turnId: 'turn-a', content: 'A' })).rejects.toThrow(
      'provider failed',
    );
    await expect(service.synthesizeTurn({ turnId: 'turn-b', content: 'B' })).resolves.toEqual({
      turnId: 'turn-b',
      audioRef: 'asset:audio-b',
      visemes: [],
    });
  });
});

describe('CharacterAvatarSurfaceService', () => {
  it('selects exactly one renderer by representation kind and disposes its runtime once', async () => {
    const dispose = vi.fn();
    const live2d = {
      kind: 'live2d' as const,
      rendererId: 'renderer:live2d',
      openSurface: vi.fn(async () => ({ dispose })),
    };
    const service = new CharacterAvatarSurfaceService([live2d]);
    const projection = service.createProjection({
      characterRunId: 'run-a',
      participantId: 'participant-a',
      representation: {
        representationId: 'avatar-a',
        kind: 'live2d',
        resourceRef: 'asset:live2d-a',
      },
      voiceTiming: {
        turnId: 'turn-a',
        audioRef: 'asset:audio-a',
        visemes: [{ offsetMs: 0, durationMs: 80, value: 'A' }],
      },
    });
    const handle = await service.openSurface(projection);
    await handle.dispose();
    await handle.dispose();

    expect(live2d.openSurface).toHaveBeenCalledWith(projection, undefined);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() =>
      service.createProjection({
        characterRunId: 'run-a',
        participantId: 'participant-a',
        representation: {
          representationId: 'portrait-a',
          kind: 'portrait',
          resourceRef: 'asset:portrait-a',
        },
      }),
    ).toThrow("No renderer is registered for 'portrait'");
    await expect(
      service.openSurface({ ...projection, rendererId: 'renderer:other' }),
    ).rejects.toMatchObject({ code: 'character-avatar-renderer-mismatch' });
  });
});

describe('CharacterAvatarAuthorityService', () => {
  it('resolves only the exact author-selected representation and Room membership', async () => {
    const publication = publicationFixture('a');
    const avatarPublication = {
      ...publication,
      definition: {
        ...publication.definition,
        representationRefs: [
          ...publication.definition.representationRefs,
          { representationId: 'avatar-first', kind: 'vrm' as const, resourceRef: 'asset:first' },
          {
            representationId: 'avatar-selected',
            kind: 'vrm' as const,
            resourceRef: 'asset:selected',
          },
        ],
        representationDefaults: { avatarRepresentationId: 'avatar-selected' },
      },
    };
    const service = new CharacterAvatarAuthorityService({
      async readCharacterRun(characterRunId) {
        return characterRunId === 'run-a'
          ? {
              characterRunId: 'run-a',
              characterVersionId: avatarPublication.characterVersionId,
              participantId: 'participant-a',
              controller: { kind: 'agent' as const, primaryAgentSessionId: 'agent-session-a' },
              runtimeBinding: {
                kind: 'companion' as const,
                companionContinuityId: 'continuity-a',
                relationshipId: 'relationship-a',
              },
              createdAt: NOW,
            }
          : undefined;
      },
      async readPublication(characterVersionId) {
        return characterVersionId === avatarPublication.characterVersionId
          ? avatarPublication
          : undefined;
      },
      async readRoomRun(roomRunId) {
        return roomRunId === 'room-run-a'
          ? {
              topology: 'chatroom' as const,
              roomRunId,
              characterRoomId: 'room-a',
              roomRevision: 0,
              participants: [
                {
                  participantId: 'participant-a',
                  displayName: 'Lin',
                  characterVersionId: avatarPublication.characterVersionId,
                  controller: {
                    kind: 'agent' as const,
                    characterRunId: 'run-a',
                    primaryAgentSessionId: 'agent-session-a',
                  },
                },
              ],
              schedulingPolicy: { kind: 'mentioned' as const },
              events: [],
              mode: 'companion' as const,
              relationshipIds: ['relationship-a'],
              createdAt: NOW,
            }
          : undefined;
      },
    });

    await expect(
      service.resolveSelectedRepresentation({
        characterRunId: 'run-a',
        representationId: 'avatar-selected',
        surface: 'avatar',
      }),
    ).resolves.toMatchObject({
      representation: { representationId: 'avatar-selected' },
    });
    await expect(
      service.resolveSelectedRepresentation({
        characterRunId: 'run-a',
        representationId: 'avatar-first',
        surface: 'avatar',
      }),
    ).rejects.toMatchObject({ code: 'character-avatar-representation-unavailable' });
    await expect(service.assertRoomContainsRun('room-run-a', 'run-a')).resolves.toBe(undefined);
    await expect(
      service.assertRoomContainsRun('room-run-a', 'character-run-b'),
    ).rejects.toMatchObject({ code: 'character-avatar-room-membership-mismatch' });
  });
});

function fixtureRepository() {
  const runs = new Map<string, CharacterRun>();
  const versions = new Map<string, CharacterVersion>();
  for (const suffix of ['a', 'b']) {
    runs.set(`run-${suffix}`, {
      characterRunId: `run-${suffix}`,
      characterVersionId: `version-${suffix}`,
      participantId: `participant-${suffix}`,
      controller: { kind: 'agent', primaryAgentSessionId: `agent-session-${suffix}` },
      runtimeBinding: {
        kind: 'companion',
        companionContinuityId: `continuity-${suffix}`,
        relationshipId: `relationship-${suffix}`,
      },
      createdAt: NOW,
    });
    versions.set(`version-${suffix}`, publicationFixture(suffix));
  }
  const configurations = new Map<string, CharacterRunPresentationConfiguration>();
  const receipts = new Map<string, CharacterTurnPresentationReceipt>();
  const repository: CharacterPresentationRepository & {
    readonly configurations: typeof configurations;
    readonly receipts: typeof receipts;
  } = {
    configurations,
    receipts,
    async readCharacterRun(id) {
      return clone(runs.get(id));
    },
    async readPublication(id) {
      return clone(versions.get(id));
    },
    async readPresentationConfiguration(id) {
      return clone(configurations.get(id));
    },
    async storePresentationConfigurations(items) {
      for (const item of items) {
        configurations.set(item.characterRunId, parseCharacterRunPresentationConfiguration(item));
      }
    },
    async freezePresentationTurn(input) {
      const configuration = parseCharacterRunPresentationConfiguration(input.configuration);
      if (receipts.has(input.turnId)) throw new Error('turn already frozen');
      const receipt = parseCharacterTurnPresentationReceipt({
        turnId: input.turnId,
        characterRunId: configuration.characterRunId,
        participantId: configuration.participantId,
        tts: configuration.tts,
        startedAt: input.startedAt,
      });
      receipts.set(input.turnId, receipt);
      return clone(receipt)!;
    },
    async readPresentationTurnReceipt(id) {
      return clone(receipts.get(id));
    },
  };
  return repository;
}

function publicationFixture(suffix: string): CharacterVersion {
  return {
    characterVersionId: `version-${suffix}`,
    characterProjectId: `project-${suffix}`,
    label: suffix,
    definition: {
      summary: suffix,
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [
        {
          representationId: `voice-${suffix}`,
          kind: 'voice',
          resourceRef: `voice:voice-${suffix}`,
        },
      ],
      voiceDefaults: {
        providerRef: 'provider:tts-a',
        voiceRepresentationId: `voice-${suffix}`,
        speed: 1,
        autoRead: true,
      },
    },
    acceptedEvidenceIds: [],
    publishedAt: NOW,
  };
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
