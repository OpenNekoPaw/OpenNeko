/**
 * Message Handlers Module
 *
 * Exports all message handlers and the registry.
 */

export * from './messages';
export * from './types';
export * from './registry';
export * from './useMessageHandler';

import { MessageHandlerRegistry } from './registry';
import { streamingHandlers } from './streaming-handlers';
import { toolHandlers } from './tool-handlers';
import { conversationHandlers } from './conversation-handlers';
import { configHandlers } from './config-handlers';
import { taskHandlers } from './task-handlers';
import { tabHandlers } from './tab-handlers';
import { commandHandlers } from './command-handlers';
import { skillHandlers } from './skill-handlers';
import { contextHandlers } from './context-handlers';
import { mediaHandlers } from './media-handlers';
import { subAgentHandlers } from './subagent-handlers';
import { characterDialogueSessionHandlers } from './character-dialogue-session-handlers';
import { embodyCharacterSessionHandlers } from './embody-character-session-handlers';
import { activationProgressHandlers } from './activation-progress-handlers';

/**
 * Create a fully configured message handler registry
 */
export function createConfiguredRegistry(): MessageHandlerRegistry {
  const registry = new MessageHandlerRegistry();

  // Register all static handlers
  registry.registerAll(streamingHandlers);
  registry.registerAll(toolHandlers);
  registry.registerAll(conversationHandlers);
  registry.registerAll(configHandlers);
  registry.registerAll(taskHandlers);
  registry.registerAll(tabHandlers);
  registry.registerAll(commandHandlers);
  registry.registerAll(skillHandlers);
  registry.registerAll(contextHandlers);
  registry.registerAll(mediaHandlers);
  registry.registerAll(subAgentHandlers);
  registry.registerAll(characterDialogueSessionHandlers);
  registry.registerAll(embodyCharacterSessionHandlers);
  registry.registerAll(activationProgressHandlers);

  return registry;
}
