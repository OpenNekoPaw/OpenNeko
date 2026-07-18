import type {
  ConfigReadDiagnostic,
  ConfigReadErrorCode,
  ConfigReadResult,
} from '@neko/shared/config/config-reader';

export type AssistantConfigAvailabilityCode =
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey'
  | 'invalidDefaultProvider'
  | 'invalidDefaultModel'
  | 'invalidDefaultModelBinding'
  | 'unsupportedWorkspaceProviderDefinition'
  | 'unsupportedWorkspaceModelDefinition'
  | 'unsupportedSkillSource';

export type AssistantConfigDiagnosticCode = ConfigReadErrorCode | AssistantConfigAvailabilityCode;

export interface AssistantConfigDiagnostic {
  readonly code: AssistantConfigDiagnosticCode;
  readonly filePath: string;
  readonly message: string;
}

export function buildAssistantConfigAvailabilityDiagnostic(
  code: AssistantConfigAvailabilityCode,
  filePath: string,
): AssistantConfigDiagnostic {
  return {
    code,
    filePath,
    message: buildSafeConfigDiagnosticMessage(code, filePath),
  };
}

export function projectAssistantConfigDiagnostic(
  diagnostic: ConfigReadDiagnostic,
): AssistantConfigDiagnostic {
  return {
    code: diagnostic.code,
    filePath: diagnostic.filePath,
    message: buildSafeConfigDiagnosticMessage(diagnostic.code, diagnostic.filePath),
  };
}

export function projectAssistantConfigReadResultDiagnostic(
  result: ConfigReadResult,
): AssistantConfigDiagnostic | undefined {
  if (
    result.status === 'empty' ||
    result.status === 'invalidToml' ||
    result.status === 'unsupportedVersion' ||
    result.status === 'unsupportedProviderType' ||
    result.status === 'unsupportedProviderConnectionKind' ||
    result.status === 'unsupportedProviderProtocolProfile' ||
    result.status === 'unsupportedProviderSupportLevel' ||
    result.status === 'unsupportedProtocolAuthType' ||
    result.status === 'unsupportedProtocolStreamFormat' ||
    result.status === 'unsupportedModelProtocolProfile' ||
    result.status === 'unsupportedModelProtocol' ||
    result.status === 'duplicateProviderId' ||
    result.status === 'duplicateModelId' ||
    result.status === 'invalidDefaultMaxTokens' ||
    result.status === 'invalidModelTokenMetadata' ||
    result.status === 'unsupportedProfileSchemaSection' ||
    result.status === 'unsupportedModelType' ||
    result.status === 'unsupportedDefaultMediaModelType' ||
    result.status === 'unsupportedDefaultModelType' ||
    result.status === 'unsupportedDefaultModelPurpose' ||
    result.status === 'readError'
  ) {
    return projectAssistantConfigDiagnostic(result.diagnostic);
  }
  return undefined;
}

export function buildSafeConfigDiagnosticMessage(
  code: AssistantConfigDiagnosticCode,
  filePath: string,
): string {
  switch (code) {
    case 'empty':
      return `Configuration file is empty: ${filePath}. Fix the file, then open a new Agent session or tab.`;
    case 'invalidToml':
      return `Configuration file contains invalid TOML: ${filePath}. Fix the file, then open a new Agent session or tab.`;
    case 'unsupportedVersion':
      return `Configuration file uses an unsupported version: ${filePath}. Update OpenNeko or migrate the file, then open a new Agent session or tab.`;
    case 'unsupportedProviderType':
      return `Configuration file contains an unsupported provider type: ${filePath}. Use a supported type such as generic, newapi, openai, anthropic, google, or ollama, then open a new Agent session or tab.`;
    case 'unsupportedProviderConnectionKind':
      return `Configuration file contains an unsupported provider connection_kind: ${filePath}. Use gateway, local, or direct, then open a new Agent session or tab.`;
    case 'unsupportedProviderProtocolProfile':
      return `Configuration file contains an unsupported provider protocol_profile: ${filePath}. Use newapi, openai-chat, openai-responses, anthropic, google, or ollama, then open a new Agent session or tab.`;
    case 'unsupportedProviderSupportLevel':
      return `Configuration file contains an unsupported provider support_level: ${filePath}. Use verified, compatible, experimental, or custom, then open a new Agent session or tab.`;
    case 'unsupportedProtocolAuthType':
      return `Configuration file contains an unsupported protocol_variant auth_type: ${filePath}. Use bearer, api-key, or custom-header, then open a new Agent session or tab.`;
    case 'unsupportedProtocolStreamFormat':
      return `Configuration file contains an unsupported protocol_variant stream_format: ${filePath}. Use sse or ndjson, then open a new Agent session or tab.`;
    case 'unsupportedModelProtocolProfile':
      return `Configuration file contains an unsupported model protocol_profile: ${filePath}. Use newapi, openai-chat, openai-responses, anthropic, google, or ollama, then open a new Agent session or tab.`;
    case 'unsupportedModelProtocol':
      return `Configuration file contains an unsupported model protocol: ${filePath}. Use a supported provider type for model protocol overrides, then open a new Agent session or tab.`;
    case 'duplicateProviderId':
      return `Configuration file contains duplicate provider IDs: ${filePath}. Remove duplicate provider entries, then open a new Agent session or tab.`;
    case 'duplicateModelId':
      return `Configuration file contains duplicate model IDs: ${filePath}. Remove duplicate model entries, then open a new Agent session or tab.`;
    case 'invalidDefaultMaxTokens':
      return `Configuration file contains an invalid [defaults].max_tokens output-token cap: ${filePath}. Use a positive integer for max output tokens, then open a new Agent session or tab.`;
    case 'invalidModelTokenMetadata':
      return `Configuration file contains invalid model token metadata: ${filePath}. Use positive integers for models[].context_window and models[].max_output_tokens, then open a new Agent session or tab.`;
    case 'unsupportedProfileSchemaSection':
      return `Configuration file contains unsupported Agent profile schema sections: ${filePath}. Install or contribute Agent profile packages instead of defining profile schemas in TOML, then open a new Agent session or tab.`;
    case 'unsupportedModelType':
      return `Configuration file contains an unsupported model type: ${filePath}. Use llm, image, video, or audio, then open a new Agent session or tab.`;
    case 'unsupportedDefaultMediaModelType':
      return `Configuration file contains retired default_media_models: ${filePath}. Move defaults to [default_models.llm], [default_models.image], [default_models.video], or [default_models.audio], then open a new Agent session or tab.`;
    case 'unsupportedDefaultModelType':
      return `Configuration file contains an unsupported default_models key: ${filePath}. Use llm, image, video, or audio, then open a new Agent session or tab.`;
    case 'unsupportedDefaultModelPurpose':
      return `Configuration file contains an invalid default_model_purposes entry: ${filePath}. Use provider_id and model_id for each purpose binding, then open a new Agent session or tab.`;
    case 'invalidDefaultModelBinding':
      return `Configuration file contains a default model binding that references an unavailable provider/model or mismatched capability: ${filePath}. Fix the default binding, then open a new Agent session or tab.`;
    case 'unsupportedWorkspaceProviderDefinition':
      return `Workspace configuration defines provider entries: ${filePath}. Move provider definitions and credentials to the user config, then open a new Agent session or tab.`;
    case 'unsupportedWorkspaceModelDefinition':
      return `Workspace configuration defines model entries: ${filePath}. Move model definitions to the user config or account catalog, then open a new Agent session or tab.`;
    case 'unsupportedSkillSource':
      return `Configuration references a non-standard Skill source: ${filePath}. Register an explicit Skill source provider or use .agents/skills and .neko/commands.`;
    case 'readError':
      return `Unable to read configuration file: ${filePath}. Check file permissions, then open a new Agent session or tab.`;
    case 'missingConfig':
      return `Agent configuration file is missing: ${filePath}. Create the config file with at least one enabled provider, chat model, and required provider credentials, then open a new Agent session or tab.`;
    case 'missingProvider':
      return `Agent configuration has no enabled providers: ${filePath}. Add at least one enabled provider with its required endpoint and credentials, then open a new Agent session or tab.`;
    case 'missingModel':
      return `Agent configuration has no enabled chat models: ${filePath}. Add at least one enabled chat model, then open a new Agent session or tab.`;
    case 'missingApiKey':
      return `Agent configuration has no configured enabled chat provider: ${filePath}. Add the required provider endpoint and credentials, then open a new Agent session or tab.`;
    case 'invalidDefaultProvider':
      return `Agent configuration selects an unavailable default provider: ${filePath}. Fix default_provider, then open a new Agent session or tab.`;
    case 'invalidDefaultModel':
      return `Agent configuration selects an unavailable default chat model: ${filePath}. Fix default_model, then open a new Agent session or tab.`;
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
