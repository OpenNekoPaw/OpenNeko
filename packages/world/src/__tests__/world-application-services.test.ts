import {
  parseWorldActionIntent,
  type WorldProject,
  type WorldVersion,
} from '@neko/world/contracts';
import { describe, expect, it } from 'vitest';
import {
  WorldAuthoringService,
  type WorldAuthoringRepository,
} from '../application/world-authoring-service';
import {
  WorldRuntimeService,
  type WorldRuntimeAggregate,
  type WorldRuntimeRepository,
} from '../application/world-runtime-service';

const now = '2026-08-09T10:00:00.000Z';

function emptyDefinition() {
  return {
    background: 'An archive city built around a sealed tower.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}

function definition() {
  return {
    ...emptyDefinition(),
    worldBook: [
      {
        worldBookEntryId: 'world-book-a',
        title: 'The tower',
        content: 'The tower opens only at dusk.',
        tags: ['tower'],
        sourceRefIds: ['source-a'],
        visibility: { kind: 'public' as const },
      },
    ],
    rules: [
      {
        ruleId: 'rule-a',
        statement: 'The sealed door requires a key.',
        sourceRefIds: ['source-a'],
      },
    ],
    initialFacts: [
      {
        factId: 'door-open',
        key: 'tower.door.open',
        value: false,
        visibility: { kind: 'public' as const },
        knownByActorIds: ['actor-a', 'actor-b'],
      },
      {
        factId: 'key-location',
        key: 'tower.key.location',
        value: 'under the eastern stair',
        visibility: { kind: 'actors' as const, actorIds: ['actor-a'] },
        knownByActorIds: ['actor-a'],
      },
    ],
  };
}

class MemoryWorldRepository implements WorldAuthoringRepository, WorldRuntimeRepository {
  readonly projects = new Map<string, WorldProject>();
  readonly publications = new Map<string, WorldVersion>();
  readonly runtimes = new Map<string, WorldRuntimeAggregate>();

  async readProject(worldProjectId: string): Promise<WorldProject | undefined> {
    return cloneOptional(this.projects.get(worldProjectId));
  }

  async saveProject(project: WorldProject): Promise<void> {
    this.projects.set(project.worldProjectId, structuredClone(project));
  }

  async storePublication(publication: WorldVersion): Promise<void> {
    if (this.publications.has(publication.worldVersionId)) {
      throw new Error(`World publication '${publication.worldVersionId}' already exists.`);
    }
    this.publications.set(publication.worldVersionId, structuredClone(publication));
  }

  async readPublication(worldVersionId: string): Promise<WorldVersion | undefined> {
    return cloneOptional(this.publications.get(worldVersionId));
  }

  async createRuntime(aggregate: WorldRuntimeAggregate): Promise<void> {
    if (this.runtimes.has(aggregate.run.worldRunId)) {
      throw new Error(`WorldRun '${aggregate.run.worldRunId}' already exists.`);
    }
    this.runtimes.set(aggregate.run.worldRunId, structuredClone(aggregate));
  }

  async readRuntime(worldRunId: string): Promise<WorldRuntimeAggregate | undefined> {
    return cloneOptional(this.runtimes.get(worldRunId));
  }

  async mutateRuntime(
    worldRunId: string,
    mutation: (current: WorldRuntimeAggregate) => WorldRuntimeAggregate,
  ): Promise<WorldRuntimeAggregate> {
    const current = this.runtimes.get(worldRunId);
    if (!current) throw new Error(`WorldRun '${worldRunId}' does not exist.`);
    const updated = mutation(structuredClone(current));
    this.runtimes.set(worldRunId, structuredClone(updated));
    return structuredClone(updated);
  }
}

async function publishWorld(repository: MemoryWorldRepository): Promise<WorldVersion> {
  const authoring = new WorldAuthoringService({ repository, now: () => now });
  await authoring.createProject({
    worldProjectId: 'world-project-a',
    title: 'Archive City',
    draft: emptyDefinition(),
  });
  await authoring.addReviewedSource({
    worldProjectId: 'world-project-a',
    sourceRef: {
      sourceRefId: 'source-a',
      sourceRef: 'document:world-notes',
      reviewedAt: now,
    },
  });
  await authoring.updateDraft({ worldProjectId: 'world-project-a', draft: definition() });
  await authoring.setReviewStatus({
    worldProjectId: 'world-project-a',
    reviewStatus: 'ready',
  });
  return authoring.publish({
    worldProjectId: 'world-project-a',
    worldVersionId: 'world-version-a',
    label: 'First publication',
  });
}

function createRuntimeService(repository: MemoryWorldRepository): WorldRuntimeService {
  return new WorldRuntimeService({
    repository,
    now: () => now,
    actionHandlers: [
      {
        action: 'open-door',
        evaluate: ({ intent }) => ({
          mutations: [
            {
              kind: 'set',
              fact: {
                factId: 'door-open',
                key: 'tower.door.open',
                value: true,
                visibility: { kind: 'public' },
                knownByActorIds: ['actor-a', 'actor-b'],
              },
            },
          ],
          visibility: { kind: 'public' },
          knownByActorIds: [intent.actorId, 'actor-b'],
        }),
      },
      {
        action: 'close-door',
        evaluate: ({ intent }) => ({
          mutations: [
            {
              kind: 'set',
              fact: {
                factId: 'door-open',
                key: 'tower.door.open',
                value: false,
                visibility: { kind: 'public' },
                knownByActorIds: ['actor-a', 'actor-b'],
              },
            },
          ],
          visibility: { kind: 'public' },
          knownByActorIds: [intent.actorId, 'actor-b'],
        }),
      },
    ],
  });
}

describe('World application services', () => {
  it('fills only a fresh exact WorldProject draft without publication or runtime side effects', async () => {
    const repository = new MemoryWorldRepository();
    const authoring = new WorldAuthoringService({ repository, now: () => now });
    await authoring.createProject({
      worldProjectId: 'world-project-fresh',
      title: 'Archive City',
      draft: {
        background: '',
        worldBook: [],
        locations: [],
        organizations: [],
        rules: [],
        initialFacts: [],
      },
    });

    const project = await authoring.fillFreshDraft({
      worldProjectId: 'world-project-fresh',
      title: 'Lantern Archive',
      draft: creatorDefinition(),
    });

    expect(project.title).toBe('Lantern Archive');
    expect(project.draft.background).toContain('archive city');
    expect(repository.publications).toEqual(new Map());
    expect(repository.runtimes).toEqual(new Map());
    const stored = structuredClone(repository.projects.get('world-project-fresh'));
    await expect(
      authoring.fillFreshDraft({
        worldProjectId: 'world-project-fresh',
        title: 'Lantern Archive',
        draft: { ...creatorDefinition(), background: 'A sibling overwrite attempt.' },
      }),
    ).rejects.toMatchObject({
      code: 'world-authoring-operation-invalid',
      worldProjectId: 'world-project-fresh',
    });
    expect(repository.projects.get('world-project-fresh')).toEqual(stored);
  });

  it('rejects sourced WorldProjects as creator targets without changing bytes', async () => {
    for (const project of [
      {
        ...freshWorldProject('world-project-sourced'),
        sourceRefs: [
          {
            sourceRefId: 'source-1',
            sourceRef: 'document:world-notes',
            reviewedAt: now,
          },
        ],
      },
    ]) {
      const repository = new MemoryWorldRepository();
      repository.projects.set(project.worldProjectId, structuredClone(project));
      const before = structuredClone(repository.projects.get(project.worldProjectId));

      await expect(
        new WorldAuthoringService({ repository, now: () => now }).fillFreshDraft({
          worldProjectId: project.worldProjectId,
          title: project.title,
          draft: creatorDefinition(),
        }),
      ).rejects.toMatchObject({ code: 'world-authoring-operation-invalid' });
      expect(repository.projects.get(project.worldProjectId)).toEqual(before);
    }
  });

  it('publishes an immutable WorldVersion without changing it after draft edits', async () => {
    const repository = new MemoryWorldRepository();
    const publication = await publishWorld(repository);
    const authoring = new WorldAuthoringService({ repository, now: () => now });
    await authoring.updateDraft({
      worldProjectId: 'world-project-a',
      draft: { ...definition(), background: 'Changed draft background.' },
    });

    expect(Object.isFrozen(publication)).toBe(true);
    expect(publication.definition.background).toContain('archive city');
    expect(repository.publications.get('world-version-a')?.definition.background).toContain(
      'archive city',
    );
  });

  it('changes WorldState only through a registered committed WorldActionIntent', async () => {
    const repository = new MemoryWorldRepository();
    await publishWorld(repository);
    const runtime = createRuntimeService(repository);
    const aggregate = await runtime.createRun({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });
    const before = aggregate.save.branches[0]?.state;
    const intent = parseWorldActionIntent({
      worldActionIntentId: 'intent-open-door',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      actorId: 'actor-a',
      action: 'open-door',
      targetRef: 'fact:door-open',
      parameters: { method: 'key' },
      observedTimepoint: 0,
      expectedWorldStateRevision: 0,
      createdAt: now,
    });
    const committed = await runtime.commitAction(intent);

    expect(before?.facts.find((fact) => fact.factId === 'door-open')?.value).toBe(false);
    expect(committed.event.worldActionIntentId).toBe(intent.worldActionIntentId);
    expect(committed.state.facts.find((fact) => fact.factId === 'door-open')?.value).toBe(true);
    expect(committed.state.worldStateRevision).toBe(1);
    expect(repository.runtimes.get('world-run-a')?.save.branches[0]?.events).toHaveLength(1);
  });

  it('rejects a stale action locally without changing the committed World state', async () => {
    const repository = new MemoryWorldRepository();
    await publishWorld(repository);
    const runtime = createRuntimeService(repository);
    await runtime.createRun({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });
    const intent = parseWorldActionIntent({
      worldActionIntentId: 'intent-open-door',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      actorId: 'actor-a',
      action: 'open-door',
      parameters: {},
      observedTimepoint: 0,
      expectedWorldStateRevision: 0,
      createdAt: now,
    });
    await runtime.commitAction(intent);

    await expect(runtime.commitAction(intent)).rejects.toMatchObject({
      code: 'stale-world-state',
      worldRunId: 'world-run-a',
    });
    expect(repository.runtimes.get('world-run-a')?.run.worldStateRevision).toBe(1);
  });

  it('validates and materializes only the exact World binding authority', async () => {
    const repository = new MemoryWorldRepository();
    await publishWorld(repository);
    const runtime = createRuntimeService(repository);
    await runtime.createRun({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });

    await expect(
      runtime.validateBinding({
        worldVersionId: 'world-version-a',
        worldRunId: 'world-run-a',
      }),
    ).resolves.toBeUndefined();
    const view = await runtime.materializeBindingView({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      participantId: 'participant-a',
      actorId: 'actor-a',
    });
    expect(view).toMatchObject({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      participantId: 'participant-a',
    });

    await expect(
      runtime.validateBinding({
        worldVersionId: 'world-version-a',
        worldRunId: 'world-run-missing',
      }),
    ).rejects.toMatchObject({ code: 'world-run-unavailable' });
    await expect(
      runtime.materializeBindingView({
        worldVersionId: 'world-version-a',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-other',
        branchId: 'branch-main',
        participantId: 'participant-a',
      }),
    ).rejects.toMatchObject({ code: 'world-authority-mismatch' });
    await expect(
      runtime.materializeBindingView({
        worldVersionId: 'world-version-a',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-other',
        participantId: 'participant-a',
      }),
    ).rejects.toMatchObject({ code: 'world-authority-mismatch' });
  });

  it('filters WorldView by actor knowledge before returning it to Chara or Agent', async () => {
    const repository = new MemoryWorldRepository();
    await publishWorld(repository);
    const runtime = createRuntimeService(repository);
    await runtime.createRun({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });
    const actorA = await runtime.materializeView({
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      participantId: 'participant-a',
      actorId: 'actor-a',
    });
    const actorB = await runtime.materializeView({
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      participantId: 'participant-b',
      actorId: 'actor-b',
    });

    expect(actorA.facts.map((fact) => fact.factId)).toContain('key-location');
    expect(actorB.facts.map((fact) => fact.factId)).not.toContain('key-location');
  });

  it('forks and continues a branch without copying or rewriting parent WorldEvents', async () => {
    const repository = new MemoryWorldRepository();
    await publishWorld(repository);
    const runtime = createRuntimeService(repository);
    await runtime.createRun({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });
    const openDoor = parseWorldActionIntent({
      worldActionIntentId: 'intent-open-door',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      actorId: 'actor-a',
      action: 'open-door',
      parameters: {},
      observedTimepoint: 0,
      expectedWorldStateRevision: 0,
      createdAt: now,
    });
    await runtime.commitAction(openDoor);
    await runtime.commitAction(
      parseWorldActionIntent({
        worldActionIntentId: 'intent-close-door-main',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-main',
        actorId: 'actor-a',
        action: 'close-door',
        parameters: {},
        observedTimepoint: 1,
        expectedWorldStateRevision: 1,
        createdAt: now,
      }),
    );
    const parentBeforeFork = structuredClone(
      repository.runtimes.get('world-run-a')?.save.branches[0],
    );

    const forked = await runtime.forkBranch({
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      parentBranchId: 'branch-main',
      forkedFromWorldEventId: 'world-event:intent-open-door',
      branchId: 'branch-alternate',
      expectedWorldStateRevision: 2,
    });
    const child = forked.save.branches.find((branch) => branch.branchId === 'branch-alternate');

    expect(forked.save.branches[0]).toEqual(parentBeforeFork);
    expect(child?.events).toEqual([]);
    expect(child?.state).toMatchObject({
      branchId: 'branch-alternate',
      worldStateRevision: 0,
      timepoint: 1,
    });
    expect(child?.state.facts.find((fact) => fact.factId === 'door-open')?.value).toBe(true);

    await runtime.commitAction(
      parseWorldActionIntent({
        worldActionIntentId: 'intent-close-door-alternate',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-alternate',
        actorId: 'actor-a',
        action: 'close-door',
        parameters: {},
        observedTimepoint: 1,
        expectedWorldStateRevision: 0,
        createdAt: now,
      }),
    );
    const childView = await runtime.materializeView({
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-alternate',
      participantId: 'participant-a',
      actorId: 'actor-a',
    });
    const parentView = await runtime.materializeView({
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      participantId: 'participant-a',
      actorId: 'actor-a',
    });

    expect(childView.events.map((event) => event.worldEventId)).toEqual([
      'world-event:intent-open-door',
      'world-event:intent-close-door-alternate',
    ]);
    expect(parentView.events.map((event) => event.worldEventId)).toEqual([
      'world-event:intent-open-door',
      'world-event:intent-close-door-main',
    ]);
    expect(repository.runtimes.get('world-run-a')?.save.branches[0]).toEqual(parentBeforeFork);

    const reactivated = await runtime.activateBranch({
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
    });
    expect(reactivated.run).toMatchObject({
      branchId: 'branch-main',
      worldStateRevision: 2,
      timepoint: 2,
    });
  });

  it('rejects stale or implicit branch selection without changing sibling branches', async () => {
    const repository = new MemoryWorldRepository();
    await publishWorld(repository);
    const runtime = createRuntimeService(repository);
    await runtime.createRun({
      worldVersionId: 'world-version-a',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });
    await runtime.commitAction(
      parseWorldActionIntent({
        worldActionIntentId: 'intent-open-door',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-main',
        actorId: 'actor-a',
        action: 'open-door',
        parameters: {},
        observedTimepoint: 0,
        expectedWorldStateRevision: 0,
        createdAt: now,
      }),
    );

    await expect(
      runtime.forkBranch({
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        parentBranchId: 'branch-main',
        forkedFromWorldEventId: 'world-event:intent-open-door',
        branchId: 'branch-stale',
        expectedWorldStateRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'stale-world-state' });
    await expect(
      runtime.activateBranch({
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-recent',
      }),
    ).rejects.toMatchObject({ code: 'world-branch-unavailable' });
    expect(repository.runtimes.get('world-run-a')?.save.branches).toHaveLength(1);
    expect(repository.runtimes.get('world-run-a')?.run.branchId).toBe('branch-main');
  });

  it('rejects unregistered future control actions without disabling sibling WorldRuns', async () => {
    const repository = new MemoryWorldRepository();
    await publishWorld(repository);
    const runtime = createRuntimeService(repository);
    for (const worldRunId of ['world-run-a', 'world-run-b']) {
      await runtime.createRun({
        worldVersionId: 'world-version-a',
        worldRunId,
        worldSaveId: `world-save:${worldRunId}`,
        branchId: 'branch-main',
        saveLabel: worldRunId,
      });
    }
    const unsupported = parseWorldActionIntent({
      worldActionIntentId: 'intent-control',
      worldRunId: 'world-run-a',
      worldSaveId: 'world-save:world-run-a',
      branchId: 'branch-main',
      actorId: 'actor-a',
      action: 'control-external-target',
      parameters: {},
      observedTimepoint: 0,
      expectedWorldStateRevision: 0,
      createdAt: now,
    });

    await expect(runtime.commitAction(unsupported)).rejects.toMatchObject({
      code: 'world-action-unregistered',
      worldRunId: 'world-run-a',
    });
    expect(repository.runtimes.get('world-run-b')?.run.worldStateRevision).toBe(0);
  });
});

function freshWorldProject(worldProjectId: string): WorldProject {
  return {
    worldProjectId,
    title: 'Fresh World',
    draft: {
      background: '',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    sourceRefs: [],
    reviewStatus: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

function creatorDefinition() {
  const draft = definition();
  return {
    ...draft,
    worldBook: draft.worldBook.map((entry) => ({ ...entry, sourceRefIds: [] })),
    rules: draft.rules.map((rule) => ({ ...rule, sourceRefIds: [] })),
  };
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
