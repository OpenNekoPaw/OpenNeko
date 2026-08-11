import {
  AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES,
  type AgentHostToWebviewMessage,
  type AgentWebviewToHostMessage,
} from './webview-protocol';

export type AgentHostKind = 'electron';

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

export interface AgentDraftHostRuntimeAdapter extends AgentHostRuntimeAdapter {
  readLaunchCatalog(): import('./agent-launch').AgentLaunchCatalogProjection;
  readEntryIntent(): import('./agent-entry-intent').AgentEntryIntentProjection;
  loadCharacterDialogueTargets(): Promise<
    readonly import('./agent-entry-intent').AgentCharacterDialogueTargetOption[]
  >;
  configureEntryTarget(
    mode: import('./agent-entry-intent').AgentEntryMode,
    binding?: import('./agent-entry-intent').AgentEntryTargetBinding,
  ): Promise<import('./agent-entry-intent').AgentEntryIntentProjection>;
  bindTarget(
    binding: import('./agent-interaction-binding').AgentDomainBinding,
  ): Promise<import('./agent-launch').AgentLaunchCatalogProjection>;
  updateDraftConfiguration(
    configuration: import('./agent-model-catalog').AgentConfigurationRequest,
  ): Promise<import('./agent-launch').AgentLaunchCatalogProjection>;
  submitDraft(
    input: import('./agent-draft-submit').AgentDraftSubmitInput,
  ): Promise<import('./agent-draft-submit').AgentDraftSubmitProjection>;
  authorizeResource(
    resourceKind: import('./agent-launch').AgentLaunchResourceKind,
  ): Promise<import('./agent-context').AgentContextPayload | undefined>;
}

export function requireAgentDraftHostRuntimeAdapter(
  adapter: AgentHostRuntimeAdapter,
): AgentDraftHostRuntimeAdapter {
  const candidate = adapter as Partial<AgentDraftHostRuntimeAdapter>;
  if (
    typeof candidate.submitDraft !== 'function' ||
    typeof candidate.authorizeResource !== 'function' ||
    typeof candidate.bindTarget !== 'function' ||
    typeof candidate.configureEntryTarget !== 'function' ||
    typeof candidate.loadCharacterDialogueTargets !== 'function' ||
    typeof candidate.readEntryIntent !== 'function' ||
    typeof candidate.updateDraftConfiguration !== 'function' ||
    typeof candidate.readLaunchCatalog !== 'function'
  ) {
    throw new Error('Agent Draft presentation requires an exact Draft Host runtime adapter.');
  }
  return candidate as AgentDraftHostRuntimeAdapter;
}

export type AgentHostRouteSupport = 'implemented' | 'unsupported' | 'host-inapplicable';

export type AgentHostRouteUnavailableSupport = Exclude<AgentHostRouteSupport, 'implemented'>;

export type AgentHostRouteConnectionRequirement = 'launch-or-session' | 'session';
export type AgentHostRouteScopeRequirement = 'any' | 'workspace';

export interface AgentHostRouteAuthority {
  readonly connection: AgentHostRouteConnectionRequirement;
  readonly scope: AgentHostRouteScopeRequirement;
}

export type AgentHostRouteAuthorityRecord = Readonly<
  Record<AgentWebviewToHostMessageType, AgentHostRouteAuthority>
>;

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

export interface AgentHostWorkspaceScopeRequiredDiagnostic {
  readonly code: 'workspace-scope-required';
  readonly severity: 'error';
  readonly hostKind: AgentHostKind;
  readonly messageType: AgentWebviewToHostMessageType;
  readonly requiredScope: 'workspace';
  readonly actualScope: 'assistant';
  readonly message: string;
}

export type AgentHostRouteDiagnostic =
  AgentHostRouteUnavailableDiagnostic | AgentHostWorkspaceScopeRequiredDiagnostic;

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
  sendQueuedMessageNow: 'implemented',
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
  openUserConfigFile: 'implemented',
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
  getAgentInputCatalog: 'implemented',
  invokeAgentInput: 'implemented',
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

const LAUNCH_ANY = { connection: 'launch-or-session', scope: 'any' } as const;
const SESSION_ANY = { connection: 'session', scope: 'any' } as const;
const SESSION_WORKSPACE = { connection: 'session', scope: 'workspace' } as const;

export const AGENT_HOST_ROUTE_AUTHORITY = {
  sendMessage: SESSION_ANY,
  searchProjectFiles: LAUNCH_ANY,
  confirmTool: SESSION_ANY,
  activateConversation: SESSION_ANY,
  clearHistory: SESSION_ANY,
  cancelMessage: SESSION_ANY,
  getContextTokenCount: SESSION_ANY,
  compressContext: SESSION_ANY,
  getMessageQueue: SESSION_ANY,
  sendQueuedMessageNow: SESSION_ANY,
  cancelQueuedMessage: SESSION_ANY,
  editQueuedMessage: SESSION_ANY,
  deleteConversation: SESSION_ANY,
  newConversation: SESSION_ANY,
  clearAllConversations: SESSION_ANY,
  getConversations: SESSION_ANY,
  getActiveConversation: SESSION_ANY,
  getAgentStates: LAUNCH_ANY,
  getSettings: SESSION_ANY,
  getConversationSnapshot: SESSION_ANY,
  getConfig: LAUNCH_ANY,
  refreshConfigSnapshot: LAUNCH_ANY,
  openUserConfigFile: LAUNCH_ANY,
  getTabState: SESSION_ANY,
  updateSettings: SESSION_ANY,
  updateTabState: SESSION_ANY,
  openFile: SESSION_ANY,
  revealDocumentLocator: SESSION_ANY,
  revealFile: SESSION_ANY,
  openUrl: LAUNCH_ANY,
  sendToPlugin: SESSION_WORKSPACE,
  invokeAgentCapabilityLifecycle: SESSION_WORKSPACE,
  requestCanvasAuthoringHandoff: SESSION_WORKSPACE,
  'dnd:start': SESSION_WORKSPACE,
  mermaidError: SESSION_ANY,
  downloadSvg: SESSION_WORKSPACE,
  getAgentInputCatalog: SESSION_ANY,
  invokeAgentInput: SESSION_ANY,
  exitCharacterDialogueSession: SESSION_WORKSPACE,
  exitEmbodyCharacterSession: SESSION_WORKSPACE,
  revealContextSource: SESSION_ANY,
  webviewKeyboardFocus: LAUNCH_ANY,
  webviewKeyboardEditable: LAUNCH_ANY,
  projectionEndpointDiscover: SESSION_ANY,
  projectionAttach: SESSION_ANY,
  projectionSnapshotAck: SESSION_ANY,
  projectionDetach: SESSION_ANY,
} as const satisfies AgentHostRouteAuthorityRecord;

export const ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS = {
  sendToPlugin: 'Phase 3',
  invokeAgentCapabilityLifecycle: 'P1.4',
  requestCanvasAuthoringHandoff: 'P1.4',
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

export function createAgentHostWorkspaceScopeRequiredDiagnostic(
  messageType: AgentWebviewToHostMessageType,
): AgentHostWorkspaceScopeRequiredDiagnostic {
  return {
    code: 'workspace-scope-required',
    severity: 'error',
    hostKind: 'electron',
    messageType,
    requiredScope: 'workspace',
    actualScope: 'assistant',
    message: `Agent route '${messageType}' requires an explicitly authorized Workspace scope.`,
  };
}

export function classifyAgentHostRoute(
  messageType: AgentWebviewToHostMessageType,
): AgentHostRouteAuthority {
  return AGENT_HOST_ROUTE_AUTHORITY[messageType];
}
