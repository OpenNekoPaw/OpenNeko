/**
 * useSlashCommands Hook
 *
 * Adapts Ink/Zustand state to the package-local TUI command router.
 */

import { useCallback } from 'react';
import type { ChatMessage, CompressionResult, ToolRegistry } from '@neko/agent';
import { isSkillInvocation, isSlashCommand } from '../core/slash-commands';
import { getProviderModels, listChatModelOptions } from '../core/config';
import {
  handleTuiControlCommand,
  type TuiCommandRouterContext,
  type TuiCommandRouterResult,
  type TuiSkillOption,
  type TuiModelIdentity,
  type TuiMcpPorts,
  type TuiCapabilityPorts,
} from '../core/tui-command-router';
import type { TuiConversationCatalogPort } from '../core/slash-commands';
import { AgentMessageQueueOperationError } from '@neko/agent/runtime';
import type { ChatModelOption } from '@neko/shared';
import { toQueueOperationDiagnostic } from '../core/message-queue-semantics';
import { presentQueueCommand } from '../presentation/work-queue-presentation';
import type { SelectionMenuItem } from '../stores/ui-store';
import {
  useTuiConversationStores,
  type TuiConversationStores,
} from '../runtime/tui-runtime-context';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import { presentCommandShellDiagnostic } from '../presentation/command-shell-presentation';

function presentQueueFailure(
  error: unknown,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  const projection = presentQueueCommand(toQueueOperationDiagnostic(error), presentation);
  if (projection.kind !== 'error') {
    throw new Error('Queue operation failure must project to a terminal diagnostic.');
  }
  return projection.error;
}

interface SlashCommandHandlers {
  /** Handle a slash command input */
  handleCommand: (input: string) => Promise<void>;
  /** Clear conversation (for /clear) */
  onClear: () => void;
}

interface SlashCommandSessionActions {
  clearHistory: () => void;
  submit?: (prompt: string) => Promise<void>;
  updateModel?: (model: string | TuiModelIdentity) => void;
  updateMode?: (mode: 'plan' | 'ask' | 'auto') => void;
  validateLlmConfig?: AgentSessionHandleParameterValidator;
  applyLlmConfig?: AgentSessionHandleParameterApplier;
  getContextTokenCount?: () => number | null;
  compactContext?: () => Promise<CompressionResult>;
  getMessageQueueSnapshot?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['getMessageQueueSnapshot']
  >;
  promoteQueuedMessage?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['promoteQueuedMessage']
  >;
  cancelQueuedMessage?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['cancelQueuedMessage']
  >;
  discardQueuedContinuation?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['discardQueuedContinuation']
  >;
  editQueuedMessage?: NonNullable<
    import('./useAgentSession').AgentSessionHandle['editQueuedMessage']
  >;
  listTasks?: import('./useAgentSession').AgentSessionHandle['listTasks'];
  refreshSharedMetadataAtBoundary?: import('./useAgentSession').AgentSessionHandle['refreshSharedMetadataAtBoundary'];
  executeSkill?: (name: string, args?: string) => boolean | Promise<boolean>;
  listSkills?: () => readonly TuiSkillOption[];
  getToolRegistry?: () => ToolRegistry | undefined;
  listMcpServers?: TuiMcpPorts['listServers'];
  listMcpTools?: NonNullable<TuiMcpPorts['listTools']>;
  connectMcpServer?: NonNullable<TuiMcpPorts['connect']>;
  disconnectMcpServer?: NonNullable<TuiMcpPorts['disconnect']>;
  reconnectMcpServer?: NonNullable<TuiMcpPorts['reconnect']>;
  getCapabilityProviderSummaries?: TuiCapabilityPorts['getProviderSummaries'];
  getCapabilityDiagnostics?: TuiCapabilityPorts['getDiagnostics'];
  listCapabilityTools?: TuiCapabilityPorts['listTools'];
  getConversationCatalog?: () => TuiConversationCatalogPort | undefined;
  getCurrentConversationId?: () => string;
  resumeConversation?: (conversationId: string) => Promise<void>;
  getHistory?: () => ChatMessage[];
  syncRuntimeState?: () => void;
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  userConfigPath: string;
}

type AgentSessionHandleParameterValidator = NonNullable<
  import('./useAgentSession').AgentSessionHandle['validateLlmConfig']
>;
type AgentSessionHandleParameterApplier = NonNullable<
  import('./useAgentSession').AgentSessionHandle['applyLlmConfig']
>;

export function useSlashCommands(sessionActions: SlashCommandSessionActions): SlashCommandHandlers {
  const stores = useTuiConversationStores();
  const handleCommand = useCallback(
    async (input: string) => {
      try {
        await sessionActions.refreshSharedMetadataAtBoundary?.();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const projection = presentCommandShellDiagnostic(
          { kind: 'command-failed', detail },
          sessionActions.presentation,
        );
        if (projection.kind !== 'error') {
          throw new Error(
            'Command boundary refresh failure must project to a terminal diagnostic.',
          );
        }
        stores.conversation.getState().addError(new Error(projection.error));
        return;
      }
      if (!isAllowedRunningCommand(input) && isAgentRunning(stores)) {
        const error = isSkillInvocation(input)
          ? new AgentMessageQueueOperationError(
              'not-queueable',
              'Skill invocations cannot be queued while an Agent turn is running.',
            )
          : new AgentMessageQueueOperationError(
              'not-queueable',
              'Commands cannot be queued while an Agent turn is running.',
            );
        const message = presentQueueFailure(error, sessionActions.presentation);
        stores.agent.getState().setMessageQueueDiagnostic(message);
        stores.conversation.getState().addError(new Error(message));
        return;
      }

      if (isSkillInvocation(input)) {
        await handleSkillInvocationCommand(input, sessionActions, stores);
        return;
      }

      try {
        const result = await handleTuiControlCommand(
          input,
          createInkRouterContext(sessionActions, stores),
        );

        if (!result.handled) {
          throw new Error('TUI command router returned an unhandled slash command.');
        }

        await projectCommandResult(result, sessionActions, stores);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const projection = presentCommandShellDiagnostic(
          { kind: 'command-failed', detail },
          sessionActions.presentation,
        );
        if (projection.kind !== 'error') {
          throw new Error('Command failure must project to a terminal diagnostic.');
        }
        stores.conversation.getState().addError(new Error(projection.error));
      }
    },
    [sessionActions, stores],
  );

  const onClear = useCallback(() => {
    sessionActions.clearHistory();
    stores.conversation.getState().clearMessages();
  }, [sessionActions, stores]);

  return { handleCommand, onClear };
}

function isAgentRunning(stores: TuiConversationStores): boolean {
  const status = stores.agent.getState().status;
  return status === 'running' || status === 'waiting_confirmation';
}

function isAllowedRunningCommand(input: string): boolean {
  if (!isSlashCommand(input)) {
    return false;
  }
  const commandName = input.trim().split(/\s+/)[0]?.slice(1).toLowerCase();
  if (
    commandName === 'queue' ||
    commandName === 'task' ||
    commandName === 'tasks' ||
    commandName === 'status' ||
    commandName === 's'
  ) {
    return true;
  }
  return false;
}

async function handleSkillInvocationCommand(
  input: string,
  sessionActions: SlashCommandSessionActions,
  stores: TuiConversationStores,
): Promise<void> {
  const direct = parseDirectPiSkillInvocation(input);
  if (direct && sessionActions.executeSkill) {
    const executed = await sessionActions.executeSkill(direct.name, direct.args);
    if (!executed) {
      stores.conversation
        .getState()
        .addError(new Error(`Skill ${direct.name} is not available for this Pi turn.`));
    }
    return;
  }
  stores.conversation
    .getState()
    .addError(new Error(`Invalid Pi Skill invocation: ${input}`));
}

function createInkRouterContext(
  sessionActions: SlashCommandSessionActions,
  stores: TuiConversationStores,
): TuiCommandRouterContext {
  const config = stores.config.getState().config;
  return {
    presentation: sessionActions.presentation,
    slash: {
      locale: sessionActions.presentation.uiLocale,
      config,
      toolRegistry: sessionActions.getToolRegistry?.(),
      conversationCatalog: sessionActions.getConversationCatalog?.(),
      currentConversationId: sessionActions.getCurrentConversationId?.(),
      onResumeConversation: sessionActions.resumeConversation,
      getHistory: sessionActions.getHistory,
      onConfigUpdate: (updates) => {
        stores.config.getState().setConfig(updates);
        sessionActions.syncRuntimeState?.();
      },
    },
    ports: {
      output: {
        info: (message) => addSystemMessage(message, stores),
        error: (message) => stores.conversation.getState().addError(new Error(message)),
      },
      lifecycle: {
        exit: () => process.exit(0),
      },
      history: {
        clear: () => {
          sessionActions.clearHistory();
          stores.conversation.getState().clearMessages();
        },
      },
      mode: {
        getSessionMode: () => stores.agent.getState().sessionMode,
        setSessionMode: (mode) => {
          stores.agent.getState().setSessionMode(mode);
          sessionActions.syncRuntimeState?.();
        },
        setExecutionMode: (mode) => {
          sessionActions.updateMode?.(mode);
        },
      },
      model: {
        listChatModelOptions: () => listChatModelOptions(stores.config.getState().config.workDir),
        listChatModels: () => {
          const currentConfig = stores.config.getState().config;
          return getProviderModels(currentConfig.provider, currentConfig.workDir);
        },
        ...(sessionActions.updateModel
          ? {
              selectChatModel: (model: string | TuiModelIdentity): TuiModelIdentity => {
                sessionActions.updateModel?.(model);
                const currentConfig = stores.config.getState().config;
                const selected = currentConfig.chatModel;
                if (selected === undefined) {
                  throw new Error('Chat model mutation did not produce canonical config state.');
                }
                return resolveConfiguredModelIdentity(
                  `${selected.providerId}:${selected.modelId}`,
                  listChatModelOptions(currentConfig.workDir),
                  selected.providerId,
                  typeof model === 'string' ? undefined : model,
                );
              },
            }
          : {}),
        selectMenuItem: (input) => showSelection(input.title, [...input.items], stores),
      },
      media: {
        listMediaModelOptions: () =>
          listChatModelOptions(stores.config.getState().config.workDir).filter(
            (option) =>
              option.category === 'image' ||
              option.category === 'video' ||
              option.category === 'audio',
          ),
        getCurrentMediaModels: () => stores.config.getState().config.defaultMediaModels ?? {},
        setMediaModel: (category, model) => {
          const config = stores.config.getState().config;
          const current = config.defaultMediaModels ?? {};
          const nextValue =
            model === 'none' ? 'none' : (model.optionId ?? `${model.providerId}:${model.modelId}`);
          stores.config.getState().setConfig({
            defaultMediaModels: {
              ...current,
              [category]: nextValue,
            },
          });
          sessionActions.syncRuntimeState?.();
          const updatedConfig = stores.config.getState().config;
          const stored = updatedConfig.defaultMediaModels?.[category];
          if (stored === undefined) {
            throw new Error('Media model mutation did not produce canonical config state.');
          }
          return stored === 'none'
            ? 'none'
            : resolveConfiguredModelIdentity(
                stored,
                listChatModelOptions(updatedConfig.workDir),
                model === 'none' ? updatedConfig.provider : model.providerId,
                model === 'none' ? undefined : model,
              );
        },
        resetMediaModels: () => {
          stores.config.getState().setConfig({ defaultMediaModels: {} });
          sessionActions.syncRuntimeState?.();
          return { ...(stores.config.getState().config.defaultMediaModels ?? {}) };
        },
      },
      perception: {
        listPerceptionModelOptions: () =>
          listChatModelOptions(stores.config.getState().config.workDir).filter(
            (option) => option.category === 'llm',
          ),
        getCurrentPerceptionModels: () => stores.config.getState().config.perceptionModels ?? {},
        setPerceptionModel: (category, model) => {
          const config = stores.config.getState().config;
          const current = config.perceptionModels ?? {};
          const next = { ...current };
          if (model === 'auto') {
            delete next[category];
          } else {
            next[category] = model.optionId ?? `${model.providerId}:${model.modelId}`;
          }
          stores.config.getState().setConfig({ perceptionModels: next });
          sessionActions.syncRuntimeState?.();
          const updatedConfig = stores.config.getState().config;
          const stored = updatedConfig.perceptionModels?.[category];
          if (stored === undefined) return 'auto';
          return resolveConfiguredModelIdentity(
            stored,
            listChatModelOptions(updatedConfig.workDir),
            model === 'auto' ? updatedConfig.provider : model.providerId,
            model === 'auto' ? undefined : model,
          );
        },
        resetPerceptionModels: () => {
          stores.config.getState().setConfig({ perceptionModels: {} });
          sessionActions.syncRuntimeState?.();
          return { ...(stores.config.getState().config.perceptionModels ?? {}) };
        },
      },
      parameters: {
        getConfig: () => stores.config.getState().config.llmConfig,
        validate: (llmConfig) =>
          sessionActions.validateLlmConfig?.(llmConfig) ?? { config: llmConfig },
        apply: (result) => sessionActions.applyLlmConfig?.(result),
      },
      skill: {
        listEnabled: () => sessionActions.listSkills?.() ?? [],
        execute: sessionActions.executeSkill,
        selectSkillFromMenu: (input) => showSelection(input.title, [...input.items], stores),
      },
      context: {
        compact: sessionActions.compactContext,
      },
      queue: sessionActions.getMessageQueueSnapshot
        ? {
            getSnapshot: sessionActions.getMessageQueueSnapshot,
            ...(sessionActions.promoteQueuedMessage
              ? { promote: sessionActions.promoteQueuedMessage }
              : {}),
            ...(sessionActions.cancelQueuedMessage
              ? { cancel: sessionActions.cancelQueuedMessage }
              : {}),
            ...(sessionActions.discardQueuedContinuation
              ? { discardContinuation: sessionActions.discardQueuedContinuation }
              : {}),
            ...(sessionActions.editQueuedMessage ? { edit: sessionActions.editQueuedMessage } : {}),
          }
        : undefined,
      task: sessionActions.listTasks
        ? {
            list: sessionActions.listTasks,
          }
        : undefined,
      mcp: sessionActions.listMcpServers
        ? {
            listServers: sessionActions.listMcpServers,
            listTools: sessionActions.listMcpTools,
            connect: sessionActions.connectMcpServer,
            disconnect: sessionActions.disconnectMcpServer,
            reconnect: sessionActions.reconnectMcpServer,
          }
        : undefined,
      capability:
        sessionActions.getCapabilityProviderSummaries &&
        sessionActions.getCapabilityDiagnostics &&
        sessionActions.listCapabilityTools
          ? {
              getProviderSummaries: sessionActions.getCapabilityProviderSummaries,
              getDiagnostics: sessionActions.getCapabilityDiagnostics,
              listTools: sessionActions.listCapabilityTools,
            }
          : undefined,
      status: {
        getSnapshot: () => {
          const agentState = stores.agent.getState();
          return {
            config,
            execution: {
              sessionMode: agentState.sessionMode,
              executionMode: agentState.executionMode,
              status: agentState.status,
            },
            usage: agentState.usage,
            ...(agentState.contextTokens.count === null
              ? {}
              : { contextTokenCount: agentState.contextTokens.count }),
            ...(agentState.messageQueue.snapshot === null
              ? {}
              : { messageQueue: agentState.messageQueue.snapshot }),
            ...(agentState.tasks.running[0] === undefined
              ? {}
              : { runningTask: agentState.tasks.running[0] }),
            userConfigPath: sessionActions.userConfigPath,
          };
        },
      },
    },
  };
}

function parseDirectPiSkillInvocation(
  input: string,
): { readonly name: string; readonly args?: string } | undefined {
  const value = input.trim();
  if (!value.startsWith('$')) return undefined;
  const separator = value.search(/\s/u);
  const name = value.slice(1, separator < 0 ? undefined : separator).trim();
  if (!name) return undefined;
  const args = separator < 0 ? undefined : value.slice(separator).trim() || undefined;
  return { name, ...(args === undefined ? {} : { args }) };
}

function resolveConfiguredModelIdentity(
  storedIdentity: string,
  options: readonly ChatModelOption[],
  fallbackProviderId: string,
  requested?: TuiModelIdentity,
): TuiModelIdentity {
  const option = options.find(
    (candidate) =>
      candidate.id === storedIdentity ||
      candidate.modelId === storedIdentity ||
      `${candidate.providerId}:${candidate.modelId}` === storedIdentity ||
      `${candidate.providerId}/${candidate.modelId}` === storedIdentity,
  );
  if (option !== undefined) {
    return {
      providerId: option.providerId,
      modelId: option.modelId,
      ...(option.providerExpressionProfileId
        ? { providerExpressionProfileId: option.providerExpressionProfileId }
        : {}),
      optionId: option.id,
      label: option.label,
      ...(option.category ? { category: option.category } : {}),
      ...(option.capabilities ? { capabilities: option.capabilities } : {}),
    };
  }

  const separator = storedIdentity.includes('/') ? '/' : storedIdentity.includes(':') ? ':' : null;
  const [providerId, modelId] =
    separator === null ? [fallbackProviderId, storedIdentity] : storedIdentity.split(separator, 2);
  if (!providerId || !modelId) {
    throw new Error(`Invalid canonical model identity returned by config: ${storedIdentity}`);
  }
  if (
    requested !== undefined &&
    requested.providerId === providerId &&
    requested.modelId === modelId
  ) {
    return requested;
  }
  return {
    providerId,
    modelId,
    optionId: storedIdentity,
    label: `${providerId} / ${modelId}`,
  };
}

async function projectCommandResult(
  result: TuiCommandRouterResult,
  sessionActions: SlashCommandSessionActions,
  stores: TuiConversationStores,
): Promise<void> {
  if (result.output) {
    addSystemMessage(result.output, stores);
  }
  if (result.error) {
    stores.conversation.getState().addError(new Error(result.error));
    return;
  }

  const invocation = result.skillInvocation;
  if (invocation) {
    const ok =
      (await sessionActions.executeSkill?.(invocation.skillName, invocation.args)) ?? false;
    if (!ok) {
      return;
    }
  }

  if (result.agentPrompt && sessionActions.submit) {
    await sessionActions.submit(result.agentPrompt);
  }
}

/** Add a system-level informational message to the conversation */
function addSystemMessage(text: string, stores: TuiConversationStores): void {
  stores.conversation.getState().addSystemMessage(text);
}

/** Show a selection menu and return the selected ID (or null if cancelled) */
function showSelection(
  title: string,
  items: readonly SelectionMenuItem[],
  stores: TuiConversationStores,
): Promise<string | null> {
  return new Promise((resolve) => {
    stores.ui.getState().showSelection({
      title,
      items: [...items],
      resolve: (selectedId) => {
        stores.ui.getState().dismissSelection();
        resolve(selectedId);
      },
    });
  });
}
