import type { ContentBlock, Message, ToolCall } from '@neko-agent/types';
import {
  deriveToolCallsFromContentBlocks,
  mergeToolCalls,
  projectContentBlocksDisplay,
  projectContentBlocksUi,
  type ContentBlockProcessGroupProjection,
  type ContentBlockUiProjection,
} from '@/presenters/content-block-presenter';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';

export type MessageListItemKind =
  'message' | 'content_block' | 'process_group' | 'thinking_indicator';

export type MessageListProjectionItem =
  | MessageListMessageItemProjection
  | MessageListContentBlockItemProjection
  | MessageListProcessGroupItemProjection
  | MessageListThinkingItemProjection;

export interface MessageListMessageItemProjection {
  kind: 'message';
  message: Message;
  isGrouped: boolean;
  ownerMessageId: string;
  estimatedHeight: number;
}

export interface MessageListContentBlockItemProjection {
  kind: 'content_block';
  messageId: string;
  workItemIds?: string[];
  projection: ContentBlockUiProjection;
  siblingBlocks: ContentBlock[];
  ambientToolCalls: readonly ToolCall[];
  isFirst: boolean;
  isLast: boolean;
  isStreaming: boolean;
  ownerMessageId: string;
  estimatedHeight: number;
}

export interface MessageListProcessGroupItemProjection {
  kind: 'process_group';
  messageId: string;
  workItemIds?: string[];
  processGroup: ContentBlockProcessGroupProjection;
  siblingBlocks: ContentBlock[];
  ambientToolCalls: readonly ToolCall[];
  isFirst: boolean;
  isStreaming: boolean;
  ownerMessageId: string;
  estimatedHeight: number;
}

export interface MessageListThinkingItemProjection {
  kind: 'thinking_indicator';
  ownerMessageId: null;
  estimatedHeight: number;
}

export interface MessageListProjectionInput {
  messages: readonly Message[];
  isThinking: boolean;
  streamingMessageId: string | null;
  plugins?: PluginsAvailable;
  activationProgress?: readonly ActivationProgressTimeline[];
}

export interface MessageListProjection {
  items: MessageListProjectionItem[];
  itemCount: number;
  showThinkingIndicator: boolean;
  streamingItemIndex: number;
}

const MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT = 80;
const MESSAGE_LIST_ESTIMATED_CONTENT_BLOCK_HEIGHT = 60;
const MESSAGE_LIST_THINKING_INDICATOR_HEIGHT = 50;

export function projectMessageList(input: MessageListProjectionInput): MessageListProjection {
  const showThinkingIndicator = input.isThinking && !input.streamingMessageId;
  const items = projectMessageListItems(input.messages, showThinkingIndicator, {
    plugins: input.plugins,
    activationProgress: input.activationProgress,
  });

  return {
    items,
    itemCount: items.length,
    showThinkingIndicator,
    streamingItemIndex: findMessageListStreamingItemIndex(items, input.streamingMessageId),
  };
}

export function projectMessageListItems(
  messages: readonly Message[],
  showThinkingIndicator: boolean,
  options: Pick<MessageListProjectionInput, 'plugins' | 'activationProgress'> = {},
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

    if (message.role === 'assistant' && message.contentBlocks && message.contentBlocks.length > 0) {
      const messageToolCalls = deriveToolCallsFromContentBlocks(message.contentBlocks);
      const markdownToolCalls = mergeToolCalls(messageToolCalls, ambientToolCalls);
      const contentBlockProjections = projectContentBlocksUi(
        message.contentBlocks,
        message.isStreaming ?? false,
        undefined,
        message.contentBlocks,
        messageToolCalls,
        options.plugins,
        ambientToolCalls,
      );

      const displayProjection = projectContentBlocksDisplay(contentBlockProjections);
      const displayItems = displayProjection.items;

      displayItems.forEach((displayItem, displayIndex) => {
        if (displayItem.kind === 'projection') {
          items.push({
            kind: 'content_block',
            messageId: message.id,
            workItemIds: message.workItemIds,
            projection: displayItem.projection,
            siblingBlocks: message.contentBlocks ?? [],
            ambientToolCalls: markdownToolCalls ?? [],
            isFirst: displayIndex === 0,
            isLast: displayIndex === displayItems.length - 1,
            isStreaming: message.isStreaming ?? false,
            ownerMessageId: message.id,
            estimatedHeight: estimateContentBlockProjectionHeight(displayItem.projection),
          });
          return;
        }

        items.push({
          kind: 'process_group',
          messageId: message.id,
          workItemIds: message.workItemIds,
          processGroup: displayItem.processGroup,
          siblingBlocks: message.contentBlocks ?? [],
          ambientToolCalls: markdownToolCalls ?? [],
          isFirst: displayIndex === 0,
          isStreaming: message.isStreaming ?? false,
          ownerMessageId: message.id,
          estimatedHeight: estimateProcessGroupHeight(displayItem.processGroup),
        });
      });
    } else {
      items.push({
        kind: 'message',
        message,
        isGrouped,
        ownerMessageId: message.id,
        estimatedHeight: estimateMessageHeight(message),
      });
    }

    prevRole = message.role;
    prevTimestamp = message.timestamp;
    if (message.role === 'assistant' && message.contentBlocks && message.contentBlocks.length > 0) {
      ambientToolCalls =
        mergeToolCalls(deriveToolCallsFromContentBlocks(message.contentBlocks), ambientToolCalls) ??
        [];
    }
  }

  if (showThinkingIndicator) {
    items.push({
      kind: 'thinking_indicator',
      ownerMessageId: null,
      estimatedHeight: MESSAGE_LIST_THINKING_INDICATOR_HEIGHT,
    });
  }

  return items;
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

function estimateProcessGroupHeight(group: ContentBlockProcessGroupProjection): number {
  return group.isStreaming ? 64 : 44;
}

function estimateContentBlockProjectionHeight(projection: ContentBlockUiProjection): number {
  if (projection.renderKind === 'toolGroup') {
    return 72;
  }
  return estimateContentBlockHeight(projection.block);
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
      const contentLines = Math.ceil((block.content?.length ?? 0) / 60);
      return Math.max(MESSAGE_LIST_ESTIMATED_CONTENT_BLOCK_HEIGHT, contentLines * 20 + 40);
    }
  }
}

function estimateMessageHeight(message: Message): number {
  const contentLines = Math.ceil((message.content?.length ?? 0) / 60);
  const attachmentHeight = (message.attachments?.length ?? 0) * 100;
  const contextRefHeight = (message.contextReferences?.length ?? 0) > 0 ? 28 : 0;
  const toolCallHeight = deriveToolCallsFromContentBlocks(message.contentBlocks).length * 60;
  const thinkingHeight = message.contentBlocks?.some((block) => block.type === 'thinking')
    ? 100
    : 0;

  return Math.max(
    MESSAGE_LIST_ESTIMATED_MESSAGE_HEIGHT,
    contentLines * 20 + attachmentHeight + contextRefHeight + toolCallHeight + thinkingHeight + 40,
  );
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && predicate(item)) return index;
  }
  return -1;
}
