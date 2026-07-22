import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './webview-protocol';

export type AgentHostKind = 'vscode' | 'electron';

export interface AgentHostRuntimeSubscription {
  dispose(): void;
}

export interface AgentHostRuntimeAdapter {
  readonly hostKind: AgentHostKind;
  readonly runtimeId: string;
  send(message: WebviewToExtensionMessage): void;
  subscribe(listener: (message: ExtensionToWebviewMessage) => void): AgentHostRuntimeSubscription;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

export type AgentHostRouteSupport = 'implemented' | 'unsupported' | 'host-inapplicable';

export interface AgentHostRouteCoverageInput {
  readonly hostKind: AgentHostKind;
  readonly routes: Partial<Record<AgentWebviewToHostMessageType, AgentHostRouteSupport>>;
}

export interface AgentHostRouteCoverageDiagnostic {
  readonly code: 'missing-agent-host-route-classification';
  readonly severity: 'error';
  readonly hostKind: AgentHostKind;
  readonly messageType: AgentWebviewToHostMessageType;
  readonly message: string;
}

export const AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES = [
  'sendMessage',
  'searchProjectFiles',
  'confirmTool',
  'activateConversation',
  'clearHistory',
  'cancelMessage',
  'getTasks',
  'getContextTokenCount',
  'compressContext',
  'getMessageQueue',
  'promoteQueuedMessage',
  'cancelQueuedMessage',
  'editQueuedMessage',
  'deleteConversation',
  'newConversation',
  'clearAllConversations',
  'getConversations',
  'getActiveConversation',
  'getAgentStates',
  'getSettings',
  'getConversationSnapshot',
  'getConfig',
  'refreshConfigSnapshot',
  'getSkills',
  'openUserConfigFile',
  'openConfigFile',
  'getTabState',
  'updateSettings',
  'updateTabState',
  'cancelTask',
  'retryTask',
  'viewTaskResult',
  'openFile',
  'revealDocumentLocator',
  'revealFile',
  'openUrl',
  'sendToPlugin',
  'invokeAgentCapabilityLifecycle',
  'requestCanvasAuthoringHandoff',
  'dnd:start',
  'mermaidError',
  'downloadSvg',
  'invokeSlashCommand',
  'invokeSkill',
  'invokePluginSlashCommand',
  'startCharacterDialogueFromSlash',
  'confirmRoleplayCandidate',
  'exitCharacterDialogueSession',
  'exitEmbodyCharacterSession',
  'revealContextSource',
  'webviewKeyboardFocus',
  'webviewKeyboardEditable',
  'projectionEndpointDiscover',
  'projectionAttach',
  'projectionSnapshotAck',
  'projectionDetach',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

export type AgentWebviewToHostMessageType = (typeof AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES)[number];

type AssertNever<T extends never> = T;
export type AgentWebviewToHostMessageTypeCoverage = AssertNever<
  Exclude<WebviewToExtensionMessage['type'], AgentWebviewToHostMessageType>
>;

export function createAgentHostRouteCoverageDiagnostics(
  input: AgentHostRouteCoverageInput,
): readonly AgentHostRouteCoverageDiagnostic[] {
  const diagnostics: AgentHostRouteCoverageDiagnostic[] = [];
  for (const messageType of AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES) {
    if (input.routes[messageType]) {
      continue;
    }
    diagnostics.push({
      code: 'missing-agent-host-route-classification',
      severity: 'error',
      hostKind: input.hostKind,
      messageType,
      message: `Agent host '${input.hostKind}' has no route classification for '${messageType}'.`,
    });
  }
  return diagnostics;
}
