import { characterDialogueSessionHandlers } from './character-dialogue-session-handlers';
import { commandHandlers } from './command-handlers';
import { configHandlers } from './config-handlers';
import { contextHandlers } from './context-handlers';
import { conversationHandlers } from './conversation-handlers';
import { embodyCharacterSessionHandlers } from './embody-character-session-handlers';
import { MessageHandlerRegistry } from './registry';
import { skillHandlers } from './skill-handlers';
import { streamingHandlers } from './streaming-handlers';
import { subAgentHandlers } from './subagent-handlers';
import { tabHandlers } from './tab-handlers';

export function createConfiguredRegistry(): MessageHandlerRegistry {
  const registry = new MessageHandlerRegistry();
  registry.registerAll(streamingHandlers);
  registry.registerAll(conversationHandlers);
  registry.registerAll(configHandlers);
  registry.registerAll(tabHandlers);
  registry.registerAll(commandHandlers);
  registry.registerAll(skillHandlers);
  registry.registerAll(contextHandlers);
  registry.registerAll(subAgentHandlers);
  registry.registerAll(characterDialogueSessionHandlers);
  registry.registerAll(embodyCharacterSessionHandlers);
  return registry;
}
