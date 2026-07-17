import type {
  MCPServerConfig,
  ModelConfig,
  ModelRefConfig,
  ModelType,
  PurposeDefaultModels,
  ProviderConfig,
  ProtocolVariant,
  TypeDefaultModels,
} from '../types/config';
import type {
  ExternalResearchConfigInput,
  ExternalResearchFetchOutputSchema,
  ExternalResearchMcpFetchToolBinding,
  ExternalResearchMcpProviderConfig,
  ExternalResearchMcpSearchToolBinding,
  ExternalResearchMode,
  ExternalResearchSearchOutputSchema,
} from '../types/external-research';
import {
  AUTH_TYPES,
  MODEL_TYPES,
  PROVIDER_CONNECTION_KINDS,
  PROVIDER_PROTOCOL_PROFILES,
  PROVIDER_SUPPORT_LEVELS,
  PROVIDER_TYPES,
  STREAM_FORMATS,
} from '../types/config';
import { parse, stringify } from 'smol-toml';
import type { AuthConfigJson, CredentialsConfig, MarketConfig, UnifiedConfig } from './types';

export const SUPPORTED_TOML_CONFIG_VERSION = 1;

export interface NekoTomlConfig {
  readonly ui_locale?: unknown;
  readonly prompt_locale?: unknown;
  readonly version?: number;
  readonly default_provider?: string;
  readonly default_model?: string;
  readonly default_media_models?: unknown;
  readonly default_models?: Partial<Record<ModelType, TomlModelRefConfig>>;
  readonly default_model_purposes?: Record<string, TomlModelRefConfig>;
  readonly defaults?: TomlDefaultsConfig;
  readonly skills_dir?: string;
  readonly verbose?: boolean;
  readonly output_format?: 'text' | 'json' | 'markdown';
  readonly thinking_budget?: number;
  readonly custom_system_prompt?: string;
  readonly auto_execute_tools?: boolean;
  readonly stream_responses?: boolean;
  readonly show_tool_calls?: boolean;
  readonly execution_mode?: 'plan' | 'ask' | 'auto';
  readonly providers?: readonly TomlProviderConfig[];
  readonly models?: readonly TomlModelConfig[];
  readonly mcp_servers?: readonly TomlMcpServerConfig[];
  readonly external_research?: TomlExternalResearchConfig;
  readonly artifact_profiles?: unknown;
  readonly creation_profiles?: unknown;
  readonly provider_expression_profiles?: unknown;
  readonly provider_overrides?: Record<string, Partial<TomlProviderConfig>>;
  readonly model_overrides?: Record<string, Partial<TomlModelConfig>>;
  readonly mcp_server_overrides?: Record<string, Partial<TomlMcpServerConfig>>;
  readonly auth?: AuthConfigJson;
  readonly credentials?: CredentialsConfig;
  readonly market?: MarketConfig;
}

export interface TomlDefaultsConfig {
  readonly max_tokens?: number;
  readonly temperature?: number;
}

export interface TomlModelRefConfig {
  readonly provider_id: string;
  readonly model_id: string;
}

export interface TomlProviderConfig {
  readonly id: string;
  readonly name: string;
  readonly display_name?: string;
  readonly type: ProviderConfig['type'];
  readonly api_url?: string;
  readonly base_url?: string;
  readonly api_key?: string;
  readonly enabled?: boolean;
  readonly connection_kind?: ProviderConfig['connectionKind'];
  readonly protocol_profile?: ProviderConfig['protocolProfile'];
  readonly support_level?: ProviderConfig['supportLevel'];
  readonly requires_api_key?: boolean;
  readonly builtin?: boolean;
  readonly supports_beta?: boolean;
  readonly use_bearer_auth?: boolean;
  readonly options?: Record<string, unknown>;
  readonly protocol_variant?: TomlProtocolVariant;
}

export interface TomlProtocolVariant {
  readonly base_path?: string;
  readonly auth_type?: ProtocolVariant['authType'];
  readonly auth_header?: string;
  readonly stream_format?: ProtocolVariant['streamFormat'];
  readonly stream_done_marker?: string;
  readonly extra_headers?: Record<string, string>;
  readonly media_endpoints?: TomlMediaEndpoints;
}

export interface TomlMediaEndpoints {
  readonly image_generations?: string;
  readonly video_generations?: string;
  readonly video_status?: string;
  readonly video_cancel?: string;
}

export interface TomlModelConfig {
  readonly id: string;
  readonly name: string;
  readonly display_name?: string;
  readonly provider_id: string;
  readonly protocol_profile?: ModelConfig['protocolProfile'];
  readonly protocol?: ModelConfig['protocol'];
  readonly use_bearer_auth?: boolean;
  readonly supports_beta?: boolean;
  readonly type?: ModelConfig['type'];
  readonly capabilities: readonly string[];
  readonly context_window?: number;
  readonly max_output_tokens?: number;
  readonly input_cost_per_1k?: number;
  readonly output_cost_per_1k?: number;
  readonly enabled?: boolean;
  readonly options?: Record<string, unknown>;
  readonly provider_expression_profile_id?: string;
}

export interface TomlMcpServerConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: MCPServerConfig['category'];
  readonly transport: MCPServerConfig['transport'];
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
  readonly enabled?: boolean;
  readonly builtin?: boolean;
  readonly homepage?: string;
  readonly tools?: readonly NonNullable<MCPServerConfig['tools']>[number][];
  readonly request_timeout?: number;
}

export interface TomlExternalResearchConfig {
  readonly mode?: ExternalResearchMode;
  readonly provider_id?: string;
  readonly require_approval_for_live?: boolean;
  readonly allow_project_context_in_query?: boolean;
  readonly max_results?: number;
  readonly max_fetch_content_tokens?: number;
  readonly allowed_domains?: readonly string[];
  readonly blocked_domains?: readonly string[];
  readonly mcp?: TomlExternalResearchMcpProviderConfig;
}

export interface TomlExternalResearchMcpProviderConfig {
  readonly server_id: string;
  readonly search_tool: TomlExternalResearchMcpSearchToolBinding;
  readonly fetch_tool?: TomlExternalResearchMcpFetchToolBinding;
  readonly expose_bound_tools_as_raw_mcp?: boolean;
}

export interface TomlExternalResearchMcpSearchToolBinding {
  readonly name: string;
  readonly query_arg: string;
  readonly max_results_arg?: string;
  readonly allowed_domains_arg?: string;
  readonly blocked_domains_arg?: string;
  readonly output_schema: ExternalResearchSearchOutputSchema;
}

export interface TomlExternalResearchMcpFetchToolBinding {
  readonly name: string;
  readonly url_arg: string;
  readonly max_content_tokens_arg?: string;
  readonly allowed_domains_arg?: string;
  readonly blocked_domains_arg?: string;
  readonly output_schema: ExternalResearchFetchOutputSchema;
}

export interface TomlConfigValidationIssue {
  readonly code:
    | 'unsupportedVersion'
    | 'unsupportedProviderType'
    | 'unsupportedProviderConnectionKind'
    | 'unsupportedProviderProtocolProfile'
    | 'unsupportedProviderSupportLevel'
    | 'unsupportedProtocolAuthType'
    | 'unsupportedProtocolStreamFormat'
    | 'unsupportedModelProtocolProfile'
    | 'unsupportedModelProtocol'
    | 'duplicateProviderId'
    | 'duplicateModelId'
    | 'invalidDefaultMaxTokens'
    | 'invalidModelTokenMetadata'
    | 'unsupportedProfileSchemaSection'
    | 'unsupportedModelType'
    | 'unsupportedDefaultMediaModelType'
    | 'unsupportedDefaultModelType'
    | 'unsupportedDefaultModelPurpose';
  readonly path: string;
  readonly message: string;
}

export class TomlConfigValidationError extends Error {
  constructor(readonly issues: readonly TomlConfigValidationIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'));
    this.name = 'TomlConfigValidationError';
  }
}

export function tomlToUnifiedConfig(config: NekoTomlConfig): UnifiedConfig {
  validateTomlConfig(config);
  return {
    ...(config.default_provider !== undefined ? { defaultProvider: config.default_provider } : {}),
    ...(config.default_model !== undefined ? { defaultModel: config.default_model } : {}),
    ...(config.default_models !== undefined
      ? { defaultModels: tomlDefaultModelsToRuntime(config.default_models) }
      : {}),
    ...(config.default_model_purposes !== undefined
      ? {
          defaultModelPurposes: tomlDefaultModelPurposesToRuntime(config.default_model_purposes),
        }
      : {}),
    ...(config.defaults?.max_tokens !== undefined ? { maxTokens: config.defaults.max_tokens } : {}),
    ...(config.defaults?.temperature !== undefined
      ? { temperature: config.defaults.temperature }
      : {}),
    ...(config.skills_dir !== undefined ? { skillsDir: config.skills_dir } : {}),
    ...(config.verbose !== undefined ? { verbose: config.verbose } : {}),
    ...(config.output_format !== undefined ? { outputFormat: config.output_format } : {}),
    ...(config.thinking_budget !== undefined ? { thinkingBudget: config.thinking_budget } : {}),
    ...(config.custom_system_prompt !== undefined
      ? { customSystemPrompt: config.custom_system_prompt }
      : {}),
    ...(config.auto_execute_tools !== undefined
      ? { autoExecuteTools: config.auto_execute_tools }
      : {}),
    ...(config.stream_responses !== undefined ? { streamResponses: config.stream_responses } : {}),
    ...(config.show_tool_calls !== undefined ? { showToolCalls: config.show_tool_calls } : {}),
    ...(config.execution_mode !== undefined ? { executionMode: config.execution_mode } : {}),
    ...(config.providers ? { providers: config.providers.map(tomlProviderToRuntime) } : {}),
    ...(config.models ? { models: config.models.map(tomlModelToRuntime) } : {}),
    ...(config.mcp_servers ? { mcpServers: config.mcp_servers.map(tomlMcpServerToRuntime) } : {}),
    ...(config.external_research !== undefined
      ? { externalResearch: tomlExternalResearchToRuntime(config.external_research) }
      : {}),
    ...(config.provider_overrides
      ? {
          providerOverrides: mapRecordValues(
            config.provider_overrides,
            tomlProviderOverrideToRuntime,
          ),
        }
      : {}),
    ...(config.model_overrides
      ? { modelOverrides: mapRecordValues(config.model_overrides, tomlModelOverrideToRuntime) }
      : {}),
    ...(config.mcp_server_overrides
      ? {
          mcpServerOverrides: mapRecordValues(
            config.mcp_server_overrides,
            tomlMcpServerOverrideToRuntime,
          ),
        }
      : {}),
    ...(config.auth !== undefined ? { auth: config.auth } : {}),
    ...(config.credentials !== undefined ? { credentials: config.credentials } : {}),
    ...(config.market !== undefined ? { market: config.market } : {}),
  };
}

export function parseTomlConfigText(source: string): UnifiedConfig {
  return tomlToUnifiedConfig(parse(source) as NekoTomlConfig);
}

export function unifiedConfigToToml(config: UnifiedConfig): NekoTomlConfig {
  return {
    version: SUPPORTED_TOML_CONFIG_VERSION,
    ...(config.defaultProvider !== undefined ? { default_provider: config.defaultProvider } : {}),
    ...(config.defaultModel !== undefined ? { default_model: config.defaultModel } : {}),
    ...(config.defaultModels !== undefined
      ? { default_models: runtimeDefaultModelsToToml(config.defaultModels) }
      : {}),
    ...(config.defaultModelPurposes !== undefined
      ? {
          default_model_purposes: runtimeDefaultModelPurposesToToml(config.defaultModelPurposes),
        }
      : {}),
    ...(config.maxTokens !== undefined || config.temperature !== undefined
      ? {
          defaults: {
            ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
            ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
          },
        }
      : {}),
    ...(config.skillsDir !== undefined ? { skills_dir: config.skillsDir } : {}),
    ...(config.verbose !== undefined ? { verbose: config.verbose } : {}),
    ...(config.outputFormat !== undefined ? { output_format: config.outputFormat } : {}),
    ...(config.thinkingBudget !== undefined ? { thinking_budget: config.thinkingBudget } : {}),
    ...(config.customSystemPrompt !== undefined
      ? { custom_system_prompt: config.customSystemPrompt }
      : {}),
    ...(config.autoExecuteTools !== undefined
      ? { auto_execute_tools: config.autoExecuteTools }
      : {}),
    ...(config.streamResponses !== undefined ? { stream_responses: config.streamResponses } : {}),
    ...(config.showToolCalls !== undefined ? { show_tool_calls: config.showToolCalls } : {}),
    ...(config.executionMode !== undefined ? { execution_mode: config.executionMode } : {}),
    ...(config.providers ? { providers: config.providers.map(runtimeProviderToToml) } : {}),
    ...(config.models ? { models: config.models.map(runtimeModelToToml) } : {}),
    ...(config.mcpServers ? { mcp_servers: config.mcpServers.map(runtimeMcpServerToToml) } : {}),
    ...(config.externalResearch !== undefined
      ? { external_research: runtimeExternalResearchToToml(config.externalResearch) }
      : {}),
    ...(config.providerOverrides
      ? {
          provider_overrides: mapRecordValues(
            config.providerOverrides,
            runtimeProviderOverrideToToml,
          ),
        }
      : {}),
    ...(config.modelOverrides
      ? { model_overrides: mapRecordValues(config.modelOverrides, runtimeModelOverrideToToml) }
      : {}),
    ...(config.mcpServerOverrides
      ? {
          mcp_server_overrides: mapRecordValues(
            config.mcpServerOverrides,
            runtimeMcpServerOverrideToToml,
          ),
        }
      : {}),
    ...(config.auth !== undefined ? { auth: config.auth } : {}),
    ...(config.credentials !== undefined ? { credentials: config.credentials } : {}),
    ...(config.market !== undefined ? { market: config.market } : {}),
  };
}

export function serializeUnifiedConfigToToml(config: UnifiedConfig): string {
  return stringify(unifiedConfigToToml(config));
}

export function validateTomlConfig(config: NekoTomlConfig): void {
  const issues: TomlConfigValidationIssue[] = [];
  const version = config.version ?? SUPPORTED_TOML_CONFIG_VERSION;
  if (!Number.isInteger(version) || version > SUPPORTED_TOML_CONFIG_VERSION) {
    issues.push({
      code: 'unsupportedVersion',
      path: 'version',
      message: `Unsupported Agent config version ${String(version)}. Supported version is ${SUPPORTED_TOML_CONFIG_VERSION}.`,
    });
  }
  collectDuplicateIdIssues(config.providers, 'providers', 'duplicateProviderId', issues);
  collectDuplicateIdIssues(config.models, 'models', 'duplicateModelId', issues);
  collectUnsupportedProviderIssues(config.providers, 'providers', issues);
  collectUnsupportedProviderOverrideIssues(config.provider_overrides, issues);
  collectUnsupportedDefaultMediaModelIssues(config.default_media_models, issues);
  collectUnsupportedProfileSchemaIssues(config, issues);
  collectUnsupportedModelTypeIssues(config.models, 'models', issues);
  collectUnsupportedModelProtocolProfileIssues(config.models, 'models', issues);
  collectUnsupportedModelProtocolIssues(config.models, 'models', issues);
  collectUnsupportedModelOverrideTypeIssues(config.model_overrides, issues);
  collectUnsupportedModelOverrideProtocolProfileIssues(config.model_overrides, issues);
  collectUnsupportedModelOverrideProtocolIssues(config.model_overrides, issues);
  collectDefaultModelIssues(config.default_models, issues);
  collectDefaultModelPurposeIssues(config.default_model_purposes, issues);
  collectDefaultTokenIssues(config.defaults, issues);
  collectModelTokenIssues(config.models, 'models', issues);
  collectModelOverrideTokenIssues(config.model_overrides, issues);
  if (issues.length > 0) {
    throw new TomlConfigValidationError(issues);
  }
}

function tomlProviderToRuntime(provider: TomlProviderConfig): ProviderConfig {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    displayName: provider.display_name ?? provider.name,
    type: provider.type,
    apiUrl: provider.api_url ?? provider.base_url ?? '',
    apiKey: provider.api_key,
    enabled: provider.enabled ?? true,
    connectionKind: provider.connection_kind,
    protocolProfile: provider.protocol_profile,
    supportLevel: provider.support_level,
    requiresApiKey: provider.requires_api_key,
    builtin: provider.builtin,
    supportsBeta: provider.supports_beta,
    useBearerAuth: provider.use_bearer_auth,
    options: provider.options,
    protocolVariant: provider.protocol_variant
      ? tomlProtocolVariantToRuntime(provider.protocol_variant)
      : undefined,
  }) as ProviderConfig;
}

function runtimeProviderToToml(provider: ProviderConfig): TomlProviderConfig {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    display_name: provider.displayName,
    type: provider.type,
    api_url: provider.apiUrl,
    api_key: provider.apiKey,
    enabled: provider.enabled,
    connection_kind: provider.connectionKind,
    protocol_profile: provider.protocolProfile,
    support_level: provider.supportLevel,
    requires_api_key: provider.requiresApiKey,
    builtin: provider.builtin,
    supports_beta: provider.supportsBeta,
    use_bearer_auth: provider.useBearerAuth,
    options: provider.options,
    protocol_variant: provider.protocolVariant
      ? runtimeProtocolVariantToToml(provider.protocolVariant)
      : undefined,
  }) as TomlProviderConfig;
}

function tomlProviderOverrideToRuntime(
  provider: Partial<TomlProviderConfig>,
): Partial<ProviderConfig> {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    displayName: provider.display_name,
    type: provider.type,
    apiUrl: provider.api_url ?? provider.base_url,
    apiKey: provider.api_key,
    enabled: provider.enabled,
    connectionKind: provider.connection_kind,
    protocolProfile: provider.protocol_profile,
    supportLevel: provider.support_level,
    requiresApiKey: provider.requires_api_key,
    builtin: provider.builtin,
    supportsBeta: provider.supports_beta,
    useBearerAuth: provider.use_bearer_auth,
    options: provider.options,
    protocolVariant: provider.protocol_variant
      ? tomlProtocolVariantToRuntime(provider.protocol_variant)
      : undefined,
  });
}

function runtimeProviderOverrideToToml(
  provider: Partial<ProviderConfig>,
): Partial<TomlProviderConfig> {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    display_name: provider.displayName,
    type: provider.type,
    api_url: provider.apiUrl,
    api_key: provider.apiKey,
    enabled: provider.enabled,
    connection_kind: provider.connectionKind,
    protocol_profile: provider.protocolProfile,
    support_level: provider.supportLevel,
    requires_api_key: provider.requiresApiKey,
    builtin: provider.builtin,
    supports_beta: provider.supportsBeta,
    use_bearer_auth: provider.useBearerAuth,
    options: provider.options,
    protocol_variant: provider.protocolVariant
      ? runtimeProtocolVariantToToml(provider.protocolVariant)
      : undefined,
  });
}

function tomlProtocolVariantToRuntime(variant: TomlProtocolVariant): ProtocolVariant {
  return removeUndefined({
    basePath: variant.base_path,
    authType: variant.auth_type,
    authHeader: variant.auth_header,
    streamFormat: variant.stream_format,
    streamDoneMarker: variant.stream_done_marker,
    extraHeaders: variant.extra_headers,
    mediaEndpoints: variant.media_endpoints
      ? {
          imageGenerations: variant.media_endpoints.image_generations,
          videoGenerations: variant.media_endpoints.video_generations,
          videoStatus: variant.media_endpoints.video_status,
          videoCancel: variant.media_endpoints.video_cancel,
        }
      : undefined,
  });
}

function runtimeProtocolVariantToToml(variant: ProtocolVariant): TomlProtocolVariant {
  return removeUndefined({
    base_path: variant.basePath,
    auth_type: variant.authType,
    auth_header: variant.authHeader,
    stream_format: variant.streamFormat,
    stream_done_marker: variant.streamDoneMarker,
    extra_headers: variant.extraHeaders,
    media_endpoints: variant.mediaEndpoints
      ? {
          image_generations: variant.mediaEndpoints.imageGenerations,
          video_generations: variant.mediaEndpoints.videoGenerations,
          video_status: variant.mediaEndpoints.videoStatus,
          video_cancel: variant.mediaEndpoints.videoCancel,
        }
      : undefined,
  });
}

function tomlModelToRuntime(model: TomlModelConfig): ModelConfig {
  return removeUndefined({
    id: model.id,
    name: model.name,
    displayName: model.display_name,
    providerId: model.provider_id,
    protocolProfile: model.protocol_profile,
    protocol: model.protocol,
    useBearerAuth: model.use_bearer_auth,
    supportsBeta: model.supports_beta,
    type: model.type,
    capabilities: [...model.capabilities],
    contextWindow: model.context_window,
    maxOutputTokens: model.max_output_tokens,
    inputCostPer1k: model.input_cost_per_1k,
    outputCostPer1k: model.output_cost_per_1k,
    providerExpressionProfileId: model.provider_expression_profile_id,
    enabled: model.enabled ?? true,
    options: model.options,
  }) as ModelConfig;
}

function runtimeModelToToml(model: ModelConfig): TomlModelConfig {
  return removeUndefined({
    id: model.id,
    name: model.name,
    display_name: model.displayName,
    provider_id: model.providerId,
    protocol_profile: model.protocolProfile,
    protocol: model.protocol,
    use_bearer_auth: model.useBearerAuth,
    supports_beta: model.supportsBeta,
    type: model.type,
    capabilities: model.capabilities,
    context_window: model.contextWindow,
    max_output_tokens: model.maxOutputTokens,
    input_cost_per_1k: model.inputCostPer1k,
    output_cost_per_1k: model.outputCostPer1k,
    provider_expression_profile_id: model.providerExpressionProfileId,
    enabled: model.enabled,
    options: model.options,
  }) as TomlModelConfig;
}

function tomlDefaultModelsToRuntime(
  defaults: Partial<Record<ModelType, TomlModelRefConfig>>,
): TypeDefaultModels {
  return mapRecordValues(defaults, tomlModelRefToRuntime) as TypeDefaultModels;
}

function runtimeDefaultModelsToToml(
  defaults: TypeDefaultModels,
): Partial<Record<ModelType, TomlModelRefConfig>> {
  return mapRecordValues(defaults, runtimeModelRefToToml) as Partial<
    Record<ModelType, TomlModelRefConfig>
  >;
}

function tomlDefaultModelPurposesToRuntime(
  defaults: Record<string, TomlModelRefConfig>,
): PurposeDefaultModels {
  const result: PurposeDefaultModels = {};
  for (const [key, ref] of Object.entries(defaults)) {
    result[tomlModelPurposeKeyToRuntime(key)] = tomlModelRefToRuntime(ref);
  }
  return result;
}

function runtimeDefaultModelPurposesToToml(
  defaults: PurposeDefaultModels,
): Record<string, TomlModelRefConfig> {
  const result: Record<string, TomlModelRefConfig> = {};
  for (const [purpose, ref] of Object.entries(defaults)) {
    if (!ref) continue;
    result[runtimeModelPurposeKeyToToml(purpose)] = runtimeModelRefToToml(ref);
  }
  return result;
}

function tomlModelPurposeKeyToRuntime(key: string): string {
  return key.includes('.') ? key : key.split('_').join('.');
}

function runtimeModelPurposeKeyToToml(purpose: string): string {
  return purpose.split('.').join('_');
}

function tomlModelRefToRuntime(ref: TomlModelRefConfig): ModelRefConfig {
  return {
    providerId: ref.provider_id,
    modelId: ref.model_id,
  };
}

function runtimeModelRefToToml(ref: ModelRefConfig): TomlModelRefConfig {
  return {
    provider_id: ref.providerId,
    model_id: ref.modelId,
  };
}

function tomlModelOverrideToRuntime(model: Partial<TomlModelConfig>): Partial<ModelConfig> {
  return removeUndefined({
    id: model.id,
    name: model.name,
    displayName: model.display_name,
    providerId: model.provider_id,
    protocolProfile: model.protocol_profile,
    protocol: model.protocol,
    useBearerAuth: model.use_bearer_auth,
    supportsBeta: model.supports_beta,
    type: model.type,
    capabilities: model.capabilities ? [...model.capabilities] : undefined,
    contextWindow: model.context_window,
    maxOutputTokens: model.max_output_tokens,
    inputCostPer1k: model.input_cost_per_1k,
    outputCostPer1k: model.output_cost_per_1k,
    providerExpressionProfileId: model.provider_expression_profile_id,
    enabled: model.enabled,
    options: model.options,
  });
}

function runtimeModelOverrideToToml(model: Partial<ModelConfig>): Partial<TomlModelConfig> {
  return removeUndefined({
    id: model.id,
    name: model.name,
    display_name: model.displayName,
    provider_id: model.providerId,
    protocol_profile: model.protocolProfile,
    protocol: model.protocol,
    use_bearer_auth: model.useBearerAuth,
    supports_beta: model.supportsBeta,
    type: model.type,
    capabilities: model.capabilities,
    context_window: model.contextWindow,
    max_output_tokens: model.maxOutputTokens,
    input_cost_per_1k: model.inputCostPer1k,
    output_cost_per_1k: model.outputCostPer1k,
    provider_expression_profile_id: model.providerExpressionProfileId,
    enabled: model.enabled,
    options: model.options,
  });
}

function tomlMcpServerToRuntime(server: TomlMcpServerConfig): MCPServerConfig {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args ? [...server.args] : undefined,
    env: server.env,
    url: server.url,
    enabled: server.enabled ?? true,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools ? [...server.tools] : undefined,
    requestTimeout: server.request_timeout,
  }) as MCPServerConfig;
}

function collectUnsupportedDefaultMediaModelIssues(
  defaults: unknown,
  issues: TomlConfigValidationIssue[],
): void {
  if (defaults === undefined) return;
  issues.push({
    code: 'unsupportedDefaultMediaModelType',
    path: 'default_media_models',
    message:
      'Unsupported default_media_models section. Configure default models under [default_models.llm], [default_models.image], [default_models.video], and [default_models.audio].',
  });
}

function collectUnsupportedProfileSchemaIssues(
  config: Pick<
    NekoTomlConfig,
    'artifact_profiles' | 'creation_profiles' | 'provider_expression_profiles'
  >,
  issues: TomlConfigValidationIssue[],
): void {
  const sectionNames = [
    'artifact_profiles',
    'creation_profiles',
    'provider_expression_profiles',
  ] as const;
  for (const sectionName of sectionNames) {
    if (config[sectionName] === undefined) continue;
    issues.push({
      code: 'unsupportedProfileSchemaSection',
      path: sectionName,
      message:
        `${sectionName} is not a supported TOML profile schema section. ` +
        'Install or contribute Agent profile packages and reference provider_expression_profile_id from model metadata instead.',
    });
  }
}

function collectUnsupportedModelTypeIssues(
  models: readonly TomlModelConfig[] | undefined,
  section: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (!models) return;
  for (const model of models) {
    if (model.type !== undefined && !isModelType(model.type)) {
      issues.push({
        code: 'unsupportedModelType',
        path: `${section}.${model.id}.type`,
        message:
          model.type === 'music'
            ? `Unsupported model type "music" for model ${model.id}. Configure music models as type "audio" with capability "text_to_music".`
            : `Unsupported model type "${String(model.type)}" for model ${model.id}.`,
      });
    }
  }
}

function collectUnsupportedProviderIssues(
  providers: readonly TomlProviderConfig[] | undefined,
  section: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (!providers) return;
  for (const provider of providers) {
    collectProviderValueIssues(provider, `${section}.${provider.id}`, issues);
  }
}

function collectUnsupportedProviderOverrideIssues(
  overrides: Record<string, Partial<TomlProviderConfig>> | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (!overrides) return;
  for (const [providerId, override] of Object.entries(overrides)) {
    collectProviderValueIssues(override, `provider_overrides.${providerId}`, issues);
  }
}

function collectProviderValueIssues(
  provider: Partial<TomlProviderConfig>,
  path: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (provider.type !== undefined && !isProviderType(provider.type)) {
    issues.push({
      code: 'unsupportedProviderType',
      path: `${path}.type`,
      message: `Unsupported provider type "${String(provider.type)}" at ${path}.type. Supported values: ${formatAllowedValues(PROVIDER_TYPES)}.`,
    });
  }
  if (
    provider.connection_kind !== undefined &&
    !isProviderConnectionKind(provider.connection_kind)
  ) {
    issues.push({
      code: 'unsupportedProviderConnectionKind',
      path: `${path}.connection_kind`,
      message: `Unsupported provider connection_kind "${String(provider.connection_kind)}" at ${path}.connection_kind. Supported values: ${formatAllowedValues(PROVIDER_CONNECTION_KINDS)}.`,
    });
  }
  if (
    provider.protocol_profile !== undefined &&
    !isProviderProtocolProfile(provider.protocol_profile)
  ) {
    issues.push({
      code: 'unsupportedProviderProtocolProfile',
      path: `${path}.protocol_profile`,
      message: `Unsupported provider protocol_profile "${String(provider.protocol_profile)}" at ${path}.protocol_profile. Supported values: ${formatAllowedValues(PROVIDER_PROTOCOL_PROFILES)}. DeepSeek direct endpoints use "openai-chat".`,
    });
  }
  if (provider.support_level !== undefined && !isProviderSupportLevel(provider.support_level)) {
    issues.push({
      code: 'unsupportedProviderSupportLevel',
      path: `${path}.support_level`,
      message: `Unsupported provider support_level "${String(provider.support_level)}" at ${path}.support_level. Supported values: ${formatAllowedValues(PROVIDER_SUPPORT_LEVELS)}.`,
    });
  }
  collectProtocolVariantIssues(provider.protocol_variant, `${path}.protocol_variant`, issues);
}

function collectProtocolVariantIssues(
  variant: TomlProtocolVariant | undefined,
  path: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (!variant) return;
  if (variant.auth_type !== undefined && !isAuthType(variant.auth_type)) {
    issues.push({
      code: 'unsupportedProtocolAuthType',
      path: `${path}.auth_type`,
      message: `Unsupported protocol_variant auth_type "${String(variant.auth_type)}" at ${path}.auth_type. Supported values: ${formatAllowedValues(AUTH_TYPES)}.`,
    });
  }
  if (variant.stream_format !== undefined && !isStreamFormat(variant.stream_format)) {
    issues.push({
      code: 'unsupportedProtocolStreamFormat',
      path: `${path}.stream_format`,
      message: `Unsupported protocol_variant stream_format "${String(variant.stream_format)}" at ${path}.stream_format. Supported values: ${formatAllowedValues(STREAM_FORMATS)}.`,
    });
  }
}

function collectUnsupportedModelOverrideTypeIssues(
  overrides: Record<string, Partial<TomlModelConfig>> | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (!overrides) return;
  for (const [modelId, override] of Object.entries(overrides)) {
    if (override.type !== undefined && !isModelType(override.type)) {
      issues.push({
        code: 'unsupportedModelType',
        path: `model_overrides.${modelId}.type`,
        message:
          override.type === 'music'
            ? `Unsupported model override type "music" for model ${modelId}. Configure music models as type "audio" with capability "text_to_music".`
            : `Unsupported model override type "${String(override.type)}" for model ${modelId}.`,
      });
    }
  }
}

function collectUnsupportedModelProtocolProfileIssues(
  models: readonly TomlModelConfig[] | undefined,
  section: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (!models) return;
  for (const model of models) {
    if (
      model.protocol_profile !== undefined &&
      !isProviderProtocolProfile(model.protocol_profile)
    ) {
      issues.push({
        code: 'unsupportedModelProtocolProfile',
        path: `${section}.${model.id}.protocol_profile`,
        message: `Unsupported model protocol_profile "${String(model.protocol_profile)}" for model ${model.id}. Supported values: ${formatAllowedValues(PROVIDER_PROTOCOL_PROFILES)}.`,
      });
    }
  }
}

function collectUnsupportedModelProtocolIssues(
  models: readonly TomlModelConfig[] | undefined,
  section: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (!models) return;
  for (const model of models) {
    if (model.protocol !== undefined && !isProviderType(model.protocol)) {
      issues.push({
        code: 'unsupportedModelProtocol',
        path: `${section}.${model.id}.protocol`,
        message: `Unsupported model protocol "${String(model.protocol)}" for model ${model.id}. Supported values: ${formatAllowedValues(PROVIDER_TYPES)}.`,
      });
    }
  }
}

function collectDefaultTokenIssues(
  defaults: TomlDefaultsConfig | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (defaults?.max_tokens !== undefined && !isPositiveInteger(defaults.max_tokens)) {
    issues.push({
      code: 'invalidDefaultMaxTokens',
      path: 'defaults.max_tokens',
      message: `[defaults].max_tokens must be a positive integer output-token cap, got ${String(defaults.max_tokens)}.`,
    });
  }
}

function collectModelTokenIssues(
  models: readonly TomlModelConfig[] | undefined,
  section: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (!models) return;
  for (const model of models) {
    collectModelTokenValueIssues(model, `${section}.${model.id}`, issues);
  }
}

function collectModelOverrideTokenIssues(
  overrides: Record<string, Partial<TomlModelConfig>> | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (!overrides) return;
  for (const [modelId, override] of Object.entries(overrides)) {
    collectModelTokenValueIssues(override, `model_overrides.${modelId}`, issues);
  }
}

function collectModelTokenValueIssues(
  model: Pick<Partial<TomlModelConfig>, 'context_window' | 'max_output_tokens'>,
  path: string,
  issues: TomlConfigValidationIssue[],
): void {
  if (model.context_window !== undefined && !isPositiveInteger(model.context_window)) {
    issues.push({
      code: 'invalidModelTokenMetadata',
      path: `${path}.context_window`,
      message: `${path}.context_window must be a positive integer input context window, got ${String(model.context_window)}.`,
    });
  }
  if (model.max_output_tokens !== undefined && !isPositiveInteger(model.max_output_tokens)) {
    issues.push({
      code: 'invalidModelTokenMetadata',
      path: `${path}.max_output_tokens`,
      message: `${path}.max_output_tokens must be a positive integer model output cap, got ${String(model.max_output_tokens)}.`,
    });
  }
}

function collectUnsupportedModelOverrideProtocolProfileIssues(
  overrides: Record<string, Partial<TomlModelConfig>> | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (!overrides) return;
  for (const [modelId, override] of Object.entries(overrides)) {
    if (
      override.protocol_profile !== undefined &&
      !isProviderProtocolProfile(override.protocol_profile)
    ) {
      issues.push({
        code: 'unsupportedModelProtocolProfile',
        path: `model_overrides.${modelId}.protocol_profile`,
        message: `Unsupported model override protocol_profile "${String(override.protocol_profile)}" for model ${modelId}. Supported values: ${formatAllowedValues(PROVIDER_PROTOCOL_PROFILES)}.`,
      });
    }
  }
}

function collectUnsupportedModelOverrideProtocolIssues(
  overrides: Record<string, Partial<TomlModelConfig>> | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (!overrides) return;
  for (const [modelId, override] of Object.entries(overrides)) {
    if (override.protocol !== undefined && !isProviderType(override.protocol)) {
      issues.push({
        code: 'unsupportedModelProtocol',
        path: `model_overrides.${modelId}.protocol`,
        message: `Unsupported model override protocol "${String(override.protocol)}" for model ${modelId}. Supported values: ${formatAllowedValues(PROVIDER_TYPES)}.`,
      });
    }
  }
}

function collectDefaultModelIssues(
  defaults: Partial<Record<ModelType, TomlModelRefConfig>> | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (!defaults) return;
  for (const [key, ref] of Object.entries(defaults)) {
    if (!isModelType(key)) {
      issues.push({
        code: 'unsupportedDefaultModelType',
        path: `default_models.${key}`,
        message: `Unsupported default_models key: ${key}. Use llm, image, video, or audio.`,
      });
      continue;
    }
    if (!isTomlModelRefConfig(ref)) {
      issues.push({
        code: 'unsupportedDefaultModelType',
        path: `default_models.${key}`,
        message: `Invalid default_models.${key}. Expected provider_id and model_id strings.`,
      });
    }
  }
}

function collectDefaultModelPurposeIssues(
  defaults: Record<string, TomlModelRefConfig> | undefined,
  issues: TomlConfigValidationIssue[],
): void {
  if (!defaults) return;
  for (const [key, ref] of Object.entries(defaults)) {
    if (!isTomlModelRefConfig(ref)) {
      issues.push({
        code: 'unsupportedDefaultModelPurpose',
        path: `default_model_purposes.${key}`,
        message: `Invalid default_model_purposes.${key}. Expected provider_id and model_id strings.`,
      });
    }
  }
}

function isModelType(value: unknown): value is ModelType {
  return isAllowedString(value, MODEL_TYPES);
}

function isProviderType(value: unknown): value is ProviderConfig['type'] {
  return isAllowedString(value, PROVIDER_TYPES);
}

function isProviderConnectionKind(value: unknown): value is ProviderConfig['connectionKind'] {
  return isAllowedString(value, PROVIDER_CONNECTION_KINDS);
}

function isProviderProtocolProfile(value: unknown): value is ProviderConfig['protocolProfile'] {
  return isAllowedString(value, PROVIDER_PROTOCOL_PROFILES);
}

function isProviderSupportLevel(value: unknown): value is ProviderConfig['supportLevel'] {
  return isAllowedString(value, PROVIDER_SUPPORT_LEVELS);
}

function isAuthType(value: unknown): value is ProtocolVariant['authType'] {
  return isAllowedString(value, AUTH_TYPES);
}

function isStreamFormat(value: unknown): value is ProtocolVariant['streamFormat'] {
  return isAllowedString(value, STREAM_FORMATS);
}

function isAllowedString<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.some((entry) => entry === value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function formatAllowedValues(values: readonly string[]): string {
  return values.map((value) => `"${value}"`).join(', ');
}

function isTomlModelRefConfig(value: unknown): value is TomlModelRefConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Partial<TomlModelRefConfig>).provider_id === 'string' &&
    typeof (value as Partial<TomlModelRefConfig>).model_id === 'string'
  );
}

function runtimeMcpServerToToml(server: MCPServerConfig): TomlMcpServerConfig {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    enabled: server.enabled,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools,
    request_timeout: server.requestTimeout,
  }) as TomlMcpServerConfig;
}

function tomlExternalResearchToRuntime(
  config: TomlExternalResearchConfig,
): ExternalResearchConfigInput {
  return removeUndefined({
    mode: config.mode,
    providerId: config.provider_id,
    requireApprovalForLive: config.require_approval_for_live,
    allowProjectContextInQuery: config.allow_project_context_in_query,
    maxResults: config.max_results,
    maxFetchContentTokens: config.max_fetch_content_tokens,
    allowedDomains: config.allowed_domains ? [...config.allowed_domains] : undefined,
    blockedDomains: config.blocked_domains ? [...config.blocked_domains] : undefined,
    mcp: config.mcp ? tomlExternalResearchMcpToRuntime(config.mcp) : undefined,
  });
}

function runtimeExternalResearchToToml(
  config: ExternalResearchConfigInput,
): TomlExternalResearchConfig {
  return removeUndefined({
    mode: config.mode,
    provider_id: config.providerId,
    require_approval_for_live: config.requireApprovalForLive,
    allow_project_context_in_query: config.allowProjectContextInQuery,
    max_results: config.maxResults,
    max_fetch_content_tokens: config.maxFetchContentTokens,
    allowed_domains: config.allowedDomains,
    blocked_domains: config.blockedDomains,
    mcp: config.mcp ? runtimeExternalResearchMcpToToml(config.mcp) : undefined,
  }) as TomlExternalResearchConfig;
}

function tomlExternalResearchMcpToRuntime(
  config: TomlExternalResearchMcpProviderConfig,
): ExternalResearchMcpProviderConfig {
  return removeUndefined({
    serverId: config.server_id,
    searchTool: tomlExternalResearchSearchToolToRuntime(config.search_tool),
    fetchTool: config.fetch_tool
      ? tomlExternalResearchFetchToolToRuntime(config.fetch_tool)
      : undefined,
    exposeBoundToolsAsRawMcp: config.expose_bound_tools_as_raw_mcp,
  }) as ExternalResearchMcpProviderConfig;
}

function runtimeExternalResearchMcpToToml(
  config: ExternalResearchMcpProviderConfig,
): TomlExternalResearchMcpProviderConfig {
  return removeUndefined({
    server_id: config.serverId,
    search_tool: runtimeExternalResearchSearchToolToToml(config.searchTool),
    fetch_tool: config.fetchTool
      ? runtimeExternalResearchFetchToolToToml(config.fetchTool)
      : undefined,
    expose_bound_tools_as_raw_mcp: config.exposeBoundToolsAsRawMcp,
  }) as TomlExternalResearchMcpProviderConfig;
}

function tomlExternalResearchSearchToolToRuntime(
  binding: TomlExternalResearchMcpSearchToolBinding,
): ExternalResearchMcpSearchToolBinding {
  return removeUndefined({
    name: binding.name,
    queryArg: binding.query_arg,
    maxResultsArg: binding.max_results_arg,
    allowedDomainsArg: binding.allowed_domains_arg,
    blockedDomainsArg: binding.blocked_domains_arg,
    outputSchema: binding.output_schema,
  }) as ExternalResearchMcpSearchToolBinding;
}

function runtimeExternalResearchSearchToolToToml(
  binding: ExternalResearchMcpSearchToolBinding,
): TomlExternalResearchMcpSearchToolBinding {
  return removeUndefined({
    name: binding.name,
    query_arg: binding.queryArg,
    max_results_arg: binding.maxResultsArg,
    allowed_domains_arg: binding.allowedDomainsArg,
    blocked_domains_arg: binding.blockedDomainsArg,
    output_schema: binding.outputSchema,
  }) as TomlExternalResearchMcpSearchToolBinding;
}

function tomlExternalResearchFetchToolToRuntime(
  binding: TomlExternalResearchMcpFetchToolBinding,
): ExternalResearchMcpFetchToolBinding {
  return removeUndefined({
    name: binding.name,
    urlArg: binding.url_arg,
    maxContentTokensArg: binding.max_content_tokens_arg,
    allowedDomainsArg: binding.allowed_domains_arg,
    blockedDomainsArg: binding.blocked_domains_arg,
    outputSchema: binding.output_schema,
  }) as ExternalResearchMcpFetchToolBinding;
}

function runtimeExternalResearchFetchToolToToml(
  binding: ExternalResearchMcpFetchToolBinding,
): TomlExternalResearchMcpFetchToolBinding {
  return removeUndefined({
    name: binding.name,
    url_arg: binding.urlArg,
    max_content_tokens_arg: binding.maxContentTokensArg,
    allowed_domains_arg: binding.allowedDomainsArg,
    blocked_domains_arg: binding.blockedDomainsArg,
    output_schema: binding.outputSchema,
  }) as TomlExternalResearchMcpFetchToolBinding;
}

function tomlMcpServerOverrideToRuntime(
  server: Partial<TomlMcpServerConfig>,
): Partial<MCPServerConfig> {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args ? [...server.args] : undefined,
    env: server.env,
    url: server.url,
    enabled: server.enabled,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools ? [...server.tools] : undefined,
    requestTimeout: server.request_timeout,
  });
}

function runtimeMcpServerOverrideToToml(
  server: Partial<MCPServerConfig>,
): Partial<TomlMcpServerConfig> {
  return removeUndefined({
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    enabled: server.enabled,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools,
    request_timeout: server.requestTimeout,
  });
}

function collectDuplicateIdIssues(
  entries: readonly { readonly id: string }[] | undefined,
  section: string,
  code: TomlConfigValidationIssue['code'],
  issues: TomlConfigValidationIssue[],
): void {
  if (!entries) return;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      issues.push({
        code,
        path: `${section}.${entry.id}`,
        message: `Duplicate ${section} id: ${entry.id}`,
      });
      continue;
    }
    seen.add(entry.id);
  }
}

function mapRecordValues<TInput, TOutput>(
  value: Record<string, TInput>,
  mapper: (input: TInput) => TOutput,
): Record<string, TOutput> {
  const output: Record<string, TOutput> = {};
  for (const [key, recordValue] of Object.entries(value)) {
    output[key] = mapper(recordValue);
  }
  return output;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue !== undefined) {
      output[key] = entryValue;
    }
  }
  return output as T;
}
