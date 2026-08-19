import { createEmptyCharacterDefinition, type CharacterProject } from '@neko/chara/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  CHARACTER_DSH_MAX_PROJECTED_VERSIONS,
  CharacterDshAuthoringService,
  decodeCharacterDshToolInput,
  projectCharacterDshFacts,
} from './character-dsh-tool';

describe('Character DSH tool', () => {
  it('strictly decodes the canonical query and fill-draft shapes', () => {
    expect(decodeCharacterDshToolInput('query', { characterProjectId: 'character-1' })).toEqual({
      operation: 'query',
      input: { characterProjectId: 'character-1' },
    });

    expect(
      decodeCharacterDshToolInput('fill-draft', {
        characterProjectId: 'character-1',
        displayName: 'Aster',
        definition: filledDefinition(),
      }),
    ).toEqual({
      operation: 'fill-draft',
      input: {
        characterProjectId: 'character-1',
        displayName: 'Aster',
        definition: filledDefinition(),
      },
    });

    expect(() =>
      decodeCharacterDshToolInput('query', {
        characterProjectId: 'character-1',
        activeCharacterId: 'character-2',
      }),
    ).toThrow('input.activeCharacterId is not supported');
    expect(() =>
      decodeCharacterDshToolInput('fill-draft', {
        characterProjectId: 'character-1',
        displayName: 'Aster',
        definition: { summary: 'not a canonical definition' },
      }),
    ).toThrow('Character representationRefs must be an array');
  });

  it('fills only the exact target through the owning fresh-target transaction', async () => {
    let current = project();
    const fillFreshDraft = vi.fn(async (input) => {
      current = {
        ...current,
        displayName: input.displayName,
        draft: input.draft,
        updatedAt: '2026-08-19T01:00:00.000Z',
      };
      return current;
    });
    const service = new CharacterDshAuthoringService({
      scope: { kind: 'project', projectId: 'project-1' },
      characterProjectId: 'character-1',
      catalog: {
        readAuthoringCatalog: async () => ({
          scope: { kind: 'project', projectId: 'project-1' },
          projects: [current],
          versions: [],
          authoringTestSnapshots: [],
          diagnostics: [],
        }),
      },
      authoring: { fillFreshDraft },
    });

    await expect(
      service.fillDraft({
        characterProjectId: 'character-1',
        displayName: 'Aster',
        definition: filledDefinition(),
      }),
    ).resolves.toMatchObject({
      characterProjectId: 'character-1',
      displayName: 'Aster',
      isFreshTarget: false,
      draft: { hasSummary: true, canonCount: 1 },
    });
    expect(fillFreshDraft).toHaveBeenCalledWith(
      {
        characterProjectId: 'character-1',
        displayName: 'Aster',
        draft: filledDefinition(),
      },
      undefined,
    );

    await expect(service.query({ characterProjectId: 'character-other' })).rejects.toMatchObject({
      code: 'CHARACTER_DSH_TARGET_MISMATCH',
    });
    expect(fillFreshDraft).toHaveBeenCalledTimes(1);
  });

  it('fails locally for a mismatched Project authority or unavailable target', async () => {
    const service = new CharacterDshAuthoringService({
      scope: { kind: 'project', projectId: 'project-1' },
      characterProjectId: 'character-1',
      catalog: {
        readAuthoringCatalog: async () => ({
          scope: { kind: 'project', projectId: 'project-other' },
          projects: [],
          versions: [],
          authoringTestSnapshots: [],
          diagnostics: [],
        }),
      },
      authoring: { fillFreshDraft: vi.fn() },
    });

    await expect(service.query({ characterProjectId: 'character-1' })).rejects.toMatchObject({
      code: 'CHARACTER_DSH_AUTHORITY_MISMATCH',
    });
  });

  it('projects bounded immutable CharacterVersion lifecycle facts', () => {
    const versions = Array.from(
      { length: CHARACTER_DSH_MAX_PROJECTED_VERSIONS + 2 },
      (_, index) => ({
        characterVersionId: `version-${index}`,
        characterProjectId: 'character-1',
        label: `Publication ${index}`,
        publishedAt: '2026-08-19T00:00:00.000Z',
      }),
    );
    const facts = projectCharacterDshFacts(project(), [
      ...versions,
      {
        characterVersionId: 'foreign-version',
        characterProjectId: 'character-other',
        label: 'Foreign',
        publishedAt: '2026-08-19T00:00:00.000Z',
      },
    ]);

    expect(facts.versionCount).toBe(CHARACTER_DSH_MAX_PROJECTED_VERSIONS + 2);
    expect(facts.versions).toHaveLength(CHARACTER_DSH_MAX_PROJECTED_VERSIONS);
    expect(facts.versionsTruncated).toBe(true);
    expect(facts.versions[0]).toEqual({
      characterVersionId: 'version-0',
      label: 'Publication 0',
      lifecycle: 'published',
      publishedAt: '2026-08-19T00:00:00.000Z',
    });
    expect(facts.versions.some((version) => version.characterVersionId === 'foreign-version')).toBe(
      false,
    );
  });
});

function project(): CharacterProject {
  return {
    characterProjectId: 'character-1',
    displayName: 'Untitled Character',
    draft: createEmptyCharacterDefinition(),
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
}

function filledDefinition() {
  return {
    ...createEmptyCharacterDefinition(),
    summary: 'A clockmaker who notices impossible details.',
    canon: ['Repairs mechanical clocks.'],
  };
}
