import { describe, expect, it } from 'vitest';
import { ConversationRenderCoordinator } from './conversation-render-coordinator';
import { ingestConversationRenderSnapshot } from './conversation-render-state-adapter';

describe('conversation render state adapter', () => {
  it('commits each conversation only to the canonical coordinator snapshot', () => {
    const coordinator = new ConversationRenderCoordinator();
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

    expect(coordinator.read('conv-a')).toBe(snapshotA);
    expect(coordinator.read('conv-b')?.streaming).toMatchObject({
      streamingMessageId: 'message-b',
      queuedMessageCount: 2,
    });
    expect(coordinator.read('conv-b')).toBe(snapshotB);
    expect(coordinator.isDisposed('conv-a')).toBe(false);
  });
});
