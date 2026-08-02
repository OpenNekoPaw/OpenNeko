import type { AgentCapabilityHost } from './agent-capability';

export type AgentCapabilityAvailabilityDiagnosticLevel = 'info' | 'warn' | 'error';

export type AgentCapabilityContributionKind =
  | 'provider'
  | 'tool'
  | 'skill'
  | 'toolGroup'
  | 'promptFragment'
  | 'providerCard'
  | 'artifactProfile'
  | 'providerExpressionProfile'
  | 'referenceContributor';

export interface AgentCapabilityAvailabilityDiagnostic {
  readonly level: AgentCapabilityAvailabilityDiagnosticLevel;
  readonly providerId: string;
  readonly contributionKind: AgentCapabilityContributionKind;
  readonly contributionName?: string;
  readonly code: string;
  readonly reason: string;
  readonly message: string;
  readonly requirement?: string;
  readonly host?: AgentCapabilityHost;
}

export interface AgentCapabilityContributionSummary {
  readonly kind: AgentCapabilityContributionKind;
  readonly name: string;
}

export interface AgentCapabilityProviderAvailabilitySummary {
  readonly providerId: string;
  readonly version?: string;
  readonly loaded: readonly AgentCapabilityContributionSummary[];
  readonly skipped: readonly AgentCapabilityAvailabilityDiagnostic[];
}
