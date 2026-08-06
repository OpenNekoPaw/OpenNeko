export type AgentConfigDiagnosticCode =
  | 'empty'
  | 'readError'
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingProviderEndpoint'
  | 'invalidToml'
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
  | 'unsupportedConfigField'
  | 'unsupportedModelType'
  | 'unsupportedDefaultModelType'
  | 'unsupportedDefaultModelPurpose'
  | 'invalidDefaultModelBinding'
  | 'invalidDefaultProvider'
  | 'invalidDefaultModel';

export interface AgentConfigDiagnostic {
  code: AgentConfigDiagnosticCode;
  filePath: string;
  message: string;
}
