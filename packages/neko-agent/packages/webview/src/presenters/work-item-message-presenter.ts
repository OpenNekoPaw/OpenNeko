import type { AgentWorkItem, Message, SubAgentWorkItem } from '@neko-agent/types';
import { toSubAgentWorkItemStatus, validateChildRunScope } from '@neko-agent/types';

export interface ProjectSubAgentToolResultInput {
  id: string;
  conversationId: string;
  parentMessageId: string;
  parentToolCallId?: string | null;
  data?: unknown;
  error?: string;
  timestamp?: string;
}

export interface WorkItemMessageLinkTarget {
  id: string;
  workItemIds?: string[];
  contentBlocks?: Array<{
    type?: string;
    toolCall?: { id?: string | null };
  }>;
}

export interface AttachWorkItemToMessageByToolCallResult<TMessage> {
  messages: TMessage[];
  attached: boolean;
}

export interface ConversationWorkItemProjectionInput {
  conversationId: string;
  messages: readonly Message[];
  now?: () => number;
}

export interface ConversationWorkItemProjectionResult {
  messages: Message[];
  workItems: AgentWorkItem[];
  subAgentWorkItems: SubAgentWorkItem[];
}

export interface RehydrateWorkItemsFromMessagesOptions {
  now?: () => number;
}

export interface AppendWorkItemMessageOptions {
  now?: () => number;
}

export interface SelectRelatedSubAgentWorkItemsInput {
  toolCallId: string | null | undefined;
  toolResultData?: unknown;
  workItems?: readonly AgentWorkItem[];
  workItemIds?: readonly string[];
}

export interface SelectMessageWorkItemsInput {
  message: Pick<Message, 'workItemIds' | 'contentBlocks'>;
  workItems?: readonly AgentWorkItem[];
}

export function projectSubAgentToolResultToWorkItem(
  input: ProjectSubAgentToolResultInput,
): SubAgentWorkItem {
  const data = asRecord(input.data);
  const status = toSubAgentWorkItemStatus(data?.status);
  const timestamp = input.timestamp ?? new Date().toISOString();
  const scopeResult = validateChildRunScope(data?.scope);
  if (
    !scopeResult.ok ||
    scopeResult.scope.childKind !== 'subagent' ||
    scopeResult.scope.childRunId !== input.id ||
    scopeResult.scope.conversationId !== input.conversationId
  ) {
    throw new Error(
      `SubAgent work item requires matching scope for ${input.conversationId}/${input.id}.`,
    );
  }

  const response = readString(data, 'response');
  const error = readString(data, 'error') ?? input.error;
  const description = readString(data, 'description');
  const message = readString(data, 'message');
  const subagentType = readString(data, 'subagentType') ?? readString(data, 'type');

  return {
    id: input.id,
    conversationId: input.conversationId,
    kind: 'subagent',
    scope: scopeResult.scope,
    parentMessageId: input.parentMessageId,
    parentToolCallId: input.parentToolCallId ?? null,
    title: description ?? message ?? `SubAgent ${input.id}`,
    summary: description ?? message,
    status,
    progress: isTerminalStatus(status) ? 100 : 0,
    error,
    createdAt: timestamp,
    updatedAt: timestamp,
    subAgent: {
      parentAgentId: readString(data, 'parentAgentId') ?? 'unknown',
      type: subagentType,
      runMode: readSubAgentRunMode(data),
      modelTier: readString(data, 'modelTier') ?? readString(data, 'model'),
      response,
    },
  };
}

export function extractSubAgentWorkItemIds(data: Record<string, unknown> | undefined): string[] {
  if (!data || data.backgroundMode === true) return [];

  const ids: string[] = [];
  if (typeof data.subAgentId === 'string') ids.push(data.subAgentId);
  if (Array.isArray(data.subAgentIds)) {
    ids.push(...data.subAgentIds.filter((id): id is string => typeof id === 'string'));
  }
  if (typeof data.id === 'string' && isSubAgentResultData(data)) ids.push(data.id);
  return dedupeStrings(ids);
}

export function selectRelatedSubAgentWorkItems(
  input: SelectRelatedSubAgentWorkItemsInput,
): SubAgentWorkItem[] {
  if (
    !input.toolCallId ||
    !input.workItems ||
    !input.workItemIds ||
    input.workItemIds.length === 0
  ) {
    return [];
  }

  const linkedIds = new Set(input.workItemIds);
  const resultLinkedIds = new Set(extractSubAgentWorkItemIds(asRecord(input.toolResultData)));
  return input.workItems.filter((item) => {
    if (!linkedIds.has(item.id)) return false;
    if (item.parentToolCallId) return item.parentToolCallId === input.toolCallId;
    return resultLinkedIds.has(item.id);
  });
}

export function selectMessageLevelSubAgentWorkItems(
  input: SelectMessageWorkItemsInput,
): SubAgentWorkItem[] {
  const ids = input.message.workItemIds;
  if (!input.workItems || !ids || ids.length === 0) return [];
  if (input.message.contentBlocks?.some((block) => block.type === 'tool_call')) return [];

  const linkedIds = new Set(ids);
  return input.workItems.filter((item) => linkedIds.has(item.id));
}

export function projectConversationWorkItemsFromMessages(
  input: ConversationWorkItemProjectionInput,
): ConversationWorkItemProjectionResult {
  const messages = deriveInlineWorkLinksFromMessages(input.messages);
  const subAgentWorkItems = rehydrateSubAgentWorkItemsFromMessages(messages, input.conversationId, {
    now: input.now,
  });
  return {
    messages,
    workItems: subAgentWorkItems,
    subAgentWorkItems,
  };
}

export function deriveInlineWorkLinksFromMessages(messages: readonly Message[]): Message[] {
  return messages.map((message) => {
    const workItemIds = (message.contentBlocks ?? []).flatMap((block) =>
      block.type === 'tool_call'
        ? extractSubAgentWorkItemIds(asRecord(block.toolCall?.result?.data))
        : [],
    );
    if (workItemIds.length === 0) return message;
    return {
      ...message,
      workItemIds: dedupeStrings([...(message.workItemIds ?? []), ...workItemIds]),
    };
  });
}

export function rehydrateSubAgentWorkItemsFromMessages(
  messages: readonly Message[],
  conversationId: string,
  options: RehydrateWorkItemsFromMessagesOptions = {},
): SubAgentWorkItem[] {
  const items: SubAgentWorkItem[] = [];

  for (const message of messages) {
    for (const block of message.contentBlocks ?? []) {
      if (block.type !== 'tool_call' || !block.toolCall) continue;
      const data = asRecord(block.toolCall.result?.data);
      const ids = extractSubAgentWorkItemIds(data);
      const timestamp = new Date(options.now?.() ?? Date.now()).toISOString();
      for (const id of ids) {
        items.push(
          projectSubAgentToolResultToWorkItem({
            id,
            conversationId,
            parentMessageId: message.id,
            parentToolCallId: block.toolCall.id ?? null,
            data,
            timestamp,
          }),
        );
      }
    }
  }
  return items;
}

export function appendSubAgentMessageToMessages(
  messages: readonly Message[],
  subAgentId: string,
  options: AppendWorkItemMessageOptions = {},
): Message[] {
  const messageId = `subagent-${subAgentId}`;
  if (messages.some((message) => message.id === messageId)) return [...messages];
  return [
    ...messages,
    {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: options.now?.() ?? Date.now(),
      workItemIds: [subAgentId],
    },
  ];
}

export function attachWorkItemToMessageByToolCall<TMessage extends WorkItemMessageLinkTarget>(
  messages: readonly TMessage[],
  input: {
    readonly toolCallId: string | null | undefined;
    readonly workItemId: string;
  },
): AttachWorkItemToMessageByToolCallResult<TMessage> {
  if (!input.toolCallId) return { messages: [...messages], attached: false };
  const toolCallId = input.toolCallId;
  const targetIndex = messages.findIndex((message) =>
    message.contentBlocks?.some(
      (block) => block.type === 'tool_call' && block.toolCall?.id === toolCallId,
    ),
  );
  if (targetIndex === -1) return { messages: [...messages], attached: false };

  return {
    attached: true,
    messages: messages.map((message, index) =>
      index === targetIndex
        ? {
            ...message,
            workItemIds: dedupeStrings([...(message.workItemIds ?? []), input.workItemId]),
          }
        : message,
    ),
  };
}

function readSubAgentRunMode(
  record: Record<string, unknown> | undefined,
): 'foreground' | 'background' | undefined {
  const value = readString(record, 'runMode');
  return value === 'foreground' || value === 'background' ? value : undefined;
}

function isSubAgentResultData(data: Record<string, unknown>): boolean {
  return (
    typeof data.parentAgentId === 'string' ||
    typeof data.subagentType === 'string' ||
    typeof data.subAgentType === 'string' ||
    typeof data.response === 'string'
  );
}

function isTerminalStatus(status: SubAgentWorkItem['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function dedupeStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
