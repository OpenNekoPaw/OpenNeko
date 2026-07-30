import type {
  AgentCapabilityHost,
  AgentCapabilityHostRequirement,
  AgentCapabilityLifecycleDescriptor,
  AgentCapabilityTrustLevel,
  ComicAnimationIndexTask,
  PerceptionCachePolicy,
  PerceptionCapabilityFacet,
  PerceptionCapabilitySource,
  PerceptionConfidenceKind,
  PerceptionDeviceTier,
  PerceptionExecutionMode,
  PerceptionMediaKind,
  PromptFragment,
} from '@neko/shared';

export type AgentCapabilitySource = 'builtin' | 'local' | 'plugin' | 'mcp' | 'provider';

export type AgentCapabilityContributionKind =
  | 'skill'
  | 'tool'
  | 'toolGroup'
  | 'slashCommand'
  | 'promptFragment'
  | 'promptChainFragment'
  | 'artifactProtocol'
  | 'artifactProfile'
  | 'artifactRenderer'
  | 'artifactProjector'
  | 'artifactCapability';

export type AgentCapabilityPermissionMode = 'read' | 'write' | 'execute' | 'irreversible';

export interface AgentCapabilityPermissionRequirement {
  readonly scope: string;
  readonly mode?: AgentCapabilityPermissionMode;
  readonly approvalRequired?: boolean;
}

export interface AgentCapabilityContributionIdentity {
  readonly id: string;
  readonly source: AgentCapabilitySource;
  readonly sourceId: string;
  readonly version?: string;
  readonly trustLevel: AgentCapabilityTrustLevel;
}

export interface AgentCapabilitySlashCommandContribution {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly skillId?: string;
}

export interface AgentCapabilityPromptChainFragmentContribution {
  readonly id: string;
  readonly title?: string;
  readonly promptChainId?: string;
  readonly checkpointIds?: readonly string[];
}

export type AgentArtifactCapabilityRisk = 'low' | 'medium' | 'high' | 'destructive';

export type AgentLifecycleCapabilityContribution = AgentCapabilityLifecycleDescriptor;

export interface AgentArtifactProtocolContribution {
  readonly id: string;
  readonly artifactKind: string;
  readonly profile?: string;
  readonly schemaVersion: number;
  readonly validatorId: string;
  readonly rendererIds?: readonly string[];
  readonly projectorIds?: readonly string[];
}

export interface AgentArtifactProfileContribution {
  readonly id: string;
  readonly profileId: string;
  readonly protocol: string;
  readonly version: number;
  readonly descriptorRef?: string;
}

export interface AgentArtifactRendererContribution {
  readonly id: string;
  readonly accepts: readonly string[];
  readonly profiles?: readonly string[];
  readonly lazy?: boolean;
}

export interface AgentArtifactProjectorContribution {
  readonly id: string;
  readonly accepts: readonly string[];
  readonly produces: readonly string[];
  readonly profiles?: readonly string[];
  readonly lazy?: boolean;
}

export interface AgentArtifactExecutionCapabilityContribution {
  readonly capabilityId: string;
  readonly packageId: string;
  readonly accepts: readonly string[];
  readonly produces?: readonly string[];
  readonly actions: readonly string[];
  readonly risk: AgentArtifactCapabilityRisk;
  readonly requiresApproval: boolean;
  readonly minVersion?: string;
}

export type AgentSemanticFacetAvailability = 'available' | 'unavailable' | 'degraded';

export interface AgentSemanticFacetBase {
  readonly id: string;
  readonly packageId: string;
  readonly availability?: AgentSemanticFacetAvailability;
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  readonly risk?: AgentArtifactCapabilityRisk;
  readonly requiresApproval?: boolean;
  readonly actions?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentEntityProviderFacetContribution extends AgentSemanticFacetBase {
  readonly entityKinds?: readonly string[];
  readonly sourceKinds?: readonly string[];
  readonly canConfirm?: boolean;
}

export interface AgentEntityMemoryContributorFacetContribution extends AgentSemanticFacetBase {
  readonly sourceKinds?: readonly string[];
  readonly contributionKinds?: readonly string[];
  readonly reviewPolicies?: readonly string[];
  readonly canWriteAccepted?: boolean;
}

export interface AgentMediaTextExtractorFacetContribution extends AgentSemanticFacetBase {
  readonly textKinds?: readonly string[];
  readonly sourceKinds?: readonly string[];
  readonly modalities?: readonly string[];
  readonly supportsBoundingBoxes?: boolean;
}

export interface AgentPerceptionProviderFacetContribution extends AgentSemanticFacetBase {
  readonly modalities?: readonly string[];
  readonly layers?: readonly number[];
  readonly timing?: readonly string[];
}

export interface AgentSemanticIndexProviderFacetContribution extends AgentSemanticFacetBase {
  readonly sourceKinds?: readonly string[];
  readonly partitions?: readonly string[];
  readonly supportsVector?: boolean;
  readonly supportsRag?: boolean;
}

export interface AgentReviewSurfaceFacetContribution extends AgentSemanticFacetBase {
  readonly surfaceKinds?: readonly string[];
  readonly actions: readonly string[];
}

export interface AgentRepresentationResolverFacetContribution extends AgentSemanticFacetBase {
  readonly entityKinds?: readonly string[];
  readonly representationKinds?: readonly string[];
}

export type AgentPerceptionCapabilitySource = PerceptionCapabilitySource;

export type AgentPerceptionCapabilityTask = ComicAnimationIndexTask;

export type AgentPerceptionCapabilityMediaKind = PerceptionMediaKind;

export type AgentPerceptionCapabilityExecutionMode = PerceptionExecutionMode;

export type AgentPerceptionCapabilityDeviceTier = PerceptionDeviceTier;

export type AgentPerceptionCapabilityCachePolicy = PerceptionCachePolicy;

export type AgentPerceptionCapabilityConfidenceKind = PerceptionConfidenceKind;

export type AgentPerceptionCapabilityFacetContribution = PerceptionCapabilityFacet;

export interface AgentArtifactFacetsContribution {
  readonly protocols?: readonly AgentArtifactProtocolContribution[];
  readonly profiles?: readonly AgentArtifactProfileContribution[];
  readonly renderers?: readonly AgentArtifactRendererContribution[];
  readonly projectors?: readonly AgentArtifactProjectorContribution[];
  readonly capabilities?: readonly AgentArtifactExecutionCapabilityContribution[];
  readonly lifecycleCapabilities?: readonly AgentLifecycleCapabilityContribution[];
  readonly entityProviders?: readonly AgentEntityProviderFacetContribution[];
  readonly entityMemoryContributors?: readonly AgentEntityMemoryContributorFacetContribution[];
  readonly mediaTextExtractors?: readonly AgentMediaTextExtractorFacetContribution[];
  readonly perceptionProviders?: readonly AgentPerceptionProviderFacetContribution[];
  readonly perceptionCapabilities?: readonly AgentPerceptionCapabilityFacetContribution[];
  readonly semanticIndexProviders?: readonly AgentSemanticIndexProviderFacetContribution[];
  readonly reviewSurfaces?: readonly AgentReviewSurfaceFacetContribution[];
  readonly representationResolvers?: readonly AgentRepresentationResolverFacetContribution[];
}

export interface AgentSemanticFacetActionAvailability {
  readonly actionId: string;
  readonly available: boolean;
  readonly facetIds: readonly string[];
  readonly unavailableFacetIds: readonly string[];
  readonly reason?: string;
  readonly message?: string;
}

export interface AgentCapabilityContribution {
  readonly identity: AgentCapabilityContributionIdentity;
  readonly displayName?: string;
  readonly description?: string;
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  readonly permissionRequirements?: readonly AgentCapabilityPermissionRequirement[];
  readonly promptFragments?: readonly PromptFragment[];
  readonly allowedTools?: readonly string[];
  readonly slashCommands?: readonly AgentCapabilitySlashCommandContribution[];
  readonly promptChainFragments?: readonly AgentCapabilityPromptChainFragmentContribution[];
  readonly toolNames?: readonly string[];
  readonly toolGroupNames?: readonly string[];
  readonly artifactFacets?: AgentArtifactFacetsContribution;
  readonly metadata?: Record<string, unknown>;
}

export type AgentCapabilityDiagnosticPhase = 'registration' | 'injection';

export interface AgentCapabilityDiagnostic {
  readonly phase: AgentCapabilityDiagnosticPhase;
  readonly code: string;
  readonly contributionId?: string;
  readonly reason: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentCapabilityInjectionContext {
  readonly host: AgentCapabilityHost;
  readonly allowedTrustLevels?: readonly AgentCapabilityTrustLevel[];
  readonly toolBudget?: number;
  readonly disabledContributionIds?: readonly string[];
  readonly permissionPolicy?: {
    readonly allowedScopes?: readonly string[];
    readonly allowIrreversible?: boolean;
    readonly approvedContributionIds?: readonly string[];
  };
}

export interface AgentInjectedCapabilitySet {
  readonly contributions: readonly AgentCapabilityContribution[];
  readonly promptFragments: readonly PromptFragment[];
  readonly allowedTools: readonly string[];
  readonly slashCommands: readonly AgentCapabilitySlashCommandContribution[];
  readonly promptChainFragments: readonly AgentCapabilityPromptChainFragmentContribution[];
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
}

export interface AgentCapabilityRegistryProjection {
  readonly contributions: readonly AgentCapabilityContribution[];
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
  readonly artifactFacets?: AgentArtifactFacetsContribution;
}

export type AgentCapabilityTelemetryReason =
  'used' | 'unknown-field' | 'unsupported-field' | 'withheld-field' | 'policy-skipped';

export type AgentCapabilityTelemetryEventKind =
  | 'field-utilization'
  | 'skill-install'
  | 'skill-update'
  | 'skill-remove'
  | 'prompt-fragment-change'
  | 'schema-change'
  | 'prompt-chain-fragment-change'
  | 'provider-card-change';

export interface AgentCapabilityTelemetryEvent {
  readonly id: string;
  readonly kind: AgentCapabilityTelemetryEventKind;
  readonly contributionId: string;
  readonly source: AgentCapabilitySource;
  readonly sourceId: string;
  readonly version?: string;
  readonly field?: string;
  readonly reason: AgentCapabilityTelemetryReason;
  readonly hash?: string;
  readonly createdAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentCapabilityTelemetrySnapshot {
  readonly events: readonly AgentCapabilityTelemetryEvent[];
  readonly fieldCounts: Readonly<Record<AgentCapabilityTelemetryReason, number>>;
  readonly updatedAt: number;
}
