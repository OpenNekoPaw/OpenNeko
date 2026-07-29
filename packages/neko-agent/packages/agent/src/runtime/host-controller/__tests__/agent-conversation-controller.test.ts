import { describe, expect, it, vi } from 'vitest';
import type { AgentWebviewToHostMessage } from '@neko-agent/types';
import {
  tryHandleAgentConversationControllerRoute,
  type AgentConversationControllerEffectPort,
  type AgentHostRouteEffectContext,
} from '..';

function createContext(): AgentHostRouteEffectContext {
  return {
    identity: {
      hostKind: 'electron',
      applicationId: 'app-1',
      windowId: 'window-1',
      viewId: 'view-1',
      workspaceId: 'workspace-1',
      rendererEpoch: 'renderer-1',
      connectionId: 'connection-1',
    },
    post: vi.fn(),
  };
}

function createEffects(): AgentConversationControllerEffectPort {
  return {
    submitTurn: vi.fn(),
    confirmTool: vi.fn(),
    cancelTurn: vi.fn(),
    createConversation: vi.fn(),
    activateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    listConversations: vi.fn(),
    readActiveConversation: vi.fn(),
    readAgentStates: vi.fn(),
    readConversationSnapshot: vi.fn(),
    readMessageQueue: vi.fn(),
    promoteQueuedMessage: vi.fn(),
    cancelQueuedMessage: vi.fn(),
    editQueuedMessage: vi.fn(),
    clearHistory: vi.fn(),
    clearAllConversations: vi.fn(),
  };
}

async function dispatch(
  message: AgentWebviewToHostMessage,
  effects: AgentConversationControllerEffectPort,
  context: AgentHostRouteEffectContext,
): Promise<void> {
  const operation = tryHandleAgentConversationControllerRoute(message, effects, context);
  if (!operation) {
    throw new Error(`Expected shared conversation controller to handle ${message.type}.`);
  }
  await operation;
}

describe('Agent conversation controller', () => {
  it('projects user and Mermaid messages into canonical turn requests', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch(
      {
        type: 'sendMessage',
        conversationId: 'conversation-1',
        message: 'Inspect this selection',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-5', category: 'llm' },
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello' },
          },
        ],
      },
      effects,
      context,
    );
    await dispatch(
      {
        type: 'mermaidError',
        conversationId: 'conversation-1',
        error: 'Parse error',
        code: 'graph TD',
        feedbackMessage: 'Repair the Mermaid diagram.',
      },
      effects,
      context,
    );

    expect(effects.submitTurn).toHaveBeenNthCalledWith(
      1,
      {
        source: 'user-message',
        conversationId: 'conversation-1',
        messageText: 'Inspect this selection',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-5', category: 'llm' },
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello' },
          },
        ],
      },
      context,
    );
    expect(effects.submitTurn).toHaveBeenNthCalledWith(
      2,
      {
        source: 'mermaid-feedback',
        conversationId: 'conversation-1',
        messageText: 'Repair the Mermaid diagram.',
        sessionMode: 'agent',
      },
      context,
    );
  });

  it('routes conversation, queue and Tool operations through their narrow effects', async () => {
    const effects = createEffects();
    const context = createContext();
    const activation = {
      type: 'activateConversation' as const,
      activationId: 2,
      conversationId: 'conversation-1',
      tabId: 'tab-1',
      expectedTabStateRevision: 4,
      tabState: {
        openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conversation-1' }],
        activeTabId: 'tab-1',
      },
    };

    await dispatch(
      {
        type: 'confirmTool',
        conversationId: 'conversation-1',
        toolCallId: 'tool-1',
        approved: true,
      },
      effects,
      context,
    );
    await dispatch({ type: 'cancelMessage', conversationId: 'conversation-1' }, effects, context);
    await dispatch({ type: 'newConversation' }, effects, context);
    await dispatch(activation, effects, context);
    await dispatch(
      { type: 'deleteConversation', conversationId: 'conversation-1', activateNext: false },
      effects,
      context,
    );
    await dispatch({ type: 'getConversations' }, effects, context);
    await dispatch({ type: 'getActiveConversation' }, effects, context);
    await dispatch({ type: 'getAgentStates' }, effects, context);
    await dispatch(
      { type: 'getConversationSnapshot', conversationId: 'conversation-1' },
      effects,
      context,
    );
    await dispatch({ type: 'getMessageQueue', conversationId: 'conversation-1' }, effects, context);
    await dispatch(
      {
        type: 'promoteQueuedMessage',
        conversationId: 'conversation-1',
        queueItemId: 'queue-1',
      },
      effects,
      context,
    );
    await dispatch(
      {
        type: 'cancelQueuedMessage',
        conversationId: 'conversation-1',
        queueItemId: 'queue-2',
      },
      effects,
      context,
    );
    await dispatch(
      {
        type: 'editQueuedMessage',
        tabId: 'tab-1',
        conversationId: 'conversation-1',
        queueItemId: 'queue-3',
      },
      effects,
      context,
    );
    await dispatch({ type: 'clearHistory', conversationId: 'conversation-1' }, effects, context);
    await dispatch({ type: 'clearAllConversations' }, effects, context);

    expect(effects.confirmTool).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', toolCallId: 'tool-1', approved: true },
      context,
    );
    expect(effects.cancelTurn).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.createConversation).toHaveBeenCalledWith(context);
    expect(effects.activateConversation).toHaveBeenCalledWith(activation, context);
    expect(effects.deleteConversation).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', activateNext: false },
      context,
    );
    expect(effects.listConversations).toHaveBeenCalledWith(context);
    expect(effects.readActiveConversation).toHaveBeenCalledWith(context);
    expect(effects.readAgentStates).toHaveBeenCalledWith(context);
    expect(effects.readConversationSnapshot).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.readMessageQueue).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.promoteQueuedMessage).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', queueItemId: 'queue-1' },
      context,
    );
    expect(effects.cancelQueuedMessage).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', queueItemId: 'queue-2' },
      context,
    );
    expect(effects.editQueuedMessage).toHaveBeenCalledWith(
      {
        tabId: 'tab-1',
        conversationId: 'conversation-1',
        queueItemId: 'queue-3',
      },
      context,
    );
    expect(effects.clearHistory).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.clearAllConversations).toHaveBeenCalledWith(context);
  });

  it('rejects missing conversation identity instead of using an active conversation', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch({ type: 'cancelMessage', conversationId: '' }, effects, context);
    await dispatch(
      {
        type: 'sendMessage',
        conversationId: '',
        message: 'Do not route this',
        sessionMode: 'agent',
      },
      effects,
      context,
    );

    expect(effects.cancelTurn).not.toHaveBeenCalled();
    expect(effects.submitTurn).not.toHaveBeenCalled();
    expect(context.post).toHaveBeenNthCalledWith(1, {
      type: 'globalError',
      message: 'Cannot cancel message without an explicit conversationId.',
    });
    expect(context.post).toHaveBeenNthCalledWith(2, {
      type: 'globalError',
      message: 'Cannot send message without an explicit conversationId.',
    });
  });

  it('returns effect failures to the Host composition', async () => {
    const effects = createEffects();
    const context = createContext();
    const failure = new Error('Tool confirmation failed');
    effects.confirmTool = vi.fn().mockRejectedValue(failure);

    const operation = tryHandleAgentConversationControllerRoute(
      {
        type: 'confirmTool',
        conversationId: 'conversation-1',
        toolCallId: 'tool-1',
        approved: false,
      },
      effects,
      context,
    );

    await expect(operation).rejects.toBe(failure);
  });

  it('does not claim routes owned by other shared controller partitions', () => {
    const effects = createEffects();
    const context = createContext();

    expect(
      tryHandleAgentConversationControllerRoute(
        { type: 'getSettings', conversationId: 'c' },
        effects,
        context,
      ),
    ).toBeNull();
    expect(effects.submitTurn).not.toHaveBeenCalled();
  });
});
