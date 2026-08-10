import {
  parseWorldTransformationCandidate,
  type WorldTransformationCandidate,
} from '@neko/world/contracts';
import {
  WorldTransformationPlanningError,
  WorldTransformationPlanningService,
  type WorldRuntimeAggregate,
  type WorldRuntimeRepository,
} from '@neko/world/application';
import { describe, expect, it } from 'vitest';

const now = '2026-08-10T10:00:00.000Z';

describe('World transformation contracts', () => {
  it('accepts an exact owner-qualified candidate without requiring consumption-time AI', () => {
    expect(parseWorldTransformationCandidate(worldStateCandidate())).toMatchObject({
      category: 'world-state',
      owner: 'world-runtime',
      requirements: [
        {
          capabilityKind: 'world-action',
          capabilityId: 'world.foundation.fact.set',
          mode: 'required',
        },
      ],
    });
  });

  it('rejects owner mismatch, duplicate semantic targets and unknown fields', () => {
    expect(() =>
      parseWorldTransformationCandidate({
        ...worldStateCandidate(),
        owner: 'world-story',
      }),
    ).toThrow("must target 'world-runtime'");

    expect(() =>
      parseWorldTransformationCandidate({
        ...worldStateCandidate(),
        diff: [worldStateCandidate().diff[0], worldStateCandidate().diff[0]],
      }),
    ).toThrow("duplicate identity 'world-fact:city.weather'");

    expect(() =>
      parseWorldTransformationCandidate({
        ...worldStateCandidate(),
        generatedCode: 'return true',
      }),
    ).toThrow('unsupported fields: generatedCode');
  });
});

describe('WorldTransformationPlanningService', () => {
  it('resolves exact required capabilities and keeps missing optional AI visible', async () => {
    const service = new WorldTransformationPlanningService({
      capabilities: [
        {
          capabilityKind: 'world-action',
          capabilityId: 'world.foundation.fact.set',
        },
        { capabilityKind: 'interaction-surface', capabilityId: 'world.text' },
      ],
      runtimeRepository: runtimeReader(),
    });
    const candidate: WorldTransformationCandidate = {
      ...worldStateCandidate(),
      requirements: [
        ...worldStateCandidate().requirements,
        {
          capabilityKind: 'agent-role',
          capabilityId: 'world.narrator',
          mode: 'optional',
        },
      ],
    };

    await expect(service.plan(candidate)).resolves.toMatchObject({
      status: 'ready',
      resolvedCapabilities: [
        {
          capabilityKind: 'world-action',
          capabilityId: 'world.foundation.fact.set',
        },
      ],
      diagnostics: [
        {
          code: 'world-capability-unavailable',
          capabilityKind: 'agent-role',
          capabilityId: 'world.narrator',
          mode: 'optional',
        },
      ],
    });
  });

  it('blocks only the candidate with a missing required exact capability', async () => {
    const service = new WorldTransformationPlanningService({
      capabilities: [{ capabilityKind: 'world-action', capabilityId: '*' }],
      runtimeRepository: runtimeReader(),
    });

    await expect(service.plan(worldStateCandidate())).resolves.toMatchObject({
      status: 'blocked',
      resolvedCapabilities: [],
      diagnostics: [
        {
          capabilityKind: 'world-action',
          capabilityId: 'world.foundation.fact.set',
          mode: 'required',
        },
      ],
    });
  });

  it('rejects stale runtime bases before capability resolution', async () => {
    const service = new WorldTransformationPlanningService({
      capabilities: [],
      runtimeRepository: runtimeReader({ worldStateRevision: 5, timepoint: 8 }),
    });

    await expect(service.plan(worldStateCandidate())).rejects.toMatchObject({
      code: 'world-transformation-stale',
      worldTransformationCandidateId: 'candidate-weather',
    });
  });

  it('rejects participant structural mutation and duplicate registrations visibly', async () => {
    const service = new WorldTransformationPlanningService({
      capabilities: [],
      runtimeRepository: runtimeReader(),
    });
    const structural: WorldTransformationCandidate = {
      ...worldStateCandidate(),
      category: 'world-structure',
      owner: 'world-definition',
      requester: { actorId: 'participant-a', authority: 'participant' },
    };

    await expect(service.plan(structural)).rejects.toMatchObject(
      expect.objectContaining<Partial<WorldTransformationPlanningError>>({
        code: 'world-transformation-unauthorized',
        worldTransformationCandidateId: 'candidate-weather',
      }),
    );
    expect(
      () =>
        new WorldTransformationPlanningService({
          capabilities: [
            { capabilityKind: 'interaction-surface', capabilityId: 'world.text' },
            { capabilityKind: 'interaction-surface', capabilityId: 'world.text' },
          ],
          runtimeRepository: runtimeReader(),
        }),
    ).toThrowError(
      expect.objectContaining<Partial<WorldTransformationPlanningError>>({
        code: 'world-capability-registration-duplicate',
      }),
    );
  });
});

function worldStateCandidate(): WorldTransformationCandidate {
  return {
    worldTransformationCandidateId: 'candidate-weather',
    category: 'world-state',
    owner: 'world-runtime',
    requester: { actorId: 'author-a', authority: 'author' },
    base: {
      kind: 'runtime',
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      worldStateRevision: 4,
      timepoint: 7,
    },
    source: {
      intent: 'Turn the current city into a rainy night.',
      sourceRefIds: ['content:screenplay-a'],
    },
    diff: [
      {
        operation: 'replace',
        semanticRef: 'world-fact:city.weather',
        before: 'clear',
        after: 'rain',
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
  };
}

function runtimeReader(
  state: { readonly worldStateRevision: number; readonly timepoint: number } = {
    worldStateRevision: 4,
    timepoint: 7,
  },
): Pick<WorldRuntimeRepository, 'readRuntime'> {
  return {
    async readRuntime(worldRunId) {
      return worldRunId === 'world-run-a' ? runtimeAggregate(state) : undefined;
    },
  };
}

function runtimeAggregate(state: {
  readonly worldStateRevision: number;
  readonly timepoint: number;
}): WorldRuntimeAggregate {
  return {
    publication: {
      worldVersionId: 'world-version-a',
      worldProjectId: 'world-project-a',
      label: 'Published A',
      definition: {
        background: 'A city used by the transformation planner fixture.',
        worldBook: [],
        locations: [],
        organizations: [],
        rules: [],
        initialFacts: [weatherFact()],
      },
      acceptedSourceRefIds: [],
      publishedAt: now,
    },
    run: {
      worldRunId: 'world-run-a',
      worldVersionId: 'world-version-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      worldStateRevision: state.worldStateRevision,
      timepoint: state.timepoint,
      createdAt: now,
    },
    save: {
      worldSaveId: 'world-save-a',
      worldRunId: 'world-run-a',
      worldVersionId: 'world-version-a',
      label: 'Save A',
      activeBranchId: 'branch-main',
      branches: [
        {
          branchId: 'branch-main',
          events: [],
          state: {
            worldVersionId: 'world-version-a',
            worldRunId: 'world-run-a',
            worldSaveId: 'world-save-a',
            branchId: 'branch-main',
            worldStateRevision: state.worldStateRevision,
            timepoint: state.timepoint,
            facts: [weatherFact()],
          },
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  };
}

function weatherFact() {
  return {
    factId: 'city-weather',
    key: 'city.weather',
    value: 'clear',
    visibility: { kind: 'public' as const },
    knownByActorIds: [],
  };
}
