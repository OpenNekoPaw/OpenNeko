import { describe, expect, it } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  AgentTurnTimelineToolCallItem,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
} from '@neko/agent-contracts';
import {
  createConversationProjectionReplica,
  type ConversationProjectionPublicationScheduler,
} from '../conversation-projection-replica';

const CONVERSATION_ID = 'conversation-a';

function textItem(
  content: string,
  updatedAt: number,
  conversationId: string = CONVERSATION_ID,
): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId,
    turnId: 'turn-a',
    runId: 'run-a',
    messageId: 'message-a',
    itemId: 'text-a',
    sequence: 1,
    kind: 'assistant_text',
    status: 'streaming',
    createdAt: 1,
    updatedAt,
    payload: { content },
  };
}

function appendPatch(
  content: string,
  updatedAt: number,
  conversationId: string = CONVERSATION_ID,
): ConversationProjectionPatch {
  return {
    type: 'conversationProjectionPatch',
    conversationId,
    turnId: 'turn-a',
    runId: 'run-a',
    messageId: 'message-a',
    operations: [{ operation: 'append', item: textItem(content, updatedAt, conversationId) }],
  };
}

function completionPatch(updatedAt: number): ConversationProjectionPatch {
  return {
    type: 'conversationProjectionPatch',
    conversationId: CONVERSATION_ID,
    turnId: 'turn-a',
    runId: 'run-a',
    messageId: 'message-a',
    operations: [
      {
        operation: 'complete',
        itemId: 'text-a',
        kind: 'assistant_text',
        status: 'complete',
        updatedAt,
      },
    ],
    completion: { status: 'completed', completedAt: updatedAt },
  };
}

function toolUpsertPatch(updatedAt: number): ConversationProjectionPatch {
  const item: AgentTurnTimelineToolCallItem = {
    conversationId: CONVERSATION_ID,
    turnId: 'turn-a',
    runId: 'run-a',
    messageId: 'message-a',
    itemId: 'tool-read',
    sequence: 2,
    kind: 'tool_call',
    status: 'pending',
    createdAt: 1,
    updatedAt,
    payload: { toolCall: { id: 'read', name: 'ReadFile', arguments: {} } },
  };
  return {
    type: 'conversationProjectionPatch',
    conversationId: CONVERSATION_ID,
    turnId: 'turn-a',
    runId: 'run-a',
    messageId: 'message-a',
    operations: [{ operation: 'upsert', item }],
  };
}

function snapshotWithTurn(
  content: string,
  conversationId: string = CONVERSATION_ID,
): ConversationProjectionSnapshot {
  return {
    conversationId,
    turns: [
      {
        turnId: 'turn-a',
        runId: 'run-a',
        messageId: 'message-a',
        items: [textItem(content, 1, conversationId)],
      },
    ],
  };
}

function createManualScheduler(): {
  schedule: ConversationProjectionPublicationScheduler;
  flush(): void;
  hasPending(): boolean;
} {
  let pending: (() => void) | undefined;
  const cancel = (): void => {
    pending = undefined;
  };
  return {
    schedule(callback) {
      pending = callback;
      return cancel;
    },
    flush() {
      const callback = pending;
      pending = undefined;
      callback?.();
    },
    hasPending() {
      return pending !== undefined;
    },
  };
}

function readContent(replica: ReturnType<typeof createConversationProjectionReplica>): unknown {
  const item = replica.getSnapshot().projection?.turns[0]?.items[0];
  if (!item || (item.kind !== 'assistant_text' && item.kind !== 'thinking')) return undefined;
  return item.payload.content;
}

describe('ConversationProjectionReplica bounded presentation', () => {
  it('coalesces streaming append notifications while keeping the authoritative snapshot complete', () => {
    const scheduler = createManualScheduler();
    const replica = createConversationProjectionReplica(CONVERSATION_ID, {
      scheduleStreamingPublication: scheduler.schedule,
    });
    const notifications: unknown[] = [];
    replica.subscribe(() => notifications.push(readContent(replica)));

    replica.installSnapshot(snapshotWithTurn('first'));

    const deltas = Array.from({ length: 200 }, (_, index) => `-t${index}`);
    for (let index = 0; index < deltas.length; index += 1) {
      replica.applyPatch(appendPatch(deltas[index] ?? '', index + 2));
    }

    expect(notifications).toHaveLength(1);
    expect(scheduler.hasPending()).toBe(true);
    expect(readContent(replica)).toBe(`first${deltas.join('')}`);

    scheduler.flush();

    expect(notifications).toHaveLength(2);
    expect(notifications[1]).toBe(`first${deltas.join('')}`);
  });

  it('flushes immediately when a completion patch arrives and does not lose coalesced content', () => {
    const scheduler = createManualScheduler();
    const replica = createConversationProjectionReplica(CONVERSATION_ID, {
      scheduleStreamingPublication: scheduler.schedule,
    });
    const notifications: unknown[] = [];
    replica.subscribe(() => notifications.push(readContent(replica)));

    replica.installSnapshot(snapshotWithTurn('first'));
    replica.applyPatch(appendPatch('-suffix', 2));
    expect(scheduler.hasPending()).toBe(true);

    replica.applyPatch(completionPatch(3));

    expect(scheduler.hasPending()).toBe(false);
    expect(notifications).toHaveLength(2);
    expect(readContent(replica)).toBe('first-suffix');
    expect(replica.getSnapshot().projection?.turns[0]?.completion).toMatchObject({
      status: 'completed',
    });
  });

  it('flushes non-append patches immediately instead of coalescing them', () => {
    const scheduler = createManualScheduler();
    const replica = createConversationProjectionReplica(CONVERSATION_ID, {
      scheduleStreamingPublication: scheduler.schedule,
    });
    const notifications: unknown[] = [];
    replica.subscribe(() => notifications.push(readContent(replica)));

    replica.installSnapshot(snapshotWithTurn('first'));
    replica.applyPatch(appendPatch('-streaming', 2));
    expect(scheduler.hasPending()).toBe(true);

    replica.applyPatch(toolUpsertPatch(3));

    expect(scheduler.hasPending()).toBe(false);
    expect(notifications).toHaveLength(2);
    expect(replica.getSnapshot().projection?.turns[0]?.items).toHaveLength(2);
  });

  it('cancels a pending coalesced flush on dispose without notifying removed subscribers', () => {
    const scheduler = createManualScheduler();
    const replica = createConversationProjectionReplica(CONVERSATION_ID, {
      scheduleStreamingPublication: scheduler.schedule,
    });
    let notifications = 0;
    replica.subscribe(() => {
      notifications += 1;
    });

    replica.installSnapshot(snapshotWithTurn('first'));
    replica.applyPatch(appendPatch('-streaming', 2));
    expect(scheduler.hasPending()).toBe(true);

    replica.dispose();
    scheduler.flush();

    expect(notifications).toBe(1);
    expect(() => replica.subscribe(() => undefined)).toThrow(/disposed/);
  });

  it('keeps coalescing per replica so one conversation cannot block or notify another', () => {
    const schedulerA = createManualScheduler();
    const schedulerB = createManualScheduler();
    const replicaA = createConversationProjectionReplica('conversation-a', {
      scheduleStreamingPublication: schedulerA.schedule,
    });
    const replicaB = createConversationProjectionReplica('conversation-b', {
      scheduleStreamingPublication: schedulerB.schedule,
    });
    let notificationsA = 0;
    let notificationsB = 0;
    replicaA.subscribe(() => {
      notificationsA += 1;
    });
    replicaB.subscribe(() => {
      notificationsB += 1;
    });

    replicaA.installSnapshot(snapshotWithTurn('a', 'conversation-a'));
    replicaB.installSnapshot(snapshotWithTurn('b', 'conversation-b'));
    replicaA.applyPatch(appendPatch('-streaming-a', 2, 'conversation-a'));
    replicaB.applyPatch(appendPatch('-streaming-b', 2, 'conversation-b'));

    expect(schedulerA.hasPending()).toBe(true);
    expect(schedulerB.hasPending()).toBe(true);

    schedulerA.flush();

    expect(notificationsA).toBe(2);
    expect(notificationsB).toBe(1);
    expect(schedulerB.hasPending()).toBe(true);

    schedulerB.flush();
    expect(notificationsB).toBe(2);
  });
});
