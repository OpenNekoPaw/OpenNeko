/**
 * ContextHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextHandler } from '../contextHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockConversations() {
  return {
    getActiveId: vi.fn().mockReturnValue('conv-1'),
    get: vi.fn().mockReturnValue(undefined),
  };
}

function createMockAgentManager() {
  return {
    getContextTokenCount: vi.fn().mockReturnValue(1500),
    compressContext: vi.fn().mockResolvedValue({
      originalTokens: 5000,
      compressedTokens: 2000,
      ratio: 0.4,
    }),
  };
}

describe('ContextHandler', () => {
  let handler: ContextHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let conversations: ReturnType<typeof createMockConversations>;
  let agentManager: ReturnType<typeof createMockAgentManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    conversations = createMockConversations();
    agentManager = createMockAgentManager();
  });

  describe('getTokenCount', () => {
    it('should return 0 when agentManager is unavailable', () => {
      handler = new ContextHandler({ conversations: conversations as any });
      handler.getTokenCount(webview as any, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'contextTokenCount',
        conversationId: 'conv-1',
        tokenCount: 0,
      });
    });

    it('should ignore missing conversationId', () => {
      conversations.getActiveId.mockReturnValue(undefined);
      handler = new ContextHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
      });
      handler.getTokenCount(webview as any, '');

      expect(agentManager.getContextTokenCount).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should return token count from agentManager', () => {
      handler = new ContextHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
      });
      handler.getTokenCount(webview as any, 'conv-1');

      expect(agentManager.getContextTokenCount).toHaveBeenCalledWith('conv-1');
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'contextTokenCount',
        conversationId: 'conv-1',
        tokenCount: 1500,
      });
    });

    it('does not reuse persisted presentation metadata when the Pi runtime count is empty', () => {
      agentManager.getContextTokenCount.mockReturnValue(0);
      conversations.get.mockReturnValue({
        tokenCount: 256,
        messages: [{ id: 'm1', role: 'user', content: 'ignored', timestamp: 1 }],
      });
      handler = new ContextHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
      });

      handler.getTokenCount(webview as any, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'contextTokenCount',
        conversationId: 'conv-1',
        tokenCount: 0,
      });
    });

    it('does not estimate Pi context from presentation messages', () => {
      agentManager.getContextTokenCount.mockReturnValue(0);
      conversations.get.mockReturnValue({
        tokenCount: 0,
        messages: [
          { id: 'm1', role: 'user', content: '12345678', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: '1234', timestamp: 2 },
        ],
      });
      handler = new ContextHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
      });

      handler.getTokenCount(webview as any, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'contextTokenCount',
        conversationId: 'conv-1',
        tokenCount: 0,
      });
    });

    it('should use provided conversationId over active', () => {
      handler = new ContextHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
      });
      handler.getTokenCount(webview as any, 'conv-2');

      expect(agentManager.getContextTokenCount).toHaveBeenCalledWith('conv-2');
    });
  });

  describe('compressContext', () => {
    it('should ignore compression without conversationId', async () => {
      conversations.getActiveId.mockReturnValue(undefined);
      handler = new ContextHandler({ conversations: conversations as any });
      await handler.compressContext(webview as any, '');

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should send compression result on success', async () => {
      handler = new ContextHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
      });
      await handler.compressContext(webview as any, 'conv-1');

      expect(agentManager.compressContext).toHaveBeenCalledWith('conv-1');
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'compressionResult',
        conversationId: 'conv-1',
        originalTokens: 5000,
        compressedTokens: 2000,
        ratio: 0.4,
      });
    });

    it('should send error when compression fails', async () => {
      agentManager.compressContext.mockRejectedValue(new Error('Compression failed'));
      handler = new ContextHandler({
        conversations: conversations as any,
        agentManager: agentManager as any,
      });
      await handler.compressContext(webview as any, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'compressionError',
        conversationId: 'conv-1',
        error: 'Compression failed',
      });
    });
  });
});
