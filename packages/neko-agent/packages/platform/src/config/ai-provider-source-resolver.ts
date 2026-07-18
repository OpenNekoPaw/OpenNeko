import type {
  ChatModelOption,
  ModelSourceGroup,
  ModelType,
  SecretSafeModelProjection,
  SecretSafeProviderProjection,
} from '@neko/shared';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';
import type { Model, Provider } from '../types/provider';
import type { AssistantConfigDiagnostic } from './config-diagnostic';
import { isProviderConfigured } from './provider-configuration';
import { ChatModelService } from './chat-model-service';

export interface AiProviderSourceInput {
  readonly providers: readonly Provider[];
  readonly models: readonly Model[];
  readonly userConfigReadResult?: ConfigReadResult | null;
  readonly configDiagnostic?: AssistantConfigDiagnostic;
}

export interface ExplicitAiConfigState {
  readonly isExplicit: boolean;
  readonly invalidDiagnostic?: AssistantConfigDiagnostic;
}

export interface AiProviderSourceProjection {
  readonly providers: readonly SecretSafeProviderProjection[];
  readonly models: readonly SecretSafeModelProjection[];
  readonly chatModelOptions: readonly ChatModelOption[];
  readonly modelGroups: readonly ModelSourceGroup[];
  readonly explicitAiConfig: ExplicitAiConfigState;
  readonly hasSelectableModels: boolean;
}

const chatModelService = new ChatModelService();

export function resolveAiProviderSources(input: AiProviderSourceInput): AiProviderSourceProjection {
  const chatModelOptions = chatModelService.getChatModelOptions(
    [...input.providers],
    [...input.models],
  );
  return {
    providers: input.providers.map(toSecretSafeProvider),
    models: input.models.map(toSecretSafeModel),
    chatModelOptions,
    modelGroups: buildExplicitModelGroups(input.providers, chatModelOptions),
    explicitAiConfig: detectExplicitAiConfig(input),
    hasSelectableModels: chatModelOptions.length > 0,
  };
}

export function detectExplicitAiConfig(input: AiProviderSourceInput): ExplicitAiConfigState {
  const result = input.userConfigReadResult;
  if (result?.status !== 'ok') return { isExplicit: false };

  const raw = result.config;
  const isExplicit =
    hasNonEmptyArray(raw.providers) ||
    hasNonEmptyArray(raw.models) ||
    isNonEmptyString(raw.defaultProvider) ||
    isNonEmptyString(raw.defaultModel) ||
    hasNonEmptyRecord(raw.defaultModels) ||
    hasNonEmptyRecord(raw.defaultModelPurposes) ||
    hasNonEmptyRecord(raw.providerOverrides) ||
    hasNonEmptyRecord(raw.modelOverrides);
  if (!isExplicit) return { isExplicit: false };

  const invalidDiagnostic = isExplicitAiAvailabilityDiagnostic(input.configDiagnostic)
    ? input.configDiagnostic
    : undefined;
  return {
    isExplicit: true,
    ...(invalidDiagnostic ? { invalidDiagnostic } : {}),
  };
}

function buildExplicitModelGroups(
  providers: readonly Provider[],
  options: readonly ChatModelOption[],
): readonly ModelSourceGroup[] {
  const providerOrder = new Map(providers.map((provider, index) => [provider.id, index]));
  return providers
    .filter((provider) => provider.enabled !== false && isProviderConfigured(provider))
    .map((provider) => {
      const providerOptions = options.filter((option) => option.providerId === provider.id);
      return {
        source: 'explicit-config',
        providerId: provider.id,
        providerLabel: provider.displayName || provider.name || provider.id,
        connectionKind: provider.connectionKind,
        priority: providerOrder.get(provider.id) ?? 0,
        modelsByType: groupModelOptionsByType(providerOptions),
      } satisfies ModelSourceGroup;
    })
    .filter((group) => Object.keys(group.modelsByType).length > 0);
}

function groupModelOptionsByType(
  options: readonly ChatModelOption[],
): Partial<Record<ModelType, readonly ChatModelOption[]>> {
  const groups: Partial<Record<ModelType, ChatModelOption[]>> = {};
  for (const option of options) {
    const category = option.category ?? 'llm';
    groups[category] = [...(groups[category] ?? []), option];
  }
  return groups;
}

function toSecretSafeProvider(provider: Provider): SecretSafeProviderProjection {
  return {
    id: provider.id,
    name: provider.name,
    displayName: provider.displayName,
    type: provider.type,
    enabled: provider.enabled !== false,
    connectionKind: provider.connectionKind,
    protocolProfile: provider.protocolProfile,
    supportLevel: provider.supportLevel,
    requiresApiKey: provider.requiresApiKey,
    source: 'explicit-config',
  };
}

function toSecretSafeModel(model: Model): SecretSafeModelProjection {
  return {
    id: model.id,
    name: model.name,
    ...(model.displayName ? { displayName: model.displayName } : {}),
    providerId: model.providerId,
    ...(model.type ? { type: model.type } : {}),
    ...(model.protocolProfile ? { protocolProfile: model.protocolProfile } : {}),
    capabilities: [...model.capabilities],
    ...(model.providerExpressionProfileId
      ? { providerExpressionProfileId: model.providerExpressionProfileId }
      : {}),
    ...(isPositiveInteger(model.contextWindow) ? { contextWindow: model.contextWindow } : {}),
    ...(isPositiveInteger(model.maxOutputTokens) ? { maxOutputTokens: model.maxOutputTokens } : {}),
    enabled: model.enabled !== false,
    source: 'explicit-config',
  };
}

function isExplicitAiAvailabilityDiagnostic(
  diagnostic?: AssistantConfigDiagnostic,
): diagnostic is AssistantConfigDiagnostic {
  return (
    diagnostic?.code === 'missingProvider' ||
    diagnostic?.code === 'missingModel' ||
    diagnostic?.code === 'missingApiKey' ||
    diagnostic?.code === 'invalidDefaultProvider' ||
    diagnostic?.code === 'invalidDefaultModel' ||
    diagnostic?.code === 'invalidDefaultModelBinding'
  );
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasNonEmptyRecord(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
