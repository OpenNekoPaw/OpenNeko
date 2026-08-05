import {
  ELECTRON_AGENT_HOST_ROUTE_COVERAGE,
  type ActivateConversationWebviewMessage,
  type AgentHostToWebviewMessage,
  type AgentWebviewToHostMessage,
  type ProjectionAttachRequest,
  type ProjectionDetachMessage,
  type ProjectionEndpointDiscoverRequest,
  type ProjectionSnapshotAcknowledgement,
  type UpdateTabStateWebviewMessage,
} from '@neko/agent-contracts';
import type { ContentLocator, DocumentLocator } from '@neko/content';
import type { AgentMessageRuntimeRequest } from '../turn/message-runtime';

export interface AgentHostConnectionIdentity {
  readonly hostKind: 'electron';
  readonly applicationId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly workspaceId: string;
  readonly connectionId: string;
}

export interface AgentHostControllerSubscription {
  dispose(): void;
}

export interface AgentHostControllerConnection {
  readonly identity: AgentHostConnectionIdentity;
  post(message: AgentHostToWebviewMessage): void | Promise<void>;
  subscribe(
    listener: (message: AgentWebviewToHostMessage) => void,
  ): AgentHostControllerSubscription;
}

export interface AgentHostRouteEffectContext {
  readonly identity: AgentHostConnectionIdentity;
  post(message: AgentHostToWebviewMessage): void | Promise<void>;
}

export interface AgentHostRouteEffectPort<Message extends AgentWebviewToHostMessage> {
  handle(message: Message, context: AgentHostRouteEffectContext): void | Promise<void>;
}

export interface AgentConversationControllerTurnRequest extends AgentMessageRuntimeRequest {
  readonly source: 'user-message' | 'mermaid-feedback';
  readonly turnId?: string;
}

export interface AgentConversationControllerEffectPort {
  submitTurn(
    request: AgentConversationControllerTurnRequest,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  confirmTool(
    input: {
      readonly conversationId: string;
      readonly toolCallId: string;
      readonly approved: boolean;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  cancelTurn(conversationId: string, context: AgentHostRouteEffectContext): void | Promise<void>;
  createConversation(context: AgentHostRouteEffectContext): void | Promise<void>;
  activateConversation(
    message: ActivateConversationWebviewMessage,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  deleteConversation(
    input: {
      readonly conversationId: string;
      readonly activateNext?: boolean;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  listConversations(context: AgentHostRouteEffectContext): void | Promise<void>;
  readActiveConversation(context: AgentHostRouteEffectContext): void | Promise<void>;
  readAgentStates(context: AgentHostRouteEffectContext): void | Promise<void>;
  readConversationSnapshot(
    conversationId: string,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  readMessageQueue(
    conversationId: string,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  promoteQueuedMessage(
    input: {
      readonly conversationId: string;
      readonly queueItemId: string;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  cancelQueuedMessage(
    input: {
      readonly conversationId: string;
      readonly queueItemId: string;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  editQueuedMessage(
    input: {
      readonly tabId: string;
      readonly conversationId: string;
      readonly queueItemId: string;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  clearHistory(conversationId: string, context: AgentHostRouteEffectContext): void | Promise<void>;
  clearAllConversations(context: AgentHostRouteEffectContext): void | Promise<void>;
}

export interface AgentConfigControllerEffectPort {
  readSettings(conversationId: string, context: AgentHostRouteEffectContext): void | Promise<void>;
  readConfig(context: AgentHostRouteEffectContext): void | Promise<void>;
  refreshConfig(context: AgentHostRouteEffectContext): void | Promise<void>;
  openUserConfig(context: AgentHostRouteEffectContext): void | Promise<void>;
  openHostConfig(context: AgentHostRouteEffectContext): void | Promise<void>;
  readTabState(context: AgentHostRouteEffectContext): void | Promise<void>;
  updateSettings(
    input: {
      readonly conversationId: string;
      readonly settings: Readonly<Record<string, unknown>>;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  updateTabState(
    message: UpdateTabStateWebviewMessage,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
}

export interface AgentSkillControllerEffectPort {
  listSkills(context: AgentHostRouteEffectContext): void | Promise<void>;
  invokeSlashCommand(
    input: {
      readonly conversationId: string;
      readonly command: string;
      readonly args?: string;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  invokeSkill(
    input: {
      readonly conversationId: string;
      readonly skillName: string;
      readonly args?: string;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  readContextTokenCount(
    conversationId: string,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  compressContext(
    conversationId: string,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
}

export interface AgentContentControllerEffectPort {
  searchProjectFiles(
    input: {
      readonly filter: string;
      readonly conversationId?: string;
      readonly purpose?: 'roleplay' | 'entry';
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  openFile(
    input: {
      readonly contentLocator: ContentLocator;
      readonly options?: {
        readonly preview?: boolean;
        readonly line?: number;
        readonly column?: number;
      };
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  revealDocumentLocator(
    input: {
      readonly contentLocator: ContentLocator;
      readonly locator: DocumentLocator;
    },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  revealFile(
    contentLocator: ContentLocator,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  openExternalUrl(url: string, context: AgentHostRouteEffectContext): void | Promise<void>;
  revealContextSource(
    message: Extract<AgentWebviewToHostMessage, { type: 'revealContextSource' }>,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  downloadSvg(
    input: { readonly svg: string; readonly filename: string },
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
}

export interface AgentProjectionControllerEffectPort {
  discoverEndpoint(
    message: ProjectionEndpointDiscoverRequest,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  attach(
    message: ProjectionAttachRequest,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  acknowledge(
    message: ProjectionSnapshotAcknowledgement,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
  detach(
    message: ProjectionDetachMessage,
    context: AgentHostRouteEffectContext,
  ): void | Promise<void>;
}

export const AGENT_CONVERSATION_CONTROLLER_ROUTE_TYPES = [
  'sendMessage',
  'mermaidError',
  'confirmTool',
  'cancelMessage',
  'newConversation',
  'activateConversation',
  'deleteConversation',
  'getConversations',
  'getActiveConversation',
  'getAgentStates',
  'getConversationSnapshot',
  'getMessageQueue',
  'promoteQueuedMessage',
  'cancelQueuedMessage',
  'editQueuedMessage',
  'clearHistory',
  'clearAllConversations',
] as const satisfies readonly AgentWebviewToHostMessage['type'][];

export const AGENT_CONFIG_CONTROLLER_ROUTE_TYPES = [
  'getSettings',
  'getConfig',
  'refreshConfigSnapshot',
  'openUserConfigFile',
  'openConfigFile',
  'getTabState',
  'updateSettings',
  'updateTabState',
] as const satisfies readonly AgentWebviewToHostMessage['type'][];

export const AGENT_SKILL_CONTROLLER_ROUTE_TYPES = [
  'getSkills',
  'invokeSlashCommand',
  'invokeSkill',
  'getContextTokenCount',
  'compressContext',
] as const satisfies readonly AgentWebviewToHostMessage['type'][];

export const AGENT_CONTENT_CONTROLLER_ROUTE_TYPES = [
  'searchProjectFiles',
  'openFile',
  'revealDocumentLocator',
  'revealFile',
  'openUrl',
  'revealContextSource',
  'downloadSvg',
] as const satisfies readonly AgentWebviewToHostMessage['type'][];

export const AGENT_PROJECTION_CONTROLLER_ROUTE_TYPES = [
  'projectionEndpointDiscover',
  'projectionAttach',
  'projectionSnapshotAck',
  'projectionDetach',
] as const satisfies readonly AgentWebviewToHostMessage['type'][];

export const AGENT_SHARED_CONTROLLER_ROUTE_TYPES = [
  ...AGENT_CONVERSATION_CONTROLLER_ROUTE_TYPES,
  ...AGENT_CONFIG_CONTROLLER_ROUTE_TYPES,
  ...AGENT_SKILL_CONTROLLER_ROUTE_TYPES,
  ...AGENT_CONTENT_CONTROLLER_ROUTE_TYPES,
  ...AGENT_PROJECTION_CONTROLLER_ROUTE_TYPES,
] as const satisfies readonly AgentWebviewToHostMessage['type'][];

export type AgentConversationControllerMessage = Extract<
  AgentWebviewToHostMessage,
  { type: (typeof AGENT_CONVERSATION_CONTROLLER_ROUTE_TYPES)[number] }
>;

export type AgentConfigControllerMessage = Extract<
  AgentWebviewToHostMessage,
  { type: (typeof AGENT_CONFIG_CONTROLLER_ROUTE_TYPES)[number] }
>;

export type AgentSkillControllerMessage = Extract<
  AgentWebviewToHostMessage,
  { type: (typeof AGENT_SKILL_CONTROLLER_ROUTE_TYPES)[number] }
>;

export type AgentContentControllerMessage = Extract<
  AgentWebviewToHostMessage,
  { type: (typeof AGENT_CONTENT_CONTROLLER_ROUTE_TYPES)[number] }
>;

export type AgentProjectionControllerMessage = Extract<
  AgentWebviewToHostMessage,
  { type: (typeof AGENT_PROJECTION_CONTROLLER_ROUTE_TYPES)[number] }
>;

export interface AgentHostControllerEffectPorts {
  readonly conversation: AgentConversationControllerEffectPort;
  readonly config: AgentConfigControllerEffectPort;
  readonly skill: AgentSkillControllerEffectPort;
  readonly content: AgentContentControllerEffectPort;
  readonly projection: AgentProjectionControllerEffectPort;
}

type SharedControllerRouteType = (typeof AGENT_SHARED_CONTROLLER_ROUTE_TYPES)[number];
type ElectronImplementedRouteType = {
  [
    Route in keyof typeof ELECTRON_AGENT_HOST_ROUTE_COVERAGE
  ]: (typeof ELECTRON_AGENT_HOST_ROUTE_COVERAGE)[Route] extends 'implemented' ? Route : never;
}[keyof typeof ELECTRON_AGENT_HOST_ROUTE_COVERAGE];
type AssertNever<Value extends never> = Value;
export type AgentSharedControllerMissingRouteCoverage = AssertNever<
  Exclude<ElectronImplementedRouteType, SharedControllerRouteType>
>;
export type AgentSharedControllerUnexpectedRouteCoverage = AssertNever<
  Exclude<SharedControllerRouteType, ElectronImplementedRouteType>
>;
