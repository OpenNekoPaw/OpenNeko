import type { AgentQueuedMessageItem } from '@neko/agent-contracts';

const OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX = 'optimistic:';

export function isOptimisticQueuedMessageItem(item: Pick<AgentQueuedMessageItem, 'id'>): boolean {
  return item.id.startsWith(OPTIMISTIC_QUEUED_MESSAGE_ID_PREFIX);
}
