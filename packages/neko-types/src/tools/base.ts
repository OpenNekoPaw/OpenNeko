/**
 * Base Tool Class - Foundation for all tool implementations
 *
 * This base class provides common functionality for implementing tools:
 * - Argument validation
 * - Result helpers
 * - Standard interface implementation
 */

import type { CreativeDomainMetadata } from '../types/domain-routing';
import type {
  Tool,
  ToolCategory,
  ToolExecuteOptions,
  ToolLocalization,
  ToolParameters,
  ToolQueryBeforeMutateGuidance,
  ToolResult,
  ToolRuntimeRequirements,
  ToolSafetyKind,
  ToolTargetRequirements,
  ToolTraits,
} from '../types/tool';

// =============================================================================
// Safety Presets
// =============================================================================

/**
 * Safety preset for common tool archetypes.
 *
 * - readOnly:    Stateless query tools (concurrent-safe, read-only, non-destructive)
 * - safeWrite:   Reversible write tools (non-concurrent, non-destructive)
 * - destructive: Irreversible write tools (non-concurrent, requires confirmation)
 * - aiGenerate:  AI generation tools (concurrent-safe, non-destructive, may cost)
 * - custom:      No preset applied — use explicit flags (Fail-Closed defaults)
 */
export type ToolSafetyPreset = 'readOnly' | 'safeWrite' | 'destructive' | 'aiGenerate' | 'custom';

/** Safety flag bundle applied by presets */
interface SafetyFlags {
  isConcurrencySafe: boolean;
  isReadOnly: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
}

/** Predefined safety flag combinations per preset */
export const SAFETY_PRESETS: Record<Exclude<ToolSafetyPreset, 'custom'>, SafetyFlags> = {
  readOnly: {
    isConcurrencySafe: true,
    isReadOnly: true,
    isDestructive: false,
    requiresConfirmation: false,
  },
  safeWrite: {
    isConcurrencySafe: false,
    isReadOnly: false,
    isDestructive: false,
    requiresConfirmation: false,
  },
  destructive: {
    isConcurrencySafe: false,
    isReadOnly: false,
    isDestructive: true,
    requiresConfirmation: true,
  },
  aiGenerate: {
    isConcurrencySafe: true,
    isReadOnly: false,
    isDestructive: false,
    requiresConfirmation: false,
  },
};

/**
 * Base class for builtin tools
 *
 * Extend this class to create custom tools. Subclasses must implement:
 * - name: Unique tool identifier
 * - description: Description for LLM
 * - parameters: JSON Schema for arguments
 * - category: Tool category
 * - execute: Execution handler
 *
 * Concurrency & safety fields default to Fail-Closed (false).
 * Subclasses should override to true where appropriate.
 */
export abstract class BuiltinTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameters;
  abstract readonly category: ToolCategory;
  readonly requiresConfirmation: boolean = false;

  // Fail-Closed defaults: assume unsafe until explicitly declared otherwise
  readonly isConcurrencySafe: boolean = false;
  readonly isReadOnly: boolean = false;
  readonly isDestructive: boolean = false;

  abstract execute(
    args: Record<string, unknown>,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult>;

  /**
   * Validate arguments against parameters schema
   *
   * Performs basic validation:
   * - Checks required fields are present
   */
  protected validateArgs(args: Record<string, unknown>): { valid: boolean; error?: string } {
    const required = this.parameters.required ?? [];
    for (const field of required) {
      if (args[field] === undefined) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  /**
   * Create success result
   */
  protected success(data: unknown): ToolResult {
    return { success: true, data };
  }

  /**
   * Create error result
   */
  protected error(message: string): ToolResult {
    return { success: false, error: message };
  }
}

/**
 * Create a simple tool from a function
 */
export function createTool(config: {
  name: string;
  description: string;
  parameters: ToolParameters;
  category: ToolCategory;
  localization?: Readonly<Record<string, ToolLocalization>>;
  requiresConfirmation?: boolean;
  safetyKind?: ToolSafetyKind;
  targetRequirements?: ToolTargetRequirements;
  queryBeforeMutate?: ToolQueryBeforeMutateGuidance;
  requirements?: ToolRuntimeRequirements;
  traits?: ToolTraits;
  domain?: CreativeDomainMetadata;
  isConcurrencySafe?: boolean;
  isReadOnly?: boolean;
  isDestructive?: boolean;
  execute: (args: Record<string, unknown>, options?: ToolExecuteOptions) => Promise<ToolResult>;
}): Tool {
  return {
    name: config.name,
    description: config.description,
    ...(config.localization ? { localization: config.localization } : {}),
    parameters: config.parameters,
    category: config.category,
    requiresConfirmation: config.requiresConfirmation ?? false,
    ...(config.safetyKind ? { safetyKind: config.safetyKind } : {}),
    ...(config.targetRequirements ? { targetRequirements: config.targetRequirements } : {}),
    ...(config.queryBeforeMutate ? { queryBeforeMutate: config.queryBeforeMutate } : {}),
    ...(config.requirements ? { requirements: config.requirements } : {}),
    // Fail-Closed: default all safety flags to false
    isConcurrencySafe: config.isConcurrencySafe ?? false,
    isReadOnly: config.isReadOnly ?? false,
    isDestructive: config.isDestructive ?? false,
    ...(config.traits && { traits: config.traits }),
    ...(config.domain && { domain: config.domain }),
    execute: config.execute,
  };
}

// =============================================================================
// buildTool — Safety-preset-aware factory
// =============================================================================

/**
 * Configuration for buildTool().
 * Extends createTool config with an optional safety preset.
 * Explicit safety flags override the preset when both are provided.
 */
export interface BuildToolConfig {
  name: string;
  description: string;
  parameters: ToolParameters;
  category: ToolCategory;
  /** Optional localized model-facing descriptions keyed by locale. */
  localization?: Readonly<Record<string, ToolLocalization>>;
  /** Safety preset — applies predefined flag combination. Default: 'custom' (Fail-Closed). */
  safety?: ToolSafetyPreset;
  /** Override preset's requiresConfirmation */
  requiresConfirmation?: boolean;
  /** Override preset's isConcurrencySafe */
  isConcurrencySafe?: boolean;
  /** Override preset's isReadOnly */
  isReadOnly?: boolean;
  /** Override preset's isDestructive */
  isDestructive?: boolean;
  /** Declarative safety class for permission and planning policy. */
  safetyKind?: ToolSafetyKind;
  /** Target data needed before executing stateful mutation tools. */
  targetRequirements?: ToolTargetRequirements;
  /** Preferred structured query tools to run before this mutation. */
  queryBeforeMutate?: ToolQueryBeforeMutateGuidance;
  /** Runtime services or Host affordances required before the Tool is executable. */
  requirements?: ToolRuntimeRequirements;
  traits?: ToolTraits;
  domain?: CreativeDomainMetadata;
  execute: (args: Record<string, unknown>, options?: ToolExecuteOptions) => Promise<ToolResult>;
}

/**
 * Build a tool with safety preset support.
 *
 * Safety presets provide sensible defaults for common tool archetypes:
 * - `readOnly`: concurrent-safe, read-only, non-destructive
 * - `safeWrite`: non-concurrent, non-destructive
 * - `destructive`: non-concurrent, destructive, requires confirmation
 * - `aiGenerate`: concurrent-safe, non-destructive
 * - `custom` (default): Fail-Closed — all safety flags false
 *
 * Explicit flags always override the preset value.
 *
 * @example
 * ```ts
 * const readTool = buildTool({
 *   name: 'GetTimelineInfo',
 *   description: 'Query timeline metadata',
 *   parameters: { type: 'object', properties: {} },
 *   category: 'timeline',
 *   safety: 'readOnly',
 *   execute: async (args) => ({ success: true, data: {} }),
 * });
 * // readTool.isConcurrencySafe === true
 * // readTool.isReadOnly === true
 * ```
 */
export function buildTool(config: BuildToolConfig): Tool {
  const preset =
    config.safety && config.safety !== 'custom' ? SAFETY_PRESETS[config.safety] : undefined;

  return createTool({
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    category: config.category,
    localization: config.localization,
    traits: config.traits,
    domain: config.domain,
    safetyKind: config.safetyKind,
    targetRequirements: config.targetRequirements,
    queryBeforeMutate: config.queryBeforeMutate,
    requirements: config.requirements,
    execute: config.execute,
    // Preset provides base, explicit flags override
    requiresConfirmation: config.requiresConfirmation ?? preset?.requiresConfirmation,
    isConcurrencySafe: config.isConcurrencySafe ?? preset?.isConcurrencySafe,
    isReadOnly: config.isReadOnly ?? preset?.isReadOnly,
    isDestructive: config.isDestructive ?? preset?.isDestructive,
  });
}
