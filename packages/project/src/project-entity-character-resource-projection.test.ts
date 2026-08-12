import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterProject,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  parseProjectEntityCharacterResourceProjection,
  type ContentProjectComposition,
} from './contracts';
import { projectEntityCharacterResourceProjections } from './application';

const composition: ContentProjectComposition = {
  contentProjectId: 'content-project-1',
  localTargets: [
    { kind: 'character-project', characterProjectId: 'character-project-rin' },
    { kind: 'character-project', characterProjectId: 'character-project-mika' },
  ],
  dependencies: [],
  entityCharacterAssociations: [
    { entityId: 'entity-rin', characterProjectId: 'character-project-rin' },
    { entityId: 'entity-mika', characterProjectId: 'character-project-mika' },
  ],
};

describe('Project Entity Character resource projection', () => {
  it('composes one owner-preserving linked presentation without selecting a version', () => {
    const projections = projectEntityCharacterResourceProjections({
      composition,
      characters: catalog({
        projects: [
          project('character-project-rin', 'Rin'),
          project('character-project-mika', 'Mika'),
        ],
        versions: [
          publication('character-version-rin-a', 'character-project-rin'),
          publication('character-version-rin-b', 'character-project-rin'),
        ],
      }),
    });

    expect(projections[0]).toEqual({
      entityId: 'entity-rin',
      characterProjectId: 'character-project-rin',
      displayName: 'Rin',
      placement: 'project-local',
      availability: 'available',
      handoffs: [
        { kind: 'open-character', characterProjectId: 'character-project-rin' },
        { kind: 'open-character-studio', characterProjectId: 'character-project-rin' },
      ],
      publishedVersionCount: 2,
      interactionStatus: 'select-version',
    });
    expect(projections[0]?.handoffs).not.toContainEqual(
      expect.objectContaining({ kind: 'start-character-interaction' }),
    );
  });

  it('isolates an invalid Character project while retaining a valid sibling', () => {
    const projections = projectEntityCharacterResourceProjections({
      composition,
      characters: catalog({
        projects: [project('character-project-rin', 'Rin')],
        diagnostics: [
          {
            recordKind: 'character-project',
            recordId: 'character-project-mika',
            message: 'Character record is invalid.',
          },
        ],
      }),
    });

    expect(projections[0]).toMatchObject({ availability: 'available', displayName: 'Rin' });
    expect(projections[1]).toEqual({
      entityId: 'entity-mika',
      characterProjectId: 'character-project-mika',
      placement: 'project-local',
      availability: 'needs-attention',
      handoffs: [],
      publishedVersionCount: 0,
      interactionStatus: 'unavailable',
      diagnostic: 'Character record is invalid.',
    });
  });

  it('rejects copied Character facts, generic mutations and inferred versions', () => {
    const projection = projectEntityCharacterResourceProjections({
      composition,
      characters: catalog({ projects: [project('character-project-rin', 'Rin')] }),
    })[0];
    expect(projection).toBeDefined();
    for (const unsupported of [
      { characterDefinition: { summary: 'copied' } },
      { mutation: 'delete' },
      { characterVersionId: 'latest' },
    ]) {
      expect(() =>
        parseProjectEntityCharacterResourceProjection({ ...projection, ...unsupported }),
      ).toThrow('unsupported fields');
    }
    expect(() =>
      parseProjectEntityCharacterResourceProjection({
        ...projection,
        handoffs: [
          { kind: 'open-character', characterProjectId: 'character-project-rin' },
          { kind: 'open-character', characterProjectId: 'character-project-rin' },
        ],
      }),
    ).toThrow('handoffs are invalid');
  });

  it('rejects a Character catalog from another scope', () => {
    expect(() =>
      projectEntityCharacterResourceProjections({
        composition,
        characters: {
          ...catalog({ projects: [] }),
          scope: { kind: 'content-project', contentProjectId: 'content-project-other' },
        },
      }),
    ).toThrow("does not belong to Content Project 'content-project-1'");
  });
});

function catalog(input: {
  readonly projects: readonly CharacterProject[];
  readonly versions?: import('@neko/chara/application').CharacterAuthoringCatalog['versions'];
  readonly diagnostics?: import('@neko/chara/application').CharacterAuthoringCatalog['diagnostics'];
}): import('@neko/chara/application').CharacterAuthoringCatalog {
  return {
    scope: { kind: 'content-project', contentProjectId: 'content-project-1' },
    projects: input.projects,
    versions: input.versions ?? [],
    authoringTestSnapshots: [],
    diagnostics: input.diagnostics ?? [],
  };
}

function project(characterProjectId: string, displayName: string): CharacterProject {
  return {
    characterProjectId,
    displayName,
    draft: definition(),
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}

function publication(
  characterVersionId: string,
  characterProjectId: string,
): import('@neko/chara/application').CharacterAuthoringCatalog['versions'][number] {
  return {
    characterVersionId,
    characterProjectId,
    label: characterVersionId,
    definition: definition(),
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-12T01:00:00.000Z',
  };
}

function definition(): CharacterProject['draft'] {
  return {
    summary: 'A project-local character.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: [],
    knowledgeBoundary: [],
    behaviorPolicy: [],
    expressionPolicy: [],
    representationRefs: [],
  };
}
