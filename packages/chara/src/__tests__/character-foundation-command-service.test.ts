import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '../contracts';
import { CharacterFoundationCommandService } from '../application/character-foundation-command-service';

describe('CharacterFoundationCommandService', () => {
  it('delegates Character commands to their one owning service', async () => {
    const services = createServices();
    const service = new CharacterFoundationCommandService(services);
    const characterInput = {
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
    };
    await service.execute({ operation: 'character-project-create', input: characterInput });
    const storylineInput = {
      characterStorylineVersionId: 'character-storyline-version-a',
      characterVersionId: 'character-version-a',
      label: 'First arc',
      premise: 'A sealed archive opens.',
      desire: 'Protect the record.',
      conflict: 'The record must also be shared.',
      growthArc: 'Learn to trust a witness.',
      stages: [{ stageId: 'stage-a', title: 'Guarded', description: 'Keeps distance.' }],
      turningPoints: [],
      constraints: [],
      acceptedEvidenceIds: [],
    } as const;
    await service.execute({ operation: 'character-storyline-publish', input: storylineInput });
    const presentationInput = {
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
    } as const;
    await service.execute({
      operation: 'character-presentation-configure',
      input: presentationInput,
    });

    expect(services.characterAuthoring.createProject).toHaveBeenCalledWith(
      characterInput,
      undefined,
    );
    expect(services.characterAuthoring.publish).not.toHaveBeenCalled();
    expect(services.rooms.createRoom).not.toHaveBeenCalled();
    expect(services.presentation.updateConfigurations).toHaveBeenCalledWith(
      [presentationInput],
      undefined,
    );
    expect(services.storylines.publish).toHaveBeenCalledWith(storylineInput, undefined);
  });
});

function createServices() {
  return {
    characterAuthoring: {
      createProject: vi.fn(async () => undefined),
      updateDraft: vi.fn(async () => undefined),
      setReviewStatus: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
    },
    relationships: {
      create: vi.fn(async () => undefined),
      propose: vi.fn(async () => undefined),
      accept: vi.fn(async () => undefined),
      reject: vi.fn(async () => undefined),
      correctMemory: vi.fn(async () => undefined),
      deleteMemory: vi.fn(async () => undefined),
    },
    interactions: { createDialogue: vi.fn(async () => undefined) },
    rooms: { createRoom: vi.fn(async () => undefined) },
    roomInteractions: { createRun: vi.fn(async () => undefined) },
    presentation: { updateConfigurations: vi.fn(async () => undefined) },
    storylines: {
      publish: vi.fn(async () => undefined),
      createRun: vi.fn(async () => undefined),
      proposeObservation: vi.fn(async () => undefined),
      acceptObservation: vi.fn(async () => undefined),
      rejectObservation: vi.fn(async () => undefined),
    },
    memories: {
      createScope: vi.fn(async () => undefined),
      propose: vi.fn(async () => undefined),
      accept: vi.fn(async () => undefined),
      reject: vi.fn(async () => undefined),
      correct: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    },
  };
}
