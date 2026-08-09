import type { AgentState, ContentBlock, Message, ToolCall } from '@neko/agent-contracts';
import { deriveToolCallsFromContentBlocks, mergeToolCalls } from './content-block-presenter';
import type { PluginsAvailable } from '../components/ChatView/SendToMenu';
import type { ActivationProgressTimeline } from './activation-progress-presenter';

export type MessageListItemKind = 'message' | 'execution_activity';

export type MessageListProjectionItem =
  MessageListMessageItemProjection | MessageListExecutionActivityItemProjection;

export interface MessageListMessageItemProjection {
  kind: 'message';
  message: Message;
  ambientToolCalls: readonly ToolCall[];
  isGrouped: boolean;
  ownerMessageId: string;
  estimatedHeight: number;
}

export interface MessageListExecutionActivityItemProjection {
  kind: 'execution_activity';
  agentState: AgentState;
  ownerMessageId: null;
  estimatedHeight: number;
}

export interface MessageListProjectionInput {
  messages: readonly Message[];
  agentState?: AgentState | null;
  streamingMessageId: string | null;
  plugins?: PluginsAvailable;
  activationProgress?: readonly ActivationProgressTimeline[];
}

export interface MessageListProjection {
  items: MessageListProjectionItem[];
  itemCount: number;
  showExecutionActivity: boolean;
  streamingItemIndex: number;
}

const MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT = 80;
const MESSAGE_LIST_ESTIMATED_CONTENT_BLOCK_HEIGHT = 60;
const MESSAGE_LIST_EXECUTION_ACTIVITY_HEIGHT = 34;

export function projectMessageList(input: MessageListProjectionInput): MessageListProjection {
  const executionActivity = projectExecutionActivity(input);
  const items = projectMessageListItems(input.messages, executionActivity);

  return {
    items,
    itemCount: items.length,
    showExecutionActivity: executionActivity !== false,
    streamingItemIndex: findMessageListStreamingItemIndex(items, input.streamingMessageId),
  };
}

export function projectMessageListItems(
  messages: readonly Message[],
  executionActivity: AgentState | false,
): MessageListProjectionItem[] {
  const items: MessageListProjectionItem[] = [];
  let prevRole: Message['role'] | null = null;
  let prevTimestamp = 0;
  let ambientToolCalls: readonly ToolCall[] = [];

  for (const message of messages) {
    if (message.isQueued) {
      continue;
    }

    const timeDiff = message.timestamp - prevTimestamp;
    const isGrouped = prevRole === message.role && timeDiff < 2 * 60 * 1000;

    const messageToolCalls = deriveToolCallsFromContentBlocks(message.contentBlocks);
    items.push({
      kind: 'message',
      message,
      ambientToolCalls: mergeToolCalls(messageToolCalls, ambientToolCalls) ?? [],
      isGrouped,
      ownerMessageId: message.id,
      estimatedHeight: estimateMessageHeight(message),
    });

    prevRole = message.role;
    prevTimestamp = message.timestamp;
    if (message.role === 'assistant' && message.contentBlocks && message.contentBlocks.length > 0) {
      ambientToolCalls =
        mergeToolCalls(deriveToolCallsFromContentBlocks(message.contentBlocks), ambientToolCalls) ??
        [];
    }
  }

  if (executionActivity) {
    items.push({
      kind: 'execution_activity',
      agentState: executionActivity,
      ownerMessageId: null,
      estimatedHeight: MESSAGE_LIST_EXECUTION_ACTIVITY_HEIGHT,
    });
  }

  return items;
}

function projectExecutionActivity(input: MessageListProjectionInput): AgentState | false {
  const state = input.agentState;
  if (!state || state.phase === 'idle') return false;
  if (hasLiveCanonicalExecutionRecord(input.messages)) return false;
  if (hasTerminalAssistantResponse(input.messages)) return false;
  return state;
}

function hasLiveCanonicalExecutionRecord(messages: readonly Message[]): boolean {
  const lastUserMessageIndex = findLastIndex(messages, (message) => message.role === 'user');
  return messages.slice(lastUserMessageIndex + 1).some(
    (message) =>
      (message.isStreaming === true && message.content.trim().length > 0) ||
      message.contentBlocks?.some((block) => {
        if (block.type === 'thinking') {
          return block.isThinkingComplete !== true && (block.thinking?.trim().length ?? 0) > 0;
        }
        if (block.type === 'text') {
          return block.isStreaming === true && (block.content?.trim().length ?? 0) > 0;
        }
        if (block.type === 'tool_call')
          return block.toolCall !== undefined && !block.toolCall.result;
        return false;
      }) === true,
  );
}

function hasTerminalAssistantResponse(messages: readonly Message[]): boolean {
  const lastUserMessageIndex = findLastIndex(messages, (message) => message.role === 'user');
  return messages
    .slice(lastUserMessageIndex + 1)
    .some(
      (message) =>
        message.role === 'assistant' &&
        message.isStreaming !== true &&
        (message.content.trim().length > 0 ||
          message.contentBlocks?.some(
            (block) =>
              block.type === 'text' &&
              block.isStreaming !== true &&
              (block.content?.trim().length ?? 0) > 0,
          ) === true),
    );
}

function findMessageListStreamingItemIndex(
  items: readonly MessageListProjectionItem[],
  streamingMessageId: string | null,
): number {
  if (!streamingMessageId) return -1;
  return findLastIndex(items, (item) => item.ownerMessageId === streamingMessageId);
}

export function estimateMessageListItemHeight(item: MessageListProjectionItem | undefined): number {
  return item?.estimatedHeight ?? MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT;
}

function estimateContentBlockHeight(block: ContentBlock): number {
  switch (block.type) {
    case 'thinking':
      return 80;
    case 'tool_call':
      return 100;
    case 'code_diff':
      return 200;
    case 'composite':
      return 220;
    case 'canvas_lifecycle':
      return 140;
    case 'text': {
      const contentLines = Math.ceil((block.content?.length ?? 0) / 72);
      return Math.max(MESSAGE_LIST_ESTIMATED_CONTENT_BLOCK_HEIGHT, contentLines * 20 + 30);
    }
  }
}

function estimateMessageHeight(message: Message): number {
  const contentLines = Math.ceil((message.content?.length ?? 0) / 60);
  const attachmentHeight = (message.attachments?.length ?? 0) * 100;
  const contextRefHeight = (message.contextReferences?.length ?? 0) > 0 ? 28 : 0;
  const contentBlockHeight =
    message.contentBlocks?.reduce(
      (height, block) => height + estimateContentBlockHeight(block),
      0,
    ) ?? 0;

  return Math.max(
    MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT,
    contentLines * 20 + attachmentHeight + contextRefHeight + contentBlockHeight + 40,
  );
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) return index;
  }
  return -1;
}
