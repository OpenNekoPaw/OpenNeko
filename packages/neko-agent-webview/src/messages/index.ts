/** Type-safe messages from the Agent surface to its injected Desktop host runtime. */
import type {
  AgentHostRuntimeAdapter,
  AgentHostRuntimeSubscription,
  InvokeAgentCapabilityLifecycleWebviewMessage,
  RequestCanvasAuthoringHandoffWebviewMessage,
  PluginTransferPayload,
  SendMessageWebviewMessage,
  AgentWebviewToHostMessage,
} from '@neko-agent/types';
import type { ContentLocator, DocumentLocator } from '@neko/shared';
import type { AgentContextType } from '@neko/shared';

export type { AgentHostRuntimeAdapter, AgentHostRuntimeSubscription };

const missingDesktopRuntime = (): never => {
  throw new Error('Agent Webview requires an injected Desktop host runtime adapter.');
};

let currentAgentHostRuntimeAdapter: AgentHostRuntimeAdapter = {
  hostKind: 'electron',
  runtimeId: 'neko.agent.webview.unconfigured',
  send: missingDesktopRuntime,
  subscribe: missingDesktopRuntime,
  getState: missingDesktopRuntime,
  setState: missingDesktopRuntime,
};

export function setAgentHostRuntimeAdapter(
  adapter: AgentHostRuntimeAdapter,
): AgentHostRuntimeSubscription {
  const previous = currentAgentHostRuntimeAdapter;
  currentAgentHostRuntimeAdapter = adapter;
  return {
    dispose(): void {
      currentAgentHostRuntimeAdapter = previous;
    },
  };
}

export function getAgentHostRuntimeAdapter(): AgentHostRuntimeAdapter {
  return currentAgentHostRuntimeAdapter;
}

function postWebviewMessage(message: AgentWebviewToHostMessage): void {
  currentAgentHostRuntimeAdapter.send(message);
}

function requireConversationId(messageType: string, conversationId: string): string {
  if (conversationId.trim().length === 0) {
    throw new Error(`${messageType} requires non-empty conversationId`);
  }
  return conversationId;
}

function postConversationMessage<
  TMessage extends AgentWebviewToHostMessage & {
    readonly conversationId: string;
  },
>(message: TMessage): void {
  requireConversationId(message.type, message.conversationId);
  postWebviewMessage(message);
}

/**
 * Type-safe message builders for Agent Webview ↔ host runtime communication.
 * Each method constructs and sends a properly typed message.
 */
export const AgentHostMessages = {
  /**
   * Send a chat message to the AI assistant.
   * conversationId and model refs are explicit to avoid multi-tab leakage.
   */
  sendMessage: (payload: Omit<SendMessageWebviewMessage, 'type'>) => {
    postConversationMessage({ type: 'sendMessage', ...payload });
  },

  /** Create a new conversation */
  newConversation: () => {
    postWebviewMessage({ type: 'newConversation' });
  },

  /** Activate an ordinary conversation and its Tab projection atomically. */
  activateConversation: (
    request: Omit<import('@neko-agent/types').ActivateConversationWebviewMessage, 'type'>,
  ) => {
    postConversationMessage({ type: 'activateConversation', ...request });
  },

  /**
   * Delete a conversation
   * @param conversationId - The conversation ID to delete
   */
  deleteConversation: (conversationId: string, options?: { activateNext?: boolean }) => {
    postConversationMessage({
      type: 'deleteConversation',
      conversationId,
      ...(options?.activateNext !== undefined ? { activateNext: options.activateNext } : {}),
    });
  },

  /** Clear all conversations */
  clearAllConversations: () => {
    postWebviewMessage({ type: 'clearAllConversations' });
  },

  /** Request the list of all conversations */
  getConversations: () => {
    postWebviewMessage({ type: 'getConversations' });
  },

  /** Request the active conversation data */
  getActiveConversation: () => {
    postWebviewMessage({ type: 'getActiveConversation' });
  },

  /** Request current settings */
  getSettings: (conversationId: string) => {
    postConversationMessage({ type: 'getSettings', conversationId });
  },

  /** Request a cache-only historical snapshot for one bound conversation. */
  getConversationSnapshot: (conversationId: string) => {
    postConversationMessage({ type: 'getConversationSnapshot', conversationId });
  },

  /** Request a lifecycle-scoped config/settings snapshot */
  refreshConfigSnapshot: () => {
    postWebviewMessage({ type: 'refreshConfigSnapshot' });
  },

  /** Clear all conversation history */
  clearHistory: (conversationId: string) => {
    postConversationMessage({ type: 'clearHistory', conversationId });
  },

  /**
   * Search for files in the project
   * @param filter - Search filter string
   */
  searchProjectFiles: (
    filter: string,
    conversationId: string | undefined,
    options: { readonly purpose?: 'roleplay' | 'entry' } = {},
  ) => {
    const scopedConversationId =
      conversationId === undefined
        ? undefined
        : requireConversationId('searchProjectFiles', conversationId);
    postWebviewMessage({
      type: 'searchProjectFiles',
      filter,
      ...(scopedConversationId ? { conversationId: scopedConversationId } : {}),
      ...(options.purpose ? { purpose: options.purpose } : {}),
    });
  },

  /**
   * Update settings
   * @param settings - Settings object to update
   */
  updateSettings: (settings: Record<string, unknown>, conversationId: string) => {
    postConversationMessage({
      type: 'updateSettings',
      settings,
      conversationId: requireConversationId('updateSettings', conversationId),
    });
  },

  /**
   * Confirm or reject a tool execution
   * @param toolCallId - The tool call ID
   * @param approved - Whether the tool is approved
   * @param conversationId - Conversation ID for multi-tab safety
   */
  confirmTool: (toolCallId: string, approved: boolean, conversationId: string) => {
    postConversationMessage({ type: 'confirmTool', toolCallId, approved, conversationId });
  },

  /**
   * Cancel the current AI message generation
   * Stops the agent execution and streaming response
   * @param conversationId - Conversation ID for multi-tab safety
   */
  cancelMessage: (conversationId: string) => {
    postConversationMessage({ type: 'cancelMessage', conversationId });
  },

  /** Request the authoritative pending message queue for a conversation. */
  getMessageQueue: (conversationId: string) => {
    postConversationMessage({ type: 'getMessageQueue', conversationId });
  },

  /** Promote a queued message so it runs next after the active turn. */
  promoteQueuedMessage: (conversationId: string, queueItemId: string) => {
    postConversationMessage({ type: 'promoteQueuedMessage', conversationId, queueItemId });
  },

  /** Cancel a queued message without cancelling the active response. */
  cancelQueuedMessage: (conversationId: string, queueItemId: string) => {
    postConversationMessage({ type: 'cancelQueuedMessage', conversationId, queueItemId });
  },

  /** Remove a queued message and ask Webview to restore it into the composer. */
  editQueuedMessage: (tabId: string, conversationId: string, queueItemId: string) => {
    postConversationMessage({ type: 'editQueuedMessage', tabId, conversationId, queueItemId });
  },

  /** Exit an active Embody Character feedback session */
  exitEmbodyCharacterSession: (sessionId: string) => {
    postWebviewMessage({ type: 'exitEmbodyCharacterSession', sessionId });
  },

  /** Request current agent states snapshot */
  getAgentStates: () => {
    postWebviewMessage({ type: 'getAgentStates' });
  },

  /** Request full configuration from extension */
  getConfig: () => {
    postWebviewMessage({ type: 'getConfig' });
  },

  /** Request skills used by the input slash-command catalog */
  getSkills: () => {
    postWebviewMessage({ type: 'getSkills' });
  },

  /** Open the raw user config in the Desktop editor. */
  openUserConfigFile: () => {
    postWebviewMessage({ type: 'openUserConfigFile' });
  },

  /** Open the Agent config file in the Desktop editor. */
  openConfigFile: () => {
    postWebviewMessage({ type: 'openConfigFile' });
  },

  // ==========================================================================
  // Context Management
  // ==========================================================================

  /**
   * Get context token count for a conversation
   * @param conversationId - The conversation ID
   */
  getContextTokenCount: (conversationId: string) => {
    postConversationMessage({ type: 'getContextTokenCount', conversationId });
  },

  /**
   * Trigger context compression for a conversation
   * @param conversationId - The conversation ID
   */
  compressContext: (conversationId: string) => {
    postConversationMessage({ type: 'compressContext', conversationId });
  },

  // ==========================================================================
  // Tab State Operations
  // ==========================================================================

  /** Request the current tab state */
  getTabState: () => {
    postWebviewMessage({ type: 'getTabState' });
  },

  /**
   * Update tab state (persist to extension)
   * @param openTabs - Array of open tabs
   * @param activeTabId - Currently active tab ID
   */
  updateTabState: (
    openTabs: Array<import('@neko-agent/types').OpenTab>,
    activeTabId: string | null,
    expectedTabStateRevision: number,
  ) => {
    postWebviewMessage({
      type: 'updateTabState',
      openTabs,
      activeTabId,
      expectedTabStateRevision,
    });
  },

  exitCharacterDialogueSession: (sessionId: string) => {
    postWebviewMessage({ type: 'exitCharacterDialogueSession', sessionId });
  },

  startCharacterDialogueFromSlash: (args?: string) => {
    postWebviewMessage({
      type: 'startCharacterDialogueFromSlash',
      ...(args !== undefined ? { args } : {}),
    });
  },

  confirmRoleplayCandidate: (input: {
    readonly projectSearchItemId: string;
    readonly initialUserMessage?: string;
  }) => {
    postWebviewMessage({
      type: 'confirmRoleplayCandidate',
      projectSearchItemId: input.projectSearchItemId,
      ...(input.initialUserMessage !== undefined
        ? { initialUserMessage: input.initialUserMessage }
        : {}),
    });
  },

  // ==========================================================================
  // File Operations
  // ==========================================================================

  /**
   * Open a file in the Desktop editor.
   * @param contentLocator - Host-issued content identity to open
   * @param options - Optional options (preview, line number, etc.)
   */
  openFile: (
    contentLocator: ContentLocator,
    options?: { preview?: boolean; line?: number; column?: number },
  ) => {
    postWebviewMessage({ type: 'openFile', contentLocator, options });
  },

  /** Open a document preview and jump to a semantic locator when supported. */
  revealDocumentLocator: (input: { contentLocator: ContentLocator; locator: DocumentLocator }) => {
    postWebviewMessage({
      type: 'revealDocumentLocator',
      contentLocator: input.contentLocator,
      locator: input.locator,
    });
  },

  /**
   * Invoke a skill via slash command
   * @param command - Slash command (without /)
   * @param args - Optional arguments
   */
  invokeSlashCommand: (command: string, args: string | undefined, conversationId: string) => {
    postConversationMessage({ type: 'invokeSlashCommand', command, args, conversationId });
  },

  /**
   * Invoke a Skill through the explicit $skill namespace.
   * @param skillName - Canonical Skill name/id
   * @param args - Optional invocation arguments
   */
  invokeSkill: (skillName: string, args: string | undefined, conversationId: string) => {
    postConversationMessage({ type: 'invokeSkill', skillName, args, conversationId });
  },

  /**
   * Invoke a plugin slash command registered by an external extension.
   * Desktop host routes it to the owning plugin runtime.
   * @param pluginId - The plugin that registered the command
   * @param commandId   - The command id (without /)
   * @param args        - Optional arguments string
   */
  invokePluginSlashCommand: (
    pluginId: string,
    commandId: string,
    conversationId: string,
    args?: string,
  ) => {
    postConversationMessage({
      type: 'invokePluginSlashCommand',
      pluginId,
      commandId,
      conversationId,
      args,
    });
  },

  // -------------------------------------------------------------------------
  // Outbound actions previously sent via direct vscode.postMessage
  // -------------------------------------------------------------------------

  /** Open an external URL in the default browser */
  openUrl: (url: string) => {
    postWebviewMessage({ type: 'openUrl', url });
  },

  /** Send generated content to another extension (canvas, cut, explorer). */
  sendToPlugin: (
    target: string,
    assetPathOrPayload: string | PluginTransferPayload,
    mediaType?: string,
  ) => {
    if (typeof assetPathOrPayload === 'string') {
      postWebviewMessage({
        type: 'sendToPlugin',
        target,
        assetPath: assetPathOrPayload,
        ...(mediaType !== undefined ? { mediaType } : {}),
      });
      return;
    }
    postWebviewMessage({ type: 'sendToPlugin', target, payload: assetPathOrPayload });
  },

  /** Invoke an Agent/capability lifecycle action with approval context when required. */
  invokeAgentCapabilityLifecycle: (
    conversationId: string,
    requestId: string,
    invocation: InvokeAgentCapabilityLifecycleWebviewMessage['invocation'],
  ) => {
    postConversationMessage({
      type: 'invokeAgentCapabilityLifecycle',
      conversationId,
      requestId,
      invocation,
    });
  },

  /** Request an Agent-led Canvas authoring handoff. Agent chooses Canvas skills/tools. */
  requestCanvasAuthoringHandoff: (
    payload: Omit<RequestCanvasAuthoringHandoffWebviewMessage, 'type'>,
  ) => {
    postConversationMessage({ type: 'requestCanvasAuthoringHandoff', ...payload });
  },

  /** Download a Mermaid diagram as SVG file */
  downloadSvg: (svg: string, filename: string) => {
    postWebviewMessage({ type: 'downloadSvg', svg, filename });
  },

  /** Report a Mermaid rendering error — sends feedback as user message to AI */
  mermaidError: (error: string, code: string, feedbackMessage: string, conversationId: string) => {
    postConversationMessage({
      type: 'mermaidError',
      error,
      code,
      feedbackMessage,
      conversationId,
    });
  },

  /** Reveal a file in the OS file manager */
  revealFile: (contentLocator: ContentLocator) => {
    postWebviewMessage({ type: 'revealFile', contentLocator });
  },

  /** Navigate to the source of a context reference (canvas node, file, etc.) */
  revealContextSource: (
    contextType: AgentContextType,
    contextId: string,
    contentLocator?: ContentLocator,
    navigationData?: Record<string, string>,
  ) => {
    postWebviewMessage({
      type: 'revealContextSource',
      contextType,
      contextId,
      ...(contentLocator ? { contentLocator } : {}),
      ...(navigationData ? { navigationData } : {}),
    });
  },

  /** Notify the Desktop host that a drag operation started. */
  dndStart: (asset: { path: string; mediaType: 'image' | 'video' | 'audio'; name: string }) => {
    postWebviewMessage({ type: 'dnd:start', asset });
  },
};
