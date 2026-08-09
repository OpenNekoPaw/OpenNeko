import { describe, expect, it, vi } from 'vitest';
import { CharacterFoundationCommandService } from '../application/character-foundation-command-service';

describe('CharacterFoundationCommandService', () => {
  it('delegates Character and World commands to their one owning service', async () => {
    const services = createServices();
    const service = new CharacterFoundationCommandService(services);
    const characterInput = {
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
    };
    const worldInput = {
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    };

    await service.execute({ operation: 'character-project-create', input: characterInput });
    await service.execute({ operation: 'world-run-create', input: worldInput });

    expect(services.characterAuthoring.createProject).toHaveBeenCalledWith(
      characterInput,
      undefined,
    );
    expect(services.worldRuntime.createRun).toHaveBeenCalledWith(worldInput, undefined);
    expect(services.characterAuthoring.publish).not.toHaveBeenCalled();
    expect(services.rooms.createRoom).not.toHaveBeenCalled();
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
    relationships: { create: vi.fn(async () => undefined) },
    interactions: { createDialogue: vi.fn(async () => undefined) },
    rooms: { createRoom: vi.fn(async () => undefined) },
    roomInteractions: { createRun: vi.fn(async () => undefined) },
    worldAuthoring: {
      createProject: vi.fn(async () => undefined),
      updateDraft: vi.fn(async () => undefined),
      setReviewStatus: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
    },
    worldRuntime: { createRun: vi.fn(async () => undefined) },
  };
}
