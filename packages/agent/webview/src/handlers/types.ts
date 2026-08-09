/**
 * Message Handler Types
 *
 * Defines the context and handler interfaces for message processing.
 */

import type { MutableRefObject } from 'react';
import type { AgentContextPayload } from '@neko/agent-contracts';
import type { AgentHostToWebviewMessage, MessageOfType } from './messages';
import type {
  AgentInputCatalogMessage,
  Message,
  ConversationSummary,
  OpenTab,
  TabType,
  SettingsState,
  ShellExecutionMode,
  AgentState,
  AgentQueuedMessageItem,
  AgentSessionDiagnosticMessage,
} from '@neko/agent-contracts';
import type { AgentMarkdownSessionRegistry } from '../markdown/agent-markdown-session-registry';
import type { ActivationProgressTimeline } from '../presenters/activation-progress-presenter';
import type { AgentWorkItemStore } from '../components/AgentWorkItem';
import type { PluginsAvailable } from '../components/ChatView/SendToMenu';
import type { ProjectFileInfo } from '../hooks/useConfigState';
import type { MentionItem, PluginSlashCommandDef } from '../components/ChatView/InputArea/types';
import type { ConversationRenderCoordinator } from '../render-lifecycle/conversation-render-coordinator';
import type {
  ConversationRenderStateUpdater as CanonicalConversationRenderStateUpdater,
  ConversationRenderStreamingState,
} from '../render-lifecycle/conversation-render-state-adapter';
import type { AgentHostMessageSender } from '../messages';

/**
 * Streaming state for a conversation
 */
export type StreamingState = ConversationRenderStreamingState;

export type PendingForegroundConversationActivation =
  | {
      readonly reason: 'new-conversation';
      readonly previousConversationIds: readonly string[];
    }
  | {
      readonly reason: 'switch-conversation';
      readonly conversationId: string;
      readonly activationId: number;
    };

/**
 * Conversation-scoped render-state update function signature.
 */
export type ConversationRenderStateUpdater =
  CanonicalConversationRenderStateUpdater<StreamingState>;

// =============================================================================
// Semantic sub-interfaces grouped by responsibility
// =============================================================================

/** Chat streaming state: message list, thinking indicator, streaming ID */
export interface ChatStateContext {
  messages: Message[];
  isThinking: boolean;
  streamingMessageId: string | null;
  queuedMessageCount?: number;
  queuedMessages?: readonly AgentQueuedMessageItem[];
  streamingMessageIdRef: MutableRefObject<string | null>;
}

/** Active conversation identity. Render snapshots are owned by the coordinator. */
export interface ConversationRefContext {
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
}

/** Tab management: open tabs, active tab selection */
export interface TabContext {
  openTabs: OpenTab[];
  activeTabId: string | null;
  isTablessConversationViewRef: MutableRefObject<boolean>;
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  requestConfigSnapshot?: () => void;
}

/** Settings and model configuration */
export interface SettingsContext {
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setHasConfigSnapshot?: React.Dispatch<React.SetStateAction<boolean>>;
  hydrateConversationSettings: (
    conversationId: string,
    snapshot: ConversationSettingsSnapshot,
  ) => void;
  updateSettings: (partial: Partial<SettingsState>) => void;
}

export interface ConversationSettingsSnapshot {
  readonly selectedModel: string;
  readonly availableModelIds: readonly string[];
  readonly defaultMediaModels: Readonly<Partial<Record<'image' | 'video' | 'audio', string>>>;
  readonly executionMode: ShellExecutionMode;
  readonly settingsPatch: Partial<SettingsState>;
}

/** Per-conversation agent execution state */
export interface AgentStateContext {
  setAgentState: React.Dispatch<React.SetStateAction<AgentState | null>>;
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  forceAgentStateUpdate: () => void;
}

/** Pi Skill catalog plus independent capability activation progress. */
export interface SkillContext {
  setAgentInputCatalogByConversation?: React.Dispatch<
    React.SetStateAction<Map<string, AgentInputCatalogMessage>>
  >;
  setActivationProgressByConversation: React.Dispatch<
    React.SetStateAction<Map<string, readonly ActivationProgressTimeline[]>>
  >;
}

/** Global, non-conversation-scoped UI notifications */
export interface GlobalNotificationContext {
  setGlobalError: React.Dispatch<React.SetStateAction<string | null>>;
  reportConversationDiagnostic: (diagnostic: AgentSessionDiagnosticMessage) => void;
}

export interface QueuedMessageEditRequest {
  readonly tabId: string;
  readonly conversationId: string;
  readonly item: AgentQueuedMessageItem;
}

export interface ContextInjectionRequest {
  readonly tabId: string;
  readonly conversationId: string;
  readonly payload: AgentContextPayload;
}

/** Context window token tracking and compression */
export interface ContextManagementContext {
  conversationTokenCountRef: MutableRefObject<Map<string, number>>;
  conversationCompressingRef: MutableRefObject<Map<string, boolean>>;
  forceUpdate: () => void;
}

/** Routing helpers for current/non-current conversation updates */
export interface HelperContext {
  /** Required canonical message/item-scoped normalized Markdown session owner. */
  markdownSessionRegistry?: AgentMarkdownSessionRegistry;
  /** Canonical Webview-local owner for conversation render snapshots and activation. */
  conversationRenderCoordinator: ConversationRenderCoordinator;
  disposeConversationRendering?: (
    conversationId: string,
    reason: 'conversation-delete' | 'confirmed-empty-conversation',
  ) => void;
  isCurrentConversation: (conversationId?: string) => boolean;
  updateConversationRenderState: (
    conversationId: string,
    updater: ConversationRenderStateUpdater,
  ) => void;
  pendingForegroundConversationActivationRef?: MutableRefObject<PendingForegroundConversationActivation | null>;
  /** Conversations whose restore snapshots were requested in this Webview realm. */
  restoredConversationIdsRef?: MutableRefObject<Set<string>>;
  reconcileTabRenderRuntimes?: (
    bindings: readonly { readonly tabId: string; readonly conversationId: string }[],
    activeTabId: string | null,
  ) => void;
  completeForegroundConversationActivation?: (conversationId: string) => void;
  requestQueuedMessageEdit?: (request: QueuedMessageEditRequest) => void;
  requestContextInjection?: (request: ContextInjectionRequest) => void;
}

// =============================================================================
// Full context via intersection — 100% backward compatible
// =============================================================================

/**
 * Message handler context - provides access to all state and actions.
 *
 * Composed from semantic sub-interfaces so individual handlers can
 * reference only the subset they need (e.g., `ChatStateContext & ConversationRefContext`).
 */
export interface MessageHandlerContext
  extends
    ChatStateContext,
    ConversationRefContext,
    TabContext,
    SettingsContext,
    AgentStateContext,
    SkillContext,
    GlobalNotificationContext,
    ContextManagementContext,
    HelperContext {
  readonly agentHostMessages: AgentHostMessageSender;
  // Conversation list management
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  // Observable work items
  setWorkItemsByConversation: React.Dispatch<React.SetStateAction<AgentWorkItemStore>>;
  // Project files
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  // Unified @mention items (files + canvas nodes + characters)
  mentionSearchFilter: string;
  mentionSearchFilterRef?: MutableRefObject<string>;
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  // Plugin slash commands registered by external extensions
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  setPluginsAvailable: React.Dispatch<React.SetStateAction<PluginsAvailable>>;
  // SSO/Onboarding
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
}

export type WebviewMessageType = AgentHostToWebviewMessage['type'];

/**
 * Type guard that keeps the runtime dispatch boundary aligned with the protocol union.
 */
function isMessageOfType<T extends WebviewMessageType>(
  message: AgentHostToWebviewMessage,
  type: T,
): message is MessageOfType<T> {
  return message.type === type;
}

/**
 * Message handler function signature bound to a concrete protocol message type.
 */
export type MessageHandler<T extends WebviewMessageType = WebviewMessageType> = (
  message: MessageOfType<T>,
  context: MessageHandlerContext,
) => void;

/**
 * Type-safe message handler that receives a narrowed message type.
 *
 * Usage: `const handler: TypedMessageHandler<'agentPhase'> = (message, ctx) => { ... }`
 * The `message` parameter is automatically narrowed to `AgentPhaseMessage`.
 */
export type TypedMessageHandler<T extends WebviewMessageType> = (
  message: MessageOfType<T>,
  context: MessageHandlerContext,
) => void;

/**
 * Erased dispatcher stored by the registry after defineHandler() validates the
 * concrete type/handler pairing at the module boundary.
 */
export type ProtocolMessageDispatcher = (
  message: AgentHostToWebviewMessage,
  context: MessageHandlerContext,
) => void;

/**
 * Message handler registration
 */
export interface HandlerRegistration<T extends WebviewMessageType = WebviewMessageType> {
  type: T;
  handler: ProtocolMessageDispatcher;
}

export function defineHandler<T extends WebviewMessageType>(
  type: T,
  handler: MessageHandler<T>,
): HandlerRegistration<T> {
  return {
    type,
    handler: (message, context) => {
      if (isMessageOfType(message, type)) {
        handler(message, context);
      }
    },
  };
}
