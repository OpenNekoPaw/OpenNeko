import { isCreativeEntityKind, type CreativeEntityKind } from './creative-entity-identity';
import {
  ProjectEntityContractError,
  type ProjectEntityDiagnostic,
} from './project-entity-document';

export const PROJECT_ENTITY_REFERENCE_OWNER_IDS = [
  'entity-document',
  'canvas',
  'agent',
  'chara',
  'document',
  'project-portability',
] as const;

export const PROJECT_ENTITY_REFERENCE_OPERATION_KINDS = ['merge', 'deprecate', 'delete'] as const;

export type ProjectEntityReferenceOwnerId = (typeof PROJECT_ENTITY_REFERENCE_OWNER_IDS)[number];
export type ProjectEntityReferenceOperationKind =
  (typeof PROJECT_ENTITY_REFERENCE_OPERATION_KINDS)[number];

export interface ProjectEntityReferenceTarget {
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
}

export interface ProjectEntityReferenceOperationRequest {
  readonly operationId: string;
  readonly projectId: string;
  readonly operation: ProjectEntityReferenceOperationKind;
  readonly source: ProjectEntityReferenceTarget;
  readonly replacement?: ProjectEntityReferenceTarget;
}

export interface ProjectEntityReferenceOccurrence {
  readonly ownerId: ProjectEntityReferenceOwnerId;
  readonly referenceId: string;
  readonly source: ProjectEntityReferenceTarget;
  readonly locationLabel: string;
}

export type ProjectEntityReferenceResolution =
  | {
      readonly action: 'rewrite';
      readonly referenceId: string;
      readonly replacement: ProjectEntityReferenceTarget;
    }
  | { readonly action: 'remove'; readonly referenceId: string }
  | { readonly action: 'preserve'; readonly referenceId: string };

export interface ProjectEntityReferenceOwnerReadyPlan {
  readonly status: 'ready';
  readonly ownerId: ProjectEntityReferenceOwnerId;
  readonly operationId: string;
  readonly preparationId: string;
  readonly occurrences: readonly ProjectEntityReferenceOccurrence[];
  readonly resolutions: readonly ProjectEntityReferenceResolution[];
}

export interface ProjectEntityReferenceOwnerBlockedPlan {
  readonly status: 'blocked';
  readonly ownerId: ProjectEntityReferenceOwnerId;
  readonly operationId: string;
  readonly blockers: readonly ProjectEntityDiagnostic[];
  readonly occurrences: readonly ProjectEntityReferenceOccurrence[];
}

export type ProjectEntityReferenceOwnerPlan =
  ProjectEntityReferenceOwnerReadyPlan | ProjectEntityReferenceOwnerBlockedPlan;

export interface ProjectEntityReferenceRewriteParticipant {
  readonly ownerId: ProjectEntityReferenceOwnerId;
  prepare(
    request: ProjectEntityReferenceOperationRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityReferenceOwnerPlan>;
  commit(plan: ProjectEntityReferenceOwnerReadyPlan, signal?: AbortSignal): Promise<void>;
  abort(plan: ProjectEntityReferenceOwnerReadyPlan): Promise<void>;
}

export interface ProjectEntityReferenceRewritePlan {
  readonly operation: ProjectEntityReferenceOperationRequest;
  readonly owners: readonly ProjectEntityReferenceOwnerReadyPlan[];
}

export function assertProjectEntityReferenceOperationRequest(
  value: ProjectEntityReferenceOperationRequest,
): ProjectEntityReferenceOperationRequest {
  const replacementRequired = value.operation === 'merge';
  const replacementForbidden = value.operation === 'delete';
  if (
    !isStableIdentity(value.operationId) ||
    !isStableIdentity(value.projectId) ||
    !isOneOf(value.operation, PROJECT_ENTITY_REFERENCE_OPERATION_KINDS) ||
    !isReferenceTarget(value.source) ||
    (replacementRequired && !isReferenceTarget(value.replacement)) ||
    (replacementForbidden && value.replacement !== undefined) ||
    (value.replacement !== undefined && !isReferenceTarget(value.replacement)) ||
    (value.replacement !== undefined &&
      value.replacement.entityId === value.source.entityId &&
      value.replacement.entityKind === value.source.entityKind)
  ) {
    throw incompletePlan('Project Entity reference operation request is invalid.');
  }
  return value;
}

export function createProjectEntityReferenceRewritePlan(input: {
  readonly operation: ProjectEntityReferenceOperationRequest;
  readonly ownerPlans: readonly ProjectEntityReferenceOwnerPlan[];
}): ProjectEntityReferenceRewritePlan {
  const operation = assertProjectEntityReferenceOperationRequest(input.operation);
  const plansByOwner = new Map<ProjectEntityReferenceOwnerId, ProjectEntityReferenceOwnerPlan>();
  for (const plan of input.ownerPlans) {
    if (
      plan.operationId !== operation.operationId ||
      !isOneOf(plan.ownerId, PROJECT_ENTITY_REFERENCE_OWNER_IDS) ||
      plansByOwner.has(plan.ownerId)
    ) {
      throw incompletePlan('Project Entity reference plan contains a stale or duplicate owner.');
    }
    assertOwnerPlan(operation, plan);
    plansByOwner.set(plan.ownerId, plan);
  }
  const missingOwners = PROJECT_ENTITY_REFERENCE_OWNER_IDS.filter(
    (ownerId) => !plansByOwner.has(ownerId),
  );
  if (missingOwners.length > 0) {
    throw incompletePlan(
      `Project Entity reference plan is missing owners: ${missingOwners.join(', ')}.`,
    );
  }
  const blockers = [...plansByOwner.values()].flatMap((plan) =>
    plan.status === 'blocked' ? plan.blockers : [],
  );
  if (blockers.length > 0) {
    throw new ProjectEntityContractError(blockers);
  }
  const owners = PROJECT_ENTITY_REFERENCE_OWNER_IDS.map((ownerId) => plansByOwner.get(ownerId));
  if (!owners.every(isReadyOwnerPlan)) {
    throw incompletePlan('Project Entity reference plan contains an uncommittable owner.');
  }
  return { operation, owners };
}

function assertOwnerPlan(
  operation: ProjectEntityReferenceOperationRequest,
  plan: ProjectEntityReferenceOwnerPlan,
): void {
  if (
    plan.occurrences.some(
      (occurrence) =>
        occurrence.ownerId !== plan.ownerId ||
        !sameReferenceTarget(occurrence.source, operation.source),
    )
  ) {
    throw incompletePlan(`Project Entity reference owner '${plan.ownerId}' returned foreign data.`);
  }
  if (plan.status === 'blocked') {
    if (plan.blockers.length === 0) {
      throw incompletePlan(`Project Entity reference owner '${plan.ownerId}' omitted its blocker.`);
    }
    return;
  }
  if (!isStableIdentity(plan.preparationId)) {
    throw incompletePlan(
      `Project Entity reference owner '${plan.ownerId}' omitted preparation identity.`,
    );
  }
  const occurrenceIds = new Set(plan.occurrences.map((occurrence) => occurrence.referenceId));
  const resolutionIds = plan.resolutions.map((resolution) => resolution.referenceId);
  if (
    occurrenceIds.size !== plan.occurrences.length ||
    new Set(resolutionIds).size !== resolutionIds.length ||
    occurrenceIds.size !== resolutionIds.length ||
    resolutionIds.some((referenceId) => !occurrenceIds.has(referenceId))
  ) {
    throw incompletePlan(
      `Project Entity reference owner '${plan.ownerId}' returned a partial plan.`,
    );
  }
  for (const resolution of plan.resolutions) {
    if (operation.operation === 'merge') {
      if (
        resolution.action !== 'rewrite' ||
        operation.replacement === undefined ||
        !sameReferenceTarget(resolution.replacement, operation.replacement)
      ) {
        throw incompletePlan(
          'Project Entity merge must rewrite every known reference to its target.',
        );
      }
    }
    if (operation.operation === 'delete' && resolution.action !== 'remove') {
      throw incompletePlan('Project Entity delete must remove every known reference.');
    }
    if (operation.operation === 'deprecate' && operation.replacement !== undefined) {
      if (
        resolution.action !== 'rewrite' ||
        !sameReferenceTarget(resolution.replacement, operation.replacement)
      ) {
        throw incompletePlan(
          'Project Entity deprecation with a replacement must rewrite every known reference.',
        );
      }
    }
    if (
      operation.operation === 'deprecate' &&
      operation.replacement === undefined &&
      resolution.action !== 'preserve'
    ) {
      throw incompletePlan(
        'Project Entity deprecation without a replacement must preserve every known reference.',
      );
    }
  }
}

function isReferenceTarget(value: unknown): value is ProjectEntityReferenceTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'entityId' in value &&
    'entityKind' in value &&
    isStableIdentity(value.entityId) &&
    isCreativeEntityKind(value.entityKind)
  );
}

function sameReferenceTarget(
  left: ProjectEntityReferenceTarget,
  right: ProjectEntityReferenceTarget,
): boolean {
  return left.entityId === right.entityId && left.entityKind === right.entityKind;
}

function isReadyOwnerPlan(
  value: ProjectEntityReferenceOwnerPlan | undefined,
): value is ProjectEntityReferenceOwnerReadyPlan {
  return value?.status === 'ready';
}

function incompletePlan(message: string): ProjectEntityContractError {
  return new ProjectEntityContractError([
    { code: 'project-entity-reference-plan-incomplete', message },
  ]);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.some((candidate) => candidate === value);
}

function isStableIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\\/\0]/u.test(value);
}
