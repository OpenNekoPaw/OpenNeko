/**
 * ProviderCard expression context types.
 *
 * These contracts describe provider-facing expression context without binding to
 * platform adapter implementations. See docs/architecture/adr-provider-expression-context.md.
 */

import {
  createAgentProfileDiagnostic,
  toAgentProfileValidationResult,
  validateAgentProfileIdentity,
  type AgentProfileDiagnostic,
  type AgentProfileIdentity,
  type AgentProfileSource,
  type AgentProfileValidationResult,
  type IAgentProfileRegistry,
} from './agent-profile';

export type ProviderId = string;
export type ProviderModelId = string;

export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function isValidProviderId(providerId: string): providerId is ProviderId {
  return PROVIDER_ID_PATTERN.test(providerId);
}

export type ProviderGenerationCapability = 'image.generate' | 'video.generate' | 'audio.generate';

export interface ProviderInputModalities {
  readonly text: boolean;
  readonly image: boolean;
  readonly video: boolean;
  readonly audio: boolean | 'realtime-only';
}

export type StyleFamily =
  | 'photorealistic'
  | 'anime'
  | 'illustration'
  | 'concept-art'
  | 'pixel-art'
  | 'painting'
  | '3d-render'
  | 'mixed';

export type ProviderCardLayer = 'builtin' | 'market' | 'project';

export type ProviderExpressionProfileSource = AgentProfileSource;

export type ConceptCoverageStatus = 'native' | 'partial' | 'unknown' | 'anti-pattern';

export type StyleAffinityLevel = 0 | 1 | 2 | 3;

export interface ProviderAssetRef {
  readonly id: string;
  readonly uri?: string;
  readonly mimeType?: string;
  readonly description?: string;
}

export interface ProviderConceptEntry {
  readonly concept: string;
  readonly status: ConceptCoverageStatus;
  readonly expansion?: string;
  readonly note?: string;
}

export interface ProviderSyntaxProfile {
  readonly supportsNegativePrompt?: boolean;
  readonly promptTokenLimit?: number;
  readonly bestPhrasingPattern?: string;
  readonly notes: readonly string[];
}

export interface ProviderConceptCoverage {
  readonly entries: readonly ProviderConceptEntry[];
}

export interface ProviderTrainingProfile {
  readonly stylePrior?: string;
  readonly descriptionDensity?: string;
  readonly styleAffinities: Readonly<Partial<Record<StyleFamily, StyleAffinityLevel>>>;
  readonly spatialGrounding?: string;
  readonly antiBiasStrategies: readonly string[];
  readonly captionConvention?: string;
}

export interface ProviderCard {
  /**
   * Optional compatibility identity. Runtime registries normalize older
   * ProviderCards into ProviderExpressionProfileDescriptor before treating them
   * as first-class Agent profiles.
   */
  readonly profileId?: string;
  readonly kind?: 'provider-expression';
  readonly source?: ProviderExpressionProfileSource;
  readonly providerId: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly displayName: string;
  readonly version: string;
  readonly capabilities: readonly ProviderGenerationCapability[];
  readonly inputModalities?: Partial<ProviderInputModalities>;
  readonly sourceLayer: ProviderCardLayer;
  readonly sourceRef?: string;
  readonly syntaxProfile: ProviderSyntaxProfile;
  readonly conceptCoverage: ProviderConceptCoverage;
  readonly trainingProfile: ProviderTrainingProfile;
  readonly rawMarkdown?: string;
}

export interface ProviderExpressionProfileDescriptor
  extends Omit<ProviderCard, 'profileId' | 'kind' | 'source'>,
    AgentProfileIdentity<'provider-expression', string> {
  readonly kind: 'provider-expression';
  readonly source: ProviderExpressionProfileSource;
}

/**
 * Compatibility alias: ProviderCard remains the public contribution shape, and
 * ProviderExpressionProfileDescriptor is the normalized profile contract.
 */
export type ProviderModelExpressionProfile = ProviderExpressionProfileDescriptor;

export type ProviderCardExpressionProfile = ProviderExpressionProfileDescriptor;

export interface ProviderTarget {
  readonly providerId: ProviderId;
  readonly modelId?: ProviderModelId;
}

export interface ProjectProviderHints {
  readonly preferredProviders?: readonly ProviderId[];
  readonly preferredTargets?: readonly ProviderTarget[];
  readonly avoidedProviders?: readonly ProviderId[];
  readonly avoidedTargets?: readonly ProviderTarget[];
  readonly providerSuccessRate?: Readonly<Record<ProviderId, number>>;
  readonly targetSuccessRate?: Readonly<Record<string, number>>;
}

export interface ProviderPreference {
  readonly preferredProvider?: ProviderId;
  readonly disabledProviders?: readonly ProviderId[];
}

export interface ProviderRouteInput {
  readonly capability: ProviderGenerationCapability;
  readonly providerId?: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly styleFamily: StyleFamily;
  readonly projectHints?: ProjectProviderHints;
  readonly userPreference?: ProviderPreference;
  readonly fallbackChain?: boolean;
}

export interface ProviderSelection {
  readonly primary: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly fallbacks: readonly ProviderTarget[];
  readonly reason: string;
}

export interface MemoryHint {
  readonly providerId?: ProviderId;
  readonly text: string;
  readonly weight?: number;
}

export type ProviderAdaptationMode = 'auto' | 'agentic' | 'native';

export interface GenerationIntentSource {
  readonly kind: 'inline-prompt' | 'task-markdown' | 'plan-markdown';
  readonly uri?: string;
  readonly section?: string;
  readonly contentHash?: string;
}

export interface GenerationIntentOutput {
  readonly duration?: number;
  readonly resolution?: string;
  readonly aspectRatio?: string;
  readonly count?: number;
}

export interface GenerationIntent {
  readonly source: GenerationIntentSource;
  readonly originalPrompt?: string;
  readonly capability?: ProviderGenerationCapability;
  readonly subject?: string;
  readonly styleFamily?: StyleFamily;
  readonly style?: readonly string[];
  readonly mood?: readonly string[];
  readonly quality?: readonly string[];
  readonly composition?: string;
  readonly avoid?: readonly string[];
  readonly mustInclude?: readonly string[];
  readonly output?: GenerationIntentOutput;
}

export interface ProviderAdaptationMetadata {
  readonly confidence?: number;
  readonly providerAssumptions?: readonly string[];
  readonly preservedConstraints?: readonly string[];
  readonly expandedConcepts?: readonly string[];
  readonly addedDetails?: readonly string[];
  readonly riskFlags?: readonly string[];
}

export interface ProviderPromptAdaptation {
  readonly mode: ProviderAdaptationMode;
  readonly providerPrompt: string;
  readonly negativePrompt?: string;
  readonly intent: GenerationIntent;
  readonly metadata: ProviderAdaptationMetadata;
}

export interface ProviderCardFilter {
  readonly providerId?: ProviderId;
  readonly modelId?: ProviderModelId;
  readonly capability?: ProviderGenerationCapability;
  readonly styleFamily?: StyleFamily;
  readonly sourceLayer?: ProviderCardLayer;
  readonly profileId?: string;
  readonly source?: ProviderExpressionProfileSource;
}

export type ProviderExpressionProfileFilter = ProviderCardFilter;

export type IProviderExpressionProfileRegistry =
  IAgentProfileRegistry<ProviderExpressionProfileDescriptor>;

export interface IProviderCardRegistry {
  register(card: ProviderCard): void;
  unregister(
    providerId: ProviderId,
    sourceLayer?: ProviderCardLayer,
    modelId?: ProviderModelId,
  ): void;
  get(providerId: ProviderId, modelId?: ProviderModelId): ProviderCard | undefined;
  list(filter?: ProviderCardFilter): readonly ProviderCard[];
  forCapability(capability: ProviderGenerationCapability): readonly ProviderCard[];
}

export interface IProviderRouter {
  route(input: ProviderRouteInput): ProviderSelection;
}

export function getProviderExpressionProfileId(
  card: Pick<ProviderCard, 'providerId' | 'modelId' | 'profileId'>,
): string {
  if (card.profileId) return card.profileId;
  return card.modelId
    ? `provider-expression:${card.providerId}:${card.modelId}`
    : `provider-expression:${card.providerId}`;
}

export function providerCardLayerToAgentProfileSource(
  layer: ProviderCardLayer,
): ProviderExpressionProfileSource {
  switch (layer) {
    case 'builtin':
      return 'builtin';
    case 'market':
      return 'market';
    case 'project':
      return 'project';
  }
}

export function toProviderExpressionProfile(
  card: ProviderCard,
): ProviderExpressionProfileDescriptor {
  return {
    ...card,
    profileId: getProviderExpressionProfileId(card),
    kind: 'provider-expression',
    source: card.source ?? providerCardLayerToAgentProfileSource(card.sourceLayer),
  };
}

export function validateProviderExpressionProfileDescriptor(
  descriptor: unknown,
): AgentProfileValidationResult {
  const normalized = isRecord(descriptor)
    ? {
        ...descriptor,
        profileId:
          typeof descriptor['profileId'] === 'string'
            ? descriptor['profileId']
            : descriptor['providerId'] !== undefined
              ? getProviderExpressionProfileId({
                  providerId: String(descriptor['providerId']),
                  modelId:
                    typeof descriptor['modelId'] === 'string' ? descriptor['modelId'] : undefined,
                })
              : undefined,
        kind: descriptor['kind'] ?? 'provider-expression',
        source:
          descriptor['source'] ??
          (isProviderCardLayer(descriptor['sourceLayer'])
            ? providerCardLayerToAgentProfileSource(descriptor['sourceLayer'])
            : undefined),
      }
    : descriptor;
  const diagnostics: AgentProfileDiagnostic[] = [
    ...validateAgentProfileIdentity(normalized, {
      expectedKind: 'provider-expression',
    }).diagnostics,
  ];
  const normalizedProfileId =
    isRecord(normalized) && typeof normalized['profileId'] === 'string'
      ? normalized['profileId']
      : undefined;

  if (!isRecord(descriptor)) {
    return toAgentProfileValidationResult(diagnostics);
  }

  if (typeof descriptor['providerId'] !== 'string' || !isValidProviderId(descriptor['providerId'])) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: ['providerId'],
        profileId: normalizedProfileId,
        kind: 'provider-expression',
        message: 'Provider expression profile must declare a valid providerId.',
        actual: descriptor['providerId'],
      }),
    );
  }

  if (!Array.isArray(descriptor['capabilities']) || descriptor['capabilities'].length === 0) {
    diagnostics.push(
      createAgentProfileDiagnostic({
        severity: 'error',
        code: 'malformed-profile-descriptor',
        path: ['capabilities'],
        profileId: normalizedProfileId,
        kind: 'provider-expression',
        message: 'Provider expression profile must declare at least one generation capability.',
      }),
    );
  }

  for (const forbiddenKey of PROVIDER_EXPRESSION_PROFILE_FORBIDDEN_KEYS) {
    if (forbiddenKey in descriptor) {
      diagnostics.push(
        createAgentProfileDiagnostic({
          severity: 'error',
          code: 'provider-expression-secrets-forbidden',
          path: [forbiddenKey],
          profileId: normalizedProfileId,
          kind: 'provider-expression',
          message:
            'Provider expression profiles must not contain credentials, runtime handles, or adapter wire mappings.',
          actual: forbiddenKey,
        }),
      );
    }
  }

  return toAgentProfileValidationResult(diagnostics);
}

function isProviderCardLayer(value: unknown): value is ProviderCardLayer {
  return value === 'builtin' || value === 'market' || value === 'project';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const PROVIDER_EXPRESSION_PROFILE_FORBIDDEN_KEYS = [
  'apiKey',
  'accessToken',
  'secret',
  'credentials',
  'runtimeHandle',
  'adapterMapping',
  'requestMapping',
] as const;
