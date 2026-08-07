export type AgentConfigDiagnosticCode =
  | 'empty'
  | 'readError'
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingProviderEndpoint'
  | 'invalidToml'
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
  | 'unsupportedDefaultModelPurpose'
  | 'invalidDefaultModelBinding'
  | 'invalidDefaultProvider'
  | 'invalidDefaultModel';

export interface AgentConfigDiagnostic {
  code: AgentConfigDiagnosticCode;
  filePath: string;
  path?: string;
  message: string;
}
