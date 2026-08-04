import type { AgentQueuedMessageItem, Message } from '@neko/agent-contracts';
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
  readonly source: 'host' | 'local';
  readonly streaming: ConversationRenderStreamingState;
}): ConversationRenderSnapshot {
  const current = input.coordinator.read(input.conversationId);
  const messages =
    input.source === 'host'
      ? reconcilePendingUserMessages(current?.messages ?? [], input.messages)
      : input.messages;
  const baseRevision = current?.revision ?? 0;
  return input.coordinator.ingest({
    kind: 'host-snapshot',
    conversationId: input.conversationId,
    baseRevision,
    messages,
    streaming: toConversationStreamingSnapshot(input.streaming),
  });
}

function reconcilePendingUserMessages(
  currentMessages: readonly Message[],
  hostMessages: readonly Message[],
): readonly Message[] {
  const pendingMessages = currentMessages.filter(isPendingUserMessage);
  if (pendingMessages.length === 0) return hostMessages;

  const currentAuthoritativeCounts = countUserMessageContent(
    currentMessages.filter((message) => !isPendingUserMessage(message)),
  );
  const hostCounts = countUserMessageContent(hostMessages);
  const acknowledgedCounts = new Map<string, number>();
  const retainedPendingMessages = pendingMessages.filter((message) => {
    if (hostMessages.some((candidate) => candidate.id === message.id)) return false;
    const acknowledged = acknowledgedCounts.get(message.content) ?? 0;
    const currentAuthoritative = currentAuthoritativeCounts.get(message.content) ?? 0;
    const hostCount = hostCounts.get(message.content) ?? 0;
    if (hostCount > currentAuthoritative + acknowledged) {
      acknowledgedCounts.set(message.content, acknowledged + 1);
      return false;
    }
    return true;
  });
  return retainedPendingMessages.length === 0
    ? hostMessages
    : insertMessagesChronologically(hostMessages, retainedPendingMessages);
}

function insertMessagesChronologically(
  messages: readonly Message[],
  insertedMessages: readonly Message[],
): readonly Message[] {
  const merged = [...messages];
  for (const message of insertedMessages) {
    const insertionIndex = merged.findIndex(
      (candidate) => candidate.timestamp >= message.timestamp,
    );
    if (insertionIndex === -1) merged.push(message);
    else merged.splice(insertionIndex, 0, message);
  }
  return merged;
}

function isPendingUserMessage(message: Message): boolean {
  return message.role === 'user' && message.id.startsWith('pending-send:');
}

function countUserMessageContent(messages: readonly Message[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    if (message.role !== 'user') continue;
    counts.set(message.content, (counts.get(message.content) ?? 0) + 1);
  }
  return counts;
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
