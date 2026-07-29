import type {
  PerceptionCard,
  PerceptionDiagnostics,
  PerceptionEvidenceEntry,
  PerceptionLayer,
} from '@neko/shared';
import type {
  MediaProbeResult,
  PerceptionClientRequest,
  PerceptionPipelineInput,
  PerceptionPipelineOptions,
  PerceptionPipelinePorts,
  PerceptionPipelineResult,
  ResolvedPerceptualAsset,
} from './contracts';

const DEFAULT_RETRY_POLICY = {
  minConfidence: 0.5,
  maxRetries: 1,
} satisfies NonNullable<PerceptionPipelineOptions['retryPolicy']>;

export class PerceptionPipeline {
  private readonly now: () => number;
  private readonly retryPolicy: NonNullable<PerceptionPipelineOptions['retryPolicy']> =
    DEFAULT_RETRY_POLICY;

  constructor(
    private readonly ports: PerceptionPipelinePorts,
    options: PerceptionPipelineOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    if (options.retryPolicy) {
      this.retryPolicy = options.retryPolicy;
    }
  }

  async perceive(input: PerceptionPipelineInput): Promise<PerceptionPipelineResult> {
    const startedAt = this.now();
    const asset = await this.ports.resolver.resolve(input.asset);
    const probe = await this.ports.mediaProbe.probe(asset);
    const layers = new Set<PerceptionLayer>(input.policy.layers);
    const evidences = layers.has(1) ? await this.collectLayerOneEvidence(asset, input) : [];
    const perceptual = layers.has(2) ? await this.collectLayerTwoRefs(asset, input) : undefined;
    const completedAt = this.now();

    const card: PerceptionCard = {
      version: 1,
      assetId: asset.assetId,
      modality: asset.modality,
      ...(input.sourceToolCallId ? { sourceToolCallId: input.sourceToolCallId } : {}),
      ...(input.contextPacketId ? { contextPacketId: input.contextPacketId } : {}),
      createdAt: completedAt,
      layerStatus: {
        layer0: 'complete',
        layer1: layers.has(1) ? (evidences.length > 0 ? 'complete' : 'failed') : 'skipped',
        layer2: layers.has(2) ? (perceptual ? 'complete' : 'failed') : 'skipped',
      },
      structural: normalizeProbe(asset, probe),
      ...(evidences.length > 0 ? { semantic: { evidences } } : {}),
      ...(perceptual ? { perceptual } : {}),
      cost: {
        totalMs: Math.max(0, completedAt - startedAt),
        tokenEstimate: estimatePerceptionTokens(evidences),
        gpuUsed: false,
      },
      ...((input.cacheKey ?? asset.cacheKey) ? { cacheKey: input.cacheKey ?? asset.cacheKey } : {}),
    };

    const backfill = input.sourceToolCallId
      ? {
          toolCallId: input.sourceToolCallId,
          timestamp: completedAt,
          dataPatch: {
            perceptionStatus: 'completed',
            perceptionCardAssetIds: [card.assetId],
          },
          perceptionCards: [card],
        }
      : undefined;

    if (backfill) {
      await this.ports.backfillSink?.applyBackfill(backfill);
    }

    return { card, ...(backfill ? { backfill } : {}) };
  }

  private async collectLayerOneEvidence(
    asset: ResolvedPerceptualAsset,
    input: PerceptionPipelineInput,
  ): Promise<PerceptionEvidenceEntry[]> {
    const client = this.ports.perceptionClient;
    if (!client) return [];

    const request: PerceptionClientRequest = {
      asset,
      ...(input.focus ? { focus: input.focus } : {}),
      ...(input.options ? { options: input.options } : {}),
      ...(input.understandingModels ? { understandingModels: input.understandingModels } : {}),
    };
    const tasks: Array<Promise<PerceptionEvidenceEntry | undefined>> = [];

    const describe = client.describe?.bind(client);
    if (describe) {
      tasks.push(this.runEvidenceWithRetry(() => describe(request)));
    }
    const transcribe = client.transcribe?.bind(client);
    if ((asset.modality === 'audio' || asset.modality === 'video') && transcribe) {
      tasks.push(this.runEvidenceWithRetry(() => transcribe(request)));
    }
    const classify = client.classify?.bind(client);
    if (asset.modality === 'image' && classify) {
      tasks.push(this.runEvidenceWithRetry(() => classify(request)));
    }
    const detectShots = client.detectShots?.bind(client);
    if (asset.modality === 'video' && detectShots) {
      tasks.push(this.runEvidenceWithRetry(() => detectShots(request)));
    }

    const results = await Promise.allSettled(tasks);
    const evidences = results.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
    if (evidences.length === 0) {
      const rejection = results.find((result) => result.status === 'rejected');
      if (rejection?.status === 'rejected') {
        throwPerceptionClientError(rejection.reason);
      }
    }
    return evidences;
  }

  private async runEvidenceWithRetry(
    produce: () => Promise<PerceptionEvidenceEntry | undefined>,
  ): Promise<PerceptionEvidenceEntry | undefined> {
    let last: PerceptionEvidenceEntry | undefined;
    for (let attempt = 0; attempt <= this.retryPolicy.maxRetries; attempt += 1) {
      const evidence = await produce();
      if (!evidence) return undefined;
      last = evidence;
      if (evidence.confidence >= this.retryPolicy.minConfidence) {
        return attempt > 0 ? withRetryDiagnostics(evidence, attempt, 'recovered') : evidence;
      }
    }

    return last
      ? withRetryDiagnostics(last, this.retryPolicy.maxRetries, 'low-confidence')
      : undefined;
  }

  private async collectLayerTwoRefs(
    asset: ResolvedPerceptualAsset,
    input: PerceptionPipelineInput,
  ): Promise<PerceptionCard['perceptual'] | undefined> {
    const providerReadyImageRef = asset.modality === 'image' && asset.ref ? asset.ref : undefined;
    const providerReadyVideoRefs = asset.modality === 'video' && asset.ref ? [asset.ref] : [];
    const port = this.ports.perceptualAsset;
    if (!port) {
      return providerReadyImageRef
        ? { thumbnailRef: providerReadyImageRef }
        : providerReadyVideoRefs.length > 0
          ? { multiViewRefs: providerReadyVideoRefs }
          : undefined;
    }

    const request = {
      asset,
      ...(input.focus ? { focus: input.focus } : {}),
      ...(input.options ? { options: input.options } : {}),
    };
    const [thumbnailRef, keyframeRefs, waveformRef, multiViewRefs] = await Promise.all([
      settleOptional(() => port.createThumbnail?.(request)),
      asset.modality === 'video'
        ? settleOptional(() => port.extractKeyframes?.(request))
        : Promise.resolve(undefined),
      asset.modality === 'audio' || asset.modality === 'video'
        ? settleOptional(() => port.createWaveform?.(request))
        : Promise.resolve(undefined),
      asset.modality === 'data'
        ? settleOptional(() => port.createMultiView?.(request))
        : Promise.resolve(undefined),
    ]);
    const allMultiViewRefs = [...providerReadyVideoRefs, ...(multiViewRefs ?? [])];

    if (
      !(thumbnailRef ?? providerReadyImageRef) &&
      (!keyframeRefs || keyframeRefs.length === 0) &&
      !waveformRef &&
      allMultiViewRefs.length === 0
    ) {
      return undefined;
    }

    return {
      ...((thumbnailRef ?? providerReadyImageRef)
        ? { thumbnailRef: thumbnailRef ?? providerReadyImageRef }
        : {}),
      ...(keyframeRefs && keyframeRefs.length > 0 ? { keyframeRefs } : {}),
      ...(waveformRef ? { waveformRef } : {}),
      ...(allMultiViewRefs.length > 0 ? { multiViewRefs: allMultiViewRefs } : {}),
    };
  }
}

export function createPerceptionPipeline(
  ports: PerceptionPipelinePorts,
  options: PerceptionPipelineOptions = {},
): PerceptionPipeline {
  return new PerceptionPipeline(ports, options);
}

function normalizeProbe(
  asset: ResolvedPerceptualAsset,
  probe: MediaProbeResult,
): PerceptionCard['structural'] {
  return {
    format: probe.format,
    mimeType: probe.mimeType || asset.mimeType,
    byteSize: probe.byteSize || asset.byteSize || 0,
    ...(probe.width !== undefined ? { width: probe.width } : {}),
    ...(probe.height !== undefined ? { height: probe.height } : {}),
    ...(probe.durationMs !== undefined ? { durationMs: probe.durationMs } : {}),
    ...(probe.frameRate !== undefined ? { frameRate: probe.frameRate } : {}),
    ...(probe.channels !== undefined ? { channels: probe.channels } : {}),
    ...(probe.sampleRate !== undefined ? { sampleRate: probe.sampleRate } : {}),
    ...(probe.vertexCount !== undefined ? { vertexCount: probe.vertexCount } : {}),
    ...(probe.materialCount !== undefined ? { materialCount: probe.materialCount } : {}),
  };
}

function withRetryDiagnostics(
  evidence: PerceptionEvidenceEntry,
  retryCount: number,
  retryReason: PerceptionDiagnostics['retryReason'],
): PerceptionEvidenceEntry {
  return {
    ...evidence,
    diagnostics: {
      retryCount,
      retryReason,
      ...evidence.diagnostics,
    },
  };
}

function estimatePerceptionTokens(evidences: readonly PerceptionEvidenceEntry[]): number {
  return evidences.reduce((total, evidence) => {
    if (typeof evidence.value === 'string') {
      return total + Math.ceil(evidence.value.length / 4);
    }
    return total + 16;
  }, 0);
}

async function settleOptional<T>(
  produce: () => Promise<T | undefined> | undefined,
): Promise<T | undefined> {
  try {
    return await produce();
  } catch {
    return undefined;
  }
}

function throwPerceptionClientError(reason: unknown): never {
  if (reason instanceof Error) {
    throw reason;
  }
  throw new Error(String(reason));
}
