import type {
  AgentTurnTimelineItem,
  AgentWorkItem,
  ContentBlock,
  Message,
  ToolCall,
} from '@neko-agent/types';

export interface TimelineTurnRenderInput {
  readonly messageId: string;
  readonly items: readonly AgentTurnTimelineItem[];
  readonly completed: boolean;
  readonly finalContentBlocks?: readonly ContentBlock[];
}

export function projectTimelineTurnToMessage(input: TimelineTurnRenderInput): Message {
  const timelineContentBlocks = projectTimelineItemsToContentBlocks(input.items);
  const contentBlocks = input.completed
    ? mergeFinalContentBlocksIntoTimelineOrder(timelineContentBlocks, input.finalContentBlocks)
    : timelineContentBlocks;
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

export function projectTimelineItemsToWorkItems(
  items: readonly AgentTurnTimelineItem[],
): AgentWorkItem[] {
  return items.flatMap((item) =>
    item.kind === 'task' || item.kind === 'media' ? [item.payload.workItem] : [],
  );
}

function projectTimelineItemsToContentBlocks(
  items: readonly AgentTurnTimelineItem[],
): ContentBlock[] {
  const workItemIdsByToolCallId = projectWorkItemIdsByToolCallId(items);
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
            toolCall: mergeToolCallWithTimelineChildren(
              item.payload.toolCall,
              workItemIdsByToolCallId.get(item.payload.toolCall.id) ?? [],
            ),
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
      case 'task':
      case 'media':
        return [];
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

function mergeToolCallWithTimelineChildren(
  toolCall: ToolCall,
  workItemIds: readonly string[],
): ToolCall {
  if (workItemIds.length === 0) return toolCall;

  const existingResult = toolCall.result;
  const existingResultData =
    existingResult && isRecord(existingResult.data) ? existingResult.data : {};
  const nextData = {
    ...existingResultData,
    backgroundMode: true,
    taskId: readString(existingResultData.taskId) ?? workItemIds[0],
    taskIds: dedupeStrings([...readStringArray(existingResultData.taskIds), ...workItemIds]),
  };
  return {
    ...toolCall,
    ...(existingResult ? { result: { ...existingResult, data: nextData } } : {}),
  };
}

function projectWorkItemIdsByToolCallId(
  items: readonly AgentTurnTimelineItem[],
): Map<string, string[]> {
  const byTool = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== 'task' && item.kind !== 'media') continue;
    const toolCallId = item.parentToolCallId;
    if (!toolCallId) continue;
    const workItemId = item.payload.workItem.id;
    byTool.set(toolCallId, dedupeStrings([...(byTool.get(toolCallId) ?? []), workItemId]));
  }
  return byTool;
}

function projectTimelineWorkItemIds(items: readonly AgentTurnTimelineItem[]): string[] {
  return dedupeStrings(
    items.flatMap((item) =>
      item.kind === 'task' || item.kind === 'media' ? [item.payload.workItem.id] : [],
    ),
  );
}

function mergeFinalContentBlocksIntoTimelineOrder(
  timelineBlocks: readonly ContentBlock[],
  finalBlocks: readonly ContentBlock[] | undefined,
): ContentBlock[] {
  if (!finalBlocks || finalBlocks.length === 0) return [...timelineBlocks];

  const finalById = new Map(finalBlocks.map((block) => [block.id, block]));
  const finalByToolCallId = new Map(
    finalBlocks.flatMap((block) =>
      block.type === 'tool_call' && block.toolCall?.id ? [[block.toolCall.id, block]] : [],
    ),
  );

  return timelineBlocks.map((block) => {
    if (block.type === 'text' || block.type === 'thinking') return block;
    const replacement =
      finalById.get(block.id) ??
      (block.type === 'tool_call' && block.toolCall?.id
        ? finalByToolCallId.get(block.toolCall.id)
        : undefined);
    return replacement ?? block;
  });
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
