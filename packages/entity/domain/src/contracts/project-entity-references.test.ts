import { describe, expect, it } from 'vitest';
import {
  PROJECT_ENTITY_REFERENCE_OWNER_IDS,
  ProjectEntityContractError,
  assertProjectEntityReferenceOperationRequest,
  createProjectEntityReferenceRewritePlan,
  type ProjectEntityReferenceOperationRequest,
  type ProjectEntityReferenceOwnerPlan,
  type ProjectEntityReferenceOwnerReadyPlan,
} from './index';

describe('Project Entity reference rewrite contract', () => {
  it('requires every current reference owner before a merge can commit', () => {
    const operation = createMergeOperation();
    const ownerPlans = PROJECT_ENTITY_REFERENCE_OWNER_IDS.slice(1).map((ownerId) =>
      createReadyPlan(operation, ownerId),
    );

    expect(() => createProjectEntityReferenceRewritePlan({ operation, ownerPlans })).toThrowError(
      /missing owners: entity-document/u,
    );
  });

  it('rejects duplicate owners and partial occurrence resolution', () => {
    const operation = createMergeOperation();
    const canvas = createReadyPlan(operation, 'canvas');
    expect(() =>
      createProjectEntityReferenceRewritePlan({
        operation,
        ownerPlans: [canvas, canvas],
      }),
    ).toThrowError(/stale or duplicate owner/u);

    const partial: ProjectEntityReferenceOwnerReadyPlan = {
      ...canvas,
      occurrences: [
        {
          ownerId: 'canvas',
          referenceId: 'canvas-ref-2',
          source: operation.source,
          locationLabel: 'Canvas node 2',
        },
      ],
      resolutions: [],
    };
    expect(() =>
      createProjectEntityReferenceRewritePlan({
        operation,
        ownerPlans: PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) =>
          ownerId === 'canvas' ? partial : createReadyPlan(operation, ownerId),
        ),
      }),
    ).toThrowError(/partial plan/u);
  });

  it('surfaces exact owner blockers instead of reporting a completed rewrite', () => {
    const operation = createMergeOperation();
    const ownerPlans: readonly ProjectEntityReferenceOwnerPlan[] =
      PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) =>
        ownerId === 'agent'
          ? {
              status: 'blocked',
              ownerId,
              operationId: operation.operationId,
              blockers: [
                {
                  code: 'project-entity-reference-plan-incomplete',
                  message: 'Conversation history reference is immutable.',
                  entityId: operation.source.entityId,
                },
              ],
              occurrences: [],
            }
          : createReadyPlan(operation, ownerId),
      );

    expect(() => createProjectEntityReferenceRewritePlan({ operation, ownerPlans })).toThrowError(
      new ProjectEntityContractError([
        {
          code: 'project-entity-reference-plan-incomplete',
          message: 'Conversation history reference is immutable.',
          entityId: operation.source.entityId,
        },
      ]),
    );
  });

  it('creates a deterministic committable plan after every owner prepares', () => {
    const operation = createMergeOperation();
    const ownerPlans = [...PROJECT_ENTITY_REFERENCE_OWNER_IDS]
      .reverse()
      .map((ownerId) => createReadyPlan(operation, ownerId));

    const plan = createProjectEntityReferenceRewritePlan({ operation, ownerPlans });

    expect(plan.owners.map((owner) => owner.ownerId)).toEqual(PROJECT_ENTITY_REFERENCE_OWNER_IDS);
    expect(plan.owners.every((owner) => owner.resolutions[0]?.action === 'rewrite')).toBe(true);
  });

  it('validates replacement semantics for merge, deprecate, and delete', () => {
    const merge = createMergeOperation();
    expect(assertProjectEntityReferenceOperationRequest(merge)).toBe(merge);
    expect(() =>
      assertProjectEntityReferenceOperationRequest({ ...merge, replacement: undefined }),
    ).toThrowError(/request is invalid/u);
    expect(() =>
      assertProjectEntityReferenceOperationRequest({
        ...merge,
        operation: 'delete',
      }),
    ).toThrowError(/request is invalid/u);
    expect(
      assertProjectEntityReferenceOperationRequest({
        ...merge,
        operation: 'deprecate',
        replacement: undefined,
      }).operation,
    ).toBe('deprecate');
  });

  it('rejects foreign occurrences and non-removal delete resolutions', () => {
    const merge = createMergeOperation();
    const foreignCanvas: ProjectEntityReferenceOwnerReadyPlan = {
      ...createReadyPlan(merge, 'canvas'),
      occurrences: [
        {
          ownerId: 'canvas',
          referenceId: 'canvas-ref-1',
          source: { entityId: 'character-other', entityKind: 'character' },
          locationLabel: 'Foreign Canvas reference',
        },
      ],
    };
    expect(() =>
      createProjectEntityReferenceRewritePlan({
        operation: merge,
        ownerPlans: PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) =>
          ownerId === 'canvas' ? foreignCanvas : createReadyPlan(merge, ownerId),
        ),
      }),
    ).toThrowError(/foreign data/u);

    const deletion: ProjectEntityReferenceOperationRequest = {
      ...merge,
      operationId: 'operation-delete-rin',
      operation: 'delete',
      replacement: undefined,
    };
    const invalidDeletePlans = PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) => ({
      ...createReadyPlan(merge, ownerId),
      operationId: deletion.operationId,
    }));
    expect(() =>
      createProjectEntityReferenceRewritePlan({
        operation: deletion,
        ownerPlans: invalidDeletePlans,
      }),
    ).toThrowError(/delete must remove every known reference/u);
  });

  it('requires deprecation to rewrite to an explicit replacement or preserve in place', () => {
    const merge = createMergeOperation();
    const withReplacement: ProjectEntityReferenceOperationRequest = {
      ...merge,
      operationId: 'operation-deprecate-rin',
      operation: 'deprecate',
    };
    const preservingPlans = PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) => {
      const plan = createReadyPlan(withReplacement, ownerId);
      return {
        ...plan,
        resolutions: plan.resolutions.map((resolution) => ({
          action: 'preserve' as const,
          referenceId: resolution.referenceId,
        })),
      };
    });
    expect(() =>
      createProjectEntityReferenceRewritePlan({
        operation: withReplacement,
        ownerPlans: preservingPlans,
      }),
    ).toThrowError(/must rewrite every known reference/u);

    const withoutReplacement: ProjectEntityReferenceOperationRequest = {
      ...withReplacement,
      operationId: 'operation-deprecate-in-place',
      replacement: undefined,
    };
    const preserveInPlace = PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) => {
      const plan = createReadyPlan(withReplacement, ownerId);
      return {
        ...plan,
        operationId: withoutReplacement.operationId,
        resolutions: plan.resolutions.map((resolution) => ({
          action: 'preserve' as const,
          referenceId: resolution.referenceId,
        })),
      };
    });
    expect(
      createProjectEntityReferenceRewritePlan({
        operation: withoutReplacement,
        ownerPlans: preserveInPlace,
      }).owners,
    ).toHaveLength(PROJECT_ENTITY_REFERENCE_OWNER_IDS.length);
  });
});

function createMergeOperation(): ProjectEntityReferenceOperationRequest {
  return {
    operationId: 'operation-merge-rin',
    projectId: 'project-neko',
    expectedDocumentRevision: 7,
    operation: 'merge',
    source: { entityId: 'character-old-rin', entityKind: 'character' },
    replacement: { entityId: 'character-rin', entityKind: 'character' },
  };
}

function createReadyPlan(
  operation: ProjectEntityReferenceOperationRequest,
  ownerId: ProjectEntityReferenceOwnerReadyPlan['ownerId'],
): ProjectEntityReferenceOwnerReadyPlan {
  if (!operation.replacement) {
    throw new Error('Merge test fixture requires a replacement Entity.');
  }
  const referenceId = `${ownerId}-ref-1`;
  return {
    status: 'ready',
    ownerId,
    operationId: operation.operationId,
    expectedOwnerRevision: `${ownerId}-revision-4`,
    preparationId: `${ownerId}-preparation-1`,
    occurrences: [
      {
        ownerId,
        referenceId,
        source: operation.source,
        locationLabel: `${ownerId} reference`,
      },
    ],
    resolutions: [
      {
        action: 'rewrite',
        referenceId,
        replacement: operation.replacement,
      },
    ],
  };
}
