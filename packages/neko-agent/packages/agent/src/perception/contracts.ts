import type {
  AgentObservationModality,
  PerceptionCard,
  PerceptionEvidenceEntry,
  PerceptionFocus,
  PerceptionLayer,
  PerceptionPolicy,
  PerceptualAssetRef,
  ToolResultBackfillPayload,
} from '@neko/shared';

export interface ResolvedPerceptualAsset {
  readonly assetId: string;
  readonly ref?: PerceptualAssetRef;
  readonly uri?: string;
  readonly modality: AgentObservationModality;
  readonly mimeType: string;
  readonly resolvedPath?: string;
  readonly byteSize?: number;
  readonly cacheKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PerceptionAssetSelector {
  readonly assetId: string;
  readonly ref?: PerceptualAssetRef;
}

export interface MediaProbeResult {
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
}

export interface MediaUnderstandingModelOverride {
  readonly providerId: string;
  readonly modelId: string;
}

export interface MediaUnderstandingModelOverrides {
  readonly image?: MediaUnderstandingModelOverride;
  readonly audio?: MediaUnderstandingModelOverride;
  readonly video?: MediaUnderstandingModelOverride;
}

export interface PerceptionClientRequest {
  readonly asset: ResolvedPerceptualAsset;
  readonly focus?: PerceptionFocus;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly understandingModels?: MediaUnderstandingModelOverrides;
}

export interface PerceptualAssetRequest {
  readonly asset: ResolvedPerceptualAsset;
  readonly focus?: PerceptionFocus;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface PerceptionPipelineInput {
  readonly asset: PerceptionAssetSelector;
  readonly sourceToolCallId?: string;
  readonly contextPacketId?: string;
  readonly policy: PerceptionPolicy;
  readonly focus?: PerceptionFocus;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly understandingModels?: MediaUnderstandingModelOverrides;
  readonly cacheKey?: string;
}

export interface PerceptionPipelineResult {
  readonly card: PerceptionCard;
  readonly backfill?: ToolResultBackfillPayload;
}

export interface PerceptionEvidenceRetryPolicy {
  readonly minConfidence: number;
  readonly maxRetries: number;
}

export interface IPerceptionPipeline {
  perceive(input: PerceptionPipelineInput): Promise<PerceptionPipelineResult>;
}

export interface PerceptualAssetResolverPort {
  resolve(selector: PerceptionAssetSelector): Promise<ResolvedPerceptualAsset>;
}

export interface MediaProbePort {
  probe(asset: ResolvedPerceptualAsset): Promise<MediaProbeResult>;
}

export interface PerceptionClientPort {
  describe?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
  transcribe?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
  classify?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
  detectShots?(request: PerceptionClientRequest): Promise<PerceptionEvidenceEntry | undefined>;
}

export interface PerceptualAssetPort {
  createThumbnail?(request: PerceptualAssetRequest): Promise<PerceptualAssetRef | undefined>;
  extractKeyframes?(request: PerceptualAssetRequest): Promise<readonly PerceptualAssetRef[]>;
  createWaveform?(request: PerceptualAssetRequest): Promise<PerceptualAssetRef | undefined>;
  createMultiView?(request: PerceptualAssetRequest): Promise<readonly PerceptualAssetRef[]>;
}

export interface BackfillSink {
  applyBackfill(payload: ToolResultBackfillPayload): Promise<void>;
}

export interface PerceptionPipelinePorts {
  readonly resolver: PerceptualAssetResolverPort;
  readonly mediaProbe: MediaProbePort;
  readonly perceptionClient?: PerceptionClientPort;
  readonly perceptualAsset?: PerceptualAssetPort;
  readonly backfillSink?: BackfillSink;
}

export interface PerceptionPipelineOptions {
  readonly now?: () => number;
  readonly retryPolicy?: PerceptionEvidenceRetryPolicy;
  readonly defaultLayers?: readonly PerceptionLayer[];
}
