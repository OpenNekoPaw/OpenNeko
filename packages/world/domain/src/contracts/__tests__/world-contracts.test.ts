import {
  createEmptyWorldDefinition,
  decodeWorldRecords,
  parseWorldActionIntent,
  parseWorldEvent,
  parseWorldProject,
  parseWorldRun,
  parseWorldSave,
  parseWorldState,
  parseWorldVersion,
  parseWorldView,
} from '../world';
import { describe, expect, it } from 'vitest';

const now = '2026-08-09T10:00:00.000Z';

function definition() {
  return {
    background: 'An archive city built around a sealed tower.',
    worldBook: [
      {
        worldBookEntryId: 'world-book-a',
        title: 'The tower',
        content: 'The tower opens only at dusk.',
        tags: ['tower'],
        sourceRefIds: ['source-a'],
        visibility: { kind: 'public' },
      },
    ],
    locations: [
      {
        definitionId: 'location-a',
        name: 'Archive Plaza',
        description: 'A public square.',
        sourceRefIds: ['source-a'],
      },
    ],
    organizations: [],
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
        visibility: { kind: 'public' },
        knownByActorIds: ['actor-a', 'actor-b'],
      },
      {
        factId: 'key-location',
        key: 'tower.key.location',
        value: 'under the eastern stair',
        visibility: { kind: 'actors', actorIds: ['actor-a'] },
        knownByActorIds: ['actor-a'],
      },
    ],
  };
}

function state() {
  return {
    worldVersionId: 'world-version-a',
    worldRunId: 'world-run-a',
    worldSaveId: 'world-save-a',
    branchId: 'branch-main',
    worldStateRevision: 0,
    timepoint: 0,
    facts: definition().initialFacts,
  };
}

describe('World Foundation canonical contracts', () => {
  it('creates the canonical fresh World definition', () => {
    expect(createEmptyWorldDefinition()).toEqual({
      background: '',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    });
  });

  it('parses reviewed WorldProject and immutable WorldVersion definitions', () => {
    const project = parseWorldProject({
      worldProjectId: 'world-project-a',
      title: 'Archive City',
      draft: definition(),
      sourceRefs: [
        {
          sourceRefId: 'source-a',
          sourceRef: 'document:world-notes',
          excerpt: 'Tower notes',
          reviewedAt: now,
        },
      ],
      reviewStatus: 'ready',
      createdAt: now,
      updatedAt: now,
    });
    expect(project).not.toHaveProperty('externalSource');
    const published = parseWorldVersion({
      worldVersionId: 'world-version-a',
      worldProjectId: project.worldProjectId,
      label: 'First publication',
      definition: project.draft,
      acceptedSourceRefIds: ['source-a'],
      publishedAt: now,
    });

    expect(published.definition.worldBook).toHaveLength(1);
    const forbiddenField = ['format', 'Version'].join('');
    expect(() => parseWorldVersion({ ...published, [forbiddenField]: 2 })).toThrow(
      /unsupported fields/u,
    );
  });

  it('requires exact WorldRun, save and branch authority', () => {
    const run = parseWorldRun({
      worldRunId: 'world-run-a',
      worldVersionId: 'world-version-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      worldStateRevision: 0,
      timepoint: 0,
      createdAt: now,
    });
    const save = parseWorldSave({
      worldSaveId: run.worldSaveId,
      worldRunId: run.worldRunId,
      worldVersionId: run.worldVersionId,
      label: 'Opening',
      activeBranchId: run.branchId,
      branches: [{ branchId: run.branchId, events: [], state: state() }],
      createdAt: now,
      updatedAt: now,
    });

    expect(save.activeBranchId).toBe('branch-main');
    expect(() =>
      parseWorldSave({
        ...save,
        branches: [
          {
            ...save.branches[0],
            state: { ...save.branches[0]?.state, worldRunId: 'another-run' },
          },
        ],
      }),
    ).toThrow(/authority does not match/u);
    expect(() =>
      parseWorldSave({
        ...save,
        branches: [
          save.branches[0],
          {
            ...save.branches[0],
            branchId: 'branch-other-root',
            state: { ...save.branches[0]?.state, branchId: 'branch-other-root' },
          },
        ],
      }),
    ).toThrow(/exactly one root branch/u);
  });

  it('parses the single action-intent to event to state path with CAS evidence', () => {
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
    const event = parseWorldEvent({
      worldEventId: 'world-event-open-door',
      worldActionIntentId: intent.worldActionIntentId,
      worldRunId: intent.worldRunId,
      worldSaveId: intent.worldSaveId,
      branchId: intent.branchId,
      sequence: 1,
      timepoint: 1,
      actorId: intent.actorId,
      action: intent.action,
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
      knownByActorIds: ['actor-a', 'actor-b'],
      committedAt: now,
    });
    const nextState = parseWorldState({
      ...state(),
      worldStateRevision: 1,
      timepoint: 1,
      facts: [event.mutations[0]?.kind === 'set' ? event.mutations[0].fact : undefined].filter(
        (fact) => fact !== undefined,
      ),
    });

    expect(intent.expectedWorldStateRevision).toBe(0);
    expect(event.worldActionIntentId).toBe(intent.worldActionIntentId);
    expect(nextState.facts[0]?.value).toBe(true);
  });

  it('rejects knowledge leakage before a WorldView reaches an Agent context', () => {
    const visibleFact = definition().initialFacts[0];
    const hiddenFact = definition().initialFacts[1];
    expect(
      parseWorldView({
        worldVersionId: 'world-version-a',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-main',
        participantId: 'participant-b',
        actorId: 'actor-b',
        worldStateRevision: 0,
        timepoint: 0,
        background: definition().background,
        worldBook: definition().worldBook,
        facts: [visibleFact],
        events: [],
      }).facts,
    ).toHaveLength(1);
    expect(() =>
      parseWorldView({
        worldVersionId: 'world-version-a',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-main',
        participantId: 'participant-b',
        actorId: 'actor-b',
        worldStateRevision: 0,
        timepoint: 0,
        background: definition().background,
        worldBook: definition().worldBook,
        facts: [visibleFact, hiddenFact],
        events: [],
      }),
    ).toThrow(/outside actor knowledge or visibility/u);
  });

  it('isolates one invalid World record while retaining valid siblings', () => {
    const valid = {
      worldRunId: 'world-run-valid',
      worldVersionId: 'world-version-a',
      worldSaveId: 'world-save-a',
      branchId: 'branch-main',
      worldStateRevision: 0,
      timepoint: 0,
      createdAt: now,
    };
    const result = decodeWorldRecords(
      [valid, { ...valid, worldRunId: 'world-run-invalid', activeWorld: true }],
      'world-run',
      parseWorldRun,
      'worldRunId',
    );

    expect(result.records.map((record) => record.worldRunId)).toEqual(['world-run-valid']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-world-record',
        recordId: 'world-run-invalid',
      }),
    ]);
  });
});
