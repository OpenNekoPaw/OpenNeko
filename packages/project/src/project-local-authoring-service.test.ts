import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  ProjectLocalCharacterCreationError,
  ProjectLocalAuthoringService,
  ProjectLocalTargetLinkError,
} from './application/project-local-authoring-service';
import { ProjectCompositionService } from './application/project-composition-service';
import {
  projectPublicationReadiness,
  projectTargetTree,
} from './application/project-target-projection';
import { InMemoryProjectCompositionRepository } from './testing';

const authority = { contentProjectId: 'content-project-1', workspaceId: 'workspace-1' };

describe('Project-local authoring workflow', () => {
  it('returns a Character binding only after Character, membership, Entity and association commits succeed', async () => {
    const fixture = await createFixture();
    const result = await fixture.service.createCharacter(
      authority,
      {
        characterProjectId: 'character-1',
        displayName: 'Lin',
        draft: characterDefinition(),
        sources: emptyCharacterSources(),
      },
      createEntity('entity-1', 'Lin'),
    );
    expect(result.target).toEqual({
      kind: 'character-project',
      characterProjectId: 'character-1',
    });
    expect(result.receipt).toEqual({
      authority,
      target: result.target,
      entityId: 'entity-1',
      completedSteps: [
        'character-project',
        'project-membership',
        'project-entity',
        'entity-character-association',
      ],
    });
    await expect(fixture.compositions.require('content-project-1')).resolves.toMatchObject({
      localTargets: [result.target],
      entityCharacterAssociations: [{ entityId: 'entity-1', characterProjectId: 'character-1' }],
    });
    expect(fixture.entities.createCharacterEntity).toHaveBeenCalledWith(
      {
        entityId: 'entity-1',
        semantic: {
          kind: 'character',
          names: { canonical: 'Lin', display: 'Lin', aliases: [] },
          representations: [],
        },
        createdAt: '2026-08-12T00:00:00.000Z',
      },
      undefined,
    );
  });

  it('returns a World binding only after domain and membership commits succeed', async () => {
    const fixture = await createFixture();
    const result = await fixture.service.createWorld(authority, {
      worldProjectId: 'world-1',
      title: 'Archive City',
      draft: worldDefinition(),
    });
    expect(result.target).toEqual({ kind: 'world-project', worldProjectId: 'world-1' });
    await expect(fixture.compositions.require('content-project-1')).resolves.toMatchObject({
      localTargets: [result.target],
    });
  });

  it('preserves a created Character and reports the exact missing membership without rollback', async () => {
    const fixture = await createFixture();
    vi.spyOn(fixture.repository, 'save').mockRejectedValueOnce(new Error('disk full'));
    let captured: ProjectLocalCharacterCreationError | undefined;
    try {
      await fixture.service.createCharacter(
        authority,
        {
          characterProjectId: 'character-unlinked',
          displayName: 'Unlinked',
          draft: characterDefinition(),
          sources: emptyCharacterSources(),
        },
        createEntity('entity-unlinked', 'Unlinked'),
      );
    } catch (error) {
      if (error instanceof ProjectLocalCharacterCreationError) captured = error;
    }
    expect(captured).toMatchObject({
      code: 'project-local-character-creation-incomplete',
      repairActions: ['retry-missing-step'],
      receipt: {
        authority,
        target: { kind: 'character-project', characterProjectId: 'character-unlinked' },
        entityId: 'entity-unlinked',
        completedSteps: ['character-project'],
        nextStep: 'project-membership',
      },
    });
    expect(fixture.characters.deleteUnlinkedProject).not.toHaveBeenCalled();
    expect(fixture.entities.createCharacterEntity).not.toHaveBeenCalled();
  });

  it('retries only missing exact steps without recreating the Character', async () => {
    const fixture = await createFixture();
    vi.spyOn(fixture.repository, 'save').mockRejectedValueOnce(new Error('disk full'));
    const entity = createEntity('entity-retry', 'Retry');
    let receipt;
    try {
      await fixture.service.createCharacter(
        authority,
        {
          characterProjectId: 'character-retry',
          displayName: 'Retry',
          draft: characterDefinition(),
          sources: emptyCharacterSources(),
        },
        entity,
      );
    } catch (error) {
      if (error instanceof ProjectLocalCharacterCreationError) receipt = error.receipt;
    }
    if (!receipt) throw new Error('Expected a partial Character creation receipt.');

    await expect(fixture.service.retryCharacterCreation(receipt, entity)).resolves.toMatchObject({
      completedSteps: [
        'character-project',
        'project-membership',
        'project-entity',
        'entity-character-association',
      ],
    });
    expect(fixture.characters.createProject).toHaveBeenCalledTimes(1);
    expect(fixture.entities.createCharacterEntity).toHaveBeenCalledTimes(1);
  });

  it('retries only association after an association failure and preserves the Entity', async () => {
    const fixture = await createFixture();
    const associate = vi.spyOn(fixture.compositions, 'associateEntityCharacter');
    associate.mockRejectedValueOnce(new Error('association write failed'));
    const entity = createEntity('entity-association', 'Associated');
    let receipt;
    try {
      await fixture.service.createCharacter(
        authority,
        {
          characterProjectId: 'character-association',
          displayName: 'Associated',
          draft: characterDefinition(),
          sources: emptyCharacterSources(),
        },
        entity,
      );
    } catch (error) {
      if (error instanceof ProjectLocalCharacterCreationError) receipt = error.receipt;
    }
    expect(receipt).toMatchObject({
      completedSteps: ['character-project', 'project-membership', 'project-entity'],
      nextStep: 'entity-character-association',
    });
    if (!receipt) throw new Error('Expected a partial Character creation receipt.');

    await fixture.service.retryCharacterCreation(receipt, entity);
    expect(fixture.characters.createProject).toHaveBeenCalledTimes(1);
    expect(fixture.entities.createCharacterEntity).toHaveBeenCalledTimes(1);
    expect(associate).toHaveBeenCalledTimes(2);
  });

  it('selects an existing Entity only by exact identity and rejects a redirected retry', async () => {
    const fixture = await createFixture();
    await fixture.service.createCharacter(
      authority,
      {
        characterProjectId: 'character-existing',
        displayName: 'Existing',
        draft: characterDefinition(),
        sources: emptyCharacterSources(),
      },
      { kind: 'existing', entityId: 'entity-exact' },
    );
    expect(fixture.entities.requireCharacterEntity).toHaveBeenCalledWith('entity-exact', undefined);
    expect(fixture.entities.createCharacterEntity).not.toHaveBeenCalled();

    await expect(
      fixture.service.retryCharacterCreation(
        {
          authority,
          target: { kind: 'character-project', characterProjectId: 'character-existing' },
          entityId: 'entity-exact',
          completedSteps: ['character-project'],
          nextStep: 'project-membership',
        },
        { kind: 'existing', entityId: 'entity-by-same-name' },
      ),
    ).rejects.toThrow(/identity mismatch/u);
  });

  it('rejects a retry receipt with no missing step instead of reporting no-op success', async () => {
    const fixture = await createFixture();
    const entity = createEntity('entity-complete', 'Complete');
    const created = await fixture.service.createCharacter(
      authority,
      {
        characterProjectId: 'character-complete',
        displayName: 'Complete',
        draft: characterDefinition(),
        sources: emptyCharacterSources(),
      },
      entity,
    );

    await expect(fixture.service.retryCharacterCreation(created.receipt, entity)).rejects.toThrow(
      /already complete/u,
    );
    expect(fixture.characters.createProject).toHaveBeenCalledTimes(1);
    expect(fixture.entities.createCharacterEntity).toHaveBeenCalledTimes(1);
  });

  it('removes membership without deleting the owning Character facts', async () => {
    const fixture = await createFixture();
    const created = await fixture.service.createCharacter(
      authority,
      {
        characterProjectId: 'character-retained',
        displayName: 'Retained',
        draft: characterDefinition(),
        sources: emptyCharacterSources(),
      },
      createEntity('entity-retained', 'Retained'),
    );

    await expect(
      fixture.compositions.removeLocalTarget(authority.contentProjectId, created.target),
    ).rejects.toMatchObject({ code: 'project-entity-character-target-associated' });
    expect(fixture.characters.deleteUnlinkedProject).not.toHaveBeenCalled();
  });

  it('keeps the World-only repair path explicit when membership commit fails', async () => {
    const fixture = await createFixture();
    vi.spyOn(fixture.repository, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(
      fixture.service.createWorld(authority, {
        worldProjectId: 'world-unlinked',
        title: 'Unlinked',
        draft: worldDefinition(),
      }),
    ).rejects.toBeInstanceOf(ProjectLocalTargetLinkError);
  });

  it('delegates explicit unlinked deletion to only the exact owning domain', async () => {
    const fixture = await createFixture();
    await fixture.service.deleteUnlinkedTarget({
      kind: 'world-project',
      worldProjectId: 'world-unlinked',
    });
    expect(fixture.worlds.deleteUnlinkedProject).toHaveBeenCalledWith('world-unlinked', undefined);
    expect(fixture.characters.deleteUnlinkedProject).not.toHaveBeenCalled();
  });

  it('blocks publication for missing exact dependencies and exposes source Studio handoff', () => {
    const tree = projectTargetTree({
      composition: {
        contentProjectId: 'content-project-1',
        localTargets: [],
        dependencies: [
          { kind: 'character-version', characterVersionId: 'character-version-1' },
          { kind: 'world-experience-version', worldExperienceVersionId: 'experience-1' },
        ],
        entityCharacterAssociations: [],
      },
      localTargetResolutions: [],
      dependencyResolutions: [
        {
          identity: 'character-version:character-version-1',
          label: 'Lin',
          sourceStudioTarget: {
            kind: 'character-studio',
            characterProjectId: 'character-project-1',
          },
        },
      ],
    });
    expect(projectPublicationReadiness(tree)).toEqual({
      ready: false,
      unavailableIdentities: ['world-experience-version:experience-1'],
    });
    expect(tree[0]).toMatchObject({
      readOnly: true,
      sourceStudioTarget: {
        kind: 'character-studio',
        characterProjectId: 'character-project-1',
      },
    });
    expect(tree[0]?.diagnostic).toBeUndefined();
  });
});

async function createFixture() {
  const repository = new InMemoryProjectCompositionRepository();
  const compositions = new ProjectCompositionService(repository);
  await compositions.create('content-project-1');
  const characters = {
    createProject: vi.fn(async (input: { characterProjectId: string; displayName: string }) => ({
      ...input,
      draft: characterDefinition(),
      evidence: [],
      candidates: [],
      reviewStatus: 'draft' as const,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    })),
    deleteUnlinkedProject: vi.fn(async () => undefined),
  };
  const worlds = {
    createProject: vi.fn(async (input: { worldProjectId: string; title: string }) => ({
      ...input,
      draft: worldDefinition(),
      sourceRefs: [],
      reviewStatus: 'draft' as const,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    })),
    deleteUnlinkedProject: vi.fn(async () => undefined),
  };
  const entities = {
    createCharacterEntity: vi.fn(async () => undefined),
    requireCharacterEntity: vi.fn(async () => undefined),
  };
  return {
    repository,
    compositions,
    characters,
    entities,
    worlds,
    service: new ProjectLocalAuthoringService({
      compositions,
      characters,
      entities,
      worlds,
      now: () => '2026-08-12T00:00:00.000Z',
    }),
  };
}

function createEntity(entityId: string, displayName: string) {
  return {
    kind: 'create' as const,
    entityId,
    name: displayName,
  };
}

function emptyCharacterSources() {
  return { evidence: [], assetRepresentations: [] } as const;
}

function characterDefinition() {
  return {
    summary: 'A careful archivist.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}

function worldDefinition() {
  return {
    background: 'An archive city.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}
