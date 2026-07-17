import type { MutableRefObject } from 'react';
import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';
import type {
  ConversationRenderSnapshot,
  ConversationStreamingSnapshot,
} from './conversation-render-contract';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';

export interface ConversationRenderStreamingState {
  readonly streamingMessageId: string | null;
  readonly isThinking: boolean;
  readonly queuedMessageCount?: number;
  readonly queuedMessages?: readonly AgentQueuedMessageItem[];
  readonly messageQueueVersion?: number;
}

export type ConversationRenderStateUpdater<
  TStreaming extends ConversationRenderStreamingState = ConversationRenderStreamingState,
> = (messages: Message[], streaming: TStreaming) => { messages: Message[]; streaming: TStreaming };

export function ingestConversationRenderSnapshot(input: {
  readonly coordinator: ConversationRenderCoordinator;
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: ConversationRenderStreamingState;
}): ConversationRenderSnapshot {
  const baseRevision = input.coordinator.read(input.conversationId)?.revision ?? 0;
  return input.coordinator.ingest({
    kind: 'host-snapshot',
    conversationId: input.conversationId,
    baseRevision,
    messages: input.messages,
    streaming: toConversationStreamingSnapshot(input.streaming),
  });
}

export function commitConversationSnapshotProjection(input: {
  readonly snapshot: ConversationRenderSnapshot;
  readonly conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  readonly conversationStreamingRef: MutableRefObject<
    Map<string, ConversationRenderStreamingState>
  >;
}): void {
  input.conversationMessagesRef.current.set(input.snapshot.conversationId, [
    ...input.snapshot.messages,
  ]);
  input.conversationStreamingRef.current.set(
    input.snapshot.conversationId,
    toConversationRenderStreamingState(input.snapshot.streaming),
  );
}

export function discardConversationSnapshotProjection(input: {
  readonly conversationId: string;
  readonly conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  readonly conversationStreamingRef: MutableRefObject<
    Map<string, ConversationRenderStreamingState>
  >;
}): void {
  input.conversationMessagesRef.current.delete(input.conversationId);
  input.conversationStreamingRef.current.delete(input.conversationId);
}

function toConversationStreamingSnapshot(
  streaming: ConversationRenderStreamingState,
): ConversationStreamingSnapshot {
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount ?? 0,
    queuedMessages: streaming.queuedMessages ?? [],
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
  };
}

function toConversationRenderStreamingState(
  streaming: ConversationStreamingSnapshot,
): ConversationRenderStreamingState {
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount,
    queuedMessages: streaming.queuedMessages,
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
  };
}
