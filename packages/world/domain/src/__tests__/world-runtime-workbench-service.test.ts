import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createWorldFoundationActionHandlers,
  WorldRuntimeService,
  WorldRuntimeWorkbenchService,
  type WorldRuntimeAggregate,
  type WorldRuntimeRepository,
} from '../application';
import type { WorldActionIntent, WorldRuntimeLaunch, WorldVersion } from '../contracts';

describe('WorldRuntimeWorkbenchService', () => {
  it('launches only one exact immutable WorldVersion and projects bounded authoritative facts', async () => {
    const repository = memoryRuntimeRepository([publication()]);
    const service = workbench(repository);
    const projection = await service.launch(launch());

    expect(projection).toMatchObject({
      binding: {
        worldProjectId: 'world-1',
        worldVersionId: 'version-1',
        worldRunId: 'run-1',
        worldSaveId: 'save-1',
        branchId: 'branch-main',
      },
      availableActions: ['world.foundation.fact.delete', 'world.foundation.fact.set'],
      worldStateRevision: 0,
      timepoint: 0,
      participants: [{ participantId: 'participant-1', actorId: 'actor-1' }],
    });
    expect(repository.runtimes).toHaveLength(1);
  });

  it('rejects project mismatch before creating a Run', async () => {
    const repository = memoryRuntimeRepository([publication()]);
    await expect(
      workbench(repository).launch({ ...launch(), worldProjectId: 'another-world' }),
    ).rejects.toMatchObject({ code: 'world-runtime-project-mismatch' });
    expect(repository.runtimes).toEqual([]);
  });

  it('commits one exact action and rejects stale or cross-run intent without local reduction', async () => {
    const repository = memoryRuntimeRepository([publication()]);
    const service = workbench(repository);
    const initial = await service.launch(launch());
    const intent: WorldActionIntent = {
      worldActionIntentId: 'intent-1',
      worldRunId: initial.binding.worldRunId,
      worldSaveId: initial.binding.worldSaveId,
      branchId: initial.binding.branchId,
      actorId: 'actor-1',
      action: 'world.foundation.fact.set',
      parameters: {
        fact: {
          factId: 'fact-weather',
          key: 'weather',
          value: 'rain',
          visibility: { kind: 'public' },
          knownByActorIds: ['actor-1'],
        },
      },
      observedTimepoint: 0,
      expectedWorldStateRevision: 0,
      createdAt: '2026-08-14T00:00:00.000Z',
    };
    const committed = await service.submitAction({ binding: initial.binding, intent });
    expect(committed).toMatchObject({
      worldStateRevision: 1,
      timepoint: 1,
      facts: [{ factId: 'fact-weather', value: 'rain' }],
      timeline: [{ worldEventId: 'world-event:intent-1', action: 'world.foundation.fact.set' }],
    });
    await expect(
      service.submitAction({
        binding: initial.binding,
        intent: { ...intent, worldActionIntentId: 'intent-2' },
      }),
    ).rejects.toMatchObject({ code: 'stale-world-state' });
    await expect(
      service.submitAction({
        binding: initial.binding,
        intent: { ...intent, worldActionIntentId: 'intent-3', worldRunId: 'another-run' },
      }),
    ).rejects.toMatchObject({ code: 'world-runtime-binding-mismatch' });
  });

  it('has no Agent, provider or presentation write dependency', async () => {
    const source = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../application/world-runtime-workbench-service.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/Agent|provider|setState|localStorage|activeWorld|recentWorld/iu);
  });

  it('reports no semantic success when the World owner rejects the commit', async () => {
    const repository = memoryRuntimeRepository([publication()]);
    const service = workbench(repository);
    const initial = await service.launch(launch());
    repository.rejectMutations = true;
    await expect(
      service.submitAction({
        binding: initial.binding,
        intent: {
          worldActionIntentId: 'intent-rejected',
          worldRunId: initial.binding.worldRunId,
          worldSaveId: initial.binding.worldSaveId,
          branchId: initial.binding.branchId,
          actorId: 'actor-1',
          action: 'world.foundation.fact.set',
          parameters: {
            fact: {
              factId: 'fact-weather',
              key: 'weather',
              value: 'storm',
              visibility: { kind: 'public' },
              knownByActorIds: ['actor-1'],
            },
          },
          observedTimepoint: 0,
          expectedWorldStateRevision: 0,
          createdAt: '2026-08-14T00:00:00.000Z',
        },
      }),
    ).rejects.toThrow('World owner rejected the commit');
    expect(repository.runtimes[0]?.run.worldStateRevision).toBe(0);
    expect(repository.runtimes[0]?.save.branches[0]?.events).toEqual([]);
  });
});

function workbench(repository: ReturnType<typeof memoryRuntimeRepository>) {
  const runtime = new WorldRuntimeService({
    repository,
    actionHandlers: createWorldFoundationActionHandlers(),
    now: () => '2026-08-14T00:00:00.000Z',
  });
  return new WorldRuntimeWorkbenchService({
    runtime,
    repository,
    availableActions: ['world.foundation.fact.set', 'world.foundation.fact.delete'],
  });
}

function memoryRuntimeRepository(publications: readonly WorldVersion[]) {
  const versions = new Map(publications.map((entry) => [entry.worldVersionId, entry]));
  const runtimes = new Map<string, WorldRuntimeAggregate>();
  const repository: WorldRuntimeRepository & {
    readonly runtimes: readonly WorldRuntimeAggregate[];
    rejectMutations: boolean;
  } = {
    rejectMutations: false,
    get runtimes() {
      return [...runtimes.values()];
    },
    readPublication: async (identity) => structuredClone(versions.get(identity)),
    createRuntime: async (aggregate) => {
      if (runtimes.has(aggregate.run.worldRunId)) throw new Error('duplicate runtime');
      runtimes.set(aggregate.run.worldRunId, structuredClone(aggregate));
    },
    readRuntime: async (identity) => structuredClone(runtimes.get(identity)),
    mutateRuntime: async (identity, mutation) => {
      if (repository.rejectMutations) throw new Error('World owner rejected the commit.');
      const current = runtimes.get(identity);
      if (!current) throw new Error('missing runtime');
      const next = mutation(structuredClone(current));
      runtimes.set(identity, structuredClone(next));
      return structuredClone(next);
    },
  };
  return repository;
}

function launch(): WorldRuntimeLaunch {
  return {
    worldProjectId: 'world-1',
    worldVersionId: 'version-1',
    worldRunId: 'run-1',
    worldSaveId: 'save-1',
    branchId: 'branch-main',
    saveLabel: 'First run',
    participantId: 'participant-1',
    actorId: 'actor-1',
  };
}

function publication(): WorldVersion {
  return {
    worldVersionId: 'version-1',
    worldProjectId: 'world-1',
    label: 'First publication',
    definition: {
      background: 'Rain city',
      worldBook: [],
      locations: [
        {
          definitionId: 'location-1',
          name: 'North Gate',
          description: 'Closed at high tide.',
          sourceRefIds: [],
        },
      ],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    acceptedSourceRefIds: [],
    publishedAt: '2026-08-14T00:00:00.000Z',
  };
}
