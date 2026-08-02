export type ToolSafetyKind =
  'read-only-query' | 'non-destructive-mutation' | 'destructive-mutation' | 'confirmation-gated';

export interface ToolTargetRequirements {
  /** Stable target fields the tool needs before execution, e.g. nodeId or containerId. */
  readonly required?: readonly string[];
  /** Structured fallback sources the runtime may use when explicit targets are absent. */
  readonly allowedFallbacks?: readonly (
    'selection' | 'viewport-insertion' | 'explicit-user-input'
  )[];
  /** Mutation modes that must be confirmed even when a target is supplied. */
  readonly confirmationModes?: readonly string[];
}

export interface ToolQueryBeforeMutateGuidance {
  /** Preferred read-only tools that can provide stable IDs and context for this mutation. */
  readonly preferredQueryTools: readonly string[];
  /** Human-readable planner hint for why preflight query data is required. */
  readonly reason?: string;
}

export interface ToolPlanningMetadata {
  /** Declarative safety class used by Agent planning and permission policy. */
  readonly safetyKind?: ToolSafetyKind;
  /** Target data needed before executing stateful mutation tools. */
  readonly targetRequirements?: ToolTargetRequirements;
  /** Query-before-mutate hints for planners and capability introspection. */
  readonly queryBeforeMutate?: ToolQueryBeforeMutateGuidance;
}
