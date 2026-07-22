import type { AgentObservationModality } from './agent-observation';
import type { ContentLocator } from './content-locator';
import type { DocumentArchiveResourceRef } from './document-reading';
import type { ResourceRef } from './resource-cache';
import type { ToolResultArtifactTransfer, ToolResultAttachment } from './tool';

export type PerceptionLayerStatus = 'pending' | 'complete' | 'skipped' | 'failed';

export type PerceptionEvidenceKind =
  'description' | 'transcript' | 'loudness' | 'clip-score' | 'shot-boundaries' | 'tags' | 'custom';

export type PerceptionTiming = 'on-completion' | 'on-reference' | 'on-demand';

export type PerceptionLayer = 0 | 1 | 2;

export interface PerceptualAssetRef {
  readonly assetId: string;
  /**
   * Portable display/load locator used only when no stable locator or reference is present.
   * Persist relative paths or ${VAR}/path values only.
   * When a stable content locator or resource reference is present, adapters must resolve it
   * instead of interpreting this value as a local file path.
   */
  readonly uri: string;
  readonly mimeType: string;
  readonly contentLocator?: ContentLocator;
  readonly resourceRef?: ResourceRef;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly label?: string;
  readonly timestampMs?: number;
}

export interface PerceptionDiagnostics {
  readonly languageDetected?: string;
  readonly languageConfidence?: number;
  readonly snr?: number;
  readonly blurScore?: number;
  readonly retryCount: number;
  readonly retryReason?: string;
}

export interface PerceptionEvidenceEntry {
  readonly kind: PerceptionEvidenceKind;
  readonly confidence: number;
  readonly value: unknown;
  readonly diagnostics?: PerceptionDiagnostics;
}

export interface PerceptionCard {
  readonly version: 1;
  readonly assetId: string;
  readonly modality: AgentObservationModality;
  readonly sourceToolCallId?: string;
  readonly contextPacketId?: string;
  readonly createdAt: number;
  readonly layerStatus: {
    readonly layer0: 'complete';
    readonly layer1: PerceptionLayerStatus;
    readonly layer2: PerceptionLayerStatus;
  };
  readonly structural: {
    readonly format: string;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly width?: number;
    readonly height?: number;
    readonly durationMs?: number;
    readonly frameRate?: number;
    readonly channels?: number;
    readonly sampleRate?: number;
    readonly vertexCount?: number;
    readonly materialCount?: number;
  };
  readonly semantic?: {
    readonly evidences: readonly PerceptionEvidenceEntry[];
  };
  readonly perceptual?: {
    readonly keyframeRefs?: readonly PerceptualAssetRef[];
    readonly thumbnailRef?: PerceptualAssetRef;
    readonly waveformRef?: PerceptualAssetRef;
    readonly multiViewRefs?: readonly PerceptualAssetRef[];
  };
  readonly cost?: {
    readonly totalMs: number;
    readonly tokenEstimate: number;
    readonly gpuUsed: boolean;
  };
  readonly cacheKey?: string;
}

export interface PerceptionPolicy {
  readonly timing: PerceptionTiming;
  readonly layers: readonly PerceptionLayer[];
  readonly reason: string;
}

export interface PerceptionPolicyContext {
  readonly isWorkflow: boolean;
  readonly hasNextStep: boolean;
  readonly modality: AgentObservationModality;
  readonly userExplicitRequest: boolean;
}

export type PerceptionFocus = 'transcript' | 'visual' | 'audio' | 'shots' | 'composition';

export interface PerceiveToolInput {
  readonly assetId: string;
  readonly ref?: PerceptualAssetRef;
  readonly depth: 1 | 2;
  readonly focus?: PerceptionFocus;
  readonly options?: {
    readonly language?: string;
    readonly timeRange?: { readonly startMs: number; readonly endMs: number };
    readonly frameDensity?: 'sparse' | 'normal' | 'dense';
    readonly understandingModels?: {
      readonly image?: { readonly providerId: string; readonly modelId: string };
      readonly audio?: { readonly providerId: string; readonly modelId: string };
      readonly video?: { readonly providerId: string; readonly modelId: string };
    };
  };
}

export type ToolResultBackfillConflictStrategy =
  'diagnostic' | 'preserve-existing' | 'overwrite-listed';

export type ToolResultBackfillDiagnosticReason =
  'conflict' | 'missing-tool-call' | 'invalid-existing-result';

export interface ToolResultBackfillMergePolicy {
  readonly overwriteKeys: readonly string[];
  readonly preserveKeys?: readonly string[];
  readonly conflictStrategy: ToolResultBackfillConflictStrategy;
}

export interface ToolResultBackfillDiagnostic {
  readonly path: string;
  readonly reason: ToolResultBackfillDiagnosticReason;
  readonly existing?: unknown;
  readonly incoming?: unknown;
}

export interface ToolResultBackfillPayload {
  readonly toolCallId: string;
  readonly timestamp: number;
  readonly dataPatch: Record<string, unknown>;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
  readonly mergePolicy?: ToolResultBackfillMergePolicy;
  readonly diagnostics?: readonly ToolResultBackfillDiagnostic[];
}

export const DEFAULT_TOOL_RESULT_BACKFILL_OVERWRITE_KEYS = [
  'status',
  'resultAssetRefs',
  'thumbnailAssetRef',
  'width',
  'height',
  'durationMs',
  'frameRate',
  'mimeType',
] as const;

export function selectLatestPerceptionCard(
  cards: readonly PerceptionCard[] | undefined,
  assetId?: string,
): PerceptionCard | undefined {
  const candidates = assetId ? cards?.filter((card) => card.assetId === assetId) : cards;
  if (!candidates || candidates.length === 0) return undefined;
  return candidates.reduce((latest, card) => (card.createdAt > latest.createdAt ? card : latest));
}
