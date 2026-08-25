import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type GlobalCharacterCatalog,
} from '@neko/chara-domain/contracts';
import type { GlobalWorldCatalog } from '@neko/world-domain/contracts';
import { ProjectGlobalReferenceMutationService } from './project-global-reference-mutation-service';

describe('ProjectGlobalReferenceMutationService', () => {
  it('adds, updates and removes only validated exact references', async () => {
    let references: Parameters<typeof serviceFixture>[0] = [];
    const fixture = serviceFixture(references);
    await fixture.service.execute({
      projectId: 'project-1',
      mutation: { kind: 'add', reference: characterReference('character-version-1') },
    });
    expect(fixture.add).toHaveBeenCalledOnce();

    references = [characterReference('character-version-1')];
    fixture.read.mockResolvedValue({ projectId: 'project-1', targets: [], references });
    await fixture.service.execute({
      projectId: 'project-1',
      mutation: {
        kind: 'update',
        previousReference: characterReference('character-version-1'),
        reference: characterReference('character-version-2'),
      },
    });
    expect(fixture.update).toHaveBeenCalledOnce();

    fixture.read.mockResolvedValue({
      projectId: 'project-1',
      targets: [],
      references: [characterReference('character-version-2')],
    });
    await fixture.service.execute({
      projectId: 'project-1',
      mutation: { kind: 'remove', reference: characterReference('character-version-2') },
    });
    expect(fixture.remove).toHaveBeenCalledOnce();
  });

  it('rejects unavailable versions and stale exact updates before persistence', async () => {
    const unavailable = serviceFixture([]);
    await expect(
      unavailable.service.execute({
        projectId: 'project-1',
        mutation: { kind: 'add', reference: characterReference('missing-version') },
      }),
    ).rejects.toThrow('does not belong');
    expect(unavailable.add).not.toHaveBeenCalled();

    const stale = serviceFixture([characterReference('character-version-1')]);
    await expect(
      stale.service.execute({
        projectId: 'project-1',
        mutation: {
          kind: 'update',
          previousReference: characterReference('character-version-2'),
          reference: characterReference('character-version-1'),
        },
      }),
    ).rejects.toThrow('changed before');
    expect(stale.update).not.toHaveBeenCalled();
  });
});

function serviceFixture(initialReferences: readonly ReturnType<typeof characterReference>[]) {
  const read = vi.fn(async () => ({
    projectId: 'project-1',
    targets: [],
    references: initialReferences,
  }));
  const add = vi.fn(async (fact) => fact);
  const update = vi.fn(async (input) => input.next);
  const remove = vi.fn(async (fact) => fact);
  return {
    read,
    add,
    update,
    remove,
    service: new ProjectGlobalReferenceMutationService({
      references: { readGlobalReferences: read },
      globalCharacters: { readCatalog: async () => characterCatalog() },
      globalWorlds: { readCatalog: async () => worldCatalog() },
      commits: {
        addGlobalReference: add,
        updateGlobalReference: update,
        removeGlobalReference: remove,
      },
    }),
  };
}

function characterReference(characterVersionId: string) {
  return {
    kind: 'character-version' as const,
    globalCharacterId: 'global-character-1',
    characterVersionId,
  };
}

function characterCatalog(): GlobalCharacterCatalog {
  const definition = {
    summary: '',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
  return {
    characters: [
      {
        globalCharacterId: 'global-character-1',
        displayName: 'Aster',
        currentCharacterVersionId: 'character-version-2',
        characterVersionIds: ['character-version-1', 'character-version-2'],
        createdAt: '2026-08-16T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
      },
    ],
    versions: ['character-version-1', 'character-version-2'].map((characterVersionId) => ({
      characterVersionId,
      globalCharacterId: 'global-character-1',
      label: characterVersionId,
      definition,
      acceptedEvidenceIds: [],
      publishedAt: '2026-08-16T00:00:00.000Z',
    })),
    links: [],
    diagnostics: [],
  };
}

function worldCatalog(): GlobalWorldCatalog {
  return { worlds: [], versions: [], links: [], diagnostics: [] };
}
