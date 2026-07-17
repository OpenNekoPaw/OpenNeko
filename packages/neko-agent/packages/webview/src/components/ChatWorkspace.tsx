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
  useRef,
  useState,
} from 'react';
import type { AgentContextPayload, ChatModelOption } from '@neko/shared';
import {
  ShellExecutionMode,
  SessionMode,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
  type AgentQueuedMessageItem,
  type AgentLlmConfig,
} from '@neko-agent/types';
import type {
  MediaUnderstandingModelSelections,
  MediaUnderstandingModels,
  SettingsState,
  Message,
  TabType,
} from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import { ChatView } from '@/components/ChatView';
import {
  InputAreaProvider,
  type MediaModelSelection,
  type MediaUnderstandingSelection,
} from '@/components/ChatView/InputAreaContext';
import type {
  ComposerMenuState,
  EntryPromptMenu,
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { AgentWorkItem } from '@/components/AgentWorkItem';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import { projectTrailingMention } from '@/components/ChatView/InputArea/mention-input';
import { useChatActions, type PendingSendInput, useSlashCommands } from '@/hooks';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import {
  projectChatWorkspaceModelState,
  projectMediaModelSelectionForSessionModeChange,
} from '@/presenters/config-message-presenter';
import { isCharacterRoleConversationKind } from '@/presenters/character-role-session-presenter';
import type { ForegroundConversationAvailability } from '@/render-lifecycle/conversation-render-contract';
import type { TabRenderStore, TabViewportSnapshot } from '@/render-runtime/tab-render-runtime';
import { useTabRenderStore } from '@/render-runtime/useTabRenderStore';

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
  ambientNodes: Array<{ nodeId: string; type: string; summary: string }>;
  // Agent state
  agentState: AgentState | null;
  setAmbientNodes: React.Dispatch<
    React.SetStateAction<Array<{ nodeId: string; type: string; summary: string }>>
  >;
  onNewChat: () => void;
  onUserMessageSent?: (event: { conversationId: string; message: Message }) => void;
  onSendWithoutConversation?: (input: PendingSendInput) => void;
  pendingSendRequest?: { id: number; input: PendingSendInput } | null;
  onPendingSendRequestConsumed?: (id: number) => void;
  initialInputRequest?: { id: number; messageText: string } | null;
  onInitialInputRequestConsumed?: (id: number) => void;
  initialEntryPromptMenuRequest?: { id: number; menu: EntryPromptMenu } | null;
  onInitialEntryPromptMenuRequestConsumed?: (id: number) => void;
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
  initialEntryPromptMenuRequest,
  onInitialEntryPromptMenuRequestConsumed,
  queuedEditDraftConflictMessage,
}: ChatWorkspaceProps) {
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
  const llmConfig = tabState.llmConfig;
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
    React.Dispatch<
      React.SetStateAction<import('@/components/ChatView/InputArea/types').MessageAttachment[]>
    >
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
      React.SetStateAction<import('@/components/ChatView/InputArea/types').SelectedFileReference[]>
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
  const setLlmConfig = useCallback(
    (config: AgentLlmConfig) => {
      updateTabRenderState({ llmConfig: config });
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
  const consumedEntryPromptRequestIdRef = useRef<number | null>(null);
  const consumedInitialInputRequestIdRef = useRef<number | null>(null);
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
    availableModels,
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

  useEffect(() => {
    if (!pendingSendRequest || !sessionMutationConversationId || !isModelConfigurationReady) return;
    if (consumedPendingSendRequestIdRef.current === pendingSendRequest.id) return;

    consumedPendingSendRequestIdRef.current = pendingSendRequest.id;
    handleSend(pendingSendRequest.input);
    onPendingSendRequestConsumed?.(pendingSendRequest.id);
  }, [
    handleSend,
    isModelConfigurationReady,
    onPendingSendRequestConsumed,
    pendingSendRequest,
    sessionMutationConversationId,
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
      AgentHostMessages.searchProjectFiles(
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
    if (!initialEntryPromptMenuRequest || !sessionMutationConversationId) return;
    if (consumedEntryPromptRequestIdRef.current === initialEntryPromptMenuRequest.id) return;

    consumedEntryPromptRequestIdRef.current = initialEntryPromptMenuRequest.id;
    setEntryPromptMenu(initialEntryPromptMenuRequest.menu);
    if (initialEntryPromptMenuRequest.menu === 'roleplay') {
      onMentionSearchFilterChange('');
      AgentHostMessages.searchProjectFiles('', sessionMutationConversationId, {
        purpose: 'roleplay',
      });
    }
    onInitialEntryPromptMenuRequestConsumed?.(initialEntryPromptMenuRequest.id);
  }, [
    initialEntryPromptMenuRequest,
    onInitialEntryPromptMenuRequestConsumed,
    onMentionSearchFilterChange,
    sessionMutationConversationId,
    setEntryPromptMenu,
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
        nodes?: Array<{ nodeId: string; type: string; summary: string }>;
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
          setAmbientNodes(msg.nodes ?? []);
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
        AgentHostMessages.clearHistory(sessionMutationConversationId);
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
    AgentHostMessages.compressContext(sessionMutationConversationId);
  }, [
    isCharacterRoleSession,
    isCompressing,
    sessionMutationConversationId,
    conversationCompressingRef,
  ]);

  const handleExecutionModeChange = (mode: ShellExecutionMode) => {
    if (!sessionMutationConversationId) return;
    updateTabRenderState({ executionMode: mode });
    AgentHostMessages.updateSettings({ executionMode: mode }, sessionMutationConversationId);
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
  const isModelConfigurationBusy =
    modelCatalogStatus === 'loading' || isThinking || workItems.some(isActiveWorkItem);

  const handlePromoteQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      AgentHostMessages.promoteQueuedMessage(sessionMutationConversationId, queueItemId);
    },
    [sessionMutationConversationId, isCharacterRoleSession],
  );

  const handleCancelQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      AgentHostMessages.cancelQueuedMessage(sessionMutationConversationId, queueItemId);
    },
    [sessionMutationConversationId, isCharacterRoleSession],
  );

  const handleEditQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      AgentHostMessages.editQueuedMessage(
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
          AgentHostMessages.searchProjectFiles(filter, sessionMutationConversationId);
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
      {latestSessionDiagnostic && foregroundConversationAvailability?.kind !== 'unavailable' ? (
        <div
          className="fixed right-4 top-12 z-50 max-w-[360px] rounded-lg border border-[var(--vscode-inputValidation-errorBorder,var(--agent-border))] bg-[var(--vscode-inputValidation-errorBackground,var(--agent-elevated))] px-3 py-2 text-sm text-[var(--vscode-inputValidation-errorForeground,var(--agent-fg))] shadow-lg animate-slide-in"
          role="alert"
        >
          <div className="font-medium">会话错误</div>
          <div className="mt-1 opacity-90">
            {latestSessionDiagnostic.code}: {latestSessionDiagnostic.message}
          </div>
        </div>
      ) : null}
      <ChatView
        composerDisabled={!isModelConfigurationReady}
        messages={messages}
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
        onCancelTask={(taskScope) => {
          if (!isCharacterRoleSession && sessionMutationConversationId) {
            AgentHostMessages.cancelTask(taskScope);
          }
        }}
        onRetryTask={(taskScope) => {
          if (!isCharacterRoleSession && sessionMutationConversationId) {
            AgentHostMessages.retryTask(taskScope);
          }
        }}
        onViewTaskResult={(taskScope, resultRef) => {
          if (!isCharacterRoleSession && sessionMutationConversationId) {
            AgentHostMessages.viewTaskResult(taskScope, resultRef);
          }
        }}
        onInputChange={setInputValue}
        onSend={handleSend}
        onCancel={handleCancelMessage}
        onPromoteQueuedMessage={handlePromoteQueuedMessage}
        onCancelQueuedMessage={handleCancelQueuedMessage}
        onEditQueuedMessage={handleEditQueuedMessage}
        entryPromptMenu={entryPromptMenu}
        onEntryPromptMenuChange={setEntryPromptMenu}
        llmConfig={llmConfig}
        onLlmConfigChange={setLlmConfig}
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
