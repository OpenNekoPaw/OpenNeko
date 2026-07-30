import {
  AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES,
  type AgentHostToWebviewMessage,
  type AgentWebviewToHostMessage,
} from './webview-protocol';

export type AgentHostKind = 'vscode' | 'electron';

export interface AgentHostRuntimeSubscription {
  dispose(): void;
}

export interface AgentHostRuntimeAdapter {
  readonly hostKind: AgentHostKind;
  readonly runtimeId: string;
  send(message: AgentWebviewToHostMessage): void;
  subscribe(listener: (message: AgentHostToWebviewMessage) => void): AgentHostRuntimeSubscription;
  getState(): unknown;
  setState(state: unknown): void;
}

export type AgentHostRouteSupport = 'implemented' | 'unsupported' | 'host-inapplicable';

export type AgentHostRouteUnavailableSupport = Exclude<AgentHostRouteSupport, 'implemented'>;

export type AgentHostRouteFutureOwner = 'P1.4' | 'P1.6' | 'Phase 3';

export type AgentWebviewToHostMessageType = (typeof AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES)[number];

export type AgentHostRouteSupportRecord = Readonly<
  Record<AgentWebviewToHostMessageType, AgentHostRouteSupport>
>;

export interface AgentHostRouteCoverageInput {
  readonly hostKind: AgentHostKind;
  readonly routes: AgentHostRouteSupportRecord;
}

export interface AgentHostRouteCoverageAuditInput {
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

export interface AgentHostRouteUnavailableDiagnostic {
  readonly code: 'agent-host-route-unsupported' | 'agent-host-route-inapplicable';
  readonly severity: 'error';
  readonly hostKind: AgentHostKind;
  readonly messageType: AgentWebviewToHostMessageType;
  readonly support: AgentHostRouteUnavailableSupport;
  readonly owner?: AgentHostRouteFutureOwner;
  readonly message: string;
}

export const ELECTRON_AGENT_HOST_ROUTE_COVERAGE = {
  sendMessage: 'implemented',
  searchProjectFiles: 'implemented',
  confirmTool: 'implemented',
  activateConversation: 'implemented',
  clearHistory: 'implemented',
  cancelMessage: 'implemented',
  getContextTokenCount: 'implemented',
  compressContext: 'implemented',
  getMessageQueue: 'implemented',
  promoteQueuedMessage: 'implemented',
  cancelQueuedMessage: 'implemented',
  editQueuedMessage: 'implemented',
  deleteConversation: 'implemented',
  newConversation: 'implemented',
  clearAllConversations: 'implemented',
  getConversations: 'implemented',
  getActiveConversation: 'implemented',
  getAgentStates: 'implemented',
  getSettings: 'implemented',
  getConversationSnapshot: 'implemented',
  getConfig: 'implemented',
  refreshConfigSnapshot: 'implemented',
  getSkills: 'implemented',
  openUserConfigFile: 'implemented',
  openConfigFile: 'implemented',
  getTabState: 'implemented',
  updateSettings: 'implemented',
  updateTabState: 'implemented',
  openFile: 'implemented',
  revealDocumentLocator: 'implemented',
  revealFile: 'implemented',
  openUrl: 'implemented',
  sendToPlugin: 'unsupported',
  invokeAgentCapabilityLifecycle: 'unsupported',
  requestCanvasAuthoringHandoff: 'unsupported',
  'dnd:start': 'host-inapplicable',
  mermaidError: 'implemented',
  downloadSvg: 'implemented',
  invokeSlashCommand: 'implemented',
  invokeSkill: 'implemented',
  invokePluginSlashCommand: 'unsupported',
  startCharacterDialogueFromSlash: 'unsupported',
  confirmRoleplayCandidate: 'unsupported',
  exitCharacterDialogueSession: 'unsupported',
  exitEmbodyCharacterSession: 'unsupported',
  revealContextSource: 'implemented',
  webviewKeyboardFocus: 'host-inapplicable',
  webviewKeyboardEditable: 'host-inapplicable',
  projectionEndpointDiscover: 'implemented',
  projectionAttach: 'implemented',
  projectionSnapshotAck: 'implemented',
  projectionDetach: 'implemented',
} as const satisfies AgentHostRouteSupportRecord;

export const ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS = {
  sendToPlugin: 'Phase 3',
  invokeAgentCapabilityLifecycle: 'P1.4',
  requestCanvasAuthoringHandoff: 'P1.4',
  invokePluginSlashCommand: 'Phase 3',
  startCharacterDialogueFromSlash: 'P1.6',
  confirmRoleplayCandidate: 'P1.6',
  exitCharacterDialogueSession: 'P1.6',
  exitEmbodyCharacterSession: 'P1.6',
} as const satisfies Partial<Record<AgentWebviewToHostMessageType, AgentHostRouteFutureOwner>>;

type AssertNever<T extends never> = T;
export type AgentWebviewToHostMessageTypeCoverage = AssertNever<
  Exclude<AgentWebviewToHostMessage['type'], AgentWebviewToHostMessageType>
>;

export function createAgentHostRouteCoverageDiagnostics(
  input: AgentHostRouteCoverageAuditInput,
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

export function createAgentHostRouteUnavailableDiagnostic(input: {
  readonly hostKind: AgentHostKind;
  readonly messageType: AgentWebviewToHostMessageType;
  readonly support: AgentHostRouteUnavailableSupport;
  readonly owner?: AgentHostRouteFutureOwner;
}): AgentHostRouteUnavailableDiagnostic {
  const code =
    input.support === 'unsupported'
      ? 'agent-host-route-unsupported'
      : 'agent-host-route-inapplicable';
  const ownerMessage = input.owner ? ` It is owned by ${input.owner}.` : '';
  return {
    code,
    severity: 'error',
    hostKind: input.hostKind,
    messageType: input.messageType,
    support: input.support,
    ...(input.owner ? { owner: input.owner } : {}),
    message: `Agent route '${input.messageType}' is ${input.support} for host '${input.hostKind}'.${ownerMessage}`,
  };
}

export function createElectronAgentHostRouteUnavailableDiagnostic(
  messageType: AgentWebviewToHostMessageType,
): AgentHostRouteUnavailableDiagnostic | null {
  const support = ELECTRON_AGENT_HOST_ROUTE_COVERAGE[messageType];
  if (support === 'implemented') return null;
  const owner =
    messageType in ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS
      ? ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS[
          messageType as keyof typeof ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS
        ]
      : undefined;
  return createAgentHostRouteUnavailableDiagnostic({
    hostKind: 'electron',
    messageType,
    support,
    ...(owner ? { owner } : {}),
  });
}
