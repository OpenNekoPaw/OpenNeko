import { describe, expect, it } from 'vitest';
import {
  lowConfidenceToolEvidenceFixture,
  shotRecoveryGuidanceRationaleFixture,
  shotRecoveryGuidanceRecommendationFixture,
  singleImageObservationFixture,
} from '../__fixtures__/agent-first-fixtures';
import { isRecoveryGuidanceTraceable } from '../recovery-guidance';

function expectJsonSerializable(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

describe('agent-first multimodal contracts', () => {
  it('provides a canonical single-image observation fixture', () => {
    expect(singleImageObservationFixture.modality).toBe('image');
    expect(singleImageObservationFixture.confidence).toBe('medium');
    expect(singleImageObservationFixture.providerContext?.trustLevel).toBe('core');
    expectJsonSerializable(singleImageObservationFixture);
  });

  it('provides optional tool evidence without replacing the observation', () => {
    expect(lowConfidenceToolEvidenceFixture.source).toBe('tool');
    expect(lowConfidenceToolEvidenceFixture.observationId).toBe(singleImageObservationFixture.id);
    expect(lowConfidenceToolEvidenceFixture.confidence).toBeGreaterThan(0);
    expectJsonSerializable(lowConfidenceToolEvidenceFixture);
  });

  it('provides a rationale fixture for recovery guidance auditing', () => {
    expect(shotRecoveryGuidanceRationaleFixture.decision).toBe('recovery-guidance-shot-3');
    expect(shotRecoveryGuidanceRationaleFixture.observationIds).toContain('obs-shot-3-style-drift');
    expect(shotRecoveryGuidanceRationaleFixture.evidenceIds).toContain(
      'evidence-quality-review-shot-3',
    );
    expect(shotRecoveryGuidanceRationaleFixture.risk?.level).toBe('low');
    expectJsonSerializable(shotRecoveryGuidanceRationaleFixture);
  });

  it('provides traceable recovery guidance without pipeline actions', () => {
    expect(shotRecoveryGuidanceRecommendationFixture.rationaleId).toBe(
      shotRecoveryGuidanceRationaleFixture.id,
    );
    expect(shotRecoveryGuidanceRecommendationFixture.kind).toBe('adjust-prompt');
    expect(shotRecoveryGuidanceRecommendationFixture.requiresUserApproval).toBe(false);
    expect(isRecoveryGuidanceTraceable(shotRecoveryGuidanceRecommendationFixture)).toBe(true);
    expectJsonSerializable(shotRecoveryGuidanceRecommendationFixture);
  });
});
