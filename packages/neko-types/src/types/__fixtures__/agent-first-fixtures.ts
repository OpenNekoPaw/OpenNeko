import type { AgentObservation, PerceptionEvidence } from '../agent-observation';
import type { DecisionRationale } from '../decision-rationale';
import type { RecoveryGuidanceRecommendation } from '../recovery-guidance';

export const singleImageObservationFixture: AgentObservation = {
  id: 'obs-single-image-hair-color',
  modality: 'image',
  summary: 'The character appears to have blue hair.',
  confidence: 'medium',
  evidenceIds: [],
  detectedEntities: ['character', 'hair'],
  createdAt: 1_771_718_400_000,
  providerContext: {
    providerId: 'agent-default',
    providerCardId: 'default-vision',
    trustLevel: 'core',
    adaptationHash: 'fixture-adaptation-v1',
  },
};

export const lowConfidenceToolEvidenceFixture: PerceptionEvidence = {
  id: 'evidence-image-classify-hair-color',
  source: 'tool',
  toolName: 'perception.image.classify',
  observationId: singleImageObservationFixture.id,
  summary: 'Classifier ranked blue hair highest among candidate labels.',
  confidence: 0.82,
  data: { labels: [{ label: 'blue hair', score: 0.82 }] },
  createdAt: 1_771_718_401_000,
  modelContext: {
    modelId: 'clip-zero-shot',
    modelVersion: 'fixture',
    providerId: 'neko-engine',
  },
};

export const shotRecoveryGuidanceRationaleFixture: DecisionRationale = {
  id: 'rat-shot-3-recovery-guidance',
  decision: 'recovery-guidance-shot-3',
  reason:
    'Shot 3 visually drifts from the established scene style and needs Agent-guided recovery guidance.',
  confidence: 'high',
  observationIds: ['obs-shot-3-style-drift'],
  evidenceIds: ['evidence-quality-review-shot-3'],
  risk: {
    level: 'low',
    impactScope: 'low',
    reversibility: 'low',
    budgetCost: 'low',
    userVisibility: 'low',
    reason: 'Only one generated shot is replaced and the change is reversible.',
  },
  createdAt: 1_771_718_402_000,
};

export const shotRecoveryGuidanceRecommendationFixture: RecoveryGuidanceRecommendation = {
  id: 'guidance-shot-3-minimal-prompt-adjustment',
  rationaleId: shotRecoveryGuidanceRationaleFixture.id,
  kind: 'adjust-prompt',
  summary:
    'Regenerate only shot 3 with a tighter style prompt and keep surrounding shots unchanged.',
  recommendedNextStep:
    'Ask the Agent to adjust the shot 3 prompt using the established scene style reference before calling any generation tool.',
  evidenceIds: [...shotRecoveryGuidanceRationaleFixture.evidenceIds],
  risk: shotRecoveryGuidanceRationaleFixture.risk,
  requiresUserApproval: false,
  createdAt: 1_771_718_403_000,
};

export type AgentFirstFixture =
  | typeof singleImageObservationFixture
  | typeof lowConfidenceToolEvidenceFixture
  | typeof shotRecoveryGuidanceRationaleFixture
  | typeof shotRecoveryGuidanceRecommendationFixture;
