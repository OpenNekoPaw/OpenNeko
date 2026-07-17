// =============================================================================
// Agent Context Types — unified context payload for sendToAgent protocol
// =============================================================================

import type { ResolvedGenerationParams } from './generation.js';

/**
 * Source type for agent context attachments.
 * Used to determine how the agent should interpret the payload.
 */
export type AgentContextType =
  | 'canvas-node'
  | 'cut-clip'
  | 'story-selection'
  | 'character'
  | 'scene'
  | 'asset'
  | 'media'
  | 'entity'
  | 'sketch-layer'
  | 'model-scene'
  | 'audio-clip'
  | 'file'
  | 'image'
  | 'document-selection'
  | 'canvas-storyboard-action-intent';

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
  /**
   * Generation params associated with this context.
   * Agents should persist these to node/project config before generating.
   */
  generationParams?: Partial<ResolvedGenerationParams>;
}

/**
 * Message sent from any webview/extension to the agent panel webview
 * to attach a context payload.
 */
export interface SendToAgentMessage {
  type: 'sendToAgent';
  payload: AgentContextPayload;
}

/**
 * Ambient canvas context injected into the agent system prompt
 * whenever canvas nodes are selected.
 */
export interface CanvasAmbientContext {
  /** Currently selected canvas node summaries (max 5) */
  selectedNodes: Array<{
    nodeId: string;
    type: string;
    summary: string;
  }>;
}
