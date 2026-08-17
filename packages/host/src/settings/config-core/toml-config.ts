import type { MCPServerConfig } from '@neko/agent-contracts';
import type {
  ModelConfig,
  ModelRefConfig,
  ModelType,
  PurposeDefaultModels,
  ProviderConfig,
  ProtocolVariant,
  TypeDefaultModels,
} from '@neko/ai-contracts';
import type {
  ExternalResearchConfigInput,
  ExternalResearchFetchOutputSchema,
  ExternalResearchMcpFetchToolBinding,
  ExternalResearchMcpProviderConfig,
  ExternalResearchMcpSearchToolBinding,
  ExternalResearchMode,
  ExternalResearchSearchOutputSchema,
} from '@neko/agent-contracts';
import {
  AUTH_TYPES,
  MODEL_TYPES,
  PROVIDER_CONNECTION_KINDS,
  PROVIDER_PROTOCOL_PROFILES,
  PROVIDER_SUPPORT_LEVELS,
  PROVIDER_TYPES,
  STREAM_FORMATS,
} from '@neko/ai-contracts';
import { parse, stringify } from 'smol-toml';
import type { ProviderDefinition, UnifiedConfig } from './types';

export interface NekoTomlConfig {
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
  readonly api_key?: unknown;
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
  readonly cwd?: string;
  readonly inherit_process_env?: boolean;
  readonly url?: string;
  readonly headers?: Record<string, string>;
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
    | 'invalidConfigField'
    | 'unsupportedProviderType'
    | 'unsupportedProviderConnectionKind'
    | 'unsupportedProviderProtocolProfile'
    | 'unsupportedProviderSupportLevel'
    | 'unsupportedProtocolAuthType'
    | 'unsupportedProtocolStreamFormat'
    | 'unsupportedModelProtocolProfile'
    | 'duplicateProviderId'
    | 'duplicateModelId'
    | 'invalidDefaultMaxTokens'
    | 'invalidModelTokenMetadata'
    | 'invalidProviderApiKey'
    | 'unsupportedModelType'
    | 'unsupportedDefaultModelType'
    | 'unsupportedDefaultModelPurpose';
  readonly path: string;
  readonly message: string;
}

export type ProviderCredentialDeclaration =
  | {
      readonly status: 'configured';
      readonly apiKey: string;
    }
  | {
      readonly status: 'invalid';
    };

export interface TomlConfigProjection {
  readonly config: UnifiedConfig;
  readonly diagnostics: readonly TomlConfigValidationIssue[];
  readonly providerCredentials: Readonly<Record<string, ProviderCredentialDeclaration>>;
}

export function tomlToUnifiedConfig(config: unknown): UnifiedConfig {
  return projectTomlConfig(config).config;
}

export function projectTomlConfig(value: unknown): TomlConfigProjection {
  const diagnostics: TomlConfigValidationIssue[] = [];
  const root = readRecord(value);
  if (!root) {
    diagnostics.push(invalidField('', 'Configuration root must be a table.'));
    return { config: {}, diagnostics, providerCredentials: {} };
  }

  const providerCredentials: Record<string, ProviderCredentialDeclaration> = {};
  const providers = decodeProviders(root['providers'], diagnostics, providerCredentials);
  const models = decodeModels(root['models'], diagnostics);
  const mcpServers = decodeMcpServers(root['mcp_servers'], diagnostics);
  const defaultModels = decodeModelRefs(
    root['default_models'],
    'default_models',
    diagnostics,
    true,
  );
  const defaultModelPurposes = decodeModelRefs(
    root['default_model_purposes'],
    'default_model_purposes',
    diagnostics,
    false,
  );
  const defaults = decodeDefaults(root['defaults'], diagnostics);

  const config: UnifiedConfig = {
    ...(defaultModels ? { defaultModels: tomlDefaultModelsToRuntime(defaultModels) } : {}),
    ...(defaultModelPurposes
      ? { defaultModelPurposes: tomlDefaultModelPurposesToRuntime(defaultModelPurposes) }
      : {}),
    ...defaults,
    ...decodeTopLevelScalars(root, diagnostics),
    ...(Array.isArray(root['providers'])
      ? { providers: providers.map(tomlProviderToRuntime) }
      : {}),
    ...(Array.isArray(root['models']) ? { models: models.map(tomlModelToRuntime) } : {}),
    ...(Array.isArray(root['mcp_servers'])
      ? { mcpServers: mcpServers.map(tomlMcpServerToRuntime) }
      : {}),
    ...decodeExternalResearch(root['external_research'], diagnostics),
  };
  return { config, diagnostics, providerCredentials: Object.freeze(providerCredentials) };
}

export function parseTomlConfigText(source: string): UnifiedConfig {
  return tomlToUnifiedConfig(parse(source));
}

export function unifiedConfigToToml(
  config: UnifiedConfig,
  providerCredentials: Readonly<Record<string, ProviderCredentialDeclaration>> = {},
): NekoTomlConfig {
  return {
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
    ...(config.providers
      ? {
          providers: config.providers.map((provider) =>
            runtimeProviderToToml(provider, providerCredentials[provider.id]),
          ),
        }
      : {}),
    ...(config.models ? { models: config.models.map(runtimeModelToToml) } : {}),
    ...(config.mcpServers ? { mcp_servers: config.mcpServers.map(runtimeMcpServerToToml) } : {}),
    ...(config.externalResearch !== undefined
      ? { external_research: runtimeExternalResearchToToml(config.externalResearch) }
      : {}),
  };
}

export function serializeUnifiedConfigToToml(config: UnifiedConfig): string {
  return stringify(unifiedConfigToToml(config));
}

export function validateTomlConfig(config: unknown): readonly TomlConfigValidationIssue[] {
  return projectTomlConfig(config).diagnostics;
}

function decodeProviders(
  value: unknown,
  issues: TomlConfigValidationIssue[],
  credentials: Record<string, ProviderCredentialDeclaration>,
): TomlProviderConfig[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(invalidField('providers', 'providers must be an array of tables.'));
    return [];
  }
  const decoded: TomlProviderConfig[] = [];
  for (const [index, entry] of value.entries()) {
    const record = readRecord(entry);
    const indexPath = `providers[${index}]`;
    if (!record) {
      issues.push(invalidField(indexPath, 'Provider entry must be a table.'));
      continue;
    }
    const id = readRequiredString(record, 'id', indexPath, issues);
    const path = id ? `providers.${id}` : indexPath;
    const startIssueCount = issues.length;
    const name = readRequiredString(record, 'name', path, issues);
    const type = readAllowedString(
      record,
      'type',
      path,
      PROVIDER_TYPES,
      'unsupportedProviderType',
      issues,
    );
    const apiUrl = readOptionalString(record, 'api_url', path, issues);
    const displayName = readOptionalString(record, 'display_name', path, issues);
    const enabled = readOptionalBoolean(record, 'enabled', path, issues);
    const connectionKind = readAllowedString(
      record,
      'connection_kind',
      path,
      PROVIDER_CONNECTION_KINDS,
      'unsupportedProviderConnectionKind',
      issues,
    );
    const protocolProfile = readAllowedString(
      record,
      'protocol_profile',
      path,
      PROVIDER_PROTOCOL_PROFILES,
      'unsupportedProviderProtocolProfile',
      issues,
    );
    const supportLevel = readAllowedString(
      record,
      'support_level',
      path,
      PROVIDER_SUPPORT_LEVELS,
      'unsupportedProviderSupportLevel',
      issues,
    );
    const requiresApiKey = readOptionalBoolean(record, 'requires_api_key', path, issues);
    const builtin = readOptionalBoolean(record, 'builtin', path, issues);
    const supportsBeta = readOptionalBoolean(record, 'supports_beta', path, issues);
    const useBearerAuth = readOptionalBoolean(record, 'use_bearer_auth', path, issues);
    const options = readOptionalRecord(record, 'options', path, issues);
    const protocolVariant = decodeProtocolVariant(
      record['protocol_variant'],
      `${path}.protocol_variant`,
      issues,
    );

    if (id && Object.hasOwn(record, 'api_key')) {
      const apiKey = record['api_key'];
      if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
        credentials[id] = { status: 'configured', apiKey };
      } else {
        credentials[id] = { status: 'invalid' };
        issues.push({
          code: 'invalidProviderApiKey',
          path: `${path}.api_key`,
          message: `${path}.api_key must be a non-empty string.`,
        });
      }
    }
    const hasRecordIssue = issues
      .slice(startIssueCount)
      .some((issue) => issue.code !== 'invalidProviderApiKey');
    if (!id || !name || !type || hasRecordIssue) continue;
    decoded.push({
      id,
      name,
      type,
      ...(displayName === undefined ? {} : { display_name: displayName }),
      ...(apiUrl === undefined ? {} : { api_url: apiUrl }),
      ...(enabled === undefined ? {} : { enabled }),
      ...(connectionKind === undefined ? {} : { connection_kind: connectionKind }),
      ...(protocolProfile === undefined ? {} : { protocol_profile: protocolProfile }),
      ...(supportLevel === undefined ? {} : { support_level: supportLevel }),
      ...(requiresApiKey === undefined ? {} : { requires_api_key: requiresApiKey }),
      ...(builtin === undefined ? {} : { builtin }),
      ...(supportsBeta === undefined ? {} : { supports_beta: supportsBeta }),
      ...(useBearerAuth === undefined ? {} : { use_bearer_auth: useBearerAuth }),
      ...(options === undefined ? {} : { options }),
      ...(protocolVariant === undefined ? {} : { protocol_variant: protocolVariant }),
    });
  }
  const duplicateIds = collectDuplicateIds(decoded, 'providers', 'duplicateProviderId', issues);
  for (const id of duplicateIds) delete credentials[id];
  return decoded.filter((provider) => !duplicateIds.has(provider.id));
}

function decodeModels(value: unknown, issues: TomlConfigValidationIssue[]): TomlModelConfig[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(invalidField('models', 'models must be an array of tables.'));
    return [];
  }
  const decoded: TomlModelConfig[] = [];
  for (const [index, entry] of value.entries()) {
    const record = readRecord(entry);
    const indexPath = `models[${index}]`;
    if (!record) {
      issues.push(invalidField(indexPath, 'Model entry must be a table.'));
      continue;
    }
    const id = readRequiredString(record, 'id', indexPath, issues);
    const path = id ? `models.${id}` : indexPath;
    const startIssueCount = issues.length;
    const name = readRequiredString(record, 'name', path, issues);
    const providerId = readRequiredString(record, 'provider_id', path, issues);
    const capabilities = readRequiredStringArray(record, 'capabilities', path, issues);
    const displayName = readOptionalString(record, 'display_name', path, issues);
    const protocolProfile = readAllowedString(
      record,
      'protocol_profile',
      path,
      PROVIDER_PROTOCOL_PROFILES,
      'unsupportedModelProtocolProfile',
      issues,
    );
    const type = readAllowedString(
      record,
      'type',
      path,
      MODEL_TYPES,
      'unsupportedModelType',
      issues,
    );
    const useBearerAuth = readOptionalBoolean(record, 'use_bearer_auth', path, issues);
    const supportsBeta = readOptionalBoolean(record, 'supports_beta', path, issues);
    const contextWindow = readOptionalPositiveInteger(
      record,
      'context_window',
      path,
      'invalidModelTokenMetadata',
      issues,
    );
    const maxOutputTokens = readOptionalPositiveInteger(
      record,
      'max_output_tokens',
      path,
      'invalidModelTokenMetadata',
      issues,
    );
    const inputCost = readOptionalFiniteNumber(record, 'input_cost_per_1k', path, issues);
    const outputCost = readOptionalFiniteNumber(record, 'output_cost_per_1k', path, issues);
    const enabled = readOptionalBoolean(record, 'enabled', path, issues);
    const options = readOptionalRecord(record, 'options', path, issues);
    if (Object.hasOwn(record, 'provider_expression_profile_id')) {
      issues.push(
        invalidField(
          `${path}.provider_expression_profile_id`,
          'provider_expression_profile_id is obsolete; use ordinary Skills for provider-neutral expression guidance.',
        ),
      );
    }
    if (!id || !name || !providerId || !capabilities || issues.length > startIssueCount) continue;
    decoded.push({
      id,
      name,
      provider_id: providerId,
      capabilities,
      ...(displayName === undefined ? {} : { display_name: displayName }),
      ...(protocolProfile === undefined ? {} : { protocol_profile: protocolProfile }),
      ...(type === undefined ? {} : { type }),
      ...(useBearerAuth === undefined ? {} : { use_bearer_auth: useBearerAuth }),
      ...(supportsBeta === undefined ? {} : { supports_beta: supportsBeta }),
      ...(contextWindow === undefined ? {} : { context_window: contextWindow }),
      ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
      ...(inputCost === undefined ? {} : { input_cost_per_1k: inputCost }),
      ...(outputCost === undefined ? {} : { output_cost_per_1k: outputCost }),
      ...(enabled === undefined ? {} : { enabled }),
      ...(options === undefined ? {} : { options }),
    });
  }
  const duplicateIds = collectDuplicateIds(decoded, 'models', 'duplicateModelId', issues);
  return decoded.filter((model) => !duplicateIds.has(model.id));
}

function decodeMcpServers(
  value: unknown,
  issues: TomlConfigValidationIssue[],
): TomlMcpServerConfig[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(invalidField('mcp_servers', 'mcp_servers must be an array of tables.'));
    return [];
  }
  const decoded: TomlMcpServerConfig[] = [];
  for (const [index, entry] of value.entries()) {
    const record = readRecord(entry);
    const indexPath = `mcp_servers[${index}]`;
    if (!record) {
      issues.push(invalidField(indexPath, 'MCP server entry must be a table.'));
      continue;
    }
    const id = readRequiredString(record, 'id', indexPath, issues);
    const path = id ? `mcp_servers.${id}` : indexPath;
    const startIssueCount = issues.length;
    const name = readRequiredString(record, 'name', path, issues);
    const description = readRequiredString(record, 'description', path, issues);
    const category = readAllowedString(
      record,
      'category',
      path,
      ['filesystem', 'database', 'api', 'development', 'productivity', 'ai', 'other'] as const,
      'invalidConfigField',
      issues,
    );
    const transport = readAllowedString(
      record,
      'transport',
      path,
      ['stdio', 'http'] as const,
      'invalidConfigField',
      issues,
    );
    const command = readOptionalString(record, 'command', path, issues);
    const args = readOptionalStringArray(record, 'args', path, issues);
    const env = readOptionalStringRecord(record, 'env', path, issues);
    const cwd = readOptionalString(record, 'cwd', path, issues);
    const inheritProcessEnv = readOptionalBoolean(record, 'inherit_process_env', path, issues);
    const url = readOptionalString(record, 'url', path, issues);
    const headers = readOptionalStringRecord(record, 'headers', path, issues);
    const enabled = readOptionalBoolean(record, 'enabled', path, issues);
    const builtin = readOptionalBoolean(record, 'builtin', path, issues);
    const homepage = readOptionalString(record, 'homepage', path, issues);
    const tools = decodeMcpTools(record['tools'], `${path}.tools`, issues);
    const requestTimeout = readOptionalPositiveInteger(
      record,
      'request_timeout',
      path,
      'invalidConfigField',
      issues,
    );
    if (
      !id ||
      !name ||
      description === undefined ||
      !category ||
      !transport ||
      issues.length > startIssueCount
    ) {
      continue;
    }
    decoded.push({
      id,
      name,
      description,
      category,
      transport,
      ...(command === undefined ? {} : { command }),
      ...(args === undefined ? {} : { args }),
      ...(env === undefined ? {} : { env }),
      ...(cwd === undefined ? {} : { cwd }),
      ...(inheritProcessEnv === undefined ? {} : { inherit_process_env: inheritProcessEnv }),
      ...(url === undefined ? {} : { url }),
      ...(headers === undefined ? {} : { headers }),
      ...(enabled === undefined ? {} : { enabled }),
      ...(builtin === undefined ? {} : { builtin }),
      ...(homepage === undefined ? {} : { homepage }),
      ...(tools === undefined ? {} : { tools }),
      ...(requestTimeout === undefined ? {} : { request_timeout: requestTimeout }),
    });
  }
  const duplicateIds = collectDuplicateIds(decoded, 'mcp_servers', 'invalidConfigField', issues);
  return decoded.filter((server) => !duplicateIds.has(server.id));
}

function decodeMcpTools(
  value: unknown,
  path: string,
  issues: TomlConfigValidationIssue[],
): readonly NonNullable<MCPServerConfig['tools']>[number][] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push(invalidField(path, `${path} must be an array of tables.`));
    return undefined;
  }
  const tools: NonNullable<MCPServerConfig['tools']>[number][] = [];
  for (const [index, entry] of value.entries()) {
    const record = readRecord(entry);
    const entryPath = `${path}[${index}]`;
    if (!record) {
      issues.push(invalidField(entryPath, `${entryPath} must be a table.`));
      continue;
    }
    const name = readRequiredString(record, 'name', entryPath, issues);
    const description = readRequiredString(record, 'description', entryPath, issues);
    if (name && description) tools.push({ name, description });
  }
  return tools;
}

function decodeModelRefs(
  value: unknown,
  section: 'default_models' | 'default_model_purposes',
  issues: TomlConfigValidationIssue[],
  restrictKeys: boolean,
): Record<string, TomlModelRefConfig> | undefined {
  if (value === undefined) return undefined;
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField(section, `${section} must be a table.`));
    return undefined;
  }
  const result: Record<string, TomlModelRefConfig> = {};
  for (const [key, entry] of Object.entries(record)) {
    const path = `${section}.${key}`;
    if (restrictKeys && !isModelType(key)) {
      issues.push({
        code: 'unsupportedDefaultModelType',
        path,
        message: `Unsupported default_models key: ${key}. Use llm, image, video, or audio.`,
      });
      continue;
    }
    const ref = readRecord(entry);
    if (!ref) {
      issues.push({
        code: restrictKeys ? 'unsupportedDefaultModelType' : 'unsupportedDefaultModelPurpose',
        path,
        message: `${path} must contain provider_id and model_id strings.`,
      });
      continue;
    }
    const providerId = ref['provider_id'];
    const modelId = ref['model_id'];
    if (
      typeof providerId !== 'string' ||
      providerId.trim().length === 0 ||
      typeof modelId !== 'string' ||
      modelId.trim().length === 0
    ) {
      issues.push({
        code: restrictKeys ? 'unsupportedDefaultModelType' : 'unsupportedDefaultModelPurpose',
        path,
        message: `${path} must contain provider_id and model_id strings.`,
      });
      continue;
    }
    result[key] = { provider_id: providerId, model_id: modelId };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function decodeDefaults(
  value: unknown,
  issues: TomlConfigValidationIssue[],
): Pick<UnifiedConfig, 'maxTokens' | 'temperature'> {
  if (value === undefined) return {};
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField('defaults', 'defaults must be a table.'));
    return {};
  }
  const maxTokens = readOptionalPositiveInteger(
    record,
    'max_tokens',
    'defaults',
    'invalidDefaultMaxTokens',
    issues,
  );
  const temperature = readOptionalFiniteNumber(record, 'temperature', 'defaults', issues);
  return {
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(temperature === undefined ? {} : { temperature }),
  };
}

function decodeTopLevelScalars(
  root: Record<string, unknown>,
  issues: TomlConfigValidationIssue[],
): UnifiedConfig {
  const outputFormat = readAllowedString(
    root,
    'output_format',
    '',
    ['text', 'json', 'markdown'] as const,
    'invalidConfigField',
    issues,
  );
  const executionMode = readAllowedString(
    root,
    'execution_mode',
    '',
    ['plan', 'ask', 'auto'] as const,
    'invalidConfigField',
    issues,
  );
  const skillsDir = readOptionalString(root, 'skills_dir', '', issues);
  const verbose = readOptionalBoolean(root, 'verbose', '', issues);
  const thinkingBudget = readOptionalNonNegativeInteger(root, 'thinking_budget', '', issues);
  const customSystemPrompt = readOptionalString(root, 'custom_system_prompt', '', issues);
  const autoExecuteTools = readOptionalBoolean(root, 'auto_execute_tools', '', issues);
  const streamResponses = readOptionalBoolean(root, 'stream_responses', '', issues);
  const showToolCalls = readOptionalBoolean(root, 'show_tool_calls', '', issues);
  return {
    ...(skillsDir === undefined ? {} : { skillsDir }),
    ...(verbose === undefined ? {} : { verbose }),
    ...(outputFormat === undefined ? {} : { outputFormat }),
    ...(thinkingBudget === undefined ? {} : { thinkingBudget }),
    ...(customSystemPrompt === undefined ? {} : { customSystemPrompt }),
    ...(autoExecuteTools === undefined ? {} : { autoExecuteTools }),
    ...(streamResponses === undefined ? {} : { streamResponses }),
    ...(showToolCalls === undefined ? {} : { showToolCalls }),
    ...(executionMode === undefined ? {} : { executionMode }),
  };
}

function decodeProtocolVariant(
  value: unknown,
  path: string,
  issues: TomlConfigValidationIssue[],
): TomlProtocolVariant | undefined {
  if (value === undefined) return undefined;
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField(path, `${path} must be a table.`));
    return undefined;
  }
  const basePath = readOptionalString(record, 'base_path', path, issues);
  const authType = readAllowedString(
    record,
    'auth_type',
    path,
    AUTH_TYPES,
    'unsupportedProtocolAuthType',
    issues,
  );
  const authHeader = readOptionalString(record, 'auth_header', path, issues);
  const streamFormat = readAllowedString(
    record,
    'stream_format',
    path,
    STREAM_FORMATS,
    'unsupportedProtocolStreamFormat',
    issues,
  );
  const streamDoneMarker = readOptionalString(record, 'stream_done_marker', path, issues);
  const extraHeaders = readOptionalStringRecord(record, 'extra_headers', path, issues);
  const mediaEndpoints = decodeMediaEndpoints(
    record['media_endpoints'],
    `${path}.media_endpoints`,
    issues,
  );
  return {
    ...(basePath === undefined ? {} : { base_path: basePath }),
    ...(authType === undefined ? {} : { auth_type: authType }),
    ...(authHeader === undefined ? {} : { auth_header: authHeader }),
    ...(streamFormat === undefined ? {} : { stream_format: streamFormat }),
    ...(streamDoneMarker === undefined ? {} : { stream_done_marker: streamDoneMarker }),
    ...(extraHeaders === undefined ? {} : { extra_headers: extraHeaders }),
    ...(mediaEndpoints === undefined ? {} : { media_endpoints: mediaEndpoints }),
  };
}

function decodeMediaEndpoints(
  value: unknown,
  path: string,
  issues: TomlConfigValidationIssue[],
): TomlMediaEndpoints | undefined {
  if (value === undefined) return undefined;
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField(path, `${path} must be a table.`));
    return undefined;
  }
  const imageGenerations = readOptionalString(record, 'image_generations', path, issues);
  const videoGenerations = readOptionalString(record, 'video_generations', path, issues);
  const videoStatus = readOptionalString(record, 'video_status', path, issues);
  const videoCancel = readOptionalString(record, 'video_cancel', path, issues);
  return {
    ...(imageGenerations === undefined ? {} : { image_generations: imageGenerations }),
    ...(videoGenerations === undefined ? {} : { video_generations: videoGenerations }),
    ...(videoStatus === undefined ? {} : { video_status: videoStatus }),
    ...(videoCancel === undefined ? {} : { video_cancel: videoCancel }),
  };
}

function decodeExternalResearch(
  value: unknown,
  issues: TomlConfigValidationIssue[],
): Pick<UnifiedConfig, 'externalResearch'> {
  if (value === undefined) return {};
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField('external_research', 'external_research must be a table.'));
    return {};
  }
  const startIssueCount = issues.length;
  const mode = readAllowedString(
    record,
    'mode',
    'external_research',
    ['disabled', 'indexed', 'live'] as const,
    'invalidConfigField',
    issues,
  );
  const providerId = readOptionalString(record, 'provider_id', 'external_research', issues);
  const requireApproval = readOptionalBoolean(
    record,
    'require_approval_for_live',
    'external_research',
    issues,
  );
  const allowProjectContext = readOptionalBoolean(
    record,
    'allow_project_context_in_query',
    'external_research',
    issues,
  );
  const maxResults = readOptionalPositiveInteger(
    record,
    'max_results',
    'external_research',
    'invalidConfigField',
    issues,
  );
  const maxFetchTokens = readOptionalPositiveInteger(
    record,
    'max_fetch_content_tokens',
    'external_research',
    'invalidConfigField',
    issues,
  );
  const allowedDomains = readOptionalStringArray(
    record,
    'allowed_domains',
    'external_research',
    issues,
  );
  const blockedDomains = readOptionalStringArray(
    record,
    'blocked_domains',
    'external_research',
    issues,
  );
  const mcp = decodeExternalResearchMcp(record['mcp'], 'external_research.mcp', issues);
  if (issues.length > startIssueCount) return {};
  const tomlConfig: TomlExternalResearchConfig = {
    ...(mode === undefined ? {} : { mode }),
    ...(providerId === undefined ? {} : { provider_id: providerId }),
    ...(requireApproval === undefined ? {} : { require_approval_for_live: requireApproval }),
    ...(allowProjectContext === undefined
      ? {}
      : { allow_project_context_in_query: allowProjectContext }),
    ...(maxResults === undefined ? {} : { max_results: maxResults }),
    ...(maxFetchTokens === undefined ? {} : { max_fetch_content_tokens: maxFetchTokens }),
    ...(allowedDomains === undefined ? {} : { allowed_domains: allowedDomains }),
    ...(blockedDomains === undefined ? {} : { blocked_domains: blockedDomains }),
    ...(mcp === undefined ? {} : { mcp }),
  };
  return { externalResearch: tomlExternalResearchToRuntime(tomlConfig) };
}

function decodeExternalResearchMcp(
  value: unknown,
  path: string,
  issues: TomlConfigValidationIssue[],
): TomlExternalResearchMcpProviderConfig | undefined {
  if (value === undefined) return undefined;
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField(path, `${path} must be a table.`));
    return undefined;
  }
  const serverId = readRequiredString(record, 'server_id', path, issues);
  const searchTool = decodeExternalResearchSearchTool(
    record['search_tool'],
    `${path}.search_tool`,
    issues,
  );
  const fetchTool = decodeExternalResearchFetchTool(
    record['fetch_tool'],
    `${path}.fetch_tool`,
    issues,
  );
  const exposeRaw = readOptionalBoolean(record, 'expose_bound_tools_as_raw_mcp', path, issues);
  if (!serverId || !searchTool) return undefined;
  return {
    server_id: serverId,
    search_tool: searchTool,
    ...(fetchTool === undefined ? {} : { fetch_tool: fetchTool }),
    ...(exposeRaw === undefined ? {} : { expose_bound_tools_as_raw_mcp: exposeRaw }),
  };
}

function decodeExternalResearchSearchTool(
  value: unknown,
  path: string,
  issues: TomlConfigValidationIssue[],
): TomlExternalResearchMcpSearchToolBinding | undefined {
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField(path, `${path} must be a table.`));
    return undefined;
  }
  const name = readRequiredString(record, 'name', path, issues);
  const queryArg = readRequiredString(record, 'query_arg', path, issues);
  const outputSchema = readAllowedString(
    record,
    'output_schema',
    path,
    ['neko.externalResearch.search'] as const,
    'invalidConfigField',
    issues,
  );
  const maxResultsArg = readOptionalString(record, 'max_results_arg', path, issues);
  const allowedDomainsArg = readOptionalString(record, 'allowed_domains_arg', path, issues);
  const blockedDomainsArg = readOptionalString(record, 'blocked_domains_arg', path, issues);
  if (!name || !queryArg || !outputSchema) return undefined;
  return {
    name,
    query_arg: queryArg,
    output_schema: outputSchema,
    ...(maxResultsArg === undefined ? {} : { max_results_arg: maxResultsArg }),
    ...(allowedDomainsArg === undefined ? {} : { allowed_domains_arg: allowedDomainsArg }),
    ...(blockedDomainsArg === undefined ? {} : { blocked_domains_arg: blockedDomainsArg }),
  };
}

function decodeExternalResearchFetchTool(
  value: unknown,
  path: string,
  issues: TomlConfigValidationIssue[],
): TomlExternalResearchMcpFetchToolBinding | undefined {
  if (value === undefined) return undefined;
  const record = readRecord(value);
  if (!record) {
    issues.push(invalidField(path, `${path} must be a table.`));
    return undefined;
  }
  const name = readRequiredString(record, 'name', path, issues);
  const urlArg = readRequiredString(record, 'url_arg', path, issues);
  const outputSchema = readAllowedString(
    record,
    'output_schema',
    path,
    ['neko.externalResearch.fetch'] as const,
    'invalidConfigField',
    issues,
  );
  const maxTokensArg = readOptionalString(record, 'max_content_tokens_arg', path, issues);
  const allowedDomainsArg = readOptionalString(record, 'allowed_domains_arg', path, issues);
  const blockedDomainsArg = readOptionalString(record, 'blocked_domains_arg', path, issues);
  if (!name || !urlArg || !outputSchema) return undefined;
  return {
    name,
    url_arg: urlArg,
    output_schema: outputSchema,
    ...(maxTokensArg === undefined ? {} : { max_content_tokens_arg: maxTokensArg }),
    ...(allowedDomainsArg === undefined ? {} : { allowed_domains_arg: allowedDomainsArg }),
    ...(blockedDomainsArg === undefined ? {} : { blocked_domains_arg: blockedDomainsArg }),
  };
}

function collectDuplicateIds<T extends { readonly id: string }>(
  entries: readonly T[],
  section: string,
  code: TomlConfigValidationIssue['code'],
  issues: TomlConfigValidationIssue[],
): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  const duplicates = new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  );
  for (const id of duplicates) {
    issues.push({ code, path: `${section}.${id}`, message: `Duplicate ${section} id: ${id}.` });
  }
  return duplicates;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

function invalidField(path: string, message: string): TomlConfigValidationIssue {
  return { code: 'invalidConfigField', path: path || '<root>', message };
}

function fieldPath(owner: string, key: string): string {
  return owner ? `${owner}.${key}` : key;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} must be a non-empty string.`));
  return undefined;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} must be a string.`));
  return undefined;
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} must be a boolean.`));
  return undefined;
}

function readAllowedString<T extends string>(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  allowed: readonly T[],
  code: TomlConfigValidationIssue['code'],
  issues: TomlConfigValidationIssue[],
): T | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (isAllowedString(value, allowed)) return value;
  const path = fieldPath(owner, key);
  issues.push({ code, path, message: `${path} must be one of ${formatAllowedValues(allowed)}.` });
  return undefined;
}

function readRequiredStringArray(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): readonly string[] | undefined {
  const value = record[key];
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} must be an array of strings.`));
  return undefined;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): readonly string[] | undefined {
  if (record[key] === undefined) return undefined;
  return readRequiredStringArray(record, key, owner, issues);
}

function readOptionalRecord(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): Record<string, unknown> | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  const decoded = readRecord(value);
  if (decoded) return decoded;
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} must be a table.`));
  return undefined;
}

function readOptionalStringRecord(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): Record<string, string> | undefined {
  const value = readOptionalRecord(record, key, owner, issues);
  if (value === undefined) return undefined;
  if (Object.values(value).every((entry) => typeof entry === 'string')) {
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, String(entry)]));
  }
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} values must be strings.`));
  return undefined;
}

function readOptionalFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} must be a finite number.`));
  return undefined;
}

function readOptionalPositiveInteger(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  code: TomlConfigValidationIssue['code'],
  issues: TomlConfigValidationIssue[],
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (isPositiveInteger(value)) return value;
  const path = fieldPath(owner, key);
  issues.push({ code, path, message: `${path} must be a positive integer.` });
  return undefined;
}

function readOptionalNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  owner: string,
  issues: TomlConfigValidationIssue[],
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  const path = fieldPath(owner, key);
  issues.push(invalidField(path, `${path} must be a non-negative integer.`));
  return undefined;
}

function tomlProviderToRuntime(provider: TomlProviderConfig): ProviderDefinition {
  return {
    id: provider.id,
    name: provider.name,
    displayName: provider.display_name ?? provider.name,
    type: provider.type,
    apiUrl: provider.api_url ?? '',
    enabled: provider.enabled ?? true,
    ...(provider.connection_kind === undefined ? {} : { connectionKind: provider.connection_kind }),
    ...(provider.protocol_profile === undefined
      ? {}
      : { protocolProfile: provider.protocol_profile }),
    ...(provider.support_level === undefined ? {} : { supportLevel: provider.support_level }),
    ...(provider.requires_api_key === undefined
      ? {}
      : { requiresApiKey: provider.requires_api_key }),
    ...(provider.builtin === undefined ? {} : { builtin: provider.builtin }),
    ...(provider.supports_beta === undefined ? {} : { supportsBeta: provider.supports_beta }),
    ...(provider.use_bearer_auth === undefined ? {} : { useBearerAuth: provider.use_bearer_auth }),
    ...(provider.options === undefined ? {} : { options: provider.options }),
    ...(provider.protocol_variant === undefined
      ? {}
      : { protocolVariant: tomlProtocolVariantToRuntime(provider.protocol_variant) }),
  };
}

function runtimeProviderToToml(
  provider: ProviderDefinition,
  credential: ProviderCredentialDeclaration | undefined,
): TomlProviderConfig {
  return removeUndefined({
    id: provider.id,
    name: provider.name,
    display_name: provider.displayName,
    type: provider.type,
    api_url: provider.apiUrl,
    api_key: credential?.status === 'configured' ? credential.apiKey : undefined,
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
    useBearerAuth: model.use_bearer_auth,
    supportsBeta: model.supports_beta,
    type: model.type,
    capabilities: [...model.capabilities],
    contextWindow: model.context_window,
    maxOutputTokens: model.max_output_tokens,
    inputCostPer1k: model.input_cost_per_1k,
    outputCostPer1k: model.output_cost_per_1k,
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
    use_bearer_auth: model.useBearerAuth,
    supports_beta: model.supportsBeta,
    type: model.type,
    capabilities: model.capabilities,
    context_window: model.contextWindow,
    max_output_tokens: model.maxOutputTokens,
    input_cost_per_1k: model.inputCostPer1k,
    output_cost_per_1k: model.outputCostPer1k,
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
    cwd: server.cwd,
    inheritProcessEnv: server.inherit_process_env,
    url: server.url,
    headers: server.headers,
    enabled: server.enabled ?? true,
    builtin: server.builtin,
    homepage: server.homepage,
    tools: server.tools ? [...server.tools] : undefined,
    requestTimeout: server.request_timeout,
  }) as MCPServerConfig;
}

function isModelType(value: unknown): value is ModelType {
  return isAllowedString(value, MODEL_TYPES);
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
    cwd: server.cwd,
    inherit_process_env: server.inheritProcessEnv,
    url: server.url,
    headers: server.headers,
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
