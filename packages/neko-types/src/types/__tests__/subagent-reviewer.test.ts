import { describe, expect, it } from 'vitest';
import {
  createSubagentReviewEvidence,
  isSubagentReviewResultReviewerOnly,
  type SubagentReviewRequest,
  type SubagentReviewResult,
} from '../subagent-reviewer';
import { shotRecoveryGuidanceRecommendationFixture } from '../__fixtures__/agent-first-fixtures';

describe('subagent reviewer contracts', () => {
  it('models subagent output as evidence and recommendations only', () => {
    const request: SubagentReviewRequest = {
      id: 'review-request-shot-3',
      purpose: 'recovery-guidance-review',
      prompt: 'Review whether shot 3 needs a minimal prompt adjustment.',
      observationIds: ['obs-shot-3-style-drift'],
      evidenceIds: ['evidence-quality-review-shot-3'],
      artifactRefs: ['draft.md#shot-3'],
      createdAt: 1,
    };
    const evidence = createSubagentReviewEvidence({
      id: 'evidence-subagent-shot-3',
      reviewerId: 'reviewer-style-consistency',
      requestId: request.id,
      summary: 'Reviewer agrees shot 3 should be adjusted without changing adjacent shots.',
      observationId: 'obs-shot-3-style-drift',
      createdAt: 2,
    });
    const result: SubagentReviewResult = {
      requestId: request.id,
      reviewerId: 'reviewer-style-consistency',
      summary: 'Recommend minimal prompt adjustment only.',
      evidence: [evidence],
      recommendations: [shotRecoveryGuidanceRecommendationFixture],
      createdAt: 3,
    };

    expect(evidence.source).toBe('subagent');
    expect(evidence.data).toEqual({
      kind: 'subagent.review',
      reviewerId: 'reviewer-style-consistency',
      requestId: request.id,
    });
    expect(isSubagentReviewResultReviewerOnly(result)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
