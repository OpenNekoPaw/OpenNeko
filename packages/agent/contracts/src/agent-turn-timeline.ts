import type { CompositeBlockData, ToolCall, ToolCallProgress } from './message';

export const AGENT_TURN_TIMELINE_ITEM_KINDS = [
  'assistant_text',
  'thinking',
  'tool_call',
  'composite',
  'error',
] as const;

export type AgentTurnTimelineItemKind = (typeof AGENT_TURN_TIMELINE_ITEM_KINDS)[number];

export const AGENT_TURN_TIMELINE_ITEM_STATUSES = [
  'streaming',
  'pending',
  'succeeded',
  'failed',
  'complete',
] as const;

export type AgentTurnTimelineItemStatus = (typeof AGENT_TURN_TIMELINE_ITEM_STATUSES)[number];

export const AGENT_TURN_TIMELINE_PARENT_ANCHORS = ['none', 'item', 'tool_call', 'turn'] as const;

export type AgentTurnTimelineParentAnchorKind = (typeof AGENT_TURN_TIMELINE_PARENT_ANCHORS)[number];

export type AgentTurnTimelineParentAnchor =
  | {
      readonly parentAnchor?: 'none';
      readonly parentItemId?: undefined;
      readonly parentToolCallId?: undefined;
    }
  | {
      readonly parentAnchor: 'item';
      readonly parentItemId: string;
      readonly parentToolCallId?: string;
    }
  | {
      readonly parentAnchor: 'tool_call';
      readonly parentToolCallId: string;
      readonly parentItemId?: string;
    }
  | {
      readonly parentAnchor: 'turn';
      readonly parentItemId?: undefined;
      readonly parentToolCallId?: undefined;
    };

export interface AgentTurnTimelineItemCore {
  readonly conversationId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly messageId: string;
  readonly itemId: string;
  readonly sequence: number;
  readonly status: AgentTurnTimelineItemStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AgentTurnTimelineAssistantTextPayload {
  readonly content: string;
  readonly format?: 'markdown' | 'plain';
  readonly sourceBlockId?: string;
}

export interface AgentTurnTimelineThinkingPayload {
  readonly content: string;
  readonly sourceBlockId?: string;
}

export interface AgentTurnTimelineToolCallPayload {
  readonly toolCall: ToolCall;
  readonly displayName?: string;
  readonly progress?: ToolCallProgress;
}

export interface AgentTurnTimelineCompositePayload {
  readonly composite: CompositeBlockData;
  readonly sourceBlockId?: string;
  readonly rawText?: string;
}

export interface AgentTurnTimelineErrorPayload {
  readonly message?: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
}

export type AgentTurnTimelineItemBase<
  Kind extends AgentTurnTimelineItemKind,
  Payload,
> = AgentTurnTimelineItemCore &
  AgentTurnTimelineParentAnchor & {
    readonly kind: Kind;
    readonly payload: Payload;
  };

export type AgentTurnTimelineAssistantTextItem = AgentTurnTimelineItemBase<
  'assistant_text',
  AgentTurnTimelineAssistantTextPayload
>;
export type AgentTurnTimelineThinkingItem = AgentTurnTimelineItemBase<
  'thinking',
  AgentTurnTimelineThinkingPayload
>;
export type AgentTurnTimelineToolCallItem = AgentTurnTimelineItemBase<
  'tool_call',
  AgentTurnTimelineToolCallPayload
>;
export type AgentTurnTimelineCompositeItem = AgentTurnTimelineItemBase<
  'composite',
  AgentTurnTimelineCompositePayload
>;
export type AgentTurnTimelineErrorItem = AgentTurnTimelineItemBase<
  'error',
  AgentTurnTimelineErrorPayload
>;

export type AgentTurnTimelineTextItem =
  AgentTurnTimelineAssistantTextItem | AgentTurnTimelineThinkingItem;
export type AgentTurnTimelineStructuralItem = Exclude<
  AgentTurnTimelineItem,
  AgentTurnTimelineTextItem
>;
export type AgentTurnTimelineItem =
  | AgentTurnTimelineAssistantTextItem
  | AgentTurnTimelineThinkingItem
  | AgentTurnTimelineToolCallItem
  | AgentTurnTimelineCompositeItem
  | AgentTurnTimelineErrorItem;

export interface AgentTurnTimelineAppendOperation {
  readonly operation: 'append';
  /** Text payload content is the delta only, never accumulated source. */
  readonly item: AgentTurnTimelineTextItem;
}

export interface AgentTurnTimelineReplaceOperation {
  readonly operation: 'replace';
  /** Text payload content is the complete replacement source. */
  readonly item: AgentTurnTimelineTextItem;
}

export interface AgentTurnTimelineSnapshotOperation {
  readonly operation: 'snapshot';
  /** Item payload is the authoritative current value. */
  readonly item: AgentTurnTimelineItem;
}

export interface AgentTurnTimelineUpsertOperation {
  readonly operation: 'upsert';
  readonly item: AgentTurnTimelineStructuralItem;
}

export interface AgentTurnTimelineCompleteOperation {
  readonly operation: 'complete';
  readonly itemId: string;
  readonly kind: AgentTurnTimelineTextItem['kind'];
  readonly status: 'complete' | 'failed';
  readonly updatedAt: number;
}

export type AgentTurnTimelineOperation =
  | AgentTurnTimelineAppendOperation
  | AgentTurnTimelineReplaceOperation
  | AgentTurnTimelineSnapshotOperation
  | AgentTurnTimelineUpsertOperation
  | AgentTurnTimelineCompleteOperation;

export type AgentTurnTimelineCompletionStatus = 'completed' | 'cancelled' | 'failed';

export interface AgentTurnTimelineCompletion {
  readonly status: AgentTurnTimelineCompletionStatus;
  readonly completedAt: number;
}
