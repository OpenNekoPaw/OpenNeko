/**
 * Skill & Slash Command Types - Claude-compatible Definitions
 *
 * This module defines two distinct concepts:
 *
 * 1. **Skill** - Semantic discovery, auto-triggered based on description matching
 *    - Located in: `.agents/skills/` (project) or `~/.agents/skills/` (personal)
 *    - Triggered by: Semantic matching of user input against description
 *    - Arguments: NOT supported (no $ARGUMENTS, $1, $2)
 *    - File structure: skill-name/SKILL.md + support files
 *
 * 2. **Slash Command** - Explicit trigger with /command
 *    - Located in: `.neko/commands/` (project) or `~/.neko/commands/` (personal)
 *    - Triggered by: User typing /command
 *    - Arguments: Supported ($ARGUMENTS, $1, $2, etc.)
 *    - File structure: Single .md file (command-name.md)
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/skills
 */

import type {
  NekoSkillHostProjection,
  NekoSkillOverlay,
  PortableSkillDefinition,
} from './portable-skill';
import {
  isAgentProfileKind,
  isAgentProfileRelationship,
  type AgentProfileKind,
  type AgentProfileRelationship,
} from './agent-profile';

// =============================================================================
// Tool Definition Types (for skills that inject tools)
// =============================================================================

/**
 * Tool parameter definition (from tools.md frontmatter)
 */
export interface SkillToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
  enum?: (string | number)[];
  min?: number;
  max?: number;
  default?: unknown;
}

/**
 * Tool definition (from tools.md frontmatter)
 * These are converted to OpenAI-compatible function definitions when injected
 */
export interface SkillToolDefinition {
  /** Tool name (function name) */
  name: string;
  /** Tool description */
  description: string;
  /** Parameter definitions */
  parameters: Record<string, SkillToolParameter>;
}

/**
 * Parsed tools.md frontmatter
 */
export interface ToolsFileFrontmatter {
  tools: SkillToolDefinition[];
}

// =============================================================================
// Source Types
// =============================================================================

/**
 * Where the skill/command comes from
 */
export type SkillSource = 'builtin' | 'personal' | 'project';

/**
 * Canonical explicit entry point for a registry item that reuses the Skill
 * runtime shape.
 */
export type SkillEntryPointKind = 'skill' | 'command-artifact';

/**
 * Source values used by UI-facing skill catalog projections.
 *
 * `SkillSource` remains the runtime/file-skill source contract. The catalog
 * projection adds `plugin` so older extension providers can be represented
 * without pretending their skills came from disk or the marketplace.
 */
export type SkillCatalogSource = SkillSource | 'plugin';

/**
 * Skill directory locations
 */
export const SKILL_DIRECTORIES = {
  /** Project-level skills: .agents/skills/ in project root */
  project: '.agents/skills',
  /** Personal skills: ~/.agents/skills/ */
  personal: '~/.agents/skills',
} as const;

/**
 * Slash command directory locations (separate from skills)
 */
export const COMMAND_DIRECTORIES = {
  /** Project-level commands: .neko/commands/ in project root */
  project: '.neko/commands',
  /** Personal commands: ~/.neko/commands/ */
  personal: '~/.neko/commands',
} as const;

/**
 * Subpackage dependency declared by a Skill (ADR §5.2.1 `requiredSubpackages:`).
 *
 * Keeps dependency granularity at the subpackage level rather than the
 * command level (user intuition, low maintenance). Activation-time guard
 * rejects or warns per the strict/optional flag.
 */
export interface RequiredSubpackage {
  /** Subpackage id (e.g. `neko-cut`). */
  id: string;
  /** Required (blocks activation if missing) vs optional (warn + degrade). */
  required: boolean;
  /** Semver constraint the caller's installed version must satisfy. */
  minVersion?: string;
  /** Fallback message / behaviour when the subpackage is absent. */
  fallback?: {
    message: string;
  };
}

/**
 * Asset reference declared by a Skill (ADR §5.2.1 `referencedAssets:`).
 *
 * Assets live in the media library, not inside the Skill folder, so the
 * Skill only carries an `asset://` URI. Absent required assets block
 * activation; absent optional ones just log a warning.
 */
export interface SkillAssetReference {
  /** `asset://{type}/{id}` URI resolved by PathResolver. */
  uri: string;
  /** Whether the asset is required for the Skill to function. */
  required?: boolean;
  /** Short note explaining what the asset is used for. */
  purpose?: string;
}

/**
 * Cross-Skill reference (ADR §5.2.1 `referencedSkills:`).
 *
 * Declares collaboration or delegation relationships so runtime tooling
 * (e.g. auto-suggesting a collaborator mid-flow) can surface the link
 * without scanning the registry.
 *
 * Distinct from the existing `SkillReference` (a support-document
 * reference defined below) — this type names a related *Skill*, not a
 * support file.
 */
export interface RelatedSkill {
  /** Referenced Skill name. */
  id: string;
  /** Nature of the relationship. */
  relationship: 'collaborator' | 'delegator';
}

/**
 * Typed profile reference declared by a Skill.
 *
 * The Skill references registered Profile contracts by id; it does not own
 * durable profile definitions privately in prompt text.
 */
export interface SkillProfileReference {
  readonly profileId: string;
  readonly kind: AgentProfileKind;
  readonly relationship: AgentProfileRelationship;
  readonly versionRange?: string;
}

/**
 * Media workflow hints for Agent-readable catalog metadata and validation.
 *
 * This is intentionally not a workflow DSL: the Agent may inspect it through
 * GetContext, and runtime tooling may use it for validation or UI catalog
 * projection, but the actual order and decision points stay in SKILL.md
 * prompt-chains.
 */
export interface SkillMediaWorkflowHint {
  /** Concrete request patterns that help the Agent understand fit. */
  useCases?: string[];
  /** Request patterns that help the Agent avoid the wrong Skill. */
  nonGoals?: string[];
  /** Source modalities this Skill can reason about. */
  acceptedModalities?: string[];
  /** Structured artifact kinds this Skill may produce. */
  producedArtifacts?: string[];
  /** Structured artifact profiles this Skill may produce or prefer. */
  artifactProfiles?: string[];
  /** Structured artifact kinds this Skill expects as input. */
  inputArtifacts?: string[];
  /** Capability ids this Skill may reference when the provider is available. */
  referencedCapabilities?: string[];
  /** Projector ids this Skill may suggest after validation and review. */
  suggestedProjectors?: string[];
  /** Free-form tags for discovery and catalogue filtering. */
  tags?: string[];
  /** Relative cost hint used for planning and approval copy. */
  costLevel?: 'free' | 'low' | 'medium' | 'high';
  /** Relative risk hint used for planning and approval copy. */
  riskLevel?: 'low' | 'medium' | 'high' | 'destructive';
  /** Artifact validators that must pass before rendering or send-to actions. */
  validationRequirements?: string[];
  /** Optional tools this Skill can use when available. */
  optionalTools?: string[];
  /** Free-form operation verbs used by Agent-readable catalog summaries. */
  operations?: string[];
}

/**
 * Compliance metadata (ADR §5.2.1 / §9.6 `compliance:`).
 *
 * Purely declarative. Audit tooling reads this block to decide
 * whether a Skill's execution must be recorded with extra evidence
 * (e.g. the skillSha chain in audits.jsonl).
 */
export interface SkillCompliance {
  /** Named compliance framework (SOC2, GDPR, "creator-standard", …). */
  framework?: string;
  /** Whether audit capture is mandatory when this Skill runs. */
  auditRequired?: boolean;
  /** Reviewer roles that signed off on the Skill definition. */
  reviewedBy?: string[];
  /** ISO date of the last compliance review. */
  reviewDate?: string;
}

// =============================================================================
// Skill Catalog Projection Types
// =============================================================================

export type SkillCatalogRole =
  'orchestrator' | 'focused-skill' | 'standalone' | 'quick-action' | 'persona';

export type SkillCatalogVisibility = 'primary' | 'advanced' | 'hidden';

export type SkillCatalogActionId =
  'run' | 'edit' | 'reveal' | 'fork' | 'create' | 'duplicate' | 'rescan';

export type SkillCatalogEditableSource = Extract<SkillCatalogSource, 'project' | 'personal'>;

export interface SkillCatalogAction {
  /** Typed host-resolved action id. Never a VSCode command id or file path. */
  readonly id: SkillCatalogActionId;
  /** Optional display hint. A host UI may localize by action id instead. */
  readonly label?: string;
  /** Optional destination for copy/fork/create actions. */
  readonly targetSource?: SkillCatalogEditableSource;
}

export type SkillCatalogActionInput = SkillCatalogActionId | SkillCatalogAction;

/**
 * Host-owned catalog policy input.
 *
 * This block is display/management metadata only. It is supplied by the Host
 * catalog/registry policy and is never read from a Skill package root manifest.
 * Workflow ordering, branching, routes, and executable stages stay in Skill
 * prompt content.
 *
 * @deprecated Prefer `SkillCatalogPolicy`; this compatibility name remains for
 * existing Host policy call sites and explicit legacy migration only.
 */
export interface SkillCatalogManifest {
  readonly role?: SkillCatalogRole;
  readonly groupId?: string;
  readonly parentSkillIds?: readonly string[];
  readonly visibility?: SkillCatalogVisibility;
  readonly editable?: boolean;
  readonly actions?: readonly SkillCatalogActionInput[];
}

/** Host-owned input used to project runtime catalog metadata. */
export type SkillCatalogPolicy = SkillCatalogManifest;

export interface SkillCatalogMeta {
  readonly role: SkillCatalogRole;
  readonly source: SkillCatalogSource;
  readonly visibility: SkillCatalogVisibility;
  readonly editable: boolean;
  readonly groupId?: string;
  readonly parentSkillIds?: readonly string[];
  readonly actions: readonly SkillCatalogAction[];
}

export interface SkillCatalogLocalizedText {
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface SkillCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon?: string;
  readonly command?: string;
  readonly tags?: readonly string[];
  readonly locales?: Readonly<Record<string, SkillCatalogLocalizedText>>;
  readonly catalog: SkillCatalogMeta;
}

export interface SkillCatalogRef {
  readonly extensionId: string;
  readonly id: string;
  readonly source: SkillCatalogSource;
}

export interface SkillCatalogActionRequest {
  readonly action: SkillCatalogActionId;
  readonly skillRef?: SkillCatalogRef;
  readonly targetSource?: SkillCatalogEditableSource;
  readonly skillName?: string;
}

export interface SkillCatalogProjectable {
  readonly name: string;
  readonly description: string;
  readonly icon?: string;
  readonly source?: SkillCatalogSource;
  readonly command?: string;
  readonly tags?: readonly string[];
  readonly enabled?: boolean;
  readonly mediaWorkflow?: Pick<SkillMediaWorkflowHint, 'tags'>;
  readonly catalog?: SkillCatalogPolicy;
}

export interface SkillCatalogProjectionOptions {
  readonly extensionId?: string;
  readonly id?: string;
  readonly displayName?: string;
  readonly source?: SkillCatalogSource;
  readonly command?: string;
  readonly tags?: readonly string[];
  readonly locales?: Readonly<Record<string, SkillCatalogLocalizedText>>;
  readonly catalog?: SkillCatalogPolicy;
  readonly editable?: boolean;
  readonly defaultSource?: SkillCatalogSource;
  readonly defaultRole?: SkillCatalogRole;
  readonly defaultVisibility?: SkillCatalogVisibility;
  readonly defaultActions?: readonly SkillCatalogActionInput[];
}

// =============================================================================
// Skill Types (Agent-Visible Capabilities)
// =============================================================================

/**
 * Skill - Claude-compatible capability instructions
 *
 * A Skill is a Markdown document (SKILL.md) that teaches Claude how to
 * perform a specific task. Registry search may expose Skills as candidates,
 * but candidate discovery must not create active Skill state. Activation is
 * limited to explicit user invocation or an Agent `ActivateSkill` tool call
 * after the Agent has decided and explained why the Skill is needed.
 *
 * Key characteristics:
 * - Invoked explicitly with `$skill-name` or by Agent `ActivateSkill`
 * - Slash command artifacts reuse this runtime shape but set
 *   `entryPointKind: "command-artifact"`
 * - Supports multi-file structure with support files
 */
export interface Skill {
  /**
   * Unique identifier (lowercase letters, numbers, hyphens)
   * Max 64 characters. Should match directory name.
   * @example "commit-helper", "pdf-processing"
   */
  name: string;

  /**
   * Catalog description shown to users and to the Agent as candidate context.
   *
   * Should answer:
   * 1. What does this skill do?
   * 2. When should it be used?
   *
   * Do not describe this as a keyword trigger. The Agent may use the description
   * as context when deciding whether to call `ActivateSkill`, but registry/UI
   * search matches are candidates only and must not activate the Skill.
   * Max 1024 characters.
   *
   * @example "Extract text and tables from PDF files, fill forms, merge documents.
   *          Use after the Agent confirms the user needs PDF document operations."
   */
  description: string;

  /**
   * Main skill content (from SKILL.md body)
   * Injected as system prompt when skill is applied
   */
  content: string;

  /**
   * Support file references (Progressive Disclosure)
   *
   * **Claude-compatible**: Only stores file paths, NOT content.
   * Claude reads support files on-demand using the Read tool.
   *
   * @example ["reference.md", "examples.md"]
   */
  supportFileRefs?: string[];

  /**
   * Allowed tools - Restrict which tools Claude can use during skill execution
   * @example ["Read", "Grep", "Bash(git:*)", "Bash(python:*)"]
   */
  allowedTools?: string[];

  /**
   * Tools reference file path (relative to skill directory)
   * Points to a markdown file with tool definitions in YAML frontmatter
   * @example "references/tools.md"
   */
  toolsRef?: string;

  /**
   * Tool definitions - Loaded from tools.md when skill is activated
   * These tools are injected into the AI request when the skill is applied
   */
  toolDefinitions?: SkillToolDefinition[];

  /**
   * File path patterns that trigger this skill on save.
   * Uses glob syntax (e.g. "**\/*.fountain", "src/**\/*.ts").
   * When a file matching these patterns is saved, the skill is auto-activated.
   */
  paths?: string[];

  /**
   * Model override for this skill
   * @example "claude-sonnet-4-20250514"
   */
  model?: string;

  /**
   * Skill source (project, personal, builtin)
   */
  source: SkillSource;

  /**
   * Directory path where skill is located
   * @example ".skill/pdf-processing"
   */
  directoryPath?: string;

  /**
   * Icon (emoji or icon name)
   * **OpenNeko extension** - Not in Claude spec
   * @example "📄", "🔍"
   */
  icon?: string;

  /**
   * Whether the skill is enabled
   * **OpenNeko extension** - Not in Claude spec
   * @default true
   */
  enabled: boolean;

  // ===========================================================================
  // Explicit Entry Point Metadata
  // ===========================================================================

  /**
   * Distinguishes ordinary Skills from `.neko/commands/*.md` prompt artifacts
   * that intentionally live in the `/` command namespace.
   * @default "skill"
   */
  entryPointKind?: SkillEntryPointKind;

  /**
   * Slash command trigger (without `/`) for command artifacts.
   * Ordinary Skills may still carry this temporarily for legacy migration, but
   * canonical explicit Skill invocation is `$<name>`.
   * @example "commit", "review-pr"
   */
  command?: string;

  /**
   * Argument hint shown for command artifacts or explicit Skill invocation UI.
   * @example "[message]", "[pr-number] [priority]"
   */
  argumentHint?: string;

  /**
   * Whether content supports argument interpolation ($ARGUMENTS, $1-$99).
   * For ordinary Skills this is used by `$skill args`; for command artifacts it
   * is used by `/command args`.
   * @default false
   */
  supportsArguments?: boolean;

  // ===========================================================================
  // Legacy flattened metadata compatibility
  //
  // Existing runtime contributors may still project these fields while the
  // explicit migration boundary is in use. Canonical file loading does not read
  // them from a root manifest. New author and Host data belongs in
  // portableDefinition, nekoOverlay, or hostProjection below.
  // ===========================================================================

  /**
   * Semver version string. Required by the SDD spec so audit / compatibility
   * tooling can pin to a specific Skill revision.
   * @example "1.0.0"
   */
  version?: string;

  /**
   * Domain identifier — groups Skills by creative vertical (cut / story /
   * canvas / …). Free-form for now so new domains can be added without a
   * schema bump.
   * @example "cut"
   */
  domain?: string;

  /**
   * Subpackages the Skill depends on. Activation-time guard enforces the
   * `required` flag and optionally the `minVersion` constraint.
   */
  requiredSubpackages?: RequiredSubpackage[];

  /**
   * Whether AutoMode may auto-select this Skill based on description
   * matching. Falls back to true when omitted; set false for high-risk or
   * test Skills that should only activate on explicit user intent.
   * @default true
   */
  autoInvoke?: boolean;

  /**
   * Assets (characters, styles, LoRAs, …) the Skill relies on. Resolved
   * through PathResolver against the configured media library.
   */
  referencedAssets?: SkillAssetReference[];

  /**
   * Related Skills — collaborators the runtime can surface when the user
   * crosses domain boundaries, or delegators the Skill hands off to.
   */
  referencedSkills?: RelatedSkill[];

  /**
   * Profiles this Skill consumes, produces, requires, or prefers. Canonical
   * runtime contract; `mediaWorkflow.artifactProfiles` remains a shorthand for
   * produced Artifact Profiles.
   */
  profileReferences?: SkillProfileReference[];

  /** Media workflow discovery hints. Not an executable workflow definition. */
  mediaWorkflow?: SkillMediaWorkflowHint;

  /**
   * Compliance metadata. Consumed by audit tooling; does not change
   * runtime behaviour on its own.
   */
  compliance?: SkillCompliance;

  /** UI catalog metadata. Display/management only; not workflow ordering. */
  catalog?: SkillCatalogMeta;

  /** Portable author-owned definition parsed from SKILL.md. */
  portableDefinition?: PortableSkillDefinition;

  /** Optional validated Neko Host overlay parsed from agents/neko.yaml. */
  nekoOverlay?: NekoSkillOverlay;

  /** Host/Registry-owned runtime facts; never populated from author metadata. */
  hostProjection?: NekoSkillHostProjection;
}

// =============================================================================
// Slash Command Types (Explicit Trigger)
// =============================================================================

/**
 * Slash Command - Explicit /command trigger
 *
 * A Slash Command is a single Markdown file that provides instructions
 * to Claude when explicitly invoked with /command.
 *
 * Key characteristics:
 * - Triggered by explicit /command
 * - Supports argument interpolation ($ARGUMENTS, $1, $2, etc.)
 * - Single file structure
 */
export interface SlashCommand {
  /**
   * Command name (without /)
   * @example "commit", "review-pr"
   */
  command: string;

  /**
   * Description shown in autocomplete
   */
  description: string;

  /**
   * Command content with argument placeholders
   * Supports: $ARGUMENTS, $1, $2, ... $99
   */
  content: string;

  /**
   * Argument hint shown in UI
   * @example "[message]", "[pr-number] [priority]"
   */
  argumentHint?: string;

  /**
   * Allowed tools during command execution
   */
  allowedTools?: string[];

  /**
   * Model override
   */
  model?: string;

  /**
   * Source
   */
  source: SkillSource;

  /**
   * File path
   */
  filePath?: string;

  /**
   * Icon
   * **OpenNeko extension** - Not in Claude spec
   */
  icon?: string;

  /**
   * Whether enabled
   * **OpenNeko extension** - Not in Claude spec
   */
  enabled: boolean;
}

// =============================================================================
// Skill Matching (Candidate Discovery)
// =============================================================================

/**
 * Skill match result from candidate discovery.
 */
export interface SkillMatch {
  /** Matched skill */
  skill: Skill;

  /**
   * Relevance score (0-1)
   * Higher score means better match
   */
  relevance: number;

  /**
   * Candidate discovery reason. This is diagnostic/search metadata only; it is
   * not an activation reason and must not create active Skill lifecycle state.
   * @example "Matched catalog candidate 'PDF document operations'"
   */
  reason: string;
}

/**
 * Skill matcher interface - For candidate discovery only.
 */
export interface ISkillMatcher {
  /**
   * Find Skill candidates that match the user's request.
   *
   * Implementations must not apply Skills, create lifecycle records, inject
   * prompts, or change tool policy. Activation remains a separate explicit
   * user action or Agent `ActivateSkill` tool call.
   *
   * @param request User's input text
   * @param skills Available skills to search
   * @returns Matched skills sorted by relevance (highest first)
   */
  match(request: string, skills: Skill[]): SkillMatch[];
}

// =============================================================================
// Injection
// =============================================================================

/**
 * Result of skill/command injection into conversation context
 */
export interface SkillInjection {
  /** System prompt to inject (content + support files) */
  systemPrompt: string;

  /** Allowed tools (if restricted) */
  allowedTools?: string[];

  /** Name for tracking */
  name: string;

  /** Model override */
  model?: string;

  /** Type indicator */
  type: 'skill' | 'slash-command';
}

/**
 * Skill injector interface
 */
export interface ISkillInjector {
  /**
   * Inject a skill (with optional argument interpolation and shell execution)
   */
  injectSkill(skill: Skill, args?: string): Promise<SkillInjection>;

  /**
   * Interpolate arguments in content
   */
  interpolate(content: string, args: string): string;
}

// =============================================================================
// Registry
// =============================================================================

/**
 * Skill registry — unified storage for skills (including command-enabled skills)
 */
export interface ISkillRegistry {
  // Skill operations
  registerSkill(skill: Skill): void;
  unregisterSkill(name: string): void;
  getSkill(name: string): Skill | undefined;
  listSkills(): Skill[];
  listAllSkills(): Skill[];

  /**
   * Find a skill by its command trigger name.
   * Only returns skills that have the `command` field set.
   */
  getSkillByCommand(commandName: string): Skill | undefined;

  // Search
  searchSkills(keyword: string): Skill[];

  /**
   * Ensure a skill's content is fully loaded (tiered loading support).
   * For lazy skills, triggers deferred content load.
   * For eager skills, returns immediately.
   */
  ensureLoaded(name: string): Promise<Skill | undefined>;

  // Counts
  readonly skillCount: number;

  // Clear
  clear(): void;
}

/**
 * Result of discovering skills matching user input
 */
export interface SkillDiscoveryResult {
  /** Whether any skills were matched */
  found: boolean;
  /** Matched skills (sorted by relevance) */
  matches: SkillMatch[];
  /** Top match (if any) */
  topMatch?: SkillMatch;
  /** Whether confirmation is required */
  requiresConfirmation: boolean;
}

/**
 * Result of applying a skill or slash command
 */
export interface SkillApplicationResult {
  /** Whether skill was applied */
  applied: boolean;
  /** Injection result (if applied) */
  injection?: SkillInjection;
  /** Applied skill */
  skill?: Skill;
  /** Error message if failed */
  error?: string;
}

/**
 * Skill service interface - Full-featured service for agent runtime
 *
 * Focuses on orchestration: discovery, application, and runtime enforcement.
 * For registry operations, access the registry directly via `skillService.registry`.
 */
export interface ISkillService {
  /**
   * Skill registry - use directly for register/get/list operations
   */
  readonly registry: ISkillRegistry;

  /**
   * Number of registered skills (convenience getter)
   */
  readonly skillCount: number;

  /**
   * Apply a skill (inject into conversation).
   * @param skill Skill to apply
   * @param args Optional arguments (for skills with command trigger)
   */
  apply(skill: Skill, args?: string): SkillInjection;

  /**
   * Discover skills matching user input
   */
  discover(input: string, limit?: number): SkillDiscoveryResult;

  /**
   * Discover and apply a matching skill, with optional confirmation callback
   */
  discoverAndApply(
    userInput: string,
    onConfirm?: (skill: Skill) => Promise<boolean>,
  ): Promise<SkillApplicationResult | null>;

  /**
   * Get currently active skill (if any)
   */
  getActiveSkill(): Skill | undefined;

  /**
   * Clear active skill and remove all injected prompts/permissions
   */
  clearActiveSkill(): void;

  /**
   * Check whether a tool is allowed under the current active skill's restrictions
   */
  isToolAllowed(toolName: string): boolean;
}

// =============================================================================
// Loading
// =============================================================================

/**
 * Legacy/runtime-compatible frontmatter projection. Canonical Skill authoring uses
 * `PortableSkillDefinition`; Host-owned fields remain here only for existing runtime DTOs
 * and explicit legacy migration compatibility.
 */
export interface SkillFrontmatter {
  /** Skill name (required) */
  name: string;

  /** Skill description (required) */
  description: string;

  /** Allowed tools */
  'allowed-tools'?: string;

  /**
   * Tools reference file path (relative to skill directory)
   * Points to a markdown file with tool definitions in YAML frontmatter
   * @example "references/tools.md"
   */
  'tools-ref'?: string;

  /** Model override */
  model?: string;

  /** Icon */
  icon?: string;

  /** Enabled state */
  enabled?: boolean;

  // ===========================================================================
  // Shell & Conditional Trigger (Claude Code compatible)
  // ===========================================================================

  /**
   * Whether to execute embedded shell commands (!`command`) in skill content.
   * Default true for file-based skills, false for MCP-sourced skills.
   * Set to false to disable shell execution for security.
   */
  shell?: boolean;

  /**
   * File glob patterns that conditionally trigger this skill.
   * When a file matching these patterns is saved, the skill is auto-activated.
   * @example ["**\/*.fountain", "**\/*.fdx"]
   */
  paths?: string[];

  // ===========================================================================
  // Marketplace (injected by market install)
  // ===========================================================================

  /**
   * Market package identifier (injected during marketplace install)
   * @example "@publisher/skill-name"
   */
  'market-id'?: string;

  // Legacy manifest-era fields are projected onto `Skill` only by explicit
  // migration/compatibility adapters. Canonical packages use portable SKILL.md
  // plus optional agents/neko.yaml and never author a root manifest.
}

// =============================================================================
// Legacy Skill manifest compatibility
// =============================================================================

/**
 * Legacy Neko Skill metadata retained for explicit migration and compatibility
 * validation. It is not the canonical authoring contract and normal Skill loading
 * must not read a root `manifest.json`. Representable author metadata migrates to
 * portable `SKILL.md` or `agents/neko.yaml`; Host facts stay Host-owned.
 *
 * @deprecated Use portable Skill and Neko overlay contracts for new code.
 */
export interface SkillManifest {
  /** Semver version string. Required by the SDD spec for audit tracing. */
  version?: string;

  /** Domain identifier (cut / story / canvas / ...). Free-form. */
  domain?: string;

  /** Subpackage dependencies enforced at activation time. */
  requiredSubpackages?: RequiredSubpackage[];

  /**
   * Whether AutoMode may auto-select this Skill. Defaults to true when
   * omitted; set false for high-risk or test-only Skills.
   */
  autoInvoke?: boolean;

  /** Assets the Skill depends on (resolved via PathResolver). */
  referencedAssets?: SkillAssetReference[];

  /** Cross-Skill relationships surfaced by the runtime. */
  referencedSkills?: RelatedSkill[];

  /**
   * Profiles this Skill consumes, produces, requires, or prefers. Canonical
   * runtime contract; `mediaWorkflow.artifactProfiles` remains supported as a
   * shorthand for produced Artifact Profiles.
   */
  profileReferences?: SkillProfileReference[];

  /** Media workflow discovery hints. Not an executable workflow definition. */
  mediaWorkflow?: SkillMediaWorkflowHint;

  /** Compliance metadata consumed by audit tooling. */
  compliance?: SkillCompliance;

  /** UI catalog metadata. Display/management only; not workflow ordering. */
  catalog?: SkillCatalogManifest;
}

/**
 * YAML frontmatter from slash command .md file
 */
export interface CommandFrontmatter {
  /** Command name (required, without /) */
  command: string;

  /** Description */
  description: string;

  /** Argument hint */
  'argument-hint'?: string;

  /** Allowed tools */
  'allowed-tools'?: string;

  /** Model */
  model?: string;

  /** Icon */
  icon?: string;

  /** Enabled */
  enabled?: boolean;
}

/**
 * Parsed SKILL.md file
 */
export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter;
  content: string;
  /** Referenced support files (relative paths) */
  supportFileRefs: string[];
}

/**
 * Skill load result
 */
export interface SkillLoadResult {
  skills: Skill[];
  commands: SlashCommand[];
  errors: SkillLoadError[];
}

/**
 * Skill load error
 */
export interface SkillLoadError {
  file: string;
  message: string;
  details?: string;
}

/**
 * File system interface for skill loading
 */
export interface ISkillFileSystem {
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  isDirectory(path: string): Promise<boolean>;
}

// =============================================================================
// Resource Injection Types
// =============================================================================

/**
 * Reference document configuration for skill
 */
export interface SkillReference {
  /** Relative path from skill directory */
  path: string;
  /** Display name */
  name: string;
  /** Description of what this reference contains */
  description?: string;
  /** Whether to inject this reference into context */
  inject?: boolean;
}

/**
 * Script configuration for skill
 */
export interface SkillScript {
  /** Relative path from skill directory */
  path: string;
  /** Display name */
  name: string;
  /** Description of what this script does */
  description?: string;
  /** Script language: python, typescript */
  language: 'python' | 'typescript' | 'javascript' | 'shell';
  /** Whether this script is enabled for execution */
  enabled?: boolean;
}

/**
 * Configured Skill (with UI/settings extensions)
 */
export interface ConfiguredSkill extends Skill {
  /** User notes/documentation */
  notes?: string;

  /** Tags for organization */
  tags?: string[];

  /** Last modified timestamp */
  lastModified?: number;
}

/**
 * Configured Slash Command
 */
export interface ConfiguredSlashCommand extends SlashCommand {
  /** User notes/documentation */
  notes?: string;

  /** Tags for organization */
  tags?: string[];

  /** Last modified timestamp */
  lastModified?: number;
}

// =============================================================================
// UI Types
// =============================================================================

/**
 * Skill summary for UI display
 */
export interface SkillSummary {
  name: string;
  description: string;
  icon?: string;
  source: SkillSource;
  enabled: boolean;
  type: 'skill' | 'slash-command';
  /** For slash commands only */
  command?: string;
  argumentHint?: string;
}

// =============================================================================
// Validation
// =============================================================================

export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert Skill to SkillSummary
 */
export function toSkillSummary(skill: Skill): SkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    icon: skill.icon,
    source: skill.source,
    enabled: skill.enabled,
    type: 'skill',
  };
}

/**
 * Convert SlashCommand to SkillSummary
 */
export function toCommandSummary(command: SlashCommand): SkillSummary {
  return {
    name: command.command,
    description: command.description,
    icon: command.icon,
    source: command.source,
    enabled: command.enabled,
    type: 'slash-command',
    command: command.command,
    argumentHint: command.argumentHint,
  };
}

export function toSkillCatalogEntry(
  skill: SkillCatalogProjectable,
  options: SkillCatalogProjectionOptions = {},
): SkillCatalogEntry {
  const tags = resolveCatalogTags(skill, options);
  return {
    id: options.id ?? skill.name,
    name: options.displayName ?? skill.name,
    description: skill.description,
    icon: skill.icon,
    command: options.command ?? skill.command,
    tags,
    locales: options.locales,
    catalog: toSkillCatalogMeta(skill, options),
  };
}

export function toConfiguredSkillCatalogEntry(
  skill: ConfiguredSkill,
  options: SkillCatalogProjectionOptions = {},
): SkillCatalogEntry {
  return toSkillCatalogEntry(skill, {
    ...options,
    tags: options.tags ?? skill.tags,
  });
}

export function toLazySkillCatalogEntry(
  skill: SkillCatalogProjectable,
  options: SkillCatalogProjectionOptions = {},
): SkillCatalogEntry {
  return toSkillCatalogEntry(skill, options);
}

export function toSkillCatalogMeta(
  skill: SkillCatalogProjectable,
  options: SkillCatalogProjectionOptions = {},
): SkillCatalogMeta {
  const catalog = options.catalog ?? skill.catalog;
  const source = options.source ?? skill.source ?? options.defaultSource ?? 'plugin';
  const role = catalog?.role ?? options.defaultRole ?? 'standalone';
  const visibility =
    catalog?.visibility ??
    options.defaultVisibility ??
    (role === 'persona' ? 'hidden' : role === 'focused-skill' ? 'advanced' : 'primary');
  const editable = catalog?.editable ?? options.editable ?? isEditableSkillCatalogSource(source);
  const actions = normalizeSkillCatalogActions(
    catalog?.actions ?? options.defaultActions ?? createDefaultCatalogActions({ source, editable }),
  );

  return removeUndefinedCatalogMetaFields({
    role,
    source,
    visibility,
    editable,
    groupId: catalog?.groupId,
    parentSkillIds: catalog?.parentSkillIds ? [...catalog.parentSkillIds] : undefined,
    actions,
  });
}

export function normalizeSkillCatalogActions(
  actions: readonly SkillCatalogActionInput[],
): readonly SkillCatalogAction[] {
  const normalized: SkillCatalogAction[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    const candidate = normalizeSkillCatalogAction(action);
    if (!candidate) continue;
    const key = `${candidate.id}:${candidate.targetSource ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(candidate);
  }

  return normalized;
}

export function isSkillCatalogRole(value: unknown): value is SkillCatalogRole {
  return typeof value === 'string' && SKILL_CATALOG_ROLES.includes(value as SkillCatalogRole);
}

export function isSkillCatalogSource(value: unknown): value is SkillCatalogSource {
  return typeof value === 'string' && SKILL_CATALOG_SOURCES.includes(value as SkillCatalogSource);
}

export function isSkillCatalogActionId(value: unknown): value is SkillCatalogActionId {
  return (
    typeof value === 'string' && SKILL_CATALOG_ACTION_IDS.includes(value as SkillCatalogActionId)
  );
}

export function isEditableSkillCatalogSource(value: unknown): value is SkillCatalogEditableSource {
  return (
    typeof value === 'string' &&
    EDITABLE_SKILL_CATALOG_SOURCES.includes(value as SkillCatalogEditableSource)
  );
}

export function isSkillCatalogRef(value: unknown): value is SkillCatalogRef {
  if (!isRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (key !== 'extensionId' && key !== 'id' && key !== 'source') {
      return false;
    }
  }
  return (
    typeof value.extensionId === 'string' &&
    typeof value.id === 'string' &&
    isSkillCatalogSource(value.source)
  );
}

export function isSkillCatalogActionRequest(value: unknown): value is SkillCatalogActionRequest {
  if (!isRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (key !== 'action' && key !== 'skillRef' && key !== 'targetSource' && key !== 'skillName') {
      return false;
    }
  }
  if (!isSkillCatalogActionId(value.action)) return false;
  if (value.skillRef !== undefined && !isSkillCatalogRef(value.skillRef)) return false;
  if (value.targetSource !== undefined && !isEditableSkillCatalogSource(value.targetSource)) {
    return false;
  }
  if (value.skillName !== undefined && typeof value.skillName !== 'string') return false;
  return true;
}

function resolveCatalogTags(
  skill: SkillCatalogProjectable,
  options: SkillCatalogProjectionOptions,
): readonly string[] | undefined {
  const tags = options.tags ?? skill.tags ?? skill.mediaWorkflow?.tags;
  return tags ? [...tags] : undefined;
}

function createDefaultCatalogActions(input: {
  readonly source: SkillCatalogSource;
  readonly editable: boolean;
}): readonly SkillCatalogActionInput[] {
  if (input.editable) {
    return ['run', 'edit', 'reveal', 'duplicate'];
  }
  if (input.source === 'builtin') {
    return ['run', 'fork'];
  }
  return ['run'];
}

function normalizeSkillCatalogAction(
  action: SkillCatalogActionInput,
): SkillCatalogAction | undefined {
  if (typeof action === 'string') {
    return isSkillCatalogActionId(action) ? { id: action } : undefined;
  }
  if (!action || !isSkillCatalogActionId(action.id)) return undefined;
  return removeUndefinedActionFields({
    id: action.id,
    label: action.label,
    targetSource: action.targetSource,
  });
}

function removeUndefinedActionFields(action: SkillCatalogAction): SkillCatalogAction {
  return {
    id: action.id,
    ...(action.label !== undefined ? { label: action.label } : {}),
    ...(action.targetSource !== undefined ? { targetSource: action.targetSource } : {}),
  };
}

function removeUndefinedCatalogMetaFields(meta: SkillCatalogMeta): SkillCatalogMeta {
  return {
    role: meta.role,
    source: meta.source,
    visibility: meta.visibility,
    editable: meta.editable,
    ...(meta.groupId !== undefined ? { groupId: meta.groupId } : {}),
    ...(meta.parentSkillIds !== undefined ? { parentSkillIds: meta.parentSkillIds } : {}),
    actions: meta.actions,
  };
}

/**
 * Parse allowed-tools string into array
 */
export function parseAllowedTools(toolsStr: string | undefined): string[] | undefined {
  if (!toolsStr) return undefined;
  return toolsStr
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function isToolAllowed(
  toolName: string,
  allowedTools: readonly string[] | undefined,
): boolean {
  if (!allowedTools || allowedTools.length === 0) return true;
  return allowedTools.some((pattern) => {
    if (pattern === toolName || pattern === '*') return true;
    if (!pattern.endsWith('*')) return false;
    return toolName.startsWith(pattern.slice(0, -1));
  });
}

export interface SkillProfileReferenceContainer {
  readonly profileReferences?: readonly SkillProfileReference[];
  readonly mediaWorkflow?: Pick<SkillMediaWorkflowHint, 'artifactProfiles'>;
}

export function collectSkillProfileReferences(
  input: SkillProfileReferenceContainer,
): readonly SkillProfileReference[] {
  const references: SkillProfileReference[] = [];
  const seen = new Set<string>();

  for (const reference of input.profileReferences ?? []) {
    const key = toSkillProfileReferenceKey(reference);
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(reference);
  }

  for (const profileId of input.mediaWorkflow?.artifactProfiles ?? []) {
    const reference: SkillProfileReference = {
      profileId,
      kind: 'artifact',
      relationship: 'produces',
    };
    const key = toSkillProfileReferenceKey(reference);
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(reference);
  }

  return references;
}

/**
 * Semver-ish regex: major.minor.patch with optional pre-release and build
 * metadata. Deliberately not importing a full semver library — Skills
 * author-input versions are validated to catch typos, not to run complex
 * range queries.
 */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const SKILL_NAME_RE = /^[a-z0-9-]+$/;
const MAX_SKILL_NAME_LENGTH = 64;
const MAX_SKILL_DESCRIPTION_LENGTH = 2048;
const MEDIA_WORKFLOW_DSL_FIELD_NAMES = [
  'branch',
  'branches',
  'condition',
  'conditions',
  'dag',
  'edge',
  'edges',
  'flow',
  'flows',
  'node',
  'nodes',
  'phase',
  'phases',
  'pipeline',
  'pipelines',
  'priority',
  'route',
  'routes',
  'stage',
  'stages',
  'step',
  'steps',
  'workflow',
  'workflows',
] as const;

const EXECUTABLE_WORKFLOW_LANGUAGE_RE =
  /\b(?:executable\s+)?(?:workflow|dag|pipeline)\b.{0,80}\b(?:runtime|executor|execut(?:e|able|ion)|node|transition|scheduler|route|branch)\b|\b(?:runtime|executor|scheduler)\b.{0,80}\b(?:workflow|dag|pipeline|node|transition)\b/i;
const PROMPT_CHAIN_GUIDANCE_RE = /\bprompt-chain\b.{0,80}\bguidance\b/i;
const NON_EXECUTABLE_WORKFLOW_CLARIFICATION_RE =
  /\bnot\b.{0,80}\b(?:executable|runtime|dag|workflow\s+runtime|workflow\s+engine)\b|\bno\b.{0,80}\b(?:runtime|dag|workflow\s+engine|executor)\b/i;

const SKILL_CATALOG_ROLES = [
  'orchestrator',
  'focused-skill',
  'standalone',
  'quick-action',
  'persona',
] as const satisfies readonly SkillCatalogRole[];

const SKILL_CATALOG_VISIBILITIES = [
  'primary',
  'advanced',
  'hidden',
] as const satisfies readonly SkillCatalogVisibility[];

const SKILL_CATALOG_SOURCES = [
  'builtin',
  'personal',
  'project',
  'plugin',
] as const satisfies readonly SkillCatalogSource[];

const SKILL_CATALOG_ACTION_IDS = [
  'run',
  'edit',
  'reveal',
  'fork',
  'create',
  'duplicate',
  'rescan',
] as const satisfies readonly SkillCatalogActionId[];

const EDITABLE_SKILL_CATALOG_SOURCES = [
  'project',
  'personal',
] as const satisfies readonly SkillCatalogEditableSource[];

export function validateSkill(skill: Partial<Skill>): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof skill.name !== 'string' || skill.name.length === 0) {
    errors.push('Missing required field: name');
  } else {
    if (!SKILL_NAME_RE.test(skill.name)) {
      errors.push('Field "name" must contain only lowercase letters, numbers, and hyphens');
    }
    if (skill.name.length > MAX_SKILL_NAME_LENGTH) {
      errors.push(`Field "name" must be at most ${MAX_SKILL_NAME_LENGTH} characters`);
    }
  }

  if (typeof skill.description !== 'string' || skill.description.trim().length === 0) {
    errors.push('Missing required field: description');
  } else if (skill.description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    errors.push(`Field "description" must be at most ${MAX_SKILL_DESCRIPTION_LENGTH} characters`);
  }

  if (typeof skill.content !== 'string' || skill.content.trim().length === 0) {
    errors.push('Missing required field: content');
  } else {
    validateSkillPromptChainLanguage(skill.content, warnings);
  }

  validateLegacySkillMetadata(skill, errors, warnings, false);
  return { valid: errors.length === 0, errors, warnings };
}

function validateSkillPromptChainLanguage(content: string, warnings: string[]): void {
  if (!EXECUTABLE_WORKFLOW_LANGUAGE_RE.test(content)) return;
  if (
    PROMPT_CHAIN_GUIDANCE_RE.test(content) &&
    NON_EXECUTABLE_WORKFLOW_CLARIFICATION_RE.test(content)
  ) {
    return;
  }

  warnings.push(
    'Skill prompt text appears to describe executable workflow/DAG/runtime behavior. Skills may provide prompt-chain guidance, but execution, lifecycle, approval, and state stay Agent-native.',
  );
}

/** @deprecated Explicit legacy migration/compatibility validation only. */
export function validateSkillManifest(
  manifest: Partial<SkillManifest>,
  errors: string[] = [],
  warnings: string[] = [],
): SkillValidationResult {
  return validateLegacySkillMetadata(manifest, errors, warnings, true);
}

function validateLegacySkillMetadata(
  manifest: Partial<SkillManifest>,
  errors: string[],
  warnings: string[],
  warnMissingRecommendedFields: boolean,
): SkillValidationResult {
  // version: explicit legacy validation warns if missing; canonical runtime projections do not.
  if (manifest.version === undefined) {
    if (warnMissingRecommendedFields) {
      warnings.push('Missing legacy metadata field: version (recommended, semver string)');
    }
  } else if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
    errors.push(`Invalid version "${manifest.version}" — must be a semver string (e.g. "1.0.0")`);
  }

  // domain: explicit legacy validation warns if missing; canonical projections do not.
  if (manifest.domain === undefined) {
    if (warnMissingRecommendedFields) {
      warnings.push('Missing legacy metadata field: domain (recommended, e.g. "cut" / "story")');
    }
  } else if (typeof manifest.domain !== 'string' || manifest.domain.trim().length === 0) {
    errors.push('Field "domain" must be a non-empty string');
  }

  // requiredSubpackages: shape check. Duplicate ids are an error.
  if (manifest.requiredSubpackages !== undefined) {
    if (!Array.isArray(manifest.requiredSubpackages)) {
      errors.push('Field "requiredSubpackages" must be an array');
    } else {
      const seenIds: Record<string, true> = {};
      for (let idx = 0; idx < manifest.requiredSubpackages.length; idx++) {
        const dep = manifest.requiredSubpackages[idx];
        if (!dep || typeof dep !== 'object') {
          errors.push(`requiredSubpackages[${idx}] must be an object`);
          continue;
        }
        if (typeof dep.id !== 'string' || dep.id.length === 0) {
          errors.push(`requiredSubpackages[${idx}].id must be a non-empty string`);
        } else if (seenIds[dep.id]) {
          errors.push(`Duplicate requiredSubpackages entry for id "${dep.id}"`);
        } else {
          seenIds[dep.id] = true;
        }
        if (typeof dep.required !== 'boolean') {
          errors.push(`requiredSubpackages[${idx}].required must be a boolean`);
        }
        if (dep.minVersion !== undefined && !SEMVER_RE.test(String(dep.minVersion))) {
          errors.push(`requiredSubpackages[${idx}].minVersion must be a semver string`);
        }
      }
    }
  }

  // autoInvoke: boolean if present.
  if (manifest.autoInvoke !== undefined && typeof manifest.autoInvoke !== 'boolean') {
    errors.push('Field "autoInvoke" must be a boolean');
  }

  // Atomic tools are contributed by subpackages through AgentCapabilityProvider.
  // Skills remain prompt-chain instructions; the Agent drives execution via TOOL_NAMES.
  // If a real cross-Skill sharing need emerges, introduce explicit reference fields
  // instead of inline operation definitions.

  // referencedAssets: require asset:// URI.
  if (manifest.referencedAssets !== undefined) {
    if (!Array.isArray(manifest.referencedAssets)) {
      errors.push('Field "referencedAssets" must be an array');
    } else {
      for (let idx = 0; idx < manifest.referencedAssets.length; idx++) {
        const ref = manifest.referencedAssets[idx];
        if (!ref || typeof ref !== 'object') {
          errors.push(`referencedAssets[${idx}] must be an object`);
          continue;
        }
        if (typeof ref.uri !== 'string' || !ref.uri.startsWith('asset://')) {
          errors.push(`referencedAssets[${idx}].uri must start with "asset://"`);
        }
      }
    }
  }

  // referencedSkills: require relationship enum.
  if (manifest.referencedSkills !== undefined) {
    if (!Array.isArray(manifest.referencedSkills)) {
      errors.push('Field "referencedSkills" must be an array');
    } else {
      for (let idx = 0; idx < manifest.referencedSkills.length; idx++) {
        const ref = manifest.referencedSkills[idx];
        if (!ref || typeof ref !== 'object') {
          errors.push(`referencedSkills[${idx}] must be an object`);
          continue;
        }
        if (typeof ref.id !== 'string' || ref.id.length === 0) {
          errors.push(`referencedSkills[${idx}].id must be a non-empty string`);
        }
        if (ref.relationship !== 'collaborator' && ref.relationship !== 'delegator') {
          errors.push(
            `referencedSkills[${idx}].relationship must be "collaborator" or "delegator"`,
          );
        }
      }
    }
  }

  validateSkillProfileReferences(manifest.profileReferences, errors);
  validateSkillMediaWorkflowHint(manifest.mediaWorkflow, errors);
  validateSkillCatalogManifest(manifest.catalog, errors);

  // compliance: light shape check; semantics are caller-defined.
  if (manifest.compliance !== undefined) {
    if (typeof manifest.compliance !== 'object' || Array.isArray(manifest.compliance)) {
      errors.push('Field "compliance" must be an object');
    } else {
      const c = manifest.compliance;
      if (c.framework !== undefined && typeof c.framework !== 'string') {
        errors.push('compliance.framework must be a string');
      }
      if (c.auditRequired !== undefined && typeof c.auditRequired !== 'boolean') {
        errors.push('compliance.auditRequired must be a boolean');
      }
      if (c.reviewedBy !== undefined && !Array.isArray(c.reviewedBy)) {
        errors.push('compliance.reviewedBy must be an array of strings');
      }
      if (c.reviewDate !== undefined && typeof c.reviewDate !== 'string') {
        errors.push('compliance.reviewDate must be an ISO date string');
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateSkillProfileReferences(
  references: readonly SkillProfileReference[] | undefined,
  errors: string[],
): void {
  if (references === undefined) return;
  if (!Array.isArray(references)) {
    errors.push('Field "profileReferences" must be an array');
    return;
  }

  const seen = new Set<string>();
  references.forEach((reference, index) => {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      errors.push(`profileReferences[${index}] must be an object`);
      return;
    }
    if (typeof reference.profileId !== 'string' || reference.profileId.trim().length === 0) {
      errors.push(`profileReferences[${index}].profileId must be a non-empty string`);
    }
    if (!isAgentProfileKind(reference.kind)) {
      errors.push(`profileReferences[${index}].kind must be a supported Agent profile kind`);
    }
    if (!isAgentProfileRelationship(reference.relationship)) {
      errors.push(
        `profileReferences[${index}].relationship must be "consumes", "produces", "requires", or "prefers"`,
      );
    }
    if (
      reference.versionRange !== undefined &&
      (typeof reference.versionRange !== 'string' || reference.versionRange.trim().length === 0)
    ) {
      errors.push(`profileReferences[${index}].versionRange must be a non-empty string`);
    }

    const key = toSkillProfileReferenceKey(reference);
    if (seen.has(key)) {
      errors.push(`Duplicate profileReferences entry for "${reference.profileId}"`);
    } else {
      seen.add(key);
    }
  });
}

function toSkillProfileReferenceKey(reference: SkillProfileReference): string {
  return [
    reference.kind,
    reference.relationship,
    reference.profileId,
    reference.versionRange ?? '',
  ].join('\u0000');
}

function validateSkillCatalogManifest(
  catalog: SkillCatalogManifest | undefined,
  errors: string[],
): void {
  if (catalog === undefined) return;
  if (typeof catalog !== 'object' || Array.isArray(catalog)) {
    errors.push('Field "catalog" must be an object');
    return;
  }

  for (const key of Object.keys(catalog)) {
    if (isForbiddenCatalogDslField(key)) {
      errors.push(
        `catalog.${key} is not allowed; workflow order belongs in SKILL.md prompt-chain text`,
      );
    }
  }

  if (catalog.role !== undefined && !isSkillCatalogRole(catalog.role)) {
    errors.push(
      `catalog.role must be one of: ${SKILL_CATALOG_ROLES.map((role) => `"${role}"`).join(', ')}`,
    );
  }

  if (
    catalog.visibility !== undefined &&
    !SKILL_CATALOG_VISIBILITIES.includes(catalog.visibility)
  ) {
    errors.push(
      `catalog.visibility must be one of: ${SKILL_CATALOG_VISIBILITIES.map((visibility) => `"${visibility}"`).join(', ')}`,
    );
  }

  if (catalog.groupId !== undefined && !isNonEmptyString(catalog.groupId)) {
    errors.push('catalog.groupId must be a non-empty string');
  }

  validateStringArrayField(catalog.parentSkillIds, 'catalog.parentSkillIds', errors);

  if (catalog.editable !== undefined && typeof catalog.editable !== 'boolean') {
    errors.push('catalog.editable must be a boolean');
  }

  if (catalog.actions !== undefined) {
    if (!Array.isArray(catalog.actions)) {
      errors.push('catalog.actions must be an array');
    } else {
      for (let idx = 0; idx < catalog.actions.length; idx++) {
        validateSkillCatalogActionInput(catalog.actions[idx], `catalog.actions[${idx}]`, errors);
      }
    }
  }
}

function validateSkillCatalogActionInput(
  action: SkillCatalogActionInput,
  fieldName: string,
  errors: string[],
): void {
  if (typeof action === 'string') {
    if (!isSkillCatalogActionId(action)) {
      errors.push(`${fieldName} must be a supported catalog action id`);
    }
    return;
  }

  if (typeof action !== 'object' || action === null || Array.isArray(action)) {
    errors.push(`${fieldName} must be an action id or action object`);
    return;
  }

  if (!isSkillCatalogActionId(action.id)) {
    errors.push(`${fieldName}.id must be a supported catalog action id`);
  }
  if (action.label !== undefined && typeof action.label !== 'string') {
    errors.push(`${fieldName}.label must be a string`);
  }
  if (action.targetSource !== undefined && !isEditableSkillCatalogSource(action.targetSource)) {
    errors.push(`${fieldName}.targetSource must be "project" or "personal"`);
  }
}

function validateSkillMediaWorkflowHint(
  hint: SkillMediaWorkflowHint | undefined,
  errors: string[],
): void {
  if (hint === undefined) return;
  if (typeof hint !== 'object' || Array.isArray(hint)) {
    errors.push('Field "mediaWorkflow" must be an object');
    return;
  }

  for (const key of Object.keys(hint)) {
    if (isForbiddenMediaWorkflowDslField(key)) {
      errors.push(
        `mediaWorkflow.${key} is not allowed; workflow order belongs in SKILL.md prompt-chain text`,
      );
    }
  }

  validateStringArrayField(hint.acceptedModalities, 'mediaWorkflow.acceptedModalities', errors);
  validateStringArrayField(hint.useCases, 'mediaWorkflow.useCases', errors);
  validateStringArrayField(hint.nonGoals, 'mediaWorkflow.nonGoals', errors);
  validateStringArrayField(hint.producedArtifacts, 'mediaWorkflow.producedArtifacts', errors);
  validateStringArrayField(hint.artifactProfiles, 'mediaWorkflow.artifactProfiles', errors);
  validateStringArrayField(hint.inputArtifacts, 'mediaWorkflow.inputArtifacts', errors);
  validateStringArrayField(
    hint.referencedCapabilities,
    'mediaWorkflow.referencedCapabilities',
    errors,
  );
  validateStringArrayField(hint.suggestedProjectors, 'mediaWorkflow.suggestedProjectors', errors);
  validateStringArrayField(hint.tags, 'mediaWorkflow.tags', errors);
  validateStringArrayField(hint.operations, 'mediaWorkflow.operations', errors);
  validateStringArrayField(
    hint.validationRequirements,
    'mediaWorkflow.validationRequirements',
    errors,
  );
  validateStringArrayField(hint.optionalTools, 'mediaWorkflow.optionalTools', errors);

  if (
    hint.costLevel !== undefined &&
    hint.costLevel !== 'free' &&
    hint.costLevel !== 'low' &&
    hint.costLevel !== 'medium' &&
    hint.costLevel !== 'high'
  ) {
    errors.push('mediaWorkflow.costLevel must be "free", "low", "medium", or "high"');
  }

  if (
    hint.riskLevel !== undefined &&
    hint.riskLevel !== 'low' &&
    hint.riskLevel !== 'medium' &&
    hint.riskLevel !== 'high' &&
    hint.riskLevel !== 'destructive'
  ) {
    errors.push('mediaWorkflow.riskLevel must be "low", "medium", "high", or "destructive"');
  }
}

function validateStringArrayField(
  value: readonly string[] | undefined,
  fieldName: string,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array of strings`);
    return;
  }
  for (let idx = 0; idx < value.length; idx++) {
    if (typeof value[idx] !== 'string' || value[idx].trim().length === 0) {
      errors.push(`${fieldName}[${idx}] must be a non-empty string`);
    }
  }
}

function isForbiddenMediaWorkflowDslField(fieldName: string): boolean {
  return MEDIA_WORKFLOW_DSL_FIELD_NAMES.some(
    (dslField) => dslField.toLowerCase() === fieldName.toLowerCase(),
  );
}

function isForbiddenCatalogDslField(fieldName: string): boolean {
  return MEDIA_WORKFLOW_DSL_FIELD_NAMES.some(
    (dslField) => dslField.toLowerCase() === fieldName.toLowerCase(),
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validate a slash command
 */
export function validateCommand(command: Partial<SlashCommand>): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!command.command) {
    errors.push('Missing required field: command');
  } else {
    if (!/^[a-z0-9-]+$/.test(command.command)) {
      errors.push('Command must contain only lowercase letters, numbers, and hyphens');
    }
  }

  if (!command.description) {
    errors.push('Missing required field: description');
  }

  if (!command.content) {
    errors.push('Missing required field: content');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Create the runtime Skill projection from parsed content and Host-owned source facts.
 * Canonical parsing/validation happens before this compatibility constructor and does
 * not read a root `manifest.json`.
 *
 * @param frontmatter Parsed portable or compatibility frontmatter projection
 * @param content SKILL.md body content
 * @param source Skill source (builtin, personal, project)
 * @param directoryPath Skill directory path
 * @param supportFileRefs Referenced support file paths (progressive disclosure)
 * @param toolDefinitions Tool definitions supplied by the owning runtime adapter
 */
export function createSkill(
  frontmatter: SkillFrontmatter,
  content: string,
  source: SkillSource,
  directoryPath?: string,
  supportFileRefs?: string[],
  toolDefinitions?: SkillToolDefinition[],
): Skill {
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    content,
    supportFileRefs,
    allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
    toolsRef: frontmatter['tools-ref'],
    toolDefinitions,
    paths: frontmatter.paths,
    model: frontmatter.model,
    icon: frontmatter.icon,
    source,
    directoryPath,
    enabled: frontmatter.enabled ?? true,
    catalog: toSkillCatalogMeta(
      {
        name: frontmatter.name,
        description: frontmatter.description,
        icon: frontmatter.icon,
        source,
      },
      { source },
    ),
  };
}

/**
 * Create a SlashCommand from parsed frontmatter
 */
export function createCommand(
  frontmatter: CommandFrontmatter,
  content: string,
  source: SkillSource,
  filePath?: string,
): SlashCommand {
  return {
    command: frontmatter.command,
    description: frontmatter.description,
    content,
    argumentHint: frontmatter['argument-hint'],
    allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
    model: frontmatter.model,
    icon: frontmatter.icon,
    source,
    filePath,
    enabled: frontmatter.enabled ?? true,
  };
}

/**
 * Extract support file references from markdown content
 * Matches: [Title](file.md) where file.md is a relative path
 */
export function extractSupportFileRefs(content: string): string[] {
  const refs: string[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const path = match[2];
    if (path && !/^https?:\/\//i.test(path)) {
      refs.push(path);
    }
  }

  const seen: Record<string, boolean> = {};
  const unique: string[] = [];
  for (const r of refs) {
    if (!seen[r]) {
      seen[r] = true;
      unique.push(r);
    }
  }
  return unique;
}

// =============================================================================
// Tool Definition Conversion
// =============================================================================

/**
 * OpenAI-compatible function parameter schema
 */
export interface OpenAIFunctionParameter {
  type: string;
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

/**
 * OpenAI-compatible function definition
 */
export interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, OpenAIFunctionParameter>;
      required: string[];
    };
  };
}

/**
 * Convert SkillToolDefinition to OpenAI-compatible function format
 */
export function skillToolToOpenAI(tool: SkillToolDefinition): OpenAIFunction {
  const properties: Record<string, OpenAIFunctionParameter> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(tool.parameters)) {
    const prop: OpenAIFunctionParameter = {
      type: param.type,
    };

    if (param.description) {
      prop.description = param.description;
    }
    if (param.enum) {
      prop.enum = param.enum;
    }
    if (param.min !== undefined) {
      prop.minimum = param.min;
    }
    if (param.max !== undefined) {
      prop.maximum = param.max;
    }
    if (param.default !== undefined) {
      prop.default = param.default;
    }

    properties[name] = prop;

    if (param.required) {
      required.push(name);
    }
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

/**
 * Convert multiple SkillToolDefinitions to OpenAI-compatible format
 */
export function skillToolsToOpenAI(tools: SkillToolDefinition[]): OpenAIFunction[] {
  return tools.map(skillToolToOpenAI);
}
