/**
 * Configuration Manager
 *
 * Thin wrapper over Platform ConfigManager for CLI use.
 * Handles env var API keys and CLI arg overrides, then maps
 * the merged Platform config into the CLIConfig read-only view.
 *
 * Priority (highest to lowest):
 * 1. Command line arguments
 * 2. Environment variables
 * 3. Platform ConfigManager (user + workspace merge)
 * 4. Default values
 */

import {
  ConfigManager,
  FileUserConfigManager,
  modelSupportsPurpose,
  type AssistantConfigDiagnostic,
  type ConfigManagerOptions,
} from '@neko/platform';
import type {
  CLIConfig,
  TuiPurposeModelConfig,
  TuiPurposeModelRef,
  TuiToolModelPurpose,
} from './types';
import { DEFAULT_CLI_CONFIG } from './types';
import type { ChatModelOption } from '@neko/shared';
import { getEnvKeyMap } from '@neko/shared';
import type { DirectMediaCommandConfig } from './direct-media-command';

// =============================================================================
// Environment Variable Handling
// =============================================================================

/** Shared env var mapping from @neko/shared/config/credential-resolver */
const ENV_KEY_MAP = getEnvKeyMap();

/**
 * Get API key from environment for a given provider ID or type.
 */
export function getApiKeyFromEnv(providerIdOrType: string): string | undefined {
  return getProviderApiKeyFromEnv(providerIdOrType) ?? getGenericApiKeyFromEnv();
}

function getProviderApiKeyFromEnv(providerIdOrType: string): string | undefined {
  const envKey = ENV_KEY_MAP[providerIdOrType];
  if (envKey) {
    const val = process.env[envKey];
    if (val) return val;
  }
  return undefined;
}

function getGenericApiKeyFromEnv(): string | undefined {
  return process.env['NEKO_API_KEY'] ?? process.env['LLM_API_KEY'];
}

// =============================================================================
// ConfigManager Factory (shared across load/save)
// =============================================================================

/**
 * Create a ConfigManager for the given workDir.
 * Callers should dispose() when done if not long-lived.
 */
function createConfigManager(workDir?: string): ConfigManager {
  const opts: ConfigManagerOptions = {
    userConfigManager: new FileUserConfigManager(),
    workspacePath: workDir,
  };
  return new ConfigManager(opts);
}

// =============================================================================
// Configuration Loading
// =============================================================================

export type CliConfigLoadDiagnostic =
  | Readonly<{
      readonly code: 'platform-config-unavailable';
      readonly configCode: AssistantConfigDiagnostic['code'];
      readonly filePath: string;
    }>
  | Readonly<{ readonly code: 'missing-default-provider' }>
  | Readonly<{ readonly code: 'provider-not-configured'; readonly providerId: string }>
  | Readonly<{ readonly code: 'provider-protocol-not-configured'; readonly providerId: string }>
  | Readonly<{ readonly code: 'missing-provider-model'; readonly providerId: string }>;

export class CliConfigLoadError extends Error {
  public constructor(readonly diagnostic: CliConfigLoadDiagnostic) {
    super(`CLI configuration load failed: ${diagnostic.code}`);
    this.name = 'CliConfigLoadError';
  }
}

/** Media generation capabilities used to identify media models */
const MEDIA_CAPABILITIES = new Set([
  'text_to_image',
  'image_to_image',
  'text_to_video',
  'image_to_video',
  'video_to_video',
  'text_to_audio',
  'text_to_music',
  'workflow',
  'image_generation',
  'video_generation',
]);

/**
 * Load CLI configuration.
 *
 * Creates a temporary ConfigManager, reads merged providers/models,
 * injects env var API keys, applies CLI arg overrides, and returns CLIConfig.
 */
export function loadConfig(
  workDir: string = process.cwd(),
  overrides: CliConfigLoadOverrides = {},
): CLIConfig {
  const cm = createConfigManager(workDir);

  try {
    const runtimeSelectionOverrides = {
      selectedProviderId: overrides.provider,
      selectedModelId: overrides.model,
      temperature: overrides.temperature,
      maxTokens: overrides.maxTokens,
    };
    const configuredMainProviderId =
      cm.getEffectiveAgentWorkspaceConfigSnapshot(runtimeSelectionOverrides).providerId ??
      overrides.provider;
    if (!configuredMainProviderId) {
      throw new CliConfigLoadError({ code: 'missing-default-provider' });
    }
    applyRuntimeCredentialOverrides(cm, overrides, configuredMainProviderId);

    const effectiveConfig = cm.getEffectiveAgentWorkspaceConfigSnapshot(runtimeSelectionOverrides);
    if (effectiveConfig.blockingDiagnostic) {
      throw new CliConfigLoadError({
        code: 'platform-config-unavailable',
        configCode: effectiveConfig.blockingDiagnostic.code,
        filePath: effectiveConfig.blockingDiagnostic.filePath,
      });
    }

    const providerId = effectiveConfig.providerId ?? undefined;
    if (!providerId) {
      throw new CliConfigLoadError({ code: 'missing-default-provider' });
    }
    const provider = effectiveConfig.provider ?? cm.getProvider(providerId);
    const providerType = provider?.type;
    if (!providerType) {
      throw new CliConfigLoadError({ code: 'provider-not-configured', providerId });
    }
    const providerRequiresApiKey = provider.requiresApiKey !== false;

    // API key: env > config
    const envApiKey =
      getProviderApiKeyFromEnv(providerId) ??
      getProviderApiKeyFromEnv(providerType) ??
      getGenericApiKeyFromEnv();
    const apiKey = overrides.apiKey ?? envApiKey ?? provider?.apiKey;
    const credentialProvenance =
      apiKey === undefined
        ? undefined
        : envApiKey !== undefined && overrides.apiKey === undefined
          ? ('environment' as const)
          : ('user-config-import' as const);

    const model = effectiveConfig.modelId ?? undefined;
    if (!model) {
      throw new CliConfigLoadError({ code: 'missing-provider-model', providerId });
    }

    const selectedModelConfig = effectiveConfig.model ?? cm.getModel(model);
    const protocolProfile = selectedModelConfig?.protocolProfile ?? provider.protocolProfile;
    if (!protocolProfile) {
      throw new CliConfigLoadError({ code: 'provider-protocol-not-configured', providerId });
    }

    // Base URL
    const baseUrl = overrides.baseUrl ?? provider?.apiUrl;

    // MCP servers → MCPServerConfig[]
    const mcpServers = effectiveConfig.mcpServers.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      category: s.category ?? ('other' as const),
      transport: s.transport ?? ('stdio' as const),
      command: s.command,
      args: s.args,
      env: s.env,
      enabled: s.enabled ?? true,
    }));

    // Media models: prefer the type field, then inspect explicit capabilities.
    const mediaModels = cm
      .getEnabledModels()
      .filter((m) => {
        if (m.type && m.type !== 'llm') return true;
        const caps = m.capabilities ?? [];
        return caps.some((c) => MEDIA_CAPABILITIES.has(c as string));
      })
      .map((m) => m.id);

    const defaultMediaModels = effectiveConfig.defaultMediaModels;
    const perceptionModels = buildDefaultPerceptionModelRefs(cm);
    const purposeModels = buildDefaultPurposeModelConfigs(cm, overrides, providerId);
    const maxTokens = effectiveConfig.maxTokens;
    const temperature = effectiveConfig.temperature;
    const thinkingBudget =
      effectiveConfig.sources.thinkingBudget === 'default' && protocolProfile !== 'anthropic'
        ? 0
        : effectiveConfig.thinkingBudget;

    const config: CLIConfig = {
      provider: providerId,
      providerType,
      protocolProfile,
      providerRequiresApiKey,
      providerAuth: projectProviderAuth(provider),
      model,
      chatModel: {
        providerId,
        modelId: model,
        apiModelId: selectedModelConfig?.name ?? model,
        ...(selectedModelConfig?.providerExpressionProfileId
          ? { providerExpressionProfileId: selectedModelConfig.providerExpressionProfileId }
          : {}),
        ...(isStringArray(selectedModelConfig?.capabilities)
          ? { capabilities: selectedModelConfig.capabilities }
          : {}),
        ...(isPositiveInteger(selectedModelConfig?.contextWindow)
          ? { contextWindow: selectedModelConfig.contextWindow }
          : {}),
        ...(isPositiveInteger(selectedModelConfig?.maxOutputTokens)
          ? { maxOutputTokens: selectedModelConfig.maxOutputTokens }
          : {}),
      },
      mediaModels,
      defaultMediaModels,
      perceptionModels,
      purposeModels,
      apiKey,
      credentialProvenance,
      baseUrl,
      maxTokens,
      temperature,
      verbose: overrides.verbose ?? DEFAULT_CLI_CONFIG.verbose,
      workDir,
      mcpServers,
      externalResearch: effectiveConfig.externalResearch,
      outputFormat: overrides.outputFormat ?? DEFAULT_CLI_CONFIG.outputFormat,
      executionMode: overrides.executionMode ?? effectiveConfig.executionMode,
      thinkingBudget,
      ...(overrides.contextSettings ? { contextSettings: overrides.contextSettings } : {}),
    };

    return config;
  } finally {
    cm.dispose();
  }
}

const TUI_TOOL_MODEL_PURPOSES = [
  'image.generate',
  'image.edit',
  'image.understand',
  'video.generate',
  'video.understand',
  'audio.generate',
  'audio.tts',
  'audio.understand',
  'audio.music.generate',
] as const satisfies readonly TuiToolModelPurpose[];

export interface CliConfigLoadOverrides extends Partial<CLIConfig> {
  /** Flat session-scoped purpose refs; each ref is resolved through the normal product catalog. */
  readonly defaultModelPurposes?: Partial<Record<TuiToolModelPurpose, TuiPurposeModelRef>>;
}

function buildDefaultPurposeModelConfigs(
  cm: ConfigManager,
  overrides: CliConfigLoadOverrides,
  mainProviderId: string,
): CLIConfig['purposeModels'] {
  const projected: Partial<Record<TuiToolModelPurpose, TuiPurposeModelConfig>> = {};
  for (const purpose of TUI_TOOL_MODEL_PURPOSES) {
    const ref = overrides.defaultModelPurposes?.[purpose] ?? cm.getDefaultModelPurposeRef(purpose);
    if (!ref) continue;
    const provider = cm.getProvider(ref.providerId);
    const model = cm.getModel(ref.modelId);
    if (!provider || provider.enabled === false) {
      throw new Error(`Purpose ${purpose} references unavailable provider ${ref.providerId}.`);
    }
    if (!model || model.enabled === false || model.providerId !== provider.id) {
      throw new Error(
        `Purpose ${purpose} references unavailable model ${ref.providerId}/${ref.modelId}.`,
      );
    }
    if (!modelSupportsPurpose(model, purpose)) {
      throw new Error(
        `Purpose ${purpose} model ${ref.providerId}/${ref.modelId} lacks the required capability.`,
      );
    }
    const baseUrl = provider.apiUrl?.trim();
    if (!baseUrl) {
      throw new Error(`Purpose ${purpose} provider ${provider.id} has no endpoint.`);
    }
    const envApiKey =
      getProviderApiKeyFromEnv(provider.id) ??
      getProviderApiKeyFromEnv(provider.type) ??
      (provider.id === mainProviderId ? getGenericApiKeyFromEnv() : undefined);
    const apiKey =
      (provider.id === mainProviderId ? overrides.apiKey : undefined) ??
      envApiKey ??
      provider.apiKey;
    const credentialProvenance =
      apiKey === undefined
        ? undefined
        : envApiKey !== undefined && overrides.apiKey === undefined
          ? ('environment' as const)
          : ('user-config-import' as const);
    projected[purpose] = {
      purpose,
      providerId: provider.id,
      modelId: model.id,
      apiModelId: model.name ?? model.id,
      category: model.type ?? 'llm',
      capabilities: [...model.capabilities],
      baseUrl,
      ...((model.protocolProfile ?? provider.protocolProfile)
        ? { protocolProfile: model.protocolProfile ?? provider.protocolProfile }
        : {}),
      providerRequiresApiKey: provider.requiresApiKey !== false,
      providerAuth: projectProviderAuth(provider),
      ...(apiKey ? { apiKey } : {}),
      ...(credentialProvenance ? { credentialProvenance } : {}),
      ...(isPositiveInteger(model.contextWindow) ? { contextWindow: model.contextWindow } : {}),
      ...(isPositiveInteger(model.maxOutputTokens)
        ? { maxOutputTokens: model.maxOutputTokens }
        : {}),
    };
  }
  return Object.keys(projected).length === 0 ? undefined : projected;
}

function projectProviderAuth(provider: {
  readonly useBearerAuth?: boolean;
  readonly protocolVariant?: {
    readonly authType?: 'bearer' | 'api-key' | 'custom-header';
    readonly authHeader?: string;
  };
}): NonNullable<CLIConfig['providerAuth']> {
  const type = provider.protocolVariant?.authType;
  if (type === 'custom-header') {
    const header = provider.protocolVariant?.authHeader?.trim();
    if (!header) throw new Error('Custom provider authentication requires authHeader.');
    return { type, header };
  }
  if (type === 'bearer' || provider.useBearerAuth === true) return { type: 'bearer' };
  if (type === 'api-key') return { type: 'api-key' };
  return { type: 'provider-default' };
}

function applyRuntimeCredentialOverrides(
  cm: ConfigManager,
  overrides: Partial<CLIConfig>,
  mainProviderId: string,
): void {
  for (const provider of cm.getProviders()) {
    const apiKey =
      (provider.id === mainProviderId ? overrides.apiKey : undefined) ??
      getProviderApiKeyFromEnv(provider.id) ??
      getProviderApiKeyFromEnv(provider.type) ??
      (provider.id === mainProviderId ? getGenericApiKeyFromEnv() : undefined);
    if (apiKey) {
      cm.setRuntimeProviderOverride(provider.id, { apiKey });
    }
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// =============================================================================
// Provider / Model Queries (delegate to ConfigManager)
// =============================================================================

/**
 * Provider info returned by listProviders / getProviderInfo.
 * Replaces the old ProviderConfig type.
 */
export interface ProviderInfo {
  id: string;
  name: string;
  displayName: string;
  type: string;
  apiUrl: string;
  hasApiKey: boolean;
  models: string[];
}

/**
 * List all enabled providers with their models.
 */
export function listProviders(workDir?: string): ProviderInfo[] {
  const cm = createConfigManager(workDir);
  try {
    return cm.getEnabledProviders().map((p) => {
      const models = cm.getModelsByProvider(p.id).map((m) => m.name ?? m.id);
      const envKey = getApiKeyFromEnv(p.id) ?? getApiKeyFromEnv(p.type);
      return {
        id: p.id,
        name: p.name,
        displayName: p.displayName ?? p.name,
        type: p.type,
        apiUrl: p.apiUrl,
        hasApiKey: Boolean(envKey ?? p.apiKey),
        models,
      };
    });
  } finally {
    cm.dispose();
  }
}

/**
 * Get available models for a provider.
 */
export function getProviderModels(providerId: string, workDir?: string): string[] {
  const cm = createConfigManager(workDir);
  try {
    return cm.getModelsByProvider(providerId).map((m) => m.name ?? m.id);
  } finally {
    cm.dispose();
  }
}

export function listChatModelOptions(workDir?: string): ChatModelOption[] {
  const cm = createConfigManager(workDir);
  try {
    return cm.getChatModelOptions();
  } finally {
    cm.dispose();
  }
}

export function loadDirectMediaCommandConfig(workDir?: string): {
  readonly config: DirectMediaCommandConfig;
  readonly modelOptions: readonly ChatModelOption[];
} {
  const cm = createConfigManager(workDir);
  try {
    return {
      config: {
        defaultProviderId: cm.getDefaultProviderScalar(),
        defaultMediaModels: cm.getDefaultMediaModels(),
      },
      modelOptions: cm.getChatModelOptions(),
    };
  } finally {
    cm.dispose();
  }
}

function buildDefaultPerceptionModelRefs(cm: ConfigManager): CLIConfig['perceptionModels'] {
  const image = formatModelRef(cm.getDefaultModelPurposeRef('image.understand'));
  const audio = formatModelRef(cm.getDefaultModelPurposeRef('audio.understand'));
  const video = formatModelRef(cm.getDefaultModelPurposeRef('video.understand'));
  if (!image && !audio && !video) return undefined;
  return {
    ...(image ? { image } : {}),
    ...(audio ? { audio } : {}),
    ...(video ? { video } : {}),
  };
}

function formatModelRef(
  ref: { readonly providerId: string; readonly modelId: string } | undefined,
) {
  if (!ref) return undefined;
  return `${ref.providerId}:${ref.modelId}`;
}

// =============================================================================
// Validation
// =============================================================================

export type CliConfigValidationDiagnostic =
  | Readonly<{ readonly code: 'missing-api-key'; readonly providerId: string }>
  | Readonly<{ readonly code: 'missing-model' }>
  | Readonly<{ readonly code: 'invalid-temperature'; readonly value: number }>
  | Readonly<{ readonly code: 'invalid-max-tokens'; readonly value: number }>
  | Readonly<{ readonly code: 'invalid-output-format'; readonly value: string }>;

export interface CliConfigValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly CliConfigValidationDiagnostic[];
}

/**
 * Validate configuration without producing terminal prose.
 */
export function validateConfig(config: CLIConfig): CliConfigValidationResult {
  const diagnostics: CliConfigValidationDiagnostic[] = [];

  if (config.providerRequiresApiKey && !config.apiKey) {
    diagnostics.push({ code: 'missing-api-key', providerId: config.provider });
  }

  if (!config.model) {
    diagnostics.push({ code: 'missing-model' });
  }

  if (config.temperature < 0 || config.temperature > 2) {
    diagnostics.push({ code: 'invalid-temperature', value: config.temperature });
  }

  if (!Number.isInteger(config.maxTokens) || config.maxTokens <= 0) {
    diagnostics.push({ code: 'invalid-max-tokens', value: config.maxTokens });
  }

  if (!['text', 'json', 'markdown'].includes(config.outputFormat)) {
    diagnostics.push({ code: 'invalid-output-format', value: config.outputFormat });
  }

  return { valid: diagnostics.length === 0, diagnostics };
}
