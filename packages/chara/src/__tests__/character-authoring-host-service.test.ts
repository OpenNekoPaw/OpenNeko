import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterProject,
  type CharacterVersion,
} from '@neko/chara/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterAuthoringService } from '../application/character-authoring-service';
import { CharacterAuthoringHostService } from '../application/character-authoring-host-service';
import type { CharacterStorylineService } from '../application/character-storyline-service';
import type { CharacterVersionDeletionService } from '../application/character-version-deletion-service';
import type { CharacterVersionLineageRepository } from '../application/character-version-lineage-repository';
import { CharacterVersionReferenceInventoryService } from '../application/character-version-reference-service';

describe('CharacterAuthoringHostService', () => {
  it('projects only the exact project record, publications, and local diagnostics', async () => {
    const project = characterProject('character-1');
    const version = characterVersion('character-1', 'version-1');
    const service = createService({
      projects: [project, characterProject('character-2')],
      versions: [version, characterVersion('character-2', 'version-2')],
      diagnostics: [
        { recordKind: 'character-version', recordId: 'version-1', message: 'Review note' },
        { recordKind: 'character-project', recordId: 'character-2', message: 'Sibling failure' },
      ],
    });

    await expect(service.getSnapshot('character-1')).resolves.toEqual({
      project,
      versions: [version],
      authoringTestSnapshots: [],
      storylines: [],
      storylineDrafts: [],
      storylineVersions: [],
      lineage: null,
      referenceInventories: [
        {
          characterVersionId: 'version-1',
          coverage: 'complete',
          references: [],
          diagnostics: [],
        },
      ],
      diagnostics: [
        {
          owner: 'character',
          recordKind: 'character-version',
          recordId: 'version-1',
          message: 'Review note',
        },
      ],
    });
  });

  it('rejects a catalog from another Content Project without reading an active target', async () => {
    const service = createService({
      scope: { kind: 'content-project', contentProjectId: 'content-other' },
      projects: [characterProject('character-1')],
    });

    await expect(service.getSnapshot('character-1')).rejects.toThrow(
      'does not match its exact authority',
    );
  });

  it('rejects a snapshot read for another CharacterProject before catalog access', async () => {
    const readAuthoringCatalog = vi.fn();
    const service = new CharacterAuthoringHostService({
      scope: { kind: 'content-project', contentProjectId: 'content-1' },
      characterProjectId: 'character-1',
      catalog: { readAuthoringCatalog },
      authoring: {} as CharacterAuthoringService,
      storylines: {} as CharacterStorylineService,
      lineage: { readLineage: vi.fn(), saveLineage: vi.fn() },
      references: emptyReferenceInventoryService(),
      deletion: {} as CharacterVersionDeletionService,
    });

    await expect(service.getSnapshot('character-2')).rejects.toThrow(
      'snapshot targets another CharacterProject',
    );
    expect(readAuthoringCatalog).not.toHaveBeenCalled();
  });

  it('delegates an exact authoring command and then reloads the canonical snapshot', async () => {
    const updateDraft = vi.fn(async () => characterProject('character-1'));
    const service = createService({ projects: [characterProject('character-1')] }, { updateDraft });
    const draft = definition('Updated');

    const snapshot = await service.execute({
      operation: 'character-project-update-draft',
      input: { characterProjectId: 'character-1', draft },
    });

    expect(updateDraft).toHaveBeenCalledWith(
      { characterProjectId: 'character-1', draft },
      undefined,
    );
    expect(snapshot.project.characterProjectId).toBe('character-1');
  });

  it('captures an authoring-test snapshot through the exact authoring target', async () => {
    const captureAuthoringTest = vi.fn();
    const service = createService(
      { projects: [characterProject('character-1')] },
      { captureAuthoringTest },
    );

    await service.execute({
      operation: 'character-authoring-test-capture',
      input: {
        characterProjectId: 'character-1',
        authoringTestSnapshotId: 'authoring-test-1',
      },
    });

    expect(captureAuthoringTest).toHaveBeenCalledWith(
      {
        characterProjectId: 'character-1',
        authoringTestSnapshotId: 'authoring-test-1',
      },
      undefined,
    );
  });

  it('continues and deletes only the exact selected CharacterVersion through Chara services', async () => {
    const continueFromVersion = vi.fn();
    const deleteVersion = vi.fn();
    const service = createService(
      {
        projects: [characterProject('character-1')],
        versions: [characterVersion('character-1', 'version-1')],
      },
      { continueFromVersion },
      {},
      { deletion: { deleteVersion } },
    );

    await service.execute({
      operation: 'character-version-continue',
      input: {
        characterProjectId: 'character-1',
        characterVersionId: 'version-1',
        replaceWorkingDraft: true,
      },
    });
    await service.execute({
      operation: 'character-version-delete',
      input: { characterProjectId: 'character-1', characterVersionId: 'version-1' },
    });

    expect(continueFromVersion).toHaveBeenCalledWith(
      {
        characterProjectId: 'character-1',
        characterVersionId: 'version-1',
        replaceWorkingDraft: true,
      },
      undefined,
    );
    expect(deleteVersion).toHaveBeenCalledWith(
      { characterProjectId: 'character-1', characterVersionId: 'version-1' },
      undefined,
    );
  });

  it('keeps a corrupt lineage local to the version projection with a visible diagnostic', async () => {
    const service = createService(
      {
        projects: [characterProject('character-1')],
        versions: [characterVersion('character-1', 'version-1')],
      },
      {},
      {},
      {
        lineage: {
          readLineage: vi.fn(async () => {
            throw new Error('Lineage bytes are invalid.');
          }),
        },
      },
    );

    await expect(service.getSnapshot('character-1')).resolves.toMatchObject({
      project: { characterProjectId: 'character-1' },
      lineage: null,
      diagnostics: [
        {
          owner: 'character',
          recordKind: 'character-version-lineage',
          recordId: 'character-1',
          message: 'Lineage bytes are invalid.',
        },
      ],
    });
  });

  it('rejects a command for another CharacterProject before mutation', async () => {
    const captureAuthoringTest = vi.fn();
    const service = createService(
      { projects: [characterProject('character-1')] },
      { captureAuthoringTest },
    );

    await expect(
      service.execute({
        operation: 'character-authoring-test-capture',
        input: {
          characterProjectId: 'character-2',
          authoringTestSnapshotId: 'authoring-test-2',
        },
      }),
    ).rejects.toThrow('targets another CharacterProject');
    expect(captureAuthoringTest).not.toHaveBeenCalled();
  });

  it('executes Storyline commands only for a Storyline owned by the exact target', async () => {
    const publish = vi.fn();
    const readCatalog = vi.fn(async () => [
      {
        storyline: {
          characterStorylineId: 'storyline-1',
          characterProjectId: 'character-1',
          displayName: 'First storyline',
          createdAt: '2026-08-11T00:00:00.000Z',
          updatedAt: '2026-08-11T00:00:00.000Z',
        },
        versions: [],
      },
    ]);
    const service = createService(
      { projects: [characterProject('character-1')] },
      {},
      { publish, readCatalog },
    );

    await service.execute({
      operation: 'character-storyline-publish',
      input: {
        characterStorylineId: 'storyline-1',
        characterStorylineVersionId: 'storyline-version-1',
        label: 'Opening',
      },
    });

    expect(publish).toHaveBeenCalledWith(
      {
        characterStorylineId: 'storyline-1',
        characterStorylineVersionId: 'storyline-version-1',
        label: 'Opening',
      },
      undefined,
    );
  });
});

function createService(
  catalog: Partial<
    Awaited<
      ReturnType<
        import('../application/character-durable-catalog').CharacterAuthoringCatalogPort['readAuthoringCatalog']
      >
    >
  >,
  authoringMethods: Partial<CharacterAuthoringService> = {},
  storylineMethods: Partial<CharacterStorylineService> = {},
  infrastructure: {
    readonly lineage?: Partial<CharacterVersionLineageRepository>;
    readonly deletion?: Partial<CharacterVersionDeletionService>;
  } = {},
): CharacterAuthoringHostService {
  const authoring = {
    updateDraft: vi.fn(),
    setReviewStatus: vi.fn(),
    publish: vi.fn(),
    ...authoringMethods,
  } as unknown as CharacterAuthoringService;
  return new CharacterAuthoringHostService({
    scope: { kind: 'content-project', contentProjectId: 'content-1' },
    characterProjectId: 'character-1',
    catalog: {
      readAuthoringCatalog: async () => ({
        scope: { kind: 'content-project', contentProjectId: 'content-1' },
        projects: [],
        versions: [],
        authoringTestSnapshots: [],
        diagnostics: [],
        ...catalog,
      }),
    },
    authoring,
    storylines: {
      readCatalog: vi.fn(async () => []),
      ...storylineMethods,
    } as unknown as CharacterStorylineService,
    lineage: {
      readLineage: vi.fn(async () => undefined),
      saveLineage: vi.fn(),
      ...infrastructure.lineage,
    },
    references: emptyReferenceInventoryService(),
    deletion: {
      deleteVersion: vi.fn(),
      ...infrastructure.deletion,
    } as unknown as CharacterVersionDeletionService,
  });
}

function emptyReferenceInventoryService(): CharacterVersionReferenceInventoryService {
  const reader = (ownerKind: 'chara' | 'agent' | 'project') => ({
    ownerKind,
    readReferences: vi.fn(async () => []),
  });
  return new CharacterVersionReferenceInventoryService({
    chara: reader('chara'),
    agent: reader('agent'),
    project: reader('project'),
  });
}

function definition(summary = 'Summary') {
  return {
    summary,
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

function characterProject(characterProjectId: string): CharacterProject {
  return {
    characterProjectId,
    displayName: characterProjectId,
    draft: definition(),
    evidence: [],
    candidates: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  };
}

function characterVersion(
  characterProjectId: string,
  characterVersionId: string,
): CharacterVersion {
  return {
    characterVersionId,
    characterProjectId,
    label: characterVersionId,
    definition: definition(),
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-11T00:00:00.000Z',
  };
}
