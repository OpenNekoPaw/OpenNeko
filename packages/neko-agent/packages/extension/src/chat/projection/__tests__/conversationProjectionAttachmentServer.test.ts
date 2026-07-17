import { describe, expect, it, vi } from 'vitest';
import type {
  AgentTurnTimelineAssistantTextItem,
  ConversationProjectionPatch,
  ConversationProjectionSnapshot,
  ProjectionAttachmentHostFrame,
  ProjectionAttachmentKey,
} from '@neko-agent/types';
import { applyConversationProjectionPatch } from '@neko-agent/types';
import { createConversationProjectionStore } from '@neko/agent/runtime';
import { createConversationProjectionAttachmentServer } from '../conversationProjectionAttachmentServer';

type HostFrame = ProjectionAttachmentHostFrame<
  ConversationProjectionSnapshot,
  ConversationProjectionPatch
>;

const keyA: ProjectionAttachmentKey = {
  endpointEpoch: 'endpoint-1',
  attachmentId: 'attachment-a',
  tabId: 'tab-a',
  conversationId: 'conversation-a',
};

function appendUpdate(content: string, revision: number) {
  const item = {
    conversationId: 'conversation-a',
    turnId: 'turn-a',
    messageId: 'message-a',
    itemId: 'text-a',
    sequence: 1,
    itemRevision: revision,
    kind: 'assistant_text',
    status: 'streaming',
    payload: { content, format: 'markdown', sourceGeneration: 1 },
    createdAt: 1,
    updatedAt: revision,
  } satisfies AgentTurnTimelineAssistantTextItem;
  return {
    type: 'agentTurnTimelineUpdate' as const,
    conversationId: item.conversationId,
    turnId: item.turnId,
    messageId: item.messageId,
    operations: [{ operation: 'append' as const, item }],
  };
}

function completeUpdate(revision: number) {
  return {
    type: 'agentTurnTimelineUpdate' as const,
    conversationId: 'conversation-a',
    turnId: 'turn-a',
    messageId: 'message-a',
    operations: [
      {
        operation: 'complete' as const,
        itemId: 'text-a',
        itemRevision: revision,
        kind: 'assistant_text' as const,
        sourceGeneration: 1,
        status: 'complete' as const,
        updatedAt: revision,
      },
    ],
    completion: { status: 'completed' as const, completedAt: revision },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ConversationProjectionAttachmentServer', () => {
  it('queues projection patches behind the authoritative snapshot until its ACK', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const snapshotDelivery = deferred<boolean>();
    const frames: HostFrame[] = [];
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection: () => projection,
      postMessage: async (frame) => {
        frames.push(frame);
        if (frame.type === 'projectionSnapshot') return snapshotDelivery.promise;
        return true;
      },
      reportError: vi.fn(),
    });

    const attaching = server.attach({ type: 'projectionAttach', key: keyA });
    await nextMicrotask();
    projection.apply(appendUpdate('partial ', 1));
    projection.apply(appendUpdate('exact final content', 2));
    projection.apply(completeUpdate(3));

    expect(frames.map((frame) => frame.type)).toEqual(['projectionSnapshot']);
    snapshotDelivery.resolve(true);
    await attaching;
    expect(frames.map((frame) => frame.type)).toEqual(['projectionSnapshot']);

    await server.acknowledge({
      type: 'projectionSnapshotAck',
      key: keyA,
      sequence: 0,
      projectionVersion: 0,
    });

    expect(frames.map((frame) => frame.type)).toEqual([
      'projectionSnapshot',
      'projectionPatch',
      'projectionPatch',
      'projectionPatch',
    ]);
    expect(frames[1]).toMatchObject({
      type: 'projectionPatch',
      sequence: 1,
      baseProjectionVersion: 0,
      projectionVersion: 1,
    });
    expect(frames[2]).toMatchObject({
      type: 'projectionPatch',
      sequence: 2,
      baseProjectionVersion: 1,
      projectionVersion: 2,
    });
    expect(frames[3]).toMatchObject({
      type: 'projectionPatch',
      sequence: 3,
      baseProjectionVersion: 2,
      projectionVersion: 3,
    });

    const snapshotFrame = frames[0];
    if (snapshotFrame?.type !== 'projectionSnapshot') {
      throw new Error('Expected the attachment to begin with an authoritative snapshot.');
    }
    const finalProjection = frames.slice(1).reduce((current, frame) => {
      if (frame.type !== 'projectionPatch') {
        throw new Error('Expected only contiguous patches after the snapshot ACK.');
      }
      return applyConversationProjectionPatch(current, frame.patch);
    }, snapshotFrame.projection);
    expect(finalProjection).toMatchObject({
      projectionVersion: 3,
      turns: [
        {
          completion: { status: 'completed', completedAt: 3 },
          items: [
            {
              status: 'complete',
              payload: { content: 'partial exact final content' },
            },
          ],
        },
      ],
    });
  });

  it('maintains independent ACK and patch queues for two Tab attachments', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const frames = new Map<string, HostFrame[]>();
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection: () => projection,
      postMessage: async (frame) => {
        const attachmentFrames = frames.get(frame.key.attachmentId) ?? [];
        attachmentFrames.push(frame);
        frames.set(frame.key.attachmentId, attachmentFrames);
        return true;
      },
      reportError: vi.fn(),
    });
    const keyB = { ...keyA, attachmentId: 'attachment-b', tabId: 'tab-b' };

    await Promise.all([
      server.attach({ type: 'projectionAttach', key: keyA }),
      server.attach({ type: 'projectionAttach', key: keyB }),
    ]);
    projection.apply(appendUpdate('a', 1));

    await server.acknowledge({
      type: 'projectionSnapshotAck',
      key: keyB,
      sequence: 0,
      projectionVersion: 0,
    });
    expect(frames.get(keyA.attachmentId)?.map((frame) => frame.type)).toEqual([
      'projectionSnapshot',
    ]);
    expect(frames.get(keyB.attachmentId)?.map((frame) => frame.type)).toEqual([
      'projectionSnapshot',
      'projectionPatch',
    ]);

    await server.acknowledge({
      type: 'projectionSnapshotAck',
      key: keyA,
      sequence: 0,
      projectionVersion: 0,
    });
    expect(frames.get(keyA.attachmentId)?.map((frame) => frame.type)).toEqual([
      'projectionSnapshot',
      'projectionPatch',
    ]);
  });

  it('serializes live patch posting within one attachment', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const firstPatchDelivery = deferred<boolean>();
    const secondPatchPosted = deferred<void>();
    const frames: HostFrame[] = [];
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection: () => projection,
      postMessage: async (frame) => {
        frames.push(frame);
        if (frame.type === 'projectionPatch' && frame.sequence === 1) {
          return firstPatchDelivery.promise;
        }
        if (frame.type === 'projectionPatch' && frame.sequence === 2) {
          secondPatchPosted.resolve();
        }
        return true;
      },
      reportError: vi.fn(),
    });

    await server.attach({ type: 'projectionAttach', key: keyA });
    await server.acknowledge({
      type: 'projectionSnapshotAck',
      key: keyA,
      sequence: 0,
      projectionVersion: 0,
    });
    projection.apply(appendUpdate('a', 1));
    await nextMicrotask();
    projection.apply(appendUpdate('b', 2));
    await nextMicrotask();

    expect(frames.map((frame) => frame.type)).toEqual(['projectionSnapshot', 'projectionPatch']);
    firstPatchDelivery.resolve(true);
    await secondPatchPosted.promise;
    expect(frames.map((frame) => frame.type)).toEqual([
      'projectionSnapshot',
      'projectionPatch',
      'projectionPatch',
    ]);
    await server.detach({ type: 'projectionDetach', key: keyA, reason: 'tab-closed' });
    projection.apply(appendUpdate('c', 3));
    await nextMicrotask();
    expect(frames).toHaveLength(3);
  });

  it('drops queued patch frames when the client closes an attachment', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const firstPatchDelivery = deferred<boolean>();
    const frames: HostFrame[] = [];
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection: () => projection,
      postMessage: async (frame) => {
        frames.push(frame);
        if (frame.type === 'projectionPatch' && frame.sequence === 1) {
          return firstPatchDelivery.promise;
        }
        return true;
      },
      reportError: vi.fn(),
    });

    await server.attach({ type: 'projectionAttach', key: keyA });
    await server.acknowledge({
      type: 'projectionSnapshotAck',
      key: keyA,
      sequence: 0,
      projectionVersion: 0,
    });
    projection.apply(appendUpdate('a', 1));
    await nextMicrotask();
    projection.apply(appendUpdate('b', 2));
    await nextMicrotask();

    const closing = server.detach({
      type: 'projectionDetach',
      key: keyA,
      reason: 'protocol-fatal',
    });
    firstPatchDelivery.resolve(true);
    await closing;

    expect(frames.map((frame) => frame.type)).toEqual(['projectionSnapshot', 'projectionPatch']);
  });

  it('removes a client-detached Tab before accepting its replacement attachment', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const frames: HostFrame[] = [];
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection: () => projection,
      postMessage: async (frame) => {
        frames.push(frame);
        return true;
      },
      reportError: vi.fn(),
    });
    const replacementKey = { ...keyA, attachmentId: 'attachment-replacement' };

    await server.attach({ type: 'projectionAttach', key: keyA });
    const closing = server.detach({
      type: 'projectionDetach',
      key: keyA,
      reason: 'protocol-fatal',
    });
    const replacing = server.attach({ type: 'projectionAttach', key: replacementKey });

    await expect(Promise.all([closing, replacing])).resolves.toEqual([undefined, undefined]);
    expect(frames).toEqual([
      expect.objectContaining({ type: 'projectionSnapshot', key: keyA }),
      expect.objectContaining({ type: 'projectionSnapshot', key: replacementKey }),
    ]);
  });

  it('disposes every attachment at endpoint replacement and rejects later ACKs', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const frames: HostFrame[] = [];
    const resolveProjection = vi.fn(() => projection);
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection,
      postMessage: async (frame) => {
        frames.push(frame);
        return true;
      },
      reportError: vi.fn(),
    });

    await server.attach({ type: 'projectionAttach', key: keyA });
    expect(resolveProjection).toHaveBeenCalledWith('conversation-a');
    await server.dispose();

    expect(frames.at(-1)).toEqual({
      type: 'projectionDetach',
      key: keyA,
      reason: 'endpoint-replaced',
    });
    await expect(
      server.acknowledge({
        type: 'projectionSnapshotAck',
        key: keyA,
        sequence: 0,
        projectionVersion: 0,
      }),
    ).rejects.toThrow('disposed');
  });

  it('abandons a replaced Webview realm without delivering detach frames', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const frames: HostFrame[] = [];
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection: () => projection,
      postMessage: async (frame) => {
        frames.push(frame);
        return true;
      },
      reportError: vi.fn(),
    });

    await server.attach({ type: 'projectionAttach', key: keyA });
    await server.abandon();

    expect(frames.map((frame) => frame.type)).toEqual(['projectionSnapshot']);
    await expect(server.attach({ type: 'projectionAttach', key: keyA })).rejects.toThrow(
      'disposed',
    );
  });

  it('rejects an ACK from a different attachment without releasing queued patches', async () => {
    const projection = createConversationProjectionStore('conversation-a');
    const frames: HostFrame[] = [];
    const reportError = vi.fn();
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch: 'endpoint-1',
      resolveProjection: () => projection,
      postMessage: async (frame) => {
        frames.push(frame);
        return true;
      },
      reportError,
    });

    await server.attach({ type: 'projectionAttach', key: keyA });
    projection.apply(appendUpdate('a', 1));

    await expect(
      server.acknowledge({
        type: 'projectionSnapshotAck',
        key: { ...keyA, tabId: 'wrong-tab' },
        sequence: 0,
        projectionVersion: 0,
      }),
    ).rejects.toThrow('attachment identity');
    expect(frames.map((frame) => frame.type)).toEqual(['projectionSnapshot']);
    expect(reportError).not.toHaveBeenCalled();
  });
});
