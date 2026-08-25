// =============================================================================
// Agent Context Types — unified context payload for sendToAgent protocol
// =============================================================================

/**
 * Source type for agent context attachments.
 * Used to determine how the agent should interpret the payload.
 */
export const AGENT_CONTEXT_TYPES = [
  'canvas-node',
  'cut-clip',
  'story-selection',
  'character',
  'scene',
  'asset',
  'media',
  'entity',
  'sketch-layer',
  '3d-reference',
  'audio-clip',
  'file',
  'image',
  'document-selection',
  'canvas-storyboard-action-intent',
] as const;

export type AgentContextType = (typeof AGENT_CONTEXT_TYPES)[number];

const AGENT_CONTEXT_TYPE_SET: ReadonlySet<string> = new Set(AGENT_CONTEXT_TYPES);

export function isAgentContextType(value: unknown): value is AgentContextType {
  return typeof value === 'string' && AGENT_CONTEXT_TYPE_SET.has(value);
}

/**
 * Unified context payload sent from any sub-package to the agent panel.
 *
 * Sent via:
 *   1. Right-click menu "→ Agent" action (one-time attachment)
 *   2. Canvas selection change (ambient context, auto-updated)
 *   3. Story editor selection (ambient context)
 */
export interface AgentContextPayload {
  /** Payload type — drives agent interpretation and UI chip icon */
  type: AgentContextType;
  /** Unique identifier for this context item (nodeId, clipId, etc.) */
  id: string;
  /** Human-readable label shown in the chip, e.g. "#3 镜头" */
  label: string;
  /** One-line summary injected into agent system prompt */
  summary: string;
  /** Full structured data (node data, clip metadata, text selection, etc.) */
  data: unknown;
  /** Optional user intent hint pre-filled into the input box */
  intent?: string;
}
