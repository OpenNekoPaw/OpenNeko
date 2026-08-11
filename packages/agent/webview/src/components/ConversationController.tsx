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
  type AgentHostToWebviewMessage,
  type AgentInputCatalogMessage,
  type AgentLaunchCatalogProjection,
  SettingsState,
  AgentState,
  type AgentSessionDiagnosticMessage,
  type AgentInteractionProjection,
  type AgentInputCatalogEntry,
  type AgentInputReferenceReceipt,
  type AgentCharacterDialogueTargetOption,
  type ParsedAgentInputTrigger,
  isAgentInputCatalogEntryExecutable,
  parseAgentInputTrigger,
  Message,
  OpenTab,
  SessionMode,
  TabType,
  requireAgentDraftHostRuntimeAdapter,
} from '@neko/agent-contracts';
import type {
  SkillSummary,
  EntryPromptMenu,
  MentionItem,
  SelectedCharacterLaunch,
  PluginSlashCommandDef,
  GenCategory,
  GenerationParams,
} from './ChatView/InputArea/types';
import { EmptyState } from './ChatView/EmptyState';
import { HomeExperienceModeSelector } from './ChatView/HomeExperienceModeSelector';
import { HomeExperienceQuickActions } from './ChatView/HomeExperienceQuickActions';
import { CharacterDialogueTargetSelector } from './ChatView/CharacterDialogueTargetSelector';
import { AuthoringTargetSelector } from './ChatView/AuthoringTargetSelector';
import { InputArea } from './ChatView/InputArea';
import { resolveAgentInputInvocationIntent } from './ChatView/InputArea/slash-command-catalog';
import {
  InputAreaProvider,
  type MediaCategory,
  type MediaModelSelection,
} from './ChatView/InputAreaContext';
import { useTranslation } from '../i18n/I18nContext';
import type { AgentWorkItemStore } from './AgentWorkItem';
import { removeConversationWorkItems } from './AgentWorkItem';
import type { PluginsAvailable } from './ChatView/SendToMenu';
import type { ProjectFileInfo } from '../hooks/useConfigState';
import {
  useConversationState,
  useTabManager,
  type PendingSendInput,
  type ConversationRenderStateUpdater,
} from '../hooks';
import { useMessageHandler, type PendingForegroundConversationActivation } from '../handlers';
import type { ConversationSettingsSnapshot } from '../handlers/types';
import type { ActivationProgressTimeline } from '../presenters/activation-progress-presenter';
import { shouldActivateForegroundConversation } from '../handlers/foreground-activation';
import { ConversationTabRuntimeView } from './ConversationTabRuntimeView';
import { useRetainedTabComponents } from '../render-runtime/useRetainedTabComponents';
import { useAgentHostMessages, useAgentHostRuntimeAdapter } from '../host-runtime-context';
import { isCharacterRoleConversationKind } from '../presenters/character-role-session-presenter';
import type {
  ConversationStreamingSnapshot,
  ForegroundConversationAvailability,
} from '../render-lifecycle/conversation-render-contract';
import {
  applyUserMessageToConversationSummaries,
  applyUserMessageToOpenTabs,
  projectDisplayTabs,
  type DisplayTab,
} from '../presenters/tab-display-presenter';
import {
  projectHistoryCleanup,
  projectHistoryConversationItems,
  type HistoryConversationItem,
} from '../presenters/history-menu-presenter';
import { projectOptimisticQueuedMessageItem } from '../presenters/message-queue-presenter';
import {
  projectChatWorkspaceModelState,
  projectMessageModelSelection,
  projectMediaModelSelectionDefaults,
  projectMediaModelSelectionForSessionModeChange,
} from '../presenters/config-message-presenter';
import {
  type ConversationAmbientNode,
  type ConversationSessionState,
  projectConversationSessionState,
} from '../presenters/conversation-session-state-presenter';
import { DEFAULT_GENERATION_PARAMS } from './ChatView/InputArea/types';
import { useTabRenderRuntimeRegistry } from '../render-runtime/useTabRenderRuntimeRegistry';
import {
  readAgentEntryDraftSnapshot,
  writeAgentEntryDraftSnapshot,
} from '../render-runtime/tab-render-realm-state';
import { useProjectionEndpoint } from '../render-runtime/useProjectionEndpoint';
import type { AgentContextPayload } from '@neko/agent-contracts';
import type { ConversationRenderCoordinator } from '../render-lifecycle/conversation-render-coordinator';
import { AgentDiagnosticToast } from './AgentDiagnosticToast';
import {
  useComposerWorkspacePresentation,
  type AgentComposerWorkspaceTarget,
} from './ComposerWorkspaceContext';
import type { AgentEntryIntentProjection, AgentEntryMode } from '@neko/agent-contracts';
import { projectHomeExperienceEntry } from '../presenters/home-experience-entry-presenter';

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
  initialConversation?: { readonly id: string; readonly title: string };
  initialInput?: { readonly id: string; readonly value: string };
  emptyStatePresentation?: 'default' | 'desktop-dock';
  agentPresentation?: AgentInteractionProjection;
  conversationFeed?: {
    readonly conversationId: string;
    readonly content: ReactNode;
  };
  settings: SettingsState;
  hasConfigSnapshot: boolean;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setHasConfigSnapshot: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  mentionItems: MentionItem[];
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  mentionSearchFilter: string;
  setMentionSearchFilter: React.Dispatch<React.SetStateAction<string>>;
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
  store: import('../render-runtime/tab-render-runtime').TabRenderStore,
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
  agentPresentation,
  conversationFeed,
  emptyStatePresentation = 'default',
  initialConversation,
  initialInput,
  settings,
  hasConfigSnapshot,
  setSettings,
  setHasConfigSnapshot,
  setProjectFiles,
  mentionItems,
  setMentionItems,
  mentionSearchFilter,
  setMentionSearchFilter,
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
  const hostRuntimeAdapter = useAgentHostRuntimeAdapter();
  const agentHostMessages = useAgentHostMessages();
  const composerWorkspace = useComposerWorkspacePresentation();
  const isDraftPresentation = agentPresentation?.phase === 'draft';
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
  const [initialNavigationHydration, setInitialNavigationHydration] = useState({
    runtimeId: hostRuntimeAdapter.runtimeId,
    conversationList: false,
    tabState: false,
  });
  const [foregroundAvailabilityByConversation, setForegroundAvailabilityByConversation] = useState<
    Map<string, ForegroundConversationAvailability>
  >(() => new Map());
  const [entryInputValue, setEntryInputValue] = useState('');
  const [entryContextReferences, setEntryContextReferences] = useState<AgentContextPayload[]>([]);
  const [entryCharacterLaunches, setEntryCharacterLaunches] = useState<SelectedCharacterLaunch[]>(
    [],
  );
  const [entryCharacterTargets, setEntryCharacterTargets] = useState<
    readonly AgentCharacterDialogueTargetOption[]
  >([]);
  const [entryCharacterTargetsStatus, setEntryCharacterTargetsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle');
  const [entryMode, setEntryMode] = useState<AgentEntryMode>('assistant');
  const [entryIntent, setEntryIntent] = useState<AgentEntryIntentProjection>({
    mode: 'assistant',
    targetReceipt: null,
  });
  const [entryWorkspaceTarget, setEntryWorkspaceTarget] = useState<AgentComposerWorkspaceTarget>();
  const [isEntryBindingPending, setIsEntryBindingPending] = useState(false);
  const [entryQuickDetailOpen, setEntryQuickDetailOpen] = useState(true);
  const [entrySessionMode, setEntrySessionMode] = useState<SessionMode>('agent');
  const [entryExecutionMode, setEntryExecutionMode] = useState<SettingsState['executionMode']>(
    settings.executionMode,
  );
  const [entryGenCategory, setEntryGenCategory] = useState<GenCategory>('image');
  const [entryGenParams, setEntryGenParams] = useState<GenerationParams>(DEFAULT_GENERATION_PARAMS);
  const activeDraftIdRef = useRef<string>();
  const skipEntryDraftWriteRef = useRef<string>();
  const committedEntryDraftIdRef = useRef<string>();

  // ---- Per-conversation ref Maps ----
  const conversationTokenCountRef = useRef<Map<string, number>>(new Map());
  const conversationCompressingRef = useRef<Map<string, boolean>>(new Map());
  const conversationMediaCallCountRef = useRef<Map<string, number>>(new Map());
  const [renderSignal, setRenderSignal] = useState(false);

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
    setEntryInputValue(value);
  }, []);
  const appliedInitialInputRef = useRef<string>();
  useEffect(() => {
    const normalizedInput = initialInput?.value.trim();
    if (!initialInput || !normalizedInput || openTabs.length > 0) return;
    if (appliedInitialInputRef.current === initialInput.id) return;
    appliedInitialInputRef.current = initialInput.id;
    updateEntryInputValue(normalizedInput);
  }, [initialInput, openTabs.length, updateEntryInputValue]);
  const addEntryContextReference = useCallback((payload: AgentContextPayload) => {
    setEntryCharacterLaunches([]);
    setEntryContextReferences((current) =>
      current.some((reference) => reference.id === payload.id) ? current : [...current, payload],
    );
  }, []);
  const removeEntryContextReference = useCallback((id: string) => {
    setEntryContextReferences((current) => current.filter((reference) => reference.id !== id));
  }, []);
  const configureEntryCharacterLaunches = useCallback(
    (nextValue: readonly SelectedCharacterLaunch[]) => {
      if (isEntryBindingPending) return;
      const next: SelectedCharacterLaunch[] = [...nextValue];
      setIsEntryBindingPending(true);
      void requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter)
        .configureEntryTarget(
          'character-dialogue',
          next.length === 0
            ? undefined
            : {
                kind: 'character-dialogue',
                mode: 'companion',
                participants: next.map((selection) => ({
                  characterProjectId: selection.characterProjectId,
                  characterVersionId: selection.characterVersionId,
                })),
              },
        )
        .then((intent) => {
          setEntryIntent(intent);
          setEntryContextReferences([]);
          setEntryCharacterLaunches(next);
          setGlobalError(null);
        })
        .catch((error: unknown) => setGlobalError(describeError(error)))
        .finally(() => setIsEntryBindingPending(false));
    },
    [hostRuntimeAdapter, isEntryBindingPending],
  );
  const configureEntryAuthoringTarget = useCallback(
    async (target: AgentComposerWorkspaceTarget | undefined) => {
      setEntryContextReferences([]);
      setEntryCharacterLaunches([]);
      setProjectFiles([]);
      setMentionItems([]);
      updateMentionSearchFilter('');
      setIsEntryBindingPending(true);
      try {
        const intent = await requireAgentDraftHostRuntimeAdapter(
          hostRuntimeAdapter,
        ).configureEntryTarget(
          'authoring',
          target?.target
            ? {
                kind: 'authoring',
                workspaceId: target.context.workspaceId,
                workspaceGrantId: target.context.workspaceGrantId,
                target: target.target,
              }
            : undefined,
        );
        setEntryIntent(intent);
        setEntryWorkspaceTarget(target);
        setGlobalError(null);
      } finally {
        setIsEntryBindingPending(false);
      }
    },
    [hostRuntimeAdapter, setMentionItems, setProjectFiles, updateMentionSearchFilter],
  );
  const clearEntryAuthoringTarget = useCallback(async () => {
    try {
      await configureEntryAuthoringTarget(undefined);
    } catch (error) {
      setGlobalError(describeError(error));
    }
  }, [configureEntryAuthoringTarget]);
  const handleEntryChooseDirectory = useCallback(async () => {
    if (composerWorkspace?.kind !== 'entry') {
      throw new Error('Agent Entry directory selection requires the Entry workspace provider.');
    }
    try {
      const target = await composerWorkspace.onChooseDirectory();
      if (target) await configureEntryAuthoringTarget(target);
    } catch (error) {
      setGlobalError(describeError(error));
    }
  }, [composerWorkspace, configureEntryAuthoringTarget]);

  const loadEntryCharacterTargets = useCallback(async () => {
    setEntryCharacterTargetsStatus('loading');
    try {
      const targets =
        await requireAgentDraftHostRuntimeAdapter(
          hostRuntimeAdapter,
        ).loadCharacterDialogueTargets();
      setEntryCharacterTargets(targets);
      setEntryCharacterTargetsStatus('ready');
      return targets;
    } catch (error) {
      setEntryCharacterTargets([]);
      setEntryCharacterTargetsStatus('unavailable');
      throw error;
    }
  }, [hostRuntimeAdapter]);
  useEffect(() => {
    if (
      entryMode !== 'character-dialogue' ||
      !entryQuickDetailOpen ||
      entryCharacterTargetsStatus !== 'idle'
    ) {
      return;
    }
    void loadEntryCharacterTargets()
      .then((targets) => {
        if (targets.length === 0) setEntryQuickDetailOpen(false);
      })
      .catch(() => setEntryQuickDetailOpen(false));
  }, [entryCharacterTargetsStatus, entryMode, entryQuickDetailOpen, loadEntryCharacterTargets]);
  const hydrateConversationSettings = useCallback(
    (conversationId: string, snapshot: ConversationSettingsSnapshot) => {
      settingsSnapshotByConversationRef.current.set(conversationId, snapshot);
      for (const runtime of tabRenderRuntimeRegistry.getByConversation(conversationId)) {
        applyConversationSettingsSnapshot(runtime.store, snapshot);
      }
    },
    [tabRenderRuntimeRegistry],
  );

  const [agentInputCatalogByConversation, setAgentInputCatalogByConversation] = useState<
    Map<string, AgentInputCatalogMessage>
  >(() => new Map());
  const [activationProgressByConversation, setActivationProgressByConversation] = useState<
    Map<string, readonly ActivationProgressTimeline[]>
  >(() => new Map());

  // ---- Agent state ----
  const [, setAgentState] = useState<AgentState | null>(null);
  const conversationAgentStateRef = useRef<Map<string, AgentState>>(new Map());
  const forceAgentStateUpdate = useCallback(() => setRenderSignal((current) => !current), []);
  const isTablessConversationViewRef = useRef(false);
  const pendingForegroundConversationActivationRef =
    useRef<PendingForegroundConversationActivation | null>(null);
  const restoredConversationIdsRef = useRef(new Set<string>());
  const navigationRuntimeOwnerRef = useRef(hostRuntimeAdapter.runtimeId);
  if (navigationRuntimeOwnerRef.current !== hostRuntimeAdapter.runtimeId) {
    navigationRuntimeOwnerRef.current = hostRuntimeAdapter.runtimeId;
    restoredConversationIdsRef.current.clear();
  }
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
  const [initialInputRequest, setInitialInputRequest] = useState<{
    id: number;
    messageText: string;
  } | null>(null);
  const [initialSessionModeRequest, setInitialSessionModeRequest] = useState<{
    id: number;
    mode: SessionMode;
  } | null>(null);
  const [entryPromptMenu, setEntryPromptMenu] = useState<EntryPromptMenu | null>(null);
  const nextQueuedEditRequestIdRef = useRef(0);

  useEffect(() => {
    if (agentPresentation?.phase !== 'draft') return;
    if (activeDraftIdRef.current === agentPresentation.draftId) return;
    activeDraftIdRef.current = agentPresentation.draftId;
    committedEntryDraftIdRef.current = undefined;
    skipEntryDraftWriteRef.current = agentPresentation.draftId;
    const restored = readAgentEntryDraftSnapshot(hostRuntimeAdapter, agentPresentation.draftId);
    const entryDraft = restored.snapshot;

    setOpenTabs([]);
    setActiveTabId(null);
    setActiveConversationId(null);
    clearVisibleState();
    setActiveTab('chat');
    const draftAdapter = requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter);
    const launchCatalog = draftAdapter.readLaunchCatalog();
    const authoritativeEntryIntent = draftAdapter.readEntryIntent();
    setEntryMode(authoritativeEntryIntent.mode);
    setEntryQuickDetailOpen(true);
    setEntryIntent(authoritativeEntryIntent);
    setEntryWorkspaceTarget(
      authoritativeEntryIntent.mode === 'authoring' ? entryDraft?.workspaceTarget : undefined,
    );
    setIsEntryBindingPending(false);
    updateEntryInputValue(entryDraft?.inputValue ?? '');
    setEntryContextReferences(entryDraft ? [...entryDraft.contextReferences] : []);
    setEntryCharacterLaunches(
      authoritativeEntryIntent.mode === 'character-dialogue' && entryDraft
        ? [...entryDraft.characterLaunches]
        : [],
    );
    setEntryMediaModelSelection(
      entryDraft?.mediaModelSelection
        ? { ...entryDraft.mediaModelSelection }
        : { image: 'none', video: 'none', audio: 'none' },
    );
    const launchConfiguration = launchCatalog.configuration;
    setEntrySelectedModel(
      launchConfiguration.fields.model.effectiveValue?.modelCatalogEntryId ?? '',
    );
    setEntryExecutionMode(
      launchConfiguration.fields.executionMode.effectiveValue ?? settings.executionMode,
    );
    setGlobalError(restored.diagnostics[0]?.message ?? null);
    setPendingSendRequest(null);
    setInitialInputRequest(null);
    setInitialSessionModeRequest(null);
    setEntryPromptMenu(null);
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
    setForegroundAvailabilityByConversation(new Map());
    isTablessConversationViewRef.current = true;
  }, [
    agentPresentation,
    clearVisibleState,
    setActiveConversationId,
    setActiveTabId,
    setOpenTabs,
    updateEntryInputValue,
    hostRuntimeAdapter,
    settings.executionMode,
  ]);

  useEffect(() => {
    if (agentPresentation?.phase !== 'draft') return;
    if (activeDraftIdRef.current !== agentPresentation.draftId) return;
    if (committedEntryDraftIdRef.current === agentPresentation.draftId) return;
    if (skipEntryDraftWriteRef.current === agentPresentation.draftId) {
      skipEntryDraftWriteRef.current = undefined;
      return;
    }
    writeAgentEntryDraftSnapshot(hostRuntimeAdapter, {
      draftId: agentPresentation.draftId,
      inputValue: entryInputValue,
      contextReferences: entryContextReferences,
      characterLaunches: entryCharacterLaunches,
      ...(entryWorkspaceTarget === undefined ? {} : { workspaceTarget: entryWorkspaceTarget }),
      selectedModel: entrySelectedModel,
      mediaModelSelection: entryMediaModelSelection,
      executionMode: entryExecutionMode,
      entryMode,
    });
  }, [
    agentPresentation,
    entryContextReferences,
    entryCharacterLaunches,
    entryExecutionMode,
    entryMode,
    entryInputValue,
    entryMediaModelSelection,
    entrySelectedModel,
    entryWorkspaceTarget,
    hostRuntimeAdapter,
  ]);

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

    const messagesByConversation = new Map<string, readonly Message[]>();
    const streamingByConversation = new Map<string, ConversationStreamingSnapshot>();
    for (const conversationId of conversationIds) {
      const snapshot = conversationRenderCoordinator.read(conversationId);
      if (!snapshot) continue;
      messagesByConversation.set(conversationId, snapshot.messages);
      streamingByConversation.set(conversationId, snapshot.streaming);
    }
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
    conversationRenderCoordinator,
    openTabs,
    renderSignal,
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
  const draftLaunchCatalog = isDraftPresentation
    ? requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter).readLaunchCatalog()
    : undefined;
  const draftSkills = projectDraftSkillSummaries(draftLaunchCatalog);
  const homeExperienceProjection =
    draftLaunchCatalog && composerWorkspace?.kind === 'entry'
      ? projectHomeExperienceEntry({
          mode: entryMode,
          intent: entryIntent,
          draft: draftLaunchCatalog.interaction,
          ...(entryWorkspaceTarget === undefined ? {} : { workspaceTarget: entryWorkspaceTarget }),
          workspaceChooserAvailable: !composerWorkspace.disabled,
          characterTargetsAvailable:
            entryCharacterTargetsStatus === 'ready' && entryCharacterTargets.length > 0,
          characterLaunches: entryCharacterLaunches,
          bindingPending: isEntryBindingPending || isForegroundConversationActivationPending,
          configurationReady:
            hasConfigSnapshot &&
            draftLaunchCatalog.configuration.request !== undefined &&
            draftLaunchCatalog.configuration.fields.model.policy.status !== 'unavailable',
        })
      : undefined;
  const draftSubmissionBlockedReason = homeExperienceProjection?.submissionBlockedReasonKey
    ? t(homeExperienceProjection.submissionBlockedReasonKey)
    : draftLaunchCatalog &&
        (!hasConfigSnapshot ||
          draftLaunchCatalog.configuration.request === undefined ||
          draftLaunchCatalog.configuration.fields.model.policy.status === 'unavailable')
      ? t('chat.input.configurationRequired')
      : undefined;

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
    const availableModelIds = new Set(
      (draftLaunchCatalog?.models ?? [])
        .filter((option) => option.availability.status === 'available')
        .map((option) => option.id),
    );
    const configuredModelId =
      draftLaunchCatalog?.configuration.fields.model.effectiveValue?.modelCatalogEntryId ?? '';
    setEntrySelectedModel((current) =>
      availableModelIds.has(current)
        ? current
        : availableModelIds.has(configuredModelId)
          ? configuredModelId
          : '',
    );
    setEntryMediaModelSelection((current) => {
      const availableMediaModels = new Map(
        entryModelState.availableMediaModels.map((model) => [model.id, model.category]),
      );
      const selection: MediaModelSelection = {
        image: availableMediaModels.get(current.image) === 'image' ? current.image : 'none',
        video: availableMediaModels.get(current.video) === 'video' ? current.video : 'none',
        audio: availableMediaModels.get(current.audio) === 'audio' ? current.audio : 'none',
      };
      const projected = projectMediaModelSelectionDefaults({
        selection,
        defaults: activeSettings.defaultMediaModels ?? {},
      }).selection;
      return projected.image === current.image &&
        projected.video === current.video &&
        projected.audio === current.audio
        ? current
        : projected;
    });
  }, [
    draftLaunchCatalog,
    activeSettings.defaultMediaModels,
    activeSettings.selectedModelId,
    activeSettings.selectedProviderId,
    entryModelState.availableMediaModels,
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

      agentHostMessages.updateSettings(
        {
          providerId: selectedProviderId,
          modelId: selectedModelId,
        },
        conversationId,
      );
    },
    [activeSettings.chatModelOptions, agentHostMessages],
  );
  const handleEntryModelSelect = useCallback(
    (modelId: string) => {
      const adapter = requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter);
      const catalog = adapter.readLaunchCatalog();
      const selected = catalog.models.find(
        (option) => option.id === modelId && option.availability.status === 'available',
      );
      if (!selected) return;
      void adapter
        .updateDraftConfiguration({
          modelCatalogEntryId: selected.id,
          providerId: selected.providerId,
          modelId: selected.modelId,
          executionMode:
            catalog.configuration.fields.executionMode.effectiveValue ?? entryExecutionMode,
          temperature:
            catalog.configuration.fields.temperature.effectiveValue ?? activeSettings.temperature,
          maximumOutputTokens:
            catalog.configuration.fields.maximumOutputTokens.effectiveValue ??
            activeSettings.maxTokens,
          thinkingBudget: catalog.configuration.fields.thinkingBudget.effectiveValue ?? 0,
        })
        .then(() => setEntrySelectedModel(modelId))
        .catch((error: unknown) => setGlobalError(describeError(error)));
    },
    [activeSettings.maxTokens, activeSettings.temperature, entryExecutionMode, hostRuntimeAdapter],
  );
  const handleEntryExecutionModeChange = useCallback(
    (executionMode: SettingsState['executionMode']) => {
      const adapter = requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter);
      const request = adapter.readLaunchCatalog().configuration.request;
      if (!request) {
        setGlobalError('Choose an exact configured Agent model before changing execution mode.');
        return;
      }
      void adapter
        .updateDraftConfiguration({ ...request, executionMode })
        .then(() => setEntryExecutionMode(executionMode))
        .catch((error: unknown) => setGlobalError(describeError(error)));
    },
    [hostRuntimeAdapter],
  );
  const conversationKind = activeOpenTab?.kind ?? 'chat';

  const triggerForceUpdate = useCallback(() => setRenderSignal((current) => !current), []);
  const updateConversationRenderState = useCallback(
    (conversationId: string, updater: ConversationRenderStateUpdater) => {
      commitConversationRenderState(conversationId, updater);
      triggerForceUpdate();
    },
    [commitConversationRenderState, triggerForceUpdate],
  );
  const requestConfigSnapshot = useCallback(() => {
    agentHostMessages.refreshConfigSnapshot();
  }, [agentHostMessages]);
  const requestConversationResourceSnapshot = useCallback(
    (conversationId: string) => {
      agentHostMessages.getSettings(conversationId);
      agentHostMessages.getContextTokenCount(conversationId);
      agentHostMessages.getMessageQueue(conversationId);
    },
    [agentHostMessages],
  );

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
    agentHostMessages,
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
    setAgentInputCatalogByConversation,
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

  const markInitialNavigationHydrated = useCallback(
    (type: 'conversationList' | 'tabState') => {
      setInitialNavigationHydration((current) => ({
        runtimeId: hostRuntimeAdapter.runtimeId,
        conversationList:
          type === 'conversationList' ||
          (current.runtimeId === hostRuntimeAdapter.runtimeId && current.conversationList),
        tabState:
          type === 'tabState' ||
          (current.runtimeId === hostRuntimeAdapter.runtimeId && current.tabState),
      }));
    },
    [hostRuntimeAdapter.runtimeId],
  );

  useEffect(() => {
    restoredConversationIdsRef.current.clear();
    setInitialNavigationHydration({
      runtimeId: hostRuntimeAdapter.runtimeId,
      conversationList: false,
      tabState: false,
    });
  }, [hostRuntimeAdapter.runtimeId]);

  useEffect(() => {
    const handleControllerMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | undefined)?.type;
      if (type === 'externalMessage' || type === 'prefillInput' || type === 'ambientCanvasUpdate') {
        return;
      }
      if (type === 'conversationList' || type === 'tabState') {
        markInitialNavigationHydrated(type);
      }
      controllerMessageHandlerRef.current(event);
    };

    window.addEventListener('message', handleControllerMessage);
    return () => window.removeEventListener('message', handleControllerMessage);
  }, [markInitialNavigationHydrated]);

  useEffect(() => {
    const subscription = hostRuntimeAdapter.subscribe((message) => {
      if (message.type === 'conversationList' || message.type === 'tabState') {
        markInitialNavigationHydrated(message.type);
      }
      controllerMessageHandlerRef.current({
        data: message,
      } as MessageEvent<AgentHostToWebviewMessage>);
    });
    return () => subscription.dispose();
  }, [hostRuntimeAdapter, markInitialNavigationHydrated]);

  // ---- Request data on mount ----
  useEffect(() => {
    isTablessConversationViewRef.current = true;
    if (!isDraftPresentation) {
      agentHostMessages.getConversations();
      agentHostMessages.getActiveConversation();
      // Desktop keeps same-process tab state across Webview reloads. Request it
      // explicitly because Developer: Reload Webviews does not trigger a visibility change.
      agentHostMessages.getTabState();
    }
    requestConfigSnapshot();
    agentHostMessages.getAgentStates();
  }, [agentHostMessages, isDraftPresentation, requestConfigSnapshot]);

  // ---- Context token count on conversation change ----
  useEffect(() => {
    if (visibleConversationId && !isCharacterRoleConversationKind(conversationKind)) {
      requestConversationResourceSnapshot(visibleConversationId);
      agentHostMessages.getAgentInputCatalog(visibleConversationId);
    }
  }, [
    agentHostMessages,
    conversationKind,
    requestConversationResourceSnapshot,
    visibleConversationId,
  ]);

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
    agentHostMessages.newConversation();
    setActiveTab('chat');
  }, [agentHostMessages, beginForegroundConversationActivation, requestConfigSnapshot]);

  const handleNewChat = useCallback(() => {
    if (isCharacterRoleConversationKind(conversationKind)) {
      setGlobalError('Character and Room new conversations are not available in this Scene.');
      return;
    }
    setPendingSendRequest(null);
    setInitialInputRequest(null);
    setInitialSessionModeRequest(null);
    setEntryPromptMenu(null);
    startNewForegroundConversation();
  }, [conversationKind, startNewForegroundConversation]);

  const handleEntryModeChange = useCallback(
    (mode: AgentEntryMode) => {
      if (mode === entryMode || isEntryBindingPending) return;
      if (agentPresentation?.phase !== 'draft' || composerWorkspace?.kind !== 'entry') {
        throw new Error('Agent Entry mode requires an exact Draft presentation.');
      }
      const nextTarget = mode === 'authoring' ? entryWorkspaceTarget : undefined;
      setIsEntryBindingPending(true);
      void requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter)
        .configureEntryTarget(
          mode,
          nextTarget?.target
            ? {
                kind: 'authoring',
                workspaceId: nextTarget.context.workspaceId,
                workspaceGrantId: nextTarget.context.workspaceGrantId,
                target: nextTarget.target,
              }
            : undefined,
        )
        .then((intent) => {
          setEntryQuickDetailOpen(true);
          setEntryMode(mode);
          setEntryIntent(intent);
          if (mode !== 'authoring') setEntryWorkspaceTarget(undefined);
          setEntrySessionMode('agent');
          setEntryContextReferences([]);
          setEntryCharacterLaunches([]);
          if (mode !== 'character-dialogue') {
            setEntryCharacterTargets([]);
            setEntryCharacterTargetsStatus('idle');
          }
          setProjectFiles([]);
          setMentionItems([]);
          updateMentionSearchFilter('');
          setEntryPromptMenu(null);
          setGlobalError(null);
        })
        .catch((error: unknown) => setGlobalError(describeError(error)))
        .finally(() => setIsEntryBindingPending(false));
    },
    [
      agentPresentation,
      composerWorkspace,
      entryMode,
      entryWorkspaceTarget,
      hostRuntimeAdapter,
      isEntryBindingPending,
      setMentionItems,
      setProjectFiles,
      updateMentionSearchFilter,
    ],
  );

  const handleEntryQuickDetailOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (isEntryBindingPending) return;
      setEntryQuickDetailOpen(nextOpen);
    },
    [isEntryBindingPending],
  );

  const handleSendWithoutConversation = useCallback(
    (input: PendingSendInput) => {
      setInitialInputRequest(null);
      setInitialSessionModeRequest(null);
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

      if (isDraftPresentation) {
        const draftHostRuntimeAdapter = requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter);
        if (!agentPresentation) throw new Error('Agent Draft presentation is unavailable.');
        const launchCatalog = draftHostRuntimeAdapter.readLaunchCatalog();
        const authoritativeDraft = launchCatalog.interaction;
        if (composerWorkspace?.kind === 'entry') {
          const validation = projectHomeExperienceEntry({
            mode: entryMode,
            intent: entryIntent,
            draft: authoritativeDraft,
            ...(entryWorkspaceTarget === undefined
              ? {}
              : { workspaceTarget: entryWorkspaceTarget }),
            workspaceChooserAvailable: !composerWorkspace.disabled,
            characterTargetsAvailable:
              entryCharacterTargetsStatus === 'ready' && entryCharacterTargets.length > 0,
            characterLaunches: entryCharacterLaunches,
            bindingPending: isEntryBindingPending,
            configurationReady:
              hasConfigSnapshot &&
              launchCatalog.configuration.request !== undefined &&
              launchCatalog.configuration.fields.model.policy.status !== 'unavailable',
          });
          if (validation.submissionBlockedReasonKey) {
            setGlobalError(t(validation.submissionBlockedReasonKey));
            return;
          }
        }
        const configuration = launchCatalog.configuration.request;
        if (
          !configuration ||
          launchCatalog.configuration.fields.model.policy.status === 'unavailable'
        ) {
          setGlobalError(t('chat.input.configurationRequired'));
          return;
        }
        let references: readonly AgentInputReferenceReceipt[];
        let inputIntent: import('@neko/agent-contracts').AgentDraftInputIntent;
        try {
          references = contextPayloads.map(projectDraftReferenceReceipt);
          inputIntent = projectDraftInputIntent({
            messageText,
            trigger: parseAgentInputTrigger(messageText),
            catalog: launchCatalog.inputs,
            bindingKind: authoritativeDraft.binding.kind,
          });
        } catch (error) {
          setGlobalError(describeError(error));
          return;
        }
        const resourceGrantIds = contextPayloads.flatMap((payload) => {
          const data = readRecord(payload.data);
          return typeof data?.['resourceGrantId'] === 'string' ? [data['resourceGrantId']] : [];
        });
        const submittedReferenceIds = new Set(contextPayloads.map((payload) => payload.id));
        const purposeModels = projectMessageModelSelection({
          selectedModel: entrySelectedModel,
          chatModelOptions: activeSettings.chatModelOptions,
          sessionMode: 'agent',
          agentMediaModels: entryModelState.agentMediaModels,
        }).purposeModels;
        setIsForegroundConversationActivationPending(true);
        void draftHostRuntimeAdapter
          .submitDraft({
            draft: authoritativeDraft,
            entryTargetReceipt: entryIntent.targetReceipt,
            input: inputIntent,
            references,
            resourceGrantIds,
            configuration,
            ...(purposeModels && Object.keys(purposeModels).length > 0 ? { purposeModels } : {}),
          })
          .then((projection) => {
            committedEntryDraftIdRef.current = agentPresentation.draftId;
            writeAgentEntryDraftSnapshot(hostRuntimeAdapter, undefined);
            setEntryInputValue((current) => (current === entryInputValue ? '' : current));
            setEntryContextReferences((current) =>
              current.filter((reference) => !submittedReferenceIds.has(reference.id)),
            );
            setEntryCharacterLaunches([]);
            if (projection.turnStatus === 'failed' && projection.diagnostic) {
              setGlobalError(projection.diagnostic);
            }
          })
          .catch((error: unknown) => setGlobalError(describeError(error)))
          .finally(() => setIsForegroundConversationActivationPending(false));
        return;
      }

      setInitialInputRequest(null);
      setInitialSessionModeRequest(null);
      handleSendWithoutConversation({
        ...input,
        messageText,
        displayMessageText: input?.displayMessageText ?? messageText,
        sessionMode: input?.sessionMode ?? entrySessionMode,
        ...(contextPayloads.length > 0 ? { contextPayloads: [...contextPayloads] } : {}),
      });
      updateEntryInputValue('');
      setEntryContextReferences([]);
    },
    [
      agentPresentation,
      activeSettings.chatModelOptions,
      composerWorkspace,
      entryContextReferences,
      entryIntent,
      entryMode,
      entryInputValue,
      entryModelState.agentMediaModels,
      entrySelectedModel,
      entrySessionMode,
      entryWorkspaceTarget,
      handleSendWithoutConversation,
      hasConfigSnapshot,
      entryCharacterLaunches,
      entryCharacterTargets,
      entryCharacterTargetsStatus,
      hostRuntimeAdapter,
      isEntryBindingPending,
      isDraftPresentation,
      t,
      updateEntryInputValue,
    ],
  );

  const handlePendingSendRequestConsumed = useCallback((id: number) => {
    setPendingSendRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleInitialInputRequestConsumed = useCallback((id: number) => {
    setInitialInputRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleInitialSessionModeRequestConsumed = useCallback((id: number) => {
    setInitialSessionModeRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleEntrySessionModeChange = useCallback(
    (mode: SessionMode) => {
      setEntrySessionMode(mode);
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
    setInitialInputRequest(null);
    setInitialSessionModeRequest(null);
    setEntryPromptMenu(null);
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
    isTablessConversationViewRef.current = false;
  }, []);

  const handleBeforeConversationActivation = useCallback(
    (request: { conversationId: string; activationId: number }) => {
      const { conversationId } = request;
      setPendingSendRequest(null);
      setInitialInputRequest(null);
      setInitialSessionModeRequest(null);
      setEntryPromptMenu(null);
      pendingForegroundConversationActivationRef.current = {
        reason: 'switch-conversation',
        conversationId,
        activationId: request.activationId,
      };
      setIsForegroundConversationActivationPending(true);
      isTablessConversationViewRef.current = false;
      const hasRetainedProjection =
        conversationRenderCoordinator.read(conversationId) !== undefined;
      setForegroundAvailabilityByConversation((previous) => {
        const next = new Map(previous);
        next.set(conversationId, hasRetainedProjection ? { kind: 'ready' } : { kind: 'loading' });
        return next;
      });
    },
    [conversationRenderCoordinator],
  );

  const handleAllTabsClosed = useCallback(() => {
    setPendingSendRequest(null);
    setInitialInputRequest(null);
    setInitialSessionModeRequest(null);
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
      const cachedStreaming = conversationRenderCoordinator.read(conversationId)?.streaming;
      const cachedAgentState = conversationAgentStateRef.current.get(conversationId);
      return Boolean(
        openTabs.some((tab) => tab.conversationId === conversationId) ||
        activeConversationId === conversationId ||
        cachedStreaming?.isThinking ||
        cachedStreaming?.streamingMessageId ||
        (cachedAgentState && cachedAgentState.phase !== 'idle'),
      );
    },
    [activeConversationId, conversationRenderCoordinator, conversationAgentStateRef, openTabs],
  );

  const cleanupClosedConversation = useCallback(
    (conversationId: string) => {
      disposeConversationRendering(conversationId, 'conversation-delete');
      cleanupConversation(conversationId);
      conversationAgentStateRef.current.delete(conversationId);
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
    },
    [
      cleanupConversation,
      disposeConversationRendering,
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
      agentHostMessages.deleteConversation(conversationId);
    },
    [agentHostMessages, cleanupClosedConversation, isProtectedConversation],
  );

  const handleClearClosedConversations = useCallback(() => {
    const streamingByConversation = projectStreamingSnapshots(
      conversationRenderCoordinator,
      conversations.map((conversation) => conversation.id),
    );
    const historyItems = projectHistoryConversationItems({
      conversations,
      openTabs,
      activeConversationId,
      activeStreaming: {
        streamingMessageId,
        isThinking,
        queuedMessageCount,
      },
      streamingByConversation,
      agentStateByConversation: conversationAgentStateRef.current,
    });
    const cleanup = projectHistoryCleanup({ historyItems });
    for (const conversationId of cleanup.deletableConversationIds) {
      cleanupClosedConversation(conversationId);
      agentHostMessages.deleteConversation(conversationId);
    }
  }, [
    activeConversationId,
    conversations,
    openTabs,
    streamingMessageId,
    isThinking,
    queuedMessageCount,
    conversationRenderCoordinator,
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
    hasLocalConversationActivity: (conversationId) => {
      const cached = conversationRenderCoordinator.read(conversationId);
      const cachedAgentState = conversationAgentStateRef.current.get(conversationId);
      return Boolean(
        (cached?.messages.length ?? 0) > 0 ||
        cached?.streaming.isThinking ||
        cached?.streaming.streamingMessageId ||
        (cachedAgentState && cachedAgentState.phase !== 'idle'),
      );
    },
  });
  const activatedInitialConversationRef = useRef<string>();
  useEffect(() => {
    if (
      !initialConversation ||
      initialNavigationHydration.runtimeId !== hostRuntimeAdapter.runtimeId ||
      !initialNavigationHydration.conversationList ||
      !initialNavigationHydration.tabState
    ) {
      return;
    }
    const navigationKey = `${hostRuntimeAdapter.runtimeId}\u0000${initialConversation.id}\u0000${initialConversation.title}`;
    if (activatedInitialConversationRef.current === navigationKey) return;
    activatedInitialConversationRef.current = navigationKey;
    const conversation = conversations.find((candidate) => candidate.id === initialConversation.id);
    if (!conversation) {
      setGlobalError(t('chat.conversation.navigationTargetUnavailable'));
      return;
    }
    handleOpenTab(conversation.id, initialConversation.title || conversation.title);
  }, [
    conversations,
    handleOpenTab,
    hostRuntimeAdapter.runtimeId,
    initialConversation,
    initialNavigationHydration.conversationList,
    initialNavigationHydration.tabState,
    t,
  ]);

  const tabConversationIds = useMemo(
    () => [...new Set(openTabs.map((tab) => tab.conversationId))],
    [openTabs],
  );
  const subscribeTabRenderSnapshots = useCallback(
    (listener: () => void) => {
      const unsubscribe = tabConversationIds.map((conversationId) =>
        conversationRenderCoordinator.subscribe(conversationId, listener),
      );
      return () => {
        for (const dispose of unsubscribe) dispose();
      };
    },
    [conversationRenderCoordinator, tabConversationIds],
  );
  const readTabRenderSnapshots = useCallback(
    () => conversationRenderCoordinator.readMany(tabConversationIds),
    [conversationRenderCoordinator, tabConversationIds],
  );
  const subscribedTabRenderSnapshots = useSyncExternalStore(
    subscribeTabRenderSnapshots,
    readTabRenderSnapshots,
    readTabRenderSnapshots,
  );
  const tabRenderSnapshots = useMemo(
    () =>
      new Map(
        subscribedTabRenderSnapshots.map(
          (snapshot) => [snapshot.conversationId, snapshot] as const,
        ),
      ),
    [subscribedTabRenderSnapshots],
  );
  const historyStreamingByConversation = useMemo(
    () =>
      projectStreamingSnapshots(
        conversationRenderCoordinator,
        conversations.map((conversation) => conversation.id),
      ),
    [conversationRenderCoordinator, conversations, renderSignal],
  );

  const displayTabs = useMemo(
    () =>
      projectDisplayTabs({
        openTabs,
        conversations,
        renderSnapshotsByConversation: tabRenderSnapshots,
        agentStateByConversation: conversationAgentStateRef.current,
      }),
    [
      openTabs,
      conversations,
      visibleConversationId,
      visibleSessionState,
      renderSignal,
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
        streamingByConversation: historyStreamingByConversation,
        agentStateByConversation: conversationAgentStateRef.current,
      }),
    [
      conversations,
      historyStreamingByConversation,
      openTabs,
      visibleConversationId,
      visibleSessionState,
    ],
  );
  const historyCleanup = useMemo(
    () => projectHistoryCleanup({ historyItems: historyConversations }),
    [historyConversations],
  );

  return (
    <>
      {!isDraftPresentation
        ? renderHeader({
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
          })
        : null}

      {activeTab === 'chat' ? (
        openTabs.length === 0 ? (
          <div
            className={`flex min-h-0 flex-1 flex-col ${
              isDraftPresentation ? 'agent-entry-composition' : ''
            }`}
          >
            {homeExperienceProjection ? (
              <HomeExperienceModeSelector
                projection={homeExperienceProjection}
                selectionPending={isEntryBindingPending}
                onChange={handleEntryModeChange}
              />
            ) : null}
            <div className="agent-entry-center-group">
              <EmptyState
                presentation={emptyStatePresentation}
                draftScope={
                  agentPresentation?.phase === 'draft' ? agentPresentation.binding.kind : undefined
                }
                experienceProjection={homeExperienceProjection}
              />
              <InputAreaProvider
                isBusy={!hasConfigSnapshot && !isDraftPresentation}
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
                executionMode={entryExecutionMode}
                onExecutionModeChange={handleEntryExecutionModeChange}
                maxContextTokens={entryModelState.selectedEffectiveInputBudget}
                outputTokenCap={entryModelState.selectedOutputTokenCap}
                modelMaxOutputTokens={entryModelState.selectedMaxOutputTokens}
                mediaModelCallCount={0}
                inputCatalog={draftLaunchCatalog?.inputs}
                configurationPolicy={draftLaunchCatalog?.configuration}
                inputCatalogPhase={draftLaunchCatalog?.interaction.phase}
                inputCatalogBindingKind={draftLaunchCatalog?.interaction.binding.kind}
                mentionItems={mentionItems}
                onRequestFiles={(filter) => {
                  updateMentionSearchFilter(filter);
                  if (draftLaunchCatalog?.interaction.binding.kind !== 'workspace') return;
                  agentHostMessages.searchProjectFiles(filter, undefined, { purpose: 'entry' });
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
                  presentation={isDraftPresentation ? 'entry' : 'conversation'}
                  inputValue={entryInputValue}
                  isThinking={false}
                  onInputChange={updateEntryInputValue}
                  onSend={handleEntryInputSend}
                  submissionBlocked={draftSubmissionBlockedReason !== undefined}
                  onAuthorizeResource={
                    isDraftPresentation
                      ? async () => {
                          try {
                            return await requireAgentDraftHostRuntimeAdapter(
                              hostRuntimeAdapter,
                            ).authorizeResource('file');
                          } catch (error) {
                            setGlobalError(describeError(error));
                            return undefined;
                          }
                        }
                      : undefined
                  }
                  entryContextAction={
                    entryMode === 'authoring' && composerWorkspace?.kind === 'entry'
                      ? {
                          kind: 'directory',
                          label: t('chat.entryAction.openDirectory'),
                          onInvoke: handleEntryChooseDirectory,
                        }
                      : entryMode === 'character-dialogue'
                        ? {
                            kind: 'character',
                            label: t('chat.entryContext.chooseCharacters'),
                            onInvoke: () => setEntryQuickDetailOpen(true),
                            disabled:
                              entryCharacterTargetsStatus === 'unavailable' ||
                              (entryCharacterTargetsStatus === 'ready' &&
                                entryCharacterTargets.length === 0),
                            disabledReason: t(
                              'chat.entryExperience.validation.characterUnavailable',
                            ),
                          }
                        : entryMode === 'world-experience'
                          ? {
                              kind: 'world',
                              label: t('chat.entryAction.chooseWorld'),
                              disabled: true,
                              disabledReason: t('chat.entryExperience.validation.worldUnavailable'),
                            }
                          : undefined
                  }
                  entryWorkspaceTarget={
                    entryMode === 'authoring' ? entryWorkspaceTarget : undefined
                  }
                  onClearEntryWorkspaceTarget={
                    entryMode === 'authoring' && entryWorkspaceTarget && !isEntryBindingPending
                      ? clearEntryAuthoringTarget
                      : undefined
                  }
                  selectedCharacterLaunches={
                    entryMode === 'character-dialogue' ? entryCharacterLaunches : []
                  }
                  onRemoveCharacterLaunch={(characterVersionId) =>
                    configureEntryCharacterLaunches(
                      entryCharacterLaunches.filter(
                        (selection) => selection.characterVersionId !== characterVersionId,
                      ),
                    )
                  }
                  disabled={
                    !isDraftPresentation &&
                    (isForegroundConversationActivationPending || !hasConfigSnapshot)
                  }
                  entryPromptMenu={entryPromptMenu}
                  onEntryPromptMenuChange={setEntryPromptMenu}
                />
              </InputAreaProvider>
              {homeExperienceProjection ? (
                <HomeExperienceQuickActions
                  mode={entryMode}
                  selectionPending={isEntryBindingPending}
                  disabled={
                    entryMode === 'character-dialogue' &&
                    (entryCharacterTargetsStatus === 'unavailable' ||
                      (entryCharacterTargetsStatus === 'ready' &&
                        entryCharacterTargets.length === 0))
                  }
                  detailExpanded={entryQuickDetailOpen}
                  summary={
                    entryMode === 'character-dialogue' && entryCharacterLaunches.length
                      ? t('chat.entryContext.characterSummary', {
                          count: entryCharacterLaunches.length,
                        })
                      : undefined
                  }
                  skills={homeExperienceProjection.showSkillSuggestions ? draftSkills : []}
                  onSkillSelect={(skill) => updateEntryInputValue(`$${skill.name} `)}
                  onExpandedChange={handleEntryQuickDetailOpenChange}
                >
                  {entryMode === 'authoring' && composerWorkspace?.kind === 'entry' ? (
                    <AuthoringTargetSelector
                      presentation={composerWorkspace}
                      selected={entryWorkspaceTarget}
                      pending={isEntryBindingPending}
                      onChange={configureEntryAuthoringTarget}
                    />
                  ) : entryMode === 'character-dialogue' &&
                    entryCharacterTargetsStatus === 'ready' &&
                    entryCharacterTargets.length > 0 ? (
                    <CharacterDialogueTargetSelector
                      targets={entryCharacterTargets}
                      selected={entryCharacterLaunches}
                      loading={false}
                      pending={isEntryBindingPending}
                      onChange={configureEntryCharacterLaunches}
                    />
                  ) : null}
                </HomeExperienceQuickActions>
              ) : null}
            </div>
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
            conversationFeed={
              conversationFeed?.conversationId === tab.conversationId
                ? conversationFeed.content
                : undefined
            }
            composerPresentation={emptyStatePresentation === 'desktop-dock' ? 'compact' : 'default'}
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
            inputCatalog={agentInputCatalogByConversation.get(tab.conversationId)}
            onInputDiagnostic={setGlobalError}
            workItems={[...sessionState.workItems]}
            pluginsAvailable={pluginsAvailable}
            setActiveTab={setActiveTab}
            conversationCompressingRef={conversationCompressingRef}
            contextTokenCount={sessionState.context.tokenCount}
            isCompressing={sessionState.context.isCompressing}
            mediaModelCallCount={conversationMediaCallCountRef.current.get(tab.conversationId) ?? 0}
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
            initialSessionModeRequest={visible ? initialSessionModeRequest : null}
            onInitialSessionModeRequestConsumed={handleInitialSessionModeRequestConsumed}
            queuedEditDraftConflictMessage={t('chat.input.queueEditDraftConflict')}
          />
        );
      })}

      {globalError ? (
        <AgentDiagnosticToast title="全局错误">{globalError}</AgentDiagnosticToast>
      ) : null}
    </>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function projectDraftSkillSummaries(
  catalog: AgentLaunchCatalogProjection | undefined,
): readonly SkillSummary[] {
  if (!catalog) return [];
  return catalog.inputs.flatMap((entry): readonly SkillSummary[] => {
    if (
      entry.trigger !== 'skill' ||
      !isAgentInputCatalogEntryExecutable({
        entry,
        phase: catalog.interaction.phase,
        bindingKind: catalog.interaction.binding.kind,
      })
    ) {
      return [];
    }
    const source: SkillSummary['source'] =
      entry.source.kind === 'personal'
        ? 'user'
        : entry.source.kind === 'plugin'
          ? 'community'
          : entry.source.kind === 'builtin'
            ? 'builtin'
            : 'project';
    return [
      {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        ...(entry.icon === undefined ? {} : { icon: entry.icon }),
        tags: [],
        source,
        enabled: true,
      },
    ];
  });
}

function projectDraftInputIntent(input: {
  readonly messageText: string;
  readonly trigger: ParsedAgentInputTrigger | null;
  readonly catalog: readonly AgentInputCatalogEntry[];
  readonly bindingKind: import('@neko/agent-contracts').AgentBindingKind;
}): import('@neko/agent-contracts').AgentDraftInputIntent {
  if (input.trigger?.trigger !== 'command' && input.trigger?.trigger !== 'skill') {
    return { kind: 'message', text: input.messageText };
  }
  return resolveAgentInputInvocationIntent({
    trigger: input.trigger as ParsedAgentInputTrigger & { readonly trigger: 'command' | 'skill' },
    entries: input.catalog,
    phase: 'draft',
    bindingKind: input.bindingKind,
  });
}

function projectDraftReferenceReceipt(payload: AgentContextPayload): AgentInputReferenceReceipt {
  const data = readRecord(payload.data);
  const catalogEntryId = readIdentity(data?.['catalogEntryId']);
  const ownerKind = data?.['ownerKind'];
  const ownerId = readIdentity(data?.['ownerId']);
  if (
    !catalogEntryId ||
    !ownerId ||
    (ownerKind !== 'assistant' &&
      ownerKind !== 'workspace' &&
      ownerKind !== 'character' &&
      ownerKind !== 'world')
  ) {
    throw new Error(`Agent reference '${payload.id}' has no exact catalog owner receipt.`);
  }
  const bindingReceiptId = readIdentity(data?.['bindingReceiptId']);
  return {
    catalogEntryId,
    referenceId: payload.id,
    ownerKind,
    ownerId,
    ...(bindingReceiptId === undefined ? {} : { bindingReceiptId }),
  };
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readIdentity(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function projectStreamingSnapshots(
  coordinator: ConversationRenderCoordinator,
  conversationIds: readonly string[],
): ReadonlyMap<string, ConversationStreamingSnapshot> {
  return new Map(
    conversationIds.flatMap((conversationId) => {
      const snapshot = coordinator.read(conversationId);
      return snapshot ? [[conversationId, snapshot.streaming] as const] : [];
    }),
  );
}
