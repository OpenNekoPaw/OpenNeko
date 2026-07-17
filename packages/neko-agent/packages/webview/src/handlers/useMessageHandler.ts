/**
 * useMessageHandler Hook
 *
 * Provides message handler registry and context creation.
 */

import { useMemo, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  createConfiguredRegistry,
  type MessageHandlerContext,
  type PendingForegroundConversationActivation,
  type QueuedMessageEditRequest,
  type ContextInjectionRequest,
  type StreamingState,
  type ConversationRenderStateUpdater,
} from '@/handlers';
import { getLogger } from '../utils/logger';
import type {
  Message,
  ConversationSummary,
  OpenTab,
  TabType,
  SettingsState,
  AgentState,
  AgentQueuedMessageItem,
} from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import type {
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import type { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import type { ExtensionToWebviewMessage } from './messages';
import {
  bindConversationRenderRuntimeLifecycle,
  createConversationRenderRuntimeLifecycle,
  type ConversationRenderRuntimeLifecycle,
} from '@/render-lifecycle/conversation-render-runtime-lifecycle';
import { getAgentMarkdownSessionRegistry } from '@/markdown/agent-markdown-session-registry';

const logger = getLogger('MessageHandler');
const FOREIGN_FEATURE_HOST_MESSAGE_TYPES = new Set([
  'canvas.hostAppliedDocument',
  'document:load',
  'documentContext',
  'enginePort',
  'featureFlags:update',
  'project:init',
]);
const PROJECTION_HOST_MESSAGE_TYPES = new Set([
  'projectionEndpointReady',
  'projectionSnapshot',
  'projectionPatch',
  'projectionDetach',
  'projectionProtocolDiagnostic',
]);

/**
 * Props for useMessageHandler hook
 */
export interface UseMessageHandlerProps {
  // Current state values
  messages: Message[];
  isThinking: boolean;
  activeConversationId: string | null;
  streamingMessageId: string | null;
  queuedMessageCount: number;
  queuedMessages: readonly AgentQueuedMessageItem[];
  openTabs: OpenTab[];
  activeTabId: string | null;
  isTablessConversationViewRef: MutableRefObject<boolean>;
  pendingForegroundConversationActivationRef?: MutableRefObject<PendingForegroundConversationActivation | null>;
  tabStateRevisionRef: MutableRefObject<number>;
  restoredConversationIdsRef: MutableRefObject<Set<string>>;
  reconcileTabRenderRuntimes: (
    bindings: readonly { readonly tabId: string; readonly conversationId: string }[],
    activeTabId: string | null,
  ) => void;
  completeForegroundConversationActivation?: (conversationId: string) => void;
  requestQueuedMessageEdit?: (request: QueuedMessageEditRequest) => void;
  requestContextInjection?: (request: ContextInjectionRequest) => void;
  requestConfigSnapshot?: () => void;

  // Refs
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;
  conversationRenderCoordinator: ConversationRenderCoordinator;
  updateConversationRenderState: (
    conversationId: string,
    updater: ConversationRenderStateUpdater,
  ) => void;

  // State setters - Conversation
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;

  // State setters - Tabs
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;

  // State setters - Settings
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setHasConfigSnapshot?: React.Dispatch<React.SetStateAction<boolean>>;
  hydrateConversationSettings: MessageHandlerContext['hydrateConversationSettings'];

  // State setters - Work items
  setWorkItemsByConversation: React.Dispatch<React.SetStateAction<AgentWorkItemStore>>;

  // State setters - Project
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  mentionSearchFilter: string;
  mentionSearchFilterRef?: MutableRefObject<string>;
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  setPluginsAvailable: React.Dispatch<React.SetStateAction<PluginsAvailable>>;

  // State setters - Agent state
  setAgentState: React.Dispatch<React.SetStateAction<AgentState | null>>;
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  // Force re-render when agent state changes (for useMemo recalculation)
  forceAgentStateUpdate: () => void;

  // State setters - Skills
  setSkills: React.Dispatch<React.SetStateAction<SkillSummary[]>>;
  setActivationProgressByConversation: React.Dispatch<
    React.SetStateAction<Map<string, readonly ActivationProgressTimeline[]>>
  >;

  // State setters - SSO/Onboarding
  updateSettings: (partial: Partial<SettingsState>) => void;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  setGlobalError: React.Dispatch<React.SetStateAction<string | null>>;
  reportConversationDiagnostic: MessageHandlerContext['reportConversationDiagnostic'];

  // Refs - Context management
  conversationTokenCountRef: MutableRefObject<Map<string, number>>;
  conversationCompressingRef: MutableRefObject<Map<string, boolean>>;
  forceContextUpdate: () => void;
}

/**
 * Hook return type
 */
export interface UseMessageHandlerReturn {
  handleMessage: (event: MessageEvent<ExtensionToWebviewMessage>) => void;
  disposeConversationRendering: (
    conversationId: string,
    reason: 'conversation-delete' | 'confirmed-empty-conversation',
  ) => void;
}

/**
 * Custom hook for message handling
 */
export function useMessageHandler(props: UseMessageHandlerProps): UseMessageHandlerReturn {
  const markdownSessionRegistry = getAgentMarkdownSessionRegistry();
  const renderRuntimeRef = useRef<ConversationRenderRuntimeLifecycle | null>(null);
  renderRuntimeRef.current ??= createConversationRenderRuntimeLifecycle({
    coordinator: props.conversationRenderCoordinator,
    markdown: markdownSessionRegistry,
  });
  const renderRuntime = renderRuntimeRef.current;
  useEffect(() => bindConversationRenderRuntimeLifecycle(renderRuntime), [renderRuntime]);

  const {
    messages,
    isThinking,
    activeConversationId,
    streamingMessageId,
    queuedMessageCount,
    queuedMessages,
    openTabs,
    activeTabId,
    isTablessConversationViewRef,
    pendingForegroundConversationActivationRef,
    tabStateRevisionRef,
    restoredConversationIdsRef,
    reconcileTabRenderRuntimes,
    completeForegroundConversationActivation,
    requestQueuedMessageEdit,
    requestContextInjection,
    requestConfigSnapshot,
    activeConversationIdRef,
    streamingMessageIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationRenderCoordinator,
    updateConversationRenderState,
    setConversations,
    setActiveConversationId,
    setOpenTabs,
    setActiveTabId,
    setActiveTab,
    setSettings,
    setHasConfigSnapshot,
    hydrateConversationSettings,
    setWorkItemsByConversation,

    setProjectFiles,
    mentionSearchFilter,
    mentionSearchFilterRef,
    setMentionItems,
    setPluginCommands,
    setPluginsAvailable,
    setAgentState,
    conversationAgentStateRef,
    forceAgentStateUpdate,
    setSkills,
    setActivationProgressByConversation,
    updateSettings,
    setShowOnboarding,
    setGlobalError,
    reportConversationDiagnostic,
    conversationTokenCountRef,
    conversationCompressingRef,
    forceContextUpdate,
  } = props;

  // Create registry once
  const registry = useMemo(() => createConfiguredRegistry(), []);

  // Helper: check if message is for current conversation
  const isCurrentConversation = useCallback(
    (conversationId?: string): boolean => {
      if (!conversationId) return false;
      return conversationId === activeConversationIdRef.current;
    },
    [activeConversationIdRef],
  );

  // Create context object
  const context = useMemo<MessageHandlerContext>(
    () => ({
      activeConversationId,
      activeConversationIdRef,
      conversationMessagesRef,
      conversationStreamingRef,
      messages,
      isThinking,
      streamingMessageId,
      queuedMessageCount,
      queuedMessages,
      streamingMessageIdRef,
      setConversations,
      setActiveConversationId,
      openTabs,
      activeTabId,
      isTablessConversationViewRef,
      requestConfigSnapshot,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      setSettings,
      setHasConfigSnapshot,
      hydrateConversationSettings,
      setWorkItemsByConversation,

      setProjectFiles,
      mentionSearchFilter,
      mentionSearchFilterRef,
      setMentionItems,
      setPluginCommands,
      setPluginsAvailable,
      setAgentState,
      conversationAgentStateRef,
      forceAgentStateUpdate,
      setSkills,
      setActivationProgressByConversation,
      updateSettings,
      setShowOnboarding,
      setGlobalError,
      reportConversationDiagnostic,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceUpdate: forceContextUpdate,
      isCurrentConversation,
      updateConversationRenderState,
      markdownSessionRegistry,
      conversationRenderCoordinator,
      disposeConversationRendering: renderRuntime.disposeConversation,
      pendingForegroundConversationActivationRef,
      tabStateRevisionRef,
      restoredConversationIdsRef,
      reconcileTabRenderRuntimes,
      completeForegroundConversationActivation,
      requestQueuedMessageEdit,
      requestContextInjection,
    }),
    [
      activeConversationId,
      activeConversationIdRef,
      conversationMessagesRef,
      conversationStreamingRef,
      messages,
      isThinking,
      streamingMessageId,
      queuedMessageCount,
      queuedMessages,
      streamingMessageIdRef,
      setConversations,
      setActiveConversationId,
      openTabs,
      activeTabId,
      isTablessConversationViewRef,
      requestConfigSnapshot,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      setSettings,
      setHasConfigSnapshot,
      hydrateConversationSettings,
      setWorkItemsByConversation,

      setProjectFiles,
      mentionSearchFilter,
      mentionSearchFilterRef,
      setMentionItems,
      setPluginCommands,
      setPluginsAvailable,
      setAgentState,
      conversationAgentStateRef,
      forceAgentStateUpdate,
      setSkills,
      setActivationProgressByConversation,
      updateSettings,
      setShowOnboarding,
      setGlobalError,
      reportConversationDiagnostic,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceContextUpdate,
      isCurrentConversation,
      updateConversationRenderState,
      markdownSessionRegistry,
      conversationRenderCoordinator,
      renderRuntime,
      pendingForegroundConversationActivationRef,
      tabStateRevisionRef,
      reconcileTabRenderRuntimes,
      completeForegroundConversationActivation,
      requestQueuedMessageEdit,
      requestContextInjection,
    ],
  );

  // Message handler function
  const handleMessage = useCallback(
    (event: MessageEvent<ExtensionToWebviewMessage>): void => {
      const message = event.data;
      if (!message || !message.type) return;
      if (isForeignFeatureHostMessage(message) || isProjectionHostMessage(message)) return;

      const handled = registry.handle(message, context);
      if (!handled) {
        logger.warn(`Unknown message type: ${message.type}`);
      }
    },
    [registry, context],
  );

  return {
    handleMessage,
    disposeConversationRendering: renderRuntime.disposeConversation,
  };
}

export function isProjectionHostMessage(message: unknown): boolean {
  if (!isRecord(message)) return false;
  const type = message['type'];
  return typeof type === 'string' && PROJECTION_HOST_MESSAGE_TYPES.has(type);
}

function isForeignFeatureHostMessage(message: unknown): boolean {
  if (!isRecord(message)) {
    return false;
  }
  const type = message['type'];
  return (
    typeof type === 'string' &&
    (FOREIGN_FEATURE_HOST_MESSAGE_TYPES.has(type) || type.startsWith('media:response:'))
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
