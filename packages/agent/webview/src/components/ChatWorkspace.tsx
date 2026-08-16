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
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AgentCanvasTurnIntent, AgentContextPayload } from '@neko/agent-contracts';
import {
  useComposerWorkspacePresentation,
  type AgentComposerCanvasPresentation,
} from './ComposerWorkspaceContext';
import type { ChatModelOption } from '@neko/ai-contracts';
import {
  ShellExecutionMode,
  SessionMode,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
  type AgentQueuedMessageItem,
  type AgentFlatPurposeModelRefs,
  type AgentInputCatalogMessage,
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
import type { ComposerMenuState, EntryPromptMenu, MentionItem } from './ChatView/InputArea/types';
import type { PluginsAvailable } from './ChatView/SendToMenu';
import type { AgentWorkItem } from './AgentWorkItem';
import type { ActivationProgressTimeline } from '../presenters/activation-progress-presenter';
import { projectTrailingMention } from './ChatView/InputArea/mention-input';
import { useTranslation } from '../i18n/I18nContext';
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
  composerPresentation?: 'default' | 'compact';
  conversationFeed?: ReactNode;
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
  inputCatalog?: AgentInputCatalogMessage;
  configurationPolicy?: import('@neko/agent-contracts').AgentConfigurationPolicyProjection;
  onInputDiagnostic?: (message: string) => void;
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
  activationProgress?: readonly ActivationProgressTimeline[];
  // Context chips
  ambientNodes: AmbientCanvasNode[];
  // Agent state
  agentState: AgentState | null;
  setAmbientNodes: React.Dispatch<React.SetStateAction<AmbientCanvasNode[]>>;
  onNewChat: () => void;
  onUserMessageSent?: (event: { conversationId: string; message: Message }) => void;
  onSendWithoutConversation?: (input: PendingSendInput) => boolean;
  pendingSendRequest?: { id: number; input: PendingSendInput } | null;
  onPendingSendRequestConsumed?: (id: number) => void;
  initialInputRequest?: { id: number; messageText: string } | null;
  onInitialInputRequestConsumed?: (id: number) => void;
  initialSessionModeRequest?: { id: number; mode: SessionMode } | null;
  onInitialSessionModeRequestConsumed?: (id: number) => void;
  workspaceCanvas?: {
    readonly workspaceLabel: string;
    readonly canvas?: AgentComposerCanvasPresentation;
  };
  queuedEditDraftConflictMessage: string;
}

// =============================================================================
// Component
// =============================================================================

export function ChatWorkspace({
  tabRenderStore,
  isVisible = true,
  composerPresentation = 'default',
  conversationFeed,
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
  inputCatalog,
  configurationPolicy,
  onInputDiagnostic,
  workItems,
  pluginsAvailable,
  setActiveTab,
  conversationCompressingRef,
  contextTokenCount,
  isCompressing,
  mediaModelCallCount,
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
  workspaceCanvas,
}: ChatWorkspaceProps) {
  const agentHostMessages = useAgentHostMessages();
  const { t } = useTranslation();
  const composerWorkspace = useComposerWorkspacePresentation();
  const { snapshot: tabRenderSnapshot, updateState: updateTabRenderState } =
    useTabRenderStore(tabRenderStore);
  const tabState = tabRenderSnapshot.state;
  const [workspaceCanvasCatalog, setWorkspaceCanvasCatalog] = useState<
    import('@neko/canvas-domain').CanvasWorkspaceContextCatalog | undefined
  >();
  const [workspaceCanvasLoading, setWorkspaceCanvasLoading] = useState(false);
  const [workspaceCanvasDiagnostic, setWorkspaceCanvasDiagnostic] = useState<string>();
  const workspaceCanvasRequestSeq = useRef(0);
  const previousWorkspaceIdRef = useRef<string | undefined>(undefined);
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
    updateTabRenderState({
      focus: { target: 'input', requestId: crypto.randomUUID() },
    });
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
  const isRunActive =
    isThinking ||
    streamingMessageId !== null ||
    (agentState !== null && agentState.phase !== 'idle');
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

  // ---- Behavior hooks ----
  const handleSendWithoutConversation = useCallback(
    (input: PendingSendInput) => {
      if (!onSendWithoutConversation) return false;
      setVisibleSessionMode('agent');
      return onSendWithoutConversation(input);
    },
    [onSendWithoutConversation, setVisibleSessionMode],
  );

  const {
    handleSend: handleSendBase,
    triggerSend,
    handleCancelMessage,
    copyLastResponse,
  } = useChatActions({
    inputValue,
    isThinking: isRunActive,
    inputCatalog,
    reportInputDiagnostic: onInputDiagnostic,
    selectedModel,
    availableModels: settings.chatModelOptions,
    sessionMode,
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

  const workspaceId =
    composerWorkspace?.kind === 'workspace' ? composerWorkspace.workspaceId : undefined;
  useEffect(() => {
    if (workspaceId === undefined || composerWorkspace?.kind !== 'workspace') {
      setWorkspaceCanvasCatalog(undefined);
      setWorkspaceCanvasLoading(false);
      setWorkspaceCanvasDiagnostic(undefined);
      return;
    }
    const seq = workspaceCanvasRequestSeq.current + 1;
    workspaceCanvasRequestSeq.current = seq;
    setWorkspaceCanvasLoading(true);
    setWorkspaceCanvasDiagnostic(undefined);
    setWorkspaceCanvasCatalog(undefined);
    composerWorkspace
      .loadCanvasCatalog()
      .then((catalog) => {
        if (workspaceCanvasRequestSeq.current !== seq) return;
        setWorkspaceCanvasCatalog(catalog);
        setWorkspaceCanvasLoading(false);
      })
      .catch((error: unknown) => {
        if (workspaceCanvasRequestSeq.current !== seq) return;
        setWorkspaceCanvasDiagnostic(error instanceof Error ? error.message : String(error));
        setWorkspaceCanvasLoading(false);
      });
  }, [composerWorkspace, workspaceId]);

  useEffect(() => {
    if (workspaceId === undefined) {
      previousWorkspaceIdRef.current = undefined;
      return;
    }
    if (shouldResetWorkspaceCanvasSelection(previousWorkspaceIdRef.current, workspaceId)) {
      updateTabRenderState({ workspaceCanvasSelectionId: 'workspace-board' });
    }
    previousWorkspaceIdRef.current = workspaceId;
  }, [updateTabRenderState, workspaceId]);

  const workspaceCanvasPresentation = useMemo<AgentComposerCanvasPresentation | undefined>(() => {
    if (workspaceId === undefined || composerWorkspace?.kind !== 'workspace') return undefined;
    const boardTarget = { kind: 'workspace-board' as const, workspaceId };
    const boardOption = {
      id: 'workspace-board',
      label: t('chat.input.workspaceCanvas.board'),
      target: boardTarget,
      summary: undefined,
    };
    const catalogOptions = workspaceCanvasCatalog
      ? workspaceCanvasCatalog.options.map((option) => ({
          id: option.target.kind === 'workspace-board' ? 'workspace-board' : option.target.canvasId,
          label: option.label,
          target: option.target,
          ...(option.summary === undefined ? {} : { summary: option.summary }),
          ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
          ...(option.diagnostic === undefined ? {} : { diagnostic: option.diagnostic }),
        }))
      : [];
    const options = catalogOptions.some((option) => option.id === 'workspace-board')
      ? catalogOptions
      : [boardOption, ...catalogOptions];
    return {
      workspaceId,
      defaultTarget: boardTarget,
      options,
      selectedId: tabState.workspaceCanvasSelectionId,
      loading: workspaceCanvasLoading,
      ...(workspaceCanvasDiagnostic === undefined ? {} : { diagnostic: workspaceCanvasDiagnostic }),
      onSelect: (optionId) => {
        updateTabRenderState({ workspaceCanvasSelectionId: optionId });
        return Promise.resolve();
      },
      ...(composerWorkspace.openCanvasDocument === undefined
        ? {}
        : { onOpen: composerWorkspace.openCanvasDocument }),
    };
  }, [
    composerWorkspace,
    tabState.workspaceCanvasSelectionId,
    t,
    updateTabRenderState,
    workspaceCanvasCatalog,
    workspaceCanvasDiagnostic,
    workspaceCanvasLoading,
    workspaceId,
  ]);

  const effectiveCanvasPresentation =
    composerWorkspace?.kind === 'workspace' ? workspaceCanvasPresentation : workspaceCanvas?.canvas;

  const handleSend = useCallback(
    (
      input?: import('../hooks').PendingSendInput,
      identity?: import('../hooks').PendingSendIdentity,
    ) => {
      try {
        const canvasTurnTarget = projectWorkspaceCanvasTurnTarget(effectiveCanvasPresentation);
        const result = handleSendBase(
          canvasTurnTarget ? { ...input, canvasTurnTarget } : input,
          identity,
        );
        if (typeof result === 'boolean') {
          if (result) updateTabRenderState({ viewport: { followMode: 'follow-tail' } });
          return result;
        }
        return result.then((accepted) => {
          if (accepted) updateTabRenderState({ viewport: { followMode: 'follow-tail' } });
          return accepted;
        });
      } catch (error) {
        onInputDiagnostic?.(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [effectiveCanvasPresentation, handleSendBase, onInputDiagnostic, updateTabRenderState],
  );
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

    const receipt = handleSend(pendingSendRequest.input, pendingSendIdentity);
    const consumePendingSend = (accepted: boolean): void => {
      if (!accepted) return;
      consumedPendingSendRequestIdRef.current = pendingSendRequest.id;
      onPendingSendRequestConsumed?.(pendingSendRequest.id);
    };
    if (typeof receipt === 'boolean') {
      consumePendingSend(receipt);
      return;
    }
    void receipt.then(consumePendingSend);
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
    updateTabRenderState((state) => {
      if (state.queuedEdit?.requestId !== queuedEdit.requestId) return {};
      const hasComposerDraft =
        state.inputValue.trim().length > 0 ||
        state.attachedFiles.length > 0 ||
        state.selectedFileReferences.length > 0 ||
        state.contextReferences.length > 0;
      if (hasComposerDraft) {
        return {
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
        };
      }
      const draft = queuedEdit.item.draft;
      const restoredInput = projectQueuedEditInput(queuedEdit.item);
      const primaryModel =
        draft?.configuration?.agentModels?.primary ?? draft?.configuration?.chatModel;
      const purposeModels = draft?.configuration?.purposeModels;
      inputValueRef.current = restoredInput;
      return {
        inputValue: restoredInput,
        attachedFiles: [...(draft?.attachments ?? [])],
        selectedFileReferences: [...(draft?.fileReferences ?? [])],
        contextReferences: [...(draft?.contextPayloads ?? [])],
        ...(draft === undefined ? {} : { sessionMode: draft.sessionMode }),
        ...(primaryModel === undefined ? {} : { selectedModel: primaryModel.modelId }),
        ...(purposeModels === undefined
          ? {}
          : {
              mediaModelSelection: restoreQueuedMediaModelSelection(
                state.mediaModelSelection,
                purposeModels,
              ),
              mediaUnderstandingSelection: restoreQueuedUnderstandingModelSelection(
                state.mediaUnderstandingSelection,
                purposeModels,
              ),
            }),
        queuedEdit: null,
      };
    });
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
    inputCatalog,
    inputValue,
    activeConversationId: sessionMutationConversationId,
    clearInput,
    reportInputDiagnostic: onInputDiagnostic,
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
    modelCatalogStatus === 'loading' || isRunActive || workItems.some(isActiveWorkItem);

  const handleSendQueuedMessageNow = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      agentHostMessages.sendQueuedMessageNow(sessionMutationConversationId, queueItemId);
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
      inputCatalog={inputCatalog?.entries}
      configurationPolicy={configurationPolicy}
      inputCatalogPhase={inputCatalog?.phase}
      inputCatalogBindingKind={inputCatalog?.bindingKind}
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
        composerPresentation={composerPresentation}
        conversationFeed={conversationFeed}
        composerDisabled={!isModelConfigurationReady}
        messages={visibleMessages}
        inputValue={inputValue}
        isThinking={isThinking}
        isRunActive={isRunActive}
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
        onSendQueuedMessageNow={handleSendQueuedMessageNow}
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
        workspaceCanvas={
          composerWorkspace?.kind === 'workspace'
            ? { workspaceLabel: composerWorkspace.label, canvas: workspaceCanvasPresentation }
            : workspaceCanvas
        }
        focusRequestEnabled={tabRenderSnapshot.visibility === 'visible'}
        focusRequestTarget={focus.target}
        focusRequestId={focus.requestId}
        agentState={agentState}
      />
    </InputAreaProvider>
  );
}

export function shouldResetWorkspaceCanvasSelection(
  previousWorkspaceId: string | undefined,
  nextWorkspaceId: string | undefined,
): boolean {
  return (
    previousWorkspaceId !== undefined &&
    previousWorkspaceId !== nextWorkspaceId &&
    nextWorkspaceId !== undefined
  );
}

export function projectWorkspaceCanvasTurnTarget(
  canvas: AgentComposerCanvasPresentation | undefined,
): AgentCanvasTurnIntent | undefined {
  if (canvas === undefined) return undefined;
  const selected = canvas.options.find((option) => option.id === canvas.selectedId);
  if (selected === undefined) {
    throw new Error('Workspace Canvas selection is unavailable.');
  }
  if (selected.target.kind === 'workspace-board') {
    if (selected.disabled || selected.diagnostic) {
      throw new Error(selected.diagnostic ?? 'Workspace Board selection is unavailable.');
    }
    return undefined;
  }
  if (canvas.loading) {
    throw new Error('Workspace Canvas catalog is loading.');
  }
  if (canvas.diagnostic) {
    throw new Error(canvas.diagnostic);
  }
  if (selected.disabled || selected.diagnostic) {
    throw new Error(selected.diagnostic ?? 'Workspace Canvas selection is unavailable.');
  }
  if (selected.summary === undefined) {
    throw new Error('Exact Canvas selection requires its light summary.');
  }
  return {
    workspaceId: selected.target.workspaceId,
    target: selected.target,
    summary: selected.summary,
  };
}

function resolveSetStateAction<T>(value: React.SetStateAction<T>, current: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(current) : value;
}

function projectQueuedEditInput(item: AgentQueuedMessageItem): string {
  const draft = item.draft;
  const input = draft?.input;
  if (!input) return draft?.message ?? item.content;
  const name = input.kind === 'skill' ? input.skillName : input.commandId;
  return `${input.kind === 'skill' ? '$' : '/'}${name}${input.args ? ` ${input.args}` : ''}`;
}

function restoreQueuedMediaModelSelection(
  current: Readonly<MediaModelSelection>,
  purposes: AgentFlatPurposeModelRefs,
): MediaModelSelection {
  return {
    image: purposes['image.generate']?.modelId ?? purposes['image.edit']?.modelId ?? current.image,
    video: purposes['video.generate']?.modelId ?? current.video,
    audio:
      purposes['audio.generate']?.modelId ??
      purposes['audio.tts']?.modelId ??
      purposes['audio.music.generate']?.modelId ??
      current.audio,
  };
}

function restoreQueuedUnderstandingModelSelection(
  current: Readonly<MediaUnderstandingSelection>,
  purposes: AgentFlatPurposeModelRefs,
): MediaUnderstandingSelection {
  return {
    image: purposes['image.understand']?.modelId ?? current.image,
    video: purposes['video.understand']?.modelId ?? current.video,
    audio: purposes['audio.understand']?.modelId ?? current.audio,
  };
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
