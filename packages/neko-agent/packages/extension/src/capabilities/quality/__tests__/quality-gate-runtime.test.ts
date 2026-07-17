import { describe, expect, it, vi } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  type QualityEvidence,
  type QualityGatePolicy,
  type QualityTarget,
  type ResourceRef,
} from '@neko/shared';
import {
  aggregateQualityGate,
  assertExternalPerceptionTarget,
  createClipScreeningEvaluator,
  createMultimodalPerceptionEvaluator,
  createQualityGateRuntime,
  createTechnicalMediaEvaluator,
  executeApprovedQualityRepair,
  rejectLegacyMediaPathRequest,
  selectQualityProfile,
  type QualityEvaluator,
  type QualityTargetMaterializer,
} from '../quality-gate-runtime';

const resourceRef: ResourceRef = {
  id: 'asset:image:hero',
  scope: 'project',
  provider: 'project',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'assets/hero.png' },
  fingerprint: { strategy: 'hash', value: 'sha256:hero-v1' },
};

function target(overrides: Partial<QualityTarget> = {}): QualityTarget {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    targetId: 'hero-shot',
    kind: 'image',
    resourceRef,
    revision: 'rev-1',
    contentDigest: 'sha256:v1',
    expectedIntent: { prompt: 'cinematic hero' },
    ...overrides,
  };
}

function policy(overrides: Partial<QualityGatePolicy> = {}): QualityGatePolicy {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    policyId: 'production-default',
    policyVersion: '1',
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
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    evidenceId: input.id,
    evaluator: {
      id: `${input.evaluatorClass}-test`,
      version: '1',
      evaluatorClass: input.evaluatorClass,
    },
    target: input.target ?? target(),
    state: 'current',
    metrics: [],
    issues: input.issues ?? [],
    coverage: input.coverage ?? { mode: 'complete' },
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    createdAt: '2026-07-11T00:00:00.000Z',
    sourceEvidenceRefs: [resourceRef],
  };
}

const materializer: QualityTargetMaterializer = {
  materialize: vi.fn().mockResolvedValue({
    resourceRef,
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
    expect(result.repairPlan?.requiresNewRevision).toBe(true);
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

  it('marks revision or digest mismatches stale', () => {
    const result = aggregateQualityGate({
      target: target({ revision: 'rev-2', contentDigest: 'sha256:v2' }),
      profile: selectQualityProfile(target()),
      policy: policy(),
      evidence: [evidence({ id: 'old', evaluatorClass: 'technical' })],
      now: '2026-07-11T00:00:00.000Z',
      gateResultId: 'gate-4',
    });
    expect(result.verdict).toBe('fail');
    expect(result.staleEvidenceIds).toEqual(['old']);
  });

  it('poisons legacy mediaPath requests on the canonical path', () => {
    expect(() => rejectLegacyMediaPathRequest({ mediaPath: '/tmp/hero.png' })).toThrow(
      'legacy-path-target-rejected',
    );
    expect(() =>
      rejectLegacyMediaPathRequest({ scenes: [{ mediaPath: '/tmp/hero.png' }] }),
    ).toThrow('legacy-path-target-rejected');
  });

  it('rejects project archives from external perception materialization', () => {
    expect(() => assertExternalPerceptionTarget(target({ kind: 'project-artifact' }))).toThrow(
      'project archives',
    );
  });

  it('rejects arbitrary absolute local paths from external perception', () => {
    expect(() =>
      assertExternalPerceptionTarget(
        target({
          resourceRef: {
            ...resourceRef,
            source: { kind: 'file', filePath: '/tmp/untrusted.png' },
          },
        }),
      ),
    ).toThrow('arbitrary absolute local paths');
  });

  it('records provider/model/coverage for multimodal perception and keeps CLIP screening partial', async () => {
    const llm = createMultimodalPerceptionEvaluator({
      createService: () => ({
        chat: vi
          .fn()
          .mockResolvedValue({ message: { content: JSON.stringify({ score: 92, issues: [] }) } }),
      }),
      chatModel: { providerId: 'vision-provider', modelId: 'vision-model' },
      evaluatorVersion: '2026-07',
    });
    const clip = createClipScreeningEvaluator({
      scorer: { score: vi.fn().mockResolvedValue(87) },
      modelId: 'clip-vit-b32',
    });
    const runtime = fixedRuntime([llm, clip]);
    const result = await runtime.review({
      target: target(),
      policy: policy({ requiredEvaluatorClasses: ['perception'] }),
    });
    expect(result.verdict).toBe('manual-review');
    expect(materializer.materialize).toHaveBeenCalledWith(
      expect.objectContaining({ consumer: 'perception' }),
    );
  });

  it('adapts audio and video analyzers as technical evidence', async () => {
    const audio = createTechnicalMediaEvaluator({
      audioAnalyzer: {
        analyzeLoudness: vi.fn().mockResolvedValue({
          integratedLufs: -14,
          truePeakDbfs: -2,
          loudnessRange: 6,
          recommendedGain: 0,
          targetLufs: -14,
        }),
        detectSilence: vi.fn().mockResolvedValue({
          totalDuration: 10,
          silenceDuration: 1,
          silenceRatio: 0.1,
          regionCount: 1,
        }),
      },
    });
    const audioTarget = target({ kind: 'audio' });
    const result = await fixedRuntime([audio]).review({
      target: audioTarget,
      policy: policy({ requiredProfiles: ['audio'], requiredEvaluatorClasses: ['technical'] }),
    });
    expect(result.verdict).toBe('pass');
  });

  it('requires approved bounded repair and a new lineage-bearing revision', async () => {
    const source = target();
    const gate = aggregateQualityGate({
      target: source,
      profile: selectQualityProfile(source),
      policy: policy({ requiredEvaluatorClasses: ['technical'] }),
      evidence: [
        evidence({
          id: 'technical',
          evaluatorClass: 'technical',
          issues: [{ id: 'bad', category: 'decode', severity: 'error', message: 'bad' }],
        }),
      ],
      now: '2026-07-11T00:00:00.000Z',
      gateResultId: 'gate-repair',
    });
    await expect(
      executeApprovedQualityRepair({
        approved: false,
        maxAttempts: 1,
        gateResult: gate,
        executor: { execute: vi.fn() },
      }),
    ).rejects.toThrow('not-approved');
    const repaired = target({
      revision: 'rev-2',
      contentDigest: 'sha256:v2',
      lineage: [{ relation: 'derived-from', resourceRef, revision: 'rev-1' }],
    });
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient authoring failure'))
      .mockResolvedValue(repaired);
    const output = await executeApprovedQualityRepair({
      approved: true,
      maxAttempts: 2,
      gateResult: gate,
      executor: { execute },
    });
    expect(output.originalTarget.revision).toBe('rev-1');
    expect(output.repairedTargets[0]?.revision).toBe('rev-2');
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
