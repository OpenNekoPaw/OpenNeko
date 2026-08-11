import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
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
  it('returns a Character binding only after domain and membership commits succeed', async () => {
    const fixture = await createFixture();
    const result = await fixture.service.createCharacter(authority, {
      characterProjectId: 'character-1',
      displayName: 'Lin',
      draft: characterDefinition(),
    });
    expect(result.target).toEqual({
      kind: 'character-project',
      characterProjectId: 'character-1',
    });
    await expect(fixture.compositions.require('content-project-1')).resolves.toMatchObject({
      localTargets: [result.target],
    });
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

  it('preserves a created target with explicit repair actions when membership commit fails', async () => {
    const fixture = await createFixture();
    vi.spyOn(fixture.repository, 'save').mockRejectedValueOnce(new Error('disk full'));
    let captured: ProjectLocalTargetLinkError | undefined;
    try {
      await fixture.service.createCharacter(authority, {
        characterProjectId: 'character-unlinked',
        displayName: 'Unlinked',
        draft: characterDefinition(),
      });
    } catch (error) {
      if (error instanceof ProjectLocalTargetLinkError) captured = error;
    }
    expect(captured).toMatchObject({
      code: 'project-local-target-unlinked',
      target: { kind: 'character-project', characterProjectId: 'character-unlinked' },
      repairActions: ['retry-link', 'delete-through-owner'],
    });
    expect(fixture.characters.deleteUnlinkedProject).not.toHaveBeenCalled();
  });

  it('retries only the exact missing membership without recreating the Character', async () => {
    const fixture = await createFixture();
    vi.spyOn(fixture.repository, 'save').mockRejectedValueOnce(new Error('disk full'));
    const target = { kind: 'character-project' as const, characterProjectId: 'character-retry' };
    await expect(
      fixture.service.createCharacter(authority, {
        characterProjectId: target.characterProjectId,
        displayName: 'Retry',
        draft: characterDefinition(),
      }),
    ).rejects.toMatchObject({ code: 'project-local-target-unlinked', target });

    await expect(fixture.service.retryLink(authority, target)).resolves.toMatchObject({
      localTargets: [target],
    });
    expect(fixture.characters.createProject).toHaveBeenCalledTimes(1);
  });

  it('removes membership without deleting the owning Character facts', async () => {
    const fixture = await createFixture();
    const created = await fixture.service.createCharacter(authority, {
      characterProjectId: 'character-retained',
      displayName: 'Retained',
      draft: characterDefinition(),
    });

    await expect(
      fixture.compositions.removeLocalTarget(authority.contentProjectId, created.target),
    ).resolves.toMatchObject({ localTargets: [] });
    expect(fixture.characters.deleteUnlinkedProject).not.toHaveBeenCalled();
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
  return {
    repository,
    compositions,
    characters,
    worlds,
    service: new ProjectLocalAuthoringService({ compositions, characters, worlds }),
  };
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
