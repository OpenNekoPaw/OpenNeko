import type {
  ChatMessage,
  ContentPart,
  MultimodalContextPacket,
  PerceptionCard,
  PerceptualAssetRef,
  ProviderInputModalities,
} from '@neko/shared';
import type { AgentMultimodalEvidenceRef } from '@neko-agent/types';

export type { ProviderInputModalities } from '@neko/shared';

export interface MultimodalMessageProjectionOptions {
  readonly includeTextInputs?: boolean;
  readonly imageDetail?: 'auto' | 'low' | 'high';
  readonly locale?: string;
}

export interface ProviderInputModalityResolverInput {
  readonly providerId?: string;
  readonly runtime?: Partial<ProviderInputModalities>;
  readonly providerCard?: {
    readonly inputModalities?: Partial<ProviderInputModalities>;
  };
}

export interface ProjectionDiagnostic {
  readonly code:
    | 'asset-load-failed'
    | 'asset-loader-missing'
    | 'asset-ref-missing'
    | 'unsupported-modality'
    | 'provider-input-modality-unsupported';
  readonly message: string;
  readonly assetId?: string;
  readonly modality?: string;
}

export interface VisionPreprocessPolicy {
  readonly maxBytes?: number;
  readonly imageDetail?: 'auto' | 'low' | 'high';
}

export interface ProviderReadyAssetPayload {
  readonly kind: 'image' | 'audio' | 'video';
  readonly url: string;
  readonly mimeType?: string;
}

export interface PerceptionAssetLoader {
  load(
    ref: PerceptualAssetRef,
    policy?: VisionPreprocessPolicy,
  ): Promise<ProviderReadyAssetPayload>;
}

export interface AsyncMultimodalMessageProjectionOptions extends MultimodalMessageProjectionOptions {
  readonly provider?: ProviderInputModalityResolverInput;
  readonly perceptionCards?: readonly PerceptionCard[];
  readonly assetLoader?: PerceptionAssetLoader;
  readonly visionPolicy?: VisionPreprocessPolicy;
}

export interface AsyncMultimodalMessageProjectionResult {
  readonly message: ChatMessage;
  readonly diagnostics: readonly ProjectionDiagnostic[];
}

const TEXT_ONLY_MODALITIES: ProviderInputModalities = {
  text: true,
  image: false,
  video: false,
  audio: false,
};

const BUILT_IN_PROVIDER_MODALITIES: Record<string, ProviderInputModalities> = {
  openai: { text: true, image: true, video: false, audio: false },
  anthropic: { text: true, image: true, video: false, audio: false },
  gemini: { text: true, image: true, video: true, audio: true },
  google: { text: true, image: true, video: true, audio: true },
};

export function projectMultimodalPacketToChatMessage(
  packet: MultimodalContextPacket,
  options: MultimodalMessageProjectionOptions = {},
): ChatMessage {
  const parts: ContentPart[] = [];
  const includeTextInputs = options.includeTextInputs ?? true;

  for (const input of packet.perceptionInputs) {
    if (input.modality === 'text' && includeTextInputs) {
      const text = input.metadata?.['text'];
      if (typeof text === 'string' && text.trim().length > 0) {
        parts.push({ type: 'text', text });
      }
      continue;
    }

    if (input.modality === 'image' && input.uri) {
      parts.push({ type: 'image', imageUrl: input.uri, detail: options.imageDetail ?? 'auto' });
      continue;
    }

    if (input.modality === 'video' && input.uri) {
      parts.push({
        type: 'video',
        videoUrl: input.uri,
        ...(readMimeType(input.metadata) ? { mimeType: readMimeType(input.metadata) } : {}),
      });
      continue;
    }

    if (input.modality === 'audio') {
      parts.push({ type: 'text', text: summarizeAudioInput(input, options.locale) });
    }
  }

  const evidenceSummary = summarizeEvidenceRefs(readEvidenceRefs(packet), options.locale);
  if (evidenceSummary) {
    parts.push({ type: 'text', text: evidenceSummary });
  }

  if (parts.length === 0) {
    return { role: 'user', content: summarizePacket(packet, options.locale) };
  }

  return { role: 'user', content: parts };
}

export function resolveProviderInputModalities(
  input: ProviderInputModalityResolverInput = {},
): ProviderInputModalities {
  return {
    ...TEXT_ONLY_MODALITIES,
    ...(input.providerId ? BUILT_IN_PROVIDER_MODALITIES[input.providerId] : undefined),
    ...input.providerCard?.inputModalities,
    ...input.runtime,
  };
}

export async function projectMultimodalPacketToChatMessageAsync(
  packet: MultimodalContextPacket,
  options: AsyncMultimodalMessageProjectionOptions = {},
): Promise<AsyncMultimodalMessageProjectionResult> {
  const baseMessage = projectMultimodalPacketToChatMessage(packet, options);
  const hasPerceptionCards = (options.perceptionCards?.length ?? 0) > 0;
  const baseParts = projectBaseMessageParts(packet, baseMessage, hasPerceptionCards);
  const diagnostics: ProjectionDiagnostic[] = [];
  const providerModalities = resolveProviderInputModalities(options.provider);
  diagnostics.push(...findUnsupportedPacketInputModalities(packet, providerModalities));

  const perceptionCards = selectProviderLoadablePerceptionCards(options.perceptionCards ?? []);
  for (const card of perceptionCards) {
    const projected = await projectPerceptionCardToContentParts(card, {
      providerModalities,
      assetLoader: options.assetLoader,
      visionPolicy: options.visionPolicy,
      imageDetail: options.imageDetail,
      locale: options.locale,
    });
    baseParts.push(...projected.parts);
    diagnostics.push(...projected.diagnostics);
  }

  return {
    message: { role: 'user', content: baseParts },
    diagnostics,
  };
}

function selectProviderLoadablePerceptionCards(
  cards: readonly PerceptionCard[],
): readonly PerceptionCard[] {
  const hasProviderLoadableCard = new Set(
    cards
      .filter((card) => hasProviderLoadablePerceptualRef(card))
      .map((card) => `${card.assetId}:${card.modality}`),
  );

  return cards.filter((card) => {
    if (hasProviderLoadablePerceptualRef(card)) {
      return true;
    }
    return !hasProviderLoadableCard.has(`${card.assetId}:${card.modality}`);
  });
}

function hasProviderLoadablePerceptualRef(card: PerceptionCard): boolean {
  if (card.modality === 'image') {
    return selectImagePerceptualRef(card) !== undefined;
  }
  if (card.modality === 'video') {
    return selectVideoPerceptualRef(card) !== undefined;
  }
  if (card.modality === 'audio') {
    return card.perceptual?.waveformRef !== undefined;
  }
  return true;
}

function projectBaseMessageParts(
  packet: MultimodalContextPacket,
  baseMessage: ChatMessage,
  hasPerceptionCards: boolean,
): ContentPart[] {
  if (Array.isArray(baseMessage.content)) {
    return [...baseMessage.content];
  }

  if (hasPerceptionCards && isEmptyPacketSummaryOnly(packet)) {
    return [];
  }

  return [{ type: 'text', text: baseMessage.content }];
}

export async function projectPerceptionCardToContentParts(
  card: PerceptionCard,
  options: {
    readonly providerModalities?: ProviderInputModalities;
    readonly assetLoader?: PerceptionAssetLoader;
    readonly visionPolicy?: VisionPreprocessPolicy;
    readonly imageDetail?: 'auto' | 'low' | 'high';
    readonly locale?: string;
  } = {},
): Promise<{
  readonly parts: ContentPart[];
  readonly diagnostics: readonly ProjectionDiagnostic[];
}> {
  const providerModalities = options.providerModalities ?? TEXT_ONLY_MODALITIES;
  const diagnostics: ProjectionDiagnostic[] = [];
  const parts: ContentPart[] = [
    { type: 'text', text: summarizePerceptionCard(card, options.locale) },
  ];

  if (card.modality === 'image' && providerModalities.image) {
    const imageRef = selectImagePerceptualRef(card);
    if (!imageRef) {
      if (card.layerStatus.layer2 !== 'skipped') {
        diagnostics.push({
          code: 'asset-ref-missing',
          assetId: card.assetId,
          modality: 'image',
          message: 'Image perception card does not include a provider-loadable asset reference.',
        });
      }
    } else if (!options.assetLoader) {
      diagnostics.push({
        code: 'asset-loader-missing',
        assetId: imageRef.assetId,
        modality: 'image',
        message: 'Native image projection requires a perception asset loader.',
      });
    } else {
      try {
        const loaded = await options.assetLoader.load(imageRef, options.visionPolicy);
        parts.push({
          type: 'image',
          imageUrl: loaded.url,
          detail: options.imageDetail ?? options.visionPolicy?.imageDetail ?? 'auto',
        });
      } catch (error) {
        diagnostics.push({
          code: 'asset-load-failed',
          assetId: imageRef.assetId,
          modality: 'image',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } else if (card.modality === 'image') {
    diagnostics.push({
      code: 'provider-input-modality-unsupported',
      assetId: card.assetId,
      modality: 'image',
      message: 'The selected chat model does not support native image input.',
    });
  }

  if (card.modality === 'video' && providerModalities.video) {
    const videoRef = selectVideoPerceptualRef(card);
    if (!videoRef) {
      if (card.layerStatus.layer2 !== 'skipped') {
        diagnostics.push({
          code: 'asset-ref-missing',
          assetId: card.assetId,
          modality: 'video',
          message: 'Video perception card does not include a provider-loadable asset reference.',
        });
      }
    } else if (!options.assetLoader) {
      diagnostics.push({
        code: 'asset-loader-missing',
        assetId: videoRef.assetId,
        modality: 'video',
        message: 'Native video projection requires a perception asset loader.',
      });
    } else {
      try {
        const loaded = await options.assetLoader.load(videoRef, options.visionPolicy);
        parts.push({
          type: 'video',
          videoUrl: loaded.url,
          ...(loaded.mimeType ? { mimeType: loaded.mimeType } : {}),
        });
      } catch (error) {
        diagnostics.push({
          code: 'asset-load-failed',
          assetId: videoRef.assetId,
          modality: 'video',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } else if (card.modality === 'video') {
    diagnostics.push({
      code: 'provider-input-modality-unsupported',
      assetId: card.assetId,
      modality: 'video',
      message: 'The selected chat model does not support native video input.',
    });
  }

  if (card.modality === 'audio' && providerModalities.audio !== true) {
    diagnostics.push({
      code: 'unsupported-modality',
      assetId: card.assetId,
      message:
        providerModalities.audio === 'realtime-only'
          ? 'Stored audio assets use text fallback for realtime-only providers.'
          : 'Audio payloads are not supported by this provider.',
    });
  }

  return { parts, diagnostics };
}

function findUnsupportedPacketInputModalities(
  packet: MultimodalContextPacket,
  providerModalities: ProviderInputModalities,
): ProjectionDiagnostic[] {
  const unsupportedModalities = new Set<string>();
  for (const input of packet.perceptionInputs) {
    if (input.modality === 'image' && providerModalities.image !== true) {
      unsupportedModalities.add('image');
    }
    if (input.modality === 'video' && providerModalities.video !== true) {
      unsupportedModalities.add('video');
    }
  }

  return Array.from(unsupportedModalities).map((modality) => ({
    code: 'provider-input-modality-unsupported' as const,
    modality,
    message: `The selected chat model does not support native ${modality} input.`,
  }));
}

function summarizePerceptionCard(card: PerceptionCard, locale: string | undefined): string {
  const labels = getMultimodalProjectionLabels(locale);
  const structural = [
    card.structural.mimeType,
    card.structural.width && card.structural.height
      ? `${card.structural.width}x${card.structural.height}`
      : undefined,
    card.structural.durationMs !== undefined
      ? `durationMs=${card.structural.durationMs}`
      : undefined,
    card.structural.channels !== undefined ? `channels=${card.structural.channels}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const evidence = card.semantic?.evidences
    .map((entry) => `${entry.kind}(${entry.confidence}): ${stringifyEvidenceValue(entry.value)}`)
    .join('; ');

  return [
    `${labels.perceptionCard} ${card.assetId} [${card.modality}] ${structural}`.trim(),
    evidence ? `${labels.evidence}: ${evidence}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}

function selectImagePerceptualRef(card: PerceptionCard): PerceptualAssetRef | undefined {
  return card.perceptual?.thumbnailRef ?? card.perceptual?.keyframeRefs?.[0];
}

function selectVideoPerceptualRef(card: PerceptionCard): PerceptualAssetRef | undefined {
  return (
    card.perceptual?.multiViewRefs?.find((ref) => ref.mimeType.startsWith('video/')) ??
    card.perceptual?.keyframeRefs?.find((ref) => ref.mimeType.startsWith('video/'))
  );
}

function stringifyEvidenceValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizePacket(packet: MultimodalContextPacket, locale: string | undefined): string {
  const labels = getMultimodalProjectionLabels(locale);
  const modalities = Array.from(new Set(packet.perceptionInputs.map((input) => input.modality)));
  const evidenceSummary = summarizeEvidenceRefs(readEvidenceRefs(packet), locale);
  return [
    `${labels.multimodalPacket} ${packet.id}: ${modalities.join(', ') || labels.noInputs}`,
    evidenceSummary,
  ]
    .filter(Boolean)
    .join('\n');
}

function isEmptyPacketSummaryOnly(packet: MultimodalContextPacket): boolean {
  return packet.perceptionInputs.length === 0 && readEvidenceRefs(packet).length === 0;
}

function readMimeType(metadata: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const value = metadata?.['mimeType'];
  return typeof value === 'string' ? value : undefined;
}

function summarizeAudioInput(
  input: {
    readonly id: string;
    readonly uri?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
  locale: string | undefined,
): string {
  const labels = getMultimodalProjectionLabels(locale);
  return [
    `${labels.audioContext}: ${input.id}`,
    input.uri ? `uri=${input.uri}` : undefined,
    readMimeType(input.metadata) ? `mimeType=${readMimeType(input.metadata)}` : undefined,
    readDurationMs(input.metadata) ? `durationMs=${readDurationMs(input.metadata)}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function readDurationMs(
  metadata: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  const value = metadata?.['durationMs'];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readEvidenceRefs(packet: MultimodalContextPacket): readonly AgentMultimodalEvidenceRef[] {
  const value = packet.metadata?.['evidenceRefs'];
  return Array.isArray(value)
    ? value.filter((item): item is AgentMultimodalEvidenceRef => isEvidenceRef(item))
    : [];
}

function isEvidenceRef(value: unknown): value is AgentMultimodalEvidenceRef {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { readonly id?: unknown }).id === 'string' &&
    typeof (value as { readonly modality?: unknown }).modality === 'string',
  );
}

function summarizeEvidenceRefs(
  evidenceRefs: readonly AgentMultimodalEvidenceRef[],
  locale: string | undefined,
): string {
  if (evidenceRefs.length === 0) return '';
  const labels = getMultimodalProjectionLabels(locale);
  const included = evidenceRefs.filter((evidence) => !evidence.withheld);
  const withheld = evidenceRefs.filter((evidence) => evidence.withheld);
  return [
    included.length > 0
      ? `${labels.includedFeedbackEvidence}: ${included.map(formatEvidenceRef).join('; ')}`
      : `${labels.includedFeedbackEvidence}: ${labels.none}`,
    withheld.length > 0
      ? `${labels.withheldFeedbackEvidence}: ${withheld
          .map(
            (evidence) => `${formatEvidenceRef(evidence)} (${evidence.withheldReason ?? 'policy'})`,
          )
          .join('; ')}`
      : `${labels.withheldFeedbackEvidence}: ${labels.none}`,
  ].join('\n');
}

function formatEvidenceRef(evidence: AgentMultimodalEvidenceRef): string {
  return `${evidence.id} [${evidence.modality}]${evidence.summary ? ` ${evidence.summary}` : ''}`;
}

function getMultimodalProjectionLabels(locale: string | undefined): {
  readonly perceptionCard: string;
  readonly evidence: string;
  readonly multimodalPacket: string;
  readonly noInputs: string;
  readonly audioContext: string;
  readonly includedFeedbackEvidence: string;
  readonly withheldFeedbackEvidence: string;
  readonly none: string;
} {
  if (locale?.trim().toLowerCase().startsWith('zh')) {
    return {
      perceptionCard: '感知卡片',
      evidence: '证据',
      multimodalPacket: '多模态上下文包',
      noInputs: '无输入',
      audioContext: '音频上下文',
      includedFeedbackEvidence: '已包含反馈证据',
      withheldFeedbackEvidence: '已隐藏反馈证据',
      none: '无',
    };
  }

  return {
    perceptionCard: 'PerceptionCard',
    evidence: 'Evidence',
    multimodalPacket: 'Multimodal context packet',
    noInputs: 'no inputs',
    audioContext: 'Audio context',
    includedFeedbackEvidence: 'Included feedback evidence',
    withheldFeedbackEvidence: 'Withheld feedback evidence',
    none: 'none',
  };
}
