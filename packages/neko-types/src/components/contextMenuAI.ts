/**
 * contextMenuAI — Unified AI menu section builder for all webviews.
 *
 * Provides a consistent "AI section" appended to any context menu,
 * with two zones:
 *   1. Quick Actions — direct generation, no Agent involvement
 *   2. Agent Actions — submenu under "Send to Agent" entry
 *
 * Each package declares its own capabilities; the shell handles
 * separators, submenu structure, and fallback to flat entry.
 *
 * Usage:
 *   import { buildAIMenuSection } from '@neko/shared/components';
 *   const items = [...existingMenuItems, ...buildAIMenuSection(config)];
 */

import type { MenuItem } from './ContextMenu';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single AI action capability declared by a package. */
export interface AICapability {
  /** Unique action identifier (e.g. 'generate-image', 'ai-subtitles') */
  id: string;
  /** Display label — must be pre-translated by the caller */
  label: string;
  /** Icon (emoji string or any ReactNode accepted by MenuAction.icon) */
  icon?: string;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Whether this action is currently disabled */
  disabled?: boolean;
  /** Click handler */
  onClick: () => void;
}

/**
 * Configuration for the AI menu section.
 *
 * Both `quickActions` and `agentActions` are optional.
 * If neither is provided, `buildAIMenuSection` returns an empty array.
 */
export interface AIMenuConfig {
  /**
   * Quick-execute actions (no Agent panel involvement).
   * Rendered as flat menu items above the Agent entry.
   * Examples: "Generate Image", "Batch Generate", "AI Subtitles"
   */
  quickActions?: AICapability[];

  /**
   * Actions shown in the "Send to Agent" submenu.
   * Examples: "Optimize Description", "Adjust Camera", "Understand Content"
   */
  agentActions?: AICapability[];

  /**
   * Fallback "Send to Agent" callback when no agentActions submenu is needed.
   * Used as a flat menu entry if agentActions is empty/undefined.
   */
  onSendToAgent?: () => void;

  /**
   * Custom label for the "Send to Agent" entry.
   * @default '发送到 Agent'
   */
  sendToAgentLabel?: string;
}

// ── Builder ──────────────────────────────────────────────────────────────────

const DEFAULT_AGENT_LABEL = '发送到 Agent';
const AGENT_ICON = '🤖';

/**
 * Build a standardised AI menu section to append to any context menu.
 *
 * Output structure:
 * ```
 * ────────────────
 * ✨ Quick Action 1          ← quickActions (flat)
 * ⚡ Quick Action 2
 * ────────────────
 * 🤖 发送到 Agent ▶          ← agentActions (submenu)
 *    Optimize Description
 *    Adjust Camera
 *    Understand Content
 * ```
 *
 * - If no agentActions: renders a flat "🤖 发送到 Agent" entry (calls onSendToAgent)
 * - If no quickActions: separator + agent section only
 * - If nothing provided: returns `[]`
 */
export function buildAIMenuSection(config: AIMenuConfig): MenuItem[] {
  const { quickActions, agentActions, onSendToAgent, sendToAgentLabel } = config;
  const items: MenuItem[] = [];

  const hasQuick = quickActions != null && quickActions.length > 0;
  const hasAgentSubmenu = agentActions != null && agentActions.length > 0;
  const hasAgent = hasAgentSubmenu || onSendToAgent != null;

  if (!hasQuick && !hasAgent) return items;

  // ── Separator before AI section ──
  items.push({ separator: true });

  // ── Quick actions (flat list) ──
  if (hasQuick) {
    for (const action of quickActions) {
      items.push({
        label: action.label,
        icon: action.icon,
        shortcut: action.shortcut,
        disabled: action.disabled,
        onClick: action.onClick,
      });
    }
  }

  // ── Agent entry ──
  if (hasAgent) {
    // Separate quick actions from agent entry
    if (hasQuick) {
      items.push({ separator: true });
    }

    const label = sendToAgentLabel ?? DEFAULT_AGENT_LABEL;

    if (hasAgentSubmenu) {
      // Submenu with specific agent intents
      items.push({
        label,
        icon: AGENT_ICON,
        onClick: () => {
          /* noop — submenu host */
        },
        submenu: agentActions.map((a) => ({
          label: a.label,
          icon: a.icon,
          disabled: a.disabled,
          onClick: a.onClick,
        })),
      });
    } else if (onSendToAgent) {
      // Flat entry — generic "send context to agent"
      items.push({
        label,
        icon: AGENT_ICON,
        onClick: onSendToAgent,
      });
    }
  }

  return items;
}
