import type {
  AgentBackgroundTask,
  AgentWorkItem,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskType,
  Message,
  SubAgentWorkItem,
  TaskWorkItem,
} from '@neko-agent/types';
import { validateChildRunScope } from '@neko-agent/types';
import type { TaskRunScope } from '@neko/shared';
import {
  backgroundTaskToWorkItem,
  isSubAgentWorkItem,
  isTaskWorkItem,
  toSubAgentWorkItemStatus,
} from './work-item-projection-presenter';

export interface ProjectSubAgentToolResultInput {
  id: string;
  conversationId: string;
  parentMessageId: string;
  parentToolCallId?: string | null;
  data?: unknown;
  error?: string;
  timestamp?: string;
}

export interface ProjectBackgroundTaskToolResultInput {
  conversationId: string;
  parentMessageId: string;
  parentToolCallId?: string | null;
  toolName: string;
  toolArguments: Record<string, unknown>;
  resultData: unknown;
  now?: () => number;
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
  backgroundTaskWorkItems: TaskWorkItem[];
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

export function projectBackgroundTaskToolResultToWorkItem(
  input: ProjectBackgroundTaskToolResultInput,
): TaskWorkItem | null {
  const task = projectCompletedBackgroundTaskFromToolResult(
    input.toolName,
    input.toolArguments,
    input.resultData,
    { now: input.now },
  );
  if (!task) return null;

  return backgroundTaskToWorkItem(task, input.conversationId, 'tool-background-task', {
    parentMessageId: input.parentMessageId,
    parentToolCallId: input.parentToolCallId ?? null,
  });
}

export function projectSubAgentToolResultToWorkItem(
  input: ProjectSubAgentToolResultInput,
): SubAgentWorkItem {
  const data = asRecord(input.data);
  const status = toSubAgentWorkItemStatus(data?.status);
  const timestamp = input.timestamp ?? new Date().toISOString();
  const response = readString(data, 'response');
  const error = readString(data, 'error') ?? input.error;
  const description = readString(data, 'description');
  const message = readString(data, 'message');
  const subagentType = readString(data, 'subagentType') ?? readString(data, 'type');
  const runMode = readSubAgentRunMode(data);
  const modelTier = readString(data, 'modelTier') ?? readString(data, 'model');
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
      runMode,
      modelTier,
      response,
    },
  };
}

export function extractSubAgentWorkItemIds(data: Record<string, unknown> | undefined): string[] {
  if (!data || data.backgroundMode === true) return [];

  const ids: string[] = [];
  if (typeof data.subAgentId === 'string') {
    ids.push(data.subAgentId);
  }
  if (Array.isArray(data.subAgentIds)) {
    ids.push(...data.subAgentIds.filter((id): id is string => typeof id === 'string'));
  }
  if (typeof data.id === 'string' && isSubAgentResultData(data)) {
    ids.push(data.id);
  }
  if (typeof data.taskId === 'string' && isSubAgentResultData(data)) {
    ids.push(data.taskId);
  }

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

  return input.workItems.filter((item): item is SubAgentWorkItem => {
    if (item.kind !== 'subagent' || !linkedIds.has(item.id)) return false;
    if (item.parentToolCallId) return item.parentToolCallId === input.toolCallId;
    return resultLinkedIds.has(item.id);
  });
}

export function selectMessageTaskWorkItems(input: SelectMessageWorkItemsInput): TaskWorkItem[] {
  const ids = input.message.workItemIds;
  if (!input.workItems || !ids || ids.length === 0) return [];

  const linkedIds = new Set(ids);
  return input.workItems.filter(
    (item): item is TaskWorkItem => isTaskWorkItem(item) && linkedIds.has(item.id),
  );
}

export function selectMessageLevelSubAgentWorkItems(
  input: SelectMessageWorkItemsInput,
): SubAgentWorkItem[] {
  const ids = input.message.workItemIds;
  if (!input.workItems || !ids || ids.length === 0) return [];
  if (input.message.contentBlocks?.some((block) => block.type === 'tool_call')) return [];

  const linkedIds = new Set(ids);
  return input.workItems.filter(
    (item): item is SubAgentWorkItem => isSubAgentWorkItem(item) && linkedIds.has(item.id),
  );
}

export function projectConversationWorkItemsFromMessages(
  input: ConversationWorkItemProjectionInput,
): ConversationWorkItemProjectionResult {
  const messages = deriveInlineWorkLinksFromMessages(input.messages);
  const options = { now: input.now };
  const backgroundTaskWorkItems = rehydrateBackgroundTaskWorkItemsFromMessages(
    messages,
    input.conversationId,
    options,
  );
  const subAgentWorkItems = rehydrateSubAgentWorkItemsFromMessages(
    messages,
    input.conversationId,
    options,
  );

  return {
    messages,
    workItems: [...backgroundTaskWorkItems, ...subAgentWorkItems],
    backgroundTaskWorkItems,
    subAgentWorkItems,
  };
}

export function deriveInlineWorkLinksFromMessages(messages: readonly Message[]): Message[] {
  return messages.map((message) => {
    if (!message.contentBlocks || message.contentBlocks.length === 0) return message;

    const workItemIds: string[] = [];

    for (const block of message.contentBlocks) {
      if (block.type !== 'tool_call') continue;
      const data = asRecord(block.toolCall?.result?.data);
      if (!data) continue;

      if (data.backgroundMode === true) {
        workItemIds.push(...extractBackgroundTaskIds(data));
      } else {
        workItemIds.push(...extractSubAgentWorkItemIds(data));
      }
    }

    if (workItemIds.length === 0) return message;

    return {
      ...message,
      workItemIds: dedupeStrings([...(message.workItemIds ?? []), ...workItemIds]),
    };
  });
}

export function rehydrateBackgroundTasksFromMessages(
  messages: readonly Message[],
  options: RehydrateWorkItemsFromMessagesOptions = {},
): AgentBackgroundTask[] {
  return rehydrateBackgroundTaskWorkItemsFromMessages(messages, '', options).map(
    (item) => item.task,
  );
}

function rehydrateBackgroundTaskWorkItemsFromMessages(
  messages: readonly Message[],
  conversationId: string,
  options: RehydrateWorkItemsFromMessagesOptions = {},
): TaskWorkItem[] {
  const items: TaskWorkItem[] = [];

  for (const message of messages) {
    if (!message.contentBlocks || message.contentBlocks.length === 0) continue;

    for (const block of message.contentBlocks) {
      if (block.type !== 'tool_call' || !block.toolCall) continue;
      const task = projectCompletedBackgroundTaskFromToolResult(
        block.toolCall.name,
        block.toolCall.arguments,
        block.toolCall.result?.data,
        options,
      );
      if (!task) continue;

      items.push(
        backgroundTaskToWorkItem(task, conversationId, 'tool-background-task', {
          parentMessageId: message.id,
          parentToolCallId: block.toolCall.id ?? null,
        }),
      );
    }
  }

  return items;
}

export function rehydrateSubAgentWorkItemsFromMessages(
  messages: readonly Message[],
  conversationId: string,
  options: RehydrateWorkItemsFromMessagesOptions = {},
): SubAgentWorkItem[] {
  const items: SubAgentWorkItem[] = [];

  for (const message of messages) {
    if (!message.contentBlocks || message.contentBlocks.length === 0) continue;

    for (const block of message.contentBlocks) {
      if (block.type !== 'tool_call' || !block.toolCall) continue;
      const data = asRecord(block.toolCall.result?.data);
      const ids = extractSubAgentWorkItemIds(data);
      if (ids.length === 0) continue;

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

export function appendMediaTaskMessageToMessages(
  messages: readonly Message[],
  taskId: string,
  options: AppendWorkItemMessageOptions = {},
): Message[] {
  const messageId = `media-task-${taskId}`;
  if (messages.some((message) => message.id === messageId)) return [...messages];

  return [
    ...messages,
    {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp: options.now?.() ?? Date.now(),
      workItemIds: [taskId],
    },
  ];
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
  if (!input.toolCallId) {
    return { messages: [...messages], attached: false };
  }
  const toolCallId = input.toolCallId;

  const targetIndex = messages.findIndex((message) => messageHasToolCall(message, toolCallId));
  if (targetIndex === -1) {
    return { messages: [...messages], attached: false };
  }

  return {
    attached: true,
    messages: messages.map((message, index) => {
      if (index !== targetIndex) return message;
      const workItemIds = dedupeStrings([...(message.workItemIds ?? []), input.workItemId]);
      return { ...message, workItemIds };
    }),
  };
}

function messageHasToolCall(message: WorkItemMessageLinkTarget, toolCallId: string): boolean {
  return Boolean(
    message.contentBlocks?.some(
      (block) => block.type === 'tool_call' && block.toolCall?.id === toolCallId,
    ),
  );
}

function projectCompletedBackgroundTaskFromToolResult(
  toolName: string,
  toolArguments: Record<string, unknown>,
  resultData: unknown,
  options: RehydrateWorkItemsFromMessagesOptions,
): AgentBackgroundTask | null {
  const data = asRecord(resultData);
  if (!data || data.backgroundMode !== true || data.status !== 'completed') return null;

  const taskId = readString(data, 'taskId');
  if (!taskId) return null;

  const scopeResult = validateChildRunScope(data.taskScope);
  if (
    !scopeResult.ok ||
    scopeResult.scope.childKind !== 'task' ||
    scopeResult.scope.childRunId !== taskId
  ) {
    return null;
  }

  const taskScope: TaskRunScope = {
    ...scopeResult.scope,
    childKind: 'task',
  };

  const urls = readStringArray(data, 'urls');
  const singleUrl = readString(data, 'url');
  if (singleUrl) {
    urls.push(singleUrl);
  }
  const dedupedUrls = dedupeStrings(urls);
  const thumbnailUrl = dedupedUrls[0];
  if (!thumbnailUrl) return null;

  const routedTo = asRecord(data.routedTo);
  const prompt =
    readString(data, 'prompt') ??
    readString(data, 'message') ??
    readString(toolArguments, 'prompt') ??
    readString(toolArguments, 'text') ??
    '';
  const providerId = readString(data, 'providerId') ?? readString(routedTo, 'provider') ?? '';
  const providerName =
    readString(data, 'providerName') ?? readString(routedTo, 'model') ?? providerId;
  const timestamp = new Date(options.now?.() ?? Date.now()).toISOString();

  return {
    scope: taskScope,
    id: taskId,
    type: inferAgentWorkItemTaskType(toolName, data),
    name: readString(data, 'name') ?? prompt,
    prompt,
    providerId,
    providerName,
    status: 'completed',
    progress: 100,
    createdAt: timestamp,
    updatedAt: timestamp,
    result: {
      urls: dedupedUrls,
      thumbnailUrl,
    },
  };
}

function extractBackgroundTaskIds(data: Record<string, unknown>): string[] {
  const ids = readStringArray(data, 'taskIds');
  const taskId = readString(data, 'taskId');
  if (taskId) {
    ids.push(taskId);
  }
  return dedupeStrings(ids);
}

function inferAgentWorkItemTaskType(
  toolName: string,
  data: Record<string, unknown>,
): AgentWorkItemTaskType {
  const hints = [readString(data, 'type'), readString(data, 'taskType'), toolName];
  for (const hint of hints) {
    const normalized = hint?.toLowerCase() ?? '';
    if (!normalized) continue;
    if (normalized.includes('video')) return 'video';
    if (
      normalized.includes('audio') ||
      normalized.includes('music') ||
      normalized.includes('speech') ||
      normalized.includes('tts')
    ) {
      return 'audio';
    }
  }

  return 'image';
}

function isSubAgentResultData(data: Record<string, unknown>): boolean {
  const status = data.status;
  return (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

function isTerminalStatus(status: AgentWorkItemTaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
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

function readSubAgentRunMode(
  record: Record<string, unknown> | undefined,
): SubAgentWorkItem['subAgent']['runMode'] | undefined {
  const value = readString(record, 'runMode');
  return value === 'foreground' || value === 'background' ? value : undefined;
}

function readStringArray(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
