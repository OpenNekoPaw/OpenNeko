import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import type {
  AgentConversationControllerEffectPort,
  AgentConversationControllerTurnRequest,
  AgentHostRouteEffectContext,
} from './agent-host-controller-contract';
import {
  runAgentHostRouteEffect,
  runRequiredConversationRoute,
  type AgentHostControllerRouteOperation,
} from './agent-host-route-operation';

export type AgentConversationControllerRouteOperation = AgentHostControllerRouteOperation;

export function tryHandleAgentConversationControllerRoute(
  message: AgentWebviewToHostMessage,
  effects: AgentConversationControllerEffectPort,
  context: AgentHostRouteEffectContext,
): AgentConversationControllerRouteOperation {
  switch (message.type) {
    case 'sendMessage':
      return runRequiredConversationRoute(message, 'send message', context, () =>
        effects.submitTurn(projectSendMessageTurnRequest(message), context),
      );

    case 'mermaidError':
      return runRequiredConversationRoute(
        message,
        'report Mermaid error',
        context,
        (conversationId) =>
          effects.submitTurn(
            {
              source: 'mermaid-feedback',
              conversationId,
              messageText: message.feedbackMessage,
              sessionMode: 'agent',
            },
            context,
          ),
      );

    case 'confirmTool':
      return runRequiredConversationRoute(message, 'confirm Tool Call', context, (conversationId) =>
        effects.confirmTool(
          {
            conversationId,
            toolCallId: message.toolCallId,
            approved: message.approved,
          },
          context,
        ),
      );

    case 'cancelMessage':
      return runRequiredConversationRoute(message, 'cancel message', context, (conversationId) =>
        effects.cancelTurn(conversationId, context),
      );

    case 'newConversation':
      return runAgentHostRouteEffect(() => effects.createConversation(context));

    case 'activateConversation':
      return runRequiredConversationRoute(message, 'activate conversation', context, () =>
        effects.activateConversation(message, context),
      );

    case 'deleteConversation':
      return runRequiredConversationRoute(
        message,
        'delete conversation',
        context,
        (conversationId) =>
          effects.deleteConversation(
            {
              conversationId,
              ...(message.activateNext !== undefined ? { activateNext: message.activateNext } : {}),
            },
            context,
          ),
      );

    case 'getConversations':
      return runAgentHostRouteEffect(() => effects.listConversations(context));

    case 'getActiveConversation':
      return runAgentHostRouteEffect(() => effects.readActiveConversation(context));

    case 'getAgentStates':
      return runAgentHostRouteEffect(() => effects.readAgentStates(context));

    case 'getConversationSnapshot':
      return runRequiredConversationRoute(
        message,
        'get conversation snapshot',
        context,
        (conversationId) => effects.readConversationSnapshot(conversationId, context),
      );

    case 'getMessageQueue':
      return runRequiredConversationRoute(message, 'get message queue', context, (conversationId) =>
        effects.readMessageQueue(conversationId, context),
      );

    case 'promoteQueuedMessage':
      return runRequiredConversationRoute(
        message,
        'promote queued message',
        context,
        (conversationId) =>
          effects.promoteQueuedMessage(
            { conversationId, queueItemId: message.queueItemId },
            context,
          ),
      );

    case 'cancelQueuedMessage':
      return runRequiredConversationRoute(
        message,
        'cancel queued message',
        context,
        (conversationId) =>
          effects.cancelQueuedMessage(
            { conversationId, queueItemId: message.queueItemId },
            context,
          ),
      );

    case 'editQueuedMessage':
      return runRequiredConversationRoute(
        message,
        'edit queued message',
        context,
        (conversationId) =>
          effects.editQueuedMessage(
            {
              tabId: message.tabId,
              conversationId,
              queueItemId: message.queueItemId,
            },
            context,
          ),
      );

    case 'clearHistory':
      return runRequiredConversationRoute(message, 'clear history', context, (conversationId) =>
        effects.clearHistory(conversationId, context),
      );

    case 'clearAllConversations':
      return runAgentHostRouteEffect(() => effects.clearAllConversations(context));

    default:
      return null;
  }
}

function projectSendMessageTurnRequest(
  message: Extract<AgentWebviewToHostMessage, { type: 'sendMessage' }>,
): AgentConversationControllerTurnRequest {
  return {
    source: 'user-message',
    conversationId: message.conversationId,
    messageText: message.message,
    sessionMode: message.sessionMode,
    ...(message.chatModel ? { chatModel: message.chatModel } : {}),
    ...(message.agentModels ? { agentModels: message.agentModels } : {}),
    ...(message.llmConfig ? { llmConfig: message.llmConfig } : {}),
    ...(message.mediaModel ? { mediaModel: message.mediaModel } : {}),
    ...(message.purposeModels ? { purposeModels: message.purposeModels } : {}),
    ...(message.attachments ? { attachments: message.attachments } : {}),
    ...(message.contextPayloads ? { contextPayloads: message.contextPayloads } : {}),
    ...(message.fileReferences ? { fileReferences: message.fileReferences } : {}),
    ...(message.promptId ? { promptId: message.promptId } : {}),
  };
}
