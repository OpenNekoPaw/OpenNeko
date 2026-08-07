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
  readonly next: ProjectEntityDocument;
  readonly candidateDecision?: Exclude<
    ProjectEntityCandidateDecision,
    { readonly kind: 'dismiss' }
  >;
  readonly referencePlan?: ProjectEntityReferenceRewritePlan;
}

export type ProjectEntityOperationMutation = (
  current: ProjectEntityDocument,
) => ProjectEntityOperationCommitRequest | Promise<ProjectEntityOperationCommitRequest>;

/**
 * Commits the canonical document and any declared candidate/reference effects as one operation.
 * Concrete adapters must reject partial commits rather than report success.
 */
export interface ProjectEntityOperationCommitPort {
  commit(
    mutation: ProjectEntityOperationMutation,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument>;
}
