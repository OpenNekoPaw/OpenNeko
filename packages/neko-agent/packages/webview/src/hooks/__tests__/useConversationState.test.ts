import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Message } from '@neko-agent/types';
import { useConversationState } from '../useConversationState';

function createMessage(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    timestamp: 1,
  };
}

describe('useConversationState', () => {
  it('commits conversation-scoped mutations without projecting a hidden conversation into foreground state', () => {
    const { result } = renderHook(() => useConversationState());
    const messageA = createMessage('message-a', 'conversation A');
    const messageB = createMessage('message-b', 'conversation B');

    act(() => {
      result.current.setActiveConversationId('conversation-a');
      result.current.updateConversationRenderState('conversation-a', (_messages, streaming) => ({
        messages: [messageA],
        streaming: { ...streaming, isThinking: true, streamingMessageId: 'stream-a' },
      }));
    });

    expect(result.current.activeConversationIdRef.current).toBe('conversation-a');
    expect(result.current.messages).toEqual([messageA]);
    expect(result.current.streamingMessageIdRef.current).toBe('stream-a');

    act(() => {
      result.current.updateConversationRenderState('conversation-b', (messages, streaming) => ({
        messages: [...messages, messageB],
        streaming: { ...streaming, isThinking: false, streamingMessageId: null },
      }));
    });

    expect(result.current.conversationMessagesRef.current.get('conversation-b')).toEqual([
      messageB,
    ]);
    expect(result.current.messages).toEqual([messageA]);
    expect(result.current.streamingMessageId).toBe('stream-a');
    expect(result.current.isThinking).toBe(true);
  });

  it('computes sequential mutations from the committed conversation projection', () => {
    const { result } = renderHook(() => useConversationState());
    const first = createMessage('message-1', 'first');
    const second = createMessage('message-2', 'second');

    act(() => {
      result.current.setActiveConversationId('conversation-a');
      result.current.updateConversationRenderState('conversation-a', () => ({
        messages: [first],
        streaming: {
          streamingMessageId: null,
          isThinking: false,
          queuedMessageCount: 0,
          queuedMessages: [],
        },
      }));
      result.current.updateConversationRenderState('conversation-a', (messages, streaming) => ({
        messages: [...messages, second],
        streaming,
      }));
    });

    expect(result.current.messages).toEqual([first, second]);
    expect(result.current.conversationMessagesRef.current.get('conversation-a')).toEqual([
      first,
      second,
    ]);
  });

  it('clears the active conversation through one explicit render-state transaction', () => {
    const { result } = renderHook(() => useConversationState());

    act(() => {
      result.current.setActiveConversationId('conversation-a');
      result.current.updateConversationRenderState('conversation-a', () => ({
        messages: [createMessage('message-1', 'first')],
        streaming: {
          streamingMessageId: 'stream-a',
          isThinking: true,
          queuedMessageCount: 2,
          queuedMessages: [],
        },
      }));
      result.current.updateConversationRenderState('conversation-a', () => ({
        messages: [],
        streaming: {
          streamingMessageId: null,
          isThinking: false,
          queuedMessageCount: 0,
          queuedMessages: [],
        },
      }));
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.streamingMessageId).toBeNull();
    expect(result.current.streamingMessageIdRef.current).toBeNull();
    expect(result.current.isThinking).toBe(false);
    expect(result.current.queuedMessageCount).toBe(0);
    expect(result.current.conversationMessagesRef.current.get('conversation-a')).toEqual([]);
    expect(result.current.conversationRenderCoordinator.read('conversation-a')?.revision).toBe(2);
  });

  it('clears tabless visible state without deleting the detached conversation projection', () => {
    const { result } = renderHook(() => useConversationState());
    const retained = createMessage('message-1', 'retained');

    act(() => {
      result.current.setActiveConversationId('conversation-a');
      result.current.updateConversationRenderState('conversation-a', () => ({
        messages: [retained],
        streaming: {
          streamingMessageId: 'stream-a',
          isThinking: true,
          queuedMessageCount: 0,
          queuedMessages: [],
        },
      }));
      result.current.setActiveConversationId(null);
      result.current.clearVisibleState();
    });

    expect(result.current.activeConversationIdRef.current).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.isThinking).toBe(false);
    expect(result.current.conversationMessagesRef.current.get('conversation-a')).toEqual([
      retained,
    ]);
    expect(result.current.conversationRenderCoordinator.read('conversation-a')?.revision).toBe(1);
  });
});
