import type { GeneratedAssetMediaKind } from './generated-asset';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  qualityTargetsMatch,
  type QualityEvidence,
  type QualityEvidenceLineage,
  type QualityTarget,
  type QualityTargetKind,
} from './media-quality';
import {
  createResourceFingerprint,
  createResourceRef,
  hashStableValue,
  type ResourceRef,
} from './resource-cache';

export const GENERATED_ASSET_LIFECYCLE_VERSION = 1 as const;
export const GENERATED_ASSET_RESOURCE_PROVIDER_ID = 'generated-asset';

export interface GeneratedAssetWorkflowStageRef {
  readonly stageId: string;
  readonly workflowId?: string;
  readonly stageRevision?: string;
}

export interface GeneratedAssetGenerationLineage {
  readonly taskId: string;
  readonly runId?: string;
  readonly operationId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly workflowStage?: GeneratedAssetWorkflowStageRef;
  readonly sourceRefs?: readonly ResourceRef[];
}

/**
 * Stable identity for one generated-asset content revision. Host paths and
 * render URIs are deliberately excluded from this record.
 */
export interface GeneratedAssetRevisionRef {
  readonly version: typeof GENERATED_ASSET_LIFECYCLE_VERSION;
  readonly assetId: string;
  readonly revision: string;
  readonly contentDigest: string;
  readonly mediaKind: GeneratedAssetMediaKind;
  readonly mimeType: string;
  readonly resourceRef: ResourceRef;
  readonly generation: GeneratedAssetGenerationLineage;
}

export interface CreateGeneratedAssetRevisionRefInput {
  readonly assetId: string;
  readonly contentDigest: string;
  readonly mediaKind: GeneratedAssetMediaKind;
  readonly mimeType: string;
  readonly generation: GeneratedAssetGenerationLineage;
}

export interface GeneratedAssetPromotionRecord {
  readonly promotionId: string;
  readonly draft: GeneratedAssetRevisionRef;
  readonly promoted: GeneratedAssetRevisionRef;
  readonly promotedAt: string;
  readonly contentPreserved: boolean;
  readonly sourceEvidenceIds: readonly string[];
}

export type GeneratedAssetEvidenceTransferResult =
  | {
      readonly status: 'transferred';
      readonly promotion: GeneratedAssetPromotionRecord;
      readonly evidence: QualityEvidence & {
        readonly evidenceLineage: QualityEvidenceLineage;
      };
    }
  | {
      readonly status: 'content-changed';
      readonly promotion: GeneratedAssetPromotionRecord;
      readonly staleEvidence: QualityEvidence;
    };

export function createGeneratedAssetRevisionRef(
  input: CreateGeneratedAssetRevisionRefInput,
): GeneratedAssetRevisionRef {
  assertNonEmpty(input.assetId, 'assetId');
  assertNonEmpty(input.contentDigest, 'contentDigest');
  assertNonEmpty(input.mimeType, 'mimeType');
  assertNonEmpty(input.generation.taskId, 'generation.taskId');

  const revision = `rev_${hashStableValue({
    assetId: input.assetId,
    contentDigest: input.contentDigest,
  })}`;
  const resourceRef = createResourceRef({
    scope: 'project',
    provider: GENERATED_ASSET_RESOURCE_PROVIDER_ID,
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: input.assetId,
      metadata: {
        revision,
        contentDigest: input.contentDigest,
        mimeType: input.mimeType,
      },
    },
    locator: {
      kind: 'generated-asset',
      assetId: input.assetId,
    },
    fingerprint: createResourceFingerprint({
      strategy: 'hash',
      value: input.contentDigest,
    }),
  });

  return {
    version: GENERATED_ASSET_LIFECYCLE_VERSION,
    assetId: input.assetId,
    revision,
    contentDigest: input.contentDigest,
    mediaKind: input.mediaKind,
    mimeType: input.mimeType,
    resourceRef,
    generation: input.generation,
  };
}

export function createGeneratedAssetQualityTarget(
  lifecycle: GeneratedAssetRevisionRef,
): QualityTarget {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    targetId: lifecycle.assetId,
    kind: toQualityTargetKind(lifecycle.mediaKind),
    resourceRef: lifecycle.resourceRef,
    revision: lifecycle.revision,
    contentDigest: lifecycle.contentDigest,
    ...(lifecycle.generation.sourceRefs && lifecycle.generation.sourceRefs.length > 0
      ? {
          lineage: lifecycle.generation.sourceRefs.map((resourceRef) => ({
            relation: 'generated-from' as const,
            resourceRef,
          })),
        }
      : {}),
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

  return {
    status: 'transferred',
    promotion,
    evidence: {
      ...input.evidence,
      evidenceId: requiredValue(input.transferredEvidenceId, 'transferredEvidenceId'),
      target: {
        ...createGeneratedAssetQualityTarget(input.promoted),
        lineage: [
          ...(createGeneratedAssetQualityTarget(input.promoted).lineage ?? []),
          {
            relation: 'derived-from',
            resourceRef: input.draft.resourceRef,
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
  assertNonEmpty(value, field);
  return value;
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`Generated asset lifecycle requires non-empty ${field}.`);
  }
}
