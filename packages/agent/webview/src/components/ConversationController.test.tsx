import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentConfigurationRequest,
  type AgentContextPayload,
  type AgentComposerInteractionProjection,
  type AgentDomainBinding,
  type AgentDraftInteractionProjection,
  type AgentHostToWebviewMessage,
  type AgentLaunchCatalogProjection,
} from '@neko/agent-contracts';
import type {
  AgentQueuedMessageItem,
  AgentState,
  AgentWorkItem,
  ConversationSummary,
  Message,
  SettingsState,
} from '@neko/agent-contracts';
import { ConversationRenderCoordinator } from '../render-lifecycle/conversation-render-coordinator';
import type { TabRenderStore } from '../render-runtime/tab-render-runtime';
import { useTabRenderStore } from '../render-runtime/useTabRenderStore';
import { ConversationController } from './ConversationController';
import conversationControllerSource from './ConversationController.tsx?raw';
import authoringTargetSelectorSource from './ChatView/AuthoringTargetSelector.tsx?raw';
import { ComposerWorkspaceProvider } from './ComposerWorkspaceContext';

const hostMocks = vi.hoisted(() => ({
  runtimeId: 'conversation-controller-test',
  getConversations: vi.fn(),
  getActiveConversation: vi.fn(),
  refreshConfigSnapshot: vi.fn(),
  getAgentStates: vi.fn(),
  getAgentComposerInputCatalog: vi.fn(),
  getAgentInputCatalog: vi.fn(),
  getTabState: vi.fn(),
  updateTabState: vi.fn(),
  createConversation: vi.fn(),
  activateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  searchProjectFiles: vi.fn(),
  getSettings: vi.fn(),
  getConversationSnapshot: vi.fn(),
  getContextTokenCount: vi.fn(),
  getMessageQueue: vi.fn(),
  readLaunchCatalog: vi.fn(),
  readEntryIntent: vi.fn(),
  loadCharacterDialogueTargets: vi.fn(),
  loadWorldExperienceTargets: vi.fn(),
  configureEntryTarget: vi.fn(),
  bindTarget: vi.fn(),
  updateDraftConfiguration: vi.fn(),
  submitDraft: vi.fn(),
  authorizeResource: vi.fn(),
}));
const hostRuntimeMocks = vi.hoisted(() => ({
  listener: undefined as ((message: AgentHostToWebviewMessage) => void) | undefined,
  getState: vi.fn<() => unknown>(() => undefined),
  setState: vi.fn(),
}));
vi.mock('../host-runtime-context', () => ({
  useAgentHostMessages: () => hostMocks,
  useAgentHostRuntimeAdapter: () => ({
    hostKind: 'electron',
    runtimeId: hostMocks.runtimeId,
    send: vi.fn(),
    subscribe: vi.fn((listener: (message: AgentHostToWebviewMessage) => void) => {
      hostRuntimeMocks.listener = listener;
      return { dispose: vi.fn() };
    }),
    getState: hostRuntimeMocks.getState,
    setState: hostRuntimeMocks.setState,
    createConversation: hostMocks.createConversation,
    submitMessage: vi.fn(),
    readLaunchCatalog: hostMocks.readLaunchCatalog,
    readEntryIntent: hostMocks.readEntryIntent,
    loadCharacterDialogueTargets: hostMocks.loadCharacterDialogueTargets,
    loadWorldExperienceTargets: hostMocks.loadWorldExperienceTargets,
    configureEntryTarget: hostMocks.configureEntryTarget,
    bindTarget: hostMocks.bindTarget,
    updateDraftConfiguration: hostMocks.updateDraftConfiguration,
    submitDraft: hostMocks.submitDraft,
    authorizeResource: hostMocks.authorizeResource,
  }),
  useOptionalAgentHostRuntimeAdapter: () => ({
    hostKind: 'electron',
    runtimeId: hostMocks.runtimeId,
    send: vi.fn(),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    getState: hostRuntimeMocks.getState,
    setState: hostRuntimeMocks.setState,
    createConversation: hostMocks.createConversation,
    submitMessage: vi.fn(),
  }),
}));

beforeEach(() => {
  hostMocks.createConversation.mockResolvedValue({
    submissionId: 'submission-create',
    conversationId: 'conversation-created',
    turnId: 'turn-created',
    queueItemId: 'queue-created',
    message: 'first input',
    createdAt: 1,
    state: 'active',
  });
  hostRuntimeMocks.getState.mockReturnValue(undefined);
  hostMocks.readLaunchCatalog.mockReturnValue(createBoundAssistantLaunchCatalog('draft-default'));
  hostMocks.readEntryIntent.mockReturnValue({ mode: 'assistant', targetReceipt: null });
  hostMocks.loadCharacterDialogueTargets.mockResolvedValue([]);
  hostMocks.loadWorldExperienceTargets.mockResolvedValue([]);
  hostMocks.configureEntryTarget.mockImplementation(async (mode, binding) => ({
    mode,
    targetReceipt:
      binding === undefined
        ? null
        : {
            targetReceiptId: 'entry-target:connection-1:test',
            draftId: 'draft-default',
            connectionId: 'launch-1',
            mode,
            binding,
          },
  }));
  hostMocks.updateDraftConfiguration.mockImplementation(
    async (request: AgentConfigurationRequest) => {
      const current = hostMocks.readLaunchCatalog() as AgentLaunchCatalogProjection;
      const next = withDraftConfiguration(current, request);
      hostMocks.readLaunchCatalog.mockReturnValue(next);
      return next;
    },
  );
});

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    locale: 'en',
    t: (key: string) =>
      ({
        'chat.emptyState.title': 'OpenNeko Creative Assistant',
        'chat.emptyState.description': 'Create stories, characters, scenes, and materials.',
        'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
        'chat.emptyState.entry.startChat': 'Start Chat',
        'chat.emptyState.entry.generateAssets': 'Generate Assets',
        'chat.emptyState.entry.roleplay': 'Roleplay',
        'chat.emptyState.entry.startChatHelper': 'Chat helper',
        'chat.emptyState.entry.generateAssetsHelper': 'Asset helper',
        'chat.emptyState.entry.roleplayHelper': 'Roleplay helper',
        'chat.emptyState.desktopDockTitle': 'Hi, create with chat',
        'chat.emptyState.desktopDockDescription': 'Describe an idea or mention a resource.',
        'chat.emptyState.desktopDockSkills': 'Try a Skill',
        'chat.emptyState.scope.title': 'Choose a creative space',
        'chat.emptyState.scope.description': 'Choose an owner.',
        'chat.emptyState.scope.assistant': 'Assistant',
        'chat.emptyState.scope.assistantHelper': 'Assistant helper',
        'chat.emptyState.scope.workspace': 'Workspace',
        'chat.emptyState.scope.workspaceHelper': 'Workspace helper',
        'chat.emptyState.scope.characterRoom': 'Character / Room',
        'chat.emptyState.scope.characterRoomHelper': 'Character helper',
        'chat.emptyState.scope.assistantActiveTitle': 'Assistant is ready',
        'chat.emptyState.scope.workspaceActiveTitle': 'Start creating',
        'chat.emptyState.scope.activeDescription': 'Start a conversation.',
        'chat.entryExperience.label': 'Choose an experience',
        'chat.entryExperience.mode.assistant': 'Conversation',
        'chat.entryExperience.mode.authoring': 'Creation',
        'chat.entryExperience.mode.characterDialogue': 'Character Dialogue',
        'chat.entryExperience.mode.worldExperience': 'World Experience',
        'chat.entryExperience.assistant.title': 'What would you like to explore?',
        'chat.entryExperience.assistant.description': 'Start without a project.',
        'chat.entryExperience.authoring.title': 'What should we create?',
        'chat.entryExperience.authoring.description': 'Choose a target.',
        'chat.entryExperience.characterDialogue.title': 'Enter a character dialogue',
        'chat.entryExperience.characterDialogue.description': 'Character owner required.',
        'chat.entryExperience.characterDialogue.selectorLabel': 'Choose participants',
        'chat.entryExperience.characterDialogue.loading': 'Loading published Characters',
        'chat.entryExperience.characterDialogue.empty': 'No published Characters',
        'chat.entryPanel.assistantTitle': 'Skills',
        'skillDescriptions.character-creator': 'Create a localized character draft.',
        'chat.entryPanel.authoringTitle': 'Projects, Characters, and Worlds',
        'chat.entryPanel.characterTitle': 'Choose Characters',
        'chat.entryContext.authoringTitle': 'Authoring target',
        'chat.entryContext.authoringDescription': 'Choose a target for this draft.',
        'chat.entryContext.characterTitle': 'Choose Characters',
        'chat.entryContext.characterDescription': 'Choose published Characters.',
        'chat.entryContext.chooseAuthoringTarget': 'Choose authoring target',
        'chat.entryContext.chooseCharacters': 'Choose Characters',
        'chat.entryContext.characterSummary': 'Characters selected',
        'chat.entryExperience.characterDialogue.modeLabel': 'Conversation mode',
        'chat.entryExperience.characterDialogue.modeDaily': 'Daily',
        'chat.entryExperience.characterDialogue.modeDailyDescription': 'Use daily memory.',
        'chat.entryExperience.characterDialogue.modeNarrative': 'Narrative',
        'chat.entryExperience.characterDialogue.modeNarrativeDescription':
          'Use authored narrative context.',
        'chat.entryContext.close': 'Close target selector',
        'chat.entryAuthoring.nameLabel': 'Draft name',
        'chat.entryAuthoring.namePlaceholder': 'Name this Character draft',
        'chat.entryAuthoring.nameRequired': 'Enter a draft name.',
        'chat.entryAuthoring.creationUnavailable': 'Character draft creation is unavailable.',
        'chat.entryAuthoring.destinationLabel': 'Choose where to create the draft',
        'chat.entryAuthoring.destinationTitle': 'Character draft destination',
        'chat.entryAuthoring.createDescription': 'Create a new draft here',
        'chat.entryAuthoring.cancel': 'Cancel',
        'chat.entryAction.chooseProject': 'Choose Project',
        'chat.entryAction.chooseProjectDescription': 'Add this project to the creation context',
        'chat.entryAction.chooseWorld': 'Choose World',
        'chat.entryAction.openDirectory': 'Open directory',
        'chat.entryExperience.worldExperience.title': 'Enter a world experience',
        'chat.entryExperience.worldExperience.description': 'World owner required.',
        'chat.entryExperience.validation.bindingPending': 'Updating the selected experience…',
        'chat.entryExperience.validation.configurationRequired': 'Choose a configured model.',
        'chat.entryExperience.validation.assistantBindingMismatch': 'Release Workspace binding.',
        'chat.entryExperience.validation.workspaceChooserUnavailable': 'Chooser unavailable.',
        'chat.entryExperience.validation.workspaceRequired': 'Choose a project or directory.',
        'chat.entryExperience.validation.workspaceBindingMismatch': 'Select Workspace again.',
        'chat.entryExperience.validation.characterUnavailable': 'Character is unavailable.',
        'chat.entryExperience.validation.worldUnavailable': 'World is unavailable.',
        'chat.input.placeholder': 'Type anything...',
        'chat.input.thinkingPlaceholder': 'Type next message...',
        'chat.input.queuePlaceholder': '{count} queued...',
        'chat.input.attach': 'Attach',
        'chat.input.commands': 'Commands',
        'chat.input.send': 'Send',
        'chat.input.configurationRequired': 'Choose a configured model.',
        'chat.input.queue': 'Queue',
        'chat.input.control.mode': 'Mode, model, and parameters',
        'chat.input.control.params': 'Tool parameters',
        'chat.autoMode': 'Auto',
        'chat.selectModel': 'Select model',
        'chat.noModelsAvailable': 'No available models',
        'chat.sessionMode.sections.agent': 'Direct Agent Collaboration',
        'chat.sessionMode.sections.media': 'Media Generation',
        'chat.sessionMode.agent': 'Creative Collaboration',
        'chat.sessionMode.agentDesc': 'Refine ideas.',
        'chat.sessionMode.short.agent': 'Agent',
        'chat.sessionMode.summary.agent': 'Refine ideas.',
        'chat.sessionMode.image': 'Image Generation',
        'chat.sessionMode.imageDesc': 'Create images.',
        'chat.sessionMode.short.image': 'Image',
        'chat.sessionMode.summary.image': 'Create images.',
        'chat.sessionMode.video': 'Video Generation',
        'chat.sessionMode.videoDesc': 'Create videos.',
        'chat.sessionMode.short.video': 'Video',
        'chat.sessionMode.summary.video': 'Create videos.',
        'chat.sessionMode.audio': 'Sound Generation',
        'chat.sessionMode.audioDesc': 'Create sounds.',
        'chat.sessionMode.short.audio': 'Audio',
        'chat.sessionMode.summary.audio': 'Create sounds.',
        'chat.sessionMode.badge.agent': 'Chat',
        'chat.sessionMode.badge.image': 'Image',
        'chat.sessionMode.badge.video': 'Video',
        'chat.sessionMode.badge.audio': 'Sound',
        'chat.generation.category.image': 'Image',
        'chat.generation.category.video': 'Video',
        'chat.generation.category.audio': 'Audio',
        'chat.generation.model.none': 'Do not use',
        'chat.generation.model.noneShort': 'none',
        'chat.generation.model.select': 'Select {category} model',
        'chat.generation.model.unconfigured': 'No {category} model',
        'chat.generation.param.ratio': 'Ratio',
        'chat.generation.param.resolution': 'Resolution',
      })[key] ?? key,
  }),
}));

vi.mock('./ChatWorkspace', () => ({
  ChatWorkspace: (props: {
    tabRenderStore: TabRenderStore;
    messages?: Message[];
    settings?: SettingsState;
    setMessages?: (value: Message[] | ((current: Message[]) => Message[])) => void;
    isThinking?: boolean;
    streamingMessageId?: string | null;
    agentState?: AgentState | null;
    foregroundConversationAvailability?: {
      kind: 'ready' | 'loading' | 'unavailable';
      diagnostic?: string;
    };
    queuedMessages?: readonly AgentQueuedMessageItem[];
    contextTokenCount?: number;
    workItems?: readonly AgentWorkItem[];
    handleMessage?: (event: MessageEvent) => void;
    onUserMessageSent?: (event: { conversationId: string; message: Message }) => void;
    onPendingSendRequestConsumed?: (id: number) => void;
    pendingSendRequest?: {
      id: number;
      input: {
        messageText?: string;
        contextPayloads?: AgentContextPayload[];
        attachments?: readonly import('./ChatView/InputArea/types').MessageAttachment[];
        fileReferences?: readonly import('./ChatView/InputArea/types').SelectedFileReference[];
      };
    } | null;
    initialInputRequest?: { id: number; messageText: string } | null;
    initialSessionModeRequest?: {
      id: number;
      mode: 'agent' | 'image' | 'video' | 'audio';
    } | null;
    isVisible?: boolean;
    composerPresentation?: 'default' | 'compact';
  }) => {
    const tabRenderSnapshot = useTabRenderStore(props.tabRenderStore);
    const [instanceId] = useState(() => crypto.randomUUID());
    const [localCounter, setLocalCounter] = useState(0);
    const isVisible = props.isVisible ?? true;
    const testId = (name: string) =>
      isVisible ? name : `${name}-${tabRenderSnapshot.snapshot.tabId}`;

    const handleMessage = props.handleMessage;
    useEffect(() => {
      if (!handleMessage || !isVisible) return;
      const listener = (event: MessageEvent) => handleMessage(event);
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    }, [handleMessage, isVisible]);

    return (
      <div
        data-testid={`workspace-runtime-${tabRenderSnapshot.snapshot.tabId}`}
        data-instance-id={instanceId}
        data-visible={String(isVisible)}
        data-composer-presentation={props.composerPresentation ?? 'default'}
      >
        {isVisible ? <span data-testid="chat-workspace" /> : null}
        <span data-testid={testId('workspace-local-state')}>{localCounter}</span>
        <button
          type="button"
          data-testid={testId('increment-workspace-local-state')}
          onClick={() => setLocalCounter((current) => current + 1)}
        />
        <span data-testid={testId('workspace-conversation')}>
          {tabRenderSnapshot.snapshot.conversationId}
        </span>
        <span data-testid={testId('workspace-selected-model')}>
          {tabRenderSnapshot.snapshot.state.selectedModel}
        </span>
        <span data-testid={testId('workspace-execution-mode')}>
          {tabRenderSnapshot.snapshot.state.executionMode}
        </span>
        <span data-testid={testId('workspace-media-models')}>
          {Object.values(tabRenderSnapshot.snapshot.state.mediaModelSelection).join('|')}
        </span>
        <span data-testid={testId('workspace-model-options')}>
          {props.settings?.chatModelOptions.map((option) => option.id).join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-diagnostics')}>
          {tabRenderSnapshot.snapshot.state.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('|')}
        </span>
        <span data-testid={testId('workspace-queued-edit')}>
          {tabRenderSnapshot.snapshot.state.queuedEdit?.item.content ?? ''}
        </span>
        <span data-testid={testId('workspace-tab-conversation')}>
          {tabRenderSnapshot.snapshot.conversationId}
        </span>
        <span data-testid={testId('workspace-messages')}>
          {props.messages?.map((message) => message.content).join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-message-attachments')}>
          {props.messages
            ?.flatMap((message) => message.attachments?.map((attachment) => attachment.id) ?? [])
            .join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-message-context')}>
          {props.messages
            ?.flatMap(
              (message) => message.contextReferences?.map((reference) => reference.label) ?? [],
            )
            .join('|') ?? ''}
        </span>
        <button
          type="button"
          data-testid={testId('append-workspace-message')}
          onClick={() =>
            props.setMessages?.((current) => [
              ...current,
              {
                id: `local-${tabRenderSnapshot.snapshot.tabId}`,
                role: 'assistant',
                content: `local ${tabRenderSnapshot.snapshot.conversationId}`,
                timestamp: 1,
              },
            ])
          }
        />
        <span data-testid={testId('workspace-streaming-flags')}>
          {props.messages
            ?.map((message) => {
              const textBlock = message.contentBlocks?.find((block) => block.type === 'text');
              return `${message.isStreaming === true}:${textBlock?.type === 'text' && textBlock.isStreaming === true}`;
            })
            .join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-switching')}>idle</span>
        <span data-testid={testId('workspace-availability')}>
          {props.foregroundConversationAvailability?.kind ?? 'ready'}
          {props.foregroundConversationAvailability?.diagnostic
            ? `:${props.foregroundConversationAvailability.diagnostic}`
            : ''}
        </span>
        <span data-testid={testId('workspace-composer-mode')}>
          {props.isThinking || props.streamingMessageId ? 'queue-enabled' : 'send-enabled'}
        </span>
        <span data-testid={testId('workspace-agent-state')}>
          {props.agentState
            ? `${props.agentState.phase}:${props.agentState.startedAt}:${props.agentState.toolName ?? 'none'}`
            : 'none'}
        </span>
        <span data-testid={testId('workspace-queued-messages')}>
          {props.queuedMessages?.map((item) => item.content).join('|') ?? ''}
        </span>
        <span data-testid={testId('workspace-context-chips')}>
          {tabRenderSnapshot.snapshot.state.contextReferences.map((chip) => chip.label).join('|')}
        </span>
        <span data-testid={testId('workspace-input')}>
          {tabRenderSnapshot.snapshot.state.inputValue}
        </span>
        <span data-testid={testId('workspace-token-count')}>{props.contextTokenCount ?? 0}</span>
        <span data-testid={testId('workspace-work-items')}>
          {props.workItems?.map((item) => item.title).join('|') ?? ''}
        </span>
        <button
          type="button"
          data-testid={testId('emit-user-message-sent')}
          onClick={() =>
            props.onUserMessageSent?.({
              conversationId: tabRenderSnapshot.snapshot.conversationId,
              message: {
                id: `user-${tabRenderSnapshot.snapshot.tabId}`,
                role: 'user',
                content: 'generate image',
                timestamp: 1,
              },
            })
          }
        />
        <button
          type="button"
          data-testid={testId('emit-released-queue-receipt')}
          onClick={() =>
            props.onUserMessageSent?.({
              conversationId: tabRenderSnapshot.snapshot.conversationId,
              message: {
                id: 'released:queue-race',
                role: 'user',
                content: 'queued release wins the race',
                timestamp: 1,
                isQueued: true,
              },
            })
          }
        />
        <span data-testid={testId('workspace-viewport')}>
          {tabRenderSnapshot.snapshot.state.viewport.followMode}:
          {tabRenderSnapshot.snapshot.state.viewport.anchorMessageId ?? 'none'}:
          {tabRenderSnapshot.snapshot.state.viewport.anchorOffset ?? 0}
        </span>
        <button
          type="button"
          data-testid={testId('detach-viewport')}
          onClick={() =>
            tabRenderSnapshot.updateState({
              viewport: {
                followMode: 'detached',
                anchorMessageId: `anchor-${tabRenderSnapshot.snapshot.tabId}`,
                anchorOffset: 25,
              },
            })
          }
        />
        <button
          type="button"
          data-testid={testId('add-context-chip')}
          onClick={() =>
            tabRenderSnapshot.updateState((state) => ({
              contextReferences: [...state.contextReferences, contextPayload('ctx-a', 'A context')],
            }))
          }
        />
        <span data-testid={testId('entry-menu')}>
          {tabRenderSnapshot.snapshot.state.menus.entryPrompt ?? 'none'}
        </span>
        <span data-testid={testId('pending-send')}>
          {props.pendingSendRequest?.input.messageText ?? 'none'}
        </span>
        <span data-testid={testId('pending-send-context')}>
          {props.pendingSendRequest?.input.contextPayloads
            ?.map((payload) => payload.label)
            .join('|') ?? 'none'}
        </span>
        <span data-testid={testId('pending-send-attachments')}>
          {props.pendingSendRequest?.input.attachments
            ?.map((attachment) => attachment.id)
            .join('|') ?? 'none'}
        </span>
        <span data-testid={testId('pending-send-references')}>
          {props.pendingSendRequest?.input.fileReferences
            ?.map((reference) => reference.id)
            .join('|') ?? 'none'}
        </span>
        <button
          type="button"
          data-testid={testId('commit-pending-send')}
          onClick={() => {
            const pending = props.pendingSendRequest;
            if (!pending) return;
            props.onUserMessageSent?.({
              conversationId: tabRenderSnapshot.snapshot.conversationId,
              message: {
                id: `pending-send:${pending.id}`,
                role: 'user',
                content: pending.input.messageText ?? '',
                timestamp: 1,
              },
            });
            props.onPendingSendRequestConsumed?.(pending.id);
          }}
        />
        <span data-testid={testId('initial-input')}>
          {props.initialInputRequest?.messageText ?? 'none'}
        </span>
        <span data-testid={testId('initial-session-mode')}>
          {props.initialSessionModeRequest?.mode ?? 'none'}
        </span>
      </div>
    );
  },
  projectWorkspaceCanvasTurnTarget: (
    canvas: import('./ComposerWorkspaceContext').AgentComposerCanvasPresentation | undefined,
  ) => {
    if (canvas === undefined) return undefined;
    const selected = canvas.options.find((option) => option.id === canvas.selectedId);
    if (selected === undefined) throw new Error('Workspace Canvas selection is unavailable.');
    if (selected.target.kind === 'workspace-board') return undefined;
    if (selected.summary === undefined) {
      throw new Error('Exact Canvas selection requires its light summary.');
    }
    return {
      workspaceId: selected.target.workspaceId,
      target: selected.target,
      summary: selected.summary,
    };
  },
}));

vi.mock('./ChatView/InputArea', async () => {
  const { useInputAreaContext } = await vi.importActual<
    typeof import('./ChatView/InputAreaContext')
  >('./ChatView/InputAreaContext');
  return {
    InputArea: (props: {
      inputValue: string;
      onInputChange: (value: string) => void;
      onSend: (input?: {
        messageText?: string;
        displayMessageText?: string;
        attachments?: readonly import('./ChatView/InputArea/types').MessageAttachment[];
        fileReferences?: readonly import('./ChatView/InputArea/types').SelectedFileReference[];
        sessionMode?: 'agent';
      }) => void;
      disabled?: boolean;
      submissionBlocked?: boolean;
      submissionBlockedReason?: string;
      entryContextActions?: readonly {
        readonly kind: 'project' | 'character' | 'world';
        readonly label: string;
        readonly onInvoke?: () => void | Promise<void>;
        readonly disabled?: boolean;
        readonly disabledReason?: string;
      }[];
      entryPromptMenu?: 'roleplay' | null;
      onEntryPromptMenuChange?: (menu: 'roleplay' | null) => void;
      selectedCharacterLaunches?: readonly import('./ChatView/InputArea/types').SelectedCharacterLaunch[];
      onAddCharacterLaunch?: (
        selection: import('./ChatView/InputArea/types').SelectedCharacterLaunch,
      ) => void;
      onRemoveCharacterLaunch?: (characterVersionId: string) => void;
      entryCharacterConversationMode?: import('./ChatView/InputArea/types').CharacterConversationMode;
      onEntryCharacterConversationModeChange?: (
        mode: import('./ChatView/InputArea/types').CharacterConversationMode,
      ) => void;
      entryCharacterConversationModeDisabled?: boolean;
    }) => {
      const {
        isBusy,
        modelCatalogStatus,
        onRequestFiles,
        selectedModel,
        inputCatalog = [],
        mediaModelSelection,
        mediaUnderstandingModels,
        contextChips,
        onAddContextChip,
        onRemoveContextChip,
        mentionItems = [],
      } = useInputAreaContext();
      return (
        <div>
          <span data-testid="entry-selected-model">{selectedModel}</span>
          <span data-testid="entry-config-state">{`${modelCatalogStatus}:${String(isBusy)}`}</span>
          <span data-testid="entry-media-models">
            {Object.values(mediaModelSelection).join('|')}
          </span>
          <span data-testid="entry-media-understanding">
            {mediaUnderstandingModels?.audio.optionId ?? mediaUnderstandingModels?.audio.status}
          </span>
          <input
            placeholder="Type anything..."
            value={props.inputValue}
            disabled={props.disabled}
            onChange={(event) => {
              const value = event.currentTarget.value;
              props.onInputChange(value);
              if (value.startsWith('@')) {
                onRequestFiles?.(value.slice(1));
              }
            }}
          />
          <button
            type="button"
            disabled={
              props.disabled ||
              props.submissionBlocked ||
              props.submissionBlockedReason !== undefined
            }
            onClick={() => props.onSend()}
          >
            Send
          </button>
          <button
            type="button"
            data-testid="send-workspace-first-attachment"
            disabled={
              props.disabled ||
              props.submissionBlocked ||
              props.submissionBlockedReason !== undefined
            }
            onClick={() =>
              props.onSend({
                messageText: props.inputValue,
                displayMessageText: props.inputValue,
                sessionMode: 'agent',
                attachments: [{ id: 'attachment-1', name: 'reference.png', type: 'image' }],
                fileReferences: [
                  {
                    id: 'reference-1',
                    label: 'reference.png',
                    mediaType: 'image',
                    contentLocator: { kind: 'workspace-file', path: 'reference.png' },
                  },
                ],
              })
            }
          >
            Send workspace first attachment
          </button>
          {props.entryContextActions?.map((action) => (
            <button
              key={action.kind}
              type="button"
              disabled={action.disabled || !action.onInvoke}
              title={action.disabledReason}
              data-entry-context-action={action.kind}
              onClick={() => void action.onInvoke?.()}
            >
              {action.label}
            </button>
          ))}
          {props.submissionBlockedReason ? (
            <span data-testid="entry-submission-blocked">{props.submissionBlockedReason}</span>
          ) : null}
          <button
            type="button"
            onClick={() =>
              onAddContextChip?.({
                type: 'entity',
                id: 'entity:character:xiaoju',
                label: '小橘',
                summary: 'Entity · character',
                data: {
                  entityId: 'xiaoju',
                  entityKind: 'character',
                  catalogEntryId: 'mention:character:xiaoju',
                  ownerKind: 'assistant',
                  ownerId: 'assistant:1',
                  bindingReceiptId: 'binding:test',
                },
              })
            }
          >
            Select Entity Mention
          </button>
          <button type="button" onClick={() => onRemoveContextChip('entity:character:xiaoju')}>
            Remove Entity Mention
          </button>
          <span data-testid="entry-context-chips">
            {contextChips.map((payload) => payload.label).join('|')}
          </span>
          <span data-testid="entry-input-catalog">
            {inputCatalog.map((entry) => `${entry.prefix}${entry.name}`).join('|')}
          </span>
          {mentionItems
            .filter((item) => item.characterLaunchSelection)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  props.onAddCharacterLaunch?.({
                    ...item.characterLaunchSelection!,
                    label: item.label,
                  })
                }
              >
                Select Character {item.label}
              </button>
            ))}
          <span data-testid="entry-character-launches">
            {props.selectedCharacterLaunches?.map((selection) => selection.label).join('|') ?? ''}
          </span>
          {props.entryCharacterConversationMode ? (
            <button
              type="button"
              disabled={props.entryCharacterConversationModeDisabled}
              onClick={() => props.onEntryCharacterConversationModeChange?.('narrative')}
            >
              Conversation mode:{' '}
              {props.entryCharacterConversationMode === 'companion' ? 'Daily' : 'Narrative'}
            </button>
          ) : null}
          {props.selectedCharacterLaunches?.map((selection) => (
            <button
              key={selection.characterVersionId}
              type="button"
              onClick={() => props.onRemoveCharacterLaunch?.(selection.characterVersionId)}
            >
              Remove Character {selection.label}
            </button>
          ))}
          <span data-testid="entry-page-menu">{props.entryPromptMenu ?? 'none'}</span>
          <button type="button" onClick={() => props.onEntryPromptMenuChange?.(null)}>
            Close Entry Menu
          </button>
        </div>
      );
    },
  };
});

describe('ConversationController entry state', () => {
  it('keeps Home modes in Draft configuration and out of management Scene navigation', () => {
    expect(conversationControllerSource).toContain('HomeExperienceQuickActions');
    expect(conversationControllerSource).toContain('entryMode');
    expect(conversationControllerSource).not.toContain('start-chat');
    expect(conversationControllerSource).toContain('.configureEntryTarget(');
    expect(conversationControllerSource).not.toContain('.bindTarget(');
    expect(conversationControllerSource).not.toContain('open-project-management');
    expect(conversationControllerSource).not.toContain('open-character-management');
    expect(conversationControllerSource).not.toContain('EntryContextOverlay');
    expect(conversationControllerSource).toContain('handleEntryChooseProject');
    expect(authoringTargetSelectorSource).not.toContain('onChooseDirectory');
    expect(authoringTargetSelectorSource).not.toContain('agent-entry-context-current');
    expect(authoringTargetSelectorSource).not.toContain('chat.entryContext.currentTarget');
  });

  it('projects a global Host error through the renderer body portal', () => {
    render(<ConversationController {...createProps()} />);

    act(() => {
      hostRuntimeMocks.listener?.({
        type: 'globalError',
        message: 'Desktop Agent failed globally.',
      });
    });

    const alert = screen.getByRole('alert');
    expect(alert.parentElement).toBe(document.body);
    expect(alert.getAttribute('data-agent-diagnostic-toast')).toBe('true');
    expect(alert.textContent).toContain('Desktop Agent failed globally.');
  });

  it('keeps the existing entry controller and controls available in draft presentation', () => {
    vi.clearAllMocks();
    const composer = createComposerProjection('composer-1', {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    });
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'workspace',
          label: 'OpenNeko',
          workspaceId: 'workspace-1',
          loadCanvasCatalog: async () => ({
            workspaceId: 'workspace-1',
            defaultTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
            options: [
              {
                target: { kind: 'workspace-board', workspaceId: 'workspace-1' },
                label: 'Workspace Board',
              },
            ],
            diagnostics: [],
          }),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={composer}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    expect(screen.getByTestId('header')).toBeTruthy();
    expect(screen.getByText('Hi, create with chat')).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByTestId('entry-config-state').textContent).toBe('ready:false');
    expect(hostMocks.getConversations).toHaveBeenCalledTimes(1);
    expect(hostMocks.getActiveConversation).toHaveBeenCalledTimes(1);
    expect(hostMocks.getTabState).toHaveBeenCalledTimes(1);
    expect(hostMocks.refreshConfigSnapshot).toHaveBeenCalledTimes(1);
    expect(hostMocks.getAgentComposerInputCatalog).toHaveBeenCalledTimes(1);
    expect(hostMocks.getAgentStates).toHaveBeenCalledTimes(1);
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'storyboard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose Project' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '@hero' } });
    expect(hostMocks.searchProjectFiles).toHaveBeenCalledWith('hero', undefined, {
      purpose: 'entry',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select Entity Mention' }));
    expect(screen.getByTestId('entry-context-chips').textContent).toContain('小橘');
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('accepts only the exact Composer catalog identity for `$` and `/` input', () => {
    vi.clearAllMocks();
    const composer = createComposerProjection('composer-workspace-catalog', {
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    });
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'workspace',
          label: 'OpenNeko',
          workspaceId: 'workspace-1',
          loadCanvasCatalog: async () => ({
            workspaceId: 'workspace-1',
            defaultTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
            options: [],
            diagnostics: [],
          }),
        }}
      >
        <ConversationController {...createProps()} agentPresentation={composer} />
      </ComposerWorkspaceProvider>,
    );

    act(() => {
      hostRuntimeMocks.listener?.({
        type: 'agentComposerInputCatalog',
        composerId: 'composer-foreign',
        phase: 'composer',
        bindingKind: 'workspace',
        entries: [createDraftSkillCatalogEntry('foreign')],
      });
    });
    expect(screen.getByTestId('entry-input-catalog').textContent).toBe('');

    act(() => {
      hostRuntimeMocks.listener?.({
        type: 'agentComposerInputCatalog',
        composerId: composer.composerId,
        phase: 'composer',
        bindingKind: 'workspace',
        entries: [createDraftSkillCatalogEntry('storyboard')],
      });
    });
    expect(screen.getByTestId('entry-input-catalog').textContent).toBe('$storyboard');
  });

  it('sends the first Workspace turn through canonical Conversation and preserves attachments', async () => {
    vi.clearAllMocks();
    const composer = createComposerProjection('composer-workspace-initial', {
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    });
    const foreignEntryReceipt = {
      targetReceiptId: 'entry-target:foreign',
      draftId: 'draft-entry-foreign',
      connectionId: 'connection-entry-foreign',
      mode: 'authoring' as const,
      binding: {
        kind: 'authoring' as const,
        workspaceId: 'workspace-entry',
        workspaceGrantId: 'workspace-grant-entry',
        authority: { kind: 'project' as const, projectId: 'project-entry' },
        target: null,
      },
    };
    hostMocks.readEntryIntent.mockReturnValue({
      mode: 'authoring',
      targetReceipt: foreignEntryReceipt,
    });

    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'workspace',
          label: 'OpenNeko',
          workspaceId: 'workspace-1',
          loadCanvasCatalog: async () => ({
            workspaceId: 'workspace-1',
            defaultTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
            options: [
              {
                target: { kind: 'workspace-board', workspaceId: 'workspace-1' },
                label: 'Workspace Board',
              },
            ],
            diagnostics: [],
          }),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={composer}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    expect(hostMocks.createConversation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Continue in Workspace' } });
    fireEvent.click(screen.getByTestId('send-workspace-first-attachment'));

    await waitFor(() => expect(hostMocks.createConversation).toHaveBeenCalledTimes(1));
    expect(hostMocks.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { kind: 'message', text: 'Continue in Workspace' },
        sessionMode: 'agent',
        chatModel: {
          providerId: 'test',
          modelId: 'test-model',
          category: 'llm',
        },
        attachments: [{ id: 'attachment-1', name: 'reference.png', type: 'image' }],
        fileReferences: [
          expect.objectContaining({
            id: 'reference-1',
            contentLocator: { kind: 'workspace-file', path: 'reference.png' },
          }),
        ],
      }),
    );
    expect(hostMocks.submitDraft).not.toHaveBeenCalled();
    expect(hostMocks.readEntryIntent).not.toHaveBeenCalled();
    expect(hostMocks.configureEntryTarget).not.toHaveBeenCalled();
    expect(hostRuntimeMocks.setState).not.toHaveBeenCalled();
    expect(hostMocks.readLaunchCatalog).not.toHaveBeenCalled();

    act(() => {
      hostRuntimeMocks.listener?.({
        type: 'tabState',
        tabState: {
          openTabs: [
            {
              id: 'tab-workspace-initial',
              title: 'Workspace',
              conversationId: 'conversation-workspace-initial',
            },
          ],
          activeTabId: 'tab-workspace-initial',
        },
      });
    });

    await waitFor(() => {
      expect(hostMocks.getSettings).toHaveBeenCalledWith('conversation-workspace-initial');
      expect(hostMocks.getAgentInputCatalog).toHaveBeenCalledWith('conversation-workspace-initial');
    });
    expect(hostMocks.createConversation).toHaveBeenCalledTimes(1);
  });

  it('projects the compact composer into Desktop dock conversation tabs', async () => {
    vi.clearAllMocks();
    const composer = createComposerProjection('composer-workspace-compact', {
      kind: 'workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
    });
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'workspace',
          label: 'OpenNeko',
          workspaceId: 'workspace-1',
          loadCanvasCatalog: async () => ({
            workspaceId: 'workspace-1',
            defaultTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
            options: [],
            diagnostics: [],
          }),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={composer}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Start chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    act(() => {
      hostRuntimeMocks.listener?.({
        type: 'tabState',
        tabState: {
          openTabs: [
            {
              id: 'tab-desktop',
              title: 'Desktop Chat',
              conversationId: 'conversation-desktop',
            },
          ],
          activeTabId: 'tab-desktop',
        },
      });
    });

    await waitFor(() =>
      expect(
        document
          .querySelector('[data-testid^="workspace-runtime-"]')
          ?.getAttribute('data-composer-presentation'),
      ).toBe('compact'),
    );
    expect(hostMocks.createConversation).toHaveBeenCalledTimes(1);
    expect(hostMocks.submitDraft).not.toHaveBeenCalled();
  });

  it('submits an unbound Entry Draft without an explicit Assistant selection', async () => {
    vi.clearAllMocks();
    const launchCatalog = createDraftLaunchCatalog('draft-default-assistant', { kind: 'unbound' });
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.submitDraft.mockResolvedValueOnce({
      session: {
        phase: 'session',
        conversationId: 'conversation-default-assistant',
        binding: {
          kind: 'assistant',
          assistantSpaceId: 'assistant-space:local-user',
          baseGrantIds: [],
        },
      },
      turnId: 'turn-default-assistant',
      turnStatus: 'running',
    });
    render(
      <ConversationController {...createProps()} agentPresentation={launchCatalog.interaction} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Start directly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(hostMocks.submitDraft).toHaveBeenCalledOnce());
    expect(hostMocks.submitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ binding: { kind: 'unbound' }, bindingReceipt: null }),
        input: { kind: 'message', text: 'Start directly' },
      }),
    );
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('adds one exact Workspace Project to Creation context and preserves the draft text', async () => {
    vi.clearAllMocks();
    const launchCatalog = createDraftLaunchCatalog('draft-mode-config', { kind: 'unbound' });
    const onSelectProject = vi.fn(async () => ({
      label: 'OpenNeko',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
      authority: { kind: 'project' as const, projectId: 'project-1' },
    }));
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.bindTarget.mockResolvedValue(launchCatalog);

    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [{ projectId: 'project-1', label: 'OpenNeko' }],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject,
        }}
      >
        <ConversationController {...createProps()} agentPresentation={launchCatalog.interaction} />
      </ComposerWorkspaceProvider>,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'preserve this request' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Creation' }));

    await waitFor(() =>
      expect(hostMocks.configureEntryTarget).toHaveBeenCalledWith('authoring', undefined),
    );
    expect(input).toHaveProperty('value', 'preserve this request');
    expect(screen.getByRole('tab', { name: 'Creation' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Choose Project' })).toBeTruthy();
    expect(screen.queryByTestId('entry-character-launches')?.textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Choose World' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /OpenNeko/u }));
    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith('project-1'));
    expect(hostMocks.configureEntryTarget).toHaveBeenLastCalledWith('authoring', {
      kind: 'authoring',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant-1',
      authority: { kind: 'project', projectId: 'project-1' },
      target: null,
    });
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('keeps Draft input editable while configuration blocks only submit', () => {
    vi.clearAllMocks();
    const launchCatalog = createDraftLaunchCatalog('draft-config-pending', { kind: 'unbound' });
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    render(
      <ConversationController
        {...createProps({ hasConfigSnapshot: false })}
        agentPresentation={launchCatalog.interaction}
      />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveProperty('disabled', false);
    fireEvent.change(input, { target: { value: 'Keep editing' } });
    expect(input).toHaveProperty('value', 'Keep editing');
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
    expect(screen.queryByTestId('entry-submission-blocked')).toBeNull();
    expect(hostMocks.submitDraft).not.toHaveBeenCalled();
  });

  it('binds multiple Characters and one World into one exact World Experience receipt', async () => {
    vi.clearAllMocks();
    const launchCatalog = createDraftLaunchCatalog('draft-character-launch', { kind: 'unbound' });
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.loadCharacterDialogueTargets.mockResolvedValue([
      {
        globalCharacterId: 'character-project-a',
        characterVersionId: 'character-version-a',
        displayName: 'A',
        versionLabel: 'Published A',
        lineage: {
          coverage: 'complete',
          state: 'declared-root',
          isHead: true,
          path: [{ characterVersionId: 'character-version-a', label: 'Published A' }],
        },
        storylines: [],
      },
      {
        globalCharacterId: 'character-project-b',
        characterVersionId: 'character-version-b',
        displayName: 'B',
        versionLabel: 'Published B',
        lineage: {
          coverage: 'complete',
          state: 'declared-root',
          isHead: true,
          path: [{ characterVersionId: 'character-version-b', label: 'Published B' }],
        },
        storylines: [],
      },
    ]);
    hostMocks.loadWorldExperienceTargets.mockResolvedValue([
      {
        globalWorldId: 'global-world-a',
        worldVersionId: 'world-version-a',
        displayName: 'World A',
        versionLabel: 'Published World A',
      },
    ]);
    hostMocks.submitDraft.mockResolvedValue({
      conversationId: 'conversation:character-a',
      turnStatus: 'accepted',
      projectionStatus: 'ready',
    });
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
        }}
      >
        <ConversationController {...createProps()} agentPresentation={launchCatalog.interaction} />
      </ComposerWorkspaceProvider>,
    );

    const chooseCharacters = screen.getByRole('button', { name: 'Choose Characters' });
    const chooseWorld = screen.getByRole('button', { name: 'Choose World' });
    expect(chooseCharacters.getAttribute('title')).toBeNull();
    expect(chooseWorld.getAttribute('title')).toBeNull();
    expect(chooseWorld).toHaveProperty('disabled', false);
    fireEvent.click(chooseCharacters);

    await waitFor(() => {
      const quickToggle = screen
        .getAllByRole('button', { name: 'Choose Characters' })
        .find((element) => element.classList.contains('agent-entry-quick-toggle'));
      expect(quickToggle?.getAttribute('aria-expanded')).toBe('true');
    });

    const characterA = await waitFor(() => screen.getByText('Published A').closest('button'));
    expect(characterA).not.toBeNull();
    if (!characterA) throw new Error('Character target button is unavailable.');
    fireEvent.click(characterA);
    await waitFor(() =>
      expect(hostMocks.configureEntryTarget).toHaveBeenLastCalledWith('character-dialogue', {
        kind: 'character-dialogue',
        mode: 'companion',
        participants: [
          {
            globalCharacterId: 'character-project-a',
            characterVersionId: 'character-version-a',
          },
        ],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Conversation mode: Daily' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Conversation mode: Narrative' })).toBeTruthy(),
    );

    fireEvent.click(chooseWorld);
    const worldA = await waitFor(() => screen.getByText('World A').closest('button'));
    expect(worldA).not.toBeNull();
    if (!worldA) throw new Error('World target button is unavailable.');
    fireEvent.click(worldA);
    await waitFor(() =>
      expect(hostMocks.configureEntryTarget).toHaveBeenLastCalledWith('world-experience', {
        kind: 'world-experience',
        globalWorldId: 'global-world-a',
        worldVersionId: 'world-version-a',
        participants: [
          {
            globalCharacterId: 'character-project-a',
            characterVersionId: 'character-version-a',
          },
        ],
        launch: { kind: 'new' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose Characters' }));
    const characterB = await waitFor(() => screen.getByText('Published B').closest('button'));
    expect(characterB).not.toBeNull();
    if (!characterB) throw new Error('Second Character target button is unavailable.');
    fireEvent.click(characterB);
    await waitFor(() =>
      expect(hostMocks.configureEntryTarget).toHaveBeenLastCalledWith('world-experience', {
        kind: 'world-experience',
        globalWorldId: 'global-world-a',
        worldVersionId: 'world-version-a',
        participants: [
          {
            globalCharacterId: 'character-project-a',
            characterVersionId: 'character-version-a',
          },
          {
            globalCharacterId: 'character-project-b',
            characterVersionId: 'character-version-b',
          },
        ],
        launch: { kind: 'new' },
      }),
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Speak together' } });
    const sendButton = screen.getByRole('button', { name: 'Send' });
    await waitFor(() => expect(sendButton).toHaveProperty('disabled', false));
    fireEvent.click(sendButton);

    await waitFor(() => expect(hostMocks.submitDraft).toHaveBeenCalledOnce());
    expect(hostMocks.submitDraft.mock.calls[0]?.[0]).toMatchObject({
      entryTargetReceipt: {
        mode: 'world-experience',
        binding: {
          kind: 'world-experience',
          globalWorldId: 'global-world-a',
          worldVersionId: 'world-version-a',
          participants: [
            {
              globalCharacterId: 'character-project-a',
              characterVersionId: 'character-version-a',
            },
            {
              globalCharacterId: 'character-project-b',
              characterVersionId: 'character-version-b',
            },
          ],
          launch: { kind: 'new' },
        },
      },
    });
    expect(hostMocks.bindTarget).not.toHaveBeenCalled();
  });

  it('does not route unbound Entry @ discovery through Workspace search', () => {
    vi.clearAllMocks();
    const launchCatalog = createDraftLaunchCatalog('draft-unbound-mention', { kind: 'unbound' });
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    render(
      <ConversationController {...createProps()} agentPresentation={launchCatalog.interaction} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '@story' } });

    expect(hostMocks.searchProjectFiles).not.toHaveBeenCalled();
  });

  it('restores Draft presentation state while retaining authoritative Host configuration', () => {
    vi.clearAllMocks();
    hostRuntimeMocks.getState.mockReturnValue({
      drafts: [],
      entryDraft: {
        draftId: 'draft-restored',
        inputValue: 'restored entry text',
        contextReferences: [
          {
            type: 'file',
            id: 'grant-restored',
            label: 'brief.txt',
            summary: 'Authorized file: brief.txt',
            data: { resourceGrantId: 'grant-restored', resourceKind: 'file' },
          },
        ],
        characterLaunches: [
          {
            globalCharacterId: 'stale-character-project',
            characterVersionId: 'stale-character-version',
            label: 'Stale Character',
          },
        ],
        workspaceTarget: {
          label: 'Stale Workspace',
          context: {
            kind: 'workspace',
            workspaceId: 'stale-workspace',
            workspaceGrantId: 'stale-grant',
          },
          target: { kind: 'content-document', documentId: 'documents/stale.md' },
          authority: { kind: 'project', projectId: 'stale-project' },
        },
        selectedModel: 'test-model',
        mediaModelSelection: {
          image: 'nekoapi-media:gpt-image-2',
          video: 'none',
          audio: 'nekoapi-media:audio-1',
        },
        executionMode: 'auto',
      },
    });
    const settings = createSettings();
    render(
      <ConversationController
        {...createProps({
          settings: {
            ...settings,
            chatModelOptions: [
              ...settings.chatModelOptions,
              {
                id: 'nekoapi-media:gpt-image-2',
                label: 'GPT Image 2',
                providerId: 'nekoapi-media',
                modelId: 'gpt-image-2',
                category: 'image',
              },
              {
                id: 'nekoapi-media:audio-1',
                label: 'Audio 1',
                providerId: 'nekoapi-media',
                modelId: 'audio-1',
                category: 'audio',
              },
            ],
          },
        })}
        agentPresentation={createDraftProjection('draft-restored', {
          kind: 'unbound',
        })}
        emptyStatePresentation="desktop-dock"
      />,
    );

    expect(screen.getByRole('textbox')).toHaveProperty('value', 'restored entry text');
    expect(screen.getByTestId('entry-context-chips').textContent).toContain('brief.txt');
    expect(screen.getByTestId('entry-character-launches').textContent).toBe('');
    expect(screen.getByTestId('entry-selected-model').textContent).toBe('test-model');
    expect(screen.getByTestId('entry-media-models').textContent).toBe(
      'nekoapi-media:gpt-image-2|none|nekoapi-media:audio-1',
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited entry text' } });

    expect(hostRuntimeMocks.setState).toHaveBeenLastCalledWith({
      drafts: [],
      entryDraft: expect.objectContaining({
        draftId: 'draft-restored',
        inputValue: 'edited entry text',
        selectedModel: 'test-model',
        mediaModelSelection: {
          image: 'nekoapi-media:gpt-image-2',
          video: 'none',
          audio: 'nekoapi-media:audio-1',
        },
        executionMode: 'ask',
      }),
    });
    hostRuntimeMocks.getState.mockReturnValue(undefined);
  });

  it('isolates stale restored media selections and reapplies an available configured default', () => {
    vi.clearAllMocks();
    hostRuntimeMocks.getState.mockReturnValue({
      drafts: [],
      entryDraft: {
        draftId: 'draft-stale-media-model',
        inputValue: 'keep this draft',
        contextReferences: [],
        characterLaunches: [],
        selectedModel: 'test-model',
        mediaModelSelection: {
          image: 'removed:image-model',
          video: 'removed:video-model',
          audio: 'removed:audio-model',
        },
        executionMode: 'ask',
      },
    });
    const settings = createSettings();
    render(
      <ConversationController
        {...createProps({
          settings: {
            ...settings,
            chatModelOptions: [
              ...settings.chatModelOptions,
              {
                id: 'current:image-model',
                label: 'Current Image',
                providerId: 'current',
                modelId: 'image-model',
                category: 'image',
              },
            ],
            defaultMediaModels: { image: 'current:image-model' },
          },
        })}
        agentPresentation={createDraftProjection('draft-stale-media-model', {
          kind: 'unbound',
        })}
      />,
    );

    expect(screen.getByRole('textbox')).toHaveProperty('value', 'keep this draft');
    expect(screen.getByTestId('entry-media-models').textContent).toBe(
      'current:image-model|none|none',
    );
    expect(hostRuntimeMocks.setState).toHaveBeenLastCalledWith({
      drafts: [],
      entryDraft: expect.objectContaining({
        draftId: 'draft-stale-media-model',
        inputValue: 'keep this draft',
        mediaModelSelection: {
          image: 'current:image-model',
          video: 'none',
          audio: 'none',
        },
      }),
    });
    hostRuntimeMocks.getState.mockReturnValue(undefined);
  });

  it('submits an exactly bound Assistant Draft through typed input intent', async () => {
    vi.clearAllMocks();
    const launchCatalog = createBoundAssistantLaunchCatalog('draft-entry-1');
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.submitDraft.mockResolvedValue({
      session: {
        phase: 'session',
        conversationId: 'conversation-entry-1',
        binding: launchCatalog.interaction.binding,
      },
      turnId: 'turn-entry-1',
      turnStatus: 'running',
    });
    render(
      <ConversationController
        {...createProps()}
        agentPresentation={launchCatalog.interaction}
        emptyStatePresentation="desktop-dock"
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Help with this idea' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await act(async () => undefined);
    expect(hostMocks.submitDraft).toHaveBeenCalledWith({
      draft: launchCatalog.interaction,
      entryTargetReceipt: null,
      input: { kind: 'message', text: 'Help with this idea' },
      references: [],
      resourceGrantIds: [],
      configuration: {
        modelCatalogEntryId: 'test-model',
        providerId: 'test',
        modelId: 'test-model',
        executionMode: 'ask',
        temperature: 0.2,
        maximumOutputTokens: 8_192,
        thinkingBudget: 0,
      },
    });
    await waitFor(() => expect(hostRuntimeMocks.setState).toHaveBeenLastCalledWith({ drafts: [] }));
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('submits the exact configured Authoring target receipt', async () => {
    vi.clearAllMocks();
    const launchCatalog = {
      ...createDraftLaunchCatalog('draft-authoring-submit', {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      }),
      inputs: [
        {
          ...createDraftSkillCatalogEntry('character-creator', 'workspace'),
        },
      ],
    };
    const targetReceipt = {
      targetReceiptId: 'target-receipt:authoring-1',
      draftId: launchCatalog.interaction.draftId,
      connectionId: launchCatalog.connection.connectionId,
      mode: 'authoring' as const,
      binding: {
        kind: 'authoring' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
        authority: { kind: 'project' as const, projectId: 'project-1' },
        target: { kind: 'character-project' as const, characterProjectId: 'character-1' },
      },
    };
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.readEntryIntent.mockReturnValue({ mode: 'authoring', targetReceipt });
    hostMocks.submitDraft.mockResolvedValue({
      session: {
        phase: 'session',
        conversationId: 'conversation-authoring-1',
        binding: launchCatalog.interaction.binding,
      },
      turnId: 'turn-authoring-1',
      turnStatus: 'running',
    });
    render(
      <ConversationController
        {...createProps()}
        agentPresentation={launchCatalog.interaction}
        emptyStatePresentation="desktop-dock"
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '$character-creator Refine this character' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(hostMocks.submitDraft).toHaveBeenCalledOnce());
    expect(hostMocks.submitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: launchCatalog.interaction,
        entryTargetReceipt: targetReceipt,
        input: expect.objectContaining({
          kind: 'skill',
          skillName: 'character-creator',
          args: 'Refine this character',
        }),
      }),
    );
  });

  it('submits the configured image generation model with the Entry Draft', async () => {
    vi.clearAllMocks();
    const launchCatalog = createBoundAssistantLaunchCatalog('draft-image-purpose');
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.submitDraft.mockResolvedValue({
      session: {
        phase: 'session',
        conversationId: 'conversation-image-purpose',
        binding: launchCatalog.interaction.binding,
      },
      turnId: 'turn-image-purpose',
      turnStatus: 'running',
    });
    render(
      <ConversationController
        {...createProps({
          settings: {
            ...createSettings(),
            chatModelOptions: [
              ...createSettings().chatModelOptions,
              {
                id: 'image-provider:image-model',
                providerId: 'image-provider',
                modelId: 'image-model',
                label: 'Image Model',
                category: 'image',
                capabilities: ['text_to_image'],
              },
            ],
            defaultMediaModels: { image: 'image-provider:image-model' },
          },
        })}
        agentPresentation={launchCatalog.interaction}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('entry-media-models').textContent).toBe(
        'image-provider:image-model|none|none',
      ),
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Generate a portrait' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(hostMocks.submitDraft).toHaveBeenCalledOnce());
    expect(hostMocks.submitDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        purposeModels: {
          'image.generate': {
            providerId: 'image-provider',
            modelId: 'image-model',
            category: 'image',
          },
        },
      }),
    );
  });

  it('reports a Session-only command in Draft without submitting or creating a Turn', async () => {
    vi.clearAllMocks();
    const launchCatalog = {
      ...createBoundAssistantLaunchCatalog('draft-session-command'),
      inputs: [
        {
          id: 'command:builtin:compact',
          name: 'compact',
          description: 'Compact the exact Conversation',
          trigger: 'command' as const,
          prefix: '/' as const,
          phaseRequirement: 'session' as const,
          bindingRequirement: 'any' as const,
          source: { kind: 'builtin' as const, sourceId: 'compact' },
          availability: {
            status: 'unavailable' as const,
            diagnostic: {
              code: 'session-required',
              owner: 'agent-runtime',
              message: 'Command /compact requires an exact Conversation.',
            },
          },
          executable: {
            kind: 'command' as const,
            commandId: 'compact',
            handlerId: 'builtin:compact',
          },
        },
      ],
    };
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={launchCatalog.interaction}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/compact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        '[agent-runtime/session-required] Command /compact requires an exact Conversation.',
      ),
    );
    expect(hostMocks.submitDraft).not.toHaveBeenCalled();
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveProperty('value', '/compact');
  });

  it('preserves the complete Entry Draft when local submit fails', async () => {
    vi.clearAllMocks();
    const launchCatalog = createBoundAssistantLaunchCatalog('draft-entry-failed');
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.submitDraft.mockRejectedValueOnce(new Error('Conversation persistence failed.'));
    render(
      <ConversationController
        {...createProps()}
        agentPresentation={launchCatalog.interaction}
        emptyStatePresentation="desktop-dock"
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select Entity Mention' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Conversation persistence failed.'),
    );
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Keep this request');
    expect(screen.getByTestId('entry-context-chips').textContent).toContain('小橘');
    expect(hostRuntimeMocks.setState).toHaveBeenLastCalledWith({
      drafts: [],
      entryDraft: expect.objectContaining({
        draftId: 'draft-entry-failed',
        inputValue: 'Keep this request',
        contextReferences: [expect.objectContaining({ id: 'entity:character:xiaoju' })],
        selectedModel: 'test-model',
        executionMode: 'ask',
      }),
    });
  });

  it('keeps unavailable Character and Room selection out of the Entry Draft', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps()}
        agentPresentation={createDraftProjection('draft-entry-character', {
          kind: 'unbound',
        })}
        emptyStatePresentation="desktop-dock"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Character / Room' })).toBeNull();
    expect(screen.getByTestId('entry-page-menu').textContent).toBe('none');
    expect(hostMocks.searchProjectFiles).not.toHaveBeenCalled();
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('keeps Character Dialogue out of the visible Entry choices', () => {
    vi.clearAllMocks();
    const launchCatalog = createDraftLaunchCatalog('draft-entry-roleplay', { kind: 'unbound' });
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={launchCatalog.interaction}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    expect(screen.queryByRole('tab', { name: 'Character Dialogue' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'World Experience' })).toBeNull();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Conversation',
      'Creation',
    ]);
    expect(hostMocks.configureEntryTarget).not.toHaveBeenCalled();
    expect(hostMocks.searchProjectFiles).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry-page-menu').textContent).toBe('none');
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('removes Entry Draft owner choices after Workspace activation', () => {
    render(
      <ConversationController
        {...createProps()}
        agentPresentation={createDraftProjection('draft-workspace-1', {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant-1',
        })}
        emptyStatePresentation="desktop-dock"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Start creating' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Conversation' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Creation' })).toBeNull();
  });

  it('resets prior presentation state when the same controller receives a fresh draft identity', () => {
    vi.clearAllMocks();
    const props = createProps();
    const firstDraft = createDraftProjection('draft-old', {
      kind: 'assistant',
      assistantSpaceId: 'assistant:1',
      baseGrantIds: [],
    });
    const view = render(
      <ConversationController
        {...props}
        agentPresentation={firstDraft}
        emptyStatePresentation="desktop-dock"
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'old draft input' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select Entity Mention' }));
    const retainedModel = screen.getByTestId('entry-selected-model').textContent;
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'sessionDiagnostic',
            code: 'conversation-durability-failed',
            severity: 'error',
            message: 'Old presentation error.',
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [{ id: 'tab-old', title: 'Old Chat', conversationId: 'conversation-old' }],
              activeTabId: 'tab-old',
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: {
              id: 'conversation-old',
              title: 'Old Chat',
              messages: [message('message-old', 'old transcript')],
            },
          },
        }),
      );
    });
    expect(document.querySelector('[data-testid^="workspace-runtime-"]')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Old presentation error.');

    view.rerender(
      <ConversationController
        {...props}
        agentPresentation={createDraftProjection('draft-new', {
          kind: 'unbound',
        })}
        emptyStatePresentation="desktop-dock"
      />,
    );

    expect(document.querySelector('[data-testid^="workspace-runtime-"]')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
    expect(screen.getByTestId('entry-context-chips').textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('entry-selected-model').textContent).toBe(retainedModel);
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('keeps explicit Desktop Skill invocation in the Composer instead of rendering Skill cards', () => {
    const launchCatalog = {
      ...createBoundAssistantLaunchCatalog('draft-skill-prefill'),
      inputs: [createDraftSkillCatalogEntry('storyboard', 'any')],
    };
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={launchCatalog.interaction}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Skills' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^storyboard/u })).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '$storyboard ' } });

    expect(screen.getByRole('textbox')).toHaveProperty('value', '$storyboard ');
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('does not render builtin Skill descriptions as entry cards', () => {
    const builtinCharacterCreator = {
      ...createDraftSkillCatalogEntry('character-creator', 'workspace'),
      id: 'skill:builtin:character-creator',
      description: 'Canonical portable description',
      source: { kind: 'builtin' as const, sourceId: 'character-creator' },
      executable: {
        kind: 'skill' as const,
        skillName: 'character-creator',
        activationId: 'skill:builtin:character-creator',
      },
    };
    const launchCatalog = {
      ...createDraftLaunchCatalog('draft-localized-skill', {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      }),
      inputs: [builtinCharacterCreator],
    };
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);

    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={launchCatalog.interaction}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    expect(screen.queryByText('Create a localized character draft.')).toBeNull();
    expect(screen.queryByText('Canonical portable description')).toBeNull();
    expect(screen.queryByRole('button', { name: /^character-creator/u })).toBeNull();
  });

  it('submits builtin creator Skills from Assistant Entry without creating a Project target', async () => {
    vi.clearAllMocks();
    const launchCatalog = {
      ...createDraftLaunchCatalog('draft-character-creator', { kind: 'unbound' }),
      inputs: [
        {
          ...createDraftSkillCatalogEntry('character-creator', 'any'),
          id: 'skill:builtin:character-creator',
          source: { kind: 'builtin' as const, sourceId: 'character-creator' },
        },
      ],
    };
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.submitDraft.mockResolvedValueOnce({
      session: {
        phase: 'session',
        conversationId: 'conversation-global-character-creator',
        binding: {
          kind: 'assistant',
          assistantSpaceId: 'assistant:default',
          baseGrantIds: [],
        },
      },
      turnId: 'turn-global-character-creator',
      turnStatus: 'running',
    });
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
          loadAuthoringCatalog: vi.fn(async () => ({
            targets: [],
            creationContexts: [],
            diagnostics: [],
          })),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={launchCatalog.interaction}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, {
      target: { value: '$character-creator 保留这段完整角色提示词' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(hostMocks.submitDraft).toHaveBeenCalledOnce());
    expect(hostMocks.configureEntryTarget).not.toHaveBeenCalled();
    expect(hostMocks.submitDraft.mock.calls[0]?.[0]).toMatchObject({
      entryTargetReceipt: null,
      input: {
        kind: 'skill',
        skillName: 'character-creator',
        args: '保留这段完整角色提示词',
      },
    });
  });

  it('creates one exact Project target before submitting builtin creator Skills', async () => {
    vi.clearAllMocks();
    const builtinWorldCreator = {
      ...createDraftSkillCatalogEntry('world-creator', 'any'),
      id: 'skill:builtin:world-creator',
      source: { kind: 'builtin' as const, sourceId: 'world-creator' },
      executable: {
        kind: 'skill' as const,
        skillName: 'world-creator',
        activationId: 'skill:builtin:world-creator',
      },
    };
    let currentCatalog = {
      ...createDraftLaunchCatalog('draft-world-creator', { kind: 'unbound' as const }),
      inputs: [builtinWorldCreator],
    };
    let currentIntent: import('@neko/agent-contracts').AgentEntryIntentProjection = {
      mode: 'assistant',
      targetReceipt: null,
    };
    hostMocks.readLaunchCatalog.mockImplementation(() => currentCatalog);
    hostMocks.readEntryIntent.mockImplementation(() => currentIntent);
    hostMocks.configureEntryTarget.mockImplementation(async (mode, binding) => {
      const domainBinding =
        binding?.kind === 'authoring'
          ? {
              kind: 'workspace' as const,
              workspaceId: binding.workspaceId,
              workspaceGrantId: binding.workspaceGrantId,
            }
          : { kind: 'unbound' as const };
      currentCatalog = {
        ...currentCatalog,
        interaction: {
          ...currentCatalog.interaction,
          binding: domainBinding,
          bindingReceipt:
            domainBinding.kind === 'unbound'
              ? null
              : {
                  bindingReceiptId: 'binding:world-creator',
                  draftId: currentCatalog.interaction.draftId,
                  connectionId: currentCatalog.connection.connectionId,
                  binding: domainBinding,
                },
        },
      };
      currentIntent = {
        mode,
        targetReceipt:
          binding === undefined
            ? null
            : {
                targetReceiptId: `entry-target:${binding.target?.kind ?? 'project'}`,
                draftId: currentCatalog.interaction.draftId,
                connectionId: currentCatalog.connection.connectionId,
                mode,
                binding,
              },
      };
      return currentIntent;
    });
    const projectTarget = {
      label: 'Project One',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
      authority: { kind: 'project' as const, projectId: 'project-1' },
    };
    const createdTarget = {
      ...projectTarget,
      label: 'Project One / Untitled World',
      target: { kind: 'world-project' as const, worldProjectId: 'world-project:new' },
    };
    const onCreateAuthoringTarget = vi.fn(async () => ({
      status: 'created' as const,
      target: createdTarget,
    }));
    hostMocks.submitDraft.mockResolvedValueOnce({
      session: {
        phase: 'session',
        conversationId: 'conversation-world-creator',
        binding: currentCatalog.interaction.binding,
      },
      turnId: 'turn-world-creator',
      turnStatus: 'running',
    });

    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [{ projectId: 'project-1', label: 'Project One' }],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => projectTarget),
          onCreateAuthoringTarget,
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={currentCatalog.interaction}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Creation' }));
    fireEvent.click(await screen.findByRole('button', { name: /Project One/u }));
    await waitFor(() =>
      expect(hostMocks.configureEntryTarget).toHaveBeenLastCalledWith(
        'authoring',
        expect.objectContaining({
          authority: { kind: 'project', projectId: 'project-1' },
          target: null,
        }),
      ),
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '$world-creator 创建测试世界' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(hostMocks.submitDraft).toHaveBeenCalledOnce());
    expect(onCreateAuthoringTarget).toHaveBeenCalledOnce();
    expect(onCreateAuthoringTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKind: 'world-project',
        placement: { kind: 'project', projectId: 'project-1' },
      }),
      'chat.entryAuthoring.untitledWorld',
    );
    expect(hostMocks.submitDraft.mock.calls[0]?.[0]).toMatchObject({
      entryTargetReceipt: {
        binding: {
          authority: { kind: 'project', projectId: 'project-1' },
          target: { kind: 'world-project', worldProjectId: 'world-project:new' },
        },
      },
      input: { kind: 'skill', skillName: 'world-creator', args: '创建测试世界' },
    });
  });

  it('consumes an exact finalized CharacterVersion handoff into Character Dialogue Entry', async () => {
    vi.clearAllMocks();
    const launchCatalog = createDraftLaunchCatalog('draft-finalized-character', {
      kind: 'unbound',
    });
    const onConsumed = vi.fn();
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);

    render(
      <ConversationController
        {...createProps()}
        agentPresentation={launchCatalog.interaction}
        characterDialogueHandoff={{
          kind: 'character-dialogue',
          intentId: 'character-dialogue:finalized-character',
          label: 'Rin',
          binding: {
            kind: 'character-dialogue',
            mode: 'companion',
            participants: [
              {
                globalCharacterId: 'character-project:rin',
                characterVersionId: 'character-version:rin-2',
              },
            ],
          },
        }}
        onCharacterDialogueHandoffConsumed={onConsumed}
        emptyStatePresentation="desktop-dock"
      />,
    );

    await waitFor(() =>
      expect(hostMocks.configureEntryTarget).toHaveBeenCalledWith('character-dialogue', {
        kind: 'character-dialogue',
        mode: 'companion',
        participants: [
          {
            globalCharacterId: 'character-project:rin',
            characterVersionId: 'character-version:rin-2',
          },
        ],
      }),
    );
    expect(screen.getByTestId('entry-character-launches').textContent).toBe('Rin');
    expect(onConsumed).toHaveBeenCalledWith('character-dialogue:finalized-character');
  });

  it('submits skill-creator through the ordinary Skill path without configuring a target', async () => {
    vi.clearAllMocks();
    const launchCatalog = {
      ...createDraftLaunchCatalog('draft-skill-creator-personal', { kind: 'unbound' }),
      inputs: [createDraftSkillCatalogEntry('skill-creator', 'any')],
    };
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    hostMocks.submitDraft.mockResolvedValueOnce({
      session: {
        phase: 'session',
        conversationId: 'conversation-skill-creator-personal',
        binding: {
          kind: 'assistant',
          assistantSpaceId: 'assistant-space:local-user',
          baseGrantIds: [],
        },
      },
      turnId: 'turn-skill-creator-personal',
      turnStatus: 'running',
    });
    render(
      <ComposerWorkspaceProvider
        value={{
          kind: 'entry',
          projects: [{ projectId: 'project-1', label: 'Project One' }],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
        }}
      >
        <ConversationController
          {...createProps()}
          agentPresentation={launchCatalog.interaction}
          emptyStatePresentation="desktop-dock"
        />
      </ComposerWorkspaceProvider>,
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '$skill-creator 保留完整 Skill 需求' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(hostMocks.submitDraft).toHaveBeenCalledOnce());
    expect(hostMocks.submitDraft.mock.calls[0]?.[0]).toMatchObject({
      entryTargetReceipt: null,
      input: {
        kind: 'skill',
        skillName: 'skill-creator',
        args: '保留完整 Skill 需求',
      },
    });
    expect(hostMocks.configureEntryTarget).not.toHaveBeenCalled();
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('prefills a host handoff exactly once without creating or sending a conversation', () => {
    vi.clearAllMocks();
    const view = render(
      <ConversationController
        {...createProps()}
        initialInput={{ id: 'handoff-1', value: 'Plan a short film' }}
      />,
    );

    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Plan a short film');
    expect(hostMocks.createConversation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited plan' } });
    view.rerender(
      <ConversationController
        {...createProps()}
        initialInput={{ id: 'handoff-1', value: 'Plan a short film' }}
      />,
    );

    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Edited plan');
    expect(hostMocks.createConversation).not.toHaveBeenCalled();
  });

  it('activates an explicit host navigation target only after catalog and tab state hydrate', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps()}
        initialConversation={{ id: 'conversation-1', title: 'Conversation one' }}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationList',
            conversations: [
              {
                id: 'conversation-1',
                title: 'Conversation one',
                createdAt: '2026-07-28T00:00:00.000Z',
                updatedAt: '2026-07-28T00:01:00.000Z',
                messageCount: 1,
              },
            ],
          },
        }),
      );
    });

    expect(hostMocks.activateConversation).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs: [], activeTabId: null },
          },
        }),
      );
    });

    expect(hostMocks.activateConversation).toHaveBeenCalledTimes(1);
    expect(hostMocks.activateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
      }),
    );
  });

  it('waits for the replacement runtime catalog before activating its session target', () => {
    vi.clearAllMocks();
    hostMocks.runtimeId = 'runtime-draft';
    const view = render(
      <ConversationController
        {...createProps()}
        initialConversation={{ id: 'conversation-draft', title: 'Draft runtime session' }}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationList',
            conversations: [
              {
                id: 'conversation-draft',
                title: 'Draft runtime session',
                createdAt: '2026-08-04T00:00:00.000Z',
                updatedAt: '2026-08-04T00:01:00.000Z',
                messageCount: 1,
              },
            ],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs: [], activeTabId: null },
          },
        }),
      );
    });
    expect(hostMocks.activateConversation).toHaveBeenCalledTimes(1);

    hostMocks.runtimeId = 'runtime-session';
    view.rerender(
      <ConversationController
        {...createProps()}
        initialConversation={{ id: 'conversation-session', title: 'Committed session' }}
      />,
    );
    expect(hostMocks.activateConversation).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationList',
            conversations: [
              {
                id: 'conversation-session',
                title: 'Committed session',
                createdAt: '2026-08-04T00:02:00.000Z',
                updatedAt: '2026-08-04T00:03:00.000Z',
                messageCount: 2,
              },
            ],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs: [], activeTabId: null },
          },
        }),
      );
    });

    expect(hostMocks.activateConversation).toHaveBeenCalledTimes(2);
    expect(hostMocks.activateConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-session',
      }),
    );
    hostMocks.runtimeId = 'conversation-controller-test';
  });

  it('fails visibly without activating another conversation when the navigation target is missing', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps()}
        initialConversation={{ id: 'missing-conversation', title: 'Missing conversation' }}
      />,
    );

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationList',
            conversations: [],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs: [], activeTabId: null },
          },
        }),
      );
    });

    expect(hostMocks.activateConversation).not.toHaveBeenCalled();
    expect(screen.getByText('chat.conversation.navigationTargetUnavailable')).toBeTruthy();
  });

  it('keeps the tabless composer pending until the global config snapshot arrives', () => {
    render(<ConversationController {...createProps({ hasConfigSnapshot: false })} />);

    expect(screen.getByTestId('entry-config-state').textContent).toBe('loading:true');
    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveProperty('disabled', true);
  });

  it('hydrates the tabless composer from the authoritative Draft configuration', () => {
    const launchCatalog = withDraftConfiguration(
      {
        ...createBoundAssistantLaunchCatalog('draft-configured-model'),
        models: [
          {
            id: 'nekoapi-chat:gpt-5.5',
            label: 'GPT 5.5',
            providerId: 'nekoapi-chat',
            modelId: 'gpt-5.5',
            modelType: 'llm',
            contextWindow: 128_000,
            maximumOutputTokens: 8_192,
            purposeCapabilities: ['chat'],
            availability: { status: 'available' },
          },
        ],
      },
      {
        modelCatalogEntryId: 'nekoapi-chat:gpt-5.5',
        providerId: 'nekoapi-chat',
        modelId: 'gpt-5.5',
        executionMode: 'ask',
        temperature: 0.2,
        maximumOutputTokens: 8_192,
        thinkingBudget: 0,
      },
    );
    hostMocks.readLaunchCatalog.mockReturnValue(launchCatalog);
    render(
      <ConversationController
        {...createProps({
          settings: {
            ...createSettings(),
            selectedProviderId: 'nekoapi-chat',
            selectedModelId: 'gpt-5.5',
            chatModelOptions: [
              {
                id: 'nekoapi-chat:gpt-5.5',
                label: 'GPT 5.5',
                providerId: 'nekoapi-chat',
                modelId: 'gpt-5.5',
                category: 'llm',
              },
              {
                id: 'nekoapi-media:gpt-image-2',
                label: 'GPT Image 2',
                providerId: 'nekoapi-media',
                modelId: 'gpt-image-2',
                category: 'image',
              },
            ],
            defaultMediaModels: { image: 'nekoapi-media:gpt-image-2' },
            mediaUnderstandingModels: {
              image: {
                category: 'image',
                purpose: 'image.understand',
                status: 'configured',
                optionId: 'nekoapi-chat:gpt-5.5',
              },
              audio: {
                category: 'audio',
                purpose: 'audio.understand',
                status: 'configured',
                optionId: 'nekoapi-chat:gpt-5.5',
              },
              video: {
                category: 'video',
                purpose: 'video.understand',
                status: 'configured',
                optionId: 'nekoapi-chat:gpt-5.5',
              },
            },
          },
        })}
        agentPresentation={launchCatalog.interaction}
      />,
    );

    expect(screen.getByTestId('entry-selected-model').textContent).toBe('nekoapi-chat:gpt-5.5');
    expect(screen.getByTestId('entry-media-models').textContent).toBe(
      'nekoapi-media:gpt-image-2|none|none',
    );
    expect(screen.getByTestId('entry-media-understanding').textContent).toBe(
      'nekoapi-chat:gpt-5.5',
    );
  });

  it('projects session UI state from the visible conversation instead of stale conversation events', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: 'Storyboard A', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: 'Storyboard B', messageCount: 1, updatedAt: 1 },
          ],
          workItemsByConversation: new Map([
            ['conv-a', new Map([['work-a', createWorkItem('conv-a', 'A render task')]])],
          ]),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Storyboard A' }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'messageQueueSnapshot',
            snapshot: {
              conversationId: 'conv-a',
              items: [queuedMessage('conv-a', 'queued for A')],
              pendingCount: 1,
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'contextTokenCount',
            conversationId: 'conv-a',
            tokenCount: 42,
          },
        }),
      );
    });
    fireEvent.click(screen.getByTestId('add-context-chip'));

    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('queued for A');
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('A context');
    expect(screen.getByTestId('workspace-token-count').textContent).toBe('42');
    expect(screen.getByTestId('workspace-work-items').textContent).toBe('A render task');

    fireEvent.click(screen.getByRole('button', { name: 'Open Storyboard B' }));

    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-token-count').textContent).toBe('0');
    expect(screen.getByTestId('workspace-work-items').textContent).toBe('');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'messageQueueSnapshot',
            snapshot: {
              conversationId: 'conv-a',
              items: [queuedMessage('conv-a', 'late queued for A')],
              pendingCount: 1,
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'contextTokenCount',
            conversationId: 'conv-a',
            tokenCount: 99,
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-token-count').textContent).toBe('0');
    expect(screen.getByTestId('workspace-work-items').textContent).toBe('');
  });

  it('does not recreate an optimistic queue item when release arrives before the submit receipt', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [{ id: 'conv-a', title: 'Race chat', messageCount: 0, updatedAt: 1 }],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Race chat' }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'messageQueued',
            conversationId: 'conv-a',
            releasedItem: {
              id: 'queue-race',
              conversationId: 'conv-a',
              content: 'queued release wins the race',
              createdAt: 1,
              source: 'composer',
              draft: {
                message: 'queued release wins the race',
                sessionMode: 'agent',
                attachments: [
                  {
                    id: 'release-image',
                    name: 'release.png',
                    type: 'image',
                    preview: 'neko-resource://preview/release',
                  },
                ],
                contextPayloads: [
                  {
                    type: 'canvas-node',
                    id: 'canvas-node-release',
                    label: 'Release Canvas node',
                  },
                ],
                fileReferences: [
                  {
                    id: 'file:release.png',
                    label: 'release.png',
                    mediaType: 'image',
                    thumbnailUri: 'neko-resource://thumbnail/release',
                    contentLocator: { kind: 'workspace-file', path: 'release.png' },
                  },
                ],
              },
            },
            snapshot: {
              conversationId: 'conv-a',
              items: [],
              pendingCount: 0,
              paused: false,
              sequence: 1,
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-messages').textContent).toBe(
      'queued release wins the race',
    );
    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-message-attachments').textContent).toBe('release-image');
    expect(screen.getByTestId('workspace-message-context').textContent).toBe(
      'Release Canvas node|release.png',
    );

    fireEvent.click(screen.getByTestId('emit-released-queue-receipt'));

    expect(screen.getByTestId('workspace-messages').textContent).toBe(
      'queued release wins the race',
    );
    expect(screen.getByTestId('workspace-queued-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-message-attachments').textContent).toBe('release-image');
    expect(screen.getByTestId('workspace-message-context').textContent).toBe(
      'Release Canvas node|release.png',
    );
  });

  it('keeps Tab activation out of the conversation render coordinator', () => {
    vi.clearAllMocks();
    expect('prepareActivation' in ConversationRenderCoordinator.prototype).toBe(false);
    render(<ConversationController {...createProps()} />);

    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
      {
        id: 'tab-role',
        title: 'Role C',
        conversationId: 'conv-role',
        kind: 'character-dialogue' as const,
      },
    ];
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs, activeTabId: 'tab-b' },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-b', title: 'Chat B', messages: [] },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: { openTabs, activeTabId: 'tab-a' },
          },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch Role C' }));

    expect('prepareActivation' in ConversationRenderCoordinator.prototype).toBe(false);
  });

  it('retains independent keyed workspace instances for different conversations while switching visibility', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    const workspaceA = screen.getByTestId('workspace-runtime-tab-a');
    const workspaceB = screen.getByTestId('workspace-runtime-tab-b');
    const instanceA = workspaceA.getAttribute('data-instance-id');
    const instanceB = workspaceB.getAttribute('data-instance-id');
    expect(instanceA).not.toBe(instanceB);
    expect(workspaceA.getAttribute('data-visible')).toBe('true');
    expect(workspaceB.getAttribute('data-visible')).toBe('false');
    fireEvent.click(screen.getByTestId('increment-workspace-local-state'));
    expect(screen.getByTestId('workspace-local-state').textContent).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));

    expect(screen.getByTestId('workspace-local-state').textContent).toBe('0');
    expect(screen.getByTestId('workspace-runtime-tab-a')).toBe(workspaceA);
    expect(screen.getByTestId('workspace-runtime-tab-b')).toBe(workspaceB);
    expect(workspaceA.getAttribute('data-instance-id')).toBe(instanceA);
    expect(workspaceB.getAttribute('data-instance-id')).toBe(instanceB);
    expect(workspaceA.getAttribute('data-visible')).toBe('false');
    expect(workspaceB.getAttribute('data-visible')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));
    expect(screen.getByTestId('workspace-local-state').textContent).toBe('1');
  });

  it('bounds clean inactive workspace trees and remounts from the retained Tab store', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = Array.from({ length: 6 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `Chat ${index + 1}`,
      conversationId: `conv-${index + 1}`,
    }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-6' } },
        }),
      );
    });

    expect(screen.queryByTestId('workspace-runtime-tab-1')).toBeNull();
    expect(screen.getByTestId('workspace-runtime-tab-6').getAttribute('data-visible')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat 1' }));

    const remountedTabOne = screen.getByTestId('workspace-runtime-tab-1');
    expect(remountedTabOne.getAttribute('data-visible')).toBe('true');
    expect(screen.queryByTestId('workspace-runtime-tab-2')).toBeNull();
    expect(screen.getByTestId('workspace-runtime-tab-6')).toBeTruthy();
  });

  it('keeps an inactive dirty-input Tab tree outside the clean retention budget', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = Array.from({ length: 6 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `Chat ${index + 1}`,
      conversationId: `conv-${index + 1}`,
    }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-6' } },
        }),
      );
    });
    expect(screen.queryByTestId('workspace-runtime-tab-1')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'injectContext',
            tabId: 'tab-1',
            conversationId: 'conv-1',
            payload: contextPayload('ctx-tab-1', 'Retained Tab context'),
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-runtime-tab-1').getAttribute('data-visible')).toBe(
      'false',
    );
  });

  it('keeps a background running Tab tree outside the clean retention budget', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = Array.from({ length: 6 }, (_, index) => ({
      id: `tab-${index + 1}`,
      title: `Chat ${index + 1}`,
      conversationId: `conv-${index + 1}`,
    }));

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-6' } },
        }),
      );
    });
    expect(screen.queryByTestId('workspace-runtime-tab-1')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentStateSnapshot',
            agentStates: [{ conversationId: 'conv-1', phase: 'streaming', startedAt: 10 }],
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-runtime-tab-1').getAttribute('data-visible')).toBe(
      'false',
    );
  });

  it('retains independent keyed workspace instances for two tabs bound to one conversation', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A1', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat A2', conversationId: 'conv-a' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    const workspaceA = screen.getByTestId('workspace-runtime-tab-a');
    const workspaceB = screen.getByTestId('workspace-runtime-tab-b');
    const instanceA = workspaceA.getAttribute('data-instance-id');
    const instanceB = workspaceB.getAttribute('data-instance-id');
    expect(instanceA).not.toBe(instanceB);

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A2' }));

    expect(screen.getByTestId('workspace-runtime-tab-a')).toBe(workspaceA);
    expect(screen.getByTestId('workspace-runtime-tab-b')).toBe(workspaceB);
    expect(workspaceA.getAttribute('data-instance-id')).toBe(instanceA);
    expect(workspaceB.getAttribute('data-instance-id')).toBe(instanceB);
    expect(workspaceA.getAttribute('data-visible')).toBe('false');
    expect(workspaceB.getAttribute('data-visible')).toBe('true');
  });

  it('unmounts only the closed Tab workspace and retains the remaining instance', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    const workspaceB = screen.getByTestId('workspace-runtime-tab-b');
    const instanceB = workspaceB.getAttribute('data-instance-id');
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat A' }));

    expect(screen.queryByTestId('workspace-runtime-tab-a')).toBeNull();
    expect(screen.getByTestId('workspace-runtime-tab-b')).toBe(workspaceB);
    expect(workspaceB.getAttribute('data-instance-id')).toBe(instanceB);
  });

  it('scopes retained Tab message mutations to the owning conversation', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    fireEvent.click(screen.getByTestId('append-workspace-message-tab-a'));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-messages-tab-a').textContent).toBe('local conv-a');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('local conv-a');
    expect(screen.getByTestId('workspace-messages-tab-b').textContent).toBe('');
  });

  it('withholds cached non-Timeline Markdown when an ordinary Tab becomes visible', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: {
              id: 'conv-b',
              title: 'Chat B',
              messages: [streamingMessage('message-b', 'partial B')],
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-streaming-flags').textContent).toBe('');
  });

  it('switches running status and elapsed baseline with the active conversation snapshot', () => {
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentPhase',
            conversationId: 'conv-a',
            phase: 'acting',
            toolName: 'ReadFile',
            timestamp: 1_000,
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-agent-state').textContent).toBe('none');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-agent-state').textContent).toBe('acting:1000:ReadFile');
  });

  it('clears direct-media Tab running status when the Host publishes terminal idle', () => {
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [{ id: 'tab-a', title: 'Image', conversationId: 'conv-a' }],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    fireEvent.click(screen.getByTestId('emit-user-message-sent'));
    expect(screen.getByTestId('tab-status-tab-a').textContent).toBe('running');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentPhase',
            conversationId: 'conv-a',
            phase: 'thinking',
            timestamp: 1_000,
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'agentPhase',
            conversationId: 'conv-a',
            phase: 'idle',
            timestamp: 2_000,
          },
        }),
      );
    });

    expect(screen.getByTestId('tab-status-tab-a').textContent).toBe('completed');
  });

  it('disposes only the deleted non-visible conversation render resources', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: 'Chat A', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: 'Chat B', messageCount: 1, updatedAt: 1 },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete Chat A' }));

    expect(hostMocks.deleteConversation).toHaveBeenCalledWith('conv-a');
  });

  it('withholds cached non-Timeline Markdown when a character-role Tab becomes visible', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: {
              id: 'conv-role',
              title: 'Role B',
              messages: [streamingMessage('message-role', 'partial role')],
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
                {
                  id: 'tab-role',
                  title: 'Role B',
                  conversationId: 'conv-role',
                  kind: 'character-dialogue',
                },
              ],
              activeTabId: 'tab-a',
            },
          },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch Role B' }));

    expect(screen.getByTestId('workspace-messages').textContent).toBe('');
    expect(screen.getByTestId('workspace-streaming-flags').textContent).toBe('');
  });

  it('keeps Character and Room new-conversation actions explicitly unavailable', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            conversation: { id: 'conv-role', title: 'Role B', messages: [] },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                {
                  id: 'tab-role',
                  title: 'Role B',
                  conversationId: 'conv-role',
                  kind: 'character-dialogue',
                },
              ],
              activeTabId: 'tab-role',
            },
          },
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(hostMocks.createConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      'Character and Room new conversations are not available',
    );
  });

  it('hydrates model and execution settings only into Tabs for the owning conversation', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'settingsData',
            conversationId: 'conv-a',
            selectedProviderId: 'provider-a',
            selectedModelId: 'model-a',
            executionMode: 'auto',
            chatModelOptions: [
              {
                id: 'provider-a:model-a',
                label: 'Model A',
                providerId: 'provider-a',
                modelId: 'model-a',
                category: 'llm',
              },
            ],
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'settingsData',
            conversationId: 'conv-b',
            selectedProviderId: 'provider-b',
            selectedModelId: 'model-b',
            executionMode: 'plan',
            chatModelOptions: [
              {
                id: 'provider-b:model-b',
                label: 'Model B',
                providerId: 'provider-b',
                modelId: 'model-b',
                category: 'llm',
              },
              {
                id: 'provider-b:image-b',
                label: 'Image B',
                providerId: 'provider-b',
                modelId: 'image-b',
                category: 'image',
              },
            ],
            defaultMediaModels: { image: 'provider-b:image-b' },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-selected-model').textContent).toBe('provider-b:model-b');
    expect(screen.getByTestId('workspace-execution-mode').textContent).toBe('plan');
    expect(screen.getByTestId('workspace-model-options').textContent).toBe(
      'provider-b:model-b|provider-b:image-b',
    );
    expect(screen.getByTestId('workspace-media-models').textContent).toBe(
      'provider-b:image-b|none|none',
    );
    expect(screen.getByTestId('workspace-selected-model-tab-a').textContent).toBe(
      'provider-a:model-a',
    );
    expect(screen.getByTestId('workspace-execution-mode-tab-a').textContent).toBe('auto');
    expect(screen.getByTestId('workspace-model-options-tab-a').textContent).toBe(
      'provider-a:model-a',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));

    expect(screen.getByTestId('workspace-selected-model').textContent).toBe('provider-a:model-a');
    expect(screen.getByTestId('workspace-execution-mode').textContent).toBe('auto');
    expect(screen.getByTestId('workspace-model-options').textContent).toBe('provider-a:model-a');
    expect(screen.getByTestId('workspace-selected-model-tab-b').textContent).toBe(
      'provider-b:model-b',
    );
    expect(screen.getByTestId('workspace-execution-mode-tab-b').textContent).toBe('plan');
    expect(screen.getByTestId('workspace-model-options-tab-b').textContent).toBe(
      'provider-b:model-b|provider-b:image-b',
    );
  });

  it('routes diagnostics to every Tab store for the owning conversation only', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a-1', title: 'Chat A1', conversationId: 'conv-a' },
      { id: 'tab-a-2', title: 'Chat A2', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-b' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'sessionDiagnostic',
            code: 'conversation-durability-failed',
            severity: 'error',
            conversationId: 'conv-a',
            message: 'Conversation A only.',
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-diagnostics').textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A1' }));
    expect(screen.getByTestId('workspace-diagnostics').textContent).toContain(
      'Conversation A only.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A2' }));
    expect(screen.getByTestId('workspace-diagnostics').textContent).toContain(
      'Conversation A only.',
    );
  });

  it('routes injected context and intent to the exact Tab runtime', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-a' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'injectContext',
            tabId: 'tab-a',
            conversationId: 'conv-a',
            payload: {
              ...contextPayload('ctx-tab-a', 'Tab A context'),
              intent: 'Continue in Tab A',
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-input').textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('Tab A context');
    expect(screen.getByTestId('workspace-input').textContent).toBe('Continue in Tab A');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));
    expect(screen.getByTestId('workspace-context-chips').textContent).toBe('');
    expect(screen.getByTestId('workspace-input').textContent).toBe('');
  });

  it('routes queued edit responses to the exact requesting Tab runtime', () => {
    vi.clearAllMocks();
    render(<ConversationController {...createProps()} />);
    const openTabs = [
      { id: 'tab-a', title: 'Chat A', conversationId: 'conv-a' },
      { id: 'tab-b', title: 'Chat B', conversationId: 'conv-a' },
    ];

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'tabState', tabState: { openTabs, activeTabId: 'tab-b' } },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'queuedMessageEditRequested',
            tabId: 'tab-a',
            conversationId: 'conv-a',
            item: {
              id: 'queue-a',
              conversationId: 'conv-a',
              content: 'Tab A queued edit',
              createdAt: 10,
              source: 'composer',
            },
            snapshot: {
              conversationId: 'conv-a',
              pendingCount: 0,
              items: [],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-queued-edit').textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat A' }));
    expect(screen.getByTestId('workspace-queued-edit').textContent).toBe('Tab A queued edit');

    fireEvent.click(screen.getByRole('button', { name: 'Switch Chat B' }));
    expect(screen.getByTestId('workspace-queued-edit').textContent).toBe('');
  });

  it('keeps activation rejection diagnostics scoped to the requested conversation', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: 'Conversation A', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: 'Conversation B', messageCount: 1, updatedAt: 1 },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Conversation A' }));
    expect(screen.getByTestId('workspace-availability').textContent).toBe('loading');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'sessionDiagnostic',
            code: 'stale-tab-state-revision',
            severity: 'error',
            action: 'activate-conversation',
            conversationId: 'conv-a',
            message: 'Activation revision was stale.',
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-availability').textContent).toContain('unavailable');
    expect(screen.getByTestId('workspace-availability').textContent).toContain(
      'stale-tab-state-revision',
    );
    expect(screen.queryByText('全局错误')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'sessionDiagnostic',
            code: 'conversation-durability-failed',
            severity: 'error',
            conversationId: 'conv-b',
            message: 'Background persistence failed.',
          },
        }),
      );
    });

    expect(screen.queryByText('Background persistence failed.')).toBeNull();
  });

  it('does not display the previous conversation transcript after opening a history conversation', () => {
    vi.clearAllMocks();
    render(
      <ConversationController
        {...createProps({
          history: [
            { id: 'conv-a', title: '分析前10页，生成分镜表', messageCount: 1, updatedAt: 2 },
            { id: 'conv-b', title: '生成猫猫玩耍的图片', messageCount: 1, updatedAt: 1 },
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open 分析前10页，生成分镜表' }));
    expect(hostMocks.activateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-a' }),
    );
    const activationA = hostMocks.activateConversation.mock.calls.at(-1)?.[0] as {
      activationId: number;
    };
    expect(screen.getByTestId('workspace-availability').textContent).toBe('loading');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            activation: {
              activationId: activationA.activationId,
            },
            conversation: {
              id: 'conv-a',
              title: '分析前10页，生成分镜表',
              messages: [message('message-a', '分析前10页，生成分镜表')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-conversation').textContent).toBe('conv-a');
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-a');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('分析前10页，生成分镜表');

    fireEvent.click(screen.getByRole('button', { name: 'Open 生成猫猫玩耍的图片' }));

    expect(hostMocks.activateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-b' }),
    );
    const activationB = hostMocks.activateConversation.mock.calls.at(-1)?.[0] as {
      activationId: number;
    };
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-switching').textContent).toBe('idle');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'activeConversation',
            activation: {
              activationId: activationB.activationId,
            },
            conversation: {
              id: 'conv-b',
              title: '生成猫猫玩耍的图片',
              messages: [message('message-b', '生成猫猫玩耍的图片')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-tab-conversation').textContent).toBe('conv-b');
    expect(screen.getByTestId('workspace-switching').textContent).toBe('idle');
    expect(screen.getByTestId('workspace-messages').textContent).toBe('生成猫猫玩耍的图片');
  });

  it('caches every restored Tab snapshot across the tabless-to-tabs listener transition', () => {
    render(<ConversationController {...createProps()} />);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'tabState',
            tabState: {
              openTabs: [
                { id: 'tab-a', title: 'A', conversationId: 'conv-a' },
                { id: 'tab-b', title: 'B', conversationId: 'conv-b' },
              ],
              activeTabId: 'tab-b',
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationSnapshot',
            conversation: {
              id: 'conv-a',
              title: 'A',
              messages: [message('message-a', 'background A')],
            },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'conversationSnapshot',
            conversation: {
              id: 'conv-b',
              title: 'B',
              messages: [message('message-b', 'visible B')],
            },
          },
        }),
      );
    });

    expect(screen.getByTestId('workspace-messages').textContent).toBe('visible B');
    expect(screen.getByTestId('workspace-messages-tab-a').textContent).toBe('background A');
  });
});

interface CreatePropsOptions {
  readonly history?: readonly ConversationSummary[];
  readonly workItemsByConversation?: Map<string, Map<string, AgentWorkItem>>;
  readonly settings?: SettingsState;
  readonly hasConfigSnapshot?: boolean;
  readonly mentionItems?: readonly import('./ChatView/InputArea/types').MentionItem[];
}

function createProps(
  options: CreatePropsOptions = {},
): React.ComponentProps<typeof ConversationController> {
  return {
    settings: options.settings ?? createSettings(),
    hasConfigSnapshot: options.hasConfigSnapshot ?? true,
    setSettings: vi.fn(),
    setHasConfigSnapshot: vi.fn(),
    setProjectFiles: vi.fn(),
    mentionItems: [...(options.mentionItems ?? [])],
    setMentionItems: vi.fn(),
    mentionSearchFilter: '',
    setMentionSearchFilter: vi.fn(),
    setPluginCommands: vi.fn(),
    updateSettings: vi.fn(),
    workItemsByConversation: options.workItemsByConversation ?? new Map(),
    setWorkItemsByConversation: vi.fn(),
    pluginsAvailable: {},
    setPluginsAvailable: vi.fn(),
    setShowOnboarding: vi.fn(),
    renderHeader: (props) => (
      <div data-testid="header">
        <button type="button" onClick={props.onNewChat}>
          New
        </button>
        {props.tabs.map((tab) => (
          <div key={tab.id}>
            <button type="button" onClick={() => props.onSwitchTab(tab.id)}>
              Switch {tab.title}
            </button>
            <button type="button" onClick={() => props.onCloseTab(tab.id)}>
              Close {tab.title}
            </button>
            <span data-testid={`tab-status-${tab.id}`}>{tab.displayStatus ?? 'none'}</span>
          </div>
        ))}
        {options.history?.map((conversation) => (
          <div key={conversation.id}>
            <button
              type="button"
              onClick={() => props.onOpenConversation(conversation.id, conversation.title)}
            >
              Open {conversation.title}
            </button>
            <button type="button" onClick={() => props.onDeleteConversation(conversation.id)}>
              Delete {conversation.title}
            </button>
          </div>
        ))}
        <span data-testid="tab-count">{props.tabs.length}</span>
      </div>
    ),
  };
}

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    timestamp: 1,
  };
}

function streamingMessage(id: string, content: string): Message {
  return {
    id,
    role: 'assistant',
    content,
    timestamp: 1,
    isStreaming: true,
    contentBlocks: [
      {
        id: `block-${id}`,
        type: 'text',
        timestamp: 1,
        content,
        isStreaming: true,
      },
    ],
  };
}

function queuedMessage(conversationId: string, content: string): AgentQueuedMessageItem {
  return {
    id: `${conversationId}-queued`,
    conversationId,
    content,
    createdAt: 1,
    source: 'composer',
  };
}

function contextPayload(id: string, label: string): AgentContextPayload {
  return {
    type: 'file',
    id,
    label,
    summary: label,
    data: { path: `${id}.md` },
  };
}

function createWorkItem(conversationId: string, title: string): AgentWorkItem {
  const childRunId = `${conversationId}-work`;
  return {
    scope: {
      conversationId,
      runId: `run:${conversationId}`,
      parentRunId: 'agent-main',
      childRunId,
      childKind: 'subagent',
    },
    id: childRunId,
    conversationId,
    kind: 'subagent',
    parentMessageId: null,
    parentToolCallId: null,
    title,
    status: 'processing',
    progress: 0.5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subAgent: {
      parentAgentId: 'agent-main',
      runMode: 'background',
    },
  };
}

function createDraftProjection(
  draftId: string,
  binding: AgentDomainBinding,
): AgentDraftInteractionProjection {
  return {
    phase: 'draft',
    draftId,
    binding,
    bindingReceipt: null,
  };
}

function createComposerProjection(
  composerId: string,
  binding: Exclude<AgentDomainBinding, { readonly kind: 'unbound' }>,
): AgentComposerInteractionProjection {
  return { phase: 'composer', composerId, binding };
}

function createBoundAssistantLaunchCatalog(draftId: string) {
  const binding = {
    kind: 'assistant' as const,
    assistantSpaceId: 'assistant:1',
    baseGrantIds: [],
  };
  return createDraftLaunchCatalog(draftId, binding);
}

function createDraftSkillCatalogEntry(
  name: string,
  bindingRequirement: 'any' | 'workspace' = 'workspace',
) {
  return {
    id: `skill:project:${name}`,
    name,
    description: 'Build a storyboard.',
    trigger: 'skill' as const,
    prefix: '$' as const,
    phaseRequirement: 'any' as const,
    bindingRequirement,
    source: {
      kind: 'project' as const,
      workspaceId: 'workspace-1',
      sourceId: `${name}-source`,
    },
    availability: { status: 'available' as const },
    executable: {
      kind: 'skill' as const,
      skillName: name,
      activationId: `skill:project:skill:${name}-source`,
    },
  };
}

function createDraftLaunchCatalog(
  draftId: string,
  binding: AgentDomainBinding,
): AgentLaunchCatalogProjection {
  const connectionId = `connection:${draftId}`;
  return {
    connection: {
      applicationInstanceId: 'app:test',
      windowId: 'window:test',
      workbenchInstanceId: 'workbench:test',
      agentSurfaceId: 'surface:test',
      viewId: 'view:test',
      draftId,
      connectionId,
    },
    interaction: {
      phase: 'draft' as const,
      draftId,
      binding,
      bindingReceipt:
        binding.kind === 'unbound'
          ? null
          : {
              bindingReceiptId: 'binding:test',
              draftId,
              connectionId,
              binding,
            },
    },
    models: [
      {
        id: 'test-model',
        label: 'Test Model',
        providerId: 'test',
        modelId: 'test-model',
        modelType: 'llm' as const,
        contextWindow: 128_000,
        maximumOutputTokens: 8_192,
        purposeCapabilities: ['chat'],
        availability: { status: 'available' as const },
      },
    ],
    defaultMediaModels: {},
    mediaUnderstandingModels: {
      image: { category: 'image', purpose: 'image.understand', status: 'missing' },
      audio: { category: 'audio', purpose: 'audio.understand', status: 'missing' },
      video: { category: 'video', purpose: 'video.understand', status: 'missing' },
    },
    configuration: createDraftConfiguration({
      modelCatalogEntryId: 'test-model',
      providerId: 'test',
      modelId: 'test-model',
      executionMode: 'ask',
      temperature: 0.2,
      maximumOutputTokens: 8_192,
      thinkingBudget: 0,
    }),
    inputs: [],
  };
}

function withDraftConfiguration(
  catalog: AgentLaunchCatalogProjection,
  request: AgentConfigurationRequest,
): AgentLaunchCatalogProjection {
  return {
    ...catalog,
    configuration: createDraftConfiguration(request),
  };
}

function createDraftConfiguration(request: AgentConfigurationRequest) {
  return {
    request,
    fields: {
      model: {
        effectiveValue: {
          modelCatalogEntryId: request.modelCatalogEntryId,
          providerId: request.providerId,
          modelId: request.modelId,
        },
        source: 'draft-request' as const,
        policy: { status: 'editable' as const, owner: 'agent-config' },
      },
      executionMode: {
        effectiveValue: request.executionMode,
        source: 'draft-request' as const,
        policy: { status: 'editable' as const, owner: 'agent-config' },
      },
      temperature: {
        effectiveValue: request.temperature ?? 0.2,
        source: 'draft-request' as const,
        policy: { status: 'editable' as const, owner: 'agent-config' },
      },
      maximumOutputTokens: {
        effectiveValue: request.maximumOutputTokens ?? 8_192,
        source: 'draft-request' as const,
        policy: { status: 'editable' as const, owner: 'agent-config' },
      },
      thinkingBudget: {
        effectiveValue: request.thinkingBudget ?? 0,
        source: 'draft-request' as const,
        policy: { status: 'editable' as const, owner: 'agent-config' },
      },
    },
  };
}

function createSettings(): SettingsState {
  return {
    providers: [],
    configuredProviders: [],
    selectedProviderId: 'test',
    selectedModelId: 'test-model',
    systemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.2,
    maxTokens: 8192,
    executionMode: 'ask',
    chatModelOptions: [
      {
        id: 'test-model',
        providerId: 'test',
        modelId: 'test-model',
        label: 'Test Model',
        category: 'llm',
      },
    ],
    modelGroups: [],
  };
}
