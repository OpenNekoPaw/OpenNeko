import type { ConfigReadDiagnostic, ConfigReadErrorCode, ConfigReadResult } from './config-reader';

export type AssistantConfigAvailabilityCode =
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingProviderEndpoint'
  | 'invalidDefaultProvider'
  | 'invalidDefaultModel'
  | 'invalidDefaultModelBinding';

export type AssistantConfigDiagnosticCode = ConfigReadErrorCode | AssistantConfigAvailabilityCode;

export interface AssistantConfigDiagnostic {
  readonly code: AssistantConfigDiagnosticCode;
  readonly filePath: string;
  readonly path?: string;
  readonly message: string;
}

export function buildAssistantConfigAvailabilityDiagnostic(
  code: AssistantConfigAvailabilityCode,
  filePath: string,
  path?: string,
): AssistantConfigDiagnostic {
  return {
    code,
    filePath,
    ...(path === undefined ? {} : { path }),
    message: buildSafeConfigDiagnosticMessage(code, filePath),
  };
}

export function projectAssistantConfigDiagnostic(
  diagnostic: ConfigReadDiagnostic,
): AssistantConfigDiagnostic {
  return {
    code: diagnostic.code,
    filePath: diagnostic.filePath,
    ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
    message: buildSafeConfigDiagnosticMessage(
      diagnostic.code,
      diagnostic.filePath,
      diagnostic.path,
    ),
  };
}

export function projectAssistantConfigReadResultDiagnostic(
  result: ConfigReadResult,
): AssistantConfigDiagnostic | undefined {
  if (result.status === 'ok') {
    const diagnostic = result.diagnostics[0];
    return diagnostic ? projectAssistantConfigDiagnostic(diagnostic) : undefined;
  }
  return result.status === 'missing'
    ? undefined
    : projectAssistantConfigDiagnostic(result.diagnostic);
}

export function buildSafeConfigDiagnosticMessage(
  code: AssistantConfigDiagnosticCode,
  filePath: string,
  path?: string,
): string {
  switch (code) {
    case 'empty':
      return `Configuration file is empty: ${filePath}. Fix the file, then open a new Agent session or tab.`;
    case 'invalidToml':
      return `Configuration file contains invalid TOML: ${filePath}. Fix the file, then open a new Agent session or tab.`;
    case 'invalidConfigField':
      return `Configuration field ${path ?? '<unknown>'} is invalid in ${filePath}. Fix this field, then reload the configuration.`;
    case 'unsupportedProviderType':
      return `Configuration file contains an unsupported provider type: ${filePath}. Use a supported type such as generic, newapi, openai, anthropic, google, or ollama, then open a new Agent session or tab.`;
    case 'unsupportedProviderConnectionKind':
      return `Configuration file contains an unsupported provider connection_kind: ${filePath}. Use gateway, local, or direct, then open a new Agent session or tab.`;
    case 'unsupportedProviderProtocolProfile':
      return `Configuration file contains an unsupported provider protocol_profile: ${filePath}. Use newapi, openai-chat, openai-responses, anthropic, google, or ollama, then open a new Agent session or tab.`;
    case 'unsupportedProviderSupportLevel':
      return `Configuration file contains an unsupported provider support_level: ${filePath}. Use verified, compatible, experimental, or custom, then open a new Agent session or tab.`;
    case 'unsupportedProviderModelFamily':
      return `Configuration file contains an unsupported provider supported_model_families value: ${filePath}. Use dialogue or generation, then reload the configuration.`;
    case 'unsupportedProtocolAuthType':
      return `Configuration file contains an unsupported protocol_variant auth_type: ${filePath}. Use bearer, api-key, or custom-header, then open a new Agent session or tab.`;
    case 'unsupportedProtocolStreamFormat':
      return `Configuration file contains an unsupported protocol_variant stream_format: ${filePath}. Use sse or ndjson, then open a new Agent session or tab.`;
    case 'unsupportedModelProtocolProfile':
      return `Configuration file contains an unsupported model protocol_profile: ${filePath}. Use newapi, openai-chat, openai-responses, anthropic, google, or ollama, then open a new Agent session or tab.`;
    case 'duplicateProviderId':
      return `Configuration file contains duplicate provider IDs: ${filePath}. Remove duplicate provider entries, then open a new Agent session or tab.`;
    case 'duplicateModelId':
      return `Configuration file contains duplicate model IDs: ${filePath}. Remove duplicate model entries, then open a new Agent session or tab.`;
    case 'invalidDefaultMaxTokens':
      return `Configuration file contains an invalid [defaults].max_tokens output-token cap: ${filePath}. Use a positive integer for max output tokens, then open a new Agent session or tab.`;
    case 'invalidModelTokenMetadata':
      return `Configuration file contains invalid model token metadata: ${filePath}. Use positive integers for models[].context_window and models[].max_output_tokens, then open a new Agent session or tab.`;
    case 'invalidProviderApiKey':
      return `Provider credential field ${path ?? 'providers.api_key'} is invalid in ${filePath}. Enter a non-empty string, then reload the configuration.`;
    case 'unsupportedModelType':
      return `Configuration file contains an unsupported model type: ${filePath}. Use llm, image, video, or audio, then open a new Agent session or tab.`;
    case 'unsupportedDefaultModelType':
      return `Configuration file contains an unsupported default_models key: ${filePath}. Use llm, image, video, or audio, then open a new Agent session or tab.`;
    case 'unsupportedDefaultModelPurpose':
      return `Configuration file contains an invalid default_model_purposes entry: ${filePath}. Use provider_id and model_id for each purpose binding, then open a new Agent session or tab.`;
    case 'invalidDefaultModelBinding':
      return `Configuration file contains a default model binding that references an unavailable provider/model or mismatched capability: ${filePath}. Fix the default binding, then open a new Agent session or tab.`;
    case 'readError':
      return `Unable to read configuration file: ${filePath}. Check file permissions, then open a new Agent session or tab.`;
    case 'missingConfig':
      return `Agent configuration file is missing: ${filePath}. Create the config file with at least one enabled provider and chat model, then open a new Agent session or tab.`;
    case 'missingProvider':
      return `Agent configuration has no enabled providers: ${filePath}. Add at least one enabled provider with its endpoint, then open a new Agent session or tab.`;
    case 'missingModel':
      return `Agent configuration has no enabled chat models: ${filePath}. Add at least one enabled chat model, then open a new Agent session or tab.`;
    case 'missingProviderEndpoint':
      return `Agent configuration has no enabled chat provider with an endpoint: ${filePath}. Add the provider endpoint, then open a new Agent session or tab.`;
    case 'invalidDefaultProvider':
      return `Agent configuration selects an unavailable default provider: ${filePath}. Fix default_models.llm, then open a new Agent session or tab.`;
    case 'invalidDefaultModel':
      return `Agent configuration selects an unavailable default chat model: ${filePath}. Fix default_models.llm, then open a new Agent session or tab.`;
  }
}

export function buildConfigUnavailableMessage(
  diagnostic: AssistantConfigDiagnostic | undefined,
): string {
  if (!diagnostic) {
    return 'Agent configuration is unavailable.';
  }
  return diagnostic.message;
}
