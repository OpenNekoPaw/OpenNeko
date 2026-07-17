import type { WebviewToExtensionMessage } from '@neko-agent/types';
import { tryHandleConversationRoute } from './router/conversationRoutes';
import { tryHandleFileAndPluginRoute } from './router/fileAndPluginRoutes';
import { tryHandleMessageRoute } from './router/messageRoutes';
import { tryHandleProjectionRoute } from './router/projectionRoutes';
import { tryHandleSettingsRoute } from './router/settingsRoutes';
import { tryHandleSkillContextRoute } from './router/skillContextRoutes';
import { tryHandleTaskRoute } from './router/taskRoutes';
import type { ChatWebviewMessageRouterDeps } from './router/types';
import type { CONFIG_BRIDGE_MESSAGE_TYPES } from '../services/configBridge';

export type { ChatWebviewMessageRouterDeps } from './router/types';

export const CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES = [
  'sendMessage',
  'projectionEndpointDiscover',
  'projectionAttach',
  'projectionSnapshotAck',
  'projectionDetach',
  'searchProjectFiles',
  'startCharacterDialogueFromSlash',
  'mermaidError',
  'confirmTool',
  'cancelMessage',
  'newConversation',
  'activateConversation',
  'deleteConversation',
  'getConversations',
  'getActiveConversation',
  'getAgentStates',
  'getMessageQueue',
  'promoteQueuedMessage',
  'cancelQueuedMessage',
  'editQueuedMessage',
  'clearHistory',
  'clearAllConversations',
  'getSettings',
  'getConversationSnapshot',
  'refreshConfigSnapshot',
  'updateSettings',
  'getTabState',
  'updateTabState',
  'getTasks',
  'cancelTask',
  'retryTask',
  'viewTaskResult',
  'openFile',
  'revealDocumentLocator',
  'revealFile',
  'revealAsset',
  'openConfigFile',
  'openUrl',
  'revealContextSource',
  'downloadSvg',
  'sendToPlugin',
  'invokeAgentCapabilityLifecycle',
  'requestCanvasAuthoringHandoff',
  'dnd:start',
  'invokePluginSlashCommand',
  'exitCharacterDialogueSession',
  'exitEmbodyCharacterSession',
  'getSkills',
  'invokeSlashCommand',
  'invokeSkill',
  'getContextTokenCount',
  'compressContext',
  'webviewKeyboardFocus',
  'webviewKeyboardEditable',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

type RoutedWebviewMessageType =
  (typeof CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES)[number] | (typeof CONFIG_BRIDGE_MESSAGE_TYPES)[number];
type UnroutedWebviewMessageType = Exclude<
  WebviewToExtensionMessage['type'],
  RoutedWebviewMessageType
>;
type DuplicateBridgeMessageType = Extract<
  (typeof CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES)[number],
  (typeof CONFIG_BRIDGE_MESSAGE_TYPES)[number]
>;
type AssertNever<T extends never> = T;
type _AllWebviewMessagesRouted = AssertNever<UnroutedWebviewMessageType>;
type _NoBridgeMessageOverlap = AssertNever<DuplicateBridgeMessageType>;

const routeHandlers = [
  tryHandleProjectionRoute,
  tryHandleMessageRoute,
  tryHandleConversationRoute,
  tryHandleSettingsRoute,
  tryHandleTaskRoute,
  tryHandleFileAndPluginRoute,
  tryHandleSkillContextRoute,
] as const;

export function handleChatWebviewMessage(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): void {
  for (const tryHandle of routeHandlers) {
    if (tryHandle(message, deps)) {
      return;
    }
  }
}
