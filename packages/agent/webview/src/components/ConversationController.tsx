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
  type AgentComposerInputCatalogMessage,
  type AgentInputCatalogMessage,
  SettingsState,
  AgentState,
  type AgentSessionDiagnosticMessage,
  type AgentInteractionProjection,
  type AgentInputCatalogEntry,
  type AgentInputReferenceReceipt,
  type AgentCharacterDialogueTargetOption,
  type ParsedAgentInputTrigger,
  parseAgentInputTrigger,
  Message,
  OpenTab,
  SessionMode,
  TabType,
  requireAgentDraftHostRuntimeAdapter,
  parseCharacterDialogueHandoffIntent,
  type CharacterDialogueHandoffIntent,
} from '@neko/agent-contracts';
import type {
  EntryPromptMenu,
  MentionItem,
  SelectedCharacterLaunch,
  SelectedWorldLaunch,
  PluginSlashCommandDef,
  GenCategory,
  GenerationParams,
  CharacterConversationMode,
} from './ChatView/InputArea/types';
import { EmptyState } from './ChatView/EmptyState';
import { HomeExperienceModeSelector } from './ChatView/HomeExperienceModeSelector';
import { HomeExperienceQuickActions } from './ChatView/HomeExperienceQuickActions';
import { CharacterDialogueTargetSelector } from './ChatView/CharacterDialogueTargetSelector';
import { WorldExperienceTargetSelector } from './ChatView/WorldExperienceTargetSelector';
import { AuthoringTargetSelector } from './ChatView/AuthoringTargetSelector';
import { InputArea } from './ChatView/InputArea';
import { projectWorkspaceCanvasTurnTarget } from './ChatWorkspace';
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
  characterDialogueHandoff?: CharacterDialogueHandoffIntent;
  onCharacterDialogueHandoffConsumed?: (intentId: string) => void;
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
  characterDialogueHandoff,
  onCharacterDialogueHandoffConsumed,
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
  const translateRef = useRef(t);
  translateRef.current = t;
  const hostRuntimeAdapter = useAgentHostRuntimeAdapter();
  const agentHostMessages = useAgentHostMessages();
  const composerWorkspace = useComposerWorkspacePresentation();
  const isDraftPresentation = agentPresentation?.phase === 'draft';
  const isEntryDraftPresentation = isDraftPresentation;
  const isOwnerBoundComposer = agentPresentation?.phase === 'composer';
  const isWorkspaceInitialPresentation =
    isOwnerBoundComposer &&
    agentPresentation.binding.kind === 'workspace' &&
    composerWorkspace?.kind === 'workspace';
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
  const [entryCharacterConversationMode, setEntryCharacterConversationMode] =
    useState<CharacterConversationMode>('companion');
  const [entryCharacterTargets, setEntryCharacterTargets] = useState<
    readonly AgentCharacterDialogueTargetOption[]
  >([]);
  const [entryCharacterTargetsStatus, setEntryCharacterTargetsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle');
  const [entryWorldTargets, setEntryWorldTargets] = useState<
    readonly import('@neko/agent-contracts').AgentWorldExperienceTargetOption[]
  >([]);
  const [entryWorldTargetsStatus, setEntryWorldTargetsStatus] = useState<
    'idle' | 'loading' | 'ready' | 'unavailable'
  >('idle');
  const [entryWorldLaunch, setEntryWorldLaunch] = useState<SelectedWorldLaunch>();
  const [entryMode, setEntryMode] = useState<AgentEntryMode>('assistant');
  const [entryIntent, setEntryIntent] = useState<AgentEntryIntentProjection>({
    mode: 'assistant',
    targetReceipt: null,
  });
  const [entryWorkspaceTarget, setEntryWorkspaceTarget] = useState<AgentComposerWorkspaceTarget>();
  const [workspaceCanvasSelectionId, setWorkspaceCanvasSelectionId] =
    useState<string>('workspace-board');
  const [workspaceCanvasCatalog, setWorkspaceCanvasCatalog] = useState<
    import('@neko/canvas-domain').CanvasWorkspaceContextCatalog | undefined
  >();
  const [workspaceCanvasLoading, setWorkspaceCanvasLoading] = useState(false);
  const [workspaceCanvasDiagnostic, setWorkspaceCanvasDiagnostic] = useState<string>();
  const workspaceCanvasRequestSeq = useRef(0);
  const [isEntryBindingPending, setIsEntryBindingPending] = useState(false);
  const [entryQuickDetailOpen, setEntryQuickDetailOpen] = useState(true);
  const [entryConversationContextSelection, setEntryConversationContextSelection] = useState<
    'character' | 'world'
  >();
  const [entrySessionMode, setEntrySessionMode] = useState<SessionMode>('agent');
  const [entryExecutionMode, setEntryExecutionMode] = useState<SettingsState['executionMode']>(
    settings.executionMode,
  );
  const [entryGenCategory, setEntryGenCategory] = useState<GenCategory>('image');
  const [entryGenParams, setEntryGenParams] = useState<GenerationParams>(DEFAULT_GENERATION_PARAMS);
  const activeDraftIdRef = useRef<string>();
  const skipEntryDraftWriteRef = useRef<string>();
  const committedEntryDraftIdRef = useRef<string>();
  const consumedCharacterDialogueHandoffIdsRef = useRef(new Set<string>());
  const pendingCharacterDialogueHandoffIdsRef = useRef(new Set<string>());

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
  const configureEntryConversationTarget = useCallback(
    (
      mode: CharacterConversationMode,
      nextCharacterValue: readonly SelectedCharacterLaunch[],
      nextWorldValue: SelectedWorldLaunch | undefined,
      contextSelection: 'character' | 'world',
    ) => {
      if (isEntryBindingPending) return;
      const nextCharacters: SelectedCharacterLaunch[] = [...nextCharacterValue];
      const targetMode: AgentEntryMode = nextWorldValue
        ? 'world-experience'
        : nextCharacters.length === 0
          ? 'assistant'
          : 'character-dialogue';
      setIsEntryBindingPending(true);
      void requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter)
        .configureEntryTarget(
          targetMode,
          nextWorldValue
            ? {
                kind: 'world-experience',
                globalWorldId: nextWorldValue.globalWorldId,
                worldVersionId: nextWorldValue.worldVersionId,
                participants: nextCharacters.map((selection) => ({
                  globalCharacterId: selection.globalCharacterId,
                  characterVersionId: selection.characterVersionId,
                })),
                launch: { kind: 'new' },
              }
            : nextCharacters.length === 0
              ? undefined
              : {
                  kind: 'character-dialogue',
                  mode,
                  participants: nextCharacters.map((selection) => ({
                    globalCharacterId: selection.globalCharacterId,
                    characterVersionId: selection.characterVersionId,
                  })),
                },
        )
        .then((intent) => {
          setEntryMode(targetMode);
          setEntryIntent(intent);
          setEntryContextReferences([]);
          setEntryCharacterLaunches(nextCharacters);
          setEntryWorldLaunch(nextWorldValue);
          setEntryCharacterConversationMode(mode);
          setEntryConversationContextSelection(contextSelection);
          setEntryQuickDetailOpen(true);
          setGlobalError(null);
        })
        .catch((error: unknown) => setGlobalError(describeError(error)))
        .finally(() => setIsEntryBindingPending(false));
    },
    [hostRuntimeAdapter, isEntryBindingPending],
  );
  const configureEntryCharacterLaunches = useCallback(
    (nextValue: readonly SelectedCharacterLaunch[]) => {
      configureEntryConversationTarget(
        entryCharacterConversationMode,
        nextValue,
        entryWorldLaunch,
        'character',
      );
    },
    [configureEntryConversationTarget, entryCharacterConversationMode, entryWorldLaunch],
  );
  const configureEntryCharacterConversationMode = useCallback(
    (mode: CharacterConversationMode) => {
      if (mode === entryCharacterConversationMode) return;
      configureEntryConversationTarget(mode, entryCharacterLaunches, entryWorldLaunch, 'character');
    },
    [
      configureEntryConversationTarget,
      entryCharacterConversationMode,
      entryCharacterLaunches,
      entryWorldLaunch,
    ],
  );
  const configureEntryWorldLaunch = useCallback(
    (nextValue: SelectedWorldLaunch | undefined) => {
      configureEntryConversationTarget(
        entryCharacterConversationMode,
        entryCharacterLaunches,
        nextValue,
        'world',
      );
    },
    [configureEntryConversationTarget, entryCharacterConversationMode, entryCharacterLaunches],
  );
  const configureEntryAuthoringTarget = useCallback(
    async (target: AgentComposerWorkspaceTarget | undefined) => {
      setEntryContextReferences([]);
      setEntryCharacterLaunches([]);
      setEntryWorldLaunch(undefined);
      setProjectFiles([]);
      setMentionItems([]);
      updateMentionSearchFilter('');
      setIsEntryBindingPending(true);
      try {
        if (target && !target.authority) {
          throw new Error('Project authoring context requires an exact Project authority.');
        }
        const intent = await requireAgentDraftHostRuntimeAdapter(
          hostRuntimeAdapter,
        ).configureEntryTarget(
          entryMode,
          target
            ? {
                kind: 'authoring',
                workspaceId: target.context.workspaceId,
                workspaceGrantId: target.context.workspaceGrantId,
                authority: target.authority,
                target: target.target ?? null,
              }
            : undefined,
        );
        setEntryIntent(intent);
        setEntryWorkspaceTarget(target);
        setGlobalError(null);
        return intent;
      } finally {
        setIsEntryBindingPending(false);
      }
    },
    [entryMode, hostRuntimeAdapter, setMentionItems, setProjectFiles, updateMentionSearchFilter],
  );
  const clearEntryAuthoringTarget = useCallback(async () => {
    try {
      await configureEntryAuthoringTarget(undefined);
    } catch (error) {
      setGlobalError(describeError(error));
    }
  }, [configureEntryAuthoringTarget]);
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
  const loadEntryWorldTargets = useCallback(async () => {
    setEntryWorldTargetsStatus('loading');
    try {
      const adapter = requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter);
      if (!adapter.loadWorldExperienceTargets) {
        throw new Error('World Experience target catalog is unavailable.');
      }
      const targets = await adapter.loadWorldExperienceTargets();
      setEntryWorldTargets(targets);
      setEntryWorldTargetsStatus('ready');
      return targets;
    } catch (error) {
      setEntryWorldTargets([]);
      setEntryWorldTargetsStatus('unavailable');
      throw error;
    }
  }, [hostRuntimeAdapter]);
  useEffect(() => {
    if (
      entryConversationContextSelection !== 'character' ||
      !entryQuickDetailOpen ||
      entryCharacterTargetsStatus !== 'idle'
    ) {
      return;
    }
    void loadEntryCharacterTargets()
      .then((targets) => {
        if (targets.length === 0) {
          setEntryConversationContextSelection(undefined);
          setEntryQuickDetailOpen(false);
        }
      })
      .catch((error: unknown) => {
        setEntryConversationContextSelection(undefined);
        setEntryQuickDetailOpen(false);
        setGlobalError(describeError(error));
      });
  }, [
    entryCharacterTargetsStatus,
    entryConversationContextSelection,
    entryQuickDetailOpen,
    loadEntryCharacterTargets,
  ]);
  useEffect(() => {
    if (
      entryConversationContextSelection !== 'world' ||
      !entryQuickDetailOpen ||
      entryWorldTargetsStatus !== 'idle'
    ) {
      return;
    }
    void loadEntryWorldTargets()
      .then((targets) => {
        if (targets.length === 0) {
          setEntryConversationContextSelection(undefined);
          setEntryQuickDetailOpen(false);
        }
      })
      .catch((error: unknown) => setGlobalError(describeError(error)));
  }, [
    entryConversationContextSelection,
    entryQuickDetailOpen,
    entryWorldTargetsStatus,
    loadEntryWorldTargets,
  ]);
  const handleEntryChooseCharacters = useCallback(() => {
    setEntryConversationContextSelection('character');
    setEntryQuickDetailOpen(true);
  }, []);
  const handleEntryChooseWorld = useCallback(() => {
    setEntryConversationContextSelection('world');
    setEntryQuickDetailOpen(true);
  }, []);
  const handleEntryChooseProject = useCallback(() => {
    setEntryQuickDetailOpen(true);
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

  const [agentInputCatalogByConversation, setAgentInputCatalogByConversation] = useState<
    Map<string, AgentInputCatalogMessage>
  >(() => new Map());
  const [agentComposerInputCatalog, setAgentComposerInputCatalog] = useState<
    AgentComposerInputCatalogMessage | undefined
  >();

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
    const authoritativeEntryIntent: AgentEntryIntentProjection = draftAdapter.readEntryIntent();
    setEntryMode(authoritativeEntryIntent.mode);
    setEntryQuickDetailOpen(true);
    setEntryConversationContextSelection(
      authoritativeEntryIntent.mode === 'character-dialogue' ? 'character' : undefined,
    );
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
    setEntryWorldLaunch(
      authoritativeEntryIntent.mode === 'authoring' ? undefined : entryDraft?.worldLaunch,
    );
    setEntryCharacterConversationMode(readEntryCharacterConversationMode(authoritativeEntryIntent));
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
    settings.selectedModelId,
  ]);

  useEffect(() => {
    if (!characterDialogueHandoff || agentPresentation?.phase !== 'draft') return;
    if (activeDraftIdRef.current !== agentPresentation.draftId) return;
    let handoff: CharacterDialogueHandoffIntent;
    try {
      handoff = parseCharacterDialogueHandoffIntent(characterDialogueHandoff);
      if (consumedCharacterDialogueHandoffIdsRef.current.has(handoff.intentId)) return;
      if (pendingCharacterDialogueHandoffIdsRef.current.has(handoff.intentId)) return;
      const participant = handoff.binding.participants[0];
      if (!participant) throw new Error('Character Dialogue handoff participant is unavailable.');
      const draftAdapter = requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter);
      const draftId = agentPresentation.draftId;
      pendingCharacterDialogueHandoffIdsRef.current.add(handoff.intentId);
      setIsEntryBindingPending(true);
      void draftAdapter
        .configureEntryTarget('character-dialogue', handoff.binding)
        .then((intent) => {
          if (activeDraftIdRef.current !== draftId) return;
          setEntryIntent(intent);
          setEntryMode('character-dialogue');
          setEntryQuickDetailOpen(true);
          setEntryWorkspaceTarget(undefined);
          setEntryContextReferences([]);
          setEntryWorldLaunch(undefined);
          setEntryCharacterConversationMode('companion');
          setEntryCharacterLaunches([
            {
              globalCharacterId: participant.globalCharacterId,
              characterVersionId: participant.characterVersionId,
              label: handoff.label,
            },
          ]);
          setGlobalError(null);
          consumedCharacterDialogueHandoffIdsRef.current.add(handoff.intentId);
          onCharacterDialogueHandoffConsumed?.(handoff.intentId);
        })
        .catch((error: unknown) => {
          if (activeDraftIdRef.current === draftId) setGlobalError(describeError(error));
        })
        .finally(() => {
          pendingCharacterDialogueHandoffIdsRef.current.delete(handoff.intentId);
          if (activeDraftIdRef.current === draftId) setIsEntryBindingPending(false);
        });
    } catch (error) {
      setGlobalError(describeError(error));
    }
  }, [
    agentPresentation,
    characterDialogueHandoff,
    hostRuntimeAdapter,
    onCharacterDialogueHandoffConsumed,
  ]);

  useEffect(() => {
    if (agentPresentation?.phase !== 'draft') return;
    if (composerWorkspace?.kind === 'workspace') return;
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
      ...(entryWorldLaunch === undefined ? {} : { worldLaunch: entryWorldLaunch }),
      ...(entryWorkspaceTarget === undefined ? {} : { workspaceTarget: entryWorkspaceTarget }),
      selectedModel: entrySelectedModel,
      mediaModelSelection: entryMediaModelSelection,
      executionMode: entryExecutionMode,
      entryMode,
    });
  }, [
    agentPresentation,
    composerWorkspace,
    entryContextReferences,
    entryCharacterLaunches,
    entryExecutionMode,
    entryMode,
    entryInputValue,
    entryMediaModelSelection,
    entrySelectedModel,
    entryWorldLaunch,
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
      setAmbientNodesByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
    },
    [setWorkItemsByConversation],
  );

  const handleWorkspaceCanvasSelect = useCallback(async (optionId: string) => {
    setWorkspaceCanvasSelectionId(optionId);
  }, []);

  useEffect(() => {
    if (isDraftPresentation && composerWorkspace?.kind === 'workspace') {
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
          setWorkspaceCanvasSelectionId('workspace-board');
          setWorkspaceCanvasLoading(false);
        })
        .catch((error: unknown) => {
          if (workspaceCanvasRequestSeq.current !== seq) return;
          setWorkspaceCanvasDiagnostic(error instanceof Error ? error.message : String(error));
          setWorkspaceCanvasLoading(false);
        });
      return;
    }
    workspaceCanvasRequestSeq.current += 1;
    setWorkspaceCanvasCatalog(undefined);
    setWorkspaceCanvasLoading(false);
    setWorkspaceCanvasDiagnostic(undefined);
    setWorkspaceCanvasSelectionId('workspace-board');
  }, [composerWorkspace, isDraftPresentation]);

  const workspaceCanvasPresentation = useMemo(() => {
    if (!isWorkspaceInitialPresentation || composerWorkspace?.kind !== 'workspace')
      return undefined;
    const workspaceId = composerWorkspace.workspaceId;
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
      selectedId: workspaceCanvasSelectionId,
      loading: workspaceCanvasLoading,
      ...(workspaceCanvasDiagnostic === undefined ? {} : { diagnostic: workspaceCanvasDiagnostic }),
      onSelect: handleWorkspaceCanvasSelect,
      ...(composerWorkspace.openCanvasDocument
        ? { onOpen: composerWorkspace.openCanvasDocument }
        : {}),
    };
  }, [
    composerWorkspace,
    handleWorkspaceCanvasSelect,
    isWorkspaceInitialPresentation,
    t,
    workspaceCanvasCatalog,
    workspaceCanvasDiagnostic,
    workspaceCanvasLoading,
    workspaceCanvasSelectionId,
  ]);

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
  const draftLaunchCatalog = isEntryDraftPresentation
    ? requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter).readLaunchCatalog()
    : undefined;
  const composerInputCatalog =
    agentPresentation?.phase === 'composer' &&
    agentComposerInputCatalog?.composerId === agentPresentation.composerId &&
    agentComposerInputCatalog.bindingKind === agentPresentation.binding.kind
      ? agentComposerInputCatalog
      : undefined;
  const worldExperienceTargetsAvailable =
    isEntryDraftPresentation &&
    typeof requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter).loadWorldExperienceTargets ===
      'function';
  const entryCharacterActionDisabled =
    entryCharacterTargetsStatus === 'unavailable' ||
    (entryCharacterTargetsStatus === 'ready' && entryCharacterTargets.length === 0);
  const entryWorldActionDisabled =
    !worldExperienceTargetsAvailable ||
    entryWorldTargetsStatus === 'unavailable' ||
    (entryWorldTargetsStatus === 'ready' && entryWorldTargets.length === 0);
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
          worldLaunch: entryWorldLaunch,
          characterConversationMode: entryCharacterConversationMode,
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
    const catalogModelIds = (draftLaunchCatalog?.models ?? [])
      .filter((option) => option.availability.status === 'available')
      .map((option) => option.id);
    const settingsModelIds = activeSettings.chatModelOptions.map((option) => option.id);
    const availableModelIds = new Set(draftLaunchCatalog ? catalogModelIds : settingsModelIds);
    const configuredModelId = draftLaunchCatalog
      ? (draftLaunchCatalog.configuration.fields.model.effectiveValue?.modelCatalogEntryId ?? '')
      : (activeSettings.selectedModelId ?? '');
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
    activeSettings.chatModelOptions,
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
      if (!draftLaunchCatalog) {
        setEntrySelectedModel(modelId);
        return;
      }
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
    [
      activeSettings.maxTokens,
      activeSettings.temperature,
      draftLaunchCatalog,
      entryExecutionMode,
      hostRuntimeAdapter,
    ],
  );
  const handleEntryExecutionModeChange = useCallback(
    (executionMode: SettingsState['executionMode']) => {
      if (!draftLaunchCatalog) {
        setEntryExecutionMode(executionMode);
        return;
      }
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
    [draftLaunchCatalog, hostRuntimeAdapter],
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
      let releaseAlreadyProjected = false;
      updateConversationRenderState(event.conversationId, (currentMessages, currentStreaming) => {
        releaseAlreadyProjected = currentMessages.some(
          (message) => message.id === event.message.id && message.isQueued !== true,
        );
        if (releaseAlreadyProjected) {
          return { messages: currentMessages, streaming: currentStreaming };
        }
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
            streamingMessageId: optimisticQueuedItem
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

      if (!optimisticQueuedItem || releaseAlreadyProjected) {
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
    setAgentComposerInputCatalog,
    setAgentInputCatalogByConversation,
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
    if (isOwnerBoundComposer) {
      agentHostMessages.getAgentComposerInputCatalog();
    }
    agentHostMessages.getAgentStates();
  }, [agentHostMessages, isDraftPresentation, isOwnerBoundComposer, requestConfigSnapshot]);

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
          nextTarget && nextTarget.authority
            ? {
                kind: 'authoring',
                workspaceId: nextTarget.context.workspaceId,
                workspaceGrantId: nextTarget.context.workspaceGrantId,
                authority: nextTarget.authority,
                target: nextTarget.target ?? null,
              }
            : undefined,
        )
        .then((intent) => {
          setEntryQuickDetailOpen(true);
          setEntryConversationContextSelection(undefined);
          setEntryMode(mode);
          setEntryIntent(intent);
          if (mode !== 'authoring') setEntryWorkspaceTarget(undefined);
          setEntrySessionMode('agent');
          setEntryContextReferences([]);
          setEntryCharacterLaunches([]);
          setEntryWorldLaunch(undefined);
          setEntryCharacterConversationMode('companion');
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
      return true;
    },
    [startNewForegroundConversation],
  );

  const handleEntryInputSend = useCallback(
    (input?: PendingSendInput) => {
      const messageText = (input?.messageText ?? entryInputValue).trim();
      if (!messageText) return false;
      const contextPayloads = input?.contextPayloads ?? entryContextReferences;

      if (isEntryDraftPresentation) {
        const draftHostRuntimeAdapter = requireAgentDraftHostRuntimeAdapter(hostRuntimeAdapter);
        if (!agentPresentation) throw new Error('Agent Draft presentation is unavailable.');
        setIsForegroundConversationActivationPending(true);
        void (async () => {
          const trigger = parseAgentInputTrigger(messageText);
          let effectiveIntent = entryIntent;
          let effectiveWorkspaceTarget = entryWorkspaceTarget;
          const creatorTargetKind = builtinCreatorTargetKind(trigger);
          if (
            composerWorkspace?.kind === 'entry' &&
            entryMode === 'authoring' &&
            creatorTargetKind !== undefined
          ) {
            if (effectiveIntent === undefined) {
              throw new Error('Agent Entry intent is unavailable.');
            }
            const configuredCreatorTarget =
              effectiveIntent.targetReceipt?.binding.kind === 'authoring'
                ? effectiveIntent.targetReceipt.binding.target
                : null;
            if (configuredCreatorTarget?.kind !== creatorTargetKind) {
              if (!entryWorkspaceTarget?.authority || !composerWorkspace.onCreateAuthoringTarget) {
                throw new Error(t('chat.entryAuthoring.creatorProjectRequired'));
              }
              const name = t(
                creatorTargetKind === 'character-project'
                  ? 'chat.entryAuthoring.untitledCharacter'
                  : 'chat.entryAuthoring.untitledWorld',
              );
              const creation = await composerWorkspace.onCreateAuthoringTarget(
                {
                  creationId: `${entryWorkspaceTarget.authority.projectId}:${creatorTargetKind}`,
                  label: name,
                  targetKind: creatorTargetKind,
                  placement: {
                    kind: 'project',
                    projectId: entryWorkspaceTarget.authority.projectId,
                  },
                },
                name,
              );
              if (!creation) throw new Error(t('chat.entryAuthoring.creationUnavailable'));
              if (
                creation.target.target?.kind !== creatorTargetKind ||
                creation.target.authority?.projectId !== entryWorkspaceTarget.authority.projectId
              ) {
                throw new Error('Creator target does not match its exact Project authority.');
              }
              effectiveWorkspaceTarget = creation.target;
              effectiveIntent = await configureEntryAuthoringTarget(creation.target);
            }
          }

          const launchCatalog = draftHostRuntimeAdapter.readLaunchCatalog();
          const authoritativeDraft = launchCatalog.interaction;
          if (composerWorkspace?.kind === 'entry') {
            if (effectiveIntent === undefined) {
              throw new Error('Agent Entry intent is unavailable.');
            }
            const validation = projectHomeExperienceEntry({
              mode: entryMode,
              intent: effectiveIntent,
              draft: authoritativeDraft,
              ...(effectiveWorkspaceTarget === undefined
                ? {}
                : { workspaceTarget: effectiveWorkspaceTarget }),
              workspaceChooserAvailable: !composerWorkspace.disabled,
              characterTargetsAvailable:
                entryCharacterTargetsStatus === 'ready' && entryCharacterTargets.length > 0,
              characterLaunches: entryCharacterLaunches,
              ...(entryWorldLaunch === undefined ? {} : { worldLaunch: entryWorldLaunch }),
              characterConversationMode: entryCharacterConversationMode,
              bindingPending: false,
              configurationReady:
                hasConfigSnapshot &&
                launchCatalog.configuration.request !== undefined &&
                launchCatalog.configuration.fields.model.policy.status !== 'unavailable',
            });
            if (validation.submissionBlockedReasonKey) {
              throw new Error(t(validation.submissionBlockedReasonKey));
            }
          }
          const configuration = launchCatalog.configuration.request;
          if (
            !configuration ||
            launchCatalog.configuration.fields.model.policy.status === 'unavailable'
          ) {
            throw new Error(t('chat.input.configurationRequired'));
          }
          const references = contextPayloads.map(projectDraftReferenceReceipt);
          const inputIntent = projectDraftInputIntent({
            messageText,
            trigger,
            catalog: launchCatalog.inputs,
            bindingKind: authoritativeDraft.binding.kind,
          });
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
          const canvasTurnTarget = projectWorkspaceCanvasTurnTarget(workspaceCanvasPresentation);
          const projection = await draftHostRuntimeAdapter.submitDraft({
            draft: authoritativeDraft,
            entryTargetReceipt:
              composerWorkspace?.kind === 'workspace'
                ? null
                : (effectiveIntent?.targetReceipt ?? null),
            input: inputIntent,
            references,
            resourceGrantIds,
            configuration,
            ...(purposeModels && Object.keys(purposeModels).length > 0 ? { purposeModels } : {}),
            ...(canvasTurnTarget === undefined ? {} : { canvasTurnTarget }),
          });
          if (composerWorkspace?.kind !== 'workspace') {
            committedEntryDraftIdRef.current = agentPresentation.draftId;
            writeAgentEntryDraftSnapshot(hostRuntimeAdapter, undefined);
          }
          setEntryInputValue((current) => (current === entryInputValue ? '' : current));
          setEntryContextReferences((current) =>
            current.filter((reference) => !submittedReferenceIds.has(reference.id)),
          );
          setEntryCharacterLaunches([]);
          setEntryWorldLaunch(undefined);
          if (projection.turnStatus === 'failed' && projection.diagnostic) {
            setGlobalError(projection.diagnostic);
          }
        })()
          .catch((error: unknown) => setGlobalError(describeError(error)))
          .finally(() => setIsForegroundConversationActivationPending(false));
        return true;
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
      return true;
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
      configureEntryAuthoringTarget,
      handleSendWithoutConversation,
      hasConfigSnapshot,
      entryCharacterLaunches,
      entryCharacterConversationMode,
      entryCharacterTargets,
      entryCharacterTargetsStatus,
      entryWorldLaunch,
      hostRuntimeAdapter,
      isEntryBindingPending,
      isEntryDraftPresentation,
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
              isWorkspaceInitialPresentation
                ? 'agent-workspace-initial-composition'
                : isDraftPresentation
                  ? 'agent-entry-composition'
                  : ''
            }`}
          >
            {homeExperienceProjection ? (
              <HomeExperienceModeSelector
                projection={homeExperienceProjection}
                selectionPending={isEntryBindingPending}
                onChange={handleEntryModeChange}
              />
            ) : null}
            <div
              className={
                isWorkspaceInitialPresentation
                  ? 'agent-workspace-initial-center-group'
                  : 'agent-entry-center-group'
              }
            >
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
                inputCatalog={draftLaunchCatalog?.inputs ?? composerInputCatalog?.entries}
                configurationPolicy={draftLaunchCatalog?.configuration}
                inputCatalogPhase={
                  draftLaunchCatalog?.interaction.phase ?? composerInputCatalog?.phase
                }
                inputCatalogBindingKind={
                  draftLaunchCatalog?.interaction.binding.kind ?? composerInputCatalog?.bindingKind
                }
                mentionItems={mentionItems}
                onRequestFiles={(filter) => {
                  updateMentionSearchFilter(filter);
                  if (
                    !isWorkspaceInitialPresentation &&
                    draftLaunchCatalog?.interaction.binding.kind !== 'workspace'
                  ) {
                    return;
                  }
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
                  presentation={
                    isWorkspaceInitialPresentation
                      ? 'workspace'
                      : isDraftPresentation
                        ? 'entry'
                        : 'conversation'
                  }
                  inputValue={entryInputValue}
                  isThinking={false}
                  onInputChange={updateEntryInputValue}
                  onSend={handleEntryInputSend}
                  submissionBlocked={draftSubmissionBlockedReason !== undefined}
                  onAuthorizeResource={
                    isEntryDraftPresentation
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
                  entryContextActions={
                    composerWorkspace?.kind === 'workspace'
                      ? []
                      : entryMode === 'authoring'
                        ? [
                            {
                              kind: 'project',
                              label: t('chat.entryAction.chooseProject'),
                              onInvoke: handleEntryChooseProject,
                            },
                          ]
                        : [
                            {
                              kind: 'character',
                              label: t('chat.entryContext.chooseCharacters'),
                              onInvoke: handleEntryChooseCharacters,
                              disabled: entryCharacterActionDisabled,
                              disabledReason: entryCharacterActionDisabled
                                ? t('chat.entryExperience.validation.characterUnavailable')
                                : undefined,
                            },
                            {
                              kind: 'world',
                              label: t('chat.entryAction.chooseWorld'),
                              onInvoke: handleEntryChooseWorld,
                              disabled: entryWorldActionDisabled,
                              disabledReason: entryWorldActionDisabled
                                ? t('chat.entryExperience.validation.worldUnavailable')
                                : undefined,
                            },
                          ]
                  }
                  entryWorkspaceTarget={
                    composerWorkspace?.kind === 'entry' ? entryWorkspaceTarget : undefined
                  }
                  onClearEntryWorkspaceTarget={
                    composerWorkspace?.kind === 'entry' &&
                    entryWorkspaceTarget &&
                    !isEntryBindingPending
                      ? clearEntryAuthoringTarget
                      : undefined
                  }
                  workspaceCanvas={
                    composerWorkspace?.kind === 'workspace'
                      ? {
                          workspaceLabel: composerWorkspace.label,
                          canvas: workspaceCanvasPresentation,
                        }
                      : undefined
                  }
                  selectedCharacterLaunches={
                    composerWorkspace?.kind !== 'workspace' && entryMode !== 'authoring'
                      ? entryCharacterLaunches
                      : []
                  }
                  selectedWorldLaunch={
                    composerWorkspace?.kind !== 'workspace' ? entryWorldLaunch : undefined
                  }
                  entryCharacterConversationMode={
                    entryMode === 'character-dialogue' ? entryCharacterConversationMode : undefined
                  }
                  onEntryCharacterConversationModeChange={
                    entryMode === 'character-dialogue'
                      ? configureEntryCharacterConversationMode
                      : undefined
                  }
                  entryCharacterConversationModeDisabled={isEntryBindingPending}
                  onRemoveCharacterLaunch={(characterVersionId) =>
                    configureEntryCharacterLaunches(
                      entryCharacterLaunches.filter(
                        (selection) => selection.characterVersionId !== characterVersionId,
                      ),
                    )
                  }
                  onRemoveWorldLaunch={() => configureEntryWorldLaunch(undefined)}
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
                    entryConversationContextSelection === 'character'
                      ? entryCharacterActionDisabled
                      : entryConversationContextSelection === 'world'
                        ? entryWorldActionDisabled
                        : false
                  }
                  detailExpanded={entryQuickDetailOpen}
                  summary={
                    entryMode === 'character-dialogue' && entryCharacterLaunches.length
                      ? t('chat.entryContext.characterSummary', {
                          count: entryCharacterLaunches.length,
                        })
                      : undefined
                  }
                  title={
                    entryConversationContextSelection === 'character'
                      ? t('chat.entryContext.chooseCharacters')
                      : entryConversationContextSelection === 'world'
                        ? t('chat.entryAction.chooseWorld')
                        : undefined
                  }
                  onExpandedChange={handleEntryQuickDetailOpenChange}
                >
                  {entryMode === 'authoring' && composerWorkspace?.kind === 'entry' ? (
                    <AuthoringTargetSelector
                      presentation={composerWorkspace}
                      selected={entryWorkspaceTarget}
                      pending={isEntryBindingPending}
                      onChange={async (target) => {
                        await configureEntryAuthoringTarget(target);
                      }}
                    />
                  ) : entryConversationContextSelection === 'character' &&
                    entryCharacterTargetsStatus !== 'unavailable' ? (
                    <CharacterDialogueTargetSelector
                      targets={entryCharacterTargets}
                      selected={entryCharacterLaunches}
                      loading={entryCharacterTargetsStatus !== 'ready'}
                      pending={isEntryBindingPending}
                      onChange={configureEntryCharacterLaunches}
                    />
                  ) : entryConversationContextSelection === 'world' &&
                    entryWorldTargetsStatus !== 'unavailable' ? (
                    <WorldExperienceTargetSelector
                      targets={entryWorldTargets}
                      selected={entryWorldLaunch}
                      loading={entryWorldTargetsStatus !== 'ready'}
                      pending={isEntryBindingPending}
                      onChange={configureEntryWorldLaunch}
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
            workspaceCanvas={
              composerWorkspace?.kind === 'workspace'
                ? {
                    workspaceLabel: composerWorkspace.label,
                    canvas: undefined,
                  }
                : undefined
            }
            queuedEditDraftConflictMessage={t('chat.input.queueEditDraftConflict')}
          />
        );
      })}

      {globalError ? (
        <AgentDiagnosticToast title={t('chat.diagnostic.globalError')}>
          {globalError}
        </AgentDiagnosticToast>
      ) : null}
    </>
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function builtinCreatorTargetKind(
  trigger: ParsedAgentInputTrigger | null,
): 'character-project' | 'world-project' | undefined {
  if (trigger?.trigger !== 'skill') return undefined;
  if (trigger.name === 'character-creator') return 'character-project';
  if (trigger.name === 'world-creator') return 'world-project';
  return undefined;
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

function readEntryCharacterConversationMode(
  intent: AgentEntryIntentProjection,
): CharacterConversationMode {
  const binding = intent.targetReceipt?.binding;
  return binding?.kind === 'character-dialogue' ? binding.mode : 'companion';
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
