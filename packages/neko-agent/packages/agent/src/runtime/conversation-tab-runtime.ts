import {
  AGENT_WEBVIEW_PROTOCOL_VERSION,
  buildAgentSessionDiagnosticMessage,
  buildAmbientCanvasUpdateMessage,
  buildExternalInputMessage,
  buildInjectContextMessage,
  buildPluginCommandsMessage,
  buildTabStateMessage,
  type AmbientCanvasUpdateMessage,
  type ExternalMessage,
  type AgentSessionDiagnosticMessage,
  type InjectContextMessage,
  projectTabStateUpdate,
  resolveActiveTabConversationId,
  type OpenTab,
  type PluginCommandsMessage,
  type PrefillInputMessage,
  type TabState,
  type TabStateMessage,
} from '@neko-agent/types';
import type { AgentContextPayload } from '@neko/shared';

export type ConversationTabSyncReason =
  | 'no-active-tab-conversation'
  | 'already-active'
  | 'switch-rejected'
  | 'empty-tab-state-preserved-active-conversation';

export type ConversationTabSyncResult =
  | {
      kind: 'active-conversation-cleared';
    }
  | {
      kind: 'switched';
      conversationId: string;
    }
  | {
      kind: 'character-dialogue-active';
      sessionId: string;
    }
  | {
      kind: 'embody-character-active';
      sessionId: string;
    }
  | {
      kind: 'skipped';
      reason: ConversationTabSyncReason;
      conversationId?: string;
    };

export interface ConversationTabRuntimeEffects {
  hasConversation(conversationId: string): boolean;
  hasCharacterDialogueSession?(sessionId: string): boolean;
  hasEmbodyCharacterSession?(sessionId: string): boolean;
  getActiveConversationId(): string | null;
  switchConversation(conversationId: string): boolean;
  shouldClearActiveConversationForEmptyTabState?(conversationId: string): boolean;
  clearActiveConversation?(): void;
  onConversationSwitched?(conversationId: string): void;
}

export interface SyncActiveConversationFromTabStateInput {
  tabState: TabState;
}

export interface UpdateTabStateRuntimeInput {
  openTabs: readonly OpenTab[];
  activeTabId: string | null;
}

export interface UpdateTabStateRuntimeResult {
  tabState: TabState;
  sync: ConversationTabSyncResult;
}

export interface ConversationTabBinding {
  readonly tabId: string;
  readonly conversationId: string;
}

export type ChatRestorePlanAction =
  | { type: 'syncCanvasAmbientScope' }
  | { type: 'sendConversationList' }
  | { type: 'sendSettings'; conversationId: string }
  | { type: 'postTabState'; message: TabStateMessage }
  | { type: 'sendActiveConversationTasks' }
  | { type: 'sendAgentStateSnapshot' }
  | { type: 'postPluginCommands'; message: PluginCommandsMessage };

export interface BuildChatRestorePlanInput {
  tabState: TabState;
  tabStateRevision: number;
  hasWebview: boolean;
  pluginCommands?: NonNullable<PluginCommandsMessage['commands']>;
}

export interface ChatRestorePlan {
  actions: ChatRestorePlanAction[];
}

export function syncActiveConversationFromTabState(
  input: SyncActiveConversationFromTabStateInput,
  effects: ConversationTabRuntimeEffects,
): ConversationTabSyncResult {
  if (input.tabState.openTabs.length === 0) {
    const activeConversationId = effects.getActiveConversationId();
    if (activeConversationId) {
      if (!effects.shouldClearActiveConversationForEmptyTabState?.(activeConversationId)) {
        return {
          kind: 'skipped',
          reason: 'empty-tab-state-preserved-active-conversation',
          conversationId: activeConversationId,
        };
      }
      effects.clearActiveConversation?.();
      return { kind: 'active-conversation-cleared' };
    }
    return { kind: 'skipped', reason: 'no-active-tab-conversation' };
  }

  const conversationId = resolveActiveTabConversationId({
    tabState: input.tabState,
    hasConversation: effects.hasConversation,
    hasCharacterDialogueSession: effects.hasCharacterDialogueSession,
    hasEmbodyCharacterSession: effects.hasEmbodyCharacterSession,
  });

  if (!conversationId) {
    return { kind: 'skipped', reason: 'no-active-tab-conversation' };
  }

  const activeTab = input.tabState.activeTabId
    ? input.tabState.openTabs.find((tab) => tab.id === input.tabState.activeTabId)
    : undefined;
  if (activeTab?.kind === 'character-dialogue') {
    return { kind: 'character-dialogue-active', sessionId: conversationId };
  }
  if (activeTab?.kind === 'embody-character') {
    return { kind: 'embody-character-active', sessionId: conversationId };
  }

  if (effects.getActiveConversationId() === conversationId) {
    return { kind: 'skipped', reason: 'already-active', conversationId };
  }

  if (!effects.switchConversation(conversationId)) {
    return { kind: 'skipped', reason: 'switch-rejected', conversationId };
  }

  effects.onConversationSwitched?.(conversationId);
  return { kind: 'switched', conversationId };
}

export function updateTabStateRuntime(
  input: UpdateTabStateRuntimeInput,
  effects: ConversationTabRuntimeEffects,
): UpdateTabStateRuntimeResult {
  const tabState = projectTabStateUpdate(input);
  return {
    tabState,
    sync: syncActiveConversationFromTabState({ tabState }, effects),
  };
}

export function requireActiveConversationTabBinding(
  tabState: TabState,
  operation: string,
): ConversationTabBinding {
  const tabId = tabState.activeTabId;
  const activeTab = tabId ? tabState.openTabs.find((tab) => tab.id === tabId) : undefined;
  if (!tabId || !activeTab) {
    throw new Error(`Cannot ${operation} without an active conversation Tab.`);
  }
  return { tabId, conversationId: activeTab.conversationId };
}

export function buildChatAmbientCanvasUpdateMessage(input: {
  nodes: AmbientCanvasUpdateMessage['nodes'];
  conversationId: string | null;
}): AmbientCanvasUpdateMessage {
  return buildAmbientCanvasUpdateMessage(input);
}

export function buildChatContextInjectionMessage(
  payload: AgentContextPayload,
  input: { tabId: string; conversationId: string },
): InjectContextMessage {
  return buildInjectContextMessage(payload, input);
}

export function buildChatExternalInputMessage(input: {
  message: string;
  autoSend: boolean;
}): ExternalMessage | PrefillInputMessage {
  return buildExternalInputMessage(input);
}

export function buildChatPluginCommandsMessage(
  commands: NonNullable<PluginCommandsMessage['commands']>,
): PluginCommandsMessage {
  return buildPluginCommandsMessage(commands);
}

export function buildChatTabStateMessage(tabState: TabState, revision: number): TabStateMessage {
  return buildTabStateMessage(tabState, revision);
}

export function buildInvalidWebviewPayloadMessage(raw: unknown): AgentSessionDiagnosticMessage {
  const messageType = readMessageType(raw);
  if (messageType === 'projectionEndpointDiscover') {
    const receivedVersion = readProtocolVersion(raw);
    return buildAgentSessionDiagnosticMessage({
      code: 'webview-protocol-mismatch',
      action: messageType,
      message: `Agent Webview protocol mismatch: Extension expects v${AGENT_WEBVIEW_PROTOCOL_VERSION}, Webview sent ${receivedVersion === null ? 'no version' : `v${receivedVersion}`}. Reload the Webview.`,
    });
  }
  const keys = readMessageKeys(raw);
  return buildAgentSessionDiagnosticMessage({
    code: 'invalid-webview-message',
    ...(messageType ? { action: messageType } : {}),
    message: `Invalid Agent Webview message${messageType ? ` "${messageType}"` : ''}; payload keys: ${keys.length > 0 ? keys.join(', ') : '(none)'}.`,
  });
}

function readMessageType(raw: unknown): string | null {
  return isRecord(raw) && typeof raw.type === 'string' ? raw.type : null;
}

function readProtocolVersion(raw: unknown): number | null {
  return isRecord(raw) && typeof raw.protocolVersion === 'number' ? raw.protocolVersion : null;
}

function readMessageKeys(raw: unknown): string[] {
  return isRecord(raw) ? Object.keys(raw).sort() : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildChatRestorePlan(input: BuildChatRestorePlanInput): ChatRestorePlan {
  const actions: ChatRestorePlanAction[] = [{ type: 'sendConversationList' }];

  if (!input.hasWebview) {
    return { actions };
  }

  const activeTab = input.tabState.activeTabId
    ? input.tabState.openTabs.find((tab) => tab.id === input.tabState.activeTabId)
    : undefined;
  if (activeTab) {
    actions.push({ type: 'sendSettings', conversationId: activeTab.conversationId });
  }
  actions.push({
    type: 'postTabState',
    message: buildTabStateMessage(input.tabState, input.tabStateRevision),
  });

  actions.push({ type: 'sendActiveConversationTasks' }, { type: 'sendAgentStateSnapshot' });

  if (input.pluginCommands) {
    actions.push({
      type: 'postPluginCommands',
      message: buildPluginCommandsMessage(input.pluginCommands),
    });
  }

  return { actions };
}
