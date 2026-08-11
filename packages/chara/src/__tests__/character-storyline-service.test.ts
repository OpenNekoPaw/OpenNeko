import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterVersion,
  type CharacterStoryline,
  type CharacterStorylineDraft,
  type CharacterStorylineVersion,
  type CharacterVersion,
} from '@neko/chara/contracts';
import {
  CharacterStorylineError,
  CharacterStorylineService,
  type CharacterStorylineRepository,
} from '../application/character-storyline-service';
import { describe, expect, it } from 'vitest';

const now = '2026-08-10T00:00:00.000Z';

describe('CharacterStorylineService', () => {
  it('manages independent stable Storylines and immutable publications', async () => {
    const repository = preparedRepository();
    const service = new CharacterStorylineService(repository, { now: () => now });
    await service.create(createInput('storyline-old-city', 'Old City Reunion'));
    await service.create(createInput('storyline-archive', 'Archive Lockdown'));

    const first = await service.publish({
      characterStorylineId: 'storyline-old-city',
      characterStorylineVersionId: 'storyline-version-1',
      label: 'First publication',
    });
    await service.updateDraft({
      characterStorylineId: 'storyline-old-city',
      draft: { ...draftInput(), nodes: [node('arrival', 'A changed situation')] },
    });
    const second = await service.publish({
      characterStorylineId: 'storyline-old-city',
      characterStorylineVersionId: 'storyline-version-2',
      label: 'Second publication',
    });

    expect(first.characterStorylineId).toBe(second.characterStorylineId);
    expect(first.nodes[0]?.context.situation).toBe('The old gate opens at dusk.');
    expect(second.nodes[0]?.context.situation).toBe('A changed situation');
    expect(repository.storylines).toHaveLength(2);
    expect(repository.versions).toHaveLength(2);
  });

  it('compares versions and restores an exact old publication as the mutable draft', async () => {
    const repository = preparedRepository();
    const service = new CharacterStorylineService(repository, { now: () => now });
    await service.create(createInput('storyline-old-city', 'Old City Reunion'));
    await service.publish({
      characterStorylineId: 'storyline-old-city',
      characterStorylineVersionId: 'storyline-version-1',
      label: 'First',
    });
    await service.updateDraft({
      characterStorylineId: 'storyline-old-city',
      draft: {
        ...draftInput(),
        nodeOrder: ['arrival', 'meeting'],
        nodes: [node('arrival', 'Changed'), node('meeting', 'They finally meet.')],
        edges: [{ fromStorylineNodeId: 'arrival', toStorylineNodeId: 'meeting' }],
      },
    });
    await service.publish({
      characterStorylineId: 'storyline-old-city',
      characterStorylineVersionId: 'storyline-version-2',
      label: 'Second',
    });

    await expect(
      service.compare({
        characterStorylineId: 'storyline-old-city',
        leftCharacterStorylineVersionId: 'storyline-version-1',
        rightCharacterStorylineVersionId: 'storyline-version-2',
      }),
    ).resolves.toMatchObject({
      addedStorylineNodeIds: ['meeting'],
      changedStorylineNodeIds: ['arrival'],
    });
    const restored = await service.restoreAsDraft({
      characterStorylineId: 'storyline-old-city',
      characterStorylineVersionId: 'storyline-version-1',
    });
    expect(restored.nodeOrder).toEqual(['arrival']);
  });

  it('rejects cross-project CharacterVersion binding without changing the Storyline', async () => {
    const repository = preparedRepository();
    repository.characterVersions.set(
      'character-version-foreign',
      characterVersion('character-version-foreign', 'character-project-foreign'),
    );
    const service = new CharacterStorylineService(repository, { now: () => now });
    await service.create(createInput('storyline-old-city', 'Old City Reunion'));

    await expect(
      service.updateDraft({
        characterStorylineId: 'storyline-old-city',
        draft: { ...draftInput(), characterVersionId: 'character-version-foreign' },
      }),
    ).rejects.toMatchObject({
      code: 'character-storyline-binding-mismatch',
    } satisfies Partial<CharacterStorylineError>);
    expect(repository.drafts[0]?.characterVersionId).toBe('character-version-a');
  });
});

class InMemoryStorylineRepository implements CharacterStorylineRepository {
  readonly projects = new Set(['character-project-a']);
  readonly characterVersions = new Map<string, CharacterVersion>();
  readonly storylines: CharacterStoryline[] = [];
  readonly drafts: CharacterStorylineDraft[] = [];
  readonly versions: CharacterStorylineVersion[] = [];

  async readCharacterProject(id: string) {
    return this.projects.has(id) ? { characterProjectId: id } : undefined;
  }
  async readCharacterVersion(id: string) {
    return cloneOptional(this.characterVersions.get(id));
  }
  async createStoryline(storyline: CharacterStoryline, draft: CharacterStorylineDraft) {
    this.storylines.push(structuredClone(storyline));
    this.drafts.push(structuredClone(draft));
  }
  async updateStoryline(storyline: CharacterStoryline, draft: CharacterStorylineDraft) {
    this.storylines.splice(
      this.storylines.findIndex(
        (item) => item.characterStorylineId === storyline.characterStorylineId,
      ),
      1,
      structuredClone(storyline),
    );
    this.drafts.splice(
      this.drafts.findIndex((item) => item.characterStorylineId === draft.characterStorylineId),
      1,
      structuredClone(draft),
    );
  }
  async readStoryline(id: string) {
    return cloneOptional(this.storylines.find((item) => item.characterStorylineId === id));
  }
  async readStorylineDraft(id: string) {
    return cloneOptional(this.drafts.find((item) => item.characterStorylineId === id));
  }
  async storeStorylineVersion(version: CharacterStorylineVersion) {
    this.versions.push(structuredClone(version));
  }
  async readStorylineVersion(id: string) {
    return cloneOptional(this.versions.find((item) => item.characterStorylineVersionId === id));
  }
  async listStorylines(projectId: string) {
    return structuredClone(this.storylines.filter((item) => item.characterProjectId === projectId));
  }
  async listStorylineVersions(storylineId: string) {
    return structuredClone(
      this.versions.filter((item) => item.characterStorylineId === storylineId),
    );
  }
  async deleteStoryline(id: string) {
    this.storylines.splice(
      this.storylines.findIndex((item) => item.characterStorylineId === id),
      1,
    );
  }
}

function preparedRepository() {
  const repository = new InMemoryStorylineRepository();
  repository.characterVersions.set(
    'character-version-a',
    characterVersion('character-version-a', 'character-project-a'),
  );
  return repository;
}

function createInput(characterStorylineId: string, displayName: string) {
  return {
    characterStorylineId,
    characterProjectId: 'character-project-a',
    displayName,
    draft: draftInput(),
  } as const;
}

function draftInput() {
  return {
    characterVersionId: 'character-version-a',
    premise: 'An old promise returns.',
    constraints: ['Do not reveal the sealed letter.'],
    nodeOrder: ['arrival'],
    nodes: [node('arrival', 'The old gate opens at dusk.')],
    edges: [],
  } as const;
}

function node(storylineNodeId: string, situation: string) {
  return {
    storylineNodeId,
    title: storylineNodeId,
    spoilerVisibility: 'visible',
    context: {
      situation,
      time: 'Dusk',
      location: 'Old city gate',
      characterState: 'Cautious',
      relationshipState: 'Estranged allies',
      allowedStoryFacts: ['The gate is open.'],
      forbiddenStoryFacts: ['The letter names the traitor.'],
      narrativeMemories: ['They made a promise here.'],
      knowledgeBoundary: ['Does not know who sent the letter.'],
      behaviorConstraints: ['Avoid immediate trust.'],
      expressionConstraints: ['Speak tersely.'],
      authorOnlyNotes: ['The messenger is watching.'],
    },
  } as const;
}

function characterVersion(id: string, projectId: string): CharacterVersion {
  return parseCharacterVersion({
    characterVersionId: id,
    characterProjectId: projectId,
    label: 'Lin',
    definition: {
      summary: 'Archive keeper',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    acceptedEvidenceIds: [],
    publishedAt: now,
  });
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
