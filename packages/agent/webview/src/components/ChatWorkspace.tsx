/**
 * ChatWorkspace — View composition layer.
 *
 * Responsibilities:
 *   - Tab-owned render state (input, attachments, generation, menus)
 *   - Behavior hooks: useChatActions, useSlashCommands
 *   - Model derivation (allModels, availableModels, mediaModels)
 *   - Keyboard shortcuts
 *   - Pre-intercept handler (externalMessage, prefillInput, injectContext, ambientCanvasUpdate)
 *   - Assembles InputAreaProvider + ChatView
 *
 * Extracted from the former 589-line AIAssistant component (ADR P0.1).
 */

import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AgentContextPayload } from '@neko/agent-contracts';
import type { ChatModelOption } from '@neko/ai-contracts';
import {
  ShellExecutionMode,
  SessionMode,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
  type AgentQueuedMessageItem,
  type AmbientCanvasNode,
  parseAmbientCanvasUpdateNodes,
} from '@neko/agent-contracts';
import type {
  MediaUnderstandingModelSelections,
  MediaUnderstandingModels,
  SettingsState,
  Message,
  TabType,
} from '@neko/agent-contracts';
import { useAgentHostMessages } from '../host-runtime-context';
import { ChatView } from './ChatView';
import { AgentDiagnosticToast } from './AgentDiagnosticToast';
import {
  InputAreaProvider,
  type MediaModelSelection,
  type MediaUnderstandingSelection,
} from './ChatView/InputAreaContext';
import type {
  ComposerMenuState,
  EntryPromptMenu,
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from './ChatView/InputArea/types';
import type { PluginsAvailable } from './ChatView/SendToMenu';
import type { AgentWorkItem } from './AgentWorkItem';
import type { ActivationProgressTimeline } from '../presenters/activation-progress-presenter';
import { projectTrailingMention } from './ChatView/InputArea/mention-input';
import {
  useChatActions,
  type PendingSendIdentity,
  type PendingSendInput,
  useSlashCommands,
} from '../hooks';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import {
  projectChatWorkspaceModelState,
  projectMediaModelSelectionForSessionModeChange,
} from '../presenters/config-message-presenter';
import { isCharacterRoleConversationKind } from '../presenters/character-role-session-presenter';
import type { ForegroundConversationAvailability } from '../render-lifecycle/conversation-render-contract';
import type { TabRenderStore, TabViewportSnapshot } from '../render-runtime/tab-render-runtime';
import { useTabRenderStore } from '../render-runtime/useTabRenderStore';

// =============================================================================
// Props
// =============================================================================

export interface ChatWorkspaceProps {
  tabRenderStore: TabRenderStore;
  isVisible?: boolean;
  // Conversation state
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isThinking: boolean;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  streamingMessageId: string | null;
  queuedMessageCount: number;
  queuedMessages: readonly AgentQueuedMessageItem[];
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  foregroundConversationAvailability?: ForegroundConversationAvailability;
  conversationKind: ConversationKind;
  characterDialogueSession?: CharacterDialogueSessionProjection;
  embodyCharacterSession?: EmbodyCharacterSessionProjection;
  clearMessages: () => void;
  // Config
  settings: SettingsState;
  modelCatalogStatus?: 'loading' | 'ready';
  onModelSelect: (modelId: string) => void;
  mediaUnderstandingModels?: MediaUnderstandingModels;
  mentionItems: MentionItem[];
  onMentionSearchFilterChange: (filter: string) => void;
  pluginCommands: PluginSlashCommandDef[];
  // Resources
  workItems: AgentWorkItem[];
  pluginsAvailable: PluginsAvailable;
  // Session
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  // Conversation runtime resource refs
  conversationCompressingRef: MutableRefObject<Map<string, boolean>>;
  // Context management
  contextTokenCount: number;
  isCompressing: boolean;
  mediaModelCallCount: number;
  // Skills
  skills: SkillSummary[];
  activationProgress?: readonly ActivationProgressTimeline[];
  // Context chips
  ambientNodes: AmbientCanvasNode[];
  // Agent state
  agentState: AgentState | null;
  setAmbientNodes: React.Dispatch<React.SetStateAction<AmbientCanvasNode[]>>;
  onNewChat: () => void;
  onUserMessageSent?: (event: { conversationId: string; message: Message }) => void;
  onSendWithoutConversation?: (input: PendingSendInput) => void;
  pendingSendRequest?: { id: number; input: PendingSendInput } | null;
  onPendingSendRequestConsumed?: (id: number) => void;
  initialInputRequest?: { id: number; messageText: string } | null;
  onInitialInputRequestConsumed?: (id: number) => void;
  initialSessionModeRequest?: { id: number; mode: SessionMode } | null;
  onInitialSessionModeRequestConsumed?: (id: number) => void;
  queuedEditDraftConflictMessage: string;
}

// =============================================================================
// Component
// =============================================================================

export function ChatWorkspace({
  tabRenderStore,
  isVisible = true,
  messages,
  setMessages,
  isThinking,
  setIsThinking,
  streamingMessageId,
  queuedMessageCount,
  queuedMessages,
  setStreamingMessageId,
  streamingMessageIdRef,
  foregroundConversationAvailability = { kind: 'ready' },
  conversationKind,
  characterDialogueSession,
  embodyCharacterSession,
  clearMessages,
  settings,
  modelCatalogStatus = 'ready',
  onModelSelect,
  mediaUnderstandingModels,
  mentionItems,
  onMentionSearchFilterChange,
  pluginCommands,
  workItems,
  pluginsAvailable,
  setActiveTab,
  conversationCompressingRef,
  contextTokenCount,
  isCompressing,
  mediaModelCallCount,
  skills,
  activationProgress = [],
  ambientNodes,
  agentState,
  setAmbientNodes,
  onNewChat,
  onUserMessageSent,
  onSendWithoutConversation,
  pendingSendRequest,
  onPendingSendRequestConsumed,
  initialInputRequest,
  onInitialInputRequestConsumed,
  initialSessionModeRequest,
  onInitialSessionModeRequestConsumed,
  queuedEditDraftConflictMessage,
}: ChatWorkspaceProps) {
  const agentHostMessages = useAgentHostMessages();
  const { snapshot: tabRenderSnapshot, updateState: updateTabRenderState } =
    useTabRenderStore(tabRenderStore);
  const tabState = tabRenderSnapshot.state;
  const inputValue = tabState.inputValue;
  const selectedModel = tabState.selectedModel;
  const mediaModelSelection = tabState.mediaModelSelection;
  const executionMode = tabState.executionMode;
  const queuedEdit = tabState.queuedEdit;
  const latestSessionDiagnostic = tabState.diagnostics.at(-1) ?? null;
  const attachedFiles = [...tabState.attachedFiles];
  const selectedFileReferences = [...tabState.selectedFileReferences];
  const contextChips = [...tabState.contextReferences];
  const genCategory = tabState.generationCategory;
  const genParams = tabState.generationParams;
  const mediaUnderstandingSelection = tabState.mediaUnderstandingSelection;
  const sessionMode = tabState.sessionMode;
  const entryPromptMenu = tabState.menus.entryPrompt;
  const composerMenuState = tabState.menus.composer;
  const composition = tabState.composition;
  const focus = tabState.focus;
  const viewport = tabState.viewport;

  const setInputValue = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (value) => {
      updateTabRenderState((state) => ({
        inputValue: resolveSetStateAction(value, state.inputValue),
      }));
    },
    [updateTabRenderState],
  );
  const handleAddContextChip = useCallback(
    (payload: AgentContextPayload) => {
      updateTabRenderState((state) =>
        state.contextReferences.some((reference) => reference.id === payload.id)
          ? {}
          : { contextReferences: [...state.contextReferences, payload] },
      );
    },
    [updateTabRenderState],
  );
  const handleRemoveContextChip = useCallback(
    (id: string) => {
      updateTabRenderState((state) => ({
        contextReferences: state.contextReferences.filter((reference) => reference.id !== id),
      }));
    },
    [updateTabRenderState],
  );

  const setComposition = useCallback(
    (isComposing: boolean) => {
      updateTabRenderState((state) =>
        state.composition.isComposing === isComposing ? {} : { composition: { isComposing } },
      );
    },
    [updateTabRenderState],
  );
  const requestInputFocus = useCallback(() => {
    updateTabRenderState((state) => ({
      focus: { target: 'input', requestRevision: state.focus.requestRevision + 1 },
    }));
  }, [updateTabRenderState]);

  const setViewport = useCallback(
    (nextViewport: TabViewportSnapshot) => {
      updateTabRenderState({ viewport: nextViewport });
    },
    [updateTabRenderState],
  );

  const setSelectedModel = useCallback(
    (modelId: string) => {
      updateTabRenderState({ selectedModel: modelId });
      onModelSelect(modelId);
    },
    [onModelSelect, updateTabRenderState],
  );
  const setMediaModelSelection = useCallback<
    React.Dispatch<React.SetStateAction<MediaModelSelection>>
  >(
    (value) => {
      updateTabRenderState((state) => ({
        mediaModelSelection: resolveSetStateAction(value, state.mediaModelSelection),
      }));
    },
    [updateTabRenderState],
  );
  const clearInput = useCallback(
    () => updateTabRenderState({ inputValue: '' }),
    [updateTabRenderState],
  );
  const setAttachedFiles = useCallback<
    React.Dispatch<React.SetStateAction<import('./ChatView/InputArea/types').MessageAttachment[]>>
  >(
    (value) => {
      updateTabRenderState((state) => ({
        attachedFiles: resolveSetStateAction(value, [...state.attachedFiles]),
      }));
    },
    [updateTabRenderState],
  );
  const setSelectedFileReferences = useCallback<
    React.Dispatch<
      React.SetStateAction<import('./ChatView/InputArea/types').SelectedFileReference[]>
    >
  >(
    (value) => {
      updateTabRenderState((state) => ({
        selectedFileReferences: resolveSetStateAction(value, [...state.selectedFileReferences]),
      }));
    },
    [updateTabRenderState],
  );
  const setGenCategory = useCallback<React.Dispatch<React.SetStateAction<typeof genCategory>>>(
    (value) => {
      updateTabRenderState((state) => ({
        generationCategory: resolveSetStateAction(value, state.generationCategory),
      }));
    },
    [updateTabRenderState],
  );
  const updateGenParams = useCallback(
    (partial: Partial<typeof genParams>) => {
      updateTabRenderState((state) => ({
        generationParams: { ...state.generationParams, ...partial },
      }));
    },
    [updateTabRenderState],
  );
  const setMediaUnderstandingSelection = useCallback<
    React.Dispatch<React.SetStateAction<MediaUnderstandingSelection>>
  >(
    (value) => {
      updateTabRenderState((state) => ({
        mediaUnderstandingSelection: resolveSetStateAction(
          value,
          state.mediaUnderstandingSelection,
        ),
      }));
    },
    [updateTabRenderState],
  );
  const setComposerMenuState = useCallback(
    (composer: ComposerMenuState) => {
      updateTabRenderState((state) => ({
        menus: { ...state.menus, composer },
      }));
    },
    [updateTabRenderState],
  );
  const setEntryPromptMenu = useCallback<
    React.Dispatch<React.SetStateAction<EntryPromptMenu | null>>
  >(
    (value) => {
      updateTabRenderState((state) => ({
        menus: {
          ...state.menus,
          entryPrompt: resolveSetStateAction(value, state.menus.entryPrompt),
        },
      }));
    },
    [updateTabRenderState],
  );

  const tabConversationId = tabRenderSnapshot.conversationId;
  const isCharacterRoleSession = isCharacterRoleConversationKind(conversationKind);
  const isModelConfigurationReady =
    isCharacterRoleSession || tabState.modelConfigurationInitialized;
  const sessionMutationConversationId = isVisible ? tabConversationId : null;
  const sessionMutationConversationIdRef = useRef<string | null>(sessionMutationConversationId);

  useLayoutEffect(() => {
    sessionMutationConversationIdRef.current = sessionMutationConversationId;
  }, [sessionMutationConversationId]);

  const setVisibleSessionMode = useCallback(
    (mode: SessionMode) => {
      updateTabRenderState({ sessionMode: mode });
    },
    [updateTabRenderState],
  );
  const consumedInitialInputRequestIdRef = useRef<number | null>(null);
  const consumedInitialSessionModeRequestIdRef = useRef<number | null>(null);
  const inputValueRef = useRef(inputValue);
  const consumedPendingSendRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  // ---- Model lists ----
  const {
    availableModels,
    availableMediaModels,
    activeMediaModel,
    agentMediaModels,
    selectedEffectiveInputBudget,
    selectedOutputTokenCap,
    selectedMaxOutputTokens,
  } = projectChatWorkspaceModelState({
    chatModelOptions: settings.chatModelOptions,
    selectedModel,
    defaultMaxOutputTokens: settings.maxTokens,
    sessionMode,
    mediaModelSelection,
  });

  useEffect(() => {
    if (sessionMode === 'agent') return;
    const hasCurrentSessionModel = availableMediaModels.some(
      (model) => model.category === sessionMode,
    );
    if (!hasCurrentSessionModel) {
      setVisibleSessionMode('agent');
    }
  }, [availableMediaModels, sessionMode, setVisibleSessionMode]);

  // ---- Behavior hooks ----
  const handleSendWithoutConversation = useCallback(
    (input: PendingSendInput) => {
      setVisibleSessionMode('agent');
      onSendWithoutConversation?.(input);
    },
    [onSendWithoutConversation, setVisibleSessionMode],
  );

  const { handleSend, triggerSend, handleCancelMessage, copyLastResponse } = useChatActions({
    inputValue,
    isThinking,
    isCharacterRoleSession,
    selectedModel,
    availableModels: settings.chatModelOptions,
    sessionMode,
    mediaProviderId: activeMediaModel?.providerId,
    mediaModelId: activeMediaModel?.modelId,
    agentMediaModels,
    understandingModels: buildRuntimeUnderstandingModelSelections(
      mediaUnderstandingSelection,
      settings.chatModelOptions,
    ),
    activeConversationId: sessionMutationConversationId,
    activeConversationIdRef: sessionMutationConversationIdRef,
    streamingMessageIdRef,
    messages,
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setActiveTab,
    clearInput,
    setAttachedFiles,
    setSelectedFileReferences,
    ensureConversationForSend: handleSendWithoutConversation,
    onUserMessageSent,
  });
  const pendingSendRequestId = pendingSendRequest?.id;
  const pendingSendIdentity = useMemo<PendingSendIdentity | undefined>(
    () =>
      pendingSendRequestId === undefined
        ? undefined
        : {
            id: `pending-send:${pendingSendRequestId}`,
            timestamp: Date.now(),
          },
    [pendingSendRequestId],
  );
  const visibleMessages = useMemo(() => {
    if (!pendingSendRequest || !pendingSendIdentity) return messages;
    if (messages.some((message) => message.id === pendingSendIdentity.id)) return messages;
    return [
      ...messages,
      {
        id: pendingSendIdentity.id,
        role: 'user' as const,
        content: (
          pendingSendRequest.input.displayMessageText ??
          pendingSendRequest.input.messageText ??
          ''
        ).trim(),
        timestamp: pendingSendIdentity.timestamp,
      },
    ];
  }, [messages, pendingSendIdentity, pendingSendRequest]);

  useEffect(() => {
    if (!pendingSendRequest || !sessionMutationConversationId || !isModelConfigurationReady) return;
    if (consumedPendingSendRequestIdRef.current === pendingSendRequest.id) return;
    if (
      pendingSendRequest.input.sessionMode &&
      pendingSendRequest.input.sessionMode !== sessionMode
    ) {
      setVisibleSessionMode(pendingSendRequest.input.sessionMode);
      return;
    }

    consumedPendingSendRequestIdRef.current = pendingSendRequest.id;
    handleSend(pendingSendRequest.input, pendingSendIdentity);
    onPendingSendRequestConsumed?.(pendingSendRequest.id);
  }, [
    handleSend,
    isModelConfigurationReady,
    onPendingSendRequestConsumed,
    pendingSendRequest,
    pendingSendIdentity,
    sessionMode,
    sessionMutationConversationId,
    setVisibleSessionMode,
  ]);

  useEffect(() => {
    if (!initialInputRequest || !sessionMutationConversationId) return;
    if (consumedInitialInputRequestIdRef.current === initialInputRequest.id) return;

    consumedInitialInputRequestIdRef.current = initialInputRequest.id;
    setInputValue(initialInputRequest.messageText);
    inputValueRef.current = initialInputRequest.messageText;
    const trailingMention = projectTrailingMention(initialInputRequest.messageText);
    if (trailingMention && !isCharacterRoleSession) {
      onMentionSearchFilterChange(trailingMention.requestFilter);
      agentHostMessages.searchProjectFiles(
        trailingMention.requestFilter,
        sessionMutationConversationId,
      );
    }
    onInitialInputRequestConsumed?.(initialInputRequest.id);
  }, [
    initialInputRequest,
    isCharacterRoleSession,
    onMentionSearchFilterChange,
    onInitialInputRequestConsumed,
    sessionMutationConversationId,
    setInputValue,
  ]);

  useEffect(() => {
    if (!queuedEdit) return;

    const currentInputValue = inputValueRef.current;
    if (currentInputValue.trim().length === 0) {
      inputValueRef.current = queuedEdit.item.content;
      updateTabRenderState((state) =>
        state.queuedEdit?.requestId === queuedEdit.requestId
          ? { inputValue: queuedEdit.item.content, queuedEdit: null }
          : {},
      );
      return;
    }

    updateTabRenderState((state) =>
      state.queuedEdit?.requestId === queuedEdit.requestId
        ? {
            queuedEdit: null,
            diagnostics: [
              ...state.diagnostics,
              {
                type: 'sessionDiagnostic',
                code: 'queued-edit-draft-conflict',
                severity: 'warning',
                message: queuedEditDraftConflictMessage,
                conversationId: tabRenderSnapshot.conversationId,
                tabId: tabRenderSnapshot.tabId,
              },
            ],
          }
        : {},
    );
  }, [
    queuedEdit,
    queuedEditDraftConflictMessage,
    tabRenderSnapshot.conversationId,
    tabRenderSnapshot.tabId,
    updateTabRenderState,
  ]);

  const handleVisibleUiMessage = useCallback(
    (event: MessageEvent) => {
      const msg = event.data as {
        type?: string;
        message?: string;
        payload?: AgentContextPayload;
        conversationId?: string | null;
        nodes?: unknown;
      };
      if (!msg?.type) return;
      switch (msg.type) {
        case 'externalMessage':
          if (isCharacterRoleSession) {
            break;
          }
          if (typeof msg.message === 'string') {
            setActiveTab('chat');
            triggerSend(msg.message);
          }
          break;
        case 'prefillInput':
          if (isCharacterRoleSession) {
            break;
          }
          if (typeof msg.message === 'string') {
            setActiveTab('chat');
            setInputValue(msg.message);
            inputValueRef.current = msg.message;
          }
          break;
        case 'ambientCanvasUpdate':
          if (isCharacterRoleSession) {
            break;
          }
          const ambientConversationId = msg.conversationId ?? sessionMutationConversationId;
          if (!ambientConversationId || ambientConversationId !== sessionMutationConversationId) {
            break;
          }
          setAmbientNodes(parseAmbientCanvasUpdateNodes(msg.nodes));
          break;
        default:
          break;
      }
    },
    [
      triggerSend,
      setInputValue,
      setActiveTab,
      setAmbientNodes,
      sessionMutationConversationId,
      isCharacterRoleSession,
    ],
  );

  const visibleMessageHandlerRef = useRef(handleVisibleUiMessage);
  const isVisibleRef = useRef(isVisible);
  useLayoutEffect(() => {
    visibleMessageHandlerRef.current = handleVisibleUiMessage;
    isVisibleRef.current = isVisible;
  }, [handleVisibleUiMessage, isVisible]);

  // Domain messages are owned by ConversationController. A retained workspace
  // consumes only visible, Tab-local UI events.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (isVisibleRef.current) visibleMessageHandlerRef.current(event);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      COMMON_SHORTCUTS.focusInput(requestInputFocus),
      COMMON_SHORTCUTS.clearConversation(() => {
        if (!sessionMutationConversationId) return;
        if (isCharacterRoleSession) {
          clearMessages();
          clearInput();
          return;
        }
        agentHostMessages.clearHistory(sessionMutationConversationId);
        clearMessages();
        clearInput();
      }),
      COMMON_SHORTCUTS.newConversation(() => {
        onNewChat();
      }),
      COMMON_SHORTCUTS.copyLastResponse(copyLastResponse),
      COMMON_SHORTCUTS.cancel(handleCancelMessage),
    ],
    enabled: isVisible,
  });

  // Slash command routing
  const { handleSlashCommand } = useSlashCommands({
    skills,
    pluginCommands,
    inputValue,
    activeConversationId: sessionMutationConversationId,
    setMessages,
    clearInput,
  });

  // ---- Simple callback handlers ----
  // Force re-render counter — used when ref values change but no React state did
  const [, forceRender] = useState(0);

  const handleCompressContext = useCallback(async () => {
    if (isCharacterRoleSession || isCompressing || !sessionMutationConversationId) return;
    conversationCompressingRef.current.set(sessionMutationConversationId, true);
    forceRender((n) => n + 1);
    agentHostMessages.compressContext(sessionMutationConversationId);
  }, [
    isCharacterRoleSession,
    isCompressing,
    sessionMutationConversationId,
    conversationCompressingRef,
  ]);

  const handleExecutionModeChange = (mode: ShellExecutionMode) => {
    if (!sessionMutationConversationId) return;
    updateTabRenderState({ executionMode: mode });
    agentHostMessages.updateSettings({ executionMode: mode }, sessionMutationConversationId);
  };

  const handleMediaModelSelect = useCallback(
    (category: 'image' | 'video' | 'audio', modelId: string) => {
      setMediaModelSelection((prev) => ({ ...prev, [category]: modelId }));
    },
    [setMediaModelSelection],
  );

  const handleMediaUnderstandingModelSelect = useCallback(
    (category: 'image' | 'video' | 'audio', modelId: string) => {
      setMediaUnderstandingSelection((prev) => ({ ...prev, [category]: modelId }));
    },
    [setMediaUnderstandingSelection],
  );

  const handleSessionModeChange = useCallback(
    (mode: SessionMode) => {
      setEntryPromptMenu(null);
      setVisibleSessionMode(mode);
      setMediaModelSelection((prev) => {
        const projection = projectMediaModelSelectionForSessionModeChange({
          sessionMode: mode,
          mediaModelSelection: prev,
          chatModelOptions: settings.chatModelOptions,
        });
        return projection.updated ? projection.mediaModelSelection : prev;
      });
    },
    [settings.chatModelOptions, setEntryPromptMenu, setMediaModelSelection, setVisibleSessionMode],
  );

  useEffect(() => {
    if (!initialSessionModeRequest || !sessionMutationConversationId) return;
    if (consumedInitialSessionModeRequestIdRef.current === initialSessionModeRequest.id) return;

    consumedInitialSessionModeRequestIdRef.current = initialSessionModeRequest.id;
    handleSessionModeChange(initialSessionModeRequest.mode);
    onInitialSessionModeRequestConsumed?.(initialSessionModeRequest.id);
  }, [
    handleSessionModeChange,
    initialSessionModeRequest,
    onInitialSessionModeRequestConsumed,
    sessionMutationConversationId,
  ]);
  const isModelConfigurationBusy =
    modelCatalogStatus === 'loading' || isThinking || workItems.some(isActiveWorkItem);

  const handlePromoteQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      agentHostMessages.promoteQueuedMessage(sessionMutationConversationId, queueItemId);
    },
    [sessionMutationConversationId, isCharacterRoleSession],
  );

  const handleCancelQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      agentHostMessages.cancelQueuedMessage(sessionMutationConversationId, queueItemId);
    },
    [sessionMutationConversationId, isCharacterRoleSession],
  );

  const handleEditQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      agentHostMessages.editQueuedMessage(
        tabRenderSnapshot.tabId,
        sessionMutationConversationId,
        queueItemId,
      );
    },
    [isCharacterRoleSession, sessionMutationConversationId, tabRenderSnapshot.tabId],
  );

  return (
    <InputAreaProvider
      isBusy={isModelConfigurationBusy}
      modelCatalogStatus={modelCatalogStatus}
      sessionMode={sessionMode}
      conversationKind={conversationKind}
      onSessionModeChange={handleSessionModeChange}
      selectedModel={selectedModel}
      availableModels={availableModels}
      onModelSelect={setSelectedModel}
      mediaModelSelection={mediaModelSelection}
      availableMediaModels={availableMediaModels}
      mediaUnderstandingModels={mediaUnderstandingModels}
      mediaUnderstandingSelection={mediaUnderstandingSelection}
      onMediaModelSelect={handleMediaModelSelect}
      onMediaUnderstandingModelSelect={handleMediaUnderstandingModelSelect}
      executionMode={executionMode}
      onExecutionModeChange={handleExecutionModeChange}
      contextTokenCount={contextTokenCount}
      maxContextTokens={selectedEffectiveInputBudget}
      outputTokenCap={selectedOutputTokenCap}
      modelMaxOutputTokens={selectedMaxOutputTokens}
      isCompressing={isCompressing}
      onCompressContext={handleCompressContext}
      mediaModelCallCount={mediaModelCallCount}
      skills={skills}
      pluginCommands={pluginCommands}
      onSlashCommand={handleSlashCommand}
      onRequestFiles={(filter) => {
        onMentionSearchFilterChange(filter);
        if (!isCharacterRoleSession && sessionMutationConversationId) {
          agentHostMessages.searchProjectFiles(filter, sessionMutationConversationId);
        }
      }}
      mentionItems={mentionItems}
      onAddContextChip={handleAddContextChip}
      contextChips={contextChips}
      onRemoveContextChip={handleRemoveContextChip}
      ambientNodes={ambientNodes}
      genCategory={genCategory}
      genParams={genParams}
      onGenCategoryChange={setGenCategory}
      onGenParamsChange={updateGenParams}
    >
      {isVisible &&
      latestSessionDiagnostic &&
      foregroundConversationAvailability?.kind !== 'unavailable' ? (
        <AgentDiagnosticToast title="会话错误">
          {latestSessionDiagnostic.code}: {latestSessionDiagnostic.message}
        </AgentDiagnosticToast>
      ) : null}
      <ChatView
        composerDisabled={!isModelConfigurationReady}
        messages={visibleMessages}
        inputValue={inputValue}
        isThinking={isThinking}
        isRunActive={isThinking || streamingMessageId !== null}
        queuedMessageCount={queuedMessageCount}
        queuedMessages={queuedMessages}
        streamingMessageId={streamingMessageId}
        activeConversationId={tabConversationId}
        conversationKind={conversationKind}
        characterDialogueSession={characterDialogueSession}
        embodyCharacterSession={embodyCharacterSession}
        foregroundConversationAvailability={foregroundConversationAvailability}
        activationProgress={!isCharacterRoleSession ? activationProgress : []}
        viewport={viewport}
        onViewportChange={setViewport}
        workItems={workItems}
        pluginsAvailable={pluginsAvailable}
        contextChips={contextChips}
        ambientNodes={ambientNodes}
        onInputChange={setInputValue}
        onSend={handleSend}
        onCancel={handleCancelMessage}
        onPromoteQueuedMessage={handlePromoteQueuedMessage}
        onCancelQueuedMessage={handleCancelQueuedMessage}
        onEditQueuedMessage={handleEditQueuedMessage}
        entryPromptMenu={entryPromptMenu}
        onEntryPromptMenuChange={setEntryPromptMenu}
        composerMenuState={composerMenuState}
        onComposerMenuStateChange={setComposerMenuState}
        attachedFiles={attachedFiles}
        onAttachedFilesChange={setAttachedFiles}
        selectedFileReferences={selectedFileReferences}
        onSelectedFileReferencesChange={setSelectedFileReferences}
        isComposing={composition.isComposing}
        onCompositionChange={setComposition}
        focusRequestOwner={tabRenderSnapshot.tabId}
        focusRequestEnabled={tabRenderSnapshot.visibility === 'visible'}
        focusRequestTarget={focus.target}
        focusRequestRevision={focus.requestRevision}
        agentState={agentState}
      />
    </InputAreaProvider>
  );
}

function resolveSetStateAction<T>(value: React.SetStateAction<T>, current: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(current) : value;
}

function isActiveWorkItem(item: AgentWorkItem): boolean {
  return item.status === 'queued' || item.status === 'processing';
}

function buildRuntimeUnderstandingModelSelections(
  selection: MediaUnderstandingSelection,
  options: readonly ChatModelOption[],
): MediaUnderstandingModelSelections | undefined {
  const result: MediaUnderstandingModelSelections = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    const selectedId = selection[category];
    if (selectedId === 'auto') continue;
    const option = options.find((model) => model.id === selectedId);
    if (!option?.providerId || !option.modelId) continue;
    result[category] = {
      providerId: option.providerId,
      modelId: option.modelId,
      category: 'llm',
    };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
