import * as vscode from 'vscode';
import type {
  AgentConversationControllerEffectPort,
  AgentConversationControllerTurnRequest,
} from '@neko/agent/runtime';
import { buildGlobalErrorMessage } from '@neko-agent/types';
import { getLogger } from '../../base';
import type { VSCodeAgentHostControllerDeps } from './types';

const logger = getLogger('ConversationControllerEffects');

export function createVSCodeConversationControllerEffects(
  deps: VSCodeAgentHostControllerDeps,
): AgentConversationControllerEffectPort {
  return {
    submitTurn: (request) => submitVSCodeAgentTurn(deps, request),
    confirmTool: ({ conversationId, toolCallId, approved }) =>
      deps.conversationMessageHandler.handleConfirmTool(toolCallId, approved, conversationId),
    cancelTurn: (conversationId) => {
      if (deps.characterDialogue?.cancel(conversationId)) return;
      if (deps.embodyCharacter?.cancel(conversationId)) return;
      return deps.conversationMessageHandler.handleCancelMessage(deps.webview, conversationId);
    },
    createConversation: () => {
      const operation = deps.conversationMessageHandler.handleNewConversation();
      deps.syncCanvasAmbientScopeFromActiveConversation();
      return operation;
    },
    activateConversation: (message) => deps.activateConversation(message),
    deleteConversation: ({ conversationId, activateNext }) => {
      const operation = deps.conversationMessageHandler.handleDeleteConversation(conversationId, {
        ...(activateNext !== undefined ? { activateNext } : {}),
      });
      deps.syncCanvasAmbientScopeFromActiveConversation();
      return operation;
    },
    listConversations: () => deps.conversationMessageHandler.sendConversationList(),
    readActiveConversation: () => deps.conversationMessageHandler.sendActiveConversation(),
    readAgentStates: () => deps.conversationMessageHandler.sendAgentStateSnapshot(deps.webview),
    readConversationSnapshot: async (conversationId) => {
      await deps.conversationMessageHandler.sendConversationSnapshot(conversationId);
    },
    readMessageQueue: (conversationId) =>
      deps.conversationMessageHandler.sendMessageQueueSnapshot(deps.webview, conversationId),
    promoteQueuedMessage: ({ conversationId, queueItemId }) =>
      deps.conversationMessageHandler.handlePromoteQueuedMessage(
        deps.webview,
        conversationId,
        queueItemId,
      ),
    cancelQueuedMessage: ({ conversationId, queueItemId }) =>
      deps.conversationMessageHandler.handleCancelQueuedMessage(
        deps.webview,
        conversationId,
        queueItemId,
      ),
    editQueuedMessage: ({ tabId, conversationId, queueItemId }) =>
      deps.conversationMessageHandler.handleEditQueuedMessage(
        deps.webview,
        tabId,
        conversationId,
        queueItemId,
      ),
    clearHistory: (conversationId) =>
      deps.conversationMessageHandler.handleClearHistory(deps.webview, conversationId),
    clearAllConversations: () => {
      const operation = deps.conversationMessageHandler.handleClearAllConversations(deps.webview);
      deps.syncCanvasAmbientScopeFromActiveConversation();
      return operation;
    },
  };
}

export function submitVSCodeAgentTurn(
  deps: VSCodeAgentHostControllerDeps,
  request: AgentConversationControllerTurnRequest,
): void {
  const { source, ...runtimeRequest } = request;
  if (source === 'user-message') {
    if (deps.characterDialogue?.hasSession(request.conversationId)) {
      void deps.characterDialogue.routeUserMessage(request.conversationId, request.messageText);
      return;
    }
    if (deps.embodyCharacter?.hasSession(request.conversationId)) {
      void deps.embodyCharacter.routeUserMessage(request.conversationId, request.messageText);
      return;
    }
  }

  const handler = deps.messages;
  if (!handler) {
    const error = new Error('Agent message turn handler is unavailable.');
    logger.error(error.message);
    void Promise.resolve(deps.webview.postMessage(buildGlobalErrorMessage(error.message))).catch(
      (postError: unknown) =>
        logger.error('Failed to project unavailable Agent message turn handler:', postError),
    );
    return;
  }

  const operation = Promise.resolve(
    handler.handleUserMessage(deps.webview, {
      ...runtimeRequest,
      locale: runtimeRequest.locale ?? vscode.env.language,
    }),
  );
  void operation.catch((error: unknown) => {
    logger.error('Agent message route failed:', error);
    const message = error instanceof Error ? error.message : 'Agent message route failed.';
    void Promise.resolve(deps.webview.postMessage(buildGlobalErrorMessage(message))).catch(
      (postError: unknown) =>
        logger.error('Failed to project Agent message route error:', postError),
    );
  });
}
