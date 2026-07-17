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
  const projectedMessageIds = new Set(input.projection?.turns.map((turn) => turn.messageId) ?? []);
  const baseMessages = input.messages.filter(
    (message) =>
      projectedMessageIds.has(message.id) ||
      !requiresTimelineStreamingOwner(message, input.streamingMessageId),
  );
  const withheldActiveMessage = baseMessages.length !== input.messages.length;
  if (!input.projection) {
    return {
      messages: baseMessages,
      workItems: input.workItems,
      isThinking: input.isThinking || withheldActiveMessage,
      streamingMessageId: null,
    };
  }
  if (input.projection.turns.length === 0) {
    return {
      messages: baseMessages,
      workItems: input.workItems,
      isThinking: input.isThinking || withheldActiveMessage,
      streamingMessageId: null,
    };
  }

  let messages = [...baseMessages];
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
    isThinking: streamingMessageId !== null || withheldActiveMessage,
    streamingMessageId,
  };
}

function requiresTimelineStreamingOwner(
  message: Message,
  streamingMessageId: string | null,
): boolean {
  if (message.id === streamingMessageId || message.isStreaming === true) return true;
  return (
    message.contentBlocks?.some(
      (block) =>
        (block.type === 'text' && block.isStreaming === true) ||
        (block.type === 'thinking' && block.isThinkingComplete !== true),
    ) === true
  );
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
