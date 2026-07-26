import type { AgentTurnTimelineItem, ContentBlock, Message } from '@neko-agent/types';

export interface TimelineTurnRenderInput {
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completed: boolean;
}

export function projectTimelineTurnToMessage(input: TimelineTurnRenderInput): Message {
  const timelineContentBlocks = projectTimelineItemsToContentBlocks(input.items);
  const contentBlocks = timelineContentBlocks;
  const workItemIds = projectTimelineWorkItemIds(input.items);
  return {
    id: input.messageId,
    role: 'assistant',
    content: contentBlocks
      .filter((block) => block.type === 'text')
      .map((block) => block.content ?? '')
      .join(''),
    timestamp: contentBlocks[0]?.timestamp ?? Date.now(),
    isStreaming: !input.completed,
    contentBlocks,
    ...(workItemIds.length > 0 ? { workItemIds: [...workItemIds] } : {}),
  };
}

function projectTimelineItemsToContentBlocks(
  items: readonly AgentTurnTimelineItem[],
): ContentBlock[] {
  return items.flatMap((item): ContentBlock[] => {
    switch (item.kind) {
      case 'assistant_text':
        return projectAssistantTextItemToContentBlocks(item);
      case 'thinking':
        return [
          {
            id: item.itemId,
            type: 'thinking',
            timestamp: item.createdAt,
            thinking: item.payload.content,
            isThinkingComplete: item.status !== 'streaming',
          },
        ];
      case 'tool_call':
        return [
          {
            id: item.itemId,
            type: 'tool_call',
            timestamp: item.createdAt,
            toolCall: item.payload.toolCall,
            ...(item.payload.progress ? { toolProgress: item.payload.progress } : {}),
          },
        ];
      case 'composite':
        return [
          {
            id: item.itemId,
            type: 'composite',
            timestamp: item.createdAt,
            composite: item.payload.composite,
          },
        ];
      case 'error':
        return [
          {
            id: item.itemId,
            type: 'text',
            timestamp: item.createdAt,
            content: item.payload.message ? `Error: ${item.payload.message}` : 'An error occurred',
            isStreaming: false,
          },
        ];
    }
  });
}

function projectAssistantTextItemToContentBlocks(
  item: Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }>,
): ContentBlock[] {
  return [
    {
      id: item.itemId,
      type: 'text',
      timestamp: item.createdAt,
      content: item.payload.content,
      isStreaming: item.status === 'streaming',
    },
  ];
}

function projectTimelineWorkItemIds(items: readonly AgentTurnTimelineItem[]): string[] {
  void items;
  return [];
}
