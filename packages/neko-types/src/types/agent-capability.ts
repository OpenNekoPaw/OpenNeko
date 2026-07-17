/**
 * Agent Capability Provider Protocol
 *
 * Defines the contract for sub-packages to provide AI capabilities to neko-agent.
 * Uses a hybrid discovery mechanism:
 * - Static: Sub-packages declare capabilities in package.json `contributes.neko.agentCapabilities`
 * - Dynamic: Sub-packages register providers at runtime via VSCode Command
 *
 * This protocol replaces the centralized `createXxxTools()` pattern where neko-agent
 * manually imports and registers tools from every sub-package.
 */

import type { Tool, ToolCategory } from './tool';
import type { TaskRunScope } from './task';
import type { LoadingTier } from './loading-tier';
import type { PromptFragment } from './prompt-fragment';
import type { ProviderCard, ProviderExpressionProfileDescriptor } from './provider-card';
import type { ArtifactProfileDescriptor } from './composite-artifact';
import type { PerceptionCapabilityFacet } from './comic-animation-indexing';
import type { ReferenceContributorManifest } from './reference-resolution';
import type { AgentCapabilityLifecycleDescriptor } from './agent-capability-lifecycle';
import type { AgentReferenceContributor } from './reference-contributor';

// =============================================================================
// Protocol v1 metadata
// =============================================================================

export type AgentCapabilityProtocolVersion = '1.0';

export type AgentCapabilityTrustLevel = 'core' | 'community' | 'untrusted';

export type AgentCapabilityHost = 'vscode' | 'cli' | 'tui';

export type AgentCapabilityLifecycleHook = 'register' | 'activate' | 'deactivate' | 'dispose';

export interface AgentCapabilityHostRequirement {
  readonly host: AgentCapabilityHost;
  readonly optional?: boolean;
  readonly reason?: string;
}

export interface AgentCapabilityRuntimeRequirements {
  readonly vscode?: boolean;
  readonly activeEditor?: boolean;
  readonly mediaService?: boolean;
  readonly engineBridge?: boolean;
  readonly contentAccess?: boolean;
  readonly writableProject?: boolean;
}

export interface AgentCapabilityRuntimeRequirementDescriptor {
  readonly requirements?: AgentCapabilityRuntimeRequirements;
}

export interface AgentCapabilityProtocolMetadata {
  /** Capability protocol version. Omitted legacy providers are treated as 1.0-compatible. */
  readonly protocolVersion?: AgentCapabilityProtocolVersion;
  /** Trust tier used by future policy enforcement; omitted providers default to core. */
  readonly trustLevel?: AgentCapabilityTrustLevel;
  /**
   * Hosts supported by this provider. Omitted means vscode-only for legacy compatibility;
   * TUI/CLI loaders should require an explicit `tui` or `cli` host requirement.
   */
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  /** Runtime ports or host affordances required before this provider can be loaded. */
  readonly requirements?: AgentCapabilityRuntimeRequirements;
  /** Lifecycle hooks implemented by the provider. Informational in Stage 1. */
  readonly lifecycleHooks?: readonly AgentCapabilityLifecycleHook[];
}

export interface CapabilityContributionV1 extends AgentCapabilityProtocolMetadata {
  readonly id: string;
  readonly version: string;
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

  /** Semantic version of the capability set */
  version: string;

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
  type: 'tool' | 'artifactProfile' | 'providerExpressionProfile';

  /** Name (must match the runtime contribution name). */
  name: string;

  /** Tool category for filtering */
  category?: ToolCategory;

  /** Human-readable description */
  description: string;

  /** Loading tier for tiered lazy loading */
  loadingTier?: LoadingTier;
}

// =============================================================================
// Artifact facets (typed views over Capability Protocol)
// =============================================================================

export type AgentArtifactCapabilityRisk = 'low' | 'medium' | 'high' | 'destructive';

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

export interface AgentArtifactFacetsContribution {
  readonly protocols?: readonly AgentArtifactProtocolContribution[];
  readonly profiles?: readonly AgentArtifactProfileContribution[];
  readonly renderers?: readonly AgentArtifactRendererContribution[];
  readonly projectors?: readonly AgentArtifactProjectorContribution[];
  readonly capabilities?: readonly AgentArtifactExecutionCapabilityContribution[];
  readonly lifecycleCapabilities?: readonly AgentCapabilityLifecycleDescriptor[];
  readonly perceptionCapabilities?: readonly PerceptionCapabilityFacet[];
  readonly referenceContributors?: readonly ReferenceContributorManifest[];
}

// =============================================================================
// Platform service interfaces for capability providers (minimal L0 contracts)
// =============================================================================

/**
 * Minimal media generation interface exposed to capability providers.
 * Subset of MediaGenerationService — avoids sub-packages depending on @neko/platform.
 */
export interface ICapabilityMediaService {
  /**
   * Generate an image.
   *
   * Capability providers may pass base64 fields for legacy adapters, or
   * `referenceImageUri` / `maskUri` / `controlImageUri` for extension-host
   * file-backed inputs that the platform materializes before provider execution.
   */
  generateImage(request: {
    prompt: string;
    [key: string]: unknown;
  }): Promise<{ id: string; scope: TaskRunScope }>;
  generateVideo(request: {
    prompt: string;
    [key: string]: unknown;
  }): Promise<{ id: string; scope: TaskRunScope }>;
  generateMusic?(request: {
    prompt: string;
    duration?: number;
    style?: string;
  }): Promise<{ id: string; scope: TaskRunScope }>;
  generateSFX?(request: {
    prompt: string;
    duration?: number;
  }): Promise<{ id: string; scope: TaskRunScope }>;
  generateVoice?(request: {
    text: string;
    voiceId?: string;
  }): Promise<{ id: string; scope: TaskRunScope }>;
  waitForTask(
    taskScope: TaskRunScope,
    timeout?: number,
  ): Promise<{
    status: string;
    outputs?: Array<{ url: string; mimeType?: string }>;
  }>;
  /** Cancel a running media task when the underlying platform supports it. */
  cancelTask?(taskScope: TaskRunScope): Promise<boolean>;
}

/**
 * Purpose-bound media submission exposed to domain capability providers.
 * Provider/model identity stays inside the application composition root.
 */
export interface ICapabilityPurposeMediaService {
  generateImage(
    purpose: string,
    request: { prompt: string; [key: string]: unknown },
  ): Promise<{ id: string; scope: TaskRunScope }>;
  generateVideo(
    purpose: string,
    request: { prompt: string; [key: string]: unknown },
  ): Promise<{ id: string; scope: TaskRunScope }>;
  waitForTask(
    taskScope: TaskRunScope,
    timeout?: number,
  ): Promise<{
    status: string;
    outputs?: Array<{ url: string; mimeType?: string }>;
  }>;
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
 * Subset of ConfigManager — avoids sub-packages depending on @neko/platform.
 */
export interface ICapabilityConfigManager {
  getEnabledModels(): Array<{ id: string; name: string; type?: string }>;
}

// =============================================================================
// Runtime Provider (dynamic registration)
// =============================================================================

/**
 * Context passed to providers when requesting tools.
 * Keeps the provider decoupled from VSCode API and @neko/platform at the type level.
 *
 * Platform services are optional — providers that don't need them (e.g. neko-engine)
 * simply ignore them. Providers that need media generation (e.g. neko-canvas, neko-sketch)
 * use `mediaService` and `configManager`.
 */
export interface AgentCapabilityContext {
  /**
   * Extension context handle (opaque at L0; sub-packages cast to vscode.ExtensionContext at L1).
   */
  extensionContext: unknown;

  /** Media generation service (image/video/music/TTS). Injected by neko-agent when available. */
  mediaService?: ICapabilityMediaService;

  /** Purpose-bound media submission without provider/model disclosure. */
  purposeMediaService?: ICapabilityPurposeMediaService;

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
 * Sub-packages export a class implementing this interface and register it
 * via `vscode.commands.executeCommand('neko.agent.registerCapabilities', provider)`.
 *
 * neko-agent discovers providers through:
 * 1. Static manifest scan → identifies which extensions have capabilities
 * 2. Dynamic registration → receives the provider instance at runtime
 */
export interface AgentCapabilityProvider extends AgentCapabilityProtocolMetadata {
  /** Provider ID (must match manifest.id) */
  readonly id: string;

  /** Provider version (must match manifest.version) */
  readonly version: string;

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
   * Optional: Return ProviderCards contributed by this sub-package.
   *
   * ProviderCards describe model syntax, concept coverage, and training-profile
   * preferences for ProviderExpressionContext. They are registered into the
   * ProviderCard registry when available, but remain optional for backward
   * compatibility with existing AgentCapabilityProvider implementations.
   */
  getProviderCards?(context: AgentCapabilityContext): ProviderCard[];

  /**
   * Optional: Return provider/model expression profiles contributed by this
   * provider/package. Implementations may initially derive these from
   * getProviderCards() to preserve ProviderCard compatibility.
   */
  getProviderExpressionProfiles?(
    context: AgentCapabilityContext,
  ): ProviderExpressionProfileDescriptor[];

  /**
   * Optional: Return artifact protocol/profile/renderer/projector/capability
   * facets. These are registration-time metadata only; implementations remain
   * package-owned and are resolved lazily by the relevant provider.
   */
  getArtifactFacets?(context: AgentCapabilityContext): AgentArtifactFacetsContribution;

  /**
   * Optional terminal-safe reference contributors. TUI consumes these for `@`
   * suggestions; Webview may adapt them into richer chips/previews elsewhere.
   */
  getReferenceContributors?(context: AgentCapabilityContext): readonly AgentReferenceContributor[];

  /**
   * Optional: Cleanup when the provider is unregistered (extension deactivated).
   */
  dispose?(): void;
}
