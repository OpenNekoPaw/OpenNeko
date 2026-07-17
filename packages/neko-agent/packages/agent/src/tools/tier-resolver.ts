/**
 * Tier Resolver - Pure functions to resolve effective loading tier
 *
 * Loading tier determines when tool schemas / skill content are injected
 * into LLM context. Metadata (name/description) is always resident.
 *
 * Resolution priority:
 * 1. Explicit loadingTier field (if set)
 * 2. Inferred from existing metadata (alwaysActive, priority, source)
 */

import type { LoadingTier, ToolGroup } from '@neko/shared';

/**
 * Resolve effective tier for a ToolGroup.
 *
 * Fallback when loadingTier is not set:
 * - !alwaysActive → 'lazy'
 * - alwaysActive && priority >= 100 → 'resident'
 * - alwaysActive && priority < 100 → 'eager'
 */
export function resolveToolGroupTier(group: ToolGroup): LoadingTier {
  if (group.loadingTier) return group.loadingTier;
  if (!group.alwaysActive) return 'lazy';
  if (group.priority !== undefined && group.priority >= 100) return 'resident';
  return 'eager';
}

/**
 * Resolve tier for a Skill based on its source.
 *
 * - builtin / project → eager (frontmatter resident, content on activation)
 * - personal / market → lazy (frontmatter resident, content on explicit activation)
 */
