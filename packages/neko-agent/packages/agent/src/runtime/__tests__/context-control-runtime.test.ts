import { describe, expect, it, vi } from 'vitest';
import { compressAgentContext, sendAgentContextTokenCount } from '../turn/context-control-runtime';

describe('context control runtime', () => {
  it('sends token count from injected context manager', () => {
    const postMessage = vi.fn();
    const getTokenCount = vi.fn().mockReturnValue(1500);

    expect(
      sendAgentContextTokenCount({
        conversationId: 'conv-1',
        postMessage,
        getTokenCount,
      }),
    ).toEqual({ status: 'sent' });

    expect(getTokenCount).toHaveBeenCalledWith('conv-1');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'contextTokenCount',
      conversationId: 'conv-1',
      tokenCount: 1500,
    });
  });

  it('sends zero token count when context manager is unavailable', () => {
    const postMessage = vi.fn();

    sendAgentContextTokenCount({
      conversationId: 'conv-1',
      postMessage,
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'contextTokenCount',
      conversationId: 'conv-1',
      tokenCount: 0,
    });
  });

  it('rejects token requests without conversationId', () => {
    const postMessage = vi.fn();
    const onMissingConversationId = vi.fn();

    expect(
      sendAgentContextTokenCount({
        conversationId: '',
        postMessage,
        onMissingConversationId,
      }),
    ).toEqual({ status: 'rejected', reason: 'missing-conversation-id' });

    expect(onMissingConversationId).toHaveBeenCalledWith('getTokenCount');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('sends compression result from injected context manager', async () => {
    const postMessage = vi.fn();
    const compressContext = vi.fn().mockResolvedValue({
      originalTokens: 5000,
      compressedTokens: 2000,
      ratio: 0.4,
    });

    expect(
      await compressAgentContext({
        conversationId: 'conv-1',
        postMessage,
        compressContext,
      }),
    ).toEqual({ status: 'sent' });

    expect(compressContext).toHaveBeenCalledWith('conv-1');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'compressionResult',
      conversationId: 'conv-1',
      originalTokens: 5000,
      compressedTokens: 2000,
      ratio: 0.4,
    });
  });

  it('sends compression error when context manager is unavailable', async () => {
    const postMessage = vi.fn();

    expect(
      await compressAgentContext({
        conversationId: 'conv-1',
        postMessage,
      }),
    ).toEqual({
      status: 'failed',
      error: 'No active conversation or agent manager',
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'compressionError',
      conversationId: 'conv-1',
      error: 'No active conversation or agent manager',
    });
  });

  it('sends compression errors from failed compression', async () => {
    const postMessage = vi.fn();
    const error = new Error('Compression failed');

    expect(
      await compressAgentContext({
        conversationId: 'conv-1',
        postMessage,
        compressContext: async () => {
          throw error;
        },
      }),
    ).toEqual({ status: 'failed', error });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'compressionError',
      conversationId: 'conv-1',
      error: 'Compression failed',
    });
  });
});
