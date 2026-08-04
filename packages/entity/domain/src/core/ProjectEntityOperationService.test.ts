import { beforeEach, describe, expect, it } from 'vitest';
import {
  PROJECT_ENTITY_REFERENCE_OWNER_IDS,
  ProjectEntityOperationService,
  type ProjectEntityCandidateDecision,
  type ProjectEntityCandidateProjection,
  type ProjectEntityCandidateWorkflowPort,
  type ProjectEntityDocument,
  type ProjectEntityDocumentRepository,
  type ProjectEntityOperationCommitPort,
  type ProjectEntityOperationCommitRequest,
  type ProjectEntityReferenceOperationRequest,
  type ProjectEntityReferenceOwnerPlan,
  type ProjectEntityReferenceRewriteParticipant,
  type ProjectEntitySemanticSnapshot,
} from '../index';

describe('ProjectEntityOperationService', () => {
  let harness: OperationHarness;

  beforeEach(() => {
    harness = new OperationHarness();
  });

  it('creates and confirms only through the canonical commit port', async () => {
    await harness.service.create({
      expectedRevision: 0,
      entityId: 'character-rin',
      semantic: semantic('Rin'),
      createdAt: NOW,
    });
    await harness.service.confirmCandidate({
      expectedRevision: 1,
      candidateId: CANDIDATE.candidateId,
      entityId: 'character-mio',
      semantic: semantic('Mio'),
      createdAt: LATER,
    });

    expect(harness.document.revision).toBe(2);
    expect(harness.document.entities.map((entity) => entity.entityId)).toEqual([
      'character-rin',
      'character-mio',
    ]);
    expect(harness.commits).toHaveLength(2);
    expect(harness.commits[1]?.candidateDecision).toEqual({
      kind: 'confirm',
      candidate: CANDIDATE,
    });
  });

  it('merges a candidate into an existing Entity and dismisses without writing canonical facts', async () => {
    harness.document = document([record('character-rin', 'Rin')], 3);

    await harness.service.mergeCandidateInto({
      expectedRevision: 3,
      candidateId: CANDIDATE.candidateId,
      targetEntityId: 'character-rin',
      targetSemantic: semantic('Rin', { role: 'lead' }),
      updatedAt: LATER,
    });
    await harness.service.dismissCandidate({
      expectedRevision: 4,
      candidateId: CANDIDATE.candidateId,
    });

    expect(harness.document.entities[0]?.facts).toEqual({ role: 'lead' });
    expect(harness.commits[0]?.candidateDecision?.kind).toBe('merge-into');
    expect(harness.dismissed).toEqual([{ kind: 'dismiss', candidate: CANDIDATE }]);
    expect(harness.commits).toHaveLength(1);
  });

  it('merges confirmed Entities only after every reference owner prepares', async () => {
    harness.document = document(
      [record('character-old', 'Old Rin'), record('character-rin', 'Rin')],
      5,
    );

    await harness.service.merge({
      operationId: 'merge-rin',
      expectedRevision: 5,
      sourceEntityId: 'character-old',
      targetEntityId: 'character-rin',
      targetSemantic: semantic('Rin', { merged: true }),
      committedAt: LATER,
    });

    expect(harness.prepared).toEqual(PROJECT_ENTITY_REFERENCE_OWNER_IDS);
    expect(harness.commits[0]?.referencePlan?.owners.map((owner) => owner.ownerId)).toEqual(
      PROJECT_ENTITY_REFERENCE_OWNER_IDS,
    );
    expect(harness.document.entities[0]?.lifecycle).toEqual({
      state: 'deprecated',
      deprecatedAt: LATER,
      replacementEntityId: 'character-rin',
    });
    expect(harness.document.entities[1]?.facts).toEqual({ merged: true });
  });

  it('uses complete reference plans for deprecation and deletion', async () => {
    harness.document = document(
      [record('character-old', 'Old Rin'), record('character-rin', 'Rin')],
      2,
    );
    await harness.service.deprecate({
      operationId: 'deprecate-old',
      expectedRevision: 2,
      entityId: 'character-old',
      replacementEntityId: 'character-rin',
      deprecatedAt: LATER,
    });
    expect(harness.commits[0]?.referencePlan?.operation.operation).toBe('deprecate');

    await harness.service.delete({
      operationId: 'delete-old',
      expectedRevision: 3,
      entityId: 'character-old',
    });
    expect(harness.commits[1]?.referencePlan?.operation.operation).toBe('delete');
    expect(harness.document.entities.map((entity) => entity.entityId)).toEqual(['character-rin']);
  });

  it('aborts prepared owners and preserves the document when a reference owner blocks', async () => {
    harness.document = document(
      [record('character-old', 'Old Rin'), record('character-rin', 'Rin')],
      4,
    );
    harness.blockedOwner = 'agent';

    await expect(
      harness.service.merge({
        operationId: 'merge-blocked',
        expectedRevision: 4,
        sourceEntityId: 'character-old',
        targetEntityId: 'character-rin',
        targetSemantic: semantic('Rin'),
        committedAt: LATER,
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ message: 'Agent reference is immutable.' })],
    });

    expect(harness.commits).toHaveLength(0);
    expect(harness.aborted).toEqual([
      'entity-document',
      'canvas',
      'chara',
      'document',
      'project-portability',
    ]);
    expect(harness.document.revision).toBe(4);
  });

  it('rejects stale revisions, missing candidates, duplicate IDs, and cross-kind merges', async () => {
    harness.document = document(
      [record('character-rin', 'Rin'), record('location-home', 'Home', 'location')],
      7,
    );

    await expect(
      harness.service.create({
        expectedRevision: 6,
        entityId: 'character-mio',
        semantic: semantic('Mio'),
        createdAt: NOW,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-revision-conflict' }] });
    await expect(
      harness.service.create({
        expectedRevision: 7,
        entityId: 'character-rin',
        semantic: semantic('Rin'),
        createdAt: NOW,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
    harness.candidate = null;
    await expect(
      harness.service.confirmCandidate({
        expectedRevision: 7,
        candidateId: 'candidate-missing',
        entityId: 'character-mio',
        semantic: semantic('Mio'),
        createdAt: NOW,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-candidate-not-found' }] });
    await expect(
      harness.service.merge({
        operationId: 'merge-cross-kind',
        expectedRevision: 7,
        sourceEntityId: 'character-rin',
        targetEntityId: 'location-home',
        targetSemantic: semantic('Home', {}, 'location'),
        committedAt: LATER,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
    expect(harness.commits).toHaveLength(0);
  });
});

class OperationHarness {
  document = document([], 0);
  candidate: ProjectEntityCandidateProjection | null = CANDIDATE;
  blockedOwner: (typeof PROJECT_ENTITY_REFERENCE_OWNER_IDS)[number] | undefined;
  readonly commits: ProjectEntityOperationCommitRequest[] = [];
  readonly dismissed: ProjectEntityCandidateDecision[] = [];
  readonly prepared: string[] = [];
  readonly aborted: string[] = [];

  readonly repository: ProjectEntityDocumentRepository = {
    load: async () => this.document,
    commit: async () => {
      throw new Error('Direct repository commit is not the canonical operation path.');
    },
  };

  readonly candidates: ProjectEntityCandidateWorkflowPort = {
    getCandidate: async () => this.candidate,
    dismiss: async (decision) => {
      this.dismissed.push(decision);
    },
  };

  readonly references: readonly ProjectEntityReferenceRewriteParticipant[] =
    PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) => ({
      ownerId,
      prepare: async (operation) => {
        this.prepared.push(ownerId);
        return this.plan(operation, ownerId);
      },
      commit: async () => {
        throw new Error('Reference commit belongs to the atomic operation commit port.');
      },
      abort: async () => {
        this.aborted.push(ownerId);
      },
    }));

  readonly commitPort: ProjectEntityOperationCommitPort = {
    commit: async (request) => {
      expect(request.expectedRevision).toBe(this.document.revision);
      this.commits.push(request);
      this.document = request.next;
      return this.document;
    },
  };

  readonly service = new ProjectEntityOperationService({
    repository: this.repository,
    candidates: this.candidates,
    references: this.references,
    commits: this.commitPort,
  });

  private plan(
    operation: ProjectEntityReferenceOperationRequest,
    ownerId: (typeof PROJECT_ENTITY_REFERENCE_OWNER_IDS)[number],
  ): ProjectEntityReferenceOwnerPlan {
    const occurrence = {
      ownerId,
      referenceId: `${ownerId}-reference`,
      source: operation.source,
      locationLabel: `${ownerId} reference`,
    };
    if (ownerId === this.blockedOwner) {
      return {
        status: 'blocked',
        ownerId,
        operationId: operation.operationId,
        blockers: [
          {
            code: 'project-entity-reference-plan-incomplete',
            message: 'Agent reference is immutable.',
            entityId: operation.source.entityId,
          },
        ],
        occurrences: [occurrence],
      };
    }
    const resolution =
      operation.operation === 'delete'
        ? { action: 'remove' as const, referenceId: occurrence.referenceId }
        : operation.replacement
          ? {
              action: 'rewrite' as const,
              referenceId: occurrence.referenceId,
              replacement: operation.replacement,
            }
          : { action: 'preserve' as const, referenceId: occurrence.referenceId };
    return {
      status: 'ready',
      ownerId,
      operationId: operation.operationId,
      expectedOwnerRevision: `${ownerId}-revision`,
      preparationId: `${operation.operationId}-${ownerId}`,
      occurrences: [occurrence],
      resolutions: [resolution],
    };
  }
}

function semantic(
  canonical: string,
  facts: ProjectEntitySemanticSnapshot['facts'] = {},
  kind: ProjectEntitySemanticSnapshot['kind'] = 'character',
): ProjectEntitySemanticSnapshot {
  return { kind, names: { canonical, aliases: [] }, facts, representations: [] };
}

function record(
  entityId: string,
  canonical: string,
  kind: ProjectEntitySemanticSnapshot['kind'] = 'character',
) {
  return {
    entityId,
    ...semantic(canonical, {}, kind),
    lifecycle: { state: 'active' as const },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function document(
  entities: ProjectEntityDocument['entities'],
  revision: number,
): ProjectEntityDocument {
  return { schemaVersion: 1, projectId: 'project-neko', revision, entities };
}

const NOW = '2026-08-05T00:00:00.000Z';
const LATER = '2026-08-05T01:00:00.000Z';
const CANDIDATE: ProjectEntityCandidateProjection = {
  candidateId: 'candidate-rin',
  kind: 'character',
  proposedNames: { canonical: 'Rin', aliases: [] },
  freshness: 'fresh',
  evidence: [
    {
      evidenceId: 'evidence-rin',
      owner: 'workspace',
      sourceId: 'story.md',
    },
  ],
};
