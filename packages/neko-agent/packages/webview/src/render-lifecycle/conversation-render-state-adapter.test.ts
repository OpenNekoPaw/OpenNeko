import { describe, expect, it } from 'vitest';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';
import {
  commitConversationSnapshotProjection,
  discardConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from './conversation-render-state-adapter';

describe('conversation render state adapter', () => {
  it('discards only the selected transitional projection without disposing canonical snapshots', () => {
    const coordinator = new ConversationRenderCoordinator();
    const conversationMessagesRef = { current: new Map() };
    const conversationStreamingRef = { current: new Map() };
    const snapshotA = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [],
      streaming: {
        streamingMessageId: 'message-a',
        isThinking: true,
        queuedMessageCount: 1,
        queuedMessages: [],
      },
    });
    const snapshotB = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-b',
      messages: [],
      streaming: {
        streamingMessageId: 'message-b',
        isThinking: false,
        queuedMessageCount: 2,
        queuedMessages: [],
      },
    });

    commitConversationSnapshotProjection({
      snapshot: snapshotA,
      conversationMessagesRef,
      conversationStreamingRef,
    });
    commitConversationSnapshotProjection({
      snapshot: snapshotB,
      conversationMessagesRef,
      conversationStreamingRef,
    });
    discardConversationSnapshotProjection({
      conversationId: 'conv-a',
      conversationMessagesRef,
      conversationStreamingRef,
    });

    expect(conversationMessagesRef.current.has('conv-a')).toBe(false);
    expect(conversationStreamingRef.current.has('conv-a')).toBe(false);
    expect(conversationMessagesRef.current.get('conv-b')).toEqual([]);
    expect(conversationStreamingRef.current.get('conv-b')).toMatchObject({
      streamingMessageId: 'message-b',
      queuedMessageCount: 2,
    });
    expect(coordinator.read('conv-a')).toBe(snapshotA);
    expect(coordinator.read('conv-b')).toBe(snapshotB);
    expect(coordinator.isDisposed('conv-a')).toBe(false);
  });
});
