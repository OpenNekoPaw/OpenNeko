import {
  type AgentArtifactTransferPayload,
  type ContentBlock,
  type Message,
  type ToolCall,
} from '@neko-agent/types';
import { type AgentWorkItem } from '@neko-agent/types';
import {
  extractSubAgentWorkItemIds,
  projectBackgroundTaskToolResultToWorkItem,
  projectSubAgentToolResultToWorkItem,
} from './work-item-message-presenter';

export interface ToolCallMessageProjectionInput {
  messages: readonly Message[];
  streamingMessageId: string | null;
  messageId?: string;
  toolCallId?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  now?: () => number;
}

export interface ToolCallMessageProjectionResult {
  messages: Message[];
  updated: boolean;
  targetMessageId?: string;
  streamingMessageId?: string | null;
}

export interface ToolResultMessageProjectionInput {
  conversationId?: string;
  messages: readonly Message[];
  streamingMessageId: string | null;
  messageId?: string;
  toolCallId?: string;
  success: boolean;
  data?: unknown;
  error?: string;
  attachments?: readonly import('@neko/shared').ToolResultAttachment[];
  perceptionCards?: readonly import('@neko/shared').PerceptionCard[];
  backfillDiagnostics?: readonly import('@neko/shared').ToolResultBackfillDiagnostic[];
  artifacts?: readonly AgentArtifactTransferPayload[];
  now?: () => number;
}

export interface ToolResultMessageProjectionResult {
  messages: Message[];
  updated: boolean;
  targetMessageId?: string;
  workItemIds: string[];
  workItems: AgentWorkItem[];
}

export interface ToolConfirmationMessageProjectionInput {
  messages: readonly Message[];
  toolCallId: string;
  action?: string;
  description?: string;
  details?: Record<string, unknown>;
}

export interface ToolConfirmationMessageProjectionResult {
  messages: Message[];
  updated: boolean;
  targetMessageId?: string;
}

export interface MessageProjectorIdOptions {
  now?: () => number;
  randomId?: () => string;
}

export interface StreamingTextProjectionInput extends MessageProjectorIdOptions {
  messages: readonly Message[];
  streamingMessageId: string | null;
  messageId?: string;
  content?: string;
}

export interface AssistantTextReplacementProjectionInput extends MessageProjectorIdOptions {
  messages: readonly Message[];
  streamingMessageId: string | null;
  messageId?: string;
}

export interface StreamingThinkingProjectionInput extends MessageProjectorIdOptions {
  messages: readonly Message[];
  streamingMessageId: string | null;
  messageId?: string;
  content?: string;
}

export interface StreamingCompleteProjectionInput {
  messages: readonly Message[];
  streamingMessageId: string | null;
  messageId?: string;
  contentBlocks?: readonly ContentBlock[];
}

export interface MessageCancelledProjectionInput {
  messages: readonly Message[];
  streamingMessageId: string | null;
}

export interface StreamingMessageProjectionResult {
  messages: Message[];
  streamingMessageId?: string | null;
  isThinking?: boolean;
  updated: boolean;
  targetMessageId?: string;
}

export function projectToolCallIntoMessages(
  input: ToolCallMessageProjectionInput,
): ToolCallMessageProjectionResult {
  const timestamp = input.now?.() ?? Date.now();
  const toolCall: ToolCall = {
    id: input.toolCallId ?? `tool-${timestamp}`,
    name: input.toolName,
    arguments: input.arguments ?? {},
  };

  const targetMessageId = input.messageId ?? input.streamingMessageId ?? undefined;
  let targetIndex = targetMessageId
    ? input.messages.findIndex((message) => message.id === targetMessageId)
    : -1;

  if (targetIndex === -1 && !input.messageId) {
    targetIndex = findTargetMessageForToolCall(input.messages, input.streamingMessageId);
  }

  if (targetIndex === -1) {
    const newMessageId = input.messageId ?? String(timestamp);
    const blocks = addToolCallBlock([], toolCall, timestamp);
    return {
      updated: true,
      targetMessageId: newMessageId,
      streamingMessageId: newMessageId,
      messages: [
        ...input.messages,
        {
          id: newMessageId,
          role: 'assistant',
          content: '',
          timestamp,
          isStreaming: true,
          contentBlocks: blocks,
        },
      ],
    };
  }

  let updated = false;
  let resolvedTargetMessageId: string | undefined;
  const messages = input.messages.map((message, index) => {
    if (index !== targetIndex) return message;

    updated = true;
    resolvedTargetMessageId = message.id;
    const contentBlocks = addToolCallBlock(
      closeStreamingTextBlocks(message.contentBlocks ?? []),
      toolCall,
      timestamp,
    );
    return {
      ...message,
      contentBlocks,
    };
  });

  return {
    messages,
    updated,
    targetMessageId: resolvedTargetMessageId,
  };
}

export function projectToolResultIntoMessages(
  input: ToolResultMessageProjectionInput,
): ToolResultMessageProjectionResult {
  const resultData = asRecord(input.data);
  const backgroundWorkItemIdsFromResult =
    resultData?.backgroundMode === true ? extractBackgroundTaskIds(resultData) : [];
  const subAgentWorkItemIdsFromResult = extractSubAgentWorkItemIds(resultData);
  const workItemIdsFromResult = dedupeStrings([
    ...backgroundWorkItemIdsFromResult,
    ...subAgentWorkItemIdsFromResult,
  ]);
  const targetMessageId = input.messageId ?? input.streamingMessageId ?? undefined;
  let targetIndex = targetMessageId
    ? input.messages.findIndex((message) => message.id === targetMessageId)
    : -1;

  if (targetIndex === -1 && !input.messageId) {
    targetIndex = findTargetMessageForToolResult(
      input.messages,
      input.streamingMessageId,
      input.toolCallId,
    );
  }

  if (targetIndex === -1) {
    return {
      messages: [...input.messages],
      updated: false,
      workItemIds: workItemIdsFromResult,
      workItems: [],
    };
  }

  let updated = false;
  let resolvedTargetMessageId: string | undefined;
  const messages = input.messages.map((message, index) => {
    if (index !== targetIndex) return message;

    updated = true;
    resolvedTargetMessageId = message.id;
    const contentBlocks = updateToolResultContentBlocks(message.contentBlocks ?? [], input);
    const nextWorkItemIds = mergeOptionalIds(message.workItemIds, workItemIdsFromResult);
    return {
      ...message,
      contentBlocks,
      workItemIds: nextWorkItemIds,
    };
  });

  const conversationId = input.conversationId;
  const parentMessageId = resolvedTargetMessageId;
  const workItems: AgentWorkItem[] = [];
  if (conversationId && parentMessageId) {
    const backgroundTaskWorkItem = projectBackgroundTaskToolResultToWorkItem({
      conversationId,
      parentMessageId,
      parentToolCallId: input.toolCallId ?? null,
      toolName: resolveToolNameForResult(input.messages[targetIndex], input.toolCallId),
      toolArguments: resolveToolArgumentsForResult(input.messages[targetIndex], input.toolCallId),
      resultData: input.data,
      now: input.now,
    });
    if (backgroundTaskWorkItem) {
      workItems.push(backgroundTaskWorkItem);
    }
    workItems.push(
      ...subAgentWorkItemIdsFromResult.map((id) =>
        projectSubAgentToolResultToWorkItem({
          id,
          conversationId,
          parentMessageId,
          parentToolCallId: input.toolCallId ?? null,
          data: input.data,
          error: input.error,
        }),
      ),
    );
  }

  return {
    messages,
    updated,
    targetMessageId: resolvedTargetMessageId,
    workItemIds: workItemIdsFromResult,
    workItems,
  };
}

export function projectToolConfirmationIntoMessages(
  input: ToolConfirmationMessageProjectionInput,
): ToolConfirmationMessageProjectionResult {
  const targetIndex = findMessageIndexByToolCallId(input.messages, input.toolCallId);
  if (targetIndex === -1) {
    return { messages: [...input.messages], updated: false };
  }

  let updated = false;
  let targetMessageId: string | undefined;
  const messages = input.messages.map((message, index) => {
    if (index !== targetIndex) return message;

    updated = true;
    targetMessageId = message.id;
    const contentBlocks = updateToolCallInBlocks(
      message.contentBlocks ?? [],
      input.toolCallId,
      (toolCall) => ({
        ...toolCall,
        pendingConfirmation: true,
        confirmation: {
          action: input.action ?? '',
          description: input.description ?? '',
          details: input.details ?? {},
        },
      }),
    );

    return {
      ...message,
      contentBlocks,
    };
  });

  return { messages, updated, targetMessageId };
}

export function projectStreamingTextIntoMessages(
  input: StreamingTextProjectionInput,
): StreamingMessageProjectionResult {
  const content = input.content ?? '';
  const targetMessageId = input.messageId ?? input.streamingMessageId ?? undefined;
  const hasExistingMessage = Boolean(
    targetMessageId &&
    (input.streamingMessageId === targetMessageId ||
      input.messages.some((message) => message.id === targetMessageId)),
  );

  if (!hasExistingMessage) {
    const timestamp = input.now?.() ?? Date.now();
    const newMessageId = input.messageId ?? String(timestamp);
    return {
      updated: true,
      targetMessageId: newMessageId,
      streamingMessageId: newMessageId,
      isThinking: false,
      messages: [
        ...input.messages,
        {
          id: newMessageId,
          role: 'assistant',
          content,
          timestamp,
          isStreaming: true,
          contentBlocks: [
            {
              id: `block-${newMessageId}`,
              type: 'text',
              timestamp,
              content,
              isStreaming: true,
            },
          ],
        },
      ],
    };
  }

  let updated = false;
  const messages = input.messages.map((message) => {
    if (message.id !== targetMessageId) return message;

    updated = true;
    const blocks = message.contentBlocks ?? [];
    const { blocks: contentBlocks, blockId } = findOrCreateStreamingContentBlock(
      blocks,
      'text',
      input,
    );

    return {
      ...message,
      content: message.content + content,
      contentBlocks: contentBlocks.map((block) =>
        block.id === blockId ? { ...block, content: (block.content ?? '') + content } : block,
      ),
    };
  });

  return {
    messages,
    updated,
    targetMessageId,
    isThinking: false,
  };
}

export function projectAssistantTextReplacementIntoMessages(
  input: AssistantTextReplacementProjectionInput,
): StreamingMessageProjectionResult {
  const targetMessageId = input.messageId ?? input.streamingMessageId ?? undefined;
  if (!targetMessageId) {
    return { messages: [...input.messages], updated: false, isThinking: false };
  }

  let updated = false;
  const messages = input.messages.map((message) => {
    if (message.id !== targetMessageId) return message;

    updated = true;
    const timestamp = input.now?.() ?? Date.now();
    const contentBlocks = replaceAssistantTextBlocks(message.contentBlocks ?? [], input);
    const hasStreamingTextBlock = contentBlocks.some(
      (block) => block.type === 'text' && block.isStreaming === true,
    );
    const nextContentBlocks = hasStreamingTextBlock
      ? contentBlocks
      : [
          ...contentBlocks,
          {
            id: `block-${timestamp}-${input.randomId?.() ?? 'replacement'}`,
            type: 'text' as const,
            timestamp,
            content: '',
            isStreaming: true,
          },
        ];

    return {
      ...message,
      content: nextContentBlocks
        .filter((block) => block.type === 'text')
        .map((block) => block.content ?? '')
        .join(''),
      isStreaming: true,
      contentBlocks: nextContentBlocks,
    };
  });

  return {
    messages,
    updated,
    targetMessageId,
    isThinking: false,
  };
}

export function projectStreamingThinkingIntoMessages(
  input: StreamingThinkingProjectionInput,
): StreamingMessageProjectionResult {
  const content = input.content ?? '';
  const targetMessageId = input.messageId ?? input.streamingMessageId ?? undefined;
  const hasExistingMessage = Boolean(
    targetMessageId &&
    (input.streamingMessageId === targetMessageId ||
      input.messages.some((message) => message.id === targetMessageId)),
  );

  if (!hasExistingMessage) {
    const timestamp = input.now?.() ?? Date.now();
    const newMessageId = input.messageId ?? String(timestamp);
    return {
      updated: true,
      targetMessageId: newMessageId,
      streamingMessageId: newMessageId,
      isThinking: true,
      messages: [
        ...input.messages,
        {
          id: newMessageId,
          role: 'assistant',
          content: '',
          timestamp,
          isStreaming: true,
          contentBlocks: [
            {
              id: `block-thinking-${newMessageId}`,
              type: 'thinking',
              timestamp,
              thinking: content,
              isThinkingComplete: false,
            },
          ],
        },
      ],
    };
  }

  let updated = false;
  const messages = input.messages.map((message) => {
    if (message.id !== targetMessageId) return message;

    updated = true;
    const blocks = message.contentBlocks ?? [];
    const { blocks: contentBlocks, blockId } = findOrCreateStreamingContentBlock(
      blocks,
      'thinking',
      input,
    );

    return {
      ...message,
      contentBlocks: contentBlocks.map((block) =>
        block.id === blockId ? { ...block, thinking: (block.thinking ?? '') + content } : block,
      ),
    };
  });

  return {
    messages,
    updated,
    targetMessageId,
    isThinking: true,
  };
}

export function projectStreamingCompleteIntoMessages(
  input: StreamingCompleteProjectionInput,
): StreamingMessageProjectionResult {
  const targetMessageId = input.messageId ?? input.streamingMessageId ?? undefined;
  if (!targetMessageId) {
    return { messages: [...input.messages], updated: false, isThinking: false };
  }

  let updated = false;
  const messages = input.messages.map((message) => {
    if (message.id !== targetMessageId) return message;

    updated = true;
    return input.contentBlocks && input.contentBlocks.length > 0
      ? completeStreamingMessageWithContentBlocks(
          message,
          mergeCompletionContentBlocks(message.contentBlocks ?? [], input.contentBlocks),
        )
      : completeStreamingMessage(message);
  });

  return {
    messages,
    updated,
    targetMessageId,
    streamingMessageId: input.streamingMessageId === targetMessageId ? null : undefined,
    isThinking: false,
  };
}

export function projectMessageCancelledIntoMessages(
  input: MessageCancelledProjectionInput,
): StreamingMessageProjectionResult {
  if (!input.streamingMessageId) {
    return { messages: [...input.messages], updated: false, isThinking: false };
  }

  const targetMessageId = input.streamingMessageId;
  let updated = false;
  const messages = input.messages.map((message) => {
    if (message.id !== targetMessageId) return message;

    updated = true;
    const completed = completeStreamingMessage(message);
    const cancelledNote = message.content ? '\n\n*(Cancelled)*' : '*(Cancelled)*';
    return {
      ...completed,
      content: message.content + cancelledNote,
      isCancelled: true,
    };
  });

  return {
    messages,
    updated,
    targetMessageId,
    streamingMessageId: null,
    isThinking: false,
  };
}

function addToolCallBlock(
  blocks: readonly ContentBlock[],
  toolCall: ToolCall,
  timestamp: number = Date.now(),
): ContentBlock[] {
  return [
    ...blocks,
    {
      id: `block-tool-${toolCall.id}`,
      type: 'tool_call',
      timestamp,
      toolCall,
    },
  ];
}

function replaceAssistantTextBlocks(
  contentBlocks: readonly ContentBlock[],
  options: MessageProjectorIdOptions,
): ContentBlock[] {
  let replaced = false;
  return contentBlocks.map((block) => {
    if (block.type === 'thinking') {
      return { ...block, isThinkingComplete: true };
    }
    if (block.type !== 'text') return block;
    if (replaced) {
      return { ...block, content: '', isStreaming: false };
    }
    replaced = true;
    return {
      ...block,
      content: '',
      isStreaming: true,
      timestamp: block.timestamp || options.now?.() || Date.now(),
    };
  });
}

function closeStreamingTextBlocks(blocks: readonly ContentBlock[]): ContentBlock[] {
  return blocks.map((block) =>
    block.type === 'text' && block.isStreaming === true ? { ...block, isStreaming: false } : block,
  );
}

export function updateToolCallInBlocks(
  blocks: readonly ContentBlock[],
  toolCallId: string,
  updater: (toolCall: ToolCall) => ToolCall,
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'tool_call' || !block.toolCall || block.toolCall.id !== toolCallId) {
      return block;
    }
    return { ...block, toolCall: updater(block.toolCall) };
  });
}

function updateLastPendingToolCall(
  blocks: readonly ContentBlock[],
  updater: (toolCall: ToolCall) => ToolCall,
): ContentBlock[] {
  let lastPendingIndex = -1;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.type === 'tool_call' && block.toolCall && !block.toolCall.result) {
      lastPendingIndex = index;
      break;
    }
  }

  if (lastPendingIndex === -1) return [...blocks];

  return blocks.map((block, index) => {
    if (index !== lastPendingIndex || !block.toolCall) return block;
    return { ...block, toolCall: updater(block.toolCall) };
  });
}

function findOrCreateStreamingContentBlock(
  contentBlocks: readonly ContentBlock[],
  type: 'thinking' | 'text',
  options: MessageProjectorIdOptions,
): { blocks: ContentBlock[]; blockId: string } {
  const lastBlockOfType = [...contentBlocks].reverse().find((block) => {
    if (block.type !== type) return false;
    if (type === 'thinking') return !block.isThinkingComplete;
    return block.isStreaming;
  });

  if (lastBlockOfType) {
    return { blocks: [...contentBlocks], blockId: lastBlockOfType.id };
  }

  const timestamp = options.now?.() ?? Date.now();
  const suffix = options.randomId?.() ?? Math.random().toString(36).slice(2, 7);
  const newBlock: ContentBlock = {
    id: `block-${timestamp}-${suffix}`,
    type,
    timestamp,
    ...(type === 'thinking' ? { thinking: '', isThinkingComplete: false } : {}),
    ...(type === 'text' ? { content: '', isStreaming: true } : {}),
  };

  return {
    blocks: [...contentBlocks, newBlock],
    blockId: newBlock.id,
  };
}

function completeStreamingMessage(message: Message): Message {
  return completeStreamingMessageWithContentBlocks(
    message,
    (message.contentBlocks ?? []).flatMap((block) => completeStreamingContentBlock(block)),
  );
}

function completeStreamingMessageWithContentBlocks(
  message: Message,
  contentBlocks: readonly ContentBlock[],
): Message {
  const completedBlocks = contentBlocks.map((block) => ({
    ...block,
    isStreaming: false,
    isThinkingComplete: block.type === 'thinking' ? true : block.isThinkingComplete,
  }));

  return {
    ...message,
    isStreaming: false,
    content: completedBlocks
      .filter((block) => block.type === 'text')
      .map((block) => block.content ?? '')
      .join(''),
    contentBlocks: completedBlocks,
  };
}

function mergeCompletionContentBlocks(
  currentBlocks: readonly ContentBlock[],
  finalBlocks: readonly ContentBlock[],
): ContentBlock[] {
  if (currentBlocks.length === 0) {
    return [...finalBlocks];
  }

  const finalById = new Map(finalBlocks.map((block) => [block.id, block]));
  const finalByToolCallId = new Map(
    finalBlocks.flatMap((block) =>
      block.type === 'tool_call' && block.toolCall?.id ? [[block.toolCall.id, block]] : [],
    ),
  );
  const usedFinalIds = new Set<string>();

  const merged = currentBlocks.map((block) => {
    const replacement =
      finalById.get(block.id) ??
      (block.type === 'tool_call' && block.toolCall?.id
        ? finalByToolCallId.get(block.toolCall.id)
        : undefined);

    if (!replacement) {
      return block;
    }

    usedFinalIds.add(replacement.id);
    return replacement;
  });

  for (const block of finalBlocks) {
    if (!usedFinalIds.has(block.id)) {
      merged.push(block);
    }
  }

  return merged;
}

function completeStreamingContentBlock(block: ContentBlock): ContentBlock[] {
  return [
    {
      ...block,
      isStreaming: false,
      isThinkingComplete: block.type === 'thinking' ? true : block.isThinkingComplete,
    },
  ];
}

function findTargetMessageForToolCall(
  messages: readonly Message[],
  streamingMessageId: string | null,
): number {
  if (streamingMessageId) {
    const index = messages.findIndex((message) => message.id === streamingMessageId);
    if (index !== -1) return index;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && message.isStreaming) {
      return index;
    }
  }

  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      lastUserIndex = index;
      break;
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && index > lastUserIndex) {
      return index;
    }
  }

  return -1;
}

function findTargetMessageForToolResult(
  messages: readonly Message[],
  streamingMessageId: string | null,
  toolCallId?: string,
): number {
  if (streamingMessageId) {
    const index = messages.findIndex((message) => message.id === streamingMessageId);
    if (index !== -1) return index;
  }

  if (toolCallId) {
    const index = findMessageIndexByToolCallId(messages, toolCallId);
    if (index !== -1) return index;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === 'assistant' &&
      message.contentBlocks?.some((block) => block.type === 'tool_call')
    ) {
      return index;
    }
  }

  return -1;
}

function findMessageIndexByToolCallId(messages: readonly Message[], toolCallId: string): number {
  return messages.findIndex((message) =>
    message.contentBlocks?.some(
      (block) => block.type === 'tool_call' && block.toolCall?.id === toolCallId,
    ),
  );
}

function resolveToolNameForResult(message: Message | undefined, toolCallId?: string): string {
  return findToolCallForResult(message, toolCallId)?.name ?? '';
}

function resolveToolArgumentsForResult(
  message: Message | undefined,
  toolCallId?: string,
): Record<string, unknown> {
  return findToolCallForResult(message, toolCallId)?.arguments ?? {};
}

function findToolCallForResult(
  message: Message | undefined,
  toolCallId?: string,
): ToolCall | undefined {
  const toolCalls = [
    ...(message?.contentBlocks
      ?.map((block) => (block.type === 'tool_call' ? block.toolCall : undefined))
      .filter((toolCall): toolCall is ToolCall => toolCall !== undefined) ?? []),
  ];
  if (toolCallId) {
    return toolCalls.find((toolCall) => toolCall.id === toolCallId);
  }
  return toolCalls[toolCalls.length - 1];
}

function updateToolResultContentBlocks(
  blocks: readonly ContentBlock[],
  input: ToolResultMessageProjectionInput,
): ContentBlock[] {
  const updater = (toolCall: ToolCall): ToolCall => ({
    ...toolCall,
    pendingConfirmation: false,
    result: {
      success: input.success,
      data: input.data,
      error: input.error,
      ...(input.attachments ? { attachments: input.attachments } : {}),
      ...(input.perceptionCards ? { perceptionCards: input.perceptionCards } : {}),
      ...(input.backfillDiagnostics ? { backfillDiagnostics: input.backfillDiagnostics } : {}),
      ...(input.artifacts ? { artifacts: input.artifacts } : {}),
    },
  });

  if (input.toolCallId) {
    return updateToolCallInBlocks(blocks, input.toolCallId, updater);
  }

  return updateLastPendingToolCall(blocks, updater);
}

function mergeOptionalIds(
  existing: readonly string[] | undefined,
  incoming: readonly string[],
): string[] | undefined {
  const merged = dedupeStrings([...(existing ?? []), ...incoming]);
  return merged.length > 0 ? merged : undefined;
}

function extractBackgroundTaskIds(data: Record<string, unknown>): string[] {
  const ids = readStringArray(data, 'taskIds');
  const taskId = readString(data, 'taskId');
  if (taskId) ids.push(taskId);
  return dedupeStrings(ids);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
