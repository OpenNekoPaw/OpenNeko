import { describe, expect, it } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  type QualityDiagnostic,
  type QualityGateResult,
  type ResourceRef,
} from '@neko/shared';
import {
  createQualityReviewEvidence,
  createQualityReviewValidationAdapter,
} from '../quality-review-validation';

const resourceRef: ResourceRef = {
  id: 'asset:image:cat',
  scope: 'project',
  provider: 'project',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'assets/cat.png' },
  fingerprint: { strategy: 'hash', value: 'sha256:cat-v1' },
};

function gateResult(overrides: Partial<QualityGateResult> = {}): QualityGateResult {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    gateResultId: 'gate-cat-v1',
    target: {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'cat-shot',
      kind: 'image',
      resourceRef,
      revision: 'rev-1',
      contentDigest: 'sha256:cat-v1',
    },
    policy: {
      policyId: 'image-production',
      policyVersion: '1',
      requiredProfiles: ['image'],
    },
    verdict: 'pass',
    evidenceIds: ['technical-1', 'perception-1'],
    staleEvidenceIds: [],
    missingEvaluatorClasses: [],
    diagnostics: [],
    createdAt: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

function adapterInput(data: unknown, toolName = 'QualityCheck') {
  return {
    result: { callId: 'call-quality', name: toolName, success: true, data },
    toolCallId: 'call-quality',
    toolName,
    observedAt: 10,
    runId: 'run-quality',
  };
}

describe('createQualityReviewEvidence', () => {
  it('projects a canonical passing Gate into Agent evidence without inventing scene fixtures', () => {
    const result = createQualityReviewEvidence({
      gateResult: gateResult(),
      toolCallId: 'call-quality',
      observedAt: 10,
      runId: 'run-quality',
      observationId: 'obs-1',
    });

    expect(result.summary).toEqual({
      verdict: 'pass',
      effectiveVerdict: 'pass',
      targetId: 'cat-shot',
      targetKind: 'image',
      evidenceCount: 2,
      staleEvidenceCount: 0,
      missingEvaluatorClasses: [],
      diagnosticCount: 0,
      repairActionCount: 0,
      contractValid: true,
    });
    expect(result.evidence).toEqual(
      expect.objectContaining({
        id: 'quality-gate:run-quality:call-quality',
        source: 'tool',
        summary: 'Quality Gate passed for target cat-shot with 2 current evidence item(s).',
        confidence: 1,
        toolName: 'QualityCheck',
        observationId: 'obs-1',
        createdAt: 10,
        data: expect.objectContaining({
          qualityGateResult: expect.objectContaining({ gateResultId: 'gate-cat-v1' }),
        }),
      }),
    );
  });

  it('never projects a contract-invalid passing Gate as effective pass', () => {
    const contractDiagnostics: readonly QualityDiagnostic[] = [
      {
        code: 'invalid-quality-gate-result',
        severity: 'error',
        message: 'A passing Gate cannot contain stale evidence.',
      },
    ];
    const result = createQualityReviewEvidence({
      gateResult: gateResult({ verdict: 'pass', staleEvidenceIds: ['stale-1'] }),
      toolCallId: 'call-invalid',
      observedAt: 20,
      contractDiagnostics,
    });

    expect(result.summary).toEqual(
      expect.objectContaining({
        verdict: 'pass',
        effectiveVerdict: 'fail',
        staleEvidenceCount: 1,
        contractValid: false,
      }),
    );
    expect(result.evidence.summary).toBe(
      'QualityGateResult for target cat-shot is invalid and cannot pass.',
    );
    expect(result.evidence.confidence).toBe(0);
  });
});

describe('createQualityReviewValidationAdapter', () => {
  it('creates blocking repair feedback from a failed canonical Gate', () => {
    const adapter = createQualityReviewValidationAdapter();
    const failed = gateResult({
      verdict: 'fail',
      diagnostics: [
        {
          code: 'quality-evaluator-failed',
          severity: 'error',
          message: 'Image decode failed.',
        },
      ],
      repairPlan: {
        planId: 'repair-cat-v1',
        requiresNewRevision: true,
        actions: [
          {
            owner: 'image',
            targetId: 'cat-shot',
            issueIds: ['decode-1'],
            instruction: 'Regenerate the damaged image.',
          },
        ],
      },
    });

    const signal = adapter.createSignal(adapterInput(failed));

    expect(signal).toEqual(
      expect.objectContaining({
        kind: 'tool-review',
        toolName: 'QualityCheck',
        status: 'failed',
        summary:
          'Quality Gate failed for target cat-shot: 0 stale evidence item(s), 1 diagnostic(s), and 1 repair action(s).',
        repairGuidance:
          'Use the owning capability to repair target cat-shot, create a new revision, invalidate prior evidence, and rerun QualityCheck. Plan: Regenerate the damaged image.',
        repeatKey: 'quality-gate:run-quality:cat-shot',
        runId: 'run-quality',
        metadata: expect.objectContaining({
          verdict: 'fail',
          effectiveVerdict: 'fail',
          targetId: 'cat-shot',
          repairActionCount: 1,
          contractValid: true,
        }),
      }),
    );
  });

  it('localizes manual-review feedback and names missing evaluator classes', () => {
    const adapter = createQualityReviewValidationAdapter();
    const manualReview = gateResult({
      verdict: 'manual-review',
      evidenceIds: ['technical-1'],
      missingEvaluatorClasses: ['perception'],
      diagnostics: [
        {
          code: 'missing-required-evaluator',
          severity: 'error',
          message: 'Required perception evaluator evidence is missing.',
        },
      ],
    });

    const signal = adapter.createSignal({
      ...adapterInput(manualReview),
      locale: 'zh-CN',
    });

    expect(signal).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary: '目标 cat-shot 的质量 Gate 需要人工审查（缺少评估器：perception）。',
        repairGuidance:
          '完成策略要求的人工审查（缺少评估器：perception），在获得明确批准前不得将 Gate 视为通过。',
        escalationMessage: '运行 run-quality 需要人工质量判定；请请求明确批准或补齐缺失评估证据。',
        metadata: expect.objectContaining({ effectiveVerdict: 'manual-review' }),
      }),
    );
  });

  it('keeps a valid passing Gate non-blocking', () => {
    const adapter = createQualityReviewValidationAdapter();

    const signal = adapter.createSignal(adapterInput(gateResult()));

    expect(signal).toEqual(
      expect.objectContaining({
        status: 'passed',
        summary: 'Quality Gate passed for target cat-shot with 2 current evidence item(s).',
        metadata: expect.objectContaining({ contractValid: true }),
      }),
    );
    expect(signal).not.toHaveProperty('repairGuidance');
    expect(signal).not.toHaveProperty('repeatKey');
  });

  it('fails closed when a nominally passing Gate carries stale evidence', () => {
    const adapter = createQualityReviewValidationAdapter();

    const signal = adapter.createSignal(
      adapterInput(gateResult({ verdict: 'pass', staleEvidenceIds: ['stale-1'] })),
    );

    expect(signal).toEqual(
      expect.objectContaining({
        status: 'failed',
        summary: 'QualityGateResult for target cat-shot is invalid and cannot pass.',
        repairGuidance:
          'Reject this invalid quality Gate result; repair the QualityGateResult contract and rerun QualityCheck.',
        metadata: expect.objectContaining({
          verdict: 'pass',
          effectiveVerdict: 'fail',
          staleEvidenceCount: 1,
          contractValid: false,
        }),
      }),
    );
  });

  it('does not interpret removed repair, consistency, or scene-payload paths as success', () => {
    const adapter = createQualityReviewValidationAdapter();
    const legacyPayload = {
      totalScenes: 1,
      passed: 1,
      failed: 0,
      evaluations: [{ index: 1, passed: true, finalScore: 1 }],
    };

    expect(adapter.createSignal(adapterInput(legacyPayload, 'QualityCheck'))).toBeNull();
    expect(adapter.createSignal(adapterInput(legacyPayload, 'QualityRepairCheck'))).toBeNull();
    expect(adapter.createSignal(adapterInput(legacyPayload, 'QualityCheckConsistency'))).toBeNull();
  });
});
