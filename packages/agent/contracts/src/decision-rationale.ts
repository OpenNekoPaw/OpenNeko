import type { ConfidenceLevel } from './agent-observation';

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface RiskAssessment {
  readonly level: RiskLevel;
  readonly impactScope: RiskLevel;
  readonly reversibility: RiskLevel;
  readonly budgetCost: RiskLevel;
  readonly userVisibility: RiskLevel;
  readonly reason?: string;
}

export interface DecisionRationale {
  readonly id: string;
  readonly decision: string;
  readonly reason: string;
  readonly confidence: ConfidenceLevel;
  readonly observationIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly risk?: RiskAssessment;
  readonly requiresUserApproval?: boolean;
  readonly createdAt: number;
  readonly contextPacketId?: string;
}
