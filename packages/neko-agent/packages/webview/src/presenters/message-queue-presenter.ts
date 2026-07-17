import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';

const OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX = 'optimistic:';
const QUEUE_MIRROR_MATCH_WINDOW_MS = 30_000;

export interface QueuedMessageReleaseInput {
  messages: readonly Message[];
  previousQueuedMessageCount: number;
  nextQueuedMessageCount: number;
}

export interface ReleasedQueuedMessageProjectionInput {
  messages: readonly Message[];
  item: AgentQueuedMessageItem;
}

export interface AuthoritativeQueuedMessagesProjectionInput {
  messages: readonly Message[];
  items: readonly AgentQueuedMessageItem[];
}

export function projectQueuedMessagesForPendingCount(input: QueuedMessageReleaseInput): Message[] {
  const releaseCount = Math.max(0, input.previousQueuedMessageCount - input.nextQueuedMessageCount);

  if (releaseCount === 0) {
    return [...input.messages];
  }

  const releasedMessages: Message[] = [];
  const remainingMessages: Message[] = [];
  let remainingReleaseCount = releaseCount;

  for (const message of input.messages) {
    if (remainingReleaseCount > 0 && isQueuedUserMessage(message)) {
      const releasedMessage: Message = { ...message };
      delete releasedMessage.isQueued;
      releasedMessages.push(releasedMessage);
      remainingReleaseCount -= 1;
      continue;
    }

    remainingMessages.push(message);
  }

  return [...remainingMessages, ...releasedMessages];
}

export function projectQueuedMessagesCleared(messages: readonly Message[]): Message[] {
  return messages.filter((message) => !isQueuedUserMessage(message));
}

export function projectAuthoritativeQueuedMessagesIntoTranscript(
  input: AuthoritativeQueuedMessagesProjectionInput,
): Message[] {
  const withoutPendingItems = projectQueuedMessagesCleared(input.messages);
  if (input.items.length === 0) {
    return withoutPendingItems;
  }

  return removeTrailingVisibleQueueMirrors(withoutPendingItems, input.items);
}

export function projectReleasedQueuedMessageIntoTranscript(
  input: ReleasedQueuedMessageProjectionInput,
): Message[] {
  const withoutPendingItems = removeTrailingVisibleQueueMirrors(
    projectQueuedMessagesCleared(input.messages),
    [input.item],
  );

  switch (input.item.source) {
    case 'task-result-continuation':
    case 'subagent-result-continuation':
    case 'system-continuation':
    case 'user':
      return withoutPendingItems;
    case 'composer':
      return projectReleasedComposerMessage(withoutPendingItems, input.item);
    default:
      return assertNeverQueuedMessageSource(input.item.source);
  }
}

function projectReleasedComposerMessage(
  messages: readonly Message[],
  item: AgentQueuedMessageItem,
): Message[] {
  const releasedMessageId = buildReleasedQueuedMessageId(item.id);
  if (
    messages.some(
      (message) =>
        message.id === releasedMessageId ||
        (message.role === 'user' &&
          message.content === item.content &&
          message.timestamp === item.createdAt),
    )
  ) {
    return [...messages];
  }

  return [
    ...messages,
    {
      id: releasedMessageId,
      role: 'user',
      content: item.content,
      timestamp: item.createdAt,
    },
  ];
}

export function hasQueuedUserMessages(messages: readonly Message[]): boolean {
  return messages.some(isQueuedUserMessage);
}

export function projectOptimisticQueuedMessageItem(input: {
  readonly conversationId: string;
  readonly message: Message;
}): AgentQueuedMessageItem | null {
  if (!isQueuedUserMessage(input.message)) {
    return null;
  }
  return {
    id: `${OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX}${input.message.id}`,
    conversationId: input.conversationId,
    content: input.message.content,
    createdAt: input.message.timestamp,
    source: 'composer',
  };
}

export function isOptimisticQueuedMessageItem(item: Pick<AgentQueuedMessageItem, 'id'>): boolean {
  return item.id.startsWith(OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX);
}

function isQueuedUserMessage(message: Message): boolean {
  return message.role === 'user' && message.isQueued === true;
}

function removeTrailingVisibleQueueMirrors(
  messages: readonly Message[],
  items: readonly AgentQueuedMessageItem[],
): Message[] {
  if (messages.length === 0 || items.length === 0) {
    return [...messages];
  }

  const nextMessages = [...messages];
  let itemIndex = items.length - 1;

  while (nextMessages.length > 0 && itemIndex >= 0) {
    const lastMessage = nextMessages[nextMessages.length - 1];
    const item = items[itemIndex];
    if (!lastMessage || !item || !isVisibleQueueMirrorMessage(lastMessage, item)) {
      break;
    }

    nextMessages.pop();
    itemIndex -= 1;
  }

  return nextMessages;
}

function isVisibleQueueMirrorMessage(message: Message, item: AgentQueuedMessageItem): boolean {
  return (
    item.source === 'composer' &&
    message.role === 'user' &&
    message.isQueued !== true &&
    message.id !== buildReleasedQueuedMessageId(item.id) &&
    message.content === item.content &&
    isQueueMirrorTimestamp(message.timestamp, item.createdAt)
  );
}

function isQueueMirrorTimestamp(messageTimestamp: number, itemCreatedAt: number): boolean {
  return Math.abs(itemCreatedAt - messageTimestamp) <= QUEUE_MIRROR_MATCH_WINDOW_MS;
}

function assertNeverQueuedMessageSource(source: never): never {
  throw new Error(`Unsupported queued message source: ${String(source)}`);
}

function buildReleasedQueuedMessageId(queueItemId: string): string {
  return `released:${queueItemId}`;
}
