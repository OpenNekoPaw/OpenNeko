import {
  ProjectEntityContractError,
  type EntityBindingAvailabilityProjectionValue,
  type ProjectEntityCandidateProjection,
  type ProjectEntityCandidateSourceOwner,
  type ProjectEntityDocument,
  type ProjectEntityRecord,
} from '../contracts/index';
import { contentLocatorsEqual } from '@neko/content';

export type ProjectEntityManagementStatus =
  'confirmed' | 'candidate' | 'needs-attention' | 'deprecated';

export type ProjectEntityManagementProjection =
  | {
      readonly projectionId: string;
      readonly status: Exclude<ProjectEntityManagementStatus, 'candidate'>;
      readonly entity: ProjectEntityRecord;
      readonly bindingAvailability: readonly EntityBindingAvailabilityProjectionValue[];
      readonly sourceOwners: readonly ['project-entity'];
    }
  | {
      readonly projectionId: string;
      readonly status: 'candidate';
      readonly candidate: ProjectEntityCandidateProjection;
      readonly sourceOwners: readonly ProjectEntityCandidateSourceOwner[];
    };

export function projectEntityManagement(input: {
  readonly document: ProjectEntityDocument;
  readonly candidates: readonly ProjectEntityCandidateProjection[];
  readonly bindingAvailability: readonly EntityBindingAvailabilityProjectionValue[];
}): readonly ProjectEntityManagementProjection[] {
  const entitiesById = new Map(input.document.entities.map((entity) => [entity.entityId, entity]));
  const availabilityByEntity = new Map<string, EntityBindingAvailabilityProjectionValue[]>();
  for (const binding of input.bindingAvailability) {
    const entity = entitiesById.get(binding.entityId);
    if (
      !entity ||
      entity.kind !== binding.entityKind ||
      !entity.representations.some((candidate) => candidate.bindingId === binding.bindingId)
    ) {
      throw projectionError(
        `Binding availability '${binding.bindingId}' does not belong to its Project Entity.`,
        binding.entityId,
        binding.bindingId,
      );
    }
    const current = availabilityByEntity.get(binding.entityId) ?? [];
    if (current.some((candidate) => candidate.bindingId === binding.bindingId)) {
      throw projectionError(
        `Binding availability '${binding.bindingId}' is duplicated.`,
        binding.entityId,
        binding.bindingId,
      );
    }
    current.push(binding);
    availabilityByEntity.set(binding.entityId, current);
  }

  return [
    ...input.document.entities.map((entity) => {
      const bindingAvailability = availabilityByEntity.get(entity.entityId) ?? [];
      return {
        projectionId: `entity:${entity.entityId}`,
        status:
          entity.lifecycle.state === 'deprecated'
            ? 'deprecated'
            : bindingAvailability.some((binding) => binding.availability === 'needs-attention')
              ? 'needs-attention'
              : 'confirmed',
        entity,
        bindingAvailability,
        sourceOwners: ['project-entity'],
      } satisfies ProjectEntityManagementProjection;
    }),
    ...mergeCandidates(input.candidates),
  ];
}

function mergeCandidates(
  candidates: readonly ProjectEntityCandidateProjection[],
): readonly ProjectEntityManagementProjection[] {
  const byId = new Map<string, ProjectEntityCandidateProjection>();
  for (const candidate of candidates) {
    const current = byId.get(candidate.candidateId);
    if (!current) {
      byId.set(candidate.candidateId, candidate);
      continue;
    }
    if (
      current.kind !== candidate.kind ||
      !sameNames(current.proposedNames, candidate.proposedNames)
    ) {
      throw projectionError(
        `Candidate '${candidate.candidateId}' has conflicting semantic projections.`,
        undefined,
        undefined,
        candidate.candidateId,
      );
    }
    const evidence = new Map(current.evidence.map((value) => [value.evidenceId, value]));
    for (const value of candidate.evidence) {
      const existing = evidence.get(value.evidenceId);
      if (existing && !sameEvidence(existing, value)) {
        throw projectionError(
          `Candidate evidence '${value.evidenceId}' has conflicting projections.`,
          undefined,
          undefined,
          candidate.candidateId,
        );
      }
      evidence.set(value.evidenceId, value);
    }
    byId.set(candidate.candidateId, {
      ...current,
      confidence: maxOptional(current.confidence, candidate.confidence),
      freshness: leastFresh(current.freshness, candidate.freshness),
      evidence: [...evidence.values()],
    });
  }
  return [...byId.values()].map((candidate) => ({
    projectionId: `candidate:${candidate.candidateId}`,
    status: 'candidate',
    candidate,
    sourceOwners: [...new Set(candidate.evidence.map((evidence) => evidence.owner))],
  }));
}

function sameNames(
  left: ProjectEntityCandidateProjection['proposedNames'],
  right: ProjectEntityCandidateProjection['proposedNames'],
): boolean {
  return (
    left.canonical === right.canonical &&
    left.display === right.display &&
    left.aliases.length === right.aliases.length &&
    left.aliases.every((alias, index) => alias === right.aliases[index])
  );
}

function sameEvidence(
  left: ProjectEntityCandidateProjection['evidence'][number],
  right: ProjectEntityCandidateProjection['evidence'][number],
): boolean {
  return (
    left.evidenceId === right.evidenceId &&
    left.owner === right.owner &&
    left.sourceId === right.sourceId &&
    left.label === right.label &&
    left.confidence === right.confidence &&
    left.observedAt === right.observedAt &&
    (left.locator === undefined
      ? right.locator === undefined
      : right.locator !== undefined && contentLocatorsEqual(left.locator, right.locator))
  );
}

function maxOptional(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}

function leastFresh(
  left: ProjectEntityCandidateProjection['freshness'],
  right: ProjectEntityCandidateProjection['freshness'],
): ProjectEntityCandidateProjection['freshness'] {
  const order = ['fresh', 'building', 'partial', 'stale', 'failed'] as const;
  return order[Math.max(order.indexOf(left), order.indexOf(right))] ?? 'failed';
}

function projectionError(
  message: string,
  entityId?: string,
  bindingId?: string,
  candidateId?: string,
): ProjectEntityContractError {
  return new ProjectEntityContractError([
    {
      code: 'project-entity-operation-invalid',
      message,
      ...(entityId ? { entityId } : {}),
      ...(bindingId ? { bindingId } : {}),
      ...(candidateId ? { candidateId } : {}),
    },
  ]);
}
