import { describe, expect, it } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  createGeneratedAssetQualityTarget,
  createGeneratedAssetRevisionRef,
  transferGeneratedAssetEvidenceOnPromotion,
  validateDurableResourceRef,
  validateQualityEvidence,
  type QualityEvidence,
} from '..';

describe('generated asset lifecycle', () => {
  it('creates revision identity without persisting host/cache paths', () => {
    const lifecycle = createLifecycle('draft-1', 'sha256:same', 'task-1');

    expect(lifecycle.resourceRef).toMatchObject({
      provider: 'generated-asset',
      source: {
        kind: 'generated-asset',
        generatedAssetId: 'draft-1',
        metadata: {
          contentDigest: 'sha256:same',
          mimeType: 'image/png',
        },
      },
      locator: { kind: 'generated-asset', assetId: 'draft-1' },
      fingerprint: { strategy: 'hash', value: 'sha256:same' },
    });
    expect(JSON.stringify(lifecycle.resourceRef)).not.toContain('/.neko/.cache/');
    expect(validateDurableResourceRef(lifecycle.resourceRef)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it('transfers evidence only when promotion preserves the content digest', () => {
    const draft = createLifecycle('draft-1', 'sha256:same', 'task-1');
    const promoted = createLifecycle('asset-1', 'sha256:same', 'task-2');
    const evidence = createEvidence(draft);

    const result = transferGeneratedAssetEvidenceOnPromotion({
      draft,
      promoted,
      evidence,
      promotionId: 'promotion-1',
      promotedAt: '2026-01-02T00:00:00.000Z',
      transferredEvidenceId: 'evidence-2',
    });

    expect(result.status).toBe('transferred');
    if (result.status !== 'transferred') return;
    expect(validateQualityEvidence(result.evidence, result.evidence.target).ok).toBe(true);
    expect(result.evidence).toMatchObject({
      evidenceId: 'evidence-2',
      state: 'current',
      target: {
        targetId: 'asset-1',
        revision: promoted.revision,
        contentDigest: 'sha256:same',
      },
      evidenceLineage: {
        relation: 'content-identical-promotion',
        sourceEvidenceId: 'evidence-1',
        promotionId: 'promotion-1',
      },
    });
  });

  it('marks draft evidence stale instead of transferring it when promoted content changes', () => {
    const draft = createLifecycle('draft-1', 'sha256:draft', 'task-1');
    const promoted = createLifecycle('asset-1', 'sha256:changed', 'task-2');

    const result = transferGeneratedAssetEvidenceOnPromotion({
      draft,
      promoted,
      evidence: createEvidence(draft),
      promotionId: 'promotion-1',
      promotedAt: '2026-01-02T00:00:00.000Z',
      transferredEvidenceId: 'evidence-2',
    });

    expect(result).toMatchObject({
      status: 'content-changed',
      promotion: { contentPreserved: false },
      staleEvidence: { evidenceId: 'evidence-1', state: 'stale' },
    });
  });
});

function createLifecycle(assetId: string, contentDigest: string, taskId: string) {
  return createGeneratedAssetRevisionRef({
    assetId,
    contentDigest,
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: {
      taskId,
      runId: 'run-1',
      workflowStage: { workflowId: 'workflow-1', stageId: 'shot-generation' },
    },
  });
}

function createEvidence(
  lifecycle: ReturnType<typeof createGeneratedAssetRevisionRef>,
): QualityEvidence {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    evidenceId: 'evidence-1',
    evaluator: {
      id: 'image-review',
      version: '1',
      evaluatorClass: 'perception',
    },
    target: createGeneratedAssetQualityTarget(lifecycle),
    state: 'current',
    metrics: [],
    issues: [],
    coverage: { mode: 'complete' },
    createdAt: '2026-01-01T00:00:00.000Z',
    sourceEvidenceRefs: [],
  };
}
