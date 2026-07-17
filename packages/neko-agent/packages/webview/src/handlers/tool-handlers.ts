/**
 * Tool Message Handlers
 *
 * Handles: toolCall, toolResult, toolConfirmation
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  ToolCallMessage,
  ToolResultMessage,
  ToolResultBackfillMessage,
  ToolConfirmationMessage,
} from './messages';
import { updateConversation } from './message-updater';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import {
  projectToolCallIntoMessages,
  projectToolConfirmationIntoMessages,
  projectToolResultIntoMessages,
  type ToolResultMessageProjectionResult,
} from '../presenters/message-presenter';
import { projectToolResultBackfillIntoMessages } from '../presenters/tool-result-backfill-presenter';
import { getLogger } from '../utils/logger';

const logger = getLogger('ToolHandlers');

/**
 * Handle 'toolCall' message - Tool invocation
 * Creates a tool_call content block.
 */
const handleToolCall: MessageHandler<'toolCall'> = (message: ToolCallMessage, context) => {
  logger.debug('handleToolCall received:', {
    conversationId: message.conversationId,
    messageId: message.messageId,
    toolName: message.toolName,
    toolCallId: message.toolCallId,
    isCurrentConversation: context.isCurrentConversation(message.conversationId),
  });

  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectToolCallIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      arguments: message.arguments,
    });

    logger.debug('toolCall projected:', {
      updated: projection.updated,
      targetMessageId: projection.targetMessageId,
      createdStreamingMessage: projection.streamingMessageId !== undefined,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.streamingMessageId,
    };
  });
};

/**
 * Handle 'toolResult' message - Tool execution result
 * Updates the corresponding tool_call content block.
 */
const handleToolResult: MessageHandler<'toolResult'> = (message: ToolResultMessage, context) => {
  let projection: ToolResultMessageProjectionResult | undefined;
  logger.debug('toolResult received:', {
    success: message.success,
    data: message.data,
    messageId: message.messageId,
    toolCallId: message.toolCallId,
  });

  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    projection = projectToolResultIntoMessages({
      conversationId: message.conversationId,
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      toolCallId: message.toolCallId,
      success: message.success,
      data: message.data,
      error: message.error,
      attachments: message.attachments,
      perceptionCards: message.perceptionCards,
      backfillDiagnostics: message.backfillDiagnostics,
      artifacts: message.artifacts,
    });

    if (!projection.updated) {
      logger.debug('No target message found for toolResult');
    }

    return { messages: projection.messages };
  });

  const projectedWorkItems = projection?.workItems ?? [];
  if (message.conversationId && projectedWorkItems.length > 0) {
    const conversationId = message.conversationId;
    context.setWorkItemsByConversation((prev) =>
      upsertWorkItemsForConversation(prev, conversationId, projectedWorkItems),
    );
  }

  // Background task creation is handled by Extension (sends 'taskCreated' message)
  // Webview only renders task state received via task-handlers.ts
};

const handleToolResultBackfill: MessageHandler<'toolResultBackfill'> = (
  message: ToolResultBackfillMessage,
  context,
) => {
  logger.debug('toolResultBackfill received:', {
    messageId: message.messageId,
    toolCallId: message.toolCallId,
  });

  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectToolResultBackfillIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      message,
    });

    if (!projection.updated) {
      logger.debug('No target message found for toolResultBackfill');
    }

    return { messages: projection.messages };
  });
};

/**
 * Handle 'toolConfirmation' message - Tool requires user confirmation (ask mode)
 * Updates the corresponding tool_call to show confirmation UI
 */
const handleToolConfirmation: MessageHandler<'toolConfirmation'> = (
  message: ToolConfirmationMessage,
  context,
) => {
  const toolCallId = message.toolCallId;
  logger.debug('toolConfirmation received:', {
    conversationId: message.conversationId,
    toolCallId,
    toolName: message.toolName,
    action: message.action,
  });

  updateConversation(context, message.conversationId, (msgs) => {
    const projection = projectToolConfirmationIntoMessages({
      messages: msgs,
      toolCallId,
      action: message.action,
      description: message.description,
      details: message.details,
    });

    if (!projection.updated) {
      logger.debug('No target message found for toolConfirmation');
    }

    return { messages: projection.messages };
  });
};

/**
 * All tool handler registrations
 */
export const toolHandlers: HandlerRegistration[] = [
  defineHandler('toolCall', handleToolCall),
  defineHandler('toolResult', handleToolResult),
  defineHandler('toolResultBackfill', handleToolResultBackfill),
  defineHandler('toolConfirmation', handleToolConfirmation),
];
