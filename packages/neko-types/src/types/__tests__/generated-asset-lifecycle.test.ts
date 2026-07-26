import { describe, expect, it } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  createGeneratedAssetQualityTarget,
  createGeneratedAssetRevisionRef,
  transferGeneratedAssetEvidenceOnPromotion,
  validateGeneratedAssetRevisionRef,
  validateQualityEvidence,
  type QualityEvidence,
} from '..';

describe('generated asset lifecycle', () => {
  it('creates locator-only revision identity without ResourceRef or host/cache paths', () => {
    const lifecycle = createLifecycle('draft-1', 'sha256:same', 'operation-1');

    expect(lifecycle.contentLocator).toEqual({
      kind: 'generated-output',
      outputId: 'draft-1',
      revision: lifecycle.revision,
      digest: 'sha256:same',
      path: 'neko/generated/image/draft-1.png',
    });
    expect(lifecycle).not.toHaveProperty('resourceRef');
    expect(lifecycle.generation).not.toHaveProperty('sourceRefs');
    expect(JSON.stringify(lifecycle)).not.toContain('/.neko/.cache/');
    expect(createGeneratedAssetQualityTarget(lifecycle).resourceRef).toMatchObject({
      provider: 'generated-asset',
      source: { kind: 'generated-asset', generatedAssetId: 'draft-1' },
      fingerprint: { strategy: 'hash', value: 'sha256:same' },
    });
  });

  it('rejects legacy ResourceRef lifecycle fields and mismatched locator identity', () => {
    const lifecycle = createLifecycle('draft-1', 'sha256:same', 'operation-1');

    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        resourceRef: { id: 'legacy-resource' },
      }),
    ).toEqual({
      ok: false,
      diagnostic: 'Generated asset lifecycle contains unsupported or legacy fields.',
    });
    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        generation: {
          ...lifecycle.generation,
          sourceRefs: [],
        },
      }),
    ).toEqual({
      ok: false,
      diagnostic: 'Generated asset lifecycle structure is invalid.',
    });
    expect(
      validateGeneratedAssetRevisionRef({
        ...lifecycle,
        contentLocator: {
          ...lifecycle.contentLocator,
          outputId: 'different-output',
        },
      }),
    ).toEqual({
      ok: false,
      diagnostic:
        'Generated asset lifecycle identity does not match its generated-output content locator.',
    });
  });

  it('transfers evidence only when promotion preserves the content digest', () => {
    const draft = createLifecycle('draft-1', 'sha256:same', 'operation-1');
    const promoted = createLifecycle('asset-1', 'sha256:same', 'operation-2');
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
    const draft = createLifecycle('draft-1', 'sha256:draft', 'operation-1');
    const promoted = createLifecycle('asset-1', 'sha256:changed', 'operation-2');

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

function createLifecycle(assetId: string, contentDigest: string, operationId: string) {
  return createGeneratedAssetRevisionRef({
    assetId,
    contentDigest,
    contentPath: `neko/generated/image/${assetId}.png`,
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: {
      operationId,
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
