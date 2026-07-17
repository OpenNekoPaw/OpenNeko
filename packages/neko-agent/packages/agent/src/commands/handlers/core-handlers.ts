/**
 * Core Command Handlers
 *
 * Handlers return actions, data, and typed semantics only. Terminal surfaces
 * own all human-readable presentation.
 */

import type { CommandContext, CommandHandler } from '../types';

/** Handle /help command. */
export const handleHelp: CommandHandler = () => ({
  handled: true,
  continueExecution: true,
  action: 'showHelp',
});

/** Build the Extension-owned status read model without terminal prose. */
export function generateExtensionStatusData(context: CommandContext): Record<string, unknown> {
  const { config, conversations, contextManager } = context;
  const activeConversationId = conversations?.getActiveId();
  const tokenCount =
    activeConversationId && contextManager ? contextManager.getTokenCount(activeConversationId) : 0;

  return {
    provider: config?.provider,
    model: config?.model,
    conversationCount: conversations?.list().length ?? 0,
    activeConversationId,
    messageCount: conversations?.getActiveMessageCount?.() ?? 0,
    tokenCount,
    executionMode: config?.executionMode ?? 'normal',
  };
}

/** Handle /status command. */
export const handleStatus: CommandHandler = (_args, context) => ({
  handled: true,
  continueExecution: true,
  action: 'showStatus',
  data: generateExtensionStatusData(context),
});

/** Handle /clear command. */
export const handleClear: CommandHandler = (_args, context) => {
  context.conversations?.clearCurrent();

  return {
    handled: true,
    continueExecution: true,
    action: 'clearHistory',
    semantic: { family: 'core', result: { kind: 'history-cleared' } },
  };
};

/** Handle /exit command. */
export const handleExit: CommandHandler = () => ({
  handled: true,
  continueExecution: false,
  action: 'exit',
  semantic: { family: 'core', result: { kind: 'exit' } },
});
