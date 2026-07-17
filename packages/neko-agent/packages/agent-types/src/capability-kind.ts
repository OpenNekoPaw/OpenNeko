/**
 * CapabilityKind — ADR §5.1 / §5.3 flat capability pool discriminant.
 *
 * The ADR models L1 capabilities as three kinds:
 *
 *   - `'skill'`     scene package with a persona + orchestration guidance
 *   - `'tool'`      single atomic invocation (non-authoritative)
 *   - `'operation'` single atomic invocation that mutates authoritative
 *                   state (project data, external resource)
 *
 * In the codebase Tool and Operation share the same `Tool` interface —
 * they differ only by the `isDestructive` trait:
 *
 *   isDestructive = true  → kind 'operation'
 *   isDestructive = false → kind 'tool'
 *
 * Keeping one interface is intentional: the ApprovalEngine + autoheal
 * chain already route on `isDestructive`, and splitting the TS type
 * would force parallel registries for no runtime gain. What ADR labels
 * "Operation" is a **policy bucket** over Tools, not a separate class.
 *
 * This module supplies the discriminant union and minimal structural
 * shapes. Runtime classifiers belong in the agent layer that owns the
 * capability registry.
 *
 * Capability kinds do not merge registries; Pi owns Tool execution and Skill discovery.
 * separate because their lookup paths differ (tools by name / category,
 * skills by description match / command). The ADR's "flat pool" is a
 * conceptual frame for how the Agent sees capabilities at composition
 * time, not a data-structure mandate.
 */

export type CapabilityKind = 'skill' | 'tool' | 'operation';

// =============================================================================
// Structural shapes the helper recognises
// =============================================================================

/** Minimum shape needed to classify something as a Skill. */
export interface CapabilityKindSkillLike {
  name: string;
  content: string;
}

/** Minimum shape needed to classify something as a Tool or Operation. */
export interface CapabilityKindToolLike {
  name: string;
  parameters: unknown;
  execute: (...args: readonly unknown[]) => unknown;
  isDestructive?: boolean;
}

export type CapabilityKindInput = CapabilityKindSkillLike | CapabilityKindToolLike;
