import type { AgentWebviewToHostMessage } from '@neko-agent/types';
import { createAgentHostMessageController } from '@neko/agent/runtime';
import { createVSCodeConfigControllerEffects } from './router/configControllerEffects';
import { createVSCodeContentControllerEffects } from './router/contentControllerEffects';
import { createVSCodeConversationControllerEffects } from './router/conversationControllerEffects';
import { createVSCodeProjectionControllerEffects } from './router/projectionControllerEffects';
import { createVSCodeSkillControllerEffects } from './router/skillControllerEffects';
import { tryHandleFileAndPluginRoute } from './router/fileAndPluginRoutes';
import { tryHandleMessageRoute } from './router/messageRoutes';
import type { VSCodeAgentHostControllerDeps } from './router/types';

export type { VSCodeAgentHostControllerDeps } from './router/types';

export const VSCODE_AGENT_HOST_ROUTE_TYPES = [
  'sendMessage',
  'projectionEndpointDiscover',
  'projectionAttach',
  'projectionSnapshotAck',
  'projectionDetach',
  'searchProjectFiles',
  'startCharacterDialogueFromSlash',
  'confirmRoleplayCandidate',
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
  'getConfig',
  'getConversationSnapshot',
  'refreshConfigSnapshot',
  'updateSettings',
  'getTabState',
  'updateTabState',
  'openFile',
  'revealDocumentLocator',
  'revealFile',
  'openUserConfigFile',
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
] as const satisfies readonly AgentWebviewToHostMessage['type'][];

type UnroutedWebviewMessageType = Exclude<
  AgentWebviewToHostMessage['type'],
  (typeof VSCODE_AGENT_HOST_ROUTE_TYPES)[number]
>;
type AssertNever<T extends never> = T;
type _AllWebviewMessagesRouted = AssertNever<UnroutedWebviewMessageType>;

const routeHandlers = [tryHandleMessageRoute, tryHandleFileAndPluginRoute] as const;

export interface VSCodeAgentHostMessageController {
  handle(message: AgentWebviewToHostMessage): Promise<void>;
}

export function createVSCodeAgentHostMessageController(
  deps: VSCodeAgentHostControllerDeps,
): VSCodeAgentHostMessageController {
  const sharedController = createAgentHostMessageController(
    {
      conversation: createVSCodeConversationControllerEffects(deps),
      config: createVSCodeConfigControllerEffects(deps),
      skill: createVSCodeSkillControllerEffects(deps),
      content: createVSCodeContentControllerEffects(deps),
      projection: createVSCodeProjectionControllerEffects(deps),
    },
    {
      identity: deps.connectionIdentity,
      post: async (hostMessage) => {
        await deps.webview.postMessage(hostMessage);
      },
    },
  );

  return {
    async handle(message) {
      const sharedOperation = sharedController.tryHandle(message);
      if (sharedOperation) {
        await sharedOperation;
        return;
      }
      if (message.type === 'webviewKeyboardFocus') {
        await deps.setKeyboardFocused(message.focused);
        return;
      }
      if (message.type === 'webviewKeyboardEditable') {
        await deps.setKeyboardEditable(message.editable);
        return;
      }
      for (const tryHandle of routeHandlers) {
        if (tryHandle(message, deps)) {
          return;
        }
      }
      throw new Error(`VS Code Agent Host route '${message.type}' has no handler.`);
    },
  };
}
