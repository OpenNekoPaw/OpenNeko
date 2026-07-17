/**
 * AI Assistant View Provider
 * Main entry point - orchestrates all components
 *
 * Refactored to use specialized handlers for different domains:
 * - TaskHandler: Task management
 * - TemplateHandler: Template execution
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getService, getLogger } from '../base';
import type { Platform } from '@neko/platform';
import type { IAgentManager } from '../ai/agentManager';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import {
  IPlatform,
  ITaskManager,
  IAgentManager as IAgentManagerId,
  IPiAgentRuntimeManager,
  IProductPurposeTextRuntime,
} from '../bootstrap';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationBridge, type ConversationBridgeOptions } from './conversationBridge';
import { AgentMessageTurnHandler } from './agentMessageTurnHandler';
import { SystemPromptManager } from './systemPromptManager';
import { ConfigBridge } from '../services/configBridge';
import { getNekoAuthAPI } from '../services/nekoAuthApi';
import { DragDropBroker } from '../services/DragDropBroker';
import {
  TaskHandler,
  SkillHandler,
  FileOperationHandler,
  SettingsHandler,
  ContextHandler,
  SlashCommandHandler,
  ConversationMessageHandler,
} from './handlers';
import {
  buildChatAmbientCanvasUpdateMessage,
  buildChatContextInjectionMessage,
  buildChatExternalInputMessage,
  buildChatPluginCommandsMessage,
  buildChatRestorePlan,
  buildChatTabStateMessage,
  buildInvalidWebviewPayloadMessage,
  requireActiveConversationTabBinding,
  updateTabStateRuntime,
} from '@neko/agent/runtime';
import type { IRuntimeTaskManager } from '@neko/agent';
import { setActiveCanvasAmbientScope } from '../services/canvasAmbientContext';
import { postPluginsAvailable } from '../services/pluginTransferBridge';
import { AgentDashboardWorkItemSource } from '../services/dashboardWorkItemSource';
import {
  CharacterDialogueController,
  defaultEnrichCharacterProfile,
} from './characterDialogueController';
import { EmbodyCharacterController } from './embodyCharacterController';
import {
  createCharacterDialoguePurposeResponder,
  createEmbodyCharacterPurposeResponder,
  evaluateCharacterDialogueWithPurpose,
  inferCharacterProfileFactsWithPurpose,
  requireCharacterPurposeRuntime,
} from '@neko/entity';
import {
  createAgentLocalResourceAccess,
  type AgentLocalResourceAccess,
} from '../services/localResourceAccess';
import type { GeneratedAssetIndex } from '@neko/platform/media/generated-asset-index';
import { StateTaskDeliveryCursorStorage, TaskDeliveryBridge } from '../services/taskDeliveryBridge';
import { handleChatWebviewMessage } from './chatWebviewMessageRouter';
import {
  createConversationProjectionAttachmentServer,
  ProjectionAttachmentProtocolError,
  type ConversationProjectionAttachmentServer,
} from './projection/conversationProjectionAttachmentServer';
import { projectConversationProjectionAttachmentFrameForWebview } from './message/webviewResourceProjection';
import {
  getCapabilityDiscoveryService,
  getCapabilityRuntimeBindings,
} from '../bootstrap/capabilityBootstrap';
import {
  AGENT_WEBVIEW_PROTOCOL_VERSION,
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
  buildAgentSessionDiagnosticMessage,
  normalizeTabState,
  parseWebviewToExtensionMessage,
  type ActivateConversationWebviewMessage,
  type Message,
  type OpenTab,
  type ProjectionAttachmentKey,
  type TabState,
} from '@neko-agent/types';
import type {
  AgentTaskResultFollowUpRequest,
  ICapabilityPurposeTextRuntime,
  NpcAgentWorkflowRequest,
} from '@neko/shared';
import { updateWebviewKeyboardEditableOwner } from '@neko/shared/vscode/extension';
import { AccountAiCatalogCache } from '../services/accountAiCatalogCache';

const logger = getLogger('ChatProvider');
const AGENT_KEYBOARD_EDITABLE_CONTEXT = 'neko.agent.keyboardEditable';
const AGENT_KEYBOARD_EDITABLE_OWNER_ID = 'neko.agent:assistant';
let tabStateWriterOrdinal = 0;
const SESSION_SCOPED_WEBVIEW_MESSAGE_TYPES = new Set([
  'sendMessage',
  'activateConversation',
  'deleteConversation',
  'clearHistory',
  'confirmTool',
  'cancelMessage',
  'getMessageQueue',
  'promoteQueuedMessage',
  'cancelQueuedMessage',
  'editQueuedMessage',
  'getTasks',
  'cancelTask',
  'retryTask',
  'viewTaskResult',
  'getContextTokenCount',
  'compressContext',
  'invokeSlashCommand',
  'invokeSkill',
  'invokePluginSlashCommand',
  'invokeAgentCapabilityLifecycle',
  'requestCanvasAuthoringHandoff',
  'mermaidError',
]);

function buildMissingSessionIdentityDiagnostic(raw: unknown) {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return null;
  }
  if (!SESSION_SCOPED_WEBVIEW_MESSAGE_TYPES.has(raw.type)) {
    return null;
  }
  if (typeof raw.conversationId === 'string' && raw.conversationId.trim().length > 0) {
    return null;
  }
  return buildAgentSessionDiagnosticMessage({
    code: 'missing-session-identity',
    action: raw.type,
    message: `Session-scoped webview message "${raw.type}" requires conversationId.`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface TabStateWriteMetadata {
  readonly ownerId: string;
  readonly revision: number;
  readonly updatedAt: number;
}

function classifyProjectionProtocolError(
  error: Error,
): import('@neko-agent/types').ProjectionAttachmentProtocolDiagnosticCode {
  return error instanceof ProjectionAttachmentProtocolError
    ? error.code
    : 'attachment-snapshot-required';
}

function createTabStateWriterId(): string {
  tabStateWriterOrdinal += 1;
  return `chat-tab-state-${Date.now().toString(36)}-${tabStateWriterOrdinal}`;
}

function parseTabStateWriteMetadata(value: unknown): TabStateWriteMetadata | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.ownerId !== 'string' ||
    value.ownerId.trim().length === 0 ||
    typeof value.revision !== 'number' ||
    !Number.isInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }
  return {
    ownerId: value.ownerId,
    revision: value.revision,
    updatedAt: value.updatedAt,
  };
}

function getCurrentWorkspaceRoot(): string | undefined {
  const activeEditorPath = vscode.window.activeTextEditor?.document.uri.fsPath;
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (activeEditorPath) {
    const activeFolder = workspaceFolders.find((folder) =>
      isPathInsideWorkspace(activeEditorPath, folder.uri.fsPath),
    );
    if (activeFolder) return activeFolder.uri.fsPath;
  }
  return workspaceFolders[0]?.uri.fsPath;
}

function isPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  const relative = path.relative(workspaceRoot, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolvePiConversationOptions(
  options: ConversationBridgeOptions | undefined,
): ConversationBridgeOptions {
  if (options) return options;
  const requireAuthority = () => {
    const authority = getService(IPiAgentRuntimeManager);
    if (!authority) {
      throw new Error('ChatViewProvider requires the program Pi conversation authority.');
    }
    return authority;
  };
  return {
    initialCatalog: [],
    authority: {
      listConversationPresentationCatalog: () =>
        requireAuthority().listConversationPresentationCatalog(),
      createConversation: (input) => requireAuthority().createConversation(input),
      updateConversationTitle: (conversationId, title) =>
        requireAuthority().updateConversationTitle(conversationId, title),
      deleteConversation: (conversationId) =>
        requireAuthority().deleteConversation(conversationId),
      readConversationEntries: (conversationId) =>
        requireAuthority().readConversationEntries(conversationId),
    },
  };
}

export function createChatLocalResourceAccess(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
): AgentLocalResourceAccess {
  return createAgentLocalResourceAccess(extensionUri, context);
}

export interface ChatViewProviderOptions {
  readonly localResourceAccess?: AgentLocalResourceAccess;
  readonly generatedAssetIndex?: GeneratedAssetIndex;
  readonly piConversations?: ConversationBridgeOptions;
  readonly localMetadata?: {
    readonly pollRevisions?: () => Promise<{
      readonly changedDomains: readonly string[];
    }>;
    readonly disposeHost: () => Promise<void>;
  };
}

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'neko.aiAssistant';
  private static readonly TAB_STATE_KEY = 'neko.tabState';
  private static readonly TAB_STATE_WRITE_METADATA_KEY = 'neko.tabState.writeMetadata';

  private _view?: vscode.WebviewView;

  // Managers
  private readonly _settings: SettingsManager;
  private readonly _systemPrompt: SystemPromptManager;
  private readonly _conversations: ConversationBridge;
  private _providers?: ProviderManager;
  private _messages?: AgentMessageTurnHandler;

  // Tab state for persistence
  private _tabState: TabState = { openTabs: [], activeTabId: null };
  private readonly _tabStateWriterId = createTabStateWriterId();
  private _tabStateRevision = 0;

  // Handlers
  private readonly _taskHandler: TaskHandler;
  private readonly _skillHandler: SkillHandler;
  private readonly _fileOperationHandler: FileOperationHandler;
  private readonly _settingsHandler: SettingsHandler;
  private readonly _contextHandler: ContextHandler;
  private readonly _slashCommandHandler: SlashCommandHandler;
  private readonly _conversationMessageHandler: ConversationMessageHandler;
  private readonly _characterDialogue: CharacterDialogueController;
  private readonly _embodyCharacter: EmbodyCharacterController;

  // Lifecycle
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _webviewDisposables: vscode.Disposable[] = [];
  private _webviewBindingGeneration = 0;
  private _projectionAttachmentServer?: ConversationProjectionAttachmentServer;
  private _projectionEndpointEpoch?: string;
  private _projectionEndpointRealmId?: string;
  private readonly _reportedProjectionErrors = new WeakSet<Error>();

  // Lazy getter for plugin slash commands (set by the command host after registry is ready)
  private _pluginCommandsGetter?: () => Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    extensionId: string;
  }>;

  // Services
  private _agentManager?: IAgentManager;
  private _editorRegistry?: IEditorRegistry;
  private _platform?: Platform;
  private _productPurposeText?: ICapabilityPurposeTextRuntime;
  private _taskManager?: IRuntimeTaskManager;
  private _configBridge?: ConfigBridge;
  private readonly _accountAiCatalog: AccountAiCatalogCache;
  private readonly _localResourceAccess: AgentLocalResourceAccess;
  private readonly _generatedAssetIndex: GeneratedAssetIndex | undefined;
  private readonly _dashboardWorkItems = new AgentDashboardWorkItemSource();
  private readonly _taskDeliveryBridge: TaskDeliveryBridge;
  // Note: _routerAskBroker and _workflowPlanHandler were removed alongside
  // the workflow/orchestrator layer. Pipeline intents now flow through the
  // Agent + Skill stack; no separate plan handler is needed.
  private readonly _dndBroker = new DragDropBroker();
  private _webviewReady = false;
  private _keyboardFocused = false;
  private _keyboardEditable = false;
  private _keyboardEditableUpdateSequence = 0;
  private _pendingContextPayload: {
    readonly payload: import('@neko/shared').AgentContextPayload;
    readonly tabId: string;
    readonly conversationId: string;
  } | null = null;
  private _pendingExternalMessage: { message: string; autoSend: boolean } | null = null;
  private _metadataRefreshPromise: Promise<void> | undefined;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _options: ChatViewProviderOptions,
  ) {
    // Initialize managers
    this._settings = new SettingsManager(undefined, _context.workspaceState);
    this._systemPrompt = new SystemPromptManager();
    this._systemPrompt.setLocale(vscode.env.language);
    this._accountAiCatalog = new AccountAiCatalogCache({
      getAuth: () => getNekoAuthAPI(),
      logger,
    });
    this._localResourceAccess =
      this._options.localResourceAccess ?? createChatLocalResourceAccess(_extensionUri, _context);
    this._generatedAssetIndex = this._options.generatedAssetIndex;
    this._conversations = new ConversationBridge(
      getCurrentWorkspaceRoot,
      this._localResourceAccess,
      () => getCapabilityRuntimeBindings().contentAccessRuntime,
      resolvePiConversationOptions(this._options.piConversations),
    );

    this._taskDeliveryBridge = new TaskDeliveryBridge({
      projectionSource: this._dashboardWorkItems.projectionSource,
      cursorStorage: new StateTaskDeliveryCursorStorage(
        'neko.agent.taskDeliveryCursors',
        this._context.globalState,
      ),
    });
    // Initialize handlers with empty deps (will be updated after service init)
    this._taskHandler = new TaskHandler({});
    this._skillHandler = new SkillHandler({});
    this._fileOperationHandler = new FileOperationHandler({});
    this._settingsHandler = new SettingsHandler({});
    this._contextHandler = new ContextHandler({
      conversations: this._conversations,
    });
    this._conversationMessageHandler = new ConversationMessageHandler({
      conversations: this._conversations,
      onConversationCreated: (conversationId) =>
        this._bindCreatedConversationToForegroundTab(conversationId),
      getWebview: () => this._view?.webview,
    });
    this._characterDialogue = new CharacterDialogueController({
      getWebview: () => this._view?.webview,
      getProjectRoot: () => getCurrentWorkspaceRoot(),
      createResponder: () =>
        createCharacterDialoguePurposeResponder(
          requireCharacterPurposeRuntime(this._productPurposeText, 'Character Dialogue'),
        ),
      evaluateTranscript: ({ artifact }) =>
        evaluateCharacterDialogueWithPurpose(
          requireCharacterPurposeRuntime(this._productPurposeText, 'Character evaluation'),
          artifact,
          vscode.env.language,
        ),
      enrichProfile: (input) => {
        const purposeModels = requireCharacterPurposeRuntime(
          this._productPurposeText,
          'Character profile enrichment',
        );
        const now = new Date().toISOString();
        return defaultEnrichCharacterProfile({
          ...input,
          now: () => now,
          inferFacts: (profile, observedAt) =>
            inferCharacterProfileFactsWithPurpose(purposeModels, profile, observedAt),
        });
      },
      getTabState: () => this._tabState,
      getActiveConversationId: () => this._conversations.getActiveId(),
      updateTabState: (openTabs, activeTabId) => this._updateTabState(openTabs, activeTabId),
      sendTabState: () => this._sendTabState(),
    });
    this._embodyCharacter = new EmbodyCharacterController({
      getWebview: () => this._view?.webview,
      getProjectRoot: () => getCurrentWorkspaceRoot(),
      createResponder: () =>
        createEmbodyCharacterPurposeResponder(
          requireCharacterPurposeRuntime(this._productPurposeText, 'Embody Character'),
        ),
      getTabState: () => this._tabState,
      updateTabState: (openTabs, activeTabId) => this._updateTabState(openTabs, activeTabId),
      sendTabState: () => this._sendTabState(),
    });

    // Load persisted tab state after role-session controllers exist because
    // restore filtering checks whether persisted role-session tabs are live.
    this._loadTabState();

    this._context.subscriptions.push(this._dashboardWorkItems);
    this._slashCommandHandler = new SlashCommandHandler({
      conversations: this._conversations,
      settings: this._settings,
      skillHandler: this._skillHandler,
      taskHandler: this._taskHandler,
      contextHandler: this._contextHandler,
      settingsHandler: this._settingsHandler,
      characterDialogue: this._characterDialogue,
      sendConversationList: () => this._conversationMessageHandler.sendConversationList(),
      sendActiveConversation: () => {
        void this._conversationMessageHandler.sendActiveConversation();
      },
    });

    // Get services - deferred initialization
    this._initializeServices();
  }

  private _initializeServices(): void {
    try {
      this._agentManager = getService(IAgentManagerId);
      this._editorRegistry = getService(IEditorRegistry);
      this._platform = getService(IPlatform);
      this._productPurposeText = getService(IProductPurposeTextRuntime);
      this._taskManager = getService(ITaskManager);

      if (this._platform) {
        // Inject ConfigManager into SettingsManager (late binding)
        this._settings.setConfigManager(this._platform.config);

        // Inject Platform into SystemPromptManager
        this._systemPrompt.setPlatform(this._platform);

        // Load AGENTS.md content
        this._systemPrompt.loadAgentsFile().catch((err) => {
          logger.error('Failed to load AGENTS.md:', err);
        });

        // Initialize ConfigBridge for unified config message handling
        this._configBridge = new ConfigBridge(
          this._platform,
          this._context,
          this._accountAiCatalog,
        );

        this._providers = new ProviderManager(this._platform, this._accountAiCatalog);
        this._messages = new AgentMessageTurnHandler(
          this._settings,
          this._providers,
          this._conversations,
          this._agentManager,
          this._editorRegistry,
          (_conversationId, executionMode) => this._systemPrompt.getPrompt(executionMode),
          this._platform,
          this._taskManager,
          undefined,
          this._dashboardWorkItems,
          this._localResourceAccess,
          {
            accountAiCatalog: this._accountAiCatalog,
            generatedAssetIndex: this._generatedAssetIndex,
          },
        );
        const piRuntime = getService(IPiAgentRuntimeManager);
        if (!piRuntime) {
          throw new Error('Pi Agent runtime manager is unavailable during Chat provider activation.');
        }
        this._skillHandler.setDependencies({
          listSkills: () => piRuntime.listSkillCatalog(),
          invoke: (webview, request) => this._messages!.handleUserMessage(webview, request),
        });
        this._dashboardWorkItems.updateDeps({
          platform: this._platform,
          taskManager: this._taskManager,
        });

        // Update handler dependencies via type-safe updateDeps()
        this._taskHandler.updateDeps({
          taskManager: this._taskManager,
          dashboardWorkItems: this._dashboardWorkItems,
          localResourceAccess: this._localResourceAccess,
          generatedAssetLookup: this._generatedAssetIndex,
        });
        this._fileOperationHandler.updateDeps({
          platform: this._platform,
          generatedAssetLookup: this._generatedAssetIndex,
        });
        this._settingsHandler.updateDeps({
          platform: this._platform,
          accountAiCatalog: this._accountAiCatalog,
          conversationSettings: this._settings,
        });
        this._contextHandler.updateDeps({ agentManager: this._agentManager });
        this._slashCommandHandler.updateDeps({
          agentManager: this._agentManager,
        });
        this._conversationMessageHandler.updateDeps({
          agentManager: this._agentManager,
          messages: this._messages,
        });
      }
    } catch (error) {
      logger.error('Failed to get services:', error);
    }
  }

  /**
   * Resolve the webview view when it becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._disposeWebviewBindings();
    this._view = webviewView;
    const bindingGeneration = this._webviewBindingGeneration;

    void this._initializeResolvedWebview(webviewView, bindingGeneration);
  }

  private async _initializeResolvedWebview(
    webviewView: vscode.WebviewView,
    bindingGeneration: number,
  ): Promise<void> {
    await this._localResourceAccess.configureChatWebview(webviewView.webview);
    if (bindingGeneration !== this._webviewBindingGeneration || this._view !== webviewView) {
      return;
    }
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    this._setupMessageHandlers(webviewView.webview);

    // Notify webview which neko-suite plugins are installed (ADR-5)
    postPluginsAvailable(webviewView.webview);

    this._webviewDisposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this._restoreState();
          this._replayUndeliveredTasks();
        } else {
          void this._setKeyboardFocused(false);
        }
      }),
    );

    this._replayUndeliveredTasks();
  }

  /**
   * Push the current canvas ambient selection to the webview so it can render
   * non-removable ambient chips in the input area.
   */
  public sendAmbientCanvasContext(
    nodes: import('../services/canvasAmbientContext').SelectedNodeSummary[],
    conversationId: string | null = this._conversations.getActiveId(),
  ): void {
    if (!this._view?.webview) return;
    this._view.webview.postMessage(buildChatAmbientCanvasUpdateMessage({ nodes, conversationId }));
  }

  /**
   * Forward an arbitrary typed message to the webview.
   * Used for low-priority notifications (e.g. generation progress) that don't
   * require the panel to be focused.
   */
  public postMessage(message: unknown): void {
    if (!this._view?.webview) return;
    this._view.webview.postMessage(message);
  }

  public get webview(): vscode.Webview | undefined {
    return this._view?.webview;
  }

  public getSelectedAgentConversationId(): string | null {
    return this._conversations.getActiveId();
  }

  public hasConversation(conversationId: string): boolean {
    return Boolean(this._conversations.get(conversationId));
  }

  /** Expose the DnD broker so the command host can register query/clear commands. */
  get dndBroker(): DragDropBroker {
    return this._dndBroker;
  }

  /**
   * Attach an agent context payload to the chat panel.
   * Focuses the panel and injects the chip + optional intent prefill.
   */
  public async sendContextPayload(
    payload: import('@neko/shared').AgentContextPayload,
  ): Promise<void> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    const target = requireActiveConversationTabBinding(this._tabState, 'send context payload');
    if (this._webviewReady && this._view?.webview) {
      this._view.webview.postMessage(buildChatContextInjectionMessage(payload, target));
    } else {
      this._pendingContextPayload = { payload, ...target };
    }
  }

  /**
   * Send a message to the AI assistant from external commands
   * Opens the assistant panel and prefills/sends the message
   */
  public async sendMessageToAssistant(message: string, autoSend: boolean = true): Promise<void> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);

    if (this._webviewReady && this._view?.webview) {
      this._view.webview.postMessage(buildChatExternalInputMessage({ message, autoSend }));
    } else {
      this._pendingExternalMessage = { message, autoSend };
    }
  }

  private async _requestTaskResultContinuation(
    request: AgentTaskResultFollowUpRequest,
  ): Promise<void> {
    const continueLabel = vscode.l10n.t('Continue');
    const selected = await vscode.window.showInformationMessage(
      vscode.l10n.t('Agent task {0} finished and is ready to continue.', request.taskId),
      continueLabel,
    );
    if (selected !== continueLabel) {
      return;
    }
    await this._dispatchTaskResultContinuation(request);
  }

  private async _dispatchTaskResultContinuation(
    request: AgentTaskResultFollowUpRequest,
  ): Promise<void> {
    if (!this._messages) {
      throw new Error('Cannot dispatch task-result continuation before message handler is ready');
    }
    if (!this._conversations.get(request.conversationId)) {
      throw new Error(
        `Cannot dispatch task-result continuation for unknown conversation: ${request.conversationId}`,
      );
    }

    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    const webview = this._view?.webview;
    if (!webview) {
      throw new Error('Cannot dispatch task-result continuation without an assistant webview');
    }

    this._conversations.switchTo(request.conversationId);
    this._syncCanvasAmbientScopeFromActiveConversation();
    void this._conversationMessageHandler.sendActiveConversation();
    await this._messages.handleTaskResultContinuation(webview, request);
  }

  /**
   * Push the current plugin slash command list to the webview.
   * Called on initial load and whenever the SlashCommandRegistry changes.
   */
  public sendPluginSlashCommands(
    commands: Array<{
      id: string;
      name: string;
      description: string;
      icon?: string;
      extensionId: string;
    }>,
  ): void {
    if (!this._view?.webview) return;
    this._view.webview.postMessage(buildChatPluginCommandsMessage(commands));
  }

  /**
   * Register a getter for plugin slash commands so _restoreState can push them
   * on panel visibility restore.
   */
  public setPluginCommandsGetter(
    getter: () => Array<{
      id: string;
      name: string;
      description: string;
      icon?: string;
      extensionId: string;
    }>,
  ): void {
    this._pluginCommandsGetter = getter;
  }

  /**
   * Set up message handlers for webview communication
   */
  private _setupMessageHandlers(webview: vscode.Webview) {
    if (this._projectionAttachmentServer) {
      throw new Error(
        'Projection attachment server already exists for the active Webview endpoint.',
      );
    }
    const endpointEpoch = randomUUID();
    this._projectionEndpointEpoch = endpointEpoch;
    this._projectionEndpointRealmId = undefined;
    this._projectionAttachmentServer = this._createProjectionAttachmentServer(
      webview,
      endpointEpoch,
    );

    // Register webview for broadcasts (skills, commands, etc.)
    const postMessageFn = (msg: unknown) => webview.postMessage(msg);
    if (this._configBridge) {
      this._webviewDisposables.push(this._configBridge.registerWebview(postMessageFn));
    }

    this._webviewDisposables.push(
      webview.onDidReceiveMessage(async (raw: unknown) => {
        const message = parseWebviewToExtensionMessage(raw);
        if (!message) {
          const invalidMessage =
            buildMissingSessionIdentityDiagnostic(raw) ?? buildInvalidWebviewPayloadMessage(raw);
          logger.warn('Rejected invalid webview message payload', {
            code: invalidMessage.code,
            action: invalidMessage.action,
            message: invalidMessage.message,
          });
          webview.postMessage(invalidMessage);
          return;
        }

        if (message.type === 'getConfig' || message.type === 'refreshConfigSnapshot') {
          postPluginsAvailable(webview);
        }

        if (message.type === 'webviewKeyboardFocus') {
          void this._setKeyboardFocused(message.focused);
          return;
        }

        if (message.type === 'webviewKeyboardEditable') {
          void this._setKeyboardEditable(message.editable);
          return;
        }

        // 1. Delegate config messages to ConfigBridge
        if (this._configBridge) {
          const handled = await this._configBridge.handleMessage(message, postMessageFn);
          if (handled) return;
        }

        const projectionAttachments = this._projectionAttachmentServer;
        if (!projectionAttachments) {
          throw new Error('Projection attachment server is unavailable for the active Webview.');
        }
        handleChatWebviewMessage(message, {
          webview,
          projectionAttachments,
          announceProjectionEndpoint: (protocolVersion, realmId) =>
            this._announceProjectionEndpoint(webview, protocolVersion, realmId),
          reportProjectionProtocolError: (error, key) =>
            this._reportProjectionProtocolError(webview, error, key),
          messages: this._messages,
          characterDialogue: this._characterDialogue,
          embodyCharacter: this._embodyCharacter,
          taskHandler: this._taskHandler,
          skillHandler: this._skillHandler,
          fileOperationHandler: this._fileOperationHandler,
          settingsHandler: this._settingsHandler,
          contextHandler: this._contextHandler,
          slashCommandHandler: this._slashCommandHandler,
          conversationMessageHandler: this._conversationMessageHandler,
          dndBroker: this._dndBroker,
          refreshConfigSnapshot: () => this._refreshConfigSnapshot(webview, postMessageFn),
          sendTabState: () => this._sendTabState(),
          activateConversation: (message) => this._activateConversation(message),
          updateTabState: (message) =>
            this._updateTabState(
              message.openTabs,
              message.activeTabId,
              message.expectedTabStateRevision,
            ),
          syncCanvasAmbientScopeFromActiveConversation: () =>
            this._syncCanvasAmbientScopeFromActiveConversation(),
          resolveLifecycleCapabilityDescriptor: (capabilityId) =>
            getCapabilityDiscoveryService().getLifecycleCapabilityDescriptor(capabilityId),
        });
      }),
    );
  }

  private _createProjectionAttachmentServer(
    webview: vscode.Webview,
    endpointEpoch: string,
  ): ConversationProjectionAttachmentServer {
    const server = createConversationProjectionAttachmentServer({
      endpointEpoch,
      resolveProjection: (conversationId) => {
        if (!this._agentManager) {
          throw new Error('AgentManager is required to resolve conversation projection authority.');
        }
        return this._agentManager.getOrCreateProjection(conversationId);
      },
      postMessage: async (frame) => {
        if (this._projectionAttachmentServer !== server) return true;
        const projectedFrame = await projectConversationProjectionAttachmentFrameForWebview(frame, {
          webview,
          localResourceAccess: this._localResourceAccess,
          contentAccessRuntime: getCapabilityRuntimeBindings().contentAccessRuntime,
          localMediaCaller: 'neko-agent.projection-attachment',
          documentResourceCaller: 'neko-agent.projection-document-resource',
        });
        return Boolean(await webview.postMessage(projectedFrame));
      },
      reportError: (error, key) => this._reportProjectionProtocolError(webview, error, key),
    });
    return server;
  }

  private _announceProjectionEndpoint(
    webview: vscode.Webview,
    protocolVersion: number,
    realmId: string,
  ): void {
    if (this._view?.webview !== webview) {
      throw new Error('Cannot announce a replaced projection endpoint.');
    }
    const endpointEpoch = this._projectionEndpointEpoch;
    if (!endpointEpoch) {
      throw new Error('Projection endpoint epoch is unavailable for the active Webview.');
    }
    if (protocolVersion !== AGENT_WEBVIEW_PROTOCOL_VERSION) {
      void webview.postMessage(
        buildAgentSessionDiagnosticMessage({
          code: 'webview-protocol-mismatch',
          action: 'projectionEndpointDiscover',
          message: `Agent Webview protocol mismatch: Extension expects v${AGENT_WEBVIEW_PROTOCOL_VERSION}, Webview sent v${protocolVersion}. Reload the Webview.`,
        }),
      );
      return;
    }
    if (this._projectionEndpointRealmId !== realmId) {
      const replacedRealm = this._projectionEndpointRealmId !== undefined;
      this._projectionEndpointRealmId = realmId;
      if (replacedRealm) {
        const previousServer = this._projectionAttachmentServer;
        const replacementEpoch = randomUUID();
        this._projectionEndpointEpoch = replacementEpoch;
        this._projectionAttachmentServer = this._createProjectionAttachmentServer(
          webview,
          replacementEpoch,
        );
        void previousServer?.abandon().catch((error: unknown) => {
          logger.error('Failed to abandon replaced Webview projection realm', error);
        });
      }
    }
    const currentEndpointEpoch = this._projectionEndpointEpoch;
    if (!currentEndpointEpoch) {
      throw new Error('Projection endpoint epoch disappeared during realm discovery.');
    }
    void webview.postMessage({
      type: 'projectionEndpointReady',
      protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION,
      realmId,
      endpointEpoch: currentEndpointEpoch,
    });
    if (this._webviewReady) return;
    this._webviewReady = true;
    this._flushPendingMessages();
    this._replayUndeliveredTasks();
  }

  private _refreshConfigSnapshot(
    webview: vscode.Webview,
    postMessage: (message: unknown) => Thenable<boolean>,
  ): void {
    if (!this._platform) return;
    this._platform.config.reloadConfig();
    const conversationId = this._conversations.getActiveId();
    if (conversationId) {
      void this._settingsHandler.sendSettings(webview, { conversationId });
    }
    void this._configBridge?.sendConfigState(postMessage);
  }

  // ============================================================================
  // State Methods
  // ============================================================================

  private _restoreState(): void {
    const webview = this._view?.webview;
    const plan = buildChatRestorePlan({
      tabState: this._tabState,
      tabStateRevision: this._tabStateRevision,
      hasWebview: Boolean(webview),
      pluginCommands: this._pluginCommandsGetter?.(),
    });

    for (const action of plan.actions) {
      switch (action.type) {
        case 'syncCanvasAmbientScope':
          this._syncCanvasAmbientScopeFromActiveConversation();
          break;
        case 'sendConversationList':
          this._conversationMessageHandler.sendConversationList();
          break;
        case 'sendSettings':
          if (webview) {
            void this._settingsHandler.sendSettings(webview, {
              conversationId: action.conversationId,
            });
          }
          break;
        case 'postTabState':
          webview?.postMessage(action.message);
          break;
        case 'sendActiveConversationTasks':
          if (webview) {
            const conversationId = this._conversations.getActiveId();
            if (conversationId) {
              this._taskHandler.sendTasks(webview, conversationId);
            }
          }
          break;
        case 'sendAgentStateSnapshot':
          if (webview) {
            this._conversationMessageHandler.sendAgentStateSnapshot(webview);
          }
          break;
        case 'postPluginCommands':
          webview?.postMessage(action.message);
          break;
      }
    }
  }

  // ============================================================================
  // Tab State Methods
  // ============================================================================

  private _loadTabState(): void {
    const persistedTabState = this._context.workspaceState.get<unknown>(
      ChatViewProvider.TAB_STATE_KEY,
    );
    const persistedWriteMetadata = parseTabStateWriteMetadata(
      this._context.workspaceState.get<unknown>(ChatViewProvider.TAB_STATE_WRITE_METADATA_KEY),
    );
    this._tabStateRevision = persistedWriteMetadata?.revision ?? 0;
    const restored = normalizeTabState(persistedTabState);

    // Startup no longer restores previously open tabs. Conversation history
    // remains available from the menu; tab restoration is user-driven.
    this._tabState = { openTabs: [], activeTabId: null };
    this._conversations.clearActive();

    if (restored.openTabs.length > 0 || restored.activeTabId !== null) {
      this._saveTabState();
    }
  }

  private _syncCanvasAmbientScopeFromActiveConversation(): void {
    const conversationId = this._conversations.getActiveId();
    const nodes = conversationId ? setActiveCanvasAmbientScope(conversationId) : [];
    if (!conversationId) {
      setActiveCanvasAmbientScope(null);
    }
    this.sendAmbientCanvasContext(nodes, conversationId);
  }

  private _saveTabState(): void {
    const currentWriteMetadata = parseTabStateWriteMetadata(
      this._context.workspaceState.get<unknown>(ChatViewProvider.TAB_STATE_WRITE_METADATA_KEY),
    );
    if (
      currentWriteMetadata &&
      currentWriteMetadata.revision !== this._tabStateRevision &&
      currentWriteMetadata.ownerId !== this._tabStateWriterId
    ) {
      logger.warn('neko.agent.tab_state.stale_write_possible', {
        ...this._getActiveTabLogIdentity(),
        ownerId: this._tabStateWriterId,
        loadedRevision: this._tabStateRevision,
        currentOwnerId: currentWriteMetadata.ownerId,
        currentRevision: currentWriteMetadata.revision,
      });
      this._tabStateRevision = currentWriteMetadata.revision;
    }
    const writeMetadata: TabStateWriteMetadata = {
      ownerId: this._tabStateWriterId,
      revision: this._tabStateRevision + 1,
      updatedAt: Date.now(),
    };
    this._context.workspaceState.update(ChatViewProvider.TAB_STATE_KEY, this._tabState);
    this._context.workspaceState.update(
      ChatViewProvider.TAB_STATE_WRITE_METADATA_KEY,
      writeMetadata,
    );
    this._tabStateRevision = writeMetadata.revision;
    logger.debug('neko.agent.tab_state.persist', {
      ...this._getActiveTabLogIdentity(),
      ownerId: writeMetadata.ownerId,
      revision: writeMetadata.revision,
    });
  }

  private _sendTabState(): void {
    if (!this._view) return;
    this._view.webview.postMessage(
      buildChatTabStateMessage(this._tabState, this._tabStateRevision),
    );
  }

  private _bindCreatedConversationToForegroundTab(conversationId: string): void {
    const conversation = this._conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Cannot bind missing created conversation ${conversationId} to a Tab.`);
    }
    const existingTab = this._tabState.openTabs.find(
      (tab) => tab.conversationId === conversationId,
    );
    const tab = existingTab ?? {
      id: `tab-${conversationId}`,
      title: conversation.title || 'New Chat',
      conversationId,
    };
    this._tabState = {
      openTabs: existingTab ? this._tabState.openTabs : [...this._tabState.openTabs, tab],
      activeTabId: tab.id,
    };
    this._saveTabState();
    this._sendTabState();
  }

  private _activateConversation(message: ActivateConversationWebviewMessage): void {
    const activeTab = message.tabState.openTabs.find((tab) => tab.id === message.tabId);
    if (
      message.tabState.activeTabId !== message.tabId ||
      !activeTab ||
      activeTab.conversationId !== message.conversationId ||
      (activeTab.kind !== undefined && activeTab.kind !== 'chat')
    ) {
      this._postTabActivationDiagnostic({
        code: 'invalid-conversation-activation',
        action: 'activate-conversation',
        message: 'Conversation activation does not match the requested ordinary Tab state.',
        conversationId: message.conversationId,
        tabId: message.tabId,
      });
      this._sendTabState();
      return;
    }
    if (
      !this._acceptExpectedTabStateRevision(message.expectedTabStateRevision, {
        action: 'activate-conversation',
        conversationId: message.conversationId,
        tabId: message.tabId,
      })
    ) {
      return;
    }

    const result = updateTabStateRuntime(
      {
        openTabs: message.tabState.openTabs,
        activeTabId: message.tabState.activeTabId,
      },
      {
        hasConversation: (conversationId) => Boolean(this._conversations.get(conversationId)),
        hasCharacterDialogueSession: (sessionId) => this._characterDialogue.hasSession(sessionId),
        hasEmbodyCharacterSession: (sessionId) => this._embodyCharacter.hasSession(sessionId),
        getActiveConversationId: () => this._conversations.getActiveId(),
        switchConversation: (conversationId) => this._conversations.switchTo(conversationId),
        shouldClearActiveConversationForEmptyTabState: (conversationId) =>
          this._shouldClearActiveConversationForEmptyTabState(conversationId),
        clearActiveConversation: () => this._conversations.clearActive(),
      },
    );
    if (
      result.sync.kind !== 'switched' &&
      !(result.sync.kind === 'skipped' && result.sync.reason === 'already-active')
    ) {
      this._postTabActivationDiagnostic({
        code: 'invalid-conversation-activation',
        action: 'activate-conversation',
        message: `Host rejected conversation activation: ${result.sync.kind === 'skipped' ? result.sync.reason : result.sync.kind}.`,
        conversationId: message.conversationId,
        tabId: message.tabId,
      });
      this._sendTabState();
      return;
    }

    this._tabState = result.tabState;
    this._saveTabState();
    this._syncCanvasAmbientScopeFromActiveConversation();
    void this._conversationMessageHandler.sendActiveConversation({
      activationId: message.activationId,
      tabStateRevision: this._tabStateRevision,
    });
  }

  private _acceptExpectedTabStateRevision(
    expectedRevision: number,
    request: {
      readonly action: 'activate-conversation' | 'tab-state-mutation';
      readonly conversationId?: string;
      readonly tabId?: string;
    },
  ): boolean {
    if (expectedRevision === this._tabStateRevision) return true;
    this._postTabActivationDiagnostic({
      code: 'stale-tab-state-revision',
      action: request.action,
      message: `Tab state revision mismatch: expected ${expectedRevision}, current ${this._tabStateRevision}.`,
      ...(request.conversationId ? { conversationId: request.conversationId } : {}),
      ...(request.tabId ? { tabId: request.tabId } : {}),
    });
    this._sendTabState();
    return false;
  }

  private _postTabActivationDiagnostic(input: {
    readonly code: 'stale-tab-state-revision' | 'invalid-conversation-activation';
    readonly action: 'activate-conversation' | 'tab-state-mutation';
    readonly message: string;
    readonly conversationId?: string;
    readonly tabId?: string;
  }): void {
    this._view?.webview.postMessage(
      buildAgentSessionDiagnosticMessage({
        code: input.code,
        severity: 'error',
        action: input.action,
        message: input.message,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.tabId ? { tabId: input.tabId } : {}),
        activeConversationId: this._conversations.getActiveId() ?? null,
        activeTabConversationId:
          this._tabState.openTabs.find((tab) => tab.id === this._tabState.activeTabId)
            ?.conversationId ?? null,
      }),
    );
  }

  private _updateTabState(
    openTabs: OpenTab[],
    activeTabId: string | null,
    expectedRevision?: number,
  ): void {
    if (
      expectedRevision !== undefined &&
      !this._acceptExpectedTabStateRevision(expectedRevision, { action: 'tab-state-mutation' })
    ) {
      return;
    }

    const requestedActiveTab = activeTabId
      ? openTabs.find((tab) => tab.id === activeTabId)
      : undefined;
    if (
      expectedRevision !== undefined &&
      requestedActiveTab &&
      (requestedActiveTab.kind === undefined || requestedActiveTab.kind === 'chat') &&
      requestedActiveTab.conversationId !== this._conversations.getActiveId()
    ) {
      this._postTabActivationDiagnostic({
        code: 'invalid-conversation-activation',
        action: 'tab-state-mutation',
        message:
          'Ordinary conversation activation must use the atomic activateConversation transaction.',
        conversationId: requestedActiveTab.conversationId,
        tabId: requestedActiveTab.id,
      });
      this._sendTabState();
      return;
    }

    const result = updateTabStateRuntime(
      { openTabs, activeTabId },
      {
        hasConversation: (conversationId) => Boolean(this._conversations.get(conversationId)),
        hasCharacterDialogueSession: (sessionId) => this._characterDialogue.hasSession(sessionId),
        hasEmbodyCharacterSession: (sessionId) => this._embodyCharacter.hasSession(sessionId),
        getActiveConversationId: () => this._conversations.getActiveId(),
        switchConversation: (conversationId) => this._conversations.switchTo(conversationId),
        shouldClearActiveConversationForEmptyTabState: (conversationId) =>
          this._shouldClearActiveConversationForEmptyTabState(conversationId),
        clearActiveConversation: () => this._conversations.clearActive(),
        onConversationSwitched: () => {
          this._syncCanvasAmbientScopeFromActiveConversation();
          void this._conversationMessageHandler.sendActiveConversation();
        },
      },
    );
    this._tabState = result.tabState;
    this._saveTabState();

    const logIdentity = this._getActiveTabLogIdentity();
    logger.debug('neko.agent.tab_state.update', {
      ...logIdentity,
      openTabCount: this._tabState.openTabs.length,
      sync: result.sync,
    });
    if (result.sync.kind === 'skipped' && result.sync.reason === 'switch-rejected') {
      logger.warn('neko.agent.tab_state.switch_rejected', {
        ...logIdentity,
        conversationId: result.sync.conversationId ?? logIdentity.conversationId,
        sync: result.sync,
      });
    }
  }

  private _shouldClearActiveConversationForEmptyTabState(conversationId: string): boolean {
    return !this._messages
      ?.getAgentStateSnapshot()
      .some((state) => state.conversationId === conversationId);
  }

  private _getActiveTabLogIdentity(): {
    readonly tabId?: string;
    readonly conversationId?: string;
  } {
    const activeTabId = this._tabState.activeTabId;
    const activeTab = activeTabId
      ? this._tabState.openTabs.find((tab) => tab.id === activeTabId)
      : undefined;
    return {
      ...(activeTabId ? { tabId: activeTabId } : {}),
      ...(activeTab?.conversationId ? { conversationId: activeTab.conversationId } : {}),
    };
  }

  public async startCharacterDialogue(
    request: import('@neko/shared').NpcTestBenchLaunchRequest,
  ): Promise<import('./characterDialogueController').CharacterDialogueLaunchResult | null> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    return this._characterDialogue.launch(request);
  }

  public refreshSharedMetadata(): Promise<void> {
    if (this._metadataRefreshPromise) return this._metadataRefreshPromise;
    this._metadataRefreshPromise = this._refreshSharedMetadata().finally(() => {
      this._metadataRefreshPromise = undefined;
    });
    return this._metadataRefreshPromise;
  }

  private async _refreshSharedMetadata(): Promise<void> {
    const pollRevisions = this._options.localMetadata?.pollRevisions;
    const result = pollRevisions ? await pollRevisions() : { changedDomains: [] };
    const changedDomains = new Set(result.changedDomains);
    const reconciled = await this._conversations.refreshFromPiAuthority();
    if (reconciled.upsertedIds.length > 0 || reconciled.removedIds.length > 0) {
      this._conversationMessageHandler.sendConversationList();
    }
    if (changedDomains.has('tasks') && this._taskManager) {
      await this._taskManager.initialize();
      const webview = this._view?.webview;
      const conversationId = this._conversations.getActiveId();
      if (webview && conversationId) {
        await this._taskHandler.sendTasks(webview, conversationId);
      }
    }
  }

  public async startCharacterDialogueFromSlash(args?: string): Promise<void> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    await this._characterDialogue.launchFromSlash({
      args,
      conversationId: this._conversations.getActiveId() ?? undefined,
    });
  }

  public exitCharacterDialogue(
    sessionId?: string,
  ): Promise<import('./characterDialogueController').CharacterDialogueExitResult | null> {
    return sessionId
      ? this._characterDialogue.exit(sessionId)
      : this._characterDialogue.exitActive();
  }

  public async startEmbodyCharacter(request: NpcAgentWorkflowRequest): Promise<{
    readonly ok: true;
    readonly sessionId: string;
  }> {
    await vscode.commands.executeCommand(NEKO_AI_ASSISTANT_FOCUS_COMMAND);
    const result = await this._embodyCharacter.launch(request);
    return { ok: true, sessionId: result?.sessionId ?? '' };
  }

  private _getSelectedChatModelRef(): import('@neko-agent/types').ModelRef<'llm'> | undefined {
    const conversationId = this._conversations.getActiveId();
    if (!conversationId) return undefined;
    const settings = this._settings.snapshotForConversation(conversationId);
    const modelId = settings.selectedModelId;
    if (!modelId) return undefined;
    const providerId = settings.selectedProviderId;
    if (!providerId) return undefined;
    return { providerId, modelId, category: 'llm' };
  }

  // ============================================================================
  // HTML Generation
  // ============================================================================

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;
    const assetVersion = encodeURIComponent(nonce);

    const scriptUri = appendWebviewAssetVersion(
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant.js'),
      ),
      assetVersion,
    );
    const styleUri = appendWebviewAssetVersion(
      webview.asWebviewUri(
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assistant-style.css'),
      ),
      assetVersion,
    );

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource} https: data:;">
  <title>AI Assistant</title>
  <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this._disposeWebviewBindings();
    this._messages?.dispose();
    this._characterDialogue.dispose();
    this._embodyCharacter.dispose();
    const localMetadata = this._options.localMetadata;
    if (localMetadata) {
      void this._conversations
        .disposeAsync()
        .then(() => localMetadata.disposeHost())
        .catch((error: unknown) => {
          logger.warn('Failed to dispose local metadata storage', error);
        });
    } else {
      this._conversations.dispose();
    }
    this._localResourceAccess.dispose();
    this._generatedAssetIndex?.dispose();
    this._configBridge?.dispose();
    this._configBridge = undefined;

    for (const disposable of this._disposables.splice(0)) {
      try {
        disposable.dispose();
      } catch (error) {
        logger.warn('Failed to dispose chat provider resource', error);
      }
    }
  }

  private _flushPendingMessages(): void {
    const webview = this._view?.webview;
    if (!webview) return;

    if (this._pendingContextPayload) {
      const request = this._pendingContextPayload;
      this._pendingContextPayload = null;
      webview.postMessage(
        buildChatContextInjectionMessage(request.payload, {
          tabId: request.tabId,
          conversationId: request.conversationId,
        }),
      );
    }

    if (this._pendingExternalMessage) {
      const { message, autoSend } = this._pendingExternalMessage;
      this._pendingExternalMessage = null;
      webview.postMessage(buildChatExternalInputMessage({ message, autoSend }));
    }
  }

  private _replayUndeliveredTasks(): void {
    const webview = this._view?.webview;
    const conversationId = this._conversations.getActiveId();
    if (!webview || !conversationId) {
      return;
    }

    this._taskDeliveryBridge.replayConversation(conversationId, webview).catch((error) => {
      logger.warn('Failed to replay undelivered task results', error);
    });
  }

  private _disposeWebviewBindings(): void {
    this._webviewBindingGeneration += 1;
    this._webviewReady = false;
    this._projectionEndpointEpoch = undefined;
    this._projectionEndpointRealmId = undefined;
    const projectionAttachmentServer = this._projectionAttachmentServer;
    this._projectionAttachmentServer = undefined;
    if (projectionAttachmentServer) {
      void projectionAttachmentServer.dispose().catch((error: unknown) => {
        logger.error('Failed to dispose projection attachment endpoint', error);
      });
    }
    void this._setKeyboardFocused(false);
    for (const disposable of this._webviewDisposables.splice(0)) {
      try {
        disposable.dispose();
      } catch (error) {
        logger.warn('Failed to dispose webview binding', error);
      }
    }
  }

  private _reportProjectionProtocolError(
    webview: vscode.Webview,
    error: Error,
    key: ProjectionAttachmentKey,
  ): void {
    if (this._reportedProjectionErrors.has(error)) return;
    this._reportedProjectionErrors.add(error);
    logger.error('Projection attachment protocol failed', { error, key });
    void webview.postMessage({
      type: 'projectionProtocolDiagnostic',
      key,
      code: classifyProjectionProtocolError(error),
      severity: 'error',
      fatal: true,
      message: error.message,
    });
  }

  private async _setKeyboardFocused(focused: boolean): Promise<void> {
    if (this._keyboardFocused === focused) {
      if (!focused) {
        await this._setKeyboardEditable(false);
      }
      return;
    }

    this._keyboardFocused = focused;
    if (!focused) {
      await this._setKeyboardEditable(false);
    }
  }

  private async _setKeyboardEditable(editable: boolean): Promise<void> {
    const nextEditable = editable && this._keyboardFocused;
    if (this._keyboardEditable === nextEditable) {
      return;
    }

    this._keyboardEditable = nextEditable;
    const updateSequence = ++this._keyboardEditableUpdateSequence;

    try {
      await updateWebviewKeyboardEditableOwner(AGENT_KEYBOARD_EDITABLE_OWNER_ID, nextEditable);
    } catch (error) {
      logger.warn('Failed to update global Webview keyboard editable owner', error);
    }

    if (this._keyboardEditableUpdateSequence !== updateSequence) {
      return;
    }

    try {
      await vscode.commands.executeCommand(
        'setContext',
        AGENT_KEYBOARD_EDITABLE_CONTEXT,
        nextEditable,
      );
    } catch (error) {
      logger.warn('Failed to update agent keyboard editable context', error);
    }
  }
}

/**
 * Generate a random nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function appendWebviewAssetVersion(uri: vscode.Uri, version: string): string {
  const uriText = uri.toString();
  const separator = uriText.includes('?') ? '&' : '?';
  return `${uriText}${separator}v=${version}`;
}
