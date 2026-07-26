import type { GeneratedAssetMediaKind } from './generated-asset';
import {
  GENERATED_ASSET_RESOURCE_PROVIDER_ID,
  type GeneratedAssetEvidenceTransferResult,
  type GeneratedAssetPromotionRecord,
  type GeneratedAssetRevisionRef,
} from './generated-asset-lifecycle';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  qualityTargetsMatch,
  type QualityEvidence,
  type QualityTarget,
  type QualityTargetKind,
} from './media-quality';
import { createResourceFingerprint, createResourceRef, type ResourceRef } from './resource-cache';

/**
 * Adapts locator-backed generated content to the legacy Quality target contract.
 * The ResourceRef exists only for this adapter call and is not lifecycle state.
 */
export function createGeneratedAssetQualityTarget(
  lifecycle: GeneratedAssetRevisionRef,
): QualityTarget {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    targetId: lifecycle.assetId,
    kind: toQualityTargetKind(lifecycle.mediaKind),
    resourceRef: createGeneratedAssetQualityResourceRef(lifecycle),
    revision: lifecycle.revision,
    contentDigest: lifecycle.contentDigest,
  };
}

export function transferGeneratedAssetEvidenceOnPromotion(input: {
  readonly draft: GeneratedAssetRevisionRef;
  readonly promoted: GeneratedAssetRevisionRef;
  readonly evidence: QualityEvidence;
  readonly promotionId: string;
  readonly promotedAt: string;
  readonly transferredEvidenceId: string;
}): GeneratedAssetEvidenceTransferResult {
  const draftTarget = createGeneratedAssetQualityTarget(input.draft);
  if (!qualityTargetsMatch(input.evidence.target, draftTarget)) {
    throw new Error('Generated asset promotion evidence is not bound to the draft revision.');
  }
  if (input.evidence.state !== 'current') {
    throw new Error('Stale generated asset evidence cannot be transferred during promotion.');
  }

  const contentPreserved = input.draft.contentDigest === input.promoted.contentDigest;
  const promotion: GeneratedAssetPromotionRecord = {
    promotionId: requiredValue(input.promotionId, 'promotionId'),
    draft: input.draft,
    promoted: input.promoted,
    promotedAt: requiredValue(input.promotedAt, 'promotedAt'),
    contentPreserved,
    sourceEvidenceIds: [input.evidence.evidenceId],
  };

  if (!contentPreserved) {
    return {
      status: 'content-changed',
      promotion,
      staleEvidence: {
        ...input.evidence,
        state: 'stale',
      },
    };
  }

  const promotedTarget = createGeneratedAssetQualityTarget(input.promoted);
  return {
    status: 'transferred',
    promotion,
    evidence: {
      ...input.evidence,
      evidenceId: requiredValue(input.transferredEvidenceId, 'transferredEvidenceId'),
      target: {
        ...promotedTarget,
        lineage: [
          ...(promotedTarget.lineage ?? []),
          {
            relation: 'derived-from',
            resourceRef: createGeneratedAssetQualityResourceRef(input.draft),
            revision: input.draft.revision,
          },
        ],
      },
      createdAt: input.promotedAt,
      evidenceLineage: {
        relation: 'content-identical-promotion',
        sourceEvidenceId: input.evidence.evidenceId,
        promotionId: input.promotionId,
      },
    },
  };
}

function createGeneratedAssetQualityResourceRef(lifecycle: GeneratedAssetRevisionRef): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: GENERATED_ASSET_RESOURCE_PROVIDER_ID,
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: lifecycle.assetId,
      metadata: {
        revision: lifecycle.revision,
        contentDigest: lifecycle.contentDigest,
        mimeType: lifecycle.mimeType,
      },
    },
    locator: {
      kind: 'generated-asset',
      assetId: lifecycle.assetId,
    },
    fingerprint: createResourceFingerprint({
      strategy: 'hash',
      value: lifecycle.contentDigest,
    }),
  });
}

function toQualityTargetKind(mediaKind: GeneratedAssetMediaKind): QualityTargetKind {
  switch (mediaKind) {
    case 'image':
      return 'image';
    case 'video':
      return 'video-clip';
    case 'audio':
      return 'audio';
    case 'storyboard':
      return 'storyboard';
    case 'file':
      return 'project-artifact';
  }
}

function requiredValue(value: string, field: string): string {
  if (!value.trim()) {
    throw new Error(`Generated asset quality adapter requires non-empty ${field}.`);
  }
  return value;
}
