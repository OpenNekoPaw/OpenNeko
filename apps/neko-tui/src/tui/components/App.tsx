/**
 * App Component — Root Layout
 *
 * Orchestrates the TUI layout:
 * - ChatView (scrollable, fills available space)
 * - ToolApprovalPanel (overlays when needed)
 * - InputEditor (fixed at bottom, multi-line + history)
 * - StatusBar (fixed at bottom)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Box } from 'ink';
import { NodeSqliteUserCredentialPersistence } from '@neko/agent/pi';
import type { CLIConfig } from '../core/types';
import type { AgentCapabilityProvider } from '@neko/shared';
import { ChatView } from './ChatView/ChatView';
import { InputEditor, type InputEditorDraftRequest } from './Input/InputEditor';
import { MessageQueuePanel } from './Input/MessageQueuePanel';
import { StatusBar } from './StatusBar/StatusBar';
import { ToolApprovalPanel } from './ToolApproval/ToolApprovalPanel';
import { SelectionMenu } from './Selection/SelectionMenu';
import type { InputSuggestionOption } from './Input/input-suggestions';
import { createTuiReferenceSuggestions } from './Input/reference-suggestions';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { useAgentSession } from '../hooks/useAgentSession';
import { useKeyboard } from '../hooks/useKeyboard';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useTerminalSize } from '../hooks/useTerminalSize';
import {
  useTuiConversationStores,
  useTuiUIStore,
  TuiApplicationRuntimeProvider,
} from '../runtime/tui-runtime-context';
import { createAgentTuiApplicationRuntime } from '../runtime/tui-application-runtime';
import { createTuiConversationId } from '../core/tui-conversation-id';
import { createTuiSkillInvocationCatalog } from '../core/slash-command-catalog';
import { dispatchTuiUserInput } from '../core/tui-user-input-dispatcher';
import type { AgentTerminalInvocationContext } from '../core/node-locale-bootstrap';
import { AgentTerminalPresentationProvider } from '../presentation/react-context';
import { presentReferenceSuggestionError } from '../presentation/reference-presentation';
import {
  createTuiAutomationAppPort,
  type TuiAutomationSessionHandle,
} from '../core/debug-automation/app-port';
import type { TuiDebugAutomationController } from '../core/debug-automation/types';

interface AppProps {
  /** CLI configuration (loaded before render) */
  readonly config: CLIConfig;
  /** Host-agnostic capability providers injected by embedding hosts. */
  readonly capabilityProviders?: readonly AgentCapabilityProvider[];
  /** Optional prompt submitted once after the TUI session is initialized. */
  readonly initialPrompt?: string;
  /** Optional persisted conversation id to resume inside the Ink TUI session. */
  readonly resumeConversationId?: string;
  /** Immutable Locale and terminal presentation composition for this invocation. */
  readonly terminal: AgentTerminalInvocationContext;
  /** Optional local developer automation controller. */
  readonly automation?: TuiDebugAutomationController;
}

export function App(props: AppProps): React.JSX.Element {
  const [runtimeOwnership] = useState(() => {
    const application = createAgentTuiApplicationRuntime(
      NodeSqliteUserCredentialPersistence.open({ userDataRoot: join(homedir(), '.neko') }),
    );
    application.createConversation({
      config: props.config,
      conversationId: props.resumeConversationId ?? createTuiConversationId(props.config.workDir),
    });
    return { application };
  });

  useEffect(
    () => () => {
      queueMicrotask(() => runtimeOwnership.application.dispose());
    },
    [runtimeOwnership],
  );

  return (
    <TuiApplicationRuntimeProvider runtime={runtimeOwnership.application}>
      <AgentTerminalPresentationProvider value={props.terminal.presentation}>
        <AppContent {...props} />
      </AgentTerminalPresentationProvider>
    </TuiApplicationRuntimeProvider>
  );
}

function AppContent({
  config,
  capabilityProviders,
  initialPrompt,
  resumeConversationId,
  terminal,
  automation,
}: AppProps): React.JSX.Element {
  const stores = useTuiConversationStores();
  const pendingApproval = useTuiUIStore((s) => s.pendingApproval);
  const pendingSelection = useTuiUIStore((s) => s.pendingSelection);
  const [referenceSuggestions, setReferenceSuggestions] = useState<
    readonly InputSuggestionOption[]
  >([]);
  const submittedInitialPromptRef = useRef<string | null>(null);
  const referenceRequestIdRef = useRef(0);
  const queueDraftRequestIdRef = useRef(0);
  const [queueDraftRequest, setQueueDraftRequest] = useState<InputEditorDraftRequest | null>(null);
  const [queueActionNotice, setQueueActionNotice] = useState<string | null>(null);

  // Track terminal size changes
  useTerminalSize();

  // Initialize config store
  useEffect(() => {
    stores.config.getState().replaceConfig(config);
  }, [config, stores]);

  // Initialize agent session
  const agentSession = useAgentSession({
    config,
    capabilityProviders,
    resumeConversationId,
    presentation: terminal.presentation,
    promptLocale: terminal.promptLocale,
  });
  const agentSessionRef = useRef<TuiAutomationSessionHandle>(agentSession);
  agentSessionRef.current = agentSession;

  const {
    submit,
    cancel,
    clearHistory,
    confirmTool,
    updateModel,
    updateMode,
    validateLlmConfig,
    applyLlmConfig,
    getContextTokenCount,
    compactContext,
    getMessageQueueSnapshot,
    listTasks,
    refreshSharedMetadataAtBoundary,
    promoteQueuedMessage,
    cancelQueuedMessage,
    discardQueuedContinuation,
    editQueuedMessage,
    executeSkill,
    listSkills,
    getToolRegistry,
    listMcpServers,
    listMcpTools,
    connectMcpServer,
    disconnectMcpServer,
    reconnectMcpServer,
    getCapabilityProviderSummaries,
    getCapabilityDiagnostics,
    listCapabilityTools,
    getReferenceContributors,
    querySearchDocuments,
    getConversationCatalog,
    getCurrentConversationId,
    resumeConversation,
    getHistory,
    syncRuntimeState,
    slashCommands,
  } = agentSession;

  const refreshReferenceSuggestions = useCallback(
    (query = '') => {
      let cancelled = false;
      const requestId = referenceRequestIdRef.current + 1;
      referenceRequestIdRef.current = requestId;
      void createTuiReferenceSuggestions({
        workspaceRoot: config.workDir,
        presentation: terminal.presentation,
        query,
        referenceContributors: getReferenceContributors(),
        searchDocuments: querySearchDocuments,
      }).then(
        (suggestions) => {
          if (!cancelled && referenceRequestIdRef.current === requestId) {
            setReferenceSuggestions(suggestions);
          }
        },
        (error) => {
          if (!cancelled && referenceRequestIdRef.current === requestId) {
            stores.conversation
              .getState()
              .addError(new Error(presentReferenceSuggestionError(error, terminal.presentation)));
          }
        },
      );
      return () => {
        cancelled = true;
      };
    },
    [
      config.workDir,
      getReferenceContributors,
      querySearchDocuments,
      slashCommands,
      terminal.presentation,
    ],
  );

  useEffect(() => refreshReferenceSuggestions(), [refreshReferenceSuggestions]);

  // Slash command handling
  const { handleCommand, onClear } = useSlashCommands({
    clearHistory,
    submit,
    updateModel,
    updateMode,
    validateLlmConfig,
    applyLlmConfig,
    getContextTokenCount,
    compactContext,
    getMessageQueueSnapshot,
    listTasks,
    refreshSharedMetadataAtBoundary,
    promoteQueuedMessage,
    cancelQueuedMessage,
    discardQueuedContinuation,
    editQueuedMessage,
    executeSkill,
    listSkills,
    getToolRegistry,
    listMcpServers,
    listMcpTools,
    connectMcpServer,
    disconnectMcpServer,
    reconnectMcpServer,
    getCapabilityProviderSummaries,
    getCapabilityDiagnostics,
    listCapabilityTools,
    getConversationCatalog,
    getCurrentConversationId,
    resumeConversation,
    getHistory,
    syncRuntimeState,
    presentation: terminal.presentation,
    userConfigPath: terminal.userConfigPath,
  });

  // Global keyboard shortcuts
  useKeyboard({
    onCancel: cancel,
    onClear: () => {
      onClear();
      stores.conversation.getState().clearMessages();
    },
    onQuit: () => {
      process.exit(0);
    },
    onModeChange: updateMode,
  });

  // Handle user prompt submission
  const handleUserInput = useCallback(
    async (text: string) => {
      await dispatchTuiUserInput(text, {
        submitPrompt: submit,
        handleControlInput: handleCommand,
      });
    },
    [handleCommand, submit],
  );

  useEffect(() => {
    if (!automation) {
      return;
    }
    const port = createTuiAutomationAppPort({
      stores,
      readHandle: () => agentSessionRef.current,
      submitInput: handleUserInput,
      readMarkdownFacts: () => automation.readMarkdownFacts(),
    });
    automation.bind(port);
    return () => {
      automation.unbind(port);
    };
  }, [automation, handleUserInput, stores]);

  useEffect(() => {
    const trimmed = initialPrompt?.trim();
    if (!trimmed || submittedInitialPromptRef.current === trimmed) {
      return;
    }
    submittedInitialPromptRef.current = trimmed;
    void handleUserInput(trimmed);
  }, [handleUserInput, initialPrompt]);

  // Handle tool approval
  const handleApprove = useCallback(() => {
    if (pendingApproval) {
      pendingApproval.resolve(true);
      confirmTool(pendingApproval.toolCallId, true);
    }
  }, [pendingApproval, confirmTool]);

  const handleReject = useCallback(() => {
    if (pendingApproval) {
      pendingApproval.resolve(false);
      confirmTool(pendingApproval.toolCallId, false);
    }
  }, [pendingApproval, confirmTool]);

  const handleQueueSendNext = useCallback(
    (queueItemId: string) => {
      try {
        promoteQueuedMessage(queueItemId);
        setQueueActionNotice(null);
      } catch (error) {
        setQueueActionNotice(
          terminal.presentation.t('agent.terminal.diagnostic.queue.operationFailed', {
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [promoteQueuedMessage, terminal.presentation],
  );

  const handleQueueCancel = useCallback(
    (queueItemId: string) => {
      try {
        cancelQueuedMessage(queueItemId);
        setQueueActionNotice(null);
      } catch (error) {
        setQueueActionNotice(
          terminal.presentation.t('agent.terminal.diagnostic.queue.operationFailed', {
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
    [cancelQueuedMessage, terminal.presentation],
  );

  const handleQueueEdit = useCallback(
    (queueItemId: string) => {
      const item = getMessageQueueSnapshot()?.items.find(
        (candidate) => candidate.id === queueItemId,
      );
      if (!item) {
        setQueueActionNotice(
          terminal.presentation.t('agent.terminal.queue.unknownItem', { itemId: queueItemId }),
        );
        return;
      }
      if (item.source !== 'user' && item.source !== 'composer') {
        setQueueActionNotice(
          terminal.presentation.t('agent.terminal.queue.continuationNotEditable', {
            itemId: queueItemId,
          }),
        );
        return;
      }

      queueDraftRequestIdRef.current += 1;
      setQueueDraftRequest({
        id: `${queueItemId}:${queueDraftRequestIdRef.current}`,
        content: item.content,
        apply: () => {
          try {
            cancelQueuedMessage(queueItemId);
            setQueueActionNotice(null);
            return true;
          } catch (error) {
            setQueueActionNotice(
              terminal.presentation.t('agent.terminal.diagnostic.queue.operationFailed', {
                detail: error instanceof Error ? error.message : String(error),
              }),
            );
            return false;
          }
        },
        onConflict: () => {
          setQueueActionNotice(terminal.presentation.t('agent.terminal.queue.draftConflict'));
        },
      });
    },
    [cancelQueuedMessage, getMessageQueueSnapshot, terminal.presentation],
  );

  const inputDisabled = !!pendingSelection;
  const skillSuggestions = createTuiSkillInvocationCatalog(
    listSkills().map((skill) => ({
      name: skill.name,
      description: skill.description,
      enabled: true,
    })),
    terminal.presentation,
  ).map((skill) => ({
    trigger: '$' as const,
    name: skill.name.startsWith('$') ? skill.name.slice(1) : skill.name,
    description: skill.description,
    kind: 'skill',
  }));

  return (
    <ErrorBoundary label="OpenNeko TUI">
      <Box flexDirection="column" height="100%">
        {/* Chat messages — fills available space */}
        <ErrorBoundary label="ChatView">
          <ChatView />
        </ErrorBoundary>

        {/* Tool approval panel — shows when needed */}
        {pendingApproval ? (
          <ToolApprovalPanel
            approval={pendingApproval}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ) : null}

        {/* Selection menu — shows for /model, /skill etc. */}
        {pendingSelection ? <SelectionMenu selection={pendingSelection} /> : null}

        {/* Pending next-turn messages stay outside the conversation transcript. */}
        <ErrorBoundary label="MessageQueuePanel">
          <MessageQueuePanel
            disabled={inputDisabled}
            notice={queueActionNotice}
            onSendNext={handleQueueSendNext}
            onEdit={handleQueueEdit}
            onCancel={handleQueueCancel}
          />
        </ErrorBoundary>

        {/* Input — fixed at bottom, with slash command support */}
        <InputEditor
          onSubmit={handleUserInput}
          onSlashCommand={handleUserInput}
          onSkillInvocation={handleUserInput}
          disabled={inputDisabled}
          commands={slashCommands}
          skills={skillSuggestions}
          references={referenceSuggestions}
          onReferenceQueryChange={refreshReferenceSuggestions}
          draftRequest={queueDraftRequest}
        />

        {/* Status bar — fixed at very bottom */}
        <StatusBar />
      </Box>
    </ErrorBoundary>
  );
}
