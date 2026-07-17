import { describe, expect, it, vi } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ProjectionAttachmentKey,
} from '@neko-agent/types';
import { createConversationProjectionReplica } from '../conversation-projection-replica';
import {
  createProjectionAttachmentClient,
  type ConversationProjectionAttachmentFrame,
  type ProjectionAttachmentClientMessage,
} from '../projection-attachment-client';

const keyA: ProjectionAttachmentKey = {
  endpointEpoch: 'endpoint-1',
  attachmentId: 'attachment-a',
  tabId: 'tab-a',
  conversationId: 'conversation-a',
};

function emptySnapshot(version = 0): ConversationProjectionSnapshot {
  return {
    conversationId: 'conversation-a',
    projectionVersion: version,
    turns: [],
  };
}

function appendPatch(
  content: string,
  baseProjectionVersion: number,
  projectionVersion: number,
): ConversationProjectionPatch {
  const item = assistantTextItem(content, projectionVersion, 'conversation-a');
  return {
    type: 'conversationProjectionPatch',
    conversationId: 'conversation-a',
    baseProjectionVersion,
    projectionVersion,
    turnId: 'turn-a',
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
  client.attach({ endpointEpoch: key.endpointEpoch, attachmentId: key.attachmentId });
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
    projectionVersion: projection.projectionVersion,
    projection,
  };
}

describe('ProjectionAttachmentClient', () => {
  it('installs the authoritative snapshot before acknowledging and then applies contiguous patches', () => {
    const { client, replica, messages } = createClient();

    client.accept(snapshotFrame(keyA));
    const patch = appendPatch('hello', 0, 1);
    client.accept({
      type: 'projectionPatch',
      key: keyA,
      sequence: 1,
      baseProjectionVersion: 0,
      projectionVersion: 1,
      patch,
    });

    expect(messages).toEqual([
      { type: 'projectionAttach', key: keyA },
      {
        type: 'projectionSnapshotAck',
        key: keyA,
        sequence: 0,
        projectionVersion: 0,
      },
    ]);
    expect(replica.getSnapshot().projection).toMatchObject({
      conversationId: 'conversation-a',
      projectionVersion: 1,
      turns: [{ items: [{ payload: { content: 'hello' } }] }],
    });
    expect(client.getSnapshot()).toMatchObject({
      phase: 'live',
      lastSequence: 1,
      projectionVersion: 1,
    });
  });

  it('rejects endpoint, attachment, Tab, and conversation identity mismatches without mutating the replica', () => {
    const mismatches: ProjectionAttachmentKey[] = [
      { ...keyA, endpointEpoch: 'endpoint-old' },
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
    const gap = appendPatch('gap', 0, 1);

    expect(() =>
      client.accept({
        type: 'projectionPatch',
        key: keyA,
        sequence: 2,
        baseProjectionVersion: 0,
        projectionVersion: 1,
        patch: gap,
      }),
    ).toThrow(/frame gap/);
    expect(client.getSnapshot().phase).toBe('fatal');
    expect(replica.getSnapshot().projection?.projectionVersion).toBe(0);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('makes patch base/version mismatches fatal before changing the replica', () => {
    const { client, replica } = createClient();
    client.accept(snapshotFrame(keyA));
    const patch = appendPatch('wrong-base', 1, 2);

    expect(() =>
      client.accept({
        type: 'projectionPatch',
        key: keyA,
        sequence: 1,
        baseProjectionVersion: 1,
        projectionVersion: 2,
        patch,
      }),
    ).toThrow(/patch base\/version mismatch/);
    expect(replica.getSnapshot().projection?.projectionVersion).toBe(0);
  });

  it('makes projection operation contract failures fatal without partial replica mutation', () => {
    const { client, replica, reportError } = createClient();
    client.accept(snapshotFrame(keyA));
    const invalid = appendPatch('invalid owner', 0, 1);

    expect(() =>
      client.accept({
        type: 'projectionPatch',
        key: keyA,
        sequence: 1,
        baseProjectionVersion: 0,
        projectionVersion: 1,
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
    expect(replica.getSnapshot().projection?.projectionVersion).toBe(0);
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
      baseProjectionVersion: 0,
      projectionVersion: 1,
      patch: appendPatch('only-a', 0, 1),
    });

    expect(a.replica).not.toBe(b.replica);
    expect(a.replica.getSnapshot().projection?.projectionVersion).toBe(1);
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
