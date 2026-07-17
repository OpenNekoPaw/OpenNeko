import type {
  AgentWorkItem,
  ConversationProjectionSnapshot,
  ConversationTurnProjection,
  Message,
} from '@neko-agent/types';
import {
  projectTimelineItemsToWorkItems,
  projectTimelineTurnToMessage,
} from './timeline-projection-presenter';

export interface ConversationProjectionRenderInput {
  readonly messages: readonly Message[];
  readonly workItems: readonly AgentWorkItem[];
  readonly isThinking: boolean;
  readonly streamingMessageId: string | null;
  readonly projection: ConversationProjectionSnapshot | null;
}

export interface ConversationProjectionRenderState {
  readonly messages: readonly Message[];
  readonly workItems: readonly AgentWorkItem[];
  readonly isThinking: boolean;
  readonly streamingMessageId: string | null;
}

export function projectConversationProjectionRenderState(
  input: ConversationProjectionRenderInput,
): ConversationProjectionRenderState {
  if (!input.projection) {
    return {
      messages: input.messages,
      workItems: input.workItems,
      isThinking: input.isThinking,
      streamingMessageId: input.streamingMessageId,
    };
  }
  if (input.projection.turns.length === 0) {
    return {
      messages: input.messages,
      workItems: input.workItems,
      isThinking: false,
      streamingMessageId: null,
    };
  }

  let messages = [...input.messages];
  const projectedWorkItems: AgentWorkItem[] = [];
  let streamingMessageId: string | null = null;
  for (const turn of input.projection.turns) {
    messages = mergeProjectedMessage(messages, projectTurnMessage(turn));
    projectedWorkItems.push(...projectTurnWorkItems(turn));
    if (!turn.completion) streamingMessageId = turn.messageId;
  }

  return {
    messages,
    workItems: mergeProjectedWorkItems(input.workItems, projectedWorkItems),
    isThinking: streamingMessageId !== null,
    streamingMessageId,
  };
}

function projectTurnMessage(turn: ConversationTurnProjection): Message {
  return projectTimelineTurnToMessage({
    messageId: turn.messageId,
    items: turn.items,
    completed: turn.completion !== undefined,
    ...(turn.completion?.finalContentBlocks
      ? { finalContentBlocks: turn.completion.finalContentBlocks }
      : {}),
  });
}

function projectTurnWorkItems(turn: ConversationTurnProjection): AgentWorkItem[] {
  return projectTimelineItemsToWorkItems(turn.items);
}

function mergeProjectedMessage(messages: readonly Message[], projection: Message): Message[] {
  const targetIndex = messages.findIndex((message) => message.id === projection.id);
  if (targetIndex === -1) return insertProjectedMessage(messages, projection);
  return messages.map((message, index) =>
    index === targetIndex
      ? {
          ...message,
          content: projection.content,
          isStreaming: projection.isStreaming,
          contentBlocks: projection.contentBlocks,
          workItemIds: mergeIds(message.workItemIds, projection.workItemIds),
        }
      : message,
  );
}

function insertProjectedMessage(messages: readonly Message[], projection: Message): Message[] {
  const insertionIndex = messages.findIndex((message) => message.timestamp > projection.timestamp);
  if (insertionIndex === -1) return [...messages, projection];
  return [...messages.slice(0, insertionIndex), projection, ...messages.slice(insertionIndex)];
}

function mergeProjectedWorkItems(
  current: readonly AgentWorkItem[],
  projected: readonly AgentWorkItem[],
): AgentWorkItem[] {
  const projectedById = new Map(projected.map((item) => [item.id, item]));
  const merged = current.map((item) => projectedById.get(item.id) ?? item);
  const currentIds = new Set(current.map((item) => item.id));
  for (const item of projected) {
    if (!currentIds.has(item.id)) merged.push(item);
  }
  return merged;
}

function mergeIds(
  current: readonly string[] | undefined,
  projected: readonly string[] | undefined,
): string[] | undefined {
  const ids = Array.from(new Set([...(current ?? []), ...(projected ?? [])]));
  return ids.length > 0 ? ids : undefined;
}
