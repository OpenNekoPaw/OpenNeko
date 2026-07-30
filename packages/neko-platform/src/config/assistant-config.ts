import {
  DEFAULT_CONFIG,
  DEFAULT_EXTENSION_CONFIG,
  type ChatModelOption,
  type MediaModelType,
  type ModelSourceGroup,
  type UnifiedConfig,
} from '@neko/shared';
import type { Model, Provider } from '../types/provider';
import type { MergedConfig } from './config-manager';
import type { AssistantConfigDiagnostic } from './config-diagnostic';
import { isProviderConfigured } from './provider-configuration';

export type AssistantExecutionMode = 'plan' | 'ask' | 'auto';
export type MediaUnderstandingCategory = 'image' | 'audio' | 'video';
export type MediaUnderstandingPurpose =
  'image.understand' | 'audio.understand' | 'video.understand';
export type MediaUnderstandingModelStatusValue = 'configured' | 'auto' | 'missing';
export type MediaUnderstandingModelSource = 'explicit-config';

export const MEDIA_UNDERSTANDING_PURPOSES = [
  { category: 'image', purpose: 'image.understand' },
  { category: 'audio', purpose: 'audio.understand' },
  { category: 'video', purpose: 'video.understand' },
] as const satisfies readonly {
  category: MediaUnderstandingCategory;
  purpose: MediaUnderstandingPurpose;
}[];

export interface MediaUnderstandingModelStatus {
  category: MediaUnderstandingCategory;
  purpose: MediaUnderstandingPurpose;
  status: MediaUnderstandingModelStatusValue;
  providerId?: string;
  modelId?: string;
  optionId?: string;
  label?: string;
  providerLabel?: string;
  source?: MediaUnderstandingModelSource;
}

export type MediaUnderstandingModels = Record<
  MediaUnderstandingCategory,
  MediaUnderstandingModelStatus
>;

export interface AssistantProviderModelView {
  id: string;
  name: string;
  enabled: boolean;
}

export interface AssistantProviderView {
  id: string;
  name: string;
  type: string;
  connectionKind?: string;
  protocolProfile?: string;
  supportLevel?: string;
  requiresApiKey?: boolean;
  models: AssistantProviderModelView[];
  enabled: boolean;
}

export interface AssistantConfiguredProviderView extends AssistantProviderView {
  apiKey?: string;
  baseUrl?: string;
}

export interface AssistantProviderSelection {
  id: string;
  isConfigured: boolean;
  defaultModel: string;
  modelIds: string[];
  source?: 'explicit-config';
}

export interface AssistantSettingsSnapshot {
  selectedProviderId: string | null;
  selectedModelId: string | null;
  /**
   * Persisted legacy field name. Runtime consumers must treat this as
   * user custom instructions layered over the built-in base prompt, not as
   * a replacement system prompt.
   */
  customSystemPrompt: string;
  autoExecuteTools: boolean;
  streamResponses: boolean;
  showToolCalls: boolean;
  temperature: number;
  maxTokens: number;
  executionMode: AssistantExecutionMode;
}

export interface AssistantRuntimeSettingsSnapshot extends AssistantSettingsSnapshot {
  thinkingBudget: number;
}

export interface AssistantSettingsData extends AssistantSettingsSnapshot {
  providers: AssistantProviderView[];
  configuredProviders: AssistantConfiguredProviderView[];
  chatModelOptions: ChatModelOption[];
  modelGroups: ModelSourceGroup[];
  defaultMediaModels: Partial<Record<MediaModelType, string>>;
  mediaUnderstandingModels?: MediaUnderstandingModels;
  configDiagnostic?: AssistantConfigDiagnostic;
}

export interface AssistantConfigState {
  providers: AssistantProviderView[];
  configuredProviders: AssistantConfiguredProviderView[];
  selectedProviderId: string | null;
  selectedModelId: string | null;
  customSystemPrompt: string;
  autoExecuteTools: boolean;
  streamResponses: boolean;
  showToolCalls: boolean;
  temperature: number;
  maxTokens: number;
  executionMode: AssistantExecutionMode;
  chatModelOptions: ChatModelOption[];
  modelGroups: ModelSourceGroup[];
  defaultMediaModels: Partial<Record<MediaModelType, string>>;
  mediaUnderstandingModels?: MediaUnderstandingModels;
  configDiagnostic?: AssistantConfigDiagnostic;
}

export interface AssistantSettingsDataMessage extends AssistantSettingsData {
  type: 'settingsData';
  systemPrompt: string;
}

export type AssistantSettingsUpdatedMessage =
  | { type: 'settingsUpdated'; success: true }
  | { type: 'settingsUpdated'; success: false; error: string };

export type AssistantProviderMutationResultMessage =
  | { type: 'modelAdded'; success: boolean; modelType: string; error?: string }
  | { type: 'modelRemoved'; success: boolean; modelType: string; error?: string };

export type AssistantProviderMutation =
  | { type: 'providerRemoved'; providerId: string }
  | { type: 'providerToggled'; providerId: string; enabled: boolean }
  | { type: 'modelToggled'; providerId: string; modelId: string; enabled: boolean };

export function buildAssistantSettingsDataMessage(
  data: AssistantSettingsData,
): AssistantSettingsDataMessage {
  return {
    type: 'settingsData',
    ...data,
    systemPrompt: data.customSystemPrompt,
  };
}

export function buildAssistantSettingsUpdatedMessage(
  input: { success: true } | { success: false; error: string },
): AssistantSettingsUpdatedMessage {
  if (input.success === true) {
    return { type: 'settingsUpdated', success: true };
  }

  return {
    type: 'settingsUpdated',
    success: false,
    error: input.error,
  };
}

export function buildAssistantProviderMutationResultMessage(input: {
  type: AssistantProviderMutationResultMessage['type'];
  success: boolean;
  modelType: string;
  error?: string;
}): AssistantProviderMutationResultMessage {
  return {
    type: input.type,
    success: input.success,
    modelType: input.modelType,
    ...(input.error !== undefined ? { error: input.error } : {}),
  };
}

export function buildAssistantProviderViews(config: Pick<MergedConfig, 'providers' | 'models'>) {
  const providers = Array.from(config.providers.values());
  const models = Array.from(config.models.values());
  return providers.map((provider) => toProviderView(provider, models));
}

export function buildAssistantConfigState(
  config: Pick<MergedConfig, 'providers' | 'models'>,
): Pick<AssistantConfigState, 'providers' | 'configuredProviders' | 'modelGroups'> {
  return {
    providers: buildAssistantProviderViews(config),
    configuredProviders: buildAssistantConfiguredProviderViews(config),
    modelGroups: [],
  };
}

export function buildAssistantConfiguredProviderViews(
  config: Pick<MergedConfig, 'providers' | 'models'>,
): AssistantConfiguredProviderView[] {
  const providers = Array.from(config.providers.values());
  const models = Array.from(config.models.values());
  return providers
    .filter((provider) => isProviderConfigured(provider))
    .map((provider) => ({
      ...toProviderView(provider, models),
      ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
      ...(provider.apiUrl ? { baseUrl: provider.apiUrl } : {}),
    }));
}

export function selectAssistantDefaultProvider(
  config: Pick<MergedConfig, 'providers' | 'models'>,
): AssistantProviderSelection | undefined {
  const providers = Array.from(config.providers.values());
  const models = Array.from(config.models.values());
  const provider = providers.find(
    (candidate) => candidate.enabled !== false && isProviderConfigured(candidate),
  );
  return provider ? toProviderSelection(provider, models) : undefined;
}

export function selectAssistantProvider(
  config: Pick<MergedConfig, 'providers' | 'models'>,
  providerId: string,
): AssistantProviderSelection | undefined {
  const provider = config.providers.get(providerId);
  if (!provider) return undefined;
  return toProviderSelection(provider, Array.from(config.models.values()));
}

export function buildAssistantSettingsSnapshot(input: {
  defaultProvider?: string | null;
  defaultModel?: string | null;
  customSystemPrompt?: string;
  autoExecuteTools?: boolean;
  streamResponses?: boolean;
  showToolCalls?: boolean;
  temperature?: number;
  maxTokens?: number;
  executionMode?: AssistantExecutionMode;
}): AssistantSettingsSnapshot {
  return {
    selectedProviderId: input.defaultProvider ?? null,
    selectedModelId: input.defaultModel ?? null,
    customSystemPrompt: input.customSystemPrompt ?? DEFAULT_EXTENSION_CONFIG.customSystemPrompt,
    autoExecuteTools: input.autoExecuteTools ?? DEFAULT_EXTENSION_CONFIG.autoExecuteTools,
    streamResponses: input.streamResponses ?? DEFAULT_EXTENSION_CONFIG.streamResponses,
    showToolCalls: input.showToolCalls ?? DEFAULT_EXTENSION_CONFIG.showToolCalls,
    temperature: input.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: input.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    executionMode: input.executionMode ?? DEFAULT_EXTENSION_CONFIG.executionMode,
  };
}

export function buildAssistantRuntimeSettingsSnapshot(
  input: Parameters<typeof buildAssistantSettingsSnapshot>[0] & {
    thinkingBudget?: number;
  },
): AssistantRuntimeSettingsSnapshot {
  return {
    ...buildAssistantSettingsSnapshot(input),
    thinkingBudget: input.thinkingBudget ?? DEFAULT_EXTENSION_CONFIG.thinkingBudget,
  };
}

export function buildDefaultMediaModelOptionIds(input: {
  defaultMediaModels: Partial<Record<MediaModelType, string>>;
  chatModelOptions: readonly ChatModelOption[];
  models: Iterable<Model>;
}): Partial<Record<MediaModelType, string>> {
  const modelIdAliases = buildModelIdAliases(input.models);
  const result: Partial<Record<MediaModelType, string>> = {};

  for (const [category, modelRef] of Object.entries(input.defaultMediaModels)) {
    if (!modelRef) continue;
    const normalizedModelId = modelIdAliases.get(modelRef) ?? modelRef;
    const option = input.chatModelOptions.find(
      (candidate) =>
        candidate.category === category &&
        (candidate.id === modelRef || candidate.modelId === normalizedModelId),
    );
    if (option) {
      result[category as MediaModelType] = option.id;
    }
  }

  return result;
}

export function mapAssistantSettingsToUnifiedScalars(
  updates: Partial<AssistantSettingsSnapshot>,
): Partial<UnifiedConfig> {
  const mapped: Partial<UnifiedConfig> = {};
  if ('selectedProviderId' in updates) {
    mapped.defaultProvider = updates.selectedProviderId ?? undefined;
  }
  if ('selectedModelId' in updates) {
    mapped.defaultModel = updates.selectedModelId ?? undefined;
  }
  if (updates.customSystemPrompt !== undefined) {
    mapped.customSystemPrompt = updates.customSystemPrompt;
  }
  if (updates.autoExecuteTools !== undefined) {
    mapped.autoExecuteTools = updates.autoExecuteTools;
  }
  if (updates.streamResponses !== undefined) {
    mapped.streamResponses = updates.streamResponses;
  }
  if (updates.showToolCalls !== undefined) {
    mapped.showToolCalls = updates.showToolCalls;
  }
  if (updates.temperature !== undefined) {
    mapped.temperature = updates.temperature;
  }
  if (updates.maxTokens !== undefined) {
    mapped.maxTokens = updates.maxTokens;
  }
  if (updates.executionMode !== undefined) {
    mapped.executionMode = updates.executionMode;
  }
  return mapped;
}

export function mapWebviewSettingsToUnifiedScalars(
  settings: Record<string, unknown>,
): Partial<UnifiedConfig> {
  const mapped: Partial<UnifiedConfig> = {};
  if ('providerId' in settings) {
    mapped.defaultProvider = nullableString(settings.providerId);
  }
  if ('modelId' in settings) {
    mapped.defaultModel = nullableString(settings.modelId);
  }
  if (typeof settings.systemPrompt === 'string') {
    mapped.customSystemPrompt = settings.systemPrompt;
  }
  if (typeof settings.autoExecuteTools === 'boolean') {
    mapped.autoExecuteTools = settings.autoExecuteTools;
  }
  if (typeof settings.streamResponses === 'boolean') {
    mapped.streamResponses = settings.streamResponses;
  }
  if (typeof settings.showToolCalls === 'boolean') {
    mapped.showToolCalls = settings.showToolCalls;
  }
  if (typeof settings.temperature === 'number' && Number.isFinite(settings.temperature)) {
    mapped.temperature = settings.temperature;
  }
  if (typeof settings.maxTokens === 'number' && Number.isFinite(settings.maxTokens)) {
    mapped.maxTokens = settings.maxTokens;
  }
  if (typeof settings.thinkingBudget === 'number' && Number.isFinite(settings.thinkingBudget)) {
    mapped.thinkingBudget = settings.thinkingBudget;
  }
  const executionMode = parseExecutionMode(settings.executionMode);
  if (executionMode) {
    mapped.executionMode = executionMode;
  }
  return mapped;
}

export function buildAssistantSettingsResetScalars(): Partial<UnifiedConfig> {
  return {
    defaultProvider: undefined,
    defaultModel: undefined,
    customSystemPrompt: undefined,
    autoExecuteTools: undefined,
    streamResponses: undefined,
    showToolCalls: undefined,
    temperature: undefined,
    maxTokens: undefined,
    executionMode: undefined,
    thinkingBudget: undefined,
  };
}

export function buildAssistantProviderMutationSettingsUpdate(input: {
  mutation: AssistantProviderMutation;
  selection: Pick<AssistantSettingsSnapshot, 'selectedProviderId' | 'selectedModelId'>;
}): Partial<AssistantSettingsSnapshot> {
  const selectedProviderId = input.selection.selectedProviderId;
  const selectedModelId = input.selection.selectedModelId;

  if (input.mutation.type === 'providerRemoved') {
    return input.mutation.providerId === selectedProviderId
      ? { selectedProviderId: null, selectedModelId: null }
      : {};
  }

  if (input.mutation.type === 'providerToggled') {
    return !input.mutation.enabled && input.mutation.providerId === selectedProviderId
      ? { selectedProviderId: null, selectedModelId: null }
      : {};
  }

  if (input.mutation.type === 'modelToggled') {
    return !input.mutation.enabled &&
      input.mutation.providerId === selectedProviderId &&
      input.mutation.modelId === selectedModelId
      ? { selectedModelId: null }
      : {};
  }

  return {};
}

function toProviderView(provider: Provider, models: readonly Model[]): AssistantProviderView {
  return {
    id: provider.id,
    name: provider.displayName || provider.name || provider.id,
    type: provider.type,
    ...(provider.connectionKind ? { connectionKind: provider.connectionKind } : {}),
    ...(provider.protocolProfile ? { protocolProfile: provider.protocolProfile } : {}),
    ...(provider.supportLevel ? { supportLevel: provider.supportLevel } : {}),
    ...(provider.requiresApiKey !== undefined ? { requiresApiKey: provider.requiresApiKey } : {}),
    models: models
      .filter((model) => model.providerId === provider.id)
      .map((model) => ({
        id: model.id,
        name: model.displayName || model.name || model.id,
        enabled: model.enabled !== false,
      })),
    enabled: provider.enabled !== false,
  };
}

function toProviderSelection(
  provider: Provider,
  models: readonly Model[],
): AssistantProviderSelection {
  const modelIds = models
    .filter((model) => model.providerId === provider.id && model.enabled !== false)
    .map((model) => model.id);
  const defaultModel = modelIds[0] || '';
  return {
    id: provider.id,
    isConfigured: provider.enabled !== false && isProviderConfigured(provider),
    defaultModel,
    modelIds,
  };
}

function buildModelIdAliases(models: Iterable<Model>): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const model of models) {
    aliases.set(model.id, model.id);
    if (model.name) aliases.set(model.name, model.id);
    if (model.displayName) aliases.set(model.displayName, model.id);
  }
  return aliases;
}

function nullableString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseExecutionMode(value: unknown): AssistantExecutionMode | undefined {
  return value === 'plan' || value === 'ask' || value === 'auto' ? value : undefined;
}
