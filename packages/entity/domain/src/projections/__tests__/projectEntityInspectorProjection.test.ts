import { describe, expect, it } from 'vitest';
import { projectEntityInspector, type ProjectEntityManagementProjection } from '../../index';

describe('Project Entity Inspector projection', () => {
  it('gates Character interaction operations on exact owner capabilities', () => {
    const projection = projectEntityInspector({
      projectRevision: 7,
      projection: ENTITY,
      capabilities: {
        publish: true,
        reference: { conversationId: 'conversation-rin' },
        characterDialogue: { characterId: 'character-runtime-rin' },
        roomOpen: { roomId: 'room-story' },
        characterEmbody: {
          characterId: 'character-runtime-rin',
          conversationId: 'conversation-rin',
        },
      },
    });

    expect(projection.operations).toEqual([
      'edit',
      'bind',
      'merge',
      'deprecate',
      'publish',
      'reference',
      'character-dialogue',
      'room-open',
      'character-embody',
    ]);
    expect(projection.interaction).toEqual({
      conversationId: 'conversation-rin',
      characterId: 'character-runtime-rin',
      roomId: 'room-story',
    });
  });

  it('shows evidence decisions for candidates and removes blocked operations', () => {
    const projection = projectEntityInspector({
      projectRevision: 7,
      projection: CANDIDATE,
      capabilities: {
        blockers: [
          {
            code: 'reference-owner-unavailable',
            message: 'Merge unavailable.',
            operation: 'merge',
          },
        ],
      },
    });
    expect(projection).toMatchObject({
      status: 'candidate',
      candidateId: 'candidate-nova',
      operations: ['confirm'],
      evidence: [{ owner: 'document', sourceId: 'story.fountain' }],
    });
  });

  it('hides Character-only actions for non-Character Entities', () => {
    const projection = projectEntityInspector({
      projectRevision: 7,
      projection: {
        ...ENTITY,
        entity: { ...ENTITY.entity, kind: 'location' },
      },
      capabilities: {
        characterDialogue: { characterId: 'should-not-route' },
        roomOpen: { roomId: 'should-not-route' },
      },
    });
    expect(projection.operations).not.toContain('character-dialogue');
    expect(projection.operations).not.toContain('room-open');
  });
});

const ENTITY: Extract<ProjectEntityManagementProjection, { readonly entity: unknown }> = {
  projectionId: 'entity:character-rin',
  status: 'confirmed',
  entity: {
    entityId: 'character-rin',
    kind: 'character',
    names: { canonical: 'Rin', aliases: [] },
    facts: { role: 'lead' },
    representations: [],
    lifecycle: { state: 'active' },
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  },
  bindingAvailability: [],
  sourceOwners: ['project-entity'],
};

const CANDIDATE: Extract<ProjectEntityManagementProjection, { readonly status: 'candidate' }> = {
  projectionId: 'candidate:candidate-nova',
  status: 'candidate',
  candidate: {
    candidateId: 'candidate-nova',
    kind: 'character',
    proposedNames: { canonical: 'Nova', aliases: [] },
    confidence: 0.9,
    freshness: 'fresh',
    evidence: [{ evidenceId: 'evidence-nova', owner: 'document', sourceId: 'story.fountain' }],
  },
  sourceOwners: ['document'],
};
