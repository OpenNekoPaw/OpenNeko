import { describe, expect, it, vi } from 'vitest';
import {
  type QualityEvidence,
  type QualityGatePolicy,
  type QualityTarget,
} from '@neko/generation-domain';
import {
  aggregateQualityGate,
  createQualityGateRuntime,
  selectQualityProfile,
  type QualityEvaluator,
  type QualityTargetMaterializer,
} from '../core/index';

const contentLocator = {
  file: { authority: 'workspace' as const, path: 'assets/hero.png' },
};

function target(overrides: Partial<QualityTarget> = {}): QualityTarget {
  return {
    targetId: 'hero-shot',
    kind: 'image',
    contentLocator,
    contentDigest: 'sha256:hero-content',
    expectedIntent: { prompt: 'cinematic hero' },
    ...overrides,
  };
}

function policy(overrides: Partial<QualityGatePolicy> = {}): QualityGatePolicy {
  return {
    policyId: 'production-default',
    requiredProfiles: ['image'],
    requiredEvaluatorClasses: ['technical', 'perception'],
    blockingSeverities: ['error', 'critical'],
    allowManualReview: true,
    requireCurrentEvidence: true,
    ...overrides,
  };
}

function evidence(input: {
  id: string;
  evaluatorClass: QualityEvidence['evaluator']['evaluatorClass'];
  target?: QualityTarget;
  issues?: QualityEvidence['issues'];
  coverage?: QualityEvidence['coverage'];
  confidence?: number;
}): QualityEvidence {
  return {
    evidenceId: input.id,
    evaluator: {
      id: `${input.evaluatorClass}-test`,
      evaluatorClass: input.evaluatorClass,
    },
    target: input.target ?? target(),
    state: 'current',
    metrics: [],
    issues: input.issues ?? [],
    coverage: input.coverage ?? { mode: 'complete' },
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    createdAt: '2026-07-11T00:00:00.000Z',
    sourceEvidenceLocators: [contentLocator],
  };
}

const materializer: QualityTargetMaterializer = {
  materialize: vi.fn().mockResolvedValue({
    contentLocator,
    source: '/authorized/session/hero.png',
    base64: 'aGVybw==',
    mimeType: 'image/png',
  }),
};

function fixedRuntime(evaluators: readonly QualityEvaluator[]) {
  let sequence = 0;
  return createQualityGateRuntime({
    materializer,
    evaluators,
    now: () => '2026-07-11T00:00:00.000Z',
    createId: (prefix) => `${prefix}-${++sequence}`,
  });
}

describe('canonical quality gate runtime', () => {
  it('selects all canonical target profiles and rejects mismatches', () => {
    const kinds: QualityTarget['kind'][] = [
      'image',
      'video-clip',
      'audio',
      'storyboard',
      'cross-shot-consistency',
      'timeline-final-cut',
      'project-artifact',
      'exported-deliverable',
    ];
    expect(kinds.map((kind) => selectQualityProfile(target({ kind })).targetKind)).toEqual(kinds);
    expect(() => selectQualityProfile(target(), 'audio')).toThrow('does not accept');
  });

  it('returns manual-review when a required perception provider is missing', async () => {
    const result = await fixedRuntime([]).review({ target: target(), policy: policy() });
    expect(result.verdict).toBe('manual-review');
    expect(result.missingEvaluatorClasses).toEqual(['technical', 'perception']);
  });

  it('fails technical errors even when visual perception score is high', () => {
    const result = aggregateQualityGate({
      target: target(),
      profile: selectQualityProfile(target()),
      policy: policy(),
      evidence: [
        evidence({
          id: 'technical',
          evaluatorClass: 'technical',
          issues: [
            { id: 'decode', category: 'decode', severity: 'error', message: 'Decode failed.' },
          ],
        }),
        evidence({ id: 'visual', evaluatorClass: 'perception', confidence: 0.99 }),
      ],
      now: '2026-07-11T00:00:00.000Z',
      gateResultId: 'gate-1',
    });
    expect(result.verdict).toBe('fail');
    expect(result.repairPlan?.actions).toHaveLength(1);
  });

  it('routes partial perception coverage to policy-controlled manual review', () => {
    const result = aggregateQualityGate({
      target: target(),
      profile: selectQualityProfile(target()),
      policy: policy(),
      evidence: [
        evidence({ id: 'technical', evaluatorClass: 'technical' }),
        evidence({
          id: 'visual',
          evaluatorClass: 'perception',
          coverage: { mode: 'sampled', sampleCount: 2, totalCandidateCount: 10 },
        }),
      ],
      now: '2026-07-11T00:00:00.000Z',
      gateResultId: 'gate-2',
    });
    expect(result.verdict).toBe('manual-review');
    expect(result.diagnostics.map((item) => item.code)).toContain('partial-quality-coverage');
  });

  it('applies confidence policy as manual review instead of silently passing', () => {
    const result = aggregateQualityGate({
      target: target(),
      profile: selectQualityProfile(target()),
      policy: policy({ minimumConfidence: 0.8 }),
      evidence: [
        evidence({ id: 'technical', evaluatorClass: 'technical' }),
        evidence({ id: 'visual', evaluatorClass: 'perception', confidence: 0.4 }),
      ],
      now: '2026-07-11T00:00:00.000Z',
      gateResultId: 'gate-3',
    });
    expect(result.verdict).toBe('manual-review');
    expect(result.diagnostics.map((item) => item.code)).toContain('quality-policy-manual-review');
  });

  it('marks content digest mismatches stale', () => {
    const result = aggregateQualityGate({
      target: target({ contentDigest: 'sha256:changed' }),
      profile: selectQualityProfile(target()),
      policy: policy(),
      evidence: [evidence({ id: 'old', evaluatorClass: 'technical' })],
      now: '2026-07-11T00:00:00.000Z',
      gateResultId: 'gate-4',
    });
    expect(result.verdict).toBe('fail');
    expect(result.staleEvidenceIds).toEqual(['old']);
  });
});
