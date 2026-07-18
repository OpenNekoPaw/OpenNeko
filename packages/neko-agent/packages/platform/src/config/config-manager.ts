/**
 * Configuration Manager
 *
 * Providers/models: user config only (~/.neko/config.toml).
 * MCP servers: user + workspace merge (.neko/config.toml overrides by id).
 */

import type { Provider, Model } from '../types/provider';
import type { RetryTimeoutPreset, BuiltinPresetName } from '../types/error';
import type { MCPServerPreset } from '../types/config';
import type {
  ChatModelOption,
  GenerationModelConfig,
  MediaModelType,
  ModelRefConfig,
  ModelType,
  UnifiedConfig,
} from '@neko/shared';
import { DEFAULT_CONFIG, DEFAULT_EXTENSION_CONFIG } from '@neko/shared';
import {
  readUserConfigResult,
  readWorkspaceConfigResult,
  type ConfigReadResult,
} from '@neko/shared/config/config-reader';
import { type UserConfig, type IUserConfigManager } from './user-config';
import { loadWorkspaceConfigResult, type WorkspaceConfig } from './workspace-config';
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
  mapWebviewSettingsToUnifiedScalars,
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
import { modelSupportsPurpose } from './model-purpose-registry';
import {
  buildAssistantStatusBarPresentation,
  type AssistantStatusBarPresentation,
} from './assistant-status-bar';
import {
  resolveEffectiveAgentWorkspaceConfigSnapshot,
  type EffectiveAgentRuntimeOverrides,
  type EffectiveAgentWorkspaceConfigSnapshot,
} from './effective-agent-config';
import {
  buildProviderCredentialImports,
  type ProviderCredentialImportApplyResult,
  type ProviderCredentialImport,
} from './config-file-import';
import { isProviderConfigured } from './provider-configuration';
import {
  resolveAiProviderSources,
  type AiProviderSourceProjection,
} from './ai-provider-source-resolver';

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
}

/**
 * ConfigManager - Unified configuration management
 *
 * - Providers/Models: user config only (~/.neko/config.toml)
 * - MCP Servers: user + workspace merge (workspace overrides by id)
 */
export class ConfigManager {
  private userConfigManager: IUserConfigManager | null = null;
  private workspaceConfig: WorkspaceConfig | null = null;
  private userConfigReadResult: ConfigReadResult | null = null;
  private workspaceConfigReadResult: ConfigReadResult | null = null;
  private configDiagnostic: AssistantConfigDiagnostic | undefined;
  private workspacePath: string | null = null;
  private configMerged = false;
  private cachedConfig: MergedConfig | null = null;
  /** Runtime-only media model overrides (not persisted to disk) */
  private runtimeMediaDefaults: Partial<Record<MediaModelType, string>> = {};
  /** Runtime-only assistant settings from Webview controls (not persisted to disk). */
  private runtimeAssistantSettings: Partial<AssistantSettingsSnapshot> = {};

  // Merged data
  private providers: Map<string, Provider> = new Map();
  private models: Map<string, Model> = new Map();
  private mcpServers: Map<string, MCPServerPreset> = new Map();

  // Specialized services
  private readonly chatModelService = new ChatModelService();
  private readonly configExportService = new ConfigExportService();

  constructor(options: ConfigManagerOptions = {}) {
    this.userConfigManager = options.userConfigManager ?? null;

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
        providerOverrides: {},
        modelOverrides: {},
        mcpServerOverrides: {},
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

  async setProvider(provider: Provider): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.addProvider(provider);
    this.reloadConfig();
  }

  async removeProvider(providerId: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.removeProvider(providerId);
    this.reloadConfig();
  }

  async setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateProviderOverride(providerId, {
      apiKey,
    } as Partial<Provider>);
    this.reloadConfig();
  }

  async updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateProviderOverride(providerId, override);
    this.reloadConfig();
  }

  /**
   * Apply a runtime-only override to a provider (not persisted to disk).
   * Useful for injecting env var API keys without modifying config files.
   */
  setRuntimeProviderOverride(providerId: string, override: Partial<Provider>): void {
    this.ensureMerged();
    const existing = this.providers.get(providerId);
    if (existing) {
      this.providers.set(providerId, { ...existing, ...override });
      this.cachedConfig = null; // invalidate cached snapshot only
      this.configDiagnostic = this.buildConfigDiagnostic();
    }
  }

  async removeProviderOverride(providerId: string): Promise<void> {
    this.ensureUserConfigManager();
    const config = this.getUserConfig();
    delete config.providerOverrides[providerId];
    await this.userConfigManager!.save(config);
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
    generationConfig?: GenerationModelConfig,
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
    return {
      ...buildAssistantSettingsSnapshot({
        defaultProvider: this.getAssistantDefaultProviderScalarForSettings(),
        defaultModel: this.getAssistantDefaultModelScalarForSettings(),
        customSystemPrompt: this.getCustomSystemPrompt(),
        autoExecuteTools: this.getAutoExecuteTools(),
        streamResponses: this.getStreamResponses(),
        showToolCalls: this.getShowToolCalls(),
        temperature: this.getTemperature(),
        maxTokens: this.getMaxTokens(),
        executionMode: this.getExecutionMode(),
      }),
      ...this.runtimeAssistantSettings,
      selectedProviderId: effective.providerId,
      selectedModelId: effective.modelId,
      temperature: effective.temperature,
      maxTokens: effective.maxTokens,
      executionMode: effective.executionMode,
    };
  }

  getAssistantRuntimeSettingsSnapshot(): AssistantRuntimeSettingsSnapshot {
    const effective = this.getEffectiveAgentWorkspaceConfigSnapshot();
    return {
      ...buildAssistantRuntimeSettingsSnapshot({
        defaultProvider: this.getAssistantDefaultProviderScalarForSettings(),
        defaultModel: this.getAssistantDefaultModelScalarForSettings(),
        customSystemPrompt: this.getCustomSystemPrompt(),
        autoExecuteTools: this.getAutoExecuteTools(),
        streamResponses: this.getStreamResponses(),
        showToolCalls: this.getShowToolCalls(),
        temperature: this.getTemperature(),
        maxTokens: this.getMaxTokens(),
        executionMode: this.getExecutionMode(),
        thinkingBudget: this.getThinkingBudget(),
      }),
      ...this.runtimeAssistantSettings,
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
    return resolveEffectiveAgentWorkspaceConfigSnapshot({
      userConfigReadResult: this.userConfigReadResult,
      workspaceConfigReadResult: this.workspaceConfigReadResult,
      providers: [...config.providers.values()],
      models: [...config.models.values()],
      mcpServers: [...config.mcpServers.values()],
      runtimeOverrides: {
        ...projectRuntimeAssistantSettingsOverrides(this.runtimeAssistantSettings),
        ...runtimeOverrides,
      },
    });
  }

  getAssistantSettingsData(): AssistantSettingsData {
    const config = this.getConfig();
    const providerSourceProjection = this.resolveProviderSources();
    const chatModelOptions = [...providerSourceProjection.chatModelOptions];
    const explicitState = buildAssistantConfigState(config);
    const settingsDiagnostic =
      providerSourceProjection.explicitAiConfig.invalidDiagnostic ??
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

  async updateModelOverride(modelId: string, override: Partial<Model>): Promise<void> {
    this.ensureUserConfigManager();
    const config = this.getUserConfig();
    config.modelOverrides[modelId] = {
      ...config.modelOverrides[modelId],
      ...override,
    };
    await this.userConfigManager!.save(config);
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

  async updateMCPServerOverride(
    serverId: string,
    override: Partial<MCPServerPreset>,
  ): Promise<void> {
    this.ensureUserConfigManager();
    await this.userConfigManager!.updateMCPServerOverride(serverId, override);
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

  getDefaultProviderScalar(): string {
    return this.getScalar('defaultProvider') ?? DEFAULT_CONFIG.defaultProvider;
  }

  getDefaultModelScalar(): string {
    return this.getScalar('defaultModel') ?? DEFAULT_CONFIG.defaultModel;
  }

  getDefaultMediaModels(): Partial<Record<MediaModelType, string>> {
    const fromConfig = this.getMediaDefaultModelOptionIdsFromConfig();
    // Runtime overrides take priority over config-file defaults (not persisted)
    return { ...fromConfig, ...this.runtimeMediaDefaults };
  }

  getDefaultModelRef(type: ModelType): ModelRefConfig | undefined {
    const defaults = this.getScalar('defaultModels') ?? {};
    if (type === 'llm') {
      const configured = defaults.llm;
      if (configured) return configured;
      const providerId = this.getExplicitDefaultProviderScalar();
      const modelId = this.getExplicitDefaultModelScalar();
      return providerId && modelId ? { providerId, modelId } : undefined;
    }
    return defaults[type];
  }

  getDefaultModelPurposeRef(purpose: string): ModelRefConfig | undefined {
    return this.getScalar('defaultModelPurposes')?.[purpose];
  }

  resolveModelRefForPurpose(purpose: string): ModelRefConfig | undefined {
    return this.getDefaultModelPurposeRef(purpose);
  }

  /**
   * Apply runtime-only media model defaults for the current session.
   * These override config-file defaults but are never written to disk.
   * Pass empty overrides to clear all per-category session overrides.
   */
  setRuntimeMediaDefaults(overrides: Partial<Record<MediaModelType, string>>): void {
    this.runtimeMediaDefaults = { ...overrides };
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
    this.setRuntimeAssistantSettings(updates);
  }

  async applyRuntimeAssistantSettingsFromWebview(settings: Record<string, unknown>): Promise<void> {
    const updates = this.mapUnifiedScalarsToAssistantSettings(
      mapWebviewSettingsToUnifiedScalars(settings),
    );
    if (isClearingRuntimeModelSelection(settings)) {
      const updatesWithoutModelSelection = { ...updates };
      delete updatesWithoutModelSelection.selectedProviderId;
      delete updatesWithoutModelSelection.selectedModelId;
      this.clearRuntimeAssistantModelSelection();
      this.setRuntimeAssistantSettings(updatesWithoutModelSelection);
      return;
    }
    this.setRuntimeAssistantSettings(updates);
  }

  async resetAssistantSettings(): Promise<void> {
    this.runtimeAssistantSettings = {};
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

  exportConfig(options: { includeSecrets?: boolean } = {}): ConfigExportData {
    const config = this.getConfig();
    return this.configExportService.exportConfig(config.providers, config.models, options);
  }

  async importConfig(
    data: ConfigExportData,
    options: { overwrite?: boolean; includeSecrets?: boolean } = {},
  ): Promise<ConfigImportResult> {
    return this.configExportService.importConfig(data, this, options);
  }

  async importProviderCredentialsFromUnifiedConfigs(
    configs: readonly UnifiedConfig[],
  ): Promise<ProviderCredentialImportApplyResult> {
    const imports = buildProviderCredentialImports(configs);
    const imported: ProviderCredentialImport[] = [];
    const failed: ProviderCredentialImportApplyResult['failed'] = [];

    for (const item of imports) {
      try {
        this.applyRuntimeProviderCredential(item);
        imported.push(item);
      } catch (error) {
        failed.push({ id: item.id, error });
      }
    }

    return { imported, failed };
  }

  async importProviderCredentialsFromConfigFiles(
    options: {
      readonly workspacePath?: string;
    } = {},
  ): Promise<ProviderCredentialImportApplyResult> {
    const configs: UnifiedConfig[] = [];
    const userConfig = this.userConfigReadResult ?? readUserConfigResult();
    if (userConfig.status === 'ok') {
      configs.push(userConfig.config);
    }

    const workspacePath = options.workspacePath ?? this.workspacePath ?? undefined;
    if (workspacePath) {
      const workspaceConfig =
        this.workspaceConfigReadResult ?? readWorkspaceConfigResult(workspacePath);
      if (workspaceConfig.status === 'ok') {
        configs.push(workspaceConfig.config);
      }
    }

    return this.importProviderCredentialsFromUnifiedConfigs(configs);
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
    const workspaceResult = this.workspacePath
      ? loadWorkspaceConfigResult(this.workspacePath)
      : undefined;
    this.workspaceConfigReadResult = workspaceResult?.raw ?? null;
    this.workspaceConfig = workspaceResult?.config ?? null;
    this.clearRuntimeAssistantModelSelection();
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
    if (this.configDiagnostic) {
      throw new Error(buildConfigUnavailableMessage(this.configDiagnostic));
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
    if (this.userConfigManager?.loadRawResult) {
      return this.userConfigManager.loadRawResult();
    }
    if (this.userConfigManager) {
      return {
        status: 'ok',
        filePath: '<in-memory-user-config>',
        config: this.userConfigManager.loadRaw(),
      };
    }
    throw new Error('User config storage not available');
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
      diagnostic?.code === 'unsupportedVersion' ||
      diagnostic?.code === 'duplicateProviderId' ||
      diagnostic?.code === 'duplicateModelId' ||
      diagnostic?.code === 'invalidDefaultMaxTokens' ||
      diagnostic?.code === 'invalidModelTokenMetadata' ||
      diagnostic?.code === 'unsupportedModelType' ||
      diagnostic?.code === 'unsupportedDefaultMediaModelType' ||
      diagnostic?.code === 'unsupportedDefaultModelType' ||
      diagnostic?.code === 'unsupportedDefaultModelPurpose' ||
      diagnostic?.code === 'invalidDefaultProvider' ||
      diagnostic?.code === 'invalidDefaultModel' ||
      diagnostic?.code === 'invalidDefaultModelBinding' ||
      diagnostic?.code === 'readError'
    );
  }

  private getAssistantDefaultProviderScalarForSettings(): string | null {
    if (this.userConfigReadResult?.status !== 'ok') return null;
    return (
      this.getExplicitDefaultModelRef('llm')?.providerId ??
      this.getExplicitDefaultProviderScalar() ??
      null
    );
  }

  private getAssistantDefaultModelScalarForSettings(): string | null {
    if (this.userConfigReadResult?.status !== 'ok') return null;
    return (
      this.getExplicitDefaultModelRef('llm')?.modelId ??
      this.getExplicitDefaultModelScalar() ??
      null
    );
  }

  private buildConfigDiagnostic(): AssistantConfigDiagnostic | undefined {
    const userDiagnostic = this.userConfigReadResult
      ? projectAssistantConfigReadResultDiagnostic(this.userConfigReadResult)
      : undefined;
    if (userDiagnostic) return userDiagnostic;

    const workspaceDiagnostic = this.workspaceConfigReadResult
      ? projectAssistantConfigReadResultDiagnostic(this.workspaceConfigReadResult)
      : undefined;
    if (workspaceDiagnostic) return workspaceDiagnostic;

    const availabilityDiagnostic = this.buildAssistantAvailabilityDiagnostic();
    if (availabilityDiagnostic) return availabilityDiagnostic;

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

    const explicitDefaultLlmModelRef = this.getExplicitDefaultModelRef('llm');
    const explicitDefaultProvider =
      explicitDefaultLlmModelRef?.providerId ?? this.getExplicitDefaultProviderScalar();
    const explicitDefaultModel =
      explicitDefaultLlmModelRef?.modelId ?? this.getExplicitDefaultModelScalar();
    const defaultModelBindingDiagnostic = this.validateDefaultModelBindings(
      filePath,
      userConfigResult.config,
    );
    if (defaultModelBindingDiagnostic) {
      return defaultModelBindingDiagnostic;
    }

    const defaultSelectionDiagnostic = this.validateExplicitChatDefaults({
      filePath,
      explicitDefaultProvider,
      explicitDefaultModel,
      enabledChatModels,
    });
    if (defaultSelectionDiagnostic) {
      return defaultSelectionDiagnostic;
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
      : buildAssistantConfigAvailabilityDiagnostic('missingApiKey', filePath);
  }

  private validateExplicitChatDefaults(input: {
    filePath: string;
    explicitDefaultProvider?: string;
    explicitDefaultModel?: string;
    enabledChatModels: readonly Model[];
  }): AssistantConfigDiagnostic | undefined {
    const provider = input.explicitDefaultProvider
      ? this.providers.get(input.explicitDefaultProvider)
      : undefined;
    if (input.explicitDefaultProvider) {
      if (!provider || provider.enabled === false || !isProviderConfigured(provider)) {
        return buildAssistantConfigAvailabilityDiagnostic('invalidDefaultProvider', input.filePath);
      }
    }

    if (!input.explicitDefaultModel) {
      return undefined;
    }

    const model = this.models.get(input.explicitDefaultModel);
    if (
      !model ||
      model.enabled === false ||
      !modelSupportsPurpose(model, 'llm.chat') ||
      (provider && model.providerId !== provider.id)
    ) {
      return buildAssistantConfigAvailabilityDiagnostic('invalidDefaultModel', input.filePath);
    }

    if (!provider) {
      const modelProvider = this.providers.get(model.providerId);
      if (
        !modelProvider ||
        modelProvider.enabled === false ||
        !isProviderConfigured(modelProvider)
      ) {
        return buildAssistantConfigAvailabilityDiagnostic('invalidDefaultProvider', input.filePath);
      }
    }

    const enabledModelIds = new Set(input.enabledChatModels.map((candidate) => candidate.id));
    return enabledModelIds.has(model.id)
      ? undefined
      : buildAssistantConfigAvailabilityDiagnostic('invalidDefaultModel', input.filePath);
  }

  private validateDefaultModelBindings(
    filePath: string,
    config: UnifiedConfig,
  ): AssistantConfigDiagnostic | undefined {
    const defaults = config.defaultModels ?? {};
    for (const [type, ref] of Object.entries(defaults)) {
      if (!ref) continue;
      const modelType = type as ModelType;
      const provider = this.providers.get(ref.providerId);
      const model = this.models.get(ref.modelId);
      if (
        !provider ||
        provider.enabled === false ||
        !isProviderConfigured(provider) ||
        !model ||
        model.enabled === false ||
        model.providerId !== provider.id ||
        (model.type ?? 'llm') !== modelType
      ) {
        return buildAssistantConfigAvailabilityDiagnostic('invalidDefaultModelBinding', filePath);
      }
    }
    const purposeDefaults = config.defaultModelPurposes ?? {};
    for (const [purpose, ref] of Object.entries(purposeDefaults)) {
      if (!ref) continue;
      const provider = this.providers.get(ref.providerId);
      const model = this.models.get(ref.modelId);
      if (
        !provider ||
        provider.enabled === false ||
        !model ||
        model.enabled === false ||
        model.providerId !== provider.id ||
        !modelSupportsPurpose(model, purpose)
      ) {
        return buildAssistantConfigAvailabilityDiagnostic('invalidDefaultModelBinding', filePath);
      }
    }
    return undefined;
  }

  private getExplicitDefaultProviderScalar(): string | undefined {
    const raw = this.getRawUserConfigSnapshot();
    return typeof raw?.defaultProvider === 'string' && raw.defaultProvider.length > 0
      ? raw.defaultProvider
      : undefined;
  }

  private getExplicitDefaultModelScalar(): string | undefined {
    const raw = this.getRawUserConfigSnapshot();
    return typeof raw?.defaultModel === 'string' && raw.defaultModel.length > 0
      ? raw.defaultModel
      : undefined;
  }

  private getExplicitDefaultModelRef(type: ModelType): ModelRefConfig | undefined {
    return this.getRawUserConfigSnapshot()?.defaultModels?.[type];
  }

  private setRuntimeAssistantSettings(updates: Partial<AssistantSettingsSnapshot>): void {
    this.runtimeAssistantSettings = {
      ...this.runtimeAssistantSettings,
      ...updates,
    };
  }

  private clearRuntimeAssistantModelSelection(): void {
    if (
      !('selectedProviderId' in this.runtimeAssistantSettings) &&
      !('selectedModelId' in this.runtimeAssistantSettings)
    ) {
      return;
    }

    const nextSettings = { ...this.runtimeAssistantSettings };
    delete nextSettings.selectedProviderId;
    delete nextSettings.selectedModelId;
    this.runtimeAssistantSettings = nextSettings;
  }

  private mapUnifiedScalarsToAssistantSettings(
    updates: Partial<UnifiedConfig>,
  ): Partial<AssistantSettingsSnapshot> {
    const settings: Partial<AssistantSettingsSnapshot> = {};
    if ('defaultProvider' in updates) {
      settings.selectedProviderId = updates.defaultProvider ?? null;
    }
    if ('defaultModel' in updates) {
      settings.selectedModelId = updates.defaultModel ?? null;
    }
    if (updates.customSystemPrompt !== undefined) {
      settings.customSystemPrompt = updates.customSystemPrompt;
    }
    if (updates.autoExecuteTools !== undefined) {
      settings.autoExecuteTools = updates.autoExecuteTools;
    }
    if (updates.streamResponses !== undefined) {
      settings.streamResponses = updates.streamResponses;
    }
    if (updates.showToolCalls !== undefined) {
      settings.showToolCalls = updates.showToolCalls;
    }
    if (updates.temperature !== undefined) {
      settings.temperature = updates.temperature;
    }
    if (updates.maxTokens !== undefined) {
      settings.maxTokens = updates.maxTokens;
    }
    if (updates.executionMode !== undefined) {
      settings.executionMode = updates.executionMode;
    }
    return settings;
  }

  /**
   * Merge user config + workspace MCP config into flat Maps.
   *
   * - Providers/Models: user config only (no workspace layer)
   * - MCP Servers: user + workspace merge (workspace overrides by id)
   */
  private ensureMerged(): void {
    if (this.configMerged) {
      return;
    }

    const userConfigResult = this.userConfigReadResult ?? this.readUserConfigSnapshot();
    const userConfig = userConfigResult.status === 'ok' ? userConfigResult.config : undefined;
    const workspace = this.workspaceConfig;

    // --- Providers (user only) ---
    this.providers.clear();
    if (userConfigResult.status === 'ok') {
      this.mergeArrayToMap(this.providers, userConfig?.providers as Provider[] | undefined);
      this.applyOverrides(
        this.providers,
        userConfig?.providerOverrides as Record<string, Partial<Provider>> | undefined,
      );
    }

    // Apply credentials.apiKeys to providers missing an apiKey
    const credentialKeys = userConfig?.credentials?.apiKeys;
    if (credentialKeys) {
      for (const [providerId, apiKey] of Object.entries(credentialKeys)) {
        const provider = this.providers.get(providerId);
        if (provider && !provider.apiKey) {
          this.providers.set(providerId, { ...provider, apiKey });
        }
      }
    }

    // --- Models (user only) ---
    this.models.clear();
    if (userConfigResult.status === 'ok') {
      this.mergeArrayToMap(this.models, userConfig?.models as Model[] | undefined);
      this.applyOverrides(
        this.models,
        userConfig?.modelOverrides as Record<string, Partial<Model>> | undefined,
      );
    }

    // --- MCP Servers (user + workspace) ---
    this.mcpServers.clear();
    if (userConfigResult.status === 'ok') {
      this.mergeArrayToMap(
        this.mcpServers,
        userConfig?.mcpServers as MCPServerPreset[] | undefined,
      );
      this.applyOverrides(
        this.mcpServers,
        userConfig?.mcpServerOverrides as Record<string, Partial<MCPServerPreset>> | undefined,
      );
    }
    this.mergeArrayToMap(this.mcpServers, workspace?.mcpServers);
    this.applyOverrides(this.mcpServers, workspace?.mcpServerOverrides);

    // Substitute workspace path in MCP server configurations
    this.substituteMCPWorkspacePath();

    this.configMerged = true;
  }

  private applyRuntimeProviderCredential(item: ProviderCredentialImport): void {
    this.ensureMerged();
    const existing = this.providers.get(item.id);
    this.providers.set(item.id, {
      ...(existing ?? item.provider),
      apiKey: item.apiKey,
    });
    this.cachedConfig = null;
    this.configDiagnostic = this.buildConfigDiagnostic();
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
   * Apply overrides to existing items in the Map.
   * Only modifies items that already exist.
   */
  private applyOverrides<T extends { id: string }>(
    target: Map<string, T>,
    overrides?: Record<string, Partial<T>>,
  ): void {
    if (!overrides) return;
    for (const [id, override] of Object.entries(overrides)) {
      const existing = target.get(id);
      if (existing) {
        target.set(id, { ...existing, ...override });
      }
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
