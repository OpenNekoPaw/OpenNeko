import type { WorldProject, WorldVersion } from '@neko/world/contracts';
import {
  createWorldFoundationActionHandlers,
  WorldAuthoringService,
  WorldFoundationCommandService,
  WorldRuntimeService,
  WorldTransformationPlanningService,
  WorldTransformationStateCommitService,
  type WorldAuthoringRepository,
  type WorldRuntimeAggregate,
  type WorldRuntimeRepository,
} from '@neko/world/application';
import { describe, expect, it, vi } from 'vitest';

const now = '2026-08-10T10:00:00.000Z';

class MemoryRepository implements WorldAuthoringRepository, WorldRuntimeRepository {
  readonly projects = new Map<string, WorldProject>();
  readonly versions = new Map<string, WorldVersion>();
  readonly runtimes = new Map<string, WorldRuntimeAggregate>();

  async readProject(id: string) {
    return clone(this.projects.get(id));
  }
  async saveProject(project: WorldProject) {
    this.projects.set(project.worldProjectId, structuredClone(project));
  }
  async storePublication(version: WorldVersion) {
    this.versions.set(version.worldVersionId, structuredClone(version));
  }
  async readPublication(id: string) {
    return clone(this.versions.get(id));
  }
  async createRuntime(aggregate: WorldRuntimeAggregate) {
    this.runtimes.set(aggregate.run.worldRunId, structuredClone(aggregate));
  }
  async readRuntime(id: string) {
    return clone(this.runtimes.get(id));
  }
  async mutateRuntime(
    id: string,
    mutation: (value: WorldRuntimeAggregate) => WorldRuntimeAggregate,
  ) {
    const current = this.runtimes.get(id);
    if (!current) throw new Error(`Missing runtime '${id}'.`);
    const next = mutation(structuredClone(current));
    this.runtimes.set(id, structuredClone(next));
    return structuredClone(next);
  }
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

describe('WorldFoundationCommandService', () => {
  it('drives authoring, publication, preview facts and branching through canonical services', async () => {
    const repository = new MemoryRepository();
    const authoring = new WorldAuthoringService({ repository, now: () => now });
    const runtime = new WorldRuntimeService({
      repository,
      actionHandlers: createWorldFoundationActionHandlers(),
      now: () => now,
    });
    const commitAction = vi.spyOn(runtime, 'commitAction');
    const planner = new WorldTransformationPlanningService({
      capabilities: [
        { capabilityKind: 'world-action', capabilityId: 'world.foundation.fact.set' },
        { capabilityKind: 'world-action', capabilityId: 'world.foundation.fact.delete' },
      ],
      runtimeRepository: repository,
    });
    const commands = new WorldFoundationCommandService({
      authoring,
      runtime,
      transformations: new WorldTransformationStateCommitService({
        planner,
        runtime,
        runtimeRepository: repository,
      }),
    });
    const draft = {
      background: 'A city of archives.',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    };

    await commands.execute({
      operation: 'world-project-create',
      input: { worldProjectId: 'world-a', title: 'Archive City', draft },
    });
    await commands.execute({
      operation: 'world-project-set-review',
      input: { worldProjectId: 'world-a', reviewStatus: 'ready' },
    });
    await commands.execute({
      operation: 'world-version-publish',
      input: { worldProjectId: 'world-a', worldVersionId: 'version-a', label: 'First release' },
    });
    await commands.execute({
      operation: 'world-preview-run-create',
      input: {
        worldVersionId: 'version-a',
        worldRunId: 'run-a',
        worldSaveId: 'save-a',
        branchId: 'branch-main',
        saveLabel: 'Foundation preview',
      },
    });
    await commands.execute({
      operation: 'world-transformation-state-commit',
      input: {
        worldTransformationCandidateId: 'candidate-set',
        category: 'world-state',
        owner: 'world-runtime',
        requester: { actorId: 'foundation-author', authority: 'author' },
        base: {
          kind: 'runtime',
          worldVersionId: 'version-a',
          worldRunId: 'run-a',
          worldSaveId: 'save-a',
          branchId: 'branch-main',
          worldStateRevision: 0,
          timepoint: 0,
        },
        source: { intent: 'Make the city rainy.', sourceRefIds: [] },
        diff: [
          {
            operation: 'add',
            semanticRef: 'world-fact:weather',
            after: weatherFact(),
          },
        ],
        requirements: [
          {
            capabilityKind: 'world-action',
            capabilityId: 'world.foundation.fact.set',
            mode: 'required',
          },
        ],
        createdAt: now,
      },
    });
    expect(commitAction).toHaveBeenCalledTimes(1);
    expect(commitAction.mock.calls[0]?.[0]).toMatchObject({
      action: 'world.foundation.fact.set',
      parameters: { fact: weatherFact() },
    });
    const eventId = repository.runtimes.get('run-a')!.save.branches[0]!.events[0]!.worldEventId;
    await commands.execute({
      operation: 'world-preview-branch-fork',
      input: {
        worldRunId: 'run-a',
        worldSaveId: 'save-a',
        parentBranchId: 'branch-main',
        forkedFromWorldEventId: eventId,
        branchId: 'branch-rain',
        expectedWorldStateRevision: 1,
      },
    });
    const fork = repository.runtimes.get('run-a')!;
    expect(fork.run.branchId).toBe('branch-rain');
    expect(fork.save.branches[1]?.state.facts[0]?.value).toBe('rain');

    await commands.execute({
      operation: 'world-transformation-state-commit',
      input: {
        worldTransformationCandidateId: 'candidate-delete',
        category: 'world-state',
        owner: 'world-runtime',
        requester: { actorId: 'foundation-author', authority: 'author' },
        base: {
          kind: 'runtime',
          worldVersionId: 'version-a',
          worldRunId: 'run-a',
          worldSaveId: 'save-a',
          branchId: 'branch-rain',
          worldStateRevision: 0,
          timepoint: 1,
        },
        source: { intent: 'Remove the weather fact.', sourceRefIds: [] },
        diff: [
          {
            operation: 'remove',
            semanticRef: 'world-fact:weather',
            before: weatherFact(),
          },
        ],
        requirements: [
          {
            capabilityKind: 'world-action',
            capabilityId: 'world.foundation.fact.delete',
            mode: 'required',
          },
        ],
        createdAt: now,
      },
    });
    expect(commitAction).toHaveBeenCalledTimes(2);
    expect(commitAction.mock.calls[1]?.[0]).toMatchObject({
      action: 'world.foundation.fact.delete',
      parameters: { factId: 'weather' },
    });
    expect(repository.runtimes.get('run-a')!.save.branches[1]?.state.facts).toEqual([]);
    expect(repository.runtimes.get('run-a')!.save.branches[0]?.state.facts).toHaveLength(1);
  });
});

function weatherFact() {
  return {
    factId: 'weather',
    key: 'city.weather',
    value: 'rain',
    visibility: { kind: 'public' as const },
    knownByActorIds: ['foundation-author'],
  };
}
