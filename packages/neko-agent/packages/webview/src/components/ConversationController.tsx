/**
 * ConversationController — Session orchestration layer.
 *
 * Responsibilities:
 *   - Conversation state (messages, tabs, active conversation)
 *   - Per-conversation ref Maps (tokenCount, compressing, agentState, mediaCallCount)
 *   - Message handler registration and event listener
 *   - Tab and conversation CRUD callbacks
 *   - Context chips and ambient nodes
 *   - Skills state
 *   - Delegates view composition to ChatWorkspace
 *
 * Extracted from the former 589-line AIAssistant component (ADR P0.1).
 */

import {
  type ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  NEKO_AGENT_HOST_MESSAGE_EVENT,
  type ExtensionToWebviewMessage,
  SettingsState,
  AgentState,
  type AgentSessionDiagnosticMessage,
  Message,
  OpenTab,
  SessionMode,
  TabType,
} from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import type {
  SkillSummary,
  EntryPromptMenu,
  MentionItem,
  PluginSlashCommandDef,
  GenCategory,
  GenerationParams,
} from '@/components/ChatView/InputArea/types';
import { EmptyState, type EmptyStateEntryAction } from '@/components/ChatView/EmptyState';
import { InputArea } from '@/components/ChatView/InputArea';
import {
  InputAreaProvider,
  type MediaCategory,
  type MediaModelSelection,
} from '@/components/ChatView/InputAreaContext';
import { useTranslation } from '@/i18n/I18nContext';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import { removeConversationWorkItems } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import {
  useConversationState,
  useTabManager,
  type PendingSendInput,
  type ConversationRenderStateUpdater,
} from '@/hooks';
import { useMessageHandler, type PendingForegroundConversationActivation } from '@/handlers';
import type { ConversationSettingsSnapshot } from '@/handlers/types';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import { shouldActivateForegroundConversation } from '@/handlers/foreground-activation';
import { ConversationTabRuntimeView } from './ConversationTabRuntimeView';
import { useRetainedTabComponents } from '@/render-runtime/useRetainedTabComponents';
import { isCharacterRoleConversationKind } from '@/presenters/character-role-session-presenter';
import { discardConversationSnapshotProjection } from '@/render-lifecycle/conversation-render-state-adapter';
import type { ForegroundConversationAvailability } from '@/render-lifecycle/conversation-render-contract';
import {
  applyUserMessageToConversationSummaries,
  applyUserMessageToOpenTabs,
  projectDisplayTabs,
  type DisplayTab,
} from '@/presenters/tab-display-presenter';
import {
  projectHistoryCleanup,
  projectHistoryConversationItems,
  type HistoryConversationItem,
} from '@/presenters/history-menu-presenter';
import { projectOptimisticQueuedMessageItem } from '@/presenters/message-queue-presenter';
import {
  projectChatWorkspaceModelState,
  projectMediaModelSelectionDefaults,
  projectMediaModelSelectionForSessionModeChange,
} from '@/presenters/config-message-presenter';
import {
  type ConversationAmbientNode,
  type ConversationSessionState,
  projectConversationSessionState,
} from '@/presenters/conversation-session-state-presenter';
import { DEFAULT_GENERATION_PARAMS } from '@/components/ChatView/InputArea/types';
import { useTabRenderRuntimeRegistry } from '@/render-runtime/useTabRenderRuntimeRegistry';
import { useProjectionEndpoint } from '@/render-runtime/useProjectionEndpoint';
import type { AgentContextPayload } from '@neko/shared';

// =============================================================================
// Props
// =============================================================================

interface HeaderRenderProps {
  tabs: DisplayTab[];
  activeTabId: string | null;
  activeView: TabType;
  historyConversations: HistoryConversationItem[];
  activeConversationId: string | null;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearClosedConversations: () => void;
  clearableConversationCount: number;
  protectedConversationCount: number;
}

export interface ConversationControllerProps {
  // From AppShell (config + resource state)
  settings: SettingsState;
  hasConfigSnapshot: boolean;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setHasConfigSnapshot: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  mentionItems: MentionItem[];
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  mentionSearchFilter: string;
  setMentionSearchFilter: React.Dispatch<React.SetStateAction<string>>;
  pluginCommands: PluginSlashCommandDef[];
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  updateSettings: (partial: Partial<SettingsState>) => void;
  workItemsByConversation: AgentWorkItemStore;
  setWorkItemsByConversation: React.Dispatch<React.SetStateAction<AgentWorkItemStore>>;
  pluginsAvailable: PluginsAvailable;
  setPluginsAvailable: React.Dispatch<React.SetStateAction<PluginsAvailable>>;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  renderHeader: (props: HeaderRenderProps) => ReactNode;
}

// =============================================================================
// Component
// =============================================================================

function applyConversationSettingsSnapshot(
  store: import('@/render-runtime/tab-render-runtime').TabRenderStore,
  snapshot: ConversationSettingsSnapshot,
): void {
  store.updateState((state) => {
    const hasValidSelection = snapshot.availableModelIds.includes(state.selectedModel);
    if (state.modelConfigurationInitialized) {
      return hasValidSelection ? {} : { selectedModel: snapshot.selectedModel };
    }
    const mediaDefaults = projectMediaModelSelectionDefaults({
      selection: state.mediaModelSelection,
      defaults: snapshot.defaultMediaModels,
    });
    return {
      modelConfigurationInitialized: true,
      selectedModel: hasValidSelection ? state.selectedModel : snapshot.selectedModel,
      mediaModelSelection: mediaDefaults.selection,
      executionMode: snapshot.executionMode,
    };
  });
}

export function ConversationController({
  settings,
  hasConfigSnapshot,
  setSettings,
  setHasConfigSnapshot,
  setProjectFiles,
  mentionItems,
  setMentionItems,
  mentionSearchFilter,
  setMentionSearchFilter,
  pluginCommands,
  setPluginCommands,
  updateSettings,
  workItemsByConversation,
  setWorkItemsByConversation,
  pluginsAvailable,
  setPluginsAvailable,
  setShowOnboarding,
  renderHeader,
}: ConversationControllerProps) {
  const { t } = useTranslation();
  // ---- Conversation state ----
  const conversation = useConversationState();
  const {
    messages,
    isThinking,
    streamingMessageId,
    queuedMessageCount,
    queuedMessages,
    streamingMessageIdRef,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationRenderCoordinator,
    updateConversationRenderState: commitConversationRenderState,
    clearVisibleState,
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
  } = conversation;
  const tabRenderRuntimeRegistry = useTabRenderRuntimeRegistry(openTabs, activeTabId);
  useProjectionEndpoint(tabRenderRuntimeRegistry, openTabs);

  // ---- UI state for active tab ----
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const activeTabConversationId = activeTabId
    ? (openTabs.find((tab) => tab.id === activeTabId)?.conversationId ?? null)
    : null;
  const activeOpenTab = activeTabId ? openTabs.find((tab) => tab.id === activeTabId) : undefined;
  const visibleConversationId = activeTabId ? activeTabConversationId : activeConversationId;

  // The tabless entry composer owns only defaults for creating the next conversation.
  const [entrySelectedModel, setEntrySelectedModel] = useState('');
  const [entryMediaModelSelection, setEntryMediaModelSelection] = useState<MediaModelSelection>({
    image: 'none',
    video: 'none',
    audio: 'none',
  });
  const settingsSnapshotByConversationRef = useRef<Map<string, ConversationSettingsSnapshot>>(
    new Map(),
  );
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [foregroundAvailabilityByConversation, setForegroundAvailabilityByConversation] = useState<
    Map<string, ForegroundConversationAvailability>
  >(() => new Map());
  const [entryAction, setEntryAction] = useState<EmptyStateEntryAction>('start-chat');
  const [entryInputValue, setEntryInputValue] = useState('');
  const entryInputValueRef = useRef('');
  const [entryContextReferences, setEntryContextReferences] = useState<AgentContextPayload[]>([]);
  const [entrySessionMode, setEntrySessionMode] = useState<SessionMode>('agent');
  const [entryGenCategory, setEntryGenCategory] = useState<GenCategory>('image');
  const [entryGenParams, setEntryGenParams] = useState<GenerationParams>(DEFAULT_GENERATION_PARAMS);

  // ---- Per-conversation ref Maps ----
  const conversationTokenCountRef = useRef<Map<string, number>>(new Map());
  const conversationCompressingRef = useRef<Map<string, boolean>>(new Map());
  const conversationMediaCallCountRef = useRef<Map<string, number>>(new Map());
  const [projectionVersion, forceUpdate] = useState(0);

  const mentionSearchFilterRef = useRef(mentionSearchFilter);
  useEffect(() => {
    mentionSearchFilterRef.current = mentionSearchFilter;
  }, [mentionSearchFilter]);
  const updateMentionSearchFilter = useCallback(
    (filter: string) => {
      mentionSearchFilterRef.current = filter;
      setMentionSearchFilter(filter);
    },
    [setMentionSearchFilter],
  );
  const updateEntryInputValue = useCallback((value: string) => {
    entryInputValueRef.current = value;
    setEntryInputValue(value);
  }, []);
  const addEntryContextReference = useCallback((payload: AgentContextPayload) => {
    setEntryContextReferences((current) =>
      current.some((reference) => reference.id === payload.id) ? current : [...current, payload],
    );
  }, []);
  const removeEntryContextReference = useCallback((id: string) => {
    setEntryContextReferences((current) => current.filter((reference) => reference.id !== id));
  }, []);
  const hydrateConversationSettings = useCallback(
    (conversationId: string, snapshot: ConversationSettingsSnapshot) => {
      settingsSnapshotByConversationRef.current.set(conversationId, snapshot);
      for (const runtime of tabRenderRuntimeRegistry.getByConversation(conversationId)) {
        applyConversationSettingsSnapshot(runtime.store, snapshot);
      }
    },
    [tabRenderRuntimeRegistry],
  );

  // ---- Skills state ----
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [activationProgressByConversation, setActivationProgressByConversation] = useState<
    Map<string, readonly ActivationProgressTimeline[]>
  >(() => new Map());

  // ---- Agent state ----
  const [, setAgentState] = useState<AgentState | null>(null);
  const conversationAgentStateRef = useRef<Map<string, AgentState>>(new Map());
  const forceAgentStateUpdate = useCallback(() => forceUpdate((n) => n + 1), []);
  const isTablessConversationViewRef = useRef(false);
  const pendingForegroundConversationActivationRef =
    useRef<PendingForegroundConversationActivation | null>(null);
  const tabStateRevisionRef = useRef(0);
  const restoredConversationIdsRef = useRef(new Set<string>());
  const [isForegroundConversationActivationPending, setIsForegroundConversationActivationPending] =
    useState(false);
  const reportConversationDiagnostic = useCallback(
    (diagnostic: AgentSessionDiagnosticMessage) => {
      const conversationId = diagnostic.conversationId;
      if (!conversationId) {
        setGlobalError(`${diagnostic.code}: ${diagnostic.message}`);
        return;
      }
      const message = `${diagnostic.code}: ${diagnostic.message}`;
      for (const runtime of tabRenderRuntimeRegistry.getByConversation(conversationId)) {
        runtime.store.updateState((state) => ({
          diagnostics: [...state.diagnostics, diagnostic],
        }));
      }
      const pending = pendingForegroundConversationActivationRef.current;
      const rejectsPendingActivation =
        pending?.reason === 'switch-conversation' &&
        pending.conversationId === conversationId &&
        (diagnostic.action === 'activate-conversation' ||
          diagnostic.code === 'unknown-conversation' ||
          diagnostic.code === 'deleted-conversation');
      if (rejectsPendingActivation) {
        setForegroundAvailabilityByConversation((previous) => {
          const next = new Map(previous);
          next.set(conversationId, { kind: 'unavailable', diagnostic: message });
          return next;
        });
      }
    },
    [tabRenderRuntimeRegistry],
  );
  const nextPendingSendRequestIdRef = useRef(0);
  const [pendingSendRequest, setPendingSendRequest] = useState<{
    id: number;
    input: PendingSendInput;
  } | null>(null);
  const nextEntryPromptMenuRequestIdRef = useRef(0);
  const [initialEntryPromptMenuRequest, setInitialEntryPromptMenuRequest] = useState<{
    id: number;
    menu: EntryPromptMenu;
  } | null>(null);
  const nextInitialInputRequestIdRef = useRef(0);
  const [initialInputRequest, setInitialInputRequest] = useState<{
    id: number;
    messageText: string;
  } | null>(null);
  const [entryPromptMenu, setEntryPromptMenu] = useState<EntryPromptMenu | null>(null);
  const nextQueuedEditRequestIdRef = useRef(0);

  // ---- Context chips & ambient nodes ----
  const [ambientNodesByConversation, setAmbientNodesByConversation] = useState<
    Map<string, ConversationAmbientNode[]>
  >(() => new Map());
  const setAmbientNodesForConversation = useCallback(
    (conversationId: string, value: React.SetStateAction<ConversationAmbientNode[]>) => {
      setAmbientNodesByConversation((prev) => {
        const current = prev.get(conversationId) ?? [];
        const nextValue = typeof value === 'function' ? value(current) : value;
        const next = new Map(prev);
        if (nextValue.length === 0) {
          next.delete(conversationId);
        } else {
          next.set(conversationId, [...nextValue]);
        }
        return next;
      });
    },
    [],
  );

  const cleanupConversation = useCallback(
    (conversationId: string) => {
      settingsSnapshotByConversationRef.current.delete(conversationId);
      conversationTokenCountRef.current.delete(conversationId);
      conversationCompressingRef.current.delete(conversationId);
      conversationMediaCallCountRef.current.delete(conversationId);
      setWorkItemsByConversation((prev) => removeConversationWorkItems(prev, conversationId));
      setActivationProgressByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
      setAmbientNodesByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
    },
    [setWorkItemsByConversation],
  );

  // ---- Derived state for retained Tab conversations ----
  const sessionStateByConversation = useMemo(() => {
    const conversationIds = new Set(openTabs.map((tab) => tab.conversationId));
    if (visibleConversationId) conversationIds.add(visibleConversationId);

    const messagesByConversation = new Map(conversationMessagesRef.current);
    const streamingByConversation = new Map(conversationStreamingRef.current);
    const states = new Map<string, ConversationSessionState>();
    for (const conversationId of conversationIds) {
      states.set(
        conversationId,
        projectConversationSessionState({
          conversationId,
          messagesByConversation,
          streamingByConversation,
          activationProgressByConversation,
          ambientNodesByConversation,
          tokenCountByConversation: conversationTokenCountRef.current,
          compressingByConversation: conversationCompressingRef.current,
          agentStateByConversation: conversationAgentStateRef.current,
          workItemsByConversation,
        }),
      );
    }
    return states;
  }, [
    activationProgressByConversation,
    ambientNodesByConversation,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs,
    projectionVersion,
    visibleConversationId,
    workItemsByConversation,
  ]);
  const retainedTabComponentIds = useRetainedTabComponents({
    openTabs,
    activeTabId,
    runtimeRegistry: tabRenderRuntimeRegistry,
    sessionStateByConversation,
  });
  const visibleSessionState = useMemo(
    () =>
      sessionStateByConversation.get(visibleConversationId ?? '') ??
      projectConversationSessionState({
        conversationId: visibleConversationId ?? '',
        messagesByConversation: new Map(),
        streamingByConversation: new Map(),
      }),
    [sessionStateByConversation, visibleConversationId],
  );
  const activeSettings = settings;

  useEffect(() => {
    for (const tab of openTabs) {
      const store = tabRenderRuntimeRegistry.get(tab.id)?.store;
      if (!store) continue;
      const settingsSnapshot = settingsSnapshotByConversationRef.current.get(tab.conversationId);
      if (settingsSnapshot) applyConversationSettingsSnapshot(store, settingsSnapshot);
    }
  }, [openTabs, tabRenderRuntimeRegistry]);
  const entryModelState = useMemo(
    () =>
      projectChatWorkspaceModelState({
        chatModelOptions: activeSettings.chatModelOptions,
        selectedModel: entrySelectedModel,
        defaultMaxOutputTokens: activeSettings.maxTokens,
        sessionMode: entrySessionMode,
        mediaModelSelection: entryMediaModelSelection,
      }),
    [
      activeSettings.chatModelOptions,
      activeSettings.maxTokens,
      entrySessionMode,
      entryMediaModelSelection,
      entrySelectedModel,
    ],
  );
  useEffect(() => {
    const availableModelIds = new Set(activeSettings.chatModelOptions.map((option) => option.id));
    const configuredModelId =
      activeSettings.selectedProviderId && activeSettings.selectedModelId
        ? `${activeSettings.selectedProviderId}:${activeSettings.selectedModelId}`
        : '';
    const firstChatModel = activeSettings.chatModelOptions.find(
      (option) => (option.category ?? 'llm') === 'llm',
    );
    setEntrySelectedModel((current) =>
      availableModelIds.has(current)
        ? current
        : availableModelIds.has(configuredModelId)
          ? configuredModelId
          : (firstChatModel?.id ?? ''),
    );
    setEntryMediaModelSelection(
      (current) =>
        projectMediaModelSelectionDefaults({
          selection: current,
          defaults: activeSettings.defaultMediaModels ?? {},
        }).selection,
    );
  }, [
    activeSettings.chatModelOptions,
    activeSettings.defaultMediaModels,
    activeSettings.selectedModelId,
    activeSettings.selectedProviderId,
  ]);
  const handleModelSelectForConversation = useCallback(
    (conversationId: string, modelId: string) => {
      const conversationModelOptions =
        settingsSnapshotByConversationRef.current.get(conversationId)?.settingsPatch
          .chatModelOptions ?? activeSettings.chatModelOptions;
      const selectedOption = conversationModelOptions.find((option) => option.id === modelId);
      if (!selectedOption?.providerId || !selectedOption.modelId) return;

      const selectedProviderId = selectedOption.providerId;
      const selectedModelId = selectedOption.modelId;

      AgentHostMessages.updateSettings(
        {
          providerId: selectedProviderId,
          modelId: selectedModelId,
        },
        conversationId,
      );
    },
    [activeSettings.chatModelOptions],
  );
  const handleEntryModelSelect = useCallback(
    (modelId: string) => {
      const selectedOption = activeSettings.chatModelOptions.find(
        (option) => option.id === modelId,
      );
      if (!selectedOption?.providerId || !selectedOption.modelId) return;
      setEntrySelectedModel(modelId);
      updateSettings({
        selectedProviderId: selectedOption.providerId,
        selectedModelId: selectedOption.modelId,
      });
    },
    [activeSettings.chatModelOptions, updateSettings],
  );
  const updateEntrySettings = useCallback(
    (partial: Partial<SettingsState>) => updateSettings(partial),
    [updateSettings],
  );
  const conversationKind = activeOpenTab?.kind ?? 'chat';

  const triggerForceUpdate = useCallback(() => forceUpdate((n) => n + 1), []);
  const updateConversationRenderState = useCallback(
    (conversationId: string, updater: ConversationRenderStateUpdater) => {
      commitConversationRenderState(conversationId, updater);
      triggerForceUpdate();
    },
    [commitConversationRenderState, triggerForceUpdate],
  );
  const requestConfigSnapshot = useCallback(() => {
    AgentHostMessages.refreshConfigSnapshot();
  }, []);
  const requestConversationResourceSnapshot = useCallback((conversationId: string) => {
    AgentHostMessages.getSettings(conversationId);
    AgentHostMessages.getContextTokenCount(conversationId);
    AgentHostMessages.getTasks(conversationId);
    AgentHostMessages.getMessageQueue(conversationId);
  }, []);

  const handleUserMessageSent = useCallback(
    (event: { conversationId: string; message: Message }) => {
      const optimisticQueuedItem = projectOptimisticQueuedMessageItem(event);
      updateConversationRenderState(event.conversationId, (currentMessages, currentStreaming) => {
        const nextMessages = currentMessages.some((message) => message.id === event.message.id)
          ? currentMessages
          : optimisticQueuedItem
            ? currentMessages
            : [...currentMessages, event.message];
        const nextQueuedMessages =
          currentStreaming.queuedMessages && currentStreaming.queuedMessages.length > 0
            ? currentStreaming.queuedMessages
            : optimisticQueuedItem
              ? [optimisticQueuedItem]
              : queuedMessages;
        return {
          messages: nextMessages,
          streaming: {
            ...currentStreaming,
            streamingMessageId: event.message.isQueued
              ? (currentStreaming.streamingMessageId ?? streamingMessageIdRef.current)
              : null,
            isThinking: true,
            queuedMessageCount: optimisticQueuedItem
              ? Math.max(currentStreaming.queuedMessageCount ?? 0, nextQueuedMessages.length)
              : (currentStreaming.queuedMessageCount ?? 0),
            queuedMessages: nextQueuedMessages,
          },
        };
      });

      if (!optimisticQueuedItem) {
        setOpenTabs((prev) =>
          applyUserMessageToOpenTabs({
            openTabs: prev,
            conversationId: event.conversationId,
            messageContent: event.message.content,
          }),
        );
        setConversations((prev) =>
          applyUserMessageToConversationSummaries({
            conversations: prev,
            conversationId: event.conversationId,
            messageContent: event.message.content,
            timestamp: event.message.timestamp,
          }),
        );
      }
    },
    [
      queuedMessages,
      setConversations,
      setOpenTabs,
      streamingMessageIdRef,
      updateConversationRenderState,
    ],
  );

  const clearConversationMessages = useCallback(
    (conversationId: string) => {
      updateConversationRenderState(conversationId, () => ({
        messages: [],
        streaming: {
          streamingMessageId: null,
          isThinking: false,
          queuedMessageCount: 0,
          queuedMessages: [],
        },
      }));
    },
    [updateConversationRenderState],
  );

  const beginForegroundConversationActivation = useCallback(() => {
    const previousConversationIds = new Set<string>();
    for (const conversation of conversations) {
      previousConversationIds.add(conversation.id);
    }
    for (const tab of openTabs) {
      previousConversationIds.add(tab.conversationId);
    }
    if (activeConversationId) {
      previousConversationIds.add(activeConversationId);
    }
    if (activeTabConversationId) {
      previousConversationIds.add(activeTabConversationId);
    }
    if (activeConversationIdRef.current) {
      previousConversationIds.add(activeConversationIdRef.current);
    }

    pendingForegroundConversationActivationRef.current = {
      reason: 'new-conversation',
      previousConversationIds: [...previousConversationIds],
    };
    setIsForegroundConversationActivationPending(true);
  }, [
    activeConversationId,
    activeConversationIdRef,
    activeTabConversationId,
    conversations,
    openTabs,
  ]);

  const completeForegroundConversationActivation = useCallback((conversationId: string) => {
    const pending = pendingForegroundConversationActivationRef.current;
    const matchesPending =
      pending?.reason === 'switch-conversation'
        ? pending.conversationId === conversationId
        : shouldActivateForegroundConversation(pending, conversationId);
    if (!matchesPending) return;
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
    setForegroundAvailabilityByConversation((previous) => {
      const next = new Map(previous);
      next.set(conversationId, { kind: 'ready' });
      return next;
    });
  }, []);

  // ---- Message handler ----
  const { handleMessage, disposeConversationRendering } = useMessageHandler({
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
    reconcileTabRenderRuntimes: (bindings, nextActiveTabId) => {
      tabRenderRuntimeRegistry.reconcile(bindings, nextActiveTabId);
    },
    completeForegroundConversationActivation,
    requestQueuedMessageEdit: (request) => {
      const runtime = tabRenderRuntimeRegistry.require(request.tabId);
      if (runtime.conversationId !== request.conversationId) {
        throw new Error(
          `Queued edit Tab ${request.tabId} belongs to ${runtime.conversationId}, not ${request.conversationId}.`,
        );
      }
      nextQueuedEditRequestIdRef.current += 1;
      runtime.store.updateState({
        queuedEdit: {
          requestId: nextQueuedEditRequestIdRef.current,
          item: request.item,
        },
      });
    },
    requestContextInjection: (request) => {
      const runtime = tabRenderRuntimeRegistry.require(request.tabId);
      if (runtime.conversationId !== request.conversationId) {
        throw new Error(
          `Context injection Tab ${request.tabId} belongs to ${runtime.conversationId}, not ${request.conversationId}.`,
        );
      }
      runtime.store.updateState((state) => ({
        activeSurface: 'chat',
        ...(state.contextReferences.some((reference) => reference.id === request.payload.id)
          ? {}
          : { contextReferences: [...state.contextReferences, request.payload] }),
        ...(request.payload.intent ? { inputValue: request.payload.intent } : {}),
      }));
    },
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
    setPluginsAvailable,
    setProjectFiles,
    setMentionItems,
    mentionSearchFilter,
    mentionSearchFilterRef,
    setPluginCommands,
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
    forceContextUpdate: triggerForceUpdate,
  });

  const activateCharacterRoleTab = useCallback((_tab: OpenTab) => {
    setActiveTab('chat');
  }, []);

  useEffect(() => {
    if (!globalError) return;
    const timer = window.setTimeout(() => setGlobalError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [globalError]);

  const controllerMessageHandlerRef = useRef(handleMessage);
  useLayoutEffect(() => {
    controllerMessageHandlerRef.current = handleMessage;
  }, [handleMessage]);

  useEffect(() => {
    const handleControllerMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | undefined)?.type;
      if (type === 'externalMessage' || type === 'prefillInput' || type === 'ambientCanvasUpdate') {
        return;
      }
      controllerMessageHandlerRef.current(event);
    };

    window.addEventListener('message', handleControllerMessage);
    return () => window.removeEventListener('message', handleControllerMessage);
  }, []);

  useEffect(() => {
    const handleScopedDesktopHostMessage = (event: Event) => {
      const message = (event as CustomEvent<ExtensionToWebviewMessage>).detail;
      if (!message?.type) return;
      controllerMessageHandlerRef.current({
        data: message,
      } as MessageEvent<ExtensionToWebviewMessage>);
    };

    window.addEventListener(NEKO_AGENT_HOST_MESSAGE_EVENT, handleScopedDesktopHostMessage);
    return () =>
      window.removeEventListener(NEKO_AGENT_HOST_MESSAGE_EVENT, handleScopedDesktopHostMessage);
  }, []);

  // ---- Request data on mount ----
  useEffect(() => {
    isTablessConversationViewRef.current = true;
    AgentHostMessages.getConversations();
    AgentHostMessages.getActiveConversation();
    // The Extension keeps same-process tab state across Webview reloads. Request it
    // explicitly because Developer: Reload Webviews does not trigger a visibility change.
    AgentHostMessages.getTabState();
    requestConfigSnapshot();
    AgentHostMessages.getAgentStates();
    AgentHostMessages.getSkills();
  }, [requestConfigSnapshot]);

  // ---- Context token count on conversation change ----
  useEffect(() => {
    if (visibleConversationId && !isCharacterRoleConversationKind(conversationKind)) {
      requestConversationResourceSnapshot(visibleConversationId);
    }
  }, [conversationKind, requestConversationResourceSnapshot, visibleConversationId]);

  // ---- Sync agent state on conversation change ----
  useEffect(() => {
    if (visibleConversationId) {
      const savedState = conversationAgentStateRef.current.get(visibleConversationId);
      setAgentState(savedState || null);
    } else {
      setAgentState(null);
    }
  }, [visibleConversationId]);

  // ---- Conversation CRUD callbacks ----
  const startNewForegroundConversation = useCallback(() => {
    isTablessConversationViewRef.current = false;
    beginForegroundConversationActivation();
    requestConfigSnapshot();
    AgentHostMessages.newConversation();
    setActiveTab('chat');
  }, [beginForegroundConversationActivation, requestConfigSnapshot]);

  const handleNewChat = useCallback(() => {
    setPendingSendRequest(null);
    setInitialEntryPromptMenuRequest(null);
    setInitialInputRequest(null);
    setEntryPromptMenu(null);
    startNewForegroundConversation();
  }, [startNewForegroundConversation]);

  const startNewForegroundConversationWithEntryPrompt = useCallback(
    (menu: EntryPromptMenu, messageText?: string) => {
      const id = nextEntryPromptMenuRequestIdRef.current + 1;
      nextEntryPromptMenuRequestIdRef.current = id;
      setPendingSendRequest(null);
      setInitialEntryPromptMenuRequest({ id, menu });
      setEntryPromptMenu(null);
      if (messageText?.trim()) {
        const inputRequestId = nextInitialInputRequestIdRef.current + 1;
        nextInitialInputRequestIdRef.current = inputRequestId;
        setInitialInputRequest({ id: inputRequestId, messageText: messageText.trim() });
      } else {
        setInitialInputRequest(null);
      }
      startNewForegroundConversation();
    },
    [startNewForegroundConversation],
  );

  const handleEntryAction = useCallback(
    (action: EmptyStateEntryAction) => {
      setEntryAction(action);
      setEntrySessionMode('agent');
      const messageText = entryInputValueRef.current.trim();

      switch (action) {
        case 'start-chat':
          setPendingSendRequest(null);
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          setEntryPromptMenu(null);
          updateEntryInputValue('');
          startNewForegroundConversation();
          return;
        case 'generate-assets':
          updateEntryInputValue('');
          startNewForegroundConversationWithEntryPrompt('generate-assets', messageText);
          return;
        case 'roleplay':
          setPendingSendRequest(null);
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          setEntryPromptMenu('roleplay');
          updateMentionSearchFilter('');
          AgentHostMessages.searchProjectFiles('', undefined, { purpose: 'roleplay' });
          return;
      }
    },
    [
      startNewForegroundConversation,
      startNewForegroundConversationWithEntryPrompt,
      updateEntryInputValue,
      updateMentionSearchFilter,
    ],
  );

  const handleSendWithoutConversation = useCallback(
    (input: PendingSendInput) => {
      setInitialEntryPromptMenuRequest(null);
      setInitialInputRequest(null);
      setEntryPromptMenu(null);
      const id = nextPendingSendRequestIdRef.current + 1;
      nextPendingSendRequestIdRef.current = id;
      setPendingSendRequest({ id, input });
      startNewForegroundConversation();
    },
    [startNewForegroundConversation],
  );

  const handleEntryInputSend = useCallback(
    (input?: PendingSendInput) => {
      const messageText = (input?.messageText ?? entryInputValue).trim();
      if (!messageText) return;
      const contextPayloads = input?.contextPayloads ?? entryContextReferences;

      switch (entryAction) {
        case 'start-chat': {
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          handleSendWithoutConversation({
            ...input,
            messageText,
            displayMessageText: input?.displayMessageText ?? messageText,
            sessionMode: input?.sessionMode ?? entrySessionMode,
            ...(contextPayloads.length > 0 ? { contextPayloads: [...contextPayloads] } : {}),
          });
          updateEntryInputValue('');
          setEntryContextReferences([]);
          return;
        }
        case 'generate-assets':
          startNewForegroundConversationWithEntryPrompt('generate-assets', messageText);
          updateEntryInputValue('');
          return;
        case 'roleplay':
          setPendingSendRequest(null);
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          setEntryPromptMenu('roleplay');
          updateMentionSearchFilter('');
          AgentHostMessages.searchProjectFiles('', undefined, { purpose: 'roleplay' });
          return;
      }
    },
    [
      entryAction,
      entryContextReferences,
      entryInputValue,
      entrySessionMode,
      handleSendWithoutConversation,
      startNewForegroundConversationWithEntryPrompt,
      updateEntryInputValue,
      updateMentionSearchFilter,
    ],
  );

  const handlePendingSendRequestConsumed = useCallback((id: number) => {
    setPendingSendRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleInitialEntryPromptMenuRequestConsumed = useCallback((id: number) => {
    setInitialEntryPromptMenuRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleInitialInputRequestConsumed = useCallback((id: number) => {
    setInitialInputRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleEntrySessionModeChange = useCallback(
    (mode: SessionMode) => {
      setEntrySessionMode(mode);
      setEntryAction('start-chat');
      setEntryMediaModelSelection((prev) => {
        const projection = projectMediaModelSelectionForSessionModeChange({
          sessionMode: mode,
          mediaModelSelection: prev,
          chatModelOptions: activeSettings.chatModelOptions,
        });
        return projection.updated ? projection.mediaModelSelection : prev;
      });
    },
    [activeSettings.chatModelOptions],
  );

  const handleEntryMediaModelSelect = useCallback((category: MediaCategory, modelId: string) => {
    setEntryMediaModelSelection((prev) => ({ ...prev, [category]: modelId }));
  }, []);

  const handleEntryGenParamsChange = useCallback((partial: Partial<GenerationParams>) => {
    setEntryGenParams((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleBeforeTabOpen = useCallback(() => {
    setPendingSendRequest(null);
    setInitialEntryPromptMenuRequest(null);
    setInitialInputRequest(null);
    setEntryPromptMenu(null);
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
    isTablessConversationViewRef.current = false;
  }, []);

  const handleBeforeConversationActivation = useCallback(
    (request: {
      conversationId: string;
      activationId: number;
      expectedTabStateRevision: number;
    }) => {
      const { conversationId } = request;
      setPendingSendRequest(null);
      setInitialEntryPromptMenuRequest(null);
      setInitialInputRequest(null);
      setEntryPromptMenu(null);
      pendingForegroundConversationActivationRef.current = {
        reason: 'switch-conversation',
        conversationId,
        activationId: request.activationId,
        tabStateRevision: request.expectedTabStateRevision + 1,
      };
      setIsForegroundConversationActivationPending(true);
      isTablessConversationViewRef.current = false;
      const hasRetainedProjection =
        conversationRenderCoordinator.read(conversationId) !== undefined ||
        conversationMessagesRef.current.has(conversationId) ||
        conversationStreamingRef.current.has(conversationId);
      setForegroundAvailabilityByConversation((previous) => {
        const next = new Map(previous);
        next.set(conversationId, hasRetainedProjection ? { kind: 'ready' } : { kind: 'loading' });
        return next;
      });
    },
    [conversationMessagesRef, conversationRenderCoordinator, conversationStreamingRef],
  );

  const handleAllTabsClosed = useCallback(() => {
    setPendingSendRequest(null);
    setInitialEntryPromptMenuRequest(null);
    setInitialInputRequest(null);
    setEntryPromptMenu(null);
    isTablessConversationViewRef.current = true;
    setActiveConversationId(null);
    clearVisibleState();
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
    setActiveTab('chat');
  }, [clearVisibleState, setActiveConversationId]);

  const isProtectedConversation = useCallback(
    (conversationId: string): boolean => {
      const cachedStreaming = conversationStreamingRef.current.get(conversationId);
      const cachedAgentState = conversationAgentStateRef.current.get(conversationId);
      return Boolean(
        openTabs.some((tab) => tab.conversationId === conversationId) ||
        activeConversationId === conversationId ||
        cachedStreaming?.isThinking ||
        cachedStreaming?.streamingMessageId ||
        (cachedAgentState && cachedAgentState.phase !== 'idle'),
      );
    },
    [activeConversationId, conversationStreamingRef, conversationAgentStateRef, openTabs],
  );

  const cleanupClosedConversation = useCallback(
    (conversationId: string) => {
      disposeConversationRendering(conversationId, 'conversation-delete');
      cleanupConversation(conversationId);
      discardConversationSnapshotProjection({
        conversationId,
        conversationMessagesRef,
        conversationStreamingRef,
      });
      conversationAgentStateRef.current.delete(conversationId);
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
    },
    [
      cleanupConversation,
      disposeConversationRendering,
      conversationMessagesRef,
      conversationStreamingRef,
      conversationAgentStateRef,
      setConversations,
    ],
  );

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      if (isProtectedConversation(conversationId)) {
        return;
      }

      cleanupClosedConversation(conversationId);
      AgentHostMessages.deleteConversation(conversationId);
    },
    [cleanupClosedConversation, isProtectedConversation],
  );

  const handleClearClosedConversations = useCallback(() => {
    const historyItems = projectHistoryConversationItems({
      conversations,
      openTabs,
      activeConversationId,
      activeStreaming: {
        streamingMessageId,
        isThinking,
        queuedMessageCount,
      },
      streamingByConversation: conversationStreamingRef.current,
      agentStateByConversation: conversationAgentStateRef.current,
    });
    const cleanup = projectHistoryCleanup({ historyItems });
    for (const conversationId of cleanup.deletableConversationIds) {
      cleanupClosedConversation(conversationId);
      AgentHostMessages.deleteConversation(conversationId);
    }
  }, [
    activeConversationId,
    conversations,
    openTabs,
    streamingMessageId,
    isThinking,
    queuedMessageCount,
    conversationStreamingRef,
    conversationAgentStateRef,
    cleanupClosedConversation,
  ]);

  // ---- Tab management ----
  const { handleOpenTab, handleCloseTab, handleSwitchTab } = useTabManager({
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
    onBeforeTabOpen: handleBeforeTabOpen,
    conversations,
    setActiveTab,
    onAllTabsClosed: handleAllTabsClosed,
    onBeforeConversationActivation: handleBeforeConversationActivation,
    onConversationActivated: requestConversationResourceSnapshot,
    onActivateCharacterRoleTab: activateCharacterRoleTab,
    onConfigSnapshotRequested: requestConfigSnapshot,
    tabStateRevision: tabStateRevisionRef.current,
    onTabStateRevisionAllocated: (revision) => {
      tabStateRevisionRef.current = revision;
    },
    hasLocalConversationActivity: (conversationId) => {
      const cachedMessages = conversationMessagesRef.current.get(conversationId);
      const cachedStreaming = conversationStreamingRef.current.get(conversationId);
      const cachedAgentState = conversationAgentStateRef.current.get(conversationId);
      return Boolean(
        (cachedMessages?.length ?? 0) > 0 ||
        cachedStreaming?.isThinking ||
        cachedStreaming?.streamingMessageId ||
        (cachedAgentState && cachedAgentState.phase !== 'idle'),
      );
    },
  });

  const tabConversationIds = useMemo(
    () => [...new Set(openTabs.map((tab) => tab.conversationId))],
    [openTabs],
  );
  const subscribeTabRenderRevisions = useCallback(
    (listener: () => void) => {
      const unsubscribe = tabConversationIds.map((conversationId) =>
        conversationRenderCoordinator.subscribeRevision(conversationId, listener),
      );
      return () => {
        for (const dispose of unsubscribe) dispose();
      };
    },
    [conversationRenderCoordinator, tabConversationIds],
  );
  const readTabRenderRevisionSignature = useCallback(
    () =>
      tabConversationIds
        .map(
          (conversationId) =>
            `${conversationId}:${conversationRenderCoordinator.revision(conversationId)}`,
        )
        .join('|'),
    [conversationRenderCoordinator, tabConversationIds],
  );
  const tabRenderRevisionSignature = useSyncExternalStore(
    subscribeTabRenderRevisions,
    readTabRenderRevisionSignature,
    readTabRenderRevisionSignature,
  );
  const tabRenderSnapshots = useMemo(
    () =>
      new Map(
        tabConversationIds.flatMap((conversationId) => {
          const snapshot = conversationRenderCoordinator.read(conversationId);
          return snapshot ? [[conversationId, snapshot] as const] : [];
        }),
      ),
    [conversationRenderCoordinator, tabConversationIds, tabRenderRevisionSignature],
  );

  const displayTabs = useMemo(
    () =>
      projectDisplayTabs({
        openTabs,
        conversations,
        activeConversationId: visibleConversationId,
        activeMessages: [...visibleSessionState.messages],
        activeStreaming: visibleSessionState.streaming,
        messagesByConversation: conversationMessagesRef.current,
        streamingByConversation: conversationStreamingRef.current,
        renderSnapshotsByConversation: tabRenderSnapshots,
        agentStateByConversation: conversationAgentStateRef.current,
      }),
    [
      openTabs,
      conversations,
      visibleConversationId,
      visibleSessionState,
      projectionVersion,
      tabRenderSnapshots,
    ],
  );
  const historyConversations = useMemo(
    () =>
      projectHistoryConversationItems({
        conversations,
        openTabs,
        activeConversationId: visibleConversationId,
        activeStreaming: visibleSessionState.streaming,
        streamingByConversation: conversationStreamingRef.current,
        agentStateByConversation: conversationAgentStateRef.current,
      }),
    [conversations, openTabs, visibleConversationId, visibleSessionState, projectionVersion],
  );
  const historyCleanup = useMemo(
    () => projectHistoryCleanup({ historyItems: historyConversations }),
    [historyConversations],
  );

  return (
    <>
      {renderHeader({
        tabs: displayTabs,
        activeTabId,
        activeView: activeTab,
        historyConversations,
        activeConversationId: visibleConversationId,
        onSwitchTab: handleSwitchTab,
        onCloseTab: handleCloseTab,
        onNewChat: handleNewChat,
        onOpenConversation: handleOpenTab,
        onDeleteConversation: handleDeleteConversation,
        onClearClosedConversations: handleClearClosedConversations,
        clearableConversationCount: historyCleanup.deletableConversationIds.length,
        protectedConversationCount: historyCleanup.protectedConversationCount,
      })}

      {activeTab === 'chat' ? (
        openTabs.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <EmptyState
              selectedAction={entryAction}
              disabled={isForegroundConversationActivationPending}
              onEntryAction={handleEntryAction}
            />
            <InputAreaProvider
              isBusy={!hasConfigSnapshot}
              modelCatalogStatus={hasConfigSnapshot ? 'ready' : 'loading'}
              sessionMode={entrySessionMode}
              onSessionModeChange={handleEntrySessionModeChange}
              selectedModel={entrySelectedModel}
              availableModels={entryModelState.availableModels}
              onModelSelect={handleEntryModelSelect}
              mediaModelSelection={entryMediaModelSelection}
              availableMediaModels={entryModelState.availableMediaModels}
              mediaUnderstandingModels={activeSettings.mediaUnderstandingModels}
              mediaUnderstandingSelection={{ image: 'auto', video: 'auto', audio: 'auto' }}
              onMediaModelSelect={handleEntryMediaModelSelect}
              onMediaUnderstandingModelSelect={() => undefined}
              executionMode={activeSettings.executionMode}
              onExecutionModeChange={(mode) => updateEntrySettings({ executionMode: mode })}
              maxContextTokens={entryModelState.selectedEffectiveInputBudget}
              outputTokenCap={entryModelState.selectedOutputTokenCap}
              modelMaxOutputTokens={entryModelState.selectedMaxOutputTokens}
              mediaModelCallCount={0}
              skills={skills}
              pluginCommands={pluginCommands}
              mentionItems={mentionItems}
              onRequestFiles={(filter) => {
                updateMentionSearchFilter(filter);
                AgentHostMessages.searchProjectFiles(filter, undefined, { purpose: 'entry' });
              }}
              genCategory={entryGenCategory}
              genParams={entryGenParams}
              onGenCategoryChange={setEntryGenCategory}
              onGenParamsChange={handleEntryGenParamsChange}
              contextTokenCount={0}
              isCompressing={false}
              contextChips={entryContextReferences}
              onAddContextChip={addEntryContextReference}
              onRemoveContextChip={removeEntryContextReference}
              ambientNodes={[]}
              conversationKind="chat"
            >
              <InputArea
                inputValue={entryInputValue}
                isThinking={false}
                onInputChange={updateEntryInputValue}
                onSend={handleEntryInputSend}
                disabled={isForegroundConversationActivationPending || !hasConfigSnapshot}
                entryPromptMenu={entryPromptMenu}
                onEntryPromptMenuChange={setEntryPromptMenu}
              />
            </InputAreaProvider>
          </div>
        ) : null
      ) : null}

      {openTabs.map((tab) => {
        if (!retainedTabComponentIds.has(tab.id)) return null;
        const runtime = tabRenderRuntimeRegistry.get(tab.id);
        const sessionState = sessionStateByConversation.get(tab.conversationId);
        if (!runtime || !sessionState) return null;

        const visible = activeTab === 'chat' && tab.id === activeTabId;
        const foregroundConversationAvailability = foregroundAvailabilityByConversation.get(
          tab.conversationId,
        ) ?? { kind: 'ready' as const };

        return (
          <ConversationTabRuntimeView
            key={tab.id}
            tab={tab}
            runtime={runtime}
            visible={visible}
            messages={[...sessionState.messages]}
            setMessages={(value) =>
              updateConversationRenderState(tab.conversationId, (currentMessages, streaming) => ({
                messages: typeof value === 'function' ? value(currentMessages) : [...value],
                streaming,
              }))
            }
            isThinking={sessionState.streaming.isThinking}
            setIsThinking={(value) =>
              updateConversationRenderState(tab.conversationId, (currentMessages, streaming) => ({
                messages: currentMessages,
                streaming: {
                  ...streaming,
                  isThinking: typeof value === 'function' ? value(streaming.isThinking) : value,
                },
              }))
            }
            streamingMessageId={sessionState.streaming.streamingMessageId}
            queuedMessageCount={sessionState.streaming.queuedMessageCount ?? 0}
            queuedMessages={sessionState.streaming.queuedMessages ?? []}
            setStreamingMessageId={(value) =>
              updateConversationRenderState(tab.conversationId, (currentMessages, streaming) => ({
                messages: currentMessages,
                streaming: {
                  ...streaming,
                  streamingMessageId:
                    typeof value === 'function' ? value(streaming.streamingMessageId) : value,
                },
              }))
            }
            foregroundConversationAvailability={foregroundConversationAvailability}
            conversationKind={tab.kind ?? 'chat'}
            characterDialogueSession={tab.characterDialogueSession}
            embodyCharacterSession={tab.embodyCharacterSession}
            clearMessages={() => clearConversationMessages(tab.conversationId)}
            settings={{
              ...activeSettings,
              ...settingsSnapshotByConversationRef.current.get(tab.conversationId)?.settingsPatch,
            }}
            modelCatalogStatus={
              settingsSnapshotByConversationRef.current.has(tab.conversationId)
                ? 'ready'
                : 'loading'
            }
            onModelSelect={(modelId) =>
              handleModelSelectForConversation(tab.conversationId, modelId)
            }
            mediaUnderstandingModels={activeSettings.mediaUnderstandingModels}
            mentionItems={mentionItems}
            onMentionSearchFilterChange={updateMentionSearchFilter}
            pluginCommands={pluginCommands}
            workItems={[...sessionState.workItems]}
            pluginsAvailable={pluginsAvailable}
            setActiveTab={setActiveTab}
            conversationCompressingRef={conversationCompressingRef}
            contextTokenCount={sessionState.context.tokenCount}
            isCompressing={sessionState.context.isCompressing}
            mediaModelCallCount={conversationMediaCallCountRef.current.get(tab.conversationId) ?? 0}
            skills={skills}
            activationProgress={sessionState.skill.activationProgress}
            ambientNodes={[...sessionState.context.ambientNodes]}
            agentState={sessionState.agentState}
            setAmbientNodes={(value) => setAmbientNodesForConversation(tab.conversationId, value)}
            onNewChat={handleNewChat}
            onUserMessageSent={handleUserMessageSent}
            onSendWithoutConversation={visible ? handleSendWithoutConversation : undefined}
            pendingSendRequest={visible ? pendingSendRequest : null}
            onPendingSendRequestConsumed={handlePendingSendRequestConsumed}
            initialInputRequest={visible ? initialInputRequest : null}
            onInitialInputRequestConsumed={handleInitialInputRequestConsumed}
            initialEntryPromptMenuRequest={visible ? initialEntryPromptMenuRequest : null}
            onInitialEntryPromptMenuRequestConsumed={handleInitialEntryPromptMenuRequestConsumed}
            queuedEditDraftConflictMessage={t('chat.input.queueEditDraftConflict')}
          />
        );
      })}

      {globalError ? (
        <div
          role="alert"
          className="fixed right-4 top-12 z-50 max-w-[360px] rounded-lg border border-[var(--vscode-inputValidation-errorBorder,var(--agent-border))] bg-[var(--vscode-inputValidation-errorBackground,var(--agent-elevated))] px-3 py-2 text-sm text-[var(--vscode-inputValidation-errorForeground,var(--agent-fg))] shadow-lg animate-slide-in"
        >
          <div className="font-medium">全局错误</div>
          <div className="mt-1 opacity-90">{globalError}</div>
        </div>
      ) : null}
    </>
  );
}
