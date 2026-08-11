import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterProject,
  type CharacterVersion,
} from '@neko/chara/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterAuthoringService } from '../application/character-authoring-service';
import { CharacterAuthoringHostService } from '../application/character-authoring-host-service';

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
      "does not match Content Project 'content-1'",
    );
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
): CharacterAuthoringHostService {
  const authoring = {
    updateDraft: vi.fn(),
    setReviewStatus: vi.fn(),
    publish: vi.fn(),
    ...authoringMethods,
  } as unknown as CharacterAuthoringService;
  return new CharacterAuthoringHostService({
    contentProjectId: 'content-1',
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
