/**
 * Context Management Message Handlers
 *
 * Handles: contextTokenCount, compressionResult, compressionError
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  ContextTokenCountMessage,
  CompressionResultMessage,
  CompressionErrorMessage,
  InjectContextMessage,
} from './messages';
import {
  projectCompressionError,
  projectCompressionResult,
  projectContextTokenCount,
} from '../presenters/context-state-presenter';
import { getLogger } from '../utils/logger';

const logger = getLogger('ContextHandlers');

const handleInjectContext: MessageHandler<'injectContext'> = (
  message: InjectContextMessage,
  context,
) => {
  context.requestContextInjection?.({
    tabId: message.tabId,
    conversationId: message.conversationId,
    payload: message.payload,
  });
};

/**
 * Handle 'contextTokenCount' - Token count update for a conversation
 */
const handleContextTokenCount: MessageHandler<'contextTokenCount'> = (
  message: ContextTokenCountMessage,
  context,
) => {
  if (!message.conversationId) return;

  const projection = projectContextTokenCount({
    tokenCounts: context.conversationTokenCountRef.current,
    activeConversationId: context.activeConversationIdRef.current,
    conversationId: message.conversationId,
    tokenCount: message.tokenCount,
  });

  context.conversationTokenCountRef.current = projection.tokenCounts;
  if (projection.shouldForceUpdate) context.forceUpdate();
};

/**
 * Handle 'compressionResult' - Compression completed for a conversation
 */
const handleCompressionResult: MessageHandler<'compressionResult'> = (
  message: CompressionResultMessage,
  context,
) => {
  if (!message.conversationId) return;

  const projection = projectCompressionResult({
    tokenCounts: context.conversationTokenCountRef.current,
    compressing: context.conversationCompressingRef.current,
    activeConversationId: context.activeConversationIdRef.current,
    conversationId: message.conversationId,
    compressedTokens: message.compressedTokens,
  });

  context.conversationTokenCountRef.current = projection.tokenCounts;
  context.conversationCompressingRef.current = projection.compressing;
  if (projection.shouldForceUpdate) context.forceUpdate();
};

/**
 * Handle 'compressionError' - Compression failed for a conversation
 */
const handleCompressionError: MessageHandler<'compressionError'> = (
  message: CompressionErrorMessage,
  context,
) => {
  if (!message.conversationId) {
    logger.error('Compression failed:', message.error);
    return;
  }

  const projection = projectCompressionError({
    compressing: context.conversationCompressingRef.current,
    activeConversationId: context.activeConversationIdRef.current,
    conversationId: message.conversationId,
  });

  context.conversationCompressingRef.current = projection.compressing;
  if (projection.shouldForceUpdate) context.forceUpdate();
  logger.error('Compression failed:', message.error);
};

export const contextHandlers: HandlerRegistration[] = [
  defineHandler('injectContext', handleInjectContext),
  defineHandler('contextTokenCount', handleContextTokenCount),
  defineHandler('compressionResult', handleCompressionResult),
  defineHandler('compressionError', handleCompressionError),
];
