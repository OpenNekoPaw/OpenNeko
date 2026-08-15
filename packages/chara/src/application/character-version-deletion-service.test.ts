import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterProject,
  parseCharacterVersion,
  type CharacterProject,
  type CharacterVersion,
  type CharacterVersionLineage,
  type CharacterVersionReference,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  CharacterVersionDeletionBlockedError,
  CharacterVersionDeletionService,
  type CharacterVersionDeletionRepository,
} from './character-version-deletion-service';
import type { CharacterVersionLineageRepository } from './character-version-lineage-repository';
import {
  CharacterVersionReferenceInventoryService,
  type CharacterVersionReferenceReader,
} from './character-version-reference-service';

const projectId = 'character-project-a';
const versionId = 'character-version-a';

describe('CharacterVersion deletion service', () => {
  it('blocks a referenced version with the exact owner inventory and mutates nothing', async () => {
    const repository = memoryRepository({
      project: project(),
      versions: [version(versionId), version('character-version-sibling')],
      lineage: {
        characterProjectId: projectId,
        relations: [
          { characterVersionId: versionId, parentCharacterVersionIds: [] },
          { characterVersionId: 'character-version-sibling', parentCharacterVersionIds: [] },
        ],
      },
    });
    const service = deletionService(repository, {
      agent: [reference('agent', 'conversation', 'conversation-a', versionId)],
    });
    const beforeLineage = structuredClone(repository.lineage);

    const error = await rejected(
      service.deleteVersion({ characterProjectId: projectId, characterVersionId: versionId }),
    );

    expect(error).toBeInstanceOf(CharacterVersionDeletionBlockedError);
    expect(error).toMatchObject({
      reason: 'referenced',
      referenceInventory: {
        coverage: 'complete',
        references: [
          {
            ownerKind: 'agent',
            referenceKind: 'conversation',
            referenceId: 'conversation-a',
            characterVersionId: versionId,
          },
        ],
      },
    });
    expect(repository.versions.has(versionId)).toBe(true);
    expect(repository.lineage).toEqual(beforeLineage);
    expect(repository.deleted).toEqual([]);
  });

  it('blocks only the target when one owner inventory fails and preserves its diagnostics', async () => {
    const repository = memoryRepository({
      project: project(),
      versions: [version(versionId), version('character-version-sibling')],
      lineage: { characterProjectId: projectId, relations: [] },
    });
    const service = deletionService(repository, { failOwner: 'project' });

    const error = await rejected(
      service.deleteVersion({ characterProjectId: projectId, characterVersionId: versionId }),
    );

    expect(error).toMatchObject({
      reason: 'reference-inventory-incomplete',
      referenceInventory: {
        coverage: 'incomplete',
        diagnostics: [{ ownerKind: 'project', message: 'Project reference catalog unavailable.' }],
      },
    });
    expect(repository.versions.has(versionId)).toBe(true);
    expect(repository.versions.has('character-version-sibling')).toBe(true);
    expect(repository.deleted).toEqual([]);
  });

  it('deletes only an unreferenced version and its owned lineage relation', async () => {
    const repository = memoryRepository({
      project: project(),
      versions: [
        version('character-version-root'),
        version(versionId),
        version('character-version-sibling'),
      ],
      lineage: {
        characterProjectId: projectId,
        relations: [
          { characterVersionId: 'character-version-root', parentCharacterVersionIds: [] },
          { characterVersionId: versionId, parentCharacterVersionIds: ['character-version-root'] },
          {
            characterVersionId: 'character-version-sibling',
            parentCharacterVersionIds: ['character-version-root'],
          },
        ],
      },
    });
    const service = deletionService(repository);
    const beforeProject = structuredClone(repository.project);

    await expect(
      service.deleteVersion({ characterProjectId: projectId, characterVersionId: versionId }),
    ).resolves.toEqual({
      characterProjectId: projectId,
      characterVersionId: versionId,
      removedOwnedLineageRelation: true,
      referenceInventory: {
        characterVersionId: versionId,
        coverage: 'complete',
        references: [],
        diagnostics: [],
      },
    });
    expect(repository.versions.has(versionId)).toBe(false);
    expect(repository.versions.has('character-version-root')).toBe(true);
    expect(repository.versions.has('character-version-sibling')).toBe(true);
    expect(repository.lineage?.relations).toEqual([
      { characterVersionId: 'character-version-root', parentCharacterVersionIds: [] },
      {
        characterVersionId: 'character-version-sibling',
        parentCharacterVersionIds: ['character-version-root'],
      },
    ]);
    expect(repository.project).toEqual(beforeProject);
    expect(repository.deleted).toEqual([versionId]);
  });

  it('treats the working draft and derived versions as Chara-owned inbound references', async () => {
    const draftRepository = memoryRepository({
      project: project(versionId),
      versions: [version(versionId)],
      lineage: { characterProjectId: projectId, relations: [] },
    });
    const draftError = await rejected(
      deletionService(draftRepository).deleteVersion({
        characterProjectId: projectId,
        characterVersionId: versionId,
      }),
    );
    expect(draftError).toMatchObject({
      reason: 'referenced',
      referenceInventory: {
        references: [
          expect.objectContaining({ referenceKind: 'working-draft-basis', referenceId: projectId }),
        ],
      },
    });

    const parentRepository = memoryRepository({
      project: project(),
      versions: [version(versionId), version('character-version-child')],
      lineage: {
        characterProjectId: projectId,
        relations: [
          { characterVersionId: versionId, parentCharacterVersionIds: [] },
          { characterVersionId: 'character-version-child', parentCharacterVersionIds: [versionId] },
        ],
      },
    });
    const parentError = await rejected(
      deletionService(parentRepository).deleteVersion({
        characterProjectId: projectId,
        characterVersionId: versionId,
      }),
    );
    expect(parentError).toMatchObject({
      reason: 'referenced',
      referenceInventory: {
        references: [
          expect.objectContaining({
            referenceKind: 'lineage-child',
            referenceId: 'character-version-child',
          }),
        ],
      },
    });
  });

  it('does not rebind Storyline, Conversation, Room, memory or Project refs when a new branch appears', async () => {
    const exactFacts = {
      storyline: reference('chara', 'storyline-version', 'storyline-version-a', versionId),
      conversation: reference('agent', 'conversation', 'conversation-a', versionId),
      room: reference('chara', 'room-run-participant', 'room-run-a:participant-a', versionId),
      memory: reference('chara', 'companion-memory', 'memory-a', versionId),
      project: reference('project', 'project-dependency', 'project-a:entity-a', versionId),
    } as const;
    const before = structuredClone(exactFacts);
    const repository = memoryRepository({
      project: project(),
      versions: [version(versionId), version('character-version-new-branch')],
      lineage: {
        characterProjectId: projectId,
        relations: [
          { characterVersionId: versionId, parentCharacterVersionIds: [] },
          { characterVersionId: 'character-version-new-branch', parentCharacterVersionIds: [] },
        ],
      },
    });
    const service = deletionService(repository, {
      chara: [exactFacts.storyline, exactFacts.room, exactFacts.memory],
      agent: [exactFacts.conversation],
      project: [exactFacts.project],
    });

    const error = await rejected(
      service.deleteVersion({ characterProjectId: projectId, characterVersionId: versionId }),
    );

    expect(error).toMatchObject({ reason: 'referenced' });
    expect(exactFacts).toEqual(before);
    expect(repository.versions.has('character-version-new-branch')).toBe(true);
    expect(repository.lineage?.relations).toHaveLength(2);
  });
});

interface MemoryRepository
  extends CharacterVersionDeletionRepository, CharacterVersionLineageRepository {
  readonly project: CharacterProject;
  readonly versions: Map<string, CharacterVersion>;
  lineage?: CharacterVersionLineage;
  readonly deleted: string[];
}

function memoryRepository(input: {
  readonly project: CharacterProject;
  readonly versions: readonly CharacterVersion[];
  readonly lineage?: CharacterVersionLineage;
}): MemoryRepository {
  const versions = new Map(input.versions.map((item) => [item.characterVersionId, item]));
  return {
    project: structuredClone(input.project),
    versions,
    lineage: input.lineage === undefined ? undefined : structuredClone(input.lineage),
    deleted: [],
    async readProject(identity) {
      return identity === this.project.characterProjectId
        ? structuredClone(this.project)
        : undefined;
    },
    async readPublication(identity) {
      const item = this.versions.get(identity);
      return item === undefined ? undefined : structuredClone(item);
    },
    async deletePublication(characterProjectId, characterVersionId) {
      if (characterProjectId !== this.project.characterProjectId) {
        throw new Error(`Unexpected CharacterProject '${characterProjectId}'.`);
      }
      if (!this.versions.delete(characterVersionId)) {
        throw new Error(`CharacterVersion '${characterVersionId}' is unavailable.`);
      }
      this.deleted.push(characterVersionId);
    },
    async readLineage(identity) {
      return identity === this.project.characterProjectId && this.lineage !== undefined
        ? structuredClone(this.lineage)
        : undefined;
    },
    async saveLineage(lineage) {
      this.lineage = structuredClone(lineage);
    },
  };
}

function deletionService(
  repository: MemoryRepository,
  options: {
    readonly chara?: readonly CharacterVersionReference[];
    readonly agent?: readonly CharacterVersionReference[];
    readonly project?: readonly CharacterVersionReference[];
    readonly failOwner?: CharacterVersionReferenceReader['ownerKind'];
  } = {},
) {
  return new CharacterVersionDeletionService({
    repository,
    lineage: repository,
    references: new CharacterVersionReferenceInventoryService({
      chara: reader('chara', options.chara ?? [], options.failOwner),
      agent: reader('agent', options.agent ?? [], options.failOwner),
      project: reader('project', options.project ?? [], options.failOwner),
    }),
  });
}

function reader(
  ownerKind: CharacterVersionReferenceReader['ownerKind'],
  references: readonly CharacterVersionReference[],
  failOwner?: CharacterVersionReferenceReader['ownerKind'],
): CharacterVersionReferenceReader {
  return {
    ownerKind,
    async readReferences(characterVersionIds) {
      if (ownerKind === failOwner) {
        throw new Error('Project reference catalog unavailable.');
      }
      const selected = new Set(characterVersionIds);
      return references.filter((item) => selected.has(item.characterVersionId));
    },
  };
}

function reference(
  ownerKind: CharacterVersionReference['ownerKind'],
  referenceKind: CharacterVersionReference['referenceKind'],
  referenceId: string,
  characterVersionId: string,
): CharacterVersionReference {
  return { ownerKind, referenceKind, referenceId, characterVersionId };
}

function project(draftBasisCharacterVersionId?: string): CharacterProject {
  return parseCharacterProject({
    characterProjectId: projectId,
    displayName: 'A',
    draft: definition(),
    ...(draftBasisCharacterVersionId === undefined ? {} : { draftBasisCharacterVersionId }),
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  });
}

function version(characterVersionId: string): CharacterVersion {
  return parseCharacterVersion({
    characterVersionId,
    characterProjectId: projectId,
    label: characterVersionId,
    definition: definition(),
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-13T00:00:00.000Z',
  });
}

function definition() {
  return {
    summary: '',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

async function rejected(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject.');
}
