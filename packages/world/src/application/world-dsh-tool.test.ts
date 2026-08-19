import { describe, expect, it, vi } from 'vitest';
import { parseWorldDefinition, type WorldProject } from '@neko/world/contracts';
import {
  WorldDshAuthoringService,
  decodeWorldDshToolInput,
  projectWorldDshFacts,
} from './world-dsh-tool';

describe('World DSH Tool', () => {
  it('strictly decodes query and fill-draft inputs', () => {
    expect(decodeWorldDshToolInput('query', { worldProjectId: 'world-1' })).toEqual({
      operation: 'query',
      input: { worldProjectId: 'world-1' },
    });
    expect(() =>
      decodeWorldDshToolInput('query', { worldProjectId: 'world-1', activeWorldId: 'world-2' }),
    ).toThrow('input.activeWorldId is not supported');
    expect(() =>
      decodeWorldDshToolInput('fill-draft', {
        worldProjectId: 'world-1',
        title: 'Aster',
        draft: { background: '' },
      }),
    ).toThrow('WorldBook must be an array');
  });

  it('mutates only the exact fresh WorldProject target', async () => {
    let current = project();
    const fillFreshDraft = vi.fn(
      async (input: { title: string; draft: ReturnType<typeof parseWorldDefinition> }) => {
        current = {
          ...current,
          title: input.title,
          draft: input.draft,
          updatedAt: '2026-08-20T01:00:00.000Z',
        };
        return current;
      },
    );
    const service = new WorldDshAuthoringService({
      scope: { kind: 'project', projectId: 'project-1' },
      worldProjectId: 'world-1',
      catalog: {
        readAuthoringCatalog: async () => ({
          scope: { kind: 'project', projectId: 'project-1' },
          projects: [current],
          versions: [],
          diagnostics: [],
        }),
      },
      authoring: { fillFreshDraft },
    });
    await expect(
      service.fillDraft({ worldProjectId: 'world-1', title: 'Aster', draft: definition('Aster') }),
    ).resolves.toMatchObject({
      worldProjectId: 'world-1',
      title: 'Aster',
      isFreshTarget: false,
    });
    await expect(service.query({ worldProjectId: 'world-other' })).rejects.toMatchObject({
      code: 'WORLD_DSH_TARGET_MISMATCH',
    });
    expect(fillFreshDraft).toHaveBeenCalledTimes(1);
  });

  it('isolates authority mismatch and bounds publication facts', () => {
    const versions = Array.from({ length: 34 }, (_, index) => ({
      worldVersionId: `version-${index}`,
      worldProjectId: 'world-1',
      label: `Version ${index}`,
      definition: definition('World'),
      acceptedSourceRefIds: [],
      publishedAt: '2026-08-20T00:00:00.000Z',
    }));
    const facts = projectWorldDshFacts(project(), versions);
    expect(facts.versionCount).toBe(34);
    expect(facts.versions).toHaveLength(32);
    expect(facts.versionsTruncated).toBe(true);
  });
});

function definition(background: string) {
  return parseWorldDefinition({
    background,
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  });
}

function project(): WorldProject {
  return {
    worldProjectId: 'world-1',
    title: 'Untitled World',
    draft: definition(''),
    sourceRefs: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}
