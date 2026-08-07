import {
  PROJECT_ENTITY_CANDIDATE_SOURCE_OWNERS,
  isProjectEntityCandidateProjection,
  type CreativeEntityOccurrenceProjection,
  type ProjectEntityCandidateProjection,
  type ProjectEntityCandidateSourceOwner,
} from '@neko/entity-domain';

export interface ProjectEntityDiscoverySource {
  readonly sourceId: string;
  readonly owner: ProjectEntityCandidateSourceOwner;
  readonly fingerprint: string;
}

export interface ProjectEntityDiscoveryProjectionBatch {
  readonly source: ProjectEntityDiscoverySource;
  readonly candidates: readonly ProjectEntityCandidateProjection[];
  readonly occurrences: readonly CreativeEntityOccurrenceProjection[];
  readonly updatedAt: string;
}

export interface ProjectEntityDiscoveryOccurrenceQuery {
  readonly sourceId?: string;
  readonly entityId?: string;
  readonly candidateId?: string;
}

export interface ProjectEntityDiscoveryProjectionPort {
  replaceDiscoverySource(request: ProjectEntityDiscoveryProjectionBatch): Promise<void>;
  deleteDiscoverySource(sourceId: string, updatedAt: string): Promise<void>;
  listCandidateProjections(): Promise<readonly ProjectEntityCandidateProjection[]>;
  listDiscoveryOccurrences(
    query?: ProjectEntityDiscoveryOccurrenceQuery,
  ): Promise<readonly CreativeEntityOccurrenceProjection[]>;
}

export function assertProjectEntityDiscoveryProjectionBatch(
  request: ProjectEntityDiscoveryProjectionBatch,
): ProjectEntityDiscoveryProjectionBatch {
  if (
    !request.source.sourceId.trim() ||
    !PROJECT_ENTITY_CANDIDATE_SOURCE_OWNERS.some((owner) => owner === request.source.owner) ||
    !request.source.fingerprint.trim() ||
    !Number.isFinite(Date.parse(request.updatedAt))
  ) {
    throw new Error('Project Entity discovery source identity is invalid.');
  }
  const candidateIds = new Set<string>();
  for (const candidate of request.candidates) {
    if (
      !isProjectEntityCandidateProjection(candidate) ||
      candidateIds.has(candidate.candidateId) ||
      candidate.evidence.some(
        (evidence) =>
          evidence.owner !== request.source.owner || evidence.sourceId !== request.source.sourceId,
      )
    ) {
      throw new Error('Project Entity candidate projection does not match its source.');
    }
    candidateIds.add(candidate.candidateId);
  }
  const occurrenceIds = new Set<string>();
  for (const occurrence of request.occurrences) {
    if (
      !occurrence.occurrenceId?.trim() ||
      occurrenceIds.has(occurrence.occurrenceId) ||
      occurrence.source.sourceId !== request.source.sourceId ||
      occurrence.source.sourceKind !== request.source.owner ||
      occurrence.sourceFingerprint !== request.source.fingerprint ||
      (!occurrence.entityRef && !occurrence.candidateId) ||
      (occurrence.entityRef !== undefined && occurrence.candidateId !== undefined)
    ) {
      throw new Error('Project Entity occurrence projection does not match its source.');
    }
    occurrenceIds.add(occurrence.occurrenceId);
  }
  return request;
}
