import {
  DEFAULT_CONFIG,
  DEFAULT_EXTENSION_CONFIG,
  MEDIA_MODEL_TYPES,
  mergeConfigs,
  normalizeExternalResearchConfig,
  type ExternalResearchConfig,
  type MediaModelType,
  type ModelRefConfig,
  type UnifiedConfig,
} from '@neko/shared';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';
import type { MCPServerPreset } from '../types/config';
import type { Model, Provider } from '../types/provider';
import {
  buildAssistantConfigAvailabilityDiagnostic,
  projectAssistantConfigReadResultDiagnostic,
  type AssistantConfigDiagnostic,
} from './config-diagnostic';
import { isProviderConfigured } from './provider-configuration';
import type { AssistantExecutionMode } from './assistant-config';

export type EffectiveAgentConfigValueSource = 'user' | 'workspace' | 'runtime' | 'default';

export interface EffectiveAgentConfigSelectionSource {
  readonly provider?: EffectiveAgentConfigValueSource;
  readonly model?: EffectiveAgentConfigValueSource;
  readonly temperature: EffectiveAgentConfigValueSource;
  readonly maxTokens: EffectiveAgentConfigValueSource;
  readonly thinkingBudget: EffectiveAgentConfigValueSource;
  readonly executionMode: EffectiveAgentConfigValueSource;
  readonly mediaDefaults: Partial<Record<MediaModelType, EffectiveAgentConfigValueSource>>;
}

export interface EffectiveAgentRuntimeOverrides {
  readonly selectedProviderId?: string | null;
  readonly selectedModelId?: string | null;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly executionMode?: AssistantExecutionMode;
  readonly defaultMediaModels?: Partial<Record<MediaModelType, string>>;
}

export interface EffectiveAgentWorkspaceConfigSnapshot {
  readonly providerId: string | null;
  readonly modelId: string | null;
  readonly provider?: Provider;
  readonly model?: Model;
  readonly modelCapabilities?: readonly string[];
  readonly temperature: number;
  readonly maxTokens: number;
  readonly thinkingBudget: number;
  readonly executionMode: AssistantExecutionMode;
  readonly defaultMediaModels: Partial<Record<MediaModelType, string>>;
  readonly externalResearch: ExternalResearchConfig;
  readonly mcpServers: readonly MCPServerPreset[];
  readonly diagnostics: readonly AssistantConfigDiagnostic[];
  readonly blockingDiagnostic?: AssistantConfigDiagnostic;
  readonly sources: EffectiveAgentConfigSelectionSource;
}

export interface ResolveEffectiveAgentWorkspaceConfigInput {
  readonly userConfigReadResult: ConfigReadResult | null | undefined;
  readonly workspaceConfigReadResult?: ConfigReadResult | null;
  readonly providers: readonly Provider[];
  readonly models: readonly Model[];
  readonly mcpServers: readonly MCPServerPreset[];
  readonly runtimeOverrides?: EffectiveAgentRuntimeOverrides;
}

interface ConfigValue<T> {
  readonly value: T;
  readonly source: EffectiveAgentConfigValueSource;
  readonly filePath?: string;
}

export function resolveEffectiveAgentWorkspaceConfigSnapshot(
  input: ResolveEffectiveAgentWorkspaceConfigInput,
): EffectiveAgentWorkspaceConfigSnapshot {
  const diagnostics = collectReadDiagnostics(input);
  const userConfig = readOkConfig(input.userConfigReadResult);
  const workspaceConfig = readOkConfig(input.workspaceConfigReadResult);
  const runtime = input.runtimeOverrides;
  diagnostics.push(
    ...collectWorkspacePolicyDiagnostics({
      workspaceConfig,
      workspaceConfigReadResult: input.workspaceConfigReadResult,
    }),
  );

  const providerSelection = resolveProviderSelection(userConfig, workspaceConfig, runtime);
  const modelSelection = resolveModelSelection(
    userConfig,
    workspaceConfig,
    runtime,
    providerSelection,
  );
  const temperature = resolveScalar({
    key: 'temperature',
    defaultValue: DEFAULT_CONFIG.temperature,
    userConfig,
    workspaceConfig,
    runtimeValue: runtime?.temperature,
  });
  const maxTokens = resolveScalar({
    key: 'maxTokens',
    defaultValue: DEFAULT_CONFIG.maxTokens,
    userConfig,
    workspaceConfig,
    runtimeValue: runtime?.maxTokens,
  });
  const thinkingBudget = resolveScalar({
    key: 'thinkingBudget',
    defaultValue: DEFAULT_EXTENSION_CONFIG.thinkingBudget,
    userConfig,
    workspaceConfig,
    runtimeValue: runtime?.thinkingBudget,
  });
  const executionMode = resolveScalar({
    key: 'executionMode',
    defaultValue: DEFAULT_EXTENSION_CONFIG.executionMode,
    userConfig,
    workspaceConfig,
    runtimeValue: runtime?.executionMode,
  });
  const mediaDefaults = resolveMediaDefaults(userConfig, workspaceConfig, runtime);
  const externalResearch = normalizeExternalResearchConfig(
    mergeConfigs(userConfig, workspaceConfig).externalResearch,
  );

  const provider = providerSelection.value
    ? input.providers.find((candidate) => candidate.id === providerSelection.value)
    : undefined;
  const model = modelSelection.value
    ? input.models.find((candidate) => candidate.id === modelSelection.value)
    : undefined;

  diagnostics.push(
    ...validateProviderModelSelection({
      userConfigReadResult: input.userConfigReadResult,
      workspaceConfigReadResult: input.workspaceConfigReadResult,
      providerSelection,
      modelSelection,
      provider,
      model,
      hasProviders: input.providers.some(isEnabledProvider),
      hasChatModels: input.models.some(isEnabledChatModel),
    }),
  );

  const blockingDiagnostic = diagnostics.find(isBlockingEffectiveConfigDiagnostic);

  return {
    providerId: providerSelection.value,
    modelId: modelSelection.value,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(isStringArray(model?.capabilities) ? { modelCapabilities: model.capabilities } : {}),
    temperature: temperature.value,
    maxTokens: maxTokens.value,
    thinkingBudget: thinkingBudget.value,
    executionMode: executionMode.value,
    defaultMediaModels: mediaDefaults.values,
    externalResearch,
    mcpServers: input.mcpServers.filter((server) => server.enabled !== false),
    diagnostics,
    ...(blockingDiagnostic ? { blockingDiagnostic } : {}),
    sources: {
      ...(providerSelection.source ? { provider: providerSelection.source } : {}),
      ...(modelSelection.source ? { model: modelSelection.source } : {}),
      temperature: temperature.source,
      maxTokens: maxTokens.source,
      thinkingBudget: thinkingBudget.source,
      executionMode: executionMode.source,
      mediaDefaults: mediaDefaults.sources,
    },
  };
}

function collectWorkspacePolicyDiagnostics(input: {
  readonly workspaceConfig: UnifiedConfig;
  readonly workspaceConfigReadResult?: ConfigReadResult | null;
}): AssistantConfigDiagnostic[] {
  if (input.workspaceConfigReadResult?.status !== 'ok') return [];
  const filePath = input.workspaceConfigReadResult.filePath;
  const diagnostics: AssistantConfigDiagnostic[] = [];
  if ((input.workspaceConfig.providers?.length ?? 0) > 0) {
    diagnostics.push(
      buildAssistantConfigAvailabilityDiagnostic(
        'unsupportedWorkspaceProviderDefinition',
        filePath,
      ),
    );
  }
  if ((input.workspaceConfig.models?.length ?? 0) > 0) {
    diagnostics.push(
      buildAssistantConfigAvailabilityDiagnostic('unsupportedWorkspaceModelDefinition', filePath),
    );
  }
  if (isNonEmptyString(input.workspaceConfig.skillsDir)) {
    diagnostics.push(
      buildAssistantConfigAvailabilityDiagnostic('unsupportedSkillSource', filePath),
    );
  }
  return diagnostics;
}

function isBlockingEffectiveConfigDiagnostic(diagnostic: AssistantConfigDiagnostic): boolean {
  return diagnostic.code !== 'unsupportedSkillSource';
}

function collectReadDiagnostics(
  input: ResolveEffectiveAgentWorkspaceConfigInput,
): AssistantConfigDiagnostic[] {
  const diagnostics: AssistantConfigDiagnostic[] = [];
  const userDiagnostic = input.userConfigReadResult
    ? projectAssistantConfigReadResultDiagnostic(input.userConfigReadResult)
    : undefined;
  const workspaceDiagnostic = input.workspaceConfigReadResult
    ? projectAssistantConfigReadResultDiagnostic(input.workspaceConfigReadResult)
    : undefined;
  if (userDiagnostic) diagnostics.push(userDiagnostic);
  if (workspaceDiagnostic) diagnostics.push(workspaceDiagnostic);
  return diagnostics;
}

function readOkConfig(result: ConfigReadResult | null | undefined): UnifiedConfig {
  return result?.status === 'ok' ? result.config : {};
}

function resolveProviderSelection(
  userConfig: UnifiedConfig,
  workspaceConfig: UnifiedConfig,
  runtime: EffectiveAgentRuntimeOverrides | undefined,
): ConfigValue<string | null> {
  if (runtime?.selectedProviderId !== undefined) {
    return { value: normalizeString(runtime.selectedProviderId), source: 'runtime' };
  }
  const workspaceDefaultModel = workspaceConfig.defaultModels?.llm;
  if (workspaceDefaultModel?.providerId) {
    return {
      value: workspaceDefaultModel.providerId,
      source: 'workspace',
      filePath: undefined,
    };
  }
  const userDefaultModel = userConfig.defaultModels?.llm;
  if (userDefaultModel?.providerId) {
    return { value: userDefaultModel.providerId, source: 'user' };
  }
  if (workspaceConfig.defaultProvider) {
    return { value: workspaceConfig.defaultProvider, source: 'workspace' };
  }
  if (userConfig.defaultProvider) {
    return { value: userConfig.defaultProvider, source: 'user' };
  }
  return { value: null, source: 'default' };
}

function resolveModelSelection(
  userConfig: UnifiedConfig,
  workspaceConfig: UnifiedConfig,
  runtime: EffectiveAgentRuntimeOverrides | undefined,
  providerSelection: ConfigValue<string | null>,
): ConfigValue<string | null> {
  if (runtime?.selectedModelId !== undefined) {
    return { value: normalizeString(runtime.selectedModelId), source: 'runtime' };
  }
  const workspaceDefaultModel = workspaceConfig.defaultModels?.llm;
  if (
    workspaceDefaultModel?.modelId &&
    (!providerSelection.value || workspaceDefaultModel.providerId === providerSelection.value)
  ) {
    return { value: workspaceDefaultModel.modelId, source: 'workspace' };
  }
  const userDefaultModel = userConfig.defaultModels?.llm;
  if (
    userDefaultModel?.modelId &&
    (!providerSelection.value || userDefaultModel.providerId === providerSelection.value)
  ) {
    return { value: userDefaultModel.modelId, source: 'user' };
  }
  if (workspaceConfig.defaultModel) {
    return { value: workspaceConfig.defaultModel, source: 'workspace' };
  }
  if (userConfig.defaultModel) {
    return { value: userConfig.defaultModel, source: 'user' };
  }
  return { value: null, source: 'default' };
}

function resolveScalar<
  K extends keyof UnifiedConfig,
  T extends NonNullable<UnifiedConfig[K]>,
>(input: {
  readonly key: K;
  readonly defaultValue: T;
  readonly userConfig: UnifiedConfig;
  readonly workspaceConfig: UnifiedConfig;
  readonly runtimeValue?: T;
}): ConfigValue<T> {
  if (input.runtimeValue !== undefined) {
    return { value: input.runtimeValue, source: 'runtime' };
  }
  const workspaceValue = input.workspaceConfig[input.key];
  if (workspaceValue !== undefined) {
    return { value: workspaceValue as T, source: 'workspace' };
  }
  const userValue = input.userConfig[input.key];
  if (userValue !== undefined) {
    return { value: userValue as T, source: 'user' };
  }
  return { value: input.defaultValue, source: 'default' };
}

function resolveMediaDefaults(
  userConfig: UnifiedConfig,
  workspaceConfig: UnifiedConfig,
  runtime: EffectiveAgentRuntimeOverrides | undefined,
): {
  readonly values: Partial<Record<MediaModelType, string>>;
  readonly sources: Partial<Record<MediaModelType, EffectiveAgentConfigValueSource>>;
} {
  const values: Partial<Record<MediaModelType, string>> = {};
  const sources: Partial<Record<MediaModelType, EffectiveAgentConfigValueSource>> = {};
  for (const type of MEDIA_MODEL_TYPES) {
    const runtimeValue = runtime?.defaultMediaModels?.[type];
    const workspaceValue = workspaceConfig.defaultModels?.[type];
    const userValue = userConfig.defaultModels?.[type];
    if (runtimeValue) {
      values[type] = runtimeValue;
      sources[type] = 'runtime';
    } else if (workspaceValue) {
      values[type] = toModelOptionId(workspaceValue);
      sources[type] = 'workspace';
    } else if (userValue) {
      values[type] = toModelOptionId(userValue);
      sources[type] = 'user';
    }
  }
  return { values, sources };
}

function validateProviderModelSelection(input: {
  readonly userConfigReadResult: ConfigReadResult | null | undefined;
  readonly workspaceConfigReadResult?: ConfigReadResult | null;
  readonly providerSelection: ConfigValue<string | null>;
  readonly modelSelection: ConfigValue<string | null>;
  readonly provider?: Provider;
  readonly model?: Model;
  readonly hasProviders: boolean;
  readonly hasChatModels: boolean;
}): AssistantConfigDiagnostic[] {
  const filePath = resolveSelectionFilePath(input);
  if (!input.hasProviders) {
    return [
      buildAssistantConfigAvailabilityDiagnostic(
        input.userConfigReadResult?.status === 'missing' ? 'missingConfig' : 'missingProvider',
        filePath,
      ),
    ];
  }
  if (!input.hasChatModels) {
    return [buildAssistantConfigAvailabilityDiagnostic('missingModel', filePath)];
  }
  if (!input.providerSelection.value && !input.modelSelection.value) {
    return [];
  }
  if (!input.providerSelection.value || !input.provider || input.provider.enabled === false) {
    return [buildAssistantConfigAvailabilityDiagnostic('invalidDefaultProvider', filePath)];
  }
  if (!isProviderConfigured(input.provider)) {
    return [buildAssistantConfigAvailabilityDiagnostic('missingApiKey', filePath)];
  }
  if (!input.modelSelection.value) {
    return [];
  }
  if (!input.model || input.model.enabled === false) {
    return [buildAssistantConfigAvailabilityDiagnostic('invalidDefaultModel', filePath)];
  }
  if (input.model.providerId !== input.provider.id || !isChatModel(input.model)) {
    return [buildAssistantConfigAvailabilityDiagnostic('invalidDefaultModelBinding', filePath)];
  }
  return [];
}

function resolveSelectionFilePath(input: {
  readonly userConfigReadResult: ConfigReadResult | null | undefined;
  readonly workspaceConfigReadResult?: ConfigReadResult | null;
  readonly providerSelection: ConfigValue<string | null>;
  readonly modelSelection: ConfigValue<string | null>;
}): string {
  const source =
    input.providerSelection.source === 'workspace' || input.modelSelection.source === 'workspace'
      ? input.workspaceConfigReadResult
      : input.userConfigReadResult;
  return source?.filePath ?? input.userConfigReadResult?.filePath ?? '<agent-config>';
}

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isChatModel(model: Model): boolean {
  return (model.type ?? 'llm') === 'llm';
}

function isEnabledProvider(provider: Provider): boolean {
  return provider.enabled !== false;
}

function isEnabledChatModel(model: Model): boolean {
  return model.enabled !== false && isChatModel(model);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toModelOptionId(ref: ModelRefConfig): string {
  return `${ref.providerId}:${ref.modelId}`;
}
