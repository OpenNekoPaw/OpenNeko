/**
 * Loading tier for resource lifecycle management.
 *
 * All tiers: name + description always resident in registries
 * (required for AI discovery via GetContext/ActivateSkill).
 *
 * - resident: Schema always in LLM context, execute() immediately available.
 * - eager:    Metadata resident, schema injected on first ToolSet use in session.
 * - lazy:     Metadata resident, schema injected only on explicit activation.
 */
export type LoadingTier = 'resident' | 'eager' | 'lazy';
