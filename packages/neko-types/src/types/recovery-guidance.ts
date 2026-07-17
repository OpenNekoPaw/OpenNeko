import type { RiskAssessment } from './decision-rationale';

export type RecoveryGuidanceRecommendationKind =
  'retry' | 'adjust-prompt' | 'switch-model' | 'accept-current' | 'ask-user';

export interface RecoveryGuidanceRecommendation {
  readonly id: string;
  readonly rationaleId: string;
  readonly kind: RecoveryGuidanceRecommendationKind;
  readonly summary: string;
  readonly recommendedNextStep: string;
  readonly evidenceIds: readonly string[];
  readonly risk?: RiskAssessment;
  readonly requiresUserApproval?: boolean;
  readonly createdAt: number;
}

export function isRecoveryGuidanceTraceable(
  recommendation: RecoveryGuidanceRecommendation,
): boolean {
  return recommendation.rationaleId.trim().length > 0;
}
