import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildConversationHistoryClearedMessage,
  runCancelMessageRuntime,
  runClearAllConversationsRuntime,
  runClearHistoryRuntime,
  runDeleteConversationRuntime,
  runNewConversationRuntime,
  type ConversationControlRuntimeEffects,
} from '../conversation-control-runtime';

describe('conversation control runtime', () => {
  let effects: ConversationControlRuntimeEffects;
  let postMessage: ReturnType<typeof vi.fn>;
  let refreshConversationList: ReturnType<typeof vi.fn>;
  let refreshActiveConversation: ReturnType<typeof vi.fn>;
  let removeAgent: ReturnType<typeof vi.fn>;
  let clearAgentState: ReturnType<typeof vi.fn>;
  let clearAgentHistory: ReturnType<typeof vi.fn>;
  let cancelAgent: ReturnType<typeof vi.fn>;
  let updateConversationMessages: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessage = vi.fn();
    refreshConversationList = vi.fn();
    refreshActiveConversation = vi.fn();
    removeAgent = vi.fn();
    clearAgentState = vi.fn();
    clearAgentHistory = vi.fn();
    cancelAgent = vi.fn();
    updateConversationMessages = vi.fn();
    effects = {
      postMessage,
      refreshConversationList,
      refreshActiveConversation,
      removeAgent,
      clearAgentState,
      clearAgentHistory,
      cancelAgent,
      updateConversationMessages,
      now: () => 1234,
    };
  });

  it('builds the conversation-scoped history cleared message', () => {
    expect(buildConversationHistoryClearedMessage('conv-1')).toEqual({
      type: 'historyCleared',
      conversationId: 'conv-1',
    });
  });

  it('creates a conversation and refreshes list plus active conversation', async () => {
    effects.createConversation = vi.fn().mockReturnValue('conv-new');
    effects.onConversationCreated = vi.fn();

    await expect(runNewConversationRuntime(effects)).resolves.toEqual({
      action: 'new-conversation',
      handled: true,
      conversationId: 'conv-new',
    });
    expect(effects.createConversation).toHaveBeenCalledTimes(1);
    expect(effects.onConversationCreated).toHaveBeenCalledWith('conv-new');
    expect(refreshConversationList).toHaveBeenCalledTimes(1);
    expect(refreshActiveConversation).toHaveBeenCalledTimes(1);
  });

  it('deletes a conversation and clears associated agent state', async () => {
    effects.deleteConversation = vi.fn();

    await runDeleteConversationRuntime({ conversationId: 'conv-1' }, effects);

    expect(removeAgent).toHaveBeenCalledWith('conv-1');
    expect(clearAgentState).toHaveBeenCalledWith('conv-1');
    expect(effects.deleteConversation).toHaveBeenCalledWith('conv-1', { activateNext: true });
    expect(refreshConversationList).toHaveBeenCalledTimes(1);
    expect(refreshActiveConversation).toHaveBeenCalledTimes(1);
  });

  it('can delete a conversation without activating another conversation', async () => {
    effects.deleteConversation = vi.fn();

    await runDeleteConversationRuntime({ conversationId: 'conv-1', activateNext: false }, effects);

    expect(effects.deleteConversation).toHaveBeenCalledWith('conv-1', { activateNext: false });
    expect(refreshConversationList).toHaveBeenCalledTimes(1);
    expect(refreshActiveConversation).not.toHaveBeenCalled();
  });

  it('does not clear the UI projection when authoritative deletion fails', async () => {
    const error = new Error('Pi catalog delete failed');
    effects.removeAgent = vi.fn().mockRejectedValue(error);
    effects.deleteConversation = vi.fn();

    await expect(
      runDeleteConversationRuntime({ conversationId: 'conv-1' }, effects),
    ).rejects.toBe(error);

    expect(clearAgentState).not.toHaveBeenCalled();
    expect(effects.deleteConversation).not.toHaveBeenCalled();
    expect(refreshConversationList).not.toHaveBeenCalled();
    expect(refreshActiveConversation).not.toHaveBeenCalled();
  });

  it('clears one conversation history and posts a scoped event', async () => {
    await runClearHistoryRuntime({ conversationId: 'conv-1' }, effects);

    expect(clearAgentHistory).toHaveBeenCalledWith('conv-1');
    expect(updateConversationMessages).toHaveBeenCalledWith('conv-1', []);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'historyCleared',
      conversationId: 'conv-1',
    });
  });

  it('clears all conversations using the snapshot captured before clearing', async () => {
    effects.listConversationIds = vi.fn().mockReturnValue(['conv-1', 'conv-2']);
    effects.clearConversations = vi.fn();

    await runClearAllConversationsRuntime(effects);

    expect(removeAgent).toHaveBeenCalledWith('conv-1');
    expect(removeAgent).toHaveBeenCalledWith('conv-2');
    expect(clearAgentState).toHaveBeenCalledWith('conv-1');
    expect(clearAgentState).toHaveBeenCalledWith('conv-2');
    expect(effects.clearConversations).toHaveBeenCalledTimes(1);
    expect(refreshConversationList).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'historyCleared', conversationId: 'conv-1' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'historyCleared', conversationId: 'conv-2' });
  });

  it('waits for a running agent to stop before posting cancellation', async () => {
    const dispose = vi.fn();
    let stopListener: (() => void) | undefined;
    effects.isAgentRunning = vi.fn().mockReturnValue(true);
    effects.onAgentStopped = vi.fn((_conversationId, listener) => {
      stopListener = listener;
      return { dispose };
    });

    await runCancelMessageRuntime({ conversationId: 'conv-1' }, effects);

    expect(cancelAgent).toHaveBeenCalledWith('conv-1');
    expect(postMessage).not.toHaveBeenCalled();

    stopListener?.();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'messageCancelled',
      conversationId: 'conv-1',
    });
  });
});
