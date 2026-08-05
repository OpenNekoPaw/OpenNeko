import { describe, expect, it, vi } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ProjectionAttachmentKey,
} from '@neko/agent-contracts';
import { createConversationProjectionReplica } from '../conversation-projection-replica';
import {
  createProjectionAttachmentClient,
  type ConversationProjectionAttachmentFrame,
  type ProjectionAttachmentClientMessage,
} from '../projection-attachment-client';

const keyA: ProjectionAttachmentKey = {
  attachmentId: 'attachment-a',
  tabId: 'tab-a',
  conversationId: 'conversation-a',
};

function emptySnapshot(): ConversationProjectionSnapshot {
  return {
    conversationId: 'conversation-a',
    turns: [],
  };
}

function appendPatch(content: string, itemRevision: number): ConversationProjectionPatch {
  const item = assistantTextItem(content, itemRevision, 'conversation-a');
  return {
    type: 'conversationProjectionPatch',
    conversationId: 'conversation-a',
    turnId: 'turn-a',

    runId: 'run-a',
    messageId: 'message-a',
    operations: [{ operation: 'append', item }],
  };
}

function assistantTextItem(
  content: string,
  itemRevision: number,
  conversationId: string,
): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId,
    turnId: 'turn-a',

    runId: 'run-a',
    messageId: 'message-a',
    itemId: 'text-a',
    sequence: 1,
    itemRevision,
    kind: 'assistant_text',
    status: 'streaming',
    createdAt: 1,
    updatedAt: itemRevision,
    payload: { content, sourceGeneration: 1 },
  };
}

function createClient(key: ProjectionAttachmentKey = keyA) {
  const replica = createConversationProjectionReplica(key.conversationId);
  const messages: ProjectionAttachmentClientMessage[] = [];
  const reportError = vi.fn();
  const client = createProjectionAttachmentClient({
    tabId: key.tabId,
    conversationId: key.conversationId,
    replica,
    send: (message) => messages.push(message),
    reportError,
  });
  client.attach({ attachmentId: key.attachmentId });
  return { client, replica, messages, reportError };
}

function snapshotFrame(
  key: ProjectionAttachmentKey,
  projection = emptySnapshot(),
): ConversationProjectionAttachmentFrame {
  return {
    type: 'projectionSnapshot',
    key,
    sequence: 0,
    projection,
  };
}

describe('ProjectionAttachmentClient', () => {
  it('installs the authoritative snapshot before acknowledging and then applies contiguous patches', () => {
    const { client, replica, messages } = createClient();

    client.accept(snapshotFrame(keyA));
    const patch = appendPatch('hello', 1);
    client.accept({
      type: 'projectionPatch',
      key: keyA,
      sequence: 1,
      patch,
    });

    expect(messages).toEqual([
      { type: 'projectionAttach', key: keyA },
      {
        type: 'projectionSnapshotAck',
        key: keyA,
        sequence: 0,
      },
    ]);
    expect(replica.getSnapshot().projection).toMatchObject({
      conversationId: 'conversation-a',
      turns: [{ items: [{ payload: { content: 'hello' } }] }],
    });
    expect(client.getSnapshot()).toMatchObject({
      phase: 'live',
      lastSequence: 1,
    });
  });

  it('rejects attachment, Tab, and conversation identity mismatches without mutating the replica', () => {
    const mismatches: ProjectionAttachmentKey[] = [
      { ...keyA, attachmentId: 'attachment-other' },
      { ...keyA, tabId: 'tab-other' },
      { ...keyA, conversationId: 'conversation-other' },
    ];

    for (const key of mismatches) {
      const { client, replica, reportError } = createClient();
      expect(() => client.accept(snapshotFrame(key))).toThrow(/identity mismatch/);
      expect(replica.getSnapshot().projection).toBeNull();
      expect(client.getSnapshot().phase).toBe('awaiting-snapshot');
      expect(reportError).not.toHaveBeenCalled();
    }
  });

  it('makes sequence gaps fatal and leaves the last valid projection unchanged', () => {
    const { client, replica, reportError } = createClient();
    client.accept(snapshotFrame(keyA));
    const gap = appendPatch('gap', 1);

    expect(() =>
      client.accept({
        type: 'projectionPatch',
        key: keyA,
        sequence: 2,
        patch: gap,
      }),
    ).toThrow(/frame gap/);
    expect(client.getSnapshot().phase).toBe('fatal');
    expect(replica.getSnapshot().projection?.turns).toEqual([]);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('makes patch owner mismatches fatal before changing the replica', () => {
    const { client, replica } = createClient();
    client.accept(snapshotFrame(keyA));
    const patch = { ...appendPatch('wrong-owner', 1), conversationId: 'conversation-b' };

    expect(() =>
      client.accept({
        type: 'projectionPatch',
        key: keyA,
        sequence: 1,
        patch,
      }),
    ).toThrow(/patch owner mismatch/);
    expect(replica.getSnapshot().projection?.turns).toEqual([]);
  });

  it('makes projection operation contract failures fatal without partial replica mutation', () => {
    const { client, replica, reportError } = createClient();
    client.accept(snapshotFrame(keyA));
    const invalid = appendPatch('invalid owner', 1);

    expect(() =>
      client.accept({
        type: 'projectionPatch',
        key: keyA,
        sequence: 1,
        patch: {
          ...invalid,
          operations: [
            {
              operation: 'append',
              item: assistantTextItem('invalid owner', 1, 'conversation-other'),
            },
          ],
        },
      }),
    ).toThrow(/rejected its live patch/);
    expect(client.getSnapshot().phase).toBe('fatal');
    expect(replica.getSnapshot().projection?.turns).toEqual([]);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('keeps two Tab replicas and acknowledgement state independent for one conversation', () => {
    const keyB = { ...keyA, attachmentId: 'attachment-b', tabId: 'tab-b' };
    const a = createClient(keyA);
    const b = createClient(keyB);

    a.client.accept(snapshotFrame(keyA));
    a.client.accept({
      type: 'projectionPatch',
      key: keyA,
      sequence: 1,
      patch: appendPatch('only-a', 1),
    });

    expect(a.replica).not.toBe(b.replica);
    expect(a.replica.getSnapshot().projection?.turns).toHaveLength(1);
    expect(b.replica.getSnapshot().projection).toBeNull();
    expect(a.client.getSnapshot().phase).toBe('live');
    expect(b.client.getSnapshot().phase).toBe('awaiting-snapshot');
    expect(b.messages).toEqual([{ type: 'projectionAttach', key: keyB }]);
  });

  it('stops accepting frames after disposal and detaches the exact active attachment', () => {
    const { client, messages } = createClient();

    client.dispose();

    expect(messages.at(-1)).toEqual({ type: 'projectionDetach', key: keyA, reason: 'tab-closed' });
    expect(() => client.accept(snapshotFrame(keyA))).toThrow(/disposed/);
  });
});
