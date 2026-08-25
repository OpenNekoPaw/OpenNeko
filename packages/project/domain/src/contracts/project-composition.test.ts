import { describe, expect, it } from 'vitest';
import {
  parseProjectCreativeWorkspaceProjection,
  parseProjectMixedDomainTargetProjection,
} from './project-composition';

const validProjection = {
  projectId: 'project-1',
  content: [
    {
      target: { kind: 'content-document', documentId: 'documents/novel.md' },
      identity: 'content-document:documents/novel.md',
      label: 'Novel',
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ],
  characters: [
    {
      target: { kind: 'character-project', characterProjectId: 'character-project-1' },
      identity: 'character-project:character-project-1',
      label: 'Aster',
      summary: 'An investigator.',
      updatedAt: '2026-08-13T00:00:00.000Z',
    },
  ],
  worlds: [],
  globalCharacters: [
    {
      reference: {
        kind: 'character-version',
        globalCharacterId: 'global-character-1',
        characterVersionId: 'character-version-1',
      },
      identity: 'character-version:global-character-1:character-version-1',
      label: 'Aster',
      versionLabel: 'First edition',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
  globalWorlds: [
    {
      reference: {
        kind: 'world-version',
        globalWorldId: 'global-world-1',
        worldVersionId: 'world-version-1',
      },
      identity: 'world-version:global-world-1:world-version-1',
      label: 'Cinder Sea',
      versionLabel: 'First edition',
      updatedAt: '2026-08-14T00:00:00.000Z',
    },
  ],
  availableGlobalCharacters: [],
  availableGlobalWorlds: [],
  diagnostics: [],
};

describe('Project composition contracts', () => {
  it('parses local objects and exact read-only global references', () => {
    expect(parseProjectMixedDomainTargetProjection(validProjection)).toEqual(validProjection);
    expect(parseProjectCreativeWorkspaceProjection({ composition: validProjection })).toEqual({
      composition: validProjection,
    });
  });

  it('rejects obsolete installed and publication fields', () => {
    expect(() =>
      parseProjectMixedDomainTargetProjection({
        ...validProjection,
        installedDependencies: [],
      }),
    ).toThrow('unknown fields');
    expect(() =>
      parseProjectCreativeWorkspaceProjection({
        composition: validProjection,
        publicationOutputs: [],
      }),
    ).toThrow('unknown fields');
  });

  it('requires exact owner-qualified identities', () => {
    expect(() =>
      parseProjectMixedDomainTargetProjection({
        ...validProjection,
        globalCharacters: [
          {
            reference: {
              kind: 'character-version',
              globalCharacterId: 'global-character-1',
              characterVersionId: 'character-version-1',
            },
            identity: 'character-version:wrong',
            label: 'Broken',
            versionLabel: 'First edition',
          },
        ],
      }),
    ).toThrow('does not match');
  });
});
