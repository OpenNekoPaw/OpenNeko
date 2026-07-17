import type { PerceptionEvidence } from './agent-observation';
import type { RecoveryGuidanceRecommendation } from './recovery-guidance';

export type SubagentReviewPurpose =
  'quality-review' | 'long-context-summary' | 'asset-comparison' | 'recovery-guidance-review';

export interface SubagentReviewRequest {
  readonly id: string;
  readonly purpose: SubagentReviewPurpose;
  readonly prompt: string;
  readonly observationIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly artifactRefs?: readonly string[];
  readonly createdAt: number;
}

export interface SubagentReviewResult {
  readonly requestId: string;
  readonly reviewerId: string;
  readonly summary: string;
  readonly evidence: readonly PerceptionEvidence[];
  readonly recommendations: readonly RecoveryGuidanceRecommendation[];
  readonly createdAt: number;
}

export interface ISubagentReviewer {
  review(request: SubagentReviewRequest): Promise<SubagentReviewResult>;
}

export function createSubagentReviewEvidence(input: {
  readonly id: string;
  readonly reviewerId: string;
  readonly requestId: string;
  readonly summary: string;
  readonly observationId?: string;
  readonly createdAt: number;
}): PerceptionEvidence {
  return {
    id: input.id,
    source: 'subagent',
    summary: input.summary,
    ...(input.observationId ? { observationId: input.observationId } : {}),
    data: {
      kind: 'subagent.review',
      reviewerId: input.reviewerId,
      requestId: input.requestId,
    },
    createdAt: input.createdAt,
    status: 'active',
  };
}

export function isSubagentReviewResultReviewerOnly(result: SubagentReviewResult): boolean {
  return result.evidence.every((item) => item.source === 'subagent');
}

export type SubagentReviewerForbiddenRuntimeRole = never;
