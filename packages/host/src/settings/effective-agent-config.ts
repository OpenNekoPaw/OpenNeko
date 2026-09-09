import { createHash } from 'node:crypto';

import { MEDIA_MODEL_TYPES, type MediaModelType, type ModelRefConfig } from '@neko/ai-contracts';
import { stableStringify } from '@neko/shared';
import { DEFAULT_CONFIG, DEFAULT_EXTENSION_CONFIG, type UnifiedConfig } from './config-core/index';
import {
  EFFECTIVE_AGENT_CONFIG_DIMENSIONS,
  type EffectiveAgentConfigurationProjection,
  type EffectiveAgentConfigurationValues,
  type EffectiveAgentConfigValueSource,
  type EffectiveAgentOutputFormat,
} from '@neko/agent-contracts';
import type { ConfigReadResult } from './config-reader';
import type { Model, Provider } from './types/provider';
import {
  buildAssistantConfigAvailabilityDiagnostic,
  projectAssistantConfigDiagnostic,
  projectAssistantConfigReadResultDiagnostic,
  type AssistantConfigDiagnostic,
} from './config-diagnostic';
import { isProviderConfigured } from './provider-configuration';
import type { AssistantExecutionMode } from './assistant-config';

export interface EffectiveAgentConfigSelectionSource {
  readonly provider?: EffectiveAgentConfigValueSource;
  readonly model?: EffectiveAgentConfigValueSource;
  readonly temperature: EffectiveAgentConfigValueSource;
  readonly maxTokens: EffectiveAgentConfigValueSource;
  readonly thinkingBudget: EffectiveAgentConfigValueSource;
  readonly executionMode: EffectiveAgentConfigValueSource;
  readonly outputFormat: EffectiveAgentConfigValueSource;
  readonly mediaDefaults: Partial<Record<MediaModelType, EffectiveAgentConfigValueSource>>;
}

export interface EffectiveAgentRuntimeOverrides {
  readonly selectedProviderId?: string | null;
  readonly selectedModelId?: string | null;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
  readonly executionMode?: AssistantExecutionMode;
  readonly outputFormat?: EffectiveAgentOutputFormat;
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
  readonly outputFormat: EffectiveAgentOutputFormat;
  readonly defaultMediaModels: Partial<Record<MediaModelType, string>>;
  readonly diagnostics: readonly AssistantConfigDiagnostic[];
  readonly blockingDiagnostic?: AssistantConfigDiagnostic;
  readonly sources: EffectiveAgentConfigSelectionSource;
}

export interface ResolveEffectiveAgentWorkspaceConfigInput {
  readonly userConfigReadResult: ConfigReadResult | null | undefined;
  readonly providers: readonly Provider[];
  readonly models: readonly Model[];
  readonly runtimeOverrides?: EffectiveAgentRuntimeOverrides;
}

interface ConfigValue<T> {
  readonly value: T;
  readonly source: EffectiveAgentConfigValueSource;
}

export function resolveEffectiveAgentWorkspaceConfigSnapshot(
  input: ResolveEffectiveAgentWorkspaceConfigInput,
): EffectiveAgentWorkspaceConfigSnapshot {
  const diagnostics = collectReadDiagnostics(input);
  const userConfig = readOkConfig(input.userConfigReadResult);
  const runtime = input.runtimeOverrides;

  const providerSelection = resolveProviderSelection(userConfig, runtime);
  const modelSelection = resolveModelSelection(userConfig, runtime, providerSelection);
  const temperature = resolveScalar({
    key: 'temperature',
    defaultValue: DEFAULT_CONFIG.temperature,
    userConfig,
    runtimeValue: runtime?.temperature,
  });
  const maxTokens = resolveScalar({
    key: 'maxTokens',
    defaultValue: DEFAULT_CONFIG.maxTokens,
    userConfig,
    runtimeValue: runtime?.maxTokens,
  });
  const thinkingBudget = resolveScalar({
    key: 'thinkingBudget',
    defaultValue: DEFAULT_EXTENSION_CONFIG.thinkingBudget,
    userConfig,
    runtimeValue: runtime?.thinkingBudget,
  });
  const executionMode = resolveScalar({
    key: 'executionMode',
    defaultValue: DEFAULT_EXTENSION_CONFIG.executionMode,
    userConfig,
    runtimeValue: runtime?.executionMode,
  });
  const outputFormat: ConfigValue<EffectiveAgentOutputFormat> = {
    value: runtime?.outputFormat ?? 'markdown',
    source: runtime?.outputFormat === undefined ? 'default' : 'runtime',
  };
  const mediaDefaults = resolveMediaDefaults(userConfig, runtime);
  const provider = providerSelection.value
    ? input.providers.find((candidate) => candidate.id === providerSelection.value)
    : undefined;
  const model = modelSelection.value
    ? input.models.find((candidate) => candidate.id === modelSelection.value)
    : undefined;

  const selectionDiagnostics = validateProviderModelSelection({
    userConfigReadResult: input.userConfigReadResult,
    providerSelection,
    modelSelection,
    provider,
    model,
    hasProviders: input.providers.some(isEnabledProvider),
    hasChatModels: input.models.some(isEnabledChatModel),
  });
  diagnostics.push(...selectionDiagnostics);

  const blockingDiagnostic =
    projectBlockingReadDiagnostic(input.userConfigReadResult) ?? selectionDiagnostics[0];

  const resetProvider =
    providerSelection.source === 'runtime' && (!provider || provider.enabled === false);
  const resetModel =
    modelSelection.source === 'runtime' &&
    (!model ||
      model.enabled === false ||
      resetProvider ||
      model.providerId !== providerSelection.value ||
      (model.type !== undefined && model.type !== 'llm'));
  return {
    providerId: resetProvider ? null : providerSelection.value,
    modelId: resetModel ? null : modelSelection.value,
    ...(provider && !resetProvider ? { provider } : {}),
    ...(model && !resetModel ? { model } : {}),
    ...(!resetModel && isStringArray(model?.capabilities)
      ? { modelCapabilities: model.capabilities }
      : {}),
    temperature: temperature.value,
    maxTokens: maxTokens.value,
    thinkingBudget: thinkingBudget.value,
    executionMode: executionMode.value,
    outputFormat: outputFormat.value,
    defaultMediaModels: mediaDefaults.values,
    diagnostics,
    ...(blockingDiagnostic ? { blockingDiagnostic } : {}),
    sources: {
      ...(providerSelection.source ? { provider: providerSelection.source } : {}),
      ...(modelSelection.source ? { model: modelSelection.source } : {}),
      temperature: temperature.source,
      maxTokens: maxTokens.source,
      thinkingBudget: thinkingBudget.source,
      executionMode: executionMode.source,
      outputFormat: outputFormat.source,
      mediaDefaults: mediaDefaults.sources,
    },
  };
}

export function createEffectiveAgentConfigurationProjection(
  snapshot: EffectiveAgentWorkspaceConfigSnapshot,
): EffectiveAgentConfigurationProjection {
  if (snapshot.blockingDiagnostic) {
    throw new Error(
      `Effective Agent configuration is blocked: ${snapshot.blockingDiagnostic.code}`,
    );
  }
  const providerId = requireIdentity(snapshot.providerId, 'provider');
  const modelId = requireIdentity(snapshot.modelId, 'model');
  assertFiniteRange(snapshot.temperature, 'temperature', 0, 2);
  assertPositiveInteger(snapshot.maxTokens, 'maxTokens');
  assertNonNegativeInteger(snapshot.thinkingBudget, 'thinkingBudget');
  const values: EffectiveAgentConfigurationValues = Object.freeze({
    modelBinding: Object.freeze({ purpose: 'agent.main', providerId, modelId }),
    temperature: snapshot.temperature,
    maxTokens: snapshot.maxTokens,
    thinkingBudget: snapshot.thinkingBudget,
    executionMode: snapshot.executionMode,
    outputFormat: snapshot.outputFormat,
  });
  const sources = Object.freeze({
    modelBinding: requireMatchingModelSource(snapshot.sources),
    temperature: snapshot.sources.temperature,
    maxTokens: snapshot.sources.maxTokens,
    thinkingBudget: snapshot.sources.thinkingBudget,
    executionMode: snapshot.sources.executionMode,
    outputFormat: snapshot.sources.outputFormat,
  });
  const digest = configurationDigest(values, sources);
  return Object.freeze({
    profileId: `effective-agent-${digest.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    digest,
    values,
    sources,
    dimensions: EFFECTIVE_AGENT_CONFIG_DIMENSIONS,
  });
}

export function assertEffectiveAgentConfigurationProjection(
  input: EffectiveAgentConfigurationProjection,
): EffectiveAgentConfigurationProjection {
  const expectedDigest = configurationDigest(input.values, input.sources);
  if (input.digest !== expectedDigest) {
    throw new Error('Effective Agent configuration digest does not match its frozen values.');
  }
  const expectedProfileId = `effective-agent-${expectedDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`;
  if (input.profileId !== expectedProfileId) {
    throw new Error('Effective Agent configuration profile identity does not match its digest.');
  }
  return input;
}

function configurationDigest(
  values: EffectiveAgentConfigurationValues,
  sources: EffectiveAgentConfigurationProjection['sources'],
): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(
      stableStringify({
        values,
        sources,
      }),
    )
    .digest('hex')}`;
}

function requireMatchingModelSource(
  sources: EffectiveAgentConfigSelectionSource,
): EffectiveAgentConfigValueSource {
  if (!sources.provider || !sources.model || sources.provider !== sources.model) {
    throw new Error('Effective Agent provider/model sources must match for agent.main.');
  }
  return sources.provider;
}

function requireIdentity(value: string | null, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Effective Agent ${label} identity is required.`);
  return normalized;
}

function assertFiniteRange(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Effective Agent ${label} must be between ${min} and ${max}.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Effective Agent ${label} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Effective Agent ${label} must be a non-negative integer.`);
  }
}

function collectReadDiagnostics(
  input: ResolveEffectiveAgentWorkspaceConfigInput,
): AssistantConfigDiagnostic[] {
  const result = input.userConfigReadResult;
  if (!result || result.status === 'missing') return [];
  if (result.status === 'ok') {
    return result.diagnostics.map(projectAssistantConfigDiagnostic);
  }
  return [projectAssistantConfigDiagnostic(result.diagnostic)];
}

function projectBlockingReadDiagnostic(
  result: ConfigReadResult | null | undefined,
): AssistantConfigDiagnostic | undefined {
  if (!result || result.status === 'ok' || result.status === 'missing') return undefined;
  return projectAssistantConfigReadResultDiagnostic(result);
}

function readOkConfig(result: ConfigReadResult | null | undefined): UnifiedConfig {
  return result?.status === 'ok' ? result.config : {};
}

function resolveProviderSelection(
  userConfig: UnifiedConfig,
  runtime: EffectiveAgentRuntimeOverrides | undefined,
): ConfigValue<string | null> {
  if (runtime?.selectedProviderId !== undefined) {
    return { value: normalizeString(runtime.selectedProviderId), source: 'runtime' };
  }
  const userDefaultModel = userConfig.defaultModels?.llm;
  if (userDefaultModel?.providerId) {
    return { value: userDefaultModel.providerId, source: 'user' };
  }
  return { value: null, source: 'default' };
}

function resolveModelSelection(
  userConfig: UnifiedConfig,
  runtime: EffectiveAgentRuntimeOverrides | undefined,
  providerSelection: ConfigValue<string | null>,
): ConfigValue<string | null> {
  if (runtime?.selectedModelId !== undefined) {
    return { value: normalizeString(runtime.selectedModelId), source: 'runtime' };
  }
  const userDefaultModel = userConfig.defaultModels?.llm;
  if (
    userDefaultModel?.modelId &&
    (!providerSelection.value || userDefaultModel.providerId === providerSelection.value)
  ) {
    return { value: userDefaultModel.modelId, source: 'user' };
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
  readonly runtimeValue?: T;
}): ConfigValue<T> {
  if (input.runtimeValue !== undefined) {
    return { value: input.runtimeValue, source: 'runtime' };
  }
  const userValue = input.userConfig[input.key];
  if (userValue !== undefined) {
    return { value: userValue as T, source: 'user' };
  }
  return { value: input.defaultValue, source: 'default' };
}

function resolveMediaDefaults(
  userConfig: UnifiedConfig,
  runtime: EffectiveAgentRuntimeOverrides | undefined,
): {
  readonly values: Partial<Record<MediaModelType, string>>;
  readonly sources: Partial<Record<MediaModelType, EffectiveAgentConfigValueSource>>;
} {
  const values: Partial<Record<MediaModelType, string>> = {};
  const sources: Partial<Record<MediaModelType, EffectiveAgentConfigValueSource>> = {};
  for (const type of MEDIA_MODEL_TYPES) {
    const runtimeValue = runtime?.defaultMediaModels?.[type];
    const userValue = userConfig.defaultModels?.[type];
    if (runtimeValue) {
      values[type] = runtimeValue;
      sources[type] = 'runtime';
    } else if (userValue) {
      values[type] = toModelOptionId(userValue);
      sources[type] = 'user';
    }
  }
  return { values, sources };
}

function validateProviderModelSelection(input: {
  readonly userConfigReadResult: ConfigReadResult | null | undefined;
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
    return [buildAssistantConfigAvailabilityDiagnostic('missingProviderEndpoint', filePath)];
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
  readonly providerSelection: ConfigValue<string | null>;
  readonly modelSelection: ConfigValue<string | null>;
}): string {
  return input.userConfigReadResult?.filePath ?? '<agent-config>';
}

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
