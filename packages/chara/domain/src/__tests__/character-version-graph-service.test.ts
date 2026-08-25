import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterProject,
  parseCharacterVersion,
} from '@neko/chara-domain/contracts';
import {
  compareCharacterVersions,
  projectCharacterVersionGraph,
} from '../application/character-version-graph-service';
import { describe, expect, it } from 'vitest';

const now = '2026-08-12T00:00:00.000Z';

describe('CharacterVersion graph service', () => {
  it('projects roots, branches, heads, draft basis and unlinked versions', () => {
    const graph = projectCharacterVersionGraph({
      project: project('version-left'),
      versions: [
        version('version-root'),
        version('version-left'),
        version('version-right'),
        version('version-unlinked'),
      ],
      lineage: {
        characterProjectId: 'character-project-a',
        relations: [
          { characterVersionId: 'version-root', parentCharacterVersionIds: [] },
          { characterVersionId: 'version-left', parentCharacterVersionIds: ['version-root'] },
          { characterVersionId: 'version-right', parentCharacterVersionIds: ['version-root'] },
        ],
      },
    });

    expect(graph.rootCharacterVersionIds).toEqual(['version-root']);
    expect(graph.headCharacterVersionIds).toEqual(['version-left', 'version-right']);
    expect(graph.unlinkedCharacterVersionIds).toEqual(['version-unlinked']);
    expect(graph.nodes.find((node) => node.characterVersionId === 'version-left')).toMatchObject({
      parentCharacterVersionId: 'version-root',
      ancestorCharacterVersionIds: ['version-root'],
      isDraftBasis: true,
    });
  });

  it('excludes cycle edges while preserving valid sibling branches', () => {
    const graph = projectCharacterVersionGraph({
      project: project(),
      versions: [
        version('version-a'),
        version('version-b'),
        version('version-root'),
        version('version-valid'),
      ],
      lineage: {
        characterProjectId: 'character-project-a',
        relations: [
          { characterVersionId: 'version-a', parentCharacterVersionIds: ['version-b'] },
          { characterVersionId: 'version-b', parentCharacterVersionIds: ['version-a'] },
          { characterVersionId: 'version-root', parentCharacterVersionIds: [] },
          { characterVersionId: 'version-valid', parentCharacterVersionIds: ['version-root'] },
        ],
      },
    });

    expect(
      graph.diagnostics.filter((diagnostic) => diagnostic.code === 'lineage-cycle'),
    ).toHaveLength(2);
    expect(graph.unlinkedCharacterVersionIds).toEqual(['version-a', 'version-b']);
    expect(graph.rootCharacterVersionIds).toEqual(['version-root']);
    expect(graph.headCharacterVersionIds).toEqual(['version-valid']);
    expect(graph.nodes.find((node) => node.characterVersionId === 'version-valid')).toMatchObject({
      ancestorCharacterVersionIds: ['version-root'],
    });
  });

  it('keeps invalid relationships local and visible as unlinked', () => {
    const graph = projectCharacterVersionGraph({
      project: project(),
      versions: [version('version-a')],
      lineage: {
        characterProjectId: 'character-project-a',
        relations: [
          { characterVersionId: 'version-a', parentCharacterVersionIds: ['version-missing'] },
          { characterVersionId: 'version-missing-child', parentCharacterVersionIds: [] },
        ],
      },
    });

    expect(graph.unlinkedCharacterVersionIds).toEqual(['version-a']);
    expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'lineage-parent-unavailable',
      'lineage-child-unavailable',
    ]);
  });

  it('rejects a lineage owned by another CharacterProject', () => {
    expect(() =>
      projectCharacterVersionGraph({
        project: project(),
        versions: [version('version-a')],
        lineage: { characterProjectId: 'character-project-foreign', relations: [] },
      }),
    ).toThrow(/does not belong to exact CharacterProject/u);
  });

  it('compares immutable versions by Character responsibility', () => {
    const comparison = compareCharacterVersions(
      version('version-before'),
      version('version-after', { canon: ['Changed canon.'] }),
    );

    expect(comparison.groups.find((group) => group.group === 'canon')?.changed).toBe(true);
    expect(comparison.groups.find((group) => group.group === 'canon')?.after).toEqual([
      'Changed canon.',
    ]);
    expect(comparison.groups.find((group) => group.group === 'behavior')?.changed).toBe(false);
  });
});

function project(draftBasisCharacterVersionId?: string) {
  return parseCharacterProject({
    characterProjectId: 'character-project-a',
    displayName: 'Lin',
    draft: definition(),
    ...(draftBasisCharacterVersionId === undefined ? {} : { draftBasisCharacterVersionId }),
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: now,
    updatedAt: now,
  });
}

function version(
  characterVersionId: string,
  override: { readonly canon?: readonly string[] } = {},
) {
  return parseCharacterVersion({
    characterVersionId,
    characterProjectId: 'character-project-a',
    label: characterVersionId,
    definition: {
      ...definition(),
      ...(override.canon === undefined ? {} : { canon: override.canon }),
    },
    acceptedEvidenceIds: [],
    publishedAt: now,
  });
}

function definition() {
  return {
    summary: 'A careful archivist.',
    backgroundStory: createEmptyCharacterBackgroundStory(),
    originSetting: createEmptyCharacterOriginSetting(),
    canon: ['Keeps promises.'],
    knowledgeBoundary: ['Does not know the sealed archive.'],
    behaviorPolicy: ['Ask before changing a record.'],
    expressionPolicy: ['Uses concise language.'],
    representationRefs: [],
  };
}
