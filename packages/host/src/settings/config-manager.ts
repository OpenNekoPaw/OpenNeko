/**
 * Configuration Manager
 *
 * Providers/models: user config only (~/.neko/config.toml).
 * MCP servers: user configuration only.
 */

import type { Provider, Model } from './types/provider';
import type { RetryTimeoutPreset, BuiltinPresetName } from './types/error';
import type { MCPServerPreset } from './types/config';
import type {
  ChatModelOption,
  MediaModelType,
  ModelRefConfig,
  ModelType,
} from '@neko/ai-contracts';
import type { ProviderDefinition, UnifiedConfig } from './config-core/index';
import { DEFAULT_CONFIG, DEFAULT_EXTENSION_CONFIG } from './config-core/index';
import { type ConfigReadResult } from './config-reader';
import { type UserConfig, type IUserConfigManager } from './user-config';
import { RETRY_TIMEOUT_PRESETS } from './retry-timeout-presets';
import { ChatModelService } from './chat-model-service';
import {
  ConfigExportService,
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config-export-service';
import {
  buildAssistantConfiguredProviderViews,
  buildAssistantConfigState,
  buildAssistantProviderViews,
  buildAssistantRuntimeSettingsSnapshot,
  buildAssistantSettingsSnapshot,
  buildDefaultMediaModelOptionIds,
  mapWebviewSettingsToAssistantSettings,
  selectAssistantDefaultProvider,
  selectAssistantProvider,
  type AssistantConfigState,
  type AssistantConfiguredProviderView,
  type AssistantProviderSelection,
  type AssistantProviderView,
  type AssistantRuntimeSettingsSnapshot,
  type AssistantSettingsData,
  type AssistantSettingsSnapshot,
  type MediaUnderstandingCategory,
  type MediaUnderstandingModelStatus,
  type MediaUnderstandingModels,
  type MediaUnderstandingPurpose,
} from './assistant-config';
import {
  buildAssistantConfigAvailabilityDiagnostic,
  buildConfigUnavailableMessage,
  projectAssistantConfigReadResultDiagnostic,
  type AssistantConfigDiagnostic,
} from './config-diagnostic';
import {
  isAgentModelPurpose,
  modelSupportsPurpose,
  type AgentModelPurpose,
} from './model-purpose-registry';
import {
  buildAssistantStatusBarPresentation,
  type AssistantGenerationModelSelection,
  type AssistantStatusBarPresentation,
} from './assistant-status-bar';
import {
  resolveEffectiveAgentWorkspaceConfigSnapshot,
  type EffectiveAgentRuntimeOverrides,
  type EffectiveAgentWorkspaceConfigSnapshot,
} from './effective-agent-config';
import { isProviderConfigured } from './provider-configuration';
import {
  resolveAiProviderSources,
  type AiProviderSourceProjection,
} from './ai-provider-source-resolver';
import type { AssistantRuntimeSettingsPort } from './assistant-runtime-settings-port';

/**
 * Merged configuration
 */
export interface MergedConfig {
  providers: Map<string, Provider>;
  models: Map<string, Model>;
  retryTimeoutPresets: Map<string, RetryTimeoutPreset>;
  mcpServers: Map<string, MCPServerPreset>;
}

/**
 * Configuration manager options
 */
export interface ConfigManagerOptions {
  userConfigManager?: IUserConfigManager;
  workspacePath?: string;
  assistantRuntimeSettings?: AssistantRuntimeSettingsPort;
}

/**
 * ConfigManager - Unified configuration management
 *
 * - Providers/Models: user config only (~/.neko/config.toml)
 * - MCP Servers: user configuration only
 */
export class ConfigManager {
  private userConfigManager: IUserConfigManager | null = null;
  private userConfigReadResult: ConfigReadResult | null = null;
  private configDiagnostic: AssistantConfigDiagnostic | undefined;
  private workspacePath: string | null = null;
  private configMerged = false;
  private cachedConfig: MergedConfig | null = null;
  private readonly assistantRuntimeSettings: AssistantRuntimeSettingsPort | undefined;

  // Merged data
  private providers: Map<string, Provider> = new Map();
  private models: Map<string, Model> = new Map();
  private mcpServers: Map<string, MCPServerPreset> = new Map();

  // Specialized services
  private readonly chatModelService = new ChatModelService();
  private readonly configExportService = new ConfigExportService();

  constructor(options: ConfigManagerOptions = {}) {
    this.userConfigManager = options.userConfigManager ?? null;
    this.assistantRuntimeSettings = options.assistantRuntimeSettings;

    if (options.workspacePath) {
      this.workspacePath = options.workspacePath;
    }

    this.reloadConfig();
  }

  /**
   * Get merged configuration
   */
  getConfig(): MergedConfig {
    this.ensureMerged();
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    this.cachedConfig = {
      providers: new Map(this.providers),
      models: new Map(this.models),
      retryTimeoutPresets: new Map(Object.entries(RETRY_TIMEOUT_PRESETS)),
      mcpServers: new Map(this.mcpServers),
    };
    return this.cachedConfig;
  }

  /**
   * Get user configuration (for extension layer)
   */
  getUserConfig(): UserConfig {
    return (
      this.userConfigManager?.load() ?? {
        providers: [],
        models: [],
        mcpServers: [],
      }
    );
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  getProvider(id: string): Provider | undefined {
    this.ensureMerged();
    return this.providers.get(id);
  }

  getProviders(): Provider[] {
    this.ensureMerged();
    return Array.from(this.providers.values());
  }

  getEnabledProviders(): Provider[] {
    this.ensureMerged();
    return Array.from(this.providers.values()).filter((p) => p.enabled !== false);
  }

  async setProvider(provider: ProviderDefinition): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.addProvider(provider);
    this.reloadConfig();
  }

  async removeProvider(providerId: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.removeProvider(providerId);
    this.reloadConfig();
  }

  // ==========================================================================
  // Model Methods
  // ==========================================================================

  getModel(id: string): Model | undefined {
    this.ensureMerged();
    return this.models.get(id);
  }

  getModels(): Model[] {
    this.ensureMerged();
    return Array.from(this.models.values());
  }

  getEnabledModels(): Model[] {
    this.ensureMerged();
    return Array.from(this.models.values()).filter((m) => m.enabled !== false);
  }

  getModelsByProvider(providerId: string): Model[] {
    this.ensureMerged();
    return Array.from(this.models.values()).filter((m) => m.providerId === providerId);
  }

  /**
   * Get chat model options for UI model selector
   * Returns enabled models from configured providers.
   */
  getChatModelOptions(): ChatModelOption[] {
    this.ensureMerged();
    return this.chatModelService.getChatModelOptions(
      this.getEnabledProviders(),
      this.getEnabledModels(),
    );
  }

  getAssistantStatusBarPresentation(
    generationConfig?: AssistantGenerationModelSelection,
  ): AssistantStatusBarPresentation {
    const effective = this.getEffectiveAgentWorkspaceConfigSnapshot();
    const enabledModels = this.getEnabledModels();
    const statusModels = effective.model
      ? [effective.model, ...enabledModels.filter((model) => model.id !== effective.model?.id)]
      : enabledModels;
    return buildAssistantStatusBarPresentation({
      enabledModels: statusModels,
      ...(generationConfig ? { generationConfig } : {}),
    });
  }

  getAssistantProviderViews(): AssistantProviderView[] {
    return buildAssistantProviderViews(this.getConfig());
  }

  getAssistantConfiguredProviderViews(): AssistantConfiguredProviderView[] {
    return buildAssistantConfiguredProviderViews(this.getConfig());
  }

  getAssistantConfigState(): AssistantConfigState {
    const config = this.getConfig();
    const projection = this.resolveProviderSources();
    const configDiagnostic = this.getProjectedConfigDiagnostic(projection);
    const explicitState = buildAssistantConfigState(config);
    const settings = this.getAssistantSettingsSnapshot();
    const chatModelOptions = [...projection.chatModelOptions];
    return {
      ...explicitState,
      providers: explicitState.providers,
      configuredProviders: explicitState.configuredProviders,
      selectedProviderId: settings.selectedProviderId,
      selectedModelId: settings.selectedModelId,
      customSystemPrompt: settings.customSystemPrompt,
      autoExecuteTools: settings.autoExecuteTools,
      streamResponses: settings.streamResponses,
      showToolCalls: settings.showToolCalls,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      executionMode: settings.executionMode,
      chatModelOptions,
      modelGroups: [...projection.modelGroups],
      defaultMediaModels: buildDefaultMediaModelOptionIds({
        defaultMediaModels: this.getEffectiveAgentWorkspaceConfigSnapshot().defaultMediaModels,
        chatModelOptions,
        models: config.models.values(),
      }),
      mediaUnderstandingModels: this.buildMediaUnderstandingModels(),
      ...(configDiagnostic ? { configDiagnostic } : {}),
    };
  }

  getAssistantDefaultProvider(): AssistantProviderSelection | undefined {
    const effective = this.getEffectiveAgentWorkspaceConfigSnapshot();
    if (effective.providerId) {
      return selectAssistantProvider(this.getConfig(), effective.providerId);
    }
    return selectAssistantDefaultProvider(this.getConfig());
  }

  getAssistantProvider(providerId: string): AssistantProviderSelection | undefined {
    return selectAssistantProvider(this.getConfig(), providerId);
  }

  getAssistantSettingsSnapshot(): AssistantSettingsSnapshot {
    const effective = this.getEffectiveAgentWorkspaceConfigSnapshot();
    const runtimeSettings = this.getRuntimeAssistantSettings();
    return {
      ...buildAssistantSettingsSnapshot({
        selectedProviderId: effective.providerId,
        selectedModelId: effective.modelId,
        customSystemPrompt: this.getCustomSystemPrompt(),
        autoExecuteTools: this.getAutoExecuteTools(),
        streamResponses: this.getStreamResponses(),
        showToolCalls: this.getShowToolCalls(),
        temperature: this.getTemperature(),
        maxTokens: this.getMaxTokens(),
        executionMode: this.getExecutionMode(),
      }),
      ...runtimeSettings,
      selectedProviderId: effective.providerId,
      selectedModelId: effective.modelId,
      temperature: effective.temperature,
      maxTokens: effective.maxTokens,
      executionMode: effective.executionMode,
    };
  }

  getAssistantRuntimeSettingsSnapshot(): AssistantRuntimeSettingsSnapshot {
    const effective = this.getEffectiveAgentWorkspaceConfigSnapshot();
    const runtimeSettings = this.getRuntimeAssistantSettings();
    return {
      ...buildAssistantRuntimeSettingsSnapshot({
        selectedProviderId: effective.providerId,
        selectedModelId: effective.modelId,
        customSystemPrompt: this.getCustomSystemPrompt(),
        autoExecuteTools: this.getAutoExecuteTools(),
        streamResponses: this.getStreamResponses(),
        showToolCalls: this.getShowToolCalls(),
        temperature: this.getTemperature(),
        maxTokens: this.getMaxTokens(),
        executionMode: this.getExecutionMode(),
        thinkingBudget: this.getThinkingBudget(),
      }),
      ...runtimeSettings,
      selectedProviderId: effective.providerId,
      selectedModelId: effective.modelId,
      temperature: effective.temperature,
      maxTokens: effective.maxTokens,
      executionMode: effective.executionMode,
      thinkingBudget: effective.thinkingBudget,
    };
  }

  getEffectiveAgentWorkspaceConfigSnapshot(
    runtimeOverrides: EffectiveAgentRuntimeOverrides = {},
  ): EffectiveAgentWorkspaceConfigSnapshot {
    const config = this.getConfig();
    const runtimeSettings = this.getRuntimeAssistantSettings();
    return resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: this.userConfigReadResult,
      providers: [...config.providers.values()],
      models: [...config.models.values()],
      mcpServers: [...config.mcpServers.values()],
      runtimeOverrides: {
        ...projectRuntimeAssistantSettingsOverrides(runtimeSettings),
        ...runtimeOverrides,
      },
    });
  }

  getAssistantSettingsData(): AssistantSettingsData {
    const config = this.getConfig();
    const providerSourceProjection = this.resolveProviderSources();
    const chatModelOptions = [...providerSourceProjection.chatModelOptions];
    const explicitState = buildAssistantConfigState(config);
    const localReadDiagnostic = this.userConfigReadResult
      ? projectAssistantConfigReadResultDiagnostic(this.userConfigReadResult)
      : undefined;
    const settingsDiagnostic =
      providerSourceProjection.explicitAiConfig.invalidDiagnostic ??
      localReadDiagnostic ??
      (this.isBlockingConfigReadDiagnostic(this.configDiagnostic)
        ? this.configDiagnostic
        : undefined);
    return {
      ...this.getAssistantSettingsSnapshot(),
      ...explicitState,
      modelGroups: [...providerSourceProjection.modelGroups],
      chatModelOptions,
      defaultMediaModels: buildDefaultMediaModelOptionIds({
        defaultMediaModels: this.getEffectiveAgentWorkspaceConfigSnapshot().defaultMediaModels,
        chatModelOptions,
        models: config.models.values(),
      }),
      mediaUnderstandingModels: this.buildMediaUnderstandingModels(),
      ...(settingsDiagnostic ? { configDiagnostic: settingsDiagnostic } : {}),
    };
  }

  async setModel(model: Model): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.addModel(model);
    this.reloadConfig();
  }

  async removeModel(modelId: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.removeModel(modelId);
    this.reloadConfig();
  }

  // ==========================================================================
  // MCP Server Methods
  // ==========================================================================

  getMCPServer(id: string): MCPServerPreset | undefined {
    this.ensureMerged();
    return this.mcpServers.get(id);
  }

  getMCPServers(): MCPServerPreset[] {
    this.ensureMerged();
    return Array.from(this.mcpServers.values());
  }

  getEnabledMCPServers(): MCPServerPreset[] {
    this.ensureMerged();
    return Array.from(this.mcpServers.values()).filter((s) => s.enabled !== false);
  }

  async setMCPServer(server: MCPServerPreset): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.addMCPServer(server);
    this.reloadConfig();
  }

  async removeMCPServer(serverId: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.removeMCPServer(serverId);
    this.reloadConfig();
  }

  // ==========================================================================
  // Scalar Config Methods (read/write ~/.neko/config.toml scalars)
  // ==========================================================================

  /** Read a scalar field from config.toml with default fallback */
  getScalar<K extends keyof UnifiedConfig>(key: K): NonNullable<UnifiedConfig[K]> | undefined {
    const raw = this.getRawUserConfigSnapshot();
    return (raw?.[key] as NonNullable<UnifiedConfig[K]>) ?? undefined;
  }

  getDefaultMediaModels(): Partial<Record<MediaModelType, string>> {
    return this.getMediaDefaultModelOptionIdsFromConfig();
  }

  getDefaultModelRef(type: ModelType): ModelRefConfig | undefined {
    const defaults = this.getScalar('defaultModels') ?? {};
    return defaults[type];
  }

  getDefaultModelPurposeRef(purpose: string): ModelRefConfig | undefined {
    return this.getScalar('defaultModelPurposes')?.[purpose];
  }

  resolveModelRefForPurpose(purpose: string): ModelRefConfig | undefined {
    return this.getDefaultModelPurposeRef(purpose);
  }

  async setDefaultModelPurposeRefs(
    updates: Readonly<Partial<Record<AgentModelPurpose, ModelRefConfig>>>,
  ): Promise<void> {
    const entries = Object.entries(updates);
    if (entries.length === 0) {
      throw new Error('At least one explicit model purpose binding is required.');
    }

    this.ensureUserConfigManager();
    this.ensureMerged();
    for (const [purpose, ref] of entries) {
      if (!isAgentModelPurpose(purpose)) {
        throw new Error(`Unknown model purpose: ${purpose}.`);
      }
      if (!ref) {
        throw new Error(`Model purpose ${purpose} requires an exact provider/model reference.`);
      }
      const provider = this.providers.get(ref.providerId);
      const model = this.models.get(ref.modelId);
      if (!provider || provider.enabled === false) {
        throw new Error(`Provider ${ref.providerId} is unavailable for purpose ${purpose}.`);
      }
      if (!model || model.enabled === false) {
        throw new Error(
          `Model ${ref.providerId}/${ref.modelId} is unavailable for purpose ${purpose}.`,
        );
      }
      if (model.providerId !== provider.id) {
        throw new Error(
          `Model ${model.id} belongs to provider ${model.providerId}, not ${provider.id}.`,
        );
      }
      if (!modelSupportsPurpose(model, purpose)) {
        throw new Error(`Model ${provider.id}/${model.id} does not support purpose ${purpose}.`);
      }
    }

    await this.userConfigManager!.updateScalars({
      defaultModelPurposes: {
        ...(this.getScalar('defaultModelPurposes') ?? {}),
        ...updates,
      },
    });
    this.reloadConfig();
  }

  getTemperature(): number {
    return this.getScalar('temperature') ?? DEFAULT_CONFIG.temperature;
  }

  getMaxTokens(): number {
    return this.getScalar('maxTokens') ?? DEFAULT_CONFIG.maxTokens;
  }

  getThinkingBudget(): number {
    return this.getScalar('thinkingBudget') ?? DEFAULT_EXTENSION_CONFIG.thinkingBudget;
  }

  getExecutionMode(): 'plan' | 'ask' | 'auto' {
    return this.getScalar('executionMode') ?? DEFAULT_EXTENSION_CONFIG.executionMode;
  }

  getAutoExecuteTools(): boolean {
    return this.getScalar('autoExecuteTools') ?? DEFAULT_EXTENSION_CONFIG.autoExecuteTools;
  }

  getCustomSystemPrompt(): string {
    return this.getScalar('customSystemPrompt') ?? DEFAULT_EXTENSION_CONFIG.customSystemPrompt;
  }

  getStreamResponses(): boolean {
    return this.getScalar('streamResponses') ?? DEFAULT_EXTENSION_CONFIG.streamResponses;
  }

  getShowToolCalls(): boolean {
    return this.getScalar('showToolCalls') ?? DEFAULT_EXTENSION_CONFIG.showToolCalls;
  }

  /** Write a single scalar field to config.toml */
  async setScalar<K extends keyof UnifiedConfig>(key: K, value: UnifiedConfig[K]): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateScalar(key, value);
    this.reloadConfig();
  }

  /** Write multiple scalar fields to config.toml */
  async setScalars(updates: Partial<UnifiedConfig>): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateScalars(updates);
    this.reloadConfig();
  }

  async setAssistantSettings(updates: Partial<AssistantSettingsSnapshot>): Promise<void> {
    const authority = this.requireAssistantRuntimeSettings();
    await authority.commit({ ...authority.snapshot(), ...updates });
  }

  async applyRuntimeAssistantSettingsFromWebview(settings: Record<string, unknown>): Promise<void> {
    const updates = mapWebviewSettingsToAssistantSettings(settings);
    const authority = this.requireAssistantRuntimeSettings();
    const current = authority.snapshot();
    if (isClearingRuntimeModelSelection(settings)) {
      const next = { ...current, ...updates };
      delete next.selectedProviderId;
      delete next.selectedModelId;
      await authority.commit(next);
      return;
    }
    await authority.commit({ ...current, ...updates });
  }

  async resetAssistantSettings(): Promise<void> {
    if (!this.assistantRuntimeSettings) {
      throw new Error('Agent runtime settings authority is unavailable.');
    }
    await this.assistantRuntimeSettings.reset();
  }

  // ==========================================================================
  // Retry/Timeout Preset Methods
  // ==========================================================================

  getRetryTimeoutPreset(name: BuiltinPresetName): RetryTimeoutPreset | undefined {
    return RETRY_TIMEOUT_PRESETS[name];
  }

  // ==========================================================================
  // Import/Export Methods
  // ==========================================================================

  exportConfig(): ConfigExportData {
    const config = this.getConfig();
    return this.configExportService.exportConfig(config.providers, config.models);
  }

  async importConfig(data: ConfigExportData): Promise<ConfigImportResult> {
    return this.configExportService.importConfig(data, this);
  }

  async addCustomProvider(config: CustomProviderConfig): Promise<ConfigImportResult> {
    return this.configExportService.addCustomProvider(config, this);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  reloadConfig(): void {
    this.userConfigManager?.reload?.();
    this.userConfigReadResult = this.readUserConfigSnapshot();
    this.invalidateCache();
    this.configDiagnostic = this.buildConfigDiagnostic();
  }

  dispose(): void {
    this.configMerged = false;
    this.cachedConfig = null;
  }

  getConfigDiagnostic(): AssistantConfigDiagnostic | undefined {
    return this.configDiagnostic;
  }

  assertConfigAvailable(): void {
    const readDiagnostic = this.userConfigReadResult
      ? projectAssistantConfigReadResultDiagnostic(this.userConfigReadResult)
      : undefined;
    if (readDiagnostic && this.isBlockingConfigReadDiagnostic(readDiagnostic)) {
      throw new Error(buildConfigUnavailableMessage(readDiagnostic));
    }
    const availabilityDiagnostic = this.buildAssistantAvailabilityDiagnostic();
    if (availabilityDiagnostic) {
      throw new Error(buildConfigUnavailableMessage(availabilityDiagnostic));
    }
    const effectiveDiagnostic = this.getEffectiveAgentWorkspaceConfigSnapshot().blockingDiagnostic;
    if (effectiveDiagnostic) {
      throw new Error(buildConfigUnavailableMessage(effectiveDiagnostic));
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private invalidateCache(): void {
    this.configMerged = false;
    this.cachedConfig = null;
  }

  private ensureUserConfigManager(): void {
    if (!this.userConfigManager) {
      throw new Error('User config storage not available');
    }
  }

  private readUserConfigSnapshot(): ConfigReadResult {
    if (!this.userConfigManager) throw new Error('User config storage not available');
    return this.userConfigManager.loadRawResult();
  }

  private getRawUserConfigSnapshot(): UnifiedConfig | undefined {
    const result = this.userConfigReadResult ?? this.readUserConfigSnapshot();
    return result.status === 'ok' ? result.config : undefined;
  }

  private getMediaDefaultModelOptionIdsFromConfig(): Partial<Record<MediaModelType, string>> {
    const defaults = this.getScalar('defaultModels') ?? {};
    return removeUndefinedRecord({
      image: defaults.image ? toModelOptionId(defaults.image) : undefined,
      video: defaults.video ? toModelOptionId(defaults.video) : undefined,
      audio: defaults.audio ? toModelOptionId(defaults.audio) : undefined,
    });
  }

  private buildMediaUnderstandingModels(): MediaUnderstandingModels {
    return {
      image: this.buildMediaUnderstandingModelStatus('image', 'image.understand'),
      audio: this.buildMediaUnderstandingModelStatus('audio', 'audio.understand'),
      video: this.buildMediaUnderstandingModelStatus('video', 'video.understand'),
    };
  }

  private buildMediaUnderstandingModelStatus(
    category: MediaUnderstandingCategory,
    purpose: MediaUnderstandingPurpose,
  ): MediaUnderstandingModelStatus {
    const resolvedRef = this.resolveModelRefForPurpose(purpose);

    if (!resolvedRef) {
      return { category, purpose, status: 'missing' };
    }

    this.ensureMerged();
    const provider = this.providers.get(resolvedRef.providerId);
    const model = this.models.get(resolvedRef.modelId);
    const providerLabel = provider
      ? provider.displayName || provider.name || provider.id
      : undefined;
    const modelLabel = model ? model.displayName || model.name || model.id : undefined;
    const status: MediaUnderstandingModelStatus = {
      category,
      purpose,
      status: 'configured',
      providerId: resolvedRef.providerId,
      modelId: resolvedRef.modelId,
      optionId: toModelOptionId(resolvedRef),
      source: 'explicit-config',
    };
    if (providerLabel && modelLabel) {
      status.label = `${providerLabel} / ${modelLabel}`;
    } else if (modelLabel) {
      status.label = modelLabel;
    }
    if (providerLabel) {
      status.providerLabel = providerLabel;
    }
    return status;
  }

  private resolveProviderSources(): AiProviderSourceProjection {
    this.ensureMerged();
    return resolveAiProviderSources({
      providers: Array.from(this.providers.values()),
      models: Array.from(this.models.values()),
      userConfigReadResult: this.userConfigReadResult,
      configDiagnostic: this.configDiagnostic,
    });
  }

  private getProjectedConfigDiagnostic(
    projection: AiProviderSourceProjection,
  ): AssistantConfigDiagnostic | undefined {
    if (projection.explicitAiConfig.invalidDiagnostic) {
      return projection.explicitAiConfig.invalidDiagnostic;
    }
    if (this.isBlockingConfigReadDiagnostic(this.configDiagnostic)) {
      return this.configDiagnostic;
    }
    return this.configDiagnostic;
  }

  private isBlockingConfigReadDiagnostic(
    diagnostic?: AssistantConfigDiagnostic,
  ): diagnostic is AssistantConfigDiagnostic {
    return (
      diagnostic?.code === 'empty' ||
      diagnostic?.code === 'invalidToml' ||
      diagnostic?.code === 'invalidDefaultProvider' ||
      diagnostic?.code === 'invalidDefaultModel' ||
      diagnostic?.code === 'invalidDefaultModelBinding' ||
      diagnostic?.code === 'readError'
    );
  }

  private buildConfigDiagnostic(): AssistantConfigDiagnostic | undefined {
    const userDiagnostic = this.userConfigReadResult
      ? projectAssistantConfigReadResultDiagnostic(this.userConfigReadResult)
      : undefined;
    if (userDiagnostic) return userDiagnostic;

    const availabilityDiagnostic = this.buildAssistantAvailabilityDiagnostic();
    if (availabilityDiagnostic) return availabilityDiagnostic;

    const bindingDiagnostic = this.validateDefaultModelBindings();
    if (bindingDiagnostic) return bindingDiagnostic;

    return this.getEffectiveAgentWorkspaceConfigSnapshot().blockingDiagnostic;
  }

  private buildAssistantAvailabilityDiagnostic(): AssistantConfigDiagnostic | undefined {
    const userConfigResult = this.userConfigReadResult ?? this.readUserConfigSnapshot();
    if (userConfigResult.status === 'missing') {
      return buildAssistantConfigAvailabilityDiagnostic('missingConfig', userConfigResult.filePath);
    }
    if (userConfigResult.status !== 'ok') return undefined;

    this.ensureMerged();
    const filePath = userConfigResult.filePath;
    const enabledProviders = Array.from(this.providers.values()).filter(
      (provider) => provider.enabled !== false,
    );
    if (enabledProviders.length === 0) {
      return buildAssistantConfigAvailabilityDiagnostic('missingProvider', filePath);
    }

    const enabledChatModels = Array.from(this.models.values()).filter(
      (model) => model.enabled !== false && modelSupportsPurpose(model, 'llm.chat'),
    );
    if (enabledChatModels.length === 0) {
      return buildAssistantConfigAvailabilityDiagnostic('missingModel', filePath);
    }

    const configuredProviders = new Set(
      enabledProviders
        .filter((provider) => isProviderConfigured(provider))
        .map((provider) => provider.id),
    );
    const hasConfiguredChatModel = enabledChatModels.some((model) =>
      configuredProviders.has(model.providerId),
    );
    return hasConfiguredChatModel
      ? undefined
      : buildAssistantConfigAvailabilityDiagnostic('missingProviderEndpoint', filePath);
  }

  private validateDefaultModelBindings(): AssistantConfigDiagnostic | undefined {
    const result = this.userConfigReadResult ?? this.readUserConfigSnapshot();
    if (result.status !== 'ok') return undefined;

    const defaults = result.config.defaultModels ?? {};
    for (const [type, ref] of Object.entries(defaults)) {
      if (!ref) continue;
      const provider = this.providers.get(ref.providerId);
      const model = this.models.get(ref.modelId);
      if (
        !provider ||
        provider.enabled === false ||
        !isProviderConfigured(provider) ||
        !model ||
        model.enabled === false ||
        model.providerId !== provider.id ||
        (model.type ?? 'llm') !== type
      ) {
        return buildAssistantConfigAvailabilityDiagnostic(
          'invalidDefaultModelBinding',
          result.filePath,
          `default_models.${type}`,
        );
      }
    }

    const purposeDefaults = result.config.defaultModelPurposes ?? {};
    for (const [purpose, ref] of Object.entries(purposeDefaults)) {
      if (!ref) continue;
      const provider = this.providers.get(ref.providerId);
      const model = this.models.get(ref.modelId);
      if (
        !provider ||
        provider.enabled === false ||
        !isProviderConfigured(provider) ||
        !model ||
        model.enabled === false ||
        model.providerId !== provider.id ||
        !modelSupportsPurpose(model, purpose)
      ) {
        return buildAssistantConfigAvailabilityDiagnostic(
          'invalidDefaultModelBinding',
          result.filePath,
          `default_model_purposes.${purpose}`,
        );
      }
    }
    return undefined;
  }

  private getRuntimeAssistantSettings(): Readonly<Partial<AssistantSettingsSnapshot>> {
    return this.assistantRuntimeSettings?.snapshot() ?? {};
  }

  private requireAssistantRuntimeSettings(): AssistantRuntimeSettingsPort {
    if (!this.assistantRuntimeSettings) {
      throw new Error('Agent runtime settings authority is unavailable.');
    }
    const diagnostic = this.assistantRuntimeSettings.diagnostic();
    if (diagnostic) throw new Error(diagnostic.message);
    return this.assistantRuntimeSettings;
  }

  /**
   * Project user configuration into flat runtime maps.
   *
   * - Providers/Models: user config only (no workspace layer)
   * - MCP Servers: user configuration only
   */
  private ensureMerged(): void {
    if (this.configMerged) {
      return;
    }

    const userConfigResult = this.userConfigReadResult ?? this.readUserConfigSnapshot();
    const userConfig = userConfigResult.status === 'ok' ? userConfigResult.config : undefined;

    // --- Providers (user only) ---
    this.providers.clear();
    if (userConfigResult.status === 'ok') {
      this.mergeArrayToMap(this.providers, userConfig?.providers as Provider[] | undefined);
    }

    // --- Models (user only) ---
    this.models.clear();
    if (userConfigResult.status === 'ok') {
      this.mergeArrayToMap(this.models, userConfig?.models as Model[] | undefined);
    }

    // --- MCP Servers (user only) ---
    this.mcpServers.clear();
    if (userConfigResult.status === 'ok') {
      this.mergeArrayToMap(
        this.mcpServers,
        userConfig?.mcpServers as MCPServerPreset[] | undefined,
      );
    }
    // Substitute workspace path in MCP server configurations
    this.substituteMCPWorkspacePath();

    this.configMerged = true;
  }

  /**
   * Merge an array of items into a Map by id.
   * Items with existing ids are fully replaced.
   */
  private mergeArrayToMap<T extends { id: string }>(target: Map<string, T>, items?: T[]): void {
    if (!items) return;
    for (const item of items) {
      target.set(item.id, { ...item });
    }
  }

  /**
   * Substitute ${workspaceFolder} placeholder in MCP server configurations.
   */
  private substituteMCPWorkspacePath(): void {
    if (!this.workspacePath) return;

    this.mcpServers.forEach((server, id) => {
      if (!server.args) return;
      const updatedArgs = server.args.map((arg) =>
        arg.replace(/\$\{workspaceFolder\}/g, this.workspacePath!),
      );
      this.mcpServers.set(id, { ...server, args: updatedArgs });
    });
  }
}

function isClearingRuntimeModelSelection(settings: Record<string, unknown>): boolean {
  return (
    'providerId' in settings &&
    'modelId' in settings &&
    settings.providerId == null &&
    settings.modelId == null
  );
}

function projectRuntimeAssistantSettingsOverrides(
  settings: Partial<AssistantSettingsSnapshot>,
): EffectiveAgentRuntimeOverrides {
  const overrides: MutableEffectiveAgentRuntimeOverrides = {};
  if ('selectedProviderId' in settings) {
    overrides.selectedProviderId = settings.selectedProviderId ?? null;
  }
  if ('selectedModelId' in settings) {
    overrides.selectedModelId = settings.selectedModelId ?? null;
  }
  if (settings.temperature !== undefined) {
    overrides.temperature = settings.temperature;
  }
  if (settings.maxTokens !== undefined) {
    overrides.maxTokens = settings.maxTokens;
  }
  if (settings.executionMode !== undefined) {
    overrides.executionMode = settings.executionMode;
  }
  return overrides;
}

type MutableEffectiveAgentRuntimeOverrides = {
  -readonly [K in keyof EffectiveAgentRuntimeOverrides]: EffectiveAgentRuntimeOverrides[K];
};

function toModelOptionId(ref: ModelRefConfig): string {
  return `${ref.providerId}:${ref.modelId}`;
}

function removeUndefinedRecord<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
