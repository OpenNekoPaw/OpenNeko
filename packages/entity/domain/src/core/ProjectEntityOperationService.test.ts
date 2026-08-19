import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_ENTITY_REFERENCE_OWNER_IDS,
  ProjectEntityOperationService,
  type ProjectEntityCandidateDecision,
  type ProjectEntityCandidateProjection,
  type ProjectEntityCandidateWorkflowPort,
  type ProjectEntityDocument,
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
      entityId: 'character-rin',
      semantic: semantic('Rin'),
      createdAt: NOW,
    });
    await harness.service.confirmCandidate({
      candidateId: CANDIDATE.candidateId,
      entityId: 'character-mio',
      semantic: semantic('Mio'),
      createdAt: LATER,
    });

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

  it('merges a candidate into an existing Entity and dismisses the discovery evidence', async () => {
    harness.document = document([record('character-rin', 'Rin')]);

    await harness.service.mergeCandidateInto({
      candidateId: CANDIDATE.candidateId,
      targetEntityId: 'character-rin',
      targetSemantic: semantic('Rin Aoki'),
      updatedAt: LATER,
    });
    await harness.service.dismissCandidate({
      candidateId: CANDIDATE.candidateId,
    });

    expect(harness.document.entities[0]?.names.canonical).toBe('Rin Aoki');
    expect(harness.commits[0]?.candidateDecision?.kind).toBe('merge-into');
    expect(harness.dismissed).toEqual([{ kind: 'dismiss', candidate: CANDIDATE }]);
    expect(harness.commits).toHaveLength(1);
  });

  it('edits names and bindings only through the canonical commit port', async () => {
    harness.document = document([record('character-rin', 'Rin')]);

    await harness.service.edit({
      entityId: 'character-rin',
      changes: {
        names: { canonical: 'Rin', display: 'Rin Aoki', aliases: ['Aoki'] },
      },
      updatedAt: LATER,
    });
    await harness.service.bind({
      entityId: 'character-rin',
      binding: binding('binding-rin-primary', true),
      updatedAt: LATER,
    });
    await harness.service.bind({
      entityId: 'character-rin',
      binding: binding('binding-rin-secondary', true),
      updatedAt: LATER,
    });
    await harness.service.unbind({
      entityId: 'character-rin',
      bindingId: 'binding-rin-secondary',
      updatedAt: LATER,
    });

    expect(harness.commits).toHaveLength(4);
    expect(harness.document.entities[0]).toMatchObject({
      names: { canonical: 'Rin', display: 'Rin Aoki', aliases: ['Aoki'] },
      representations: [expect.objectContaining({ bindingId: 'binding-rin-primary' })],
      updatedAt: LATER,
    });
    expect(harness.commits[2]?.next.entities[0]?.representations).toEqual([
      expect.not.objectContaining({ isDefault: true }),
      binding('binding-rin-secondary', true),
    ]);
  });

  it('rejects duplicate binding IDs and missing unbind targets', async () => {
    harness.document = document([
      {
        ...record('character-rin', 'Rin'),
        representations: [binding('binding-rin-primary', true)],
      },
    ]);

    await expect(
      harness.service.bind({
        entityId: 'character-rin',
        binding: binding('binding-rin-primary'),
        updatedAt: LATER,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'duplicate-project-entity-binding-id' }] });
    await expect(
      harness.service.unbind({
        entityId: 'character-rin',
        bindingId: 'binding-missing',
        updatedAt: LATER,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
    expect(harness.commits).toHaveLength(0);
  });

  it('merges confirmed Entities only after every reference owner prepares', async () => {
    harness.document = document([
      record('character-old', 'Old Rin'),
      record('character-rin', 'Rin'),
    ]);

    await harness.service.merge({
      operationId: 'merge-rin',
      sourceEntityId: 'character-old',
      targetEntityId: 'character-rin',
      targetSemantic: semantic('Merged Rin'),
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
    expect(harness.document.entities[1]?.names.canonical).toBe('Merged Rin');
  });

  it('uses complete reference plans for deprecation and deletion', async () => {
    harness.document = document([
      record('character-old', 'Old Rin'),
      record('character-rin', 'Rin'),
    ]);
    await harness.service.deprecate({
      operationId: 'deprecate-old',
      entityId: 'character-old',
      replacementEntityId: 'character-rin',
      deprecatedAt: LATER,
    });
    expect(harness.commits[0]?.referencePlan?.operation.operation).toBe('deprecate');

    await harness.service.delete({
      operationId: 'delete-old',
      entityId: 'character-old',
    });
    expect(harness.commits[1]?.referencePlan?.operation.operation).toBe('delete');
    expect(harness.document.entities.map((entity) => entity.entityId)).toEqual(['character-rin']);
  });

  it('aborts prepared owners and preserves the document when a reference owner blocks', async () => {
    harness.document = document([
      record('character-old', 'Old Rin'),
      record('character-rin', 'Rin'),
    ]);
    harness.blockedOwner = 'agent';

    await expect(
      harness.service.merge({
        operationId: 'merge-blocked',
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
    expect(harness.document.entities).toHaveLength(2);
  });

  it('never consults a stale usage projection to authorize deletion', async () => {
    harness.document = document([record('character-rin', 'Rin')]);
    harness.blockedOwner = 'document';
    const staleUsageProjection = {
      list: vi.fn((): never => {
        throw new Error('usage projection must not authorize destructive operations');
      }),
    };

    await expect(
      harness.service.delete({ operationId: 'delete-rin', entityId: 'character-rin' }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ message: 'Agent reference is immutable.' })],
    });
    expect(staleUsageProjection.list).not.toHaveBeenCalled();
    expect(harness.prepared).toEqual(PROJECT_ENTITY_REFERENCE_OWNER_IDS);
    expect(harness.document.entities).toHaveLength(1);
  });

  it('rejects missing candidates, duplicate IDs, and cross-kind merges locally', async () => {
    harness.document = document([
      record('character-rin', 'Rin'),
      record('location-home', 'Home', 'location'),
    ]);

    await expect(
      harness.service.create({
        entityId: 'character-rin',
        semantic: semantic('Rin'),
        createdAt: NOW,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
    harness.candidate = null;
    await expect(
      harness.service.confirmCandidate({
        candidateId: 'candidate-missing',
        entityId: 'character-mio',
        semantic: semantic('Mio'),
        createdAt: NOW,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-candidate-not-found' }] });
    await expect(
      harness.service.merge({
        operationId: 'merge-cross-kind',
        sourceEntityId: 'character-rin',
        targetEntityId: 'location-home',
        targetSemantic: semantic('Home', 'location'),
        committedAt: LATER,
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'project-entity-operation-invalid' }] });
    expect(harness.commits).toHaveLength(0);
  });
});

class OperationHarness {
  document = document([]);
  candidate: ProjectEntityCandidateProjection | null = CANDIDATE;
  blockedOwner: (typeof PROJECT_ENTITY_REFERENCE_OWNER_IDS)[number] | undefined;
  readonly commits: ProjectEntityOperationCommitRequest[] = [];
  readonly dismissed: ProjectEntityCandidateDecision[] = [];
  readonly prepared: string[] = [];
  readonly aborted: string[] = [];

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
    commit: async (mutation) => {
      const request = await mutation(this.document);
      this.commits.push(request);
      this.document = request.next;
      return this.document;
    },
  };

  readonly service = new ProjectEntityOperationService({
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
      preparationId: `${operation.operationId}-${ownerId}`,
      occurrences: [occurrence],
      resolutions: [resolution],
    };
  }
}

function semantic(
  canonical: string,
  kind: ProjectEntitySemanticSnapshot['kind'] = 'character',
): ProjectEntitySemanticSnapshot {
  return { kind, names: { canonical, aliases: [] }, representations: [] };
}

function record(
  entityId: string,
  canonical: string,
  kind: ProjectEntitySemanticSnapshot['kind'] = 'character',
) {
  return {
    entityId,
    ...semantic(canonical, kind),
    lifecycle: { state: 'active' as const },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function binding(bindingId: string, isDefault = false) {
  return {
    bindingId,
    role: 'portrait' as const,
    target: {
      file: { authority: 'workspace' as const, path: `${bindingId}.png` },
    },
    source: 'user' as const,
    ...(isDefault ? { isDefault: true } : {}),
    acceptedAt: NOW,
  };
}

function document(entities: ProjectEntityDocument['entities']): ProjectEntityDocument {
  return { projectId: 'project-neko', entities };
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
