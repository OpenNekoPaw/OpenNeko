/**
 * Agent Capability Provider Protocol
 *
 * Defines the contract for sub-packages to provide AI capabilities to neko-agent.
 * Uses a hybrid discovery mechanism:
 * - Static: Sub-packages declare capabilities in package.json `contributes.neko.agentCapabilities`
 * - Dynamic: Desktop composition registers providers at runtime
 *
 * This protocol replaces the centralized `createXxxTools()` pattern where neko-agent
 * manually imports and registers tools from every sub-package.
 */

import type { Tool, ToolCategory } from './tool';
import type { PromptFragment } from './prompt-fragment';
import type { ArtifactProfileDescriptor } from './composite-artifact';
import type { PerceptionCapabilityFacet } from './comic-animation-indexing';
import type { AgentCapabilityLifecycleDescriptor } from './agent-capability-lifecycle';
import type { AgentReferenceContributor } from './reference-contributor';

// =============================================================================
// Capability metadata
// =============================================================================

export type AgentCapabilityTrustLevel = 'core' | 'community' | 'untrusted';

export type AgentCapabilityHost = 'desktop';

export type AgentCapabilityLifecycleHook = 'register' | 'activate' | 'deactivate' | 'dispose';

export interface AgentCapabilityHostRequirement {
  readonly host: AgentCapabilityHost;
  readonly optional?: boolean;
  readonly reason?: string;
}

export interface AgentCapabilityRuntimeRequirements {
  readonly desktop?: boolean;
  readonly activeEditor?: boolean;
  readonly generationJob?: boolean;
  readonly engineBridge?: boolean;
  readonly contentAccess?: boolean;
  readonly writableProject?: boolean;
}

export interface AgentCapabilityRuntimeRequirementDescriptor {
  readonly requirements?: AgentCapabilityRuntimeRequirements;
}

export interface AgentCapabilityProtocolMetadata {
  /** Trust tier used by future policy enforcement; omitted providers default to core. */
  readonly trustLevel?: AgentCapabilityTrustLevel;
  /** Hosts supported by this provider. Omitted providers use the Desktop host. */
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  /** Runtime ports or host affordances required before this provider can be loaded. */
  readonly requirements?: AgentCapabilityRuntimeRequirements;
  /** Lifecycle hooks implemented by the provider. Informational in Stage 1. */
  readonly lifecycleHooks?: readonly AgentCapabilityLifecycleHook[];
}

export interface CapabilityContribution extends AgentCapabilityProtocolMetadata {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly CapabilityDeclaration[];
}

// =============================================================================
// Static Manifest (package.json contributes)
// =============================================================================

/**
 * Declared in a sub-package's package.json under `contributes.neko.agentCapabilities`.
 * Used by neko-agent for static discovery at startup — before the sub-package activates.
 */
export interface AgentCapabilityManifest extends AgentCapabilityProtocolMetadata {
  /** Unique provider ID matching the extension's short name (e.g. "neko-cut") */
  id: string;

  /** Human-readable display name */
  displayName: string;

  /** Static capability declarations (for AI tool discovery metadata) */
  capabilities: CapabilityDeclaration[];
}

/**
 * Static declaration of a single capability.
 * Only metadata — the actual Tool/Skill implementation is provided at runtime.
 */
export interface CapabilityDeclaration extends AgentCapabilityRuntimeRequirementDescriptor {
  /** Capability type */
  type: 'tool' | 'artifactProfile';

  /** Name (must match the runtime contribution name). */
  name: string;

  /** Tool category for filtering */
  category?: ToolCategory;

  /** Human-readable description */
  description: string;
}

// =============================================================================
// Artifact facets (typed views over Capability Protocol)
// =============================================================================

export type AgentArtifactCapabilityRisk = 'low' | 'medium' | 'high' | 'destructive';

export interface AgentArtifactProtocolContribution {
  readonly id: string;
  readonly artifactKind: string;
  readonly profile?: string;
  readonly validatorId: string;
  readonly rendererIds?: readonly string[];
  readonly projectorIds?: readonly string[];
}

export interface AgentArtifactProfileContribution {
  readonly id: string;
  readonly profileId: string;
  readonly protocol: string;
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
}

export interface AgentArtifactFacetsContribution {
  readonly protocols?: readonly AgentArtifactProtocolContribution[];
  readonly profiles?: readonly AgentArtifactProfileContribution[];
  readonly renderers?: readonly AgentArtifactRendererContribution[];
  readonly projectors?: readonly AgentArtifactProjectorContribution[];
  readonly capabilities?: readonly AgentArtifactExecutionCapabilityContribution[];
  readonly lifecycleCapabilities?: readonly AgentCapabilityLifecycleDescriptor[];
  readonly perceptionCapabilities?: readonly PerceptionCapabilityFacet[];
}

/** Pure bounded text completion. Domain code owns prompts and receives no LLM identity. */
export interface ICapabilityPurposeTextRuntime {
  complete(input: {
    purpose: string;
    instruction: string;
    input: string;
    signal?: AbortSignal;
  }): Promise<{ text: string }>;
}

/**
 * Minimal config interface exposed to capability providers.
 * Narrow configuration port that keeps subpackages independent of Host implementations.
 */
export interface ICapabilityConfigManager {
  getEnabledModels(): Array<{ id: string; name: string; type?: string }>;
}

// =============================================================================
// Runtime Provider (dynamic registration)
// =============================================================================

/**
 * Context passed to providers when requesting tools.
 * Keeps the provider decoupled from Desktop host APIs at the type level.
 *
 * Host services are optional. Domain media generation is injected through the
 * owning domain's public Job port, not through this generic context.
 */
export interface AgentCapabilityContext {
  /** Opaque host composition context. */
  hostContext: unknown;

  /** Purpose-bound bounded text completion without Pi/provider/auth disclosure. */
  purposeTextRuntime?: ICapabilityPurposeTextRuntime;

  /** Config manager for model routing. Injected by neko-agent when available. */
  configManager?: ICapabilityConfigManager;

  /** Embedding function for semantic search. Injected by neko-agent when available. */
  embedFn?: (texts: string[]) => Promise<number[][]>;

  /** Prompt/UI locale normalized by the host for provider-owned prompt text. */
  locale?: 'en' | 'zh';
}

/**
 * Runtime capability provider implemented by each sub-package.
 *
 * Sub-packages export a class implementing this interface. Desktop composition
 * registers provider instances through the canonical capability registry.
 */
export interface AgentCapabilityProvider extends AgentCapabilityProtocolMetadata {
  /** Provider ID (must match manifest.id) */
  readonly id: string;

  /**
   * Return tools provided by this sub-package.
   * Called once during registration; returned tools are registered in the ToolRegistry.
   */
  getTools(context: AgentCapabilityContext): Tool[];

  /**
   * Optional: Return prompt fragments contributed by this sub-package.
   *
   * Fragments are domain-specific usage conventions for this provider's
   * tools (e.g. "timestamps are in milliseconds", "add tracks before
   * inserting elements"). They are injected into the agent's L3
   * environment layer — under any user-authored AGENTS.md override
   * (priority 80) but above project / global memory (60 / 50).
   *
   * Fragment ids must be globally unique across providers; convention is
   * `{package}:{local-id}` (e.g. `neko-cut:timeline-basics`).
   */
  getPromptFragments?(context: AgentCapabilityContext): PromptFragment[];

  /**
   * Optional: Return Artifact Profiles contributed by this provider/package.
   *
   * Profiles are registered independently from Skills. Registration must not
   * activate any Skill or inject prompt content.
   */
  getArtifactProfiles?(context: AgentCapabilityContext): ArtifactProfileDescriptor[];

  /**
   * Optional: Return artifact protocol/profile/renderer/projector/capability
   * facets. These are registration-time metadata only; implementations remain
   * package-owned and are resolved lazily by the relevant provider.
   */
  getArtifactFacets?(context: AgentCapabilityContext): AgentArtifactFacetsContribution;

  /**
   * Optional reference contributors for Agent mention suggestions.
   */
  getReferenceContributors?(context: AgentCapabilityContext): readonly AgentReferenceContributor[];

  /**
   * Optional cleanup when the provider is unregistered.
   */
  dispose?(): void;
}
