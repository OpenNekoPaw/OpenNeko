import type {
  ProjectEntityCandidateProjection,
  ProjectEntityDocument,
} from './project-entity-document';
import type { ProjectEntityReferenceRewritePlan } from './project-entity-references';

export type ProjectEntityCandidateDecisionKind = 'confirm' | 'merge-into' | 'dismiss';

export type ProjectEntityCandidateDecision =
  | { readonly kind: 'confirm'; readonly candidate: ProjectEntityCandidateProjection }
  | { readonly kind: 'merge-into'; readonly candidate: ProjectEntityCandidateProjection }
  | { readonly kind: 'dismiss'; readonly candidate: ProjectEntityCandidateProjection };

export interface ProjectEntityCandidateWorkflowPort {
  getCandidate(
    candidateId: string,
    signal?: AbortSignal,
  ): Promise<ProjectEntityCandidateProjection | null>;
  dismiss(
    decision: Extract<ProjectEntityCandidateDecision, { readonly kind: 'dismiss' }>,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface ProjectEntityOperationCommitRequest {
  readonly expectedRevision: number;
  readonly next: ProjectEntityDocument;
  readonly candidateDecision?: Exclude<
    ProjectEntityCandidateDecision,
    { readonly kind: 'dismiss' }
  >;
  readonly referencePlan?: ProjectEntityReferenceRewritePlan;
}

/**
 * Commits the canonical document and any declared candidate/reference effects as one operation.
 * Concrete adapters must reject partial commits rather than report success.
 */
export interface ProjectEntityOperationCommitPort {
  commit(
    request: ProjectEntityOperationCommitRequest,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument>;
}
