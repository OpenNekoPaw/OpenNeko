import type { Message } from '@neko/agent-contracts';
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
      source: 'local',
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
      source: 'local',
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

  it('retains a pending user message across empty Host snapshots and replaces it on acknowledgement', () => {
    const coordinator = new ConversationRenderCoordinator();
    ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [
        {
          id: 'pending-send:1',
          role: 'user',
          content: 'keep this visible',
          timestamp: 1,
        },
      ],
      source: 'local',
      streaming: {
        streamingMessageId: null,
        isThinking: true,
      },
    });

    const empty = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [],
      source: 'host',
      streaming: {
        streamingMessageId: null,
        isThinking: false,
      },
    });
    expect(empty.messages.map((message) => message.id)).toEqual(['pending-send:1']);

    const acknowledged = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [
        {
          id: 'pi-message-1',
          role: 'user',
          content: 'keep this visible',
          timestamp: 2,
        },
      ],
      source: 'host',
      streaming: {
        streamingMessageId: null,
        isThinking: true,
      },
    });
    expect(acknowledged.messages.map((message) => message.id)).toEqual(['pi-message-1']);
  });

  it('retains a pending user message when an assistant-only Host projection completes', () => {
    const coordinator = new ConversationRenderCoordinator();
    ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [
        {
          id: 'pending-send:assistant-only',
          role: 'user',
          content: 'keep my prompt in the transcript',
          timestamp: 1,
        },
      ],
      source: 'local',
      streaming: {
        streamingMessageId: null,
        isThinking: true,
      },
    });

    const completed = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [
        {
          id: 'assistant-message-1',
          role: 'assistant',
          content: 'response',
          timestamp: 2,
        },
      ],
      source: 'host',
      streaming: {
        streamingMessageId: null,
        isThinking: false,
      },
    });

    expect(completed.messages.map((message) => message.id)).toEqual([
      'pending-send:assistant-only',
      'assistant-message-1',
    ]);
  });

  it('does not acknowledge a pending message from an older user message with identical content', () => {
    const coordinator = new ConversationRenderCoordinator();
    const olderMessage: Message = {
      id: 'pi-message-old',
      role: 'user',
      content: 'repeat this',
      timestamp: 1,
    };
    ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [
        olderMessage,
        {
          id: 'pending-send:2',
          role: 'user',
          content: 'repeat this',
          timestamp: 2,
        },
      ],
      source: 'local',
      streaming: {
        streamingMessageId: null,
        isThinking: true,
      },
    });

    const unchangedHost = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [olderMessage],
      source: 'host',
      streaming: {
        streamingMessageId: null,
        isThinking: true,
      },
    });
    expect(unchangedHost.messages.map((message) => message.id)).toEqual([
      'pi-message-old',
      'pending-send:2',
    ]);

    const acknowledgedHost = ingestConversationRenderSnapshot({
      coordinator,
      conversationId: 'conv-a',
      messages: [
        olderMessage,
        {
          id: 'pi-message-new',
          role: 'user',
          content: 'repeat this',
          timestamp: 3,
        },
      ],
      source: 'host',
      streaming: {
        streamingMessageId: null,
        isThinking: true,
      },
    });
    expect(acknowledgedHost.messages.map((message) => message.id)).toEqual([
      'pi-message-old',
      'pi-message-new',
    ]);
  });
});
