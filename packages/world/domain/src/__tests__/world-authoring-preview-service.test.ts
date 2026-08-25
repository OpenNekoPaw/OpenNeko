import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WorldAuthoringPreviewService } from '../application/world-authoring-preview-service';
import type { WorldProject } from '../contracts';

describe('WorldAuthoringPreviewService', () => {
  it('creates a deterministic disposable projection from one exact WorldProject', () => {
    const service = new WorldAuthoringPreviewService();
    const first = service.create(project());
    const second = service.create(project());

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      worldProjectId: 'world-project:rain-city',
      locations: [{ name: 'North Gate', description: 'Closed at high tide.' }],
      rules: ['Names can be traded once.'],
      initialFacts: [{ key: 'weather', value: '"rain"' }],
      diagnostics: [],
    });
    expect(Object.keys(first)).not.toEqual(
      expect.arrayContaining(['worldRunId', 'worldSaveId', 'branchId', 'events', 'conversationId']),
    );
  });

  it('reports incomplete draft concerns without inventing authoring facts', () => {
    const empty = project();
    const projection = new WorldAuthoringPreviewService().create({
      ...empty,
      draft: { ...empty.draft, background: '', locations: [], rules: [] },
    });

    expect(projection.diagnostics.map((item) => item.code)).toEqual([
      'world-preview-background-empty',
      'world-preview-locations-empty',
      'world-preview-rules-empty',
    ]);
    expect(projection.worldProjectId).toBe(empty.worldProjectId);
  });

  it('has no runtime, repository, Agent, event, save or branch dependency', async () => {
    const source = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../application/world-authoring-preview-service.ts',
      ),
      'utf8',
    );
    for (const forbidden of [
      'WorldRuntimeService',
      'WorldRuntimeRepository',
      'WorldRun',
      'WorldSave',
      'WorldEvent',
      'Agent',
      'repository',
      'createRun',
      'saveProject',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function project(): WorldProject {
  return {
    worldProjectId: 'world-project:rain-city',
    title: 'Rain City',
    draft: {
      background: 'A city governed by tidal archives.',
      worldBook: [],
      locations: [
        {
          definitionId: 'location:north-gate',
          name: 'North Gate',
          description: 'Closed at high tide.',
          sourceRefIds: [],
        },
      ],
      organizations: [],
      rules: [
        { ruleId: 'rule:name-trade', statement: 'Names can be traded once.', sourceRefIds: [] },
      ],
      initialFacts: [
        {
          factId: 'fact:weather',
          key: 'weather',
          value: 'rain',
          visibility: { kind: 'public' },
          knownByActorIds: [],
        },
      ],
    },
    sourceRefs: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  };
}
