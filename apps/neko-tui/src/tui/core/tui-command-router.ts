import type {
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityProviderAvailabilitySummary,
  ChatModelOption,
  Task,
  TaskStatus,
} from '@neko/shared';
import {
  buildAgentTerminalHelpSemantic,
  executeAgentTerminalCommandsSemantic,
  executeAgentTerminalSkillsSemantic,
  executeAgentTerminalToolsSemantic,
  type CommandContext,
} from '@neko/agent';
import type { AgentMessageQueueSnapshot, AgentQueuedMessageItem } from '@neko-agent/types';
import type { AgentLlmAdvancedParams, AgentLlmConfig } from '@neko-agent/types';
import type { TuiArtifactReference } from './artifact-reference-formatter';
import type { CLIConfig } from './types';
import { presentCommandShellDiagnostic } from '../presentation/command-shell-presentation';
import { presentTuiStatus, type TuiStatusSnapshot } from './status-presentation';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import {
  presentArtifactCommand,
  type ArtifactCommandSemanticResult,
} from '../presentation/artifact-presentation';
import {
  presentConfigCommand,
  presentHistoryCommand,
  presentResumeCommand,
  type ConfigCommandSemanticResult,
  type HistoryCommandSemanticResult,
  type ResumeCommandSemanticResult,
} from '../presentation/config-history-presentation';
import {
  presentCapabilityCommand,
  presentMcpCommand,
  type CapabilityCommandSemanticResult,
  type McpCommandSemanticResult,
  type TerminalMcpServerSnapshot,
} from '../presentation/infrastructure-presentation';
import {
  presentMediaCommand,
  presentModelCommand,
  presentPerceptionCommand,
  type AgentTerminalCommandProjection,
  type AgentTerminalModelOption,
  type MediaCommandSemanticResult,
  type ModelCommandSemanticResult,
  type PerceptionCommandSemanticResult,
} from '../presentation/model-family-presentation';
import {
  presentSessionControlCommand,
  type SessionControlSemanticResult,
} from '../presentation/session-control-presentation';
import {
  presentSkillCommand,
  presentSkillMenu,
  type SkillSemanticResult,
} from '../presentation/skill-presentation';
import {
  presentParameterCommand,
  TERMINAL_ADVANCED_PARAMETER_KEYS,
  type ParameterApplicationProjection,
  type ParameterDiagnostic,
  type ParameterSemanticResult,
  type ParameterValidationDiagnostic,
} from '../presentation/parameter-presentation';
import {
  presentQueueCommand,
  presentTaskCommand,
  type QueueCommandSemanticResult,
  type TaskCommandRow,
  type TaskCommandSemanticResult,
} from '../presentation/work-queue-presentation';
import {
  presentCommandsCommand,
  presentHelpCommand,
  presentSkillsCommand,
  presentToolsCommand,
  type AgentResourceCommandProjection,
} from '../presentation/resource-command-presentation';
import { getProviderModels, listProviders } from './config';
import { supportsPerceptionCategory } from './media-model-metadata';
import { toQueueOperationDiagnostic } from './message-queue-semantics';
import {
  handleSlashCommand,
  toCommandContext,
  type SlashCommandContext,
  type SlashCommandResult,
} from './slash-commands';

export type TuiExecutionMode = 'plan' | 'ask' | 'auto';
export type TuiSessionMode = 'agent' | 'image' | 'video' | 'audio';
const TUI_SESSION_MODES: readonly TuiSessionMode[] = ['agent', 'image', 'video', 'audio'];
type TuiMediaCategory = 'image' | 'video' | 'audio';
const TUI_MEDIA_CATEGORIES: readonly TuiMediaCategory[] = ['image', 'video', 'audio'];
const TUI_TASK_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly TaskStatus[];
type TuiParamPresetKey = 'reasoning' | 'verbosity' | 'creativity';
const TUI_PARAM_PRESET_KEYS: readonly TuiParamPresetKey[] = [
  'reasoning',
  'verbosity',
  'creativity',
];

export interface TuiSelectionItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly active?: boolean;
}

export interface TuiModelPorts {
  readonly listChatModels?: () => readonly string[];
  readonly listChatModelOptions?: () => readonly ChatModelOption[];
  readonly selectChatModel?: (
    model: string | TuiModelIdentity,
  ) => TuiModelIdentity | Promise<TuiModelIdentity>;
  readonly selectMenuItem?: (input: {
    readonly title: string;
    readonly items: readonly TuiSelectionItem[];
  }) => Promise<string | null>;
}

export interface TuiModelIdentity {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerExpressionProfileId?: string;
  readonly optionId?: string;
  readonly label?: string;
  readonly category?: ChatModelOption['category'];
  readonly capabilities?: readonly string[];
  readonly protocolProfile?: ChatModelOption['protocolProfile'];
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
}

export interface TuiMediaModelPorts {
  readonly listMediaModelOptions?: () => readonly ChatModelOption[];
  readonly getCurrentMediaModels?: () => Partial<Record<TuiMediaCategory, string>>;
  readonly setMediaModel?: (
    category: TuiMediaCategory,
    model: TuiModelIdentity | 'none',
  ) => TuiModelIdentity | 'none' | Promise<TuiModelIdentity | 'none'>;
  readonly resetMediaModels?: () =>
    | Readonly<Partial<Record<TuiMediaCategory, string>>>
    | Promise<Readonly<Partial<Record<TuiMediaCategory, string>>>>;
}

export interface TuiPerceptionModelPorts {
  readonly listPerceptionModelOptions?: () => readonly ChatModelOption[];
  readonly getCurrentPerceptionModels?: () => Partial<Record<TuiMediaCategory, string>>;
  readonly setPerceptionModel?: (
    category: TuiMediaCategory,
    model: TuiModelIdentity | 'auto',
  ) => TuiModelIdentity | 'auto' | Promise<TuiModelIdentity | 'auto'>;
  readonly resetPerceptionModels?: () =>
    | Readonly<Partial<Record<TuiMediaCategory, string>>>
    | Promise<Readonly<Partial<Record<TuiMediaCategory, string>>>>;
}

export interface TuiParameterValidationResult {
  readonly config: AgentLlmConfig;
  readonly chatOptions?: {
    readonly temperature?: number;
    readonly topP?: number;
    readonly maxTokens?: number;
    readonly thinkingBudget?: number;
  };
  readonly providerOptions?: Record<string, unknown>;
  readonly diagnostics?: readonly ParameterValidationDiagnostic[];
}

export interface TuiParameterPorts {
  readonly getConfig?: () => AgentLlmConfig | undefined;
  readonly validate?: (config: AgentLlmConfig) => TuiParameterValidationResult;
  readonly apply?: (result: TuiParameterValidationResult) => void | Promise<void>;
}

export interface TuiSkillPorts {
  readonly execute?: (skillName: string, args?: string) => boolean | Promise<boolean>;
  readonly listEnabled?: () => readonly TuiSkillOption[];
  readonly selectSkillFromMenu?: (input: {
    readonly title: string;
    readonly items: readonly TuiSelectionItem[];
  }) => Promise<string | null>;
}

export interface TuiSkillOption {
  readonly name: string;
  readonly description?: string;
}

export interface TuiContextPorts {
  readonly compact?: () => Promise<TuiCompressionResult>;
}

export interface TuiQueuePorts {
  readonly getSnapshot: () => AgentMessageQueueSnapshot | null;
  readonly promote?: (queueItemId: string) => AgentQueuedMessageItem;
  readonly cancel?: (queueItemId: string) => AgentQueuedMessageItem;
  readonly discardContinuation?: (queueItemId: string) => AgentQueuedMessageItem;
  readonly edit?: (queueItemId: string, content: string) => AgentQueuedMessageItem;
}

export interface TuiTaskPorts {
  readonly list: (status?: TaskStatus) => readonly Task[] | Promise<readonly Task[]>;
}

export type TuiMcpServerSnapshot = TerminalMcpServerSnapshot;

export interface TuiMcpPorts {
  readonly listServers: () => readonly TuiMcpServerSnapshot[];
  readonly listTools?: (serverId?: string) => readonly string[] | Promise<readonly string[]>;
  readonly connect?: (serverId: string) => void | Promise<void>;
  readonly disconnect?: (serverId: string) => void | Promise<void>;
  readonly reconnect?: (serverId: string) => void | Promise<void>;
}

export interface TuiCapabilityPorts {
  readonly getProviderSummaries: () => readonly AgentCapabilityProviderAvailabilitySummary[];
  readonly getDiagnostics: () => readonly AgentCapabilityAvailabilityDiagnostic[];
  readonly listTools: (providerId?: string) => readonly string[];
}

export interface TuiCompressionResult {
  readonly originalTokens: number;
  readonly compressedTokens: number;
  readonly ratio: number;
}

export interface TuiArtifactPorts {
  readonly list?: () => readonly TuiArtifactReference[];
  readonly show?: (artifactId: string) => TuiArtifactReference | null | undefined;
  readonly open?: (artifactId: string) => void | Promise<void>;
  readonly send?: (target: string, artifactId: string) => void | Promise<void>;
}

export interface TuiCommandRouterPorts {
  readonly mode?: {
    readonly setExecutionMode: (mode: TuiExecutionMode) => void | Promise<void>;
    readonly getSessionMode?: () => TuiSessionMode;
    readonly setSessionMode?: (mode: TuiSessionMode) => void | Promise<void>;
  };
  readonly model?: TuiModelPorts;
  readonly media?: TuiMediaModelPorts;
  readonly perception?: TuiPerceptionModelPorts;
  readonly parameters?: TuiParameterPorts;
  readonly skill?: TuiSkillPorts;
  readonly context?: TuiContextPorts;
  readonly queue?: TuiQueuePorts;
  readonly task?: TuiTaskPorts;
  readonly mcp?: TuiMcpPorts;
  readonly capability?: TuiCapabilityPorts;
  readonly artifact?: TuiArtifactPorts;
  readonly status?: {
    readonly getSnapshot: () => TuiStatusSnapshot;
  };
  readonly history?: {
    readonly clear: () => void | Promise<void>;
  };
  readonly lifecycle?: {
    readonly exit: () => void | Promise<void>;
  };
  readonly output: {
    readonly info: (message: string) => void;
    readonly error: (message: string) => void;
  };
}

export interface TuiCommandRouterContext {
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  readonly slash: SlashCommandContext;
  readonly ports: TuiCommandRouterPorts;
}

export interface TuiCommandRouterResult extends SlashCommandResult {
  readonly source: 'tui-router';
}

export async function handleTuiControlCommand(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  if (!context.presentation) {
    throw new Error('AgentTerminalPresentationContext is required by the TUI command router.');
  }
  const commandText = input.trim();
  const commandName = commandText.split(/\s+/)[0]?.slice(1).toLowerCase() ?? '';

  switch (commandName) {
    case 'exit':
    case 'quit':
    case 'q':
      await context.ports.lifecycle?.exit();
      return projectSessionControlResult({ kind: 'exit' }, context, false);

    case 'help':
    case 'h':
    case '?':
      return projectResourceCommand(
        presentHelpCommand(
          buildAgentTerminalHelpSemantic(toResourceCommandContext(context)),
          context.presentation,
        ),
      );

    case 'skills':
      return projectResourceCommand(
        presentSkillsCommand(
          executeAgentTerminalSkillsSemantic(
            commandText.split(/\s+/).slice(1),
            toResourceCommandContext(context),
          ),
          context.presentation,
        ),
      );

    case 'commands':
    case 'cmds':
      return projectResourceCommand(
        presentCommandsCommand(
          executeAgentTerminalCommandsSemantic(
            commandText.split(/\s+/).slice(1),
            toResourceCommandContext(context),
          ),
          context.presentation,
        ),
      );

    case 'tools':
      return projectResourceCommand(
        presentToolsCommand(
          executeAgentTerminalToolsSemantic(
            commandText.split(/\s+/).slice(1),
            toResourceCommandContext(context),
          ),
          context.presentation,
        ),
      );

    case 'clear':
    case 'cls':
      return handleClear(context);

    case 'model':
      return handleModel(commandText, context);

    case 'media':
      return handleMedia(commandText, context);

    case 'perception':
      return handlePerception(commandText, context);

    case 'param':
      return handleParam(commandText, context);

    case 'mode':
      return handleSessionMode(commandText, context);

    case 'skill':
      return handleSkill(commandText, context);

    case 'status':
    case 's':
      return handleStatus(context);

    case 'compact':
      return handleCompact(context);

    case 'queue':
      return handleQueue(commandText, context);

    case 'task':
    case 'tasks':
      return handleTasks(commandText, context);

    case 'mcp':
      return handleMcp(commandText, context);

    case 'capability':
      return handleCapability(commandText, context);

    case 'artifact':
      return handleArtifact(commandText, context);

    case 'config':
    case 'cfg':
      return handleConfig(commandText, context);

    case 'resume':
      return handleResume(commandText, context);

    case 'history':
      return handleHistory(context);

    case 'plan':
      return setMode('plan', context);

    case 'auto':
      return setMode('auto', context);

    case 'ask':
      return setMode('ask', context);

    default: {
      const result = await handleSlashCommand(input, context.slash);
      if (result.skillSemantic) {
        return {
          ...projectSkillResult(result.skillSemantic, context),
          continueExecution: result.continueExecution,
          agentPrompt: result.agentPrompt,
          skillInvocation: result.skillInvocation,
        };
      }
      if (!result.handled) {
        return projectTerminalCommand(
          presentCommandShellDiagnostic(
            { kind: 'unknown-command', input: commandText },
            context.presentation,
          ),
        );
      }
      throw new Error(`Slash core returned an unsupported final-prose result for /${commandName}.`);
    }
  }
}

function projectResourceCommand(
  projection: AgentResourceCommandProjection,
): TuiCommandRouterResult {
  return projection.kind === 'output'
    ? handled({ output: projection.output })
    : handled({ error: projection.error, diagnosticCode: projection.diagnosticCode });
}

function projectSkillResult(
  result: SkillSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentSkillCommand(result, context.presentation));
}

function projectParameterResult(
  result: ParameterSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentParameterCommand(result, context.presentation));
}

function projectSessionControlResult(
  result: SessionControlSemanticResult,
  context: TuiCommandRouterContext,
  continueExecution = true,
): TuiCommandRouterResult {
  return {
    ...projectTerminalCommand(presentSessionControlCommand(result, context.presentation)),
    continueExecution,
  };
}

function projectQueueResult(
  result: QueueCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentQueueCommand(result, context.presentation));
}

function projectTaskResult(
  result: TaskCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentTaskCommand(result, context.presentation));
}

function projectMcpResult(
  result: McpCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentMcpCommand(result, context.presentation));
}

function projectCapabilityResult(
  result: CapabilityCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentCapabilityCommand(result, context.presentation));
}

function projectArtifactResult(
  result: ArtifactCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentArtifactCommand(result, context.presentation));
}

function projectConfigResult(
  result: ConfigCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentConfigCommand(result, context.presentation));
}

function projectResumeResult(
  result: ResumeCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentResumeCommand(result, context.presentation));
}

function projectHistoryResult(
  result: HistoryCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentHistoryCommand(result, context.presentation));
}

function projectModelResult(
  result: ModelCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentModelCommand(result, context.presentation));
}

function projectMediaResult(
  result: MediaCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentMediaCommand(result, context.presentation));
}

function projectPerceptionResult(
  result: PerceptionCommandSemanticResult,
  context: TuiCommandRouterContext,
): TuiCommandRouterResult {
  return projectTerminalCommand(presentPerceptionCommand(result, context.presentation));
}

function projectTerminalCommand(
  projection: AgentTerminalCommandProjection,
): TuiCommandRouterResult {
  switch (projection.kind) {
    case 'output':
      return handled({ output: projection.output });
    case 'error':
      return handled({ error: projection.error, diagnosticCode: projection.diagnosticCode });
    case 'model-menu':
      throw new Error('Model menu projections must be consumed before terminal result projection.');
  }
}

function toTerminalModelOptions(
  options: readonly ChatModelOption[],
  isActive: (option: ChatModelOption) => boolean,
): readonly AgentTerminalModelOption[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    providerId: option.providerId,
    modelId: option.modelId,
    active: isActive(option),
  }));
}

function handled(overrides: Partial<TuiCommandRouterResult> = {}): TuiCommandRouterResult {
  return {
    handled: true,
    continueExecution: true,
    source: 'tui-router',
    ...overrides,
  };
}

async function handleClear(context: TuiCommandRouterContext): Promise<TuiCommandRouterResult> {
  await context.ports.history?.clear();
  return projectSessionControlResult({ kind: 'history-cleared' }, context);
}

async function handleConfig(
  commandText: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const args = commandText.split(/\s+/).slice(1);
  const config = context.slash.config;
  const subcommand = args[0]?.toLowerCase();

  if (!subcommand) {
    return projectConfigResult(
      {
        kind: 'status',
        surface: 'slash',
        config: {
          provider: config.provider,
          model: config.model,
          ...(config.apiKey ? { maskedApiKey: `***${config.apiKey.slice(-4)}` } : {}),
          ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature,
          verbose: config.verbose,
          outputFormat: config.outputFormat,
          workDir: config.workDir,
          mcpServerCount: config.mcpServers.length,
        },
      },
      context,
    );
  }

  if (subcommand === 'providers') {
    return projectConfigResult(
      {
        kind: 'providers',
        providers: listProviders(config.workDir).map((provider) => ({
          id: provider.id,
          displayName: provider.displayName,
          type: provider.type,
          hasApiKey: provider.hasApiKey,
          models: provider.models,
        })),
      },
      context,
    );
  }

  if (subcommand === 'models') {
    const models = getProviderModels(config.provider, config.workDir);
    return projectConfigResult(
      models.length > 0
        ? {
            kind: 'models',
            providerId: config.provider,
            currentModelId: config.model,
            models,
          }
        : { kind: 'diagnostic', code: 'models-empty', providerId: config.provider },
      context,
    );
  }

  if (subcommand !== 'set') {
    return projectConfigResult(
      { kind: 'diagnostic', code: 'unknown-command', command: subcommand },
      context,
    );
  }

  const key = args[1];
  const rawValue = args.slice(2).join(' ');
  if (!key || !rawValue) {
    return projectConfigResult({ kind: 'diagnostic', code: 'set-usage' }, context);
  }
  if (!context.slash.onConfigUpdate) {
    return projectConfigResult({ kind: 'diagnostic', code: 'update-unavailable' }, context);
  }

  let update: Partial<CLIConfig>;
  let presentedValue: string;
  switch (key) {
    case 'provider':
      update = { provider: rawValue };
      presentedValue = rawValue;
      break;
    case 'model':
      update = { model: rawValue };
      presentedValue = rawValue;
      break;
    case 'maxTokens': {
      const value = Number(rawValue);
      if (!Number.isFinite(value)) {
        return projectConfigResult({ kind: 'diagnostic', code: 'invalid-max-tokens' }, context);
      }
      update = { maxTokens: value };
      presentedValue = String(value);
      break;
    }
    case 'temperature': {
      const value = Number.parseFloat(rawValue);
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        return projectConfigResult({ kind: 'diagnostic', code: 'invalid-temperature' }, context);
      }
      update = { temperature: value };
      presentedValue = String(value);
      break;
    }
    case 'verbose': {
      const value = rawValue === 'true' || rawValue === '1';
      update = { verbose: value };
      presentedValue = String(value);
      break;
    }
    case 'outputFormat':
      if (!isOutputFormat(rawValue)) {
        return projectConfigResult({ kind: 'diagnostic', code: 'invalid-output-format' }, context);
      }
      update = { outputFormat: rawValue };
      presentedValue = rawValue;
      break;
    default:
      return projectConfigResult({ kind: 'diagnostic', code: 'invalid-key', key }, context);
  }

  context.slash.onConfigUpdate(update);
  return projectConfigResult({ kind: 'updated', key, value: presentedValue }, context);
}

function isOutputFormat(value: string): value is CLIConfig['outputFormat'] {
  return value === 'text' || value === 'json' || value === 'markdown';
}

function localized(context: TuiCommandRouterContext, en: string, zh: string): string {
  return context.presentation.uiLocale === 'zh-cn' ? zh : en;
}

async function handleResume(
  commandText: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const catalog = context.slash.conversationCatalog;
  if (!catalog) {
    return projectResumeResult({ kind: 'diagnostic', code: 'unavailable' }, context);
  }

  const conversationId = commandText.split(/\s+/)[1];
  if (conversationId) {
    let record;
    try {
      record = await catalog.get(conversationId);
    } catch (error) {
      return projectResumeResult(
        { kind: 'diagnostic', code: 'storage-failed', detail: externalErrorDetail(error) },
        context,
      );
    }
    if (!record) {
      return projectResumeResult(
        { kind: 'diagnostic', code: 'not-found', conversationId },
        context,
      );
    }
    if (context.slash.onResumeConversation) {
      await context.slash.onResumeConversation(record.id);
    }
    return projectResumeResult(
      {
        kind: 'resumed',
        title: record.title,
        messageCount: record.messageCount,
        updatedAt: record.updatedAt,
      },
      context,
    );
  }

  let records;
  try {
    records = await catalog.list();
  } catch (error) {
    return projectResumeResult(
      { kind: 'diagnostic', code: 'storage-failed', detail: externalErrorDetail(error) },
      context,
    );
  }
  return projectResumeResult(
    {
      kind: 'conversations',
      conversations: records.slice(0, 20).map((record) => ({
        id: record.id,
        title: record.title,
        updatedAt: record.updatedAt,
        messageCount: record.messageCount,
        current: record.id === context.slash.currentConversationId,
      })),
    },
    context,
  );
}

function handleHistory(context: TuiCommandRouterContext): TuiCommandRouterResult {
  const getHistory = context.slash.getHistory;
  if (!getHistory) {
    return projectHistoryResult({ kind: 'diagnostic', code: 'unavailable' }, context);
  }
  return projectHistoryResult(
    {
      kind: 'history',
      rows: getHistory()
        .filter(
          (message): message is typeof message & { readonly role: 'user' | 'assistant' | 'tool' } =>
            message.role !== 'system',
        )
        .map((message) => ({
          role: message.role,
          ...(typeof message.content === 'string'
            ? {
                preview: message.content.slice(0, 60) + (message.content.length > 60 ? '…' : ''),
              }
            : {}),
        })),
    },
    context,
  );
}

async function handleModel(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const args = input.slice('/model'.length).trim().split(/\s+/).filter(Boolean);
  const modelPorts = context.ports.model;
  const allOptions = modelPorts?.listChatModelOptions?.() ?? [];
  const chatOptions = buildChatModelOptions(context.slash.config, modelPorts, allOptions);
  const mediaOptions =
    context.ports.media?.listMediaModelOptions?.() ??
    allOptions.filter((option) => isMediaModelCategory(option.category));
  const perceptionOptions =
    context.ports.perception?.listPerceptionModelOptions?.() ??
    allOptions.filter((option) => option.category === 'llm');

  if (args.length === 0 || args[0] === 'list' || args[0] === 'status') {
    const currentMediaModels = readCurrentMediaModels(context);
    const currentPerceptionModels = context.ports.perception?.getCurrentPerceptionModels?.() ?? {};
    const currentChatModel = readCurrentChatModelIdentity(context.slash.config, chatOptions);
    return projectModelResult(
      {
        kind: 'status',
        currentModelId: formatModelIdentity(currentChatModel),
        options: toTerminalModelOptions(chatOptions, (option) =>
          sameModelIdentity(option, currentChatModel),
        ),
        media: buildMediaCategoryStatuses(
          TUI_MEDIA_CATEGORIES,
          currentMediaModels,
          mediaOptions,
          context,
        ),
        perception: buildPerceptionCategoryStatuses(
          TUI_MEDIA_CATEGORIES,
          currentPerceptionModels,
          perceptionOptions,
        ),
      },
      context,
    );
  }

  const target = args[0]?.toLowerCase();
  if (target === 'set' || target === 'chat') {
    return handleChatModelSelection(args.slice(1).join(' '), chatOptions, context);
  }
  if (target === 'perception' || target === 'perceive') {
    return handlePerception(`/perception ${args.slice(1).join(' ')}`, context);
  }
  if (isTuiMediaCategory(target)) {
    return handleMediaCategorySelection(target, args.slice(1).join(' '), mediaOptions, context);
  }
  return handleChatModelSelection(args.join(' '), chatOptions, context);
}

async function handleChatModelSelection(
  modelArg: string,
  options: readonly ChatModelOption[],
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const modelPorts = context.ports.model;
  const currentIdentity = readCurrentChatModelIdentity(context.slash.config, options);

  if (!modelArg) {
    if (!modelPorts?.selectMenuItem) {
      return projectModelResult(
        {
          kind: 'status',
          currentModelId: formatModelIdentity(currentIdentity),
          options: toTerminalModelOptions(options, (option) =>
            sameModelIdentity(option, currentIdentity),
          ),
          media: [],
          perception: [],
        },
        context,
      );
    }
    const projection = presentModelCommand(
      {
        kind: 'menu',
        options: toTerminalModelOptions(options, (option) =>
          sameModelIdentity(option, currentIdentity),
        ),
      },
      context.presentation,
    );
    const selected = await selectProjectedModelMenu(projection, modelPorts.selectMenuItem);
    if (!selected) return handled();
    return selectChatModel(selected, options, context);
  }

  return selectChatModel(modelArg, options, context);
}

async function selectChatModel(
  rawIdentity: string,
  options: readonly ChatModelOption[],
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const identity = resolveModelIdentity(rawIdentity, options, context.slash.config.provider);
  if (!identity) {
    return projectModelResult(
      { kind: 'diagnostic', diagnostic: { code: 'model.unknown', data: { modelId: rawIdentity } } },
      context,
    );
  }
  const select = context.ports.model?.selectChatModel;
  if (!select) {
    return projectModelResult(
      { kind: 'diagnostic', diagnostic: { code: 'model.selection-unavailable', data: {} } },
      context,
    );
  }
  let actualIdentity: TuiModelIdentity;
  try {
    actualIdentity = await select(identity);
  } catch (error) {
    return projectModelResult(
      {
        kind: 'diagnostic',
        diagnostic: {
          code: 'model.operation-failed',
          data: {},
          externalDetail: externalErrorDetail(error),
        },
      },
      context,
    );
  }
  return projectModelResult(
    { kind: 'selected', modelId: formatModelIdentity(actualIdentity) },
    context,
  );
}

async function handleMediaCategorySelection(
  category: TuiMediaCategory,
  modelArg: string,
  options: readonly ChatModelOption[],
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const currentModels = readCurrentMediaModels(context);
  const categoryOptions = options.filter((option) => option.category === category);

  if (!modelArg) {
    const selectMenuItem = context.ports.model?.selectMenuItem;
    if (!selectMenuItem || categoryOptions.length === 0) {
      return projectMediaResult(
        {
          kind: 'status',
          categories: buildMediaCategoryStatuses([category], currentModels, options, context),
          scope: 'category',
        },
        context,
      );
    }
    const projection = presentMediaCommand(
      {
        kind: 'menu',
        category,
        options: toTerminalModelOptions(categoryOptions, (option) =>
          matchesCurrentModel(option, currentModels[category]),
        ),
      },
      context.presentation,
    );
    const selected = await selectProjectedModelMenu(projection, selectMenuItem);
    if (!selected) return handled();
    return setMediaModelSelection(
      category,
      selected === '__none__'
        ? 'none'
        : resolveMediaModelIdentity(
            category,
            selected,
            categoryOptions,
            context.slash.config.provider,
            context.slash.config.mediaModels,
          ),
      selected,
      context,
    );
  }

  if (modelArg === 'list' || modelArg === 'status') {
    return projectMediaResult(
      {
        kind: 'status',
        categories: buildMediaCategoryStatuses([category], currentModels, options, context),
        scope: 'category',
      },
      context,
    );
  }

  const identity =
    modelArg === 'none'
      ? 'none'
      : resolveMediaModelIdentity(
          category,
          modelArg,
          categoryOptions,
          context.slash.config.provider,
          context.slash.config.mediaModels,
        );
  return setMediaModelSelection(category, identity, modelArg, context);
}

async function setMediaModelSelection(
  category: TuiMediaCategory,
  model: TuiModelIdentity | 'none' | null,
  requestedIdentity: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  if (!model) {
    return projectMediaResult(
      {
        kind: 'diagnostic',
        diagnostic: { code: 'media.unknown', data: { category, modelId: requestedIdentity } },
      },
      context,
    );
  }
  const mediaPorts = context.ports.media;
  if (!mediaPorts?.setMediaModel) {
    return projectMediaResult(
      {
        kind: 'diagnostic',
        diagnostic: { code: 'media.selection-unavailable', data: { category } },
      },
      context,
    );
  }
  try {
    model = await mediaPorts.setMediaModel(category, model);
  } catch (error) {
    return projectMediaResult(
      {
        kind: 'diagnostic',
        diagnostic: {
          code: 'media.operation-failed',
          data: { category },
          externalDetail: externalErrorDetail(error),
        },
      },
      context,
    );
  }
  return model === 'none'
    ? projectMediaResult({ kind: 'disabled', category }, context)
    : projectMediaResult(
        { kind: 'selected', category, modelId: formatModelIdentity(model) },
        context,
      );
}

async function handleMedia(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const args = input.slice('/media'.length).trim().split(/\s+/).filter(Boolean);
  const mediaPorts = context.ports.media;
  const options =
    mediaPorts?.listMediaModelOptions?.() ??
    context.ports.model
      ?.listChatModelOptions?.()
      .filter((option) => isMediaModelCategory(option.category)) ??
    [];
  const currentModels = readCurrentMediaModels(context);

  if (args.length === 0 || args[0] === 'list' || args[0] === 'status') {
    return projectMediaResult(
      {
        kind: 'status',
        categories: buildMediaCategoryStatuses(
          TUI_MEDIA_CATEGORIES,
          currentModels,
          options,
          context,
        ),
        scope: 'all',
      },
      context,
    );
  }

  const subcommand = args[0]?.toLowerCase();
  if (subcommand === 'reset') {
    if (!mediaPorts?.resetMediaModels) {
      return projectMediaResult(
        { kind: 'diagnostic', diagnostic: { code: 'media.reset-unavailable', data: {} } },
        context,
      );
    }
    let resetState: Readonly<Partial<Record<TuiMediaCategory, string>>>;
    try {
      resetState = await mediaPorts.resetMediaModels();
    } catch (error) {
      return projectMediaResult(
        {
          kind: 'diagnostic',
          diagnostic: {
            code: 'media.reset-failed',
            data: {},
            externalDetail: externalErrorDetail(error),
          },
        },
        context,
      );
    }
    assertResetState('media', resetState);
    return projectMediaResult({ kind: 'reset' }, context);
  }

  if (!isTuiMediaCategory(subcommand)) {
    return projectMediaResult(
      { kind: 'diagnostic', diagnostic: { code: 'media.category-unknown', data: {} } },
      context,
    );
  }
  return handleMediaCategorySelection(subcommand, args.slice(1).join(' '), options, context);
}

async function handlePerception(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const args = input.slice('/perception'.length).trim().split(/\s+/).filter(Boolean);
  const perceptionPorts = context.ports.perception;
  const options =
    perceptionPorts?.listPerceptionModelOptions?.() ??
    context.ports.model?.listChatModelOptions?.().filter((option) => option.category === 'llm') ??
    [];
  const currentModels = perceptionPorts?.getCurrentPerceptionModels?.() ?? {};

  if (args.length === 0 || args[0] === 'list' || args[0] === 'status') {
    return projectPerceptionResult(
      {
        kind: 'status',
        categories: buildPerceptionCategoryStatuses(TUI_MEDIA_CATEGORIES, currentModels, options),
        scope: 'all',
      },
      context,
    );
  }

  const subcommand = args[0]?.toLowerCase();
  if (subcommand === 'reset') {
    if (!perceptionPorts?.resetPerceptionModels) {
      return projectPerceptionResult(
        { kind: 'diagnostic', diagnostic: { code: 'perception.reset-unavailable', data: {} } },
        context,
      );
    }
    let resetState: Readonly<Partial<Record<TuiMediaCategory, string>>>;
    try {
      resetState = await perceptionPorts.resetPerceptionModels();
    } catch (error) {
      return projectPerceptionResult(
        {
          kind: 'diagnostic',
          diagnostic: {
            code: 'perception.reset-failed',
            data: {},
            externalDetail: externalErrorDetail(error),
          },
        },
        context,
      );
    }
    assertResetState('perception', resetState);
    return projectPerceptionResult({ kind: 'reset' }, context);
  }
  if (!isTuiMediaCategory(subcommand)) {
    return projectPerceptionResult(
      { kind: 'diagnostic', diagnostic: { code: 'perception.category-unknown', data: {} } },
      context,
    );
  }

  const category = subcommand;
  const modelArg = args.slice(1).join(' ');
  const categoryOptions = options.filter((option) => supportsPerceptionCategory(option, category));
  if (!modelArg) {
    const selectMenuItem = context.ports.model?.selectMenuItem;
    if (!selectMenuItem || categoryOptions.length === 0) {
      return projectPerceptionResult(
        {
          kind: 'status',
          categories: buildPerceptionCategoryStatuses([category], currentModels, options),
          scope: 'category',
        },
        context,
      );
    }
    const projection = presentPerceptionCommand(
      {
        kind: 'menu',
        category,
        options: toTerminalModelOptions(categoryOptions, (option) =>
          matchesCurrentModel(option, currentModels[category]),
        ),
      },
      context.presentation,
    );
    const selected = await selectProjectedModelMenu(projection, selectMenuItem);
    if (!selected) return handled();
    return setPerceptionModelSelection(
      category,
      selected === '__auto__'
        ? 'auto'
        : resolvePerceptionModelIdentity(
            category,
            selected,
            categoryOptions,
            context.slash.config.provider,
          ),
      selected,
      context,
    );
  }
  if (modelArg === 'list' || modelArg === 'status') {
    return projectPerceptionResult(
      {
        kind: 'status',
        categories: buildPerceptionCategoryStatuses([category], currentModels, options),
        scope: 'category',
      },
      context,
    );
  }
  const identity =
    modelArg === 'auto'
      ? 'auto'
      : resolvePerceptionModelIdentity(
          category,
          modelArg,
          categoryOptions,
          context.slash.config.provider,
        );
  return setPerceptionModelSelection(category, identity, modelArg, context);
}

async function setPerceptionModelSelection(
  category: TuiMediaCategory,
  model: TuiModelIdentity | 'auto' | null,
  requestedIdentity: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  if (!model) {
    return projectPerceptionResult(
      {
        kind: 'diagnostic',
        diagnostic: { code: 'perception.unknown', data: { category, modelId: requestedIdentity } },
      },
      context,
    );
  }
  const setPerceptionModel = context.ports.perception?.setPerceptionModel;
  if (!setPerceptionModel) {
    return projectPerceptionResult(
      {
        kind: 'diagnostic',
        diagnostic: { code: 'perception.selection-unavailable', data: { category } },
      },
      context,
    );
  }
  try {
    model = await setPerceptionModel(category, model);
  } catch (error) {
    return projectPerceptionResult(
      {
        kind: 'diagnostic',
        diagnostic: {
          code: 'perception.operation-failed',
          data: { category },
          externalDetail: externalErrorDetail(error),
        },
      },
      context,
    );
  }
  return model === 'auto'
    ? projectPerceptionResult({ kind: 'automatic', category }, context)
    : projectPerceptionResult(
        { kind: 'selected', category, modelId: formatModelIdentity(model) },
        context,
      );
}

async function selectProjectedModelMenu(
  projection: AgentTerminalCommandProjection,
  selectMenuItem: NonNullable<TuiModelPorts['selectMenuItem']>,
): Promise<string | null> {
  if (projection.kind !== 'model-menu') {
    throw new Error('Model-family menu Presenter did not return a model-menu projection.');
  }
  return selectMenuItem(projection.menu);
}

function buildChatModelOptions(
  config: CLIConfig,
  ports: TuiModelPorts | undefined,
  registeredOptions: readonly ChatModelOption[],
): readonly ChatModelOption[] {
  const chatOptions = registeredOptions.filter((option) => !isMediaModelCategory(option.category));
  if (chatOptions.length > 0) return chatOptions;
  const models = [
    ...(ports?.listChatModels?.() ?? getProviderModels(config.provider, config.workDir)),
  ];
  if (!models.includes(config.model)) models.unshift(config.model);
  return models.map((modelId) => ({
    id: `${config.provider}:${modelId}`,
    label: modelId,
    providerId: config.provider,
    modelId,
    category: 'llm' as const,
  }));
}

function buildMediaCategoryStatuses(
  categories: readonly TuiMediaCategory[],
  currentModels: Partial<Record<TuiMediaCategory, string>>,
  options: readonly ChatModelOption[],
  context: TuiCommandRouterContext,
) {
  return categories.map((category) => {
    const categoryOptions = options.filter((option) => option.category === category);
    const current = currentModels[category];
    return {
      category,
      ...(current && current !== 'none'
        ? { currentModelId: formatCurrentModelId(current, categoryOptions) }
        : {}),
      source: readMediaModelSource(
        category,
        currentModels,
        context.slash.config.defaultMediaModels,
      ),
      options: toTerminalModelOptions(categoryOptions, (option) =>
        matchesCurrentModel(option, current),
      ),
    };
  });
}

function buildPerceptionCategoryStatuses(
  categories: readonly TuiMediaCategory[],
  currentModels: Partial<Record<TuiMediaCategory, string>>,
  options: readonly ChatModelOption[],
) {
  return categories.map((category) => {
    const categoryOptions = options.filter((option) =>
      supportsPerceptionCategory(option, category),
    );
    const current = currentModels[category];
    return {
      category,
      ...(current && current !== 'auto'
        ? { currentModelId: formatCurrentModelId(current, categoryOptions) }
        : {}),
      options: toTerminalModelOptions(categoryOptions, (option) =>
        matchesCurrentModel(option, current),
      ),
    };
  });
}

function readCurrentMediaModels(
  context: TuiCommandRouterContext,
): Partial<Record<TuiMediaCategory, string>> {
  return {
    ...(context.slash.config.defaultMediaModels ?? {}),
    ...(context.ports.media?.getCurrentMediaModels?.() ?? {}),
  };
}

function readMediaModelSource(
  category: TuiMediaCategory,
  currentModels: Partial<Record<TuiMediaCategory, string>>,
  defaults: CLIConfig['defaultMediaModels'],
): 'session-override' | 'config-default' | 'not-set' {
  const current = currentModels[category];
  if (current !== undefined && current !== defaults?.[category]) return 'session-override';
  return defaults?.[category] !== undefined ? 'config-default' : 'not-set';
}

function formatCurrentModelId(current: string, options: readonly ChatModelOption[]): string {
  const option = options.find((candidate) => matchesCurrentModel(candidate, current));
  return option ? `${option.id} (${option.label})` : current;
}

function matchesCurrentModel(option: ChatModelOption, current: string | undefined): boolean {
  return (
    current !== undefined &&
    (option.id === current ||
      option.modelId === current ||
      `${option.providerId}/${option.modelId}` === current ||
      `${option.providerId}:${option.modelId}` === current)
  );
}

function readCurrentChatModelIdentity(
  config: CLIConfig,
  options: readonly ChatModelOption[] = [],
): TuiModelIdentity {
  const providerId = config.chatModel?.providerId ?? config.provider;
  const modelId = config.chatModel?.modelId ?? config.model;
  const resolved =
    resolveModelIdentity(`${providerId}:${modelId}`, options, providerId) ??
    resolveModelIdentity(modelId, options, providerId);
  return (
    resolved ?? {
      providerId,
      modelId,
      ...(config.chatModel?.providerExpressionProfileId
        ? { providerExpressionProfileId: config.chatModel.providerExpressionProfileId }
        : {}),
      optionId: `${providerId}:${modelId}`,
      label: `${providerId} / ${modelId}`,
    }
  );
}

function isMediaModelCategory(
  category: ChatModelOption['category'] | undefined,
): category is TuiMediaCategory {
  return category === 'image' || category === 'video' || category === 'audio';
}

function resolveModelIdentity(
  rawIdentity: string,
  options: readonly ChatModelOption[],
  defaultProviderId: string,
): TuiModelIdentity | null {
  const identity = rawIdentity.trim();
  if (!identity) return null;
  const byOption = options.find(
    (option) =>
      option.id === identity ||
      `${option.providerId}/${option.modelId}` === identity ||
      option.modelId === identity,
  );
  if (byOption) return chatModelOptionToIdentity(byOption);
  if (options.length > 0) return null;
  return (
    parseExplicitModelIdentity(identity) ?? {
      providerId: defaultProviderId,
      modelId: identity,
      optionId: `${defaultProviderId}:${identity}`,
      label: `${defaultProviderId} / ${identity}`,
    }
  );
}

function parseExplicitModelIdentity(rawIdentity: string): TuiModelIdentity | null {
  const separator = rawIdentity.includes('/') ? '/' : rawIdentity.includes(':') ? ':' : null;
  if (!separator) return null;
  const [providerId, modelId] = rawIdentity.split(separator, 2);
  if (!providerId || !modelId) return null;
  return {
    providerId,
    modelId,
    optionId: `${providerId}:${modelId}`,
    label: `${providerId} / ${modelId}`,
  };
}

function chatModelOptionToIdentity(option: ChatModelOption): TuiModelIdentity {
  return {
    providerId: option.providerId,
    modelId: option.modelId,
    ...(option.providerExpressionProfileId
      ? { providerExpressionProfileId: option.providerExpressionProfileId }
      : {}),
    optionId: option.id,
    label: option.label,
    category: option.category,
      ...(option.capabilities ? { capabilities: option.capabilities } : {}),
      ...(option.protocolProfile ? { protocolProfile: option.protocolProfile } : {}),
      ...(option.contextWindow ? { contextWindow: option.contextWindow } : {}),
      ...(option.maxOutputTokens ? { maxOutputTokens: option.maxOutputTokens } : {}),
  };
}

function sameModelIdentity(
  option: Pick<ChatModelOption, 'providerId' | 'modelId' | 'id'>,
  identity: TuiModelIdentity,
): boolean {
  return (
    option.id === identity.optionId ||
    (option.providerId === identity.providerId && option.modelId === identity.modelId)
  );
}

function formatModelIdentity(identity: TuiModelIdentity): string {
  const label = identity.label ? ` (${identity.label})` : '';
  return `${identity.providerId}:${identity.modelId}${label}`;
}

function externalErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveMediaModelIdentity(
  category: TuiMediaCategory,
  rawIdentity: string,
  options: readonly ChatModelOption[],
  defaultProviderId: string,
  configuredModels: readonly string[],
): TuiModelIdentity | null {
  const option = resolveMediaOption(category, rawIdentity, options);
  if (option) {
    return chatModelOptionToIdentity(option);
  }
  if (options.length > 0) {
    return null;
  }
  const explicit = parseExplicitModelIdentity(rawIdentity);
  if (explicit) {
    return { ...explicit, category };
  }
  if (configuredModels.includes(rawIdentity) || options.length === 0) {
    return {
      providerId: defaultProviderId,
      modelId: rawIdentity,
      optionId: `${defaultProviderId}:${rawIdentity}`,
      label: `${defaultProviderId} / ${rawIdentity}`,
      category,
    };
  }
  return null;
}

function resolveMediaOption(
  category: TuiMediaCategory,
  identity: string,
  options: readonly ChatModelOption[],
): ChatModelOption | undefined {
  return options.find(
    (option) =>
      option.category === category &&
      (option.id === identity ||
        option.modelId === identity ||
        `${option.providerId}:${option.modelId}` === identity ||
        `${option.providerId}/${option.modelId}` === identity),
  );
}

function resolvePerceptionModelIdentity(
  category: TuiMediaCategory,
  rawIdentity: string,
  options: readonly ChatModelOption[],
  defaultProviderId: string,
): TuiModelIdentity | null {
  const option = resolvePerceptionOption(category, rawIdentity, options);
  if (option) {
    return { ...chatModelOptionToIdentity(option), category: 'llm' };
  }
  if (options.length > 0) {
    return null;
  }
  const explicit = parseExplicitModelIdentity(rawIdentity);
  if (explicit) {
    return { ...explicit, category: 'llm' };
  }
  return {
    providerId: defaultProviderId,
    modelId: rawIdentity,
    optionId: `${defaultProviderId}:${rawIdentity}`,
    label: `${defaultProviderId} / ${rawIdentity}`,
    category: 'llm',
  };
}

function resolvePerceptionOption(
  category: TuiMediaCategory,
  identity: string,
  options: readonly ChatModelOption[],
): ChatModelOption | undefined {
  return options.find(
    (option) =>
      option.category === 'llm' &&
      supportsPerceptionCategory(option, category) &&
      (option.id === identity ||
        option.modelId === identity ||
        `${option.providerId}:${option.modelId}` === identity ||
        `${option.providerId}/${option.modelId}` === identity),
  );
}

function isTuiMediaCategory(value: string | undefined): value is TuiMediaCategory {
  return TUI_MEDIA_CATEGORIES.includes(value as TuiMediaCategory);
}

async function handleParam(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const parameterPorts = context.ports.parameters;
  if (!parameterPorts) {
    return projectParameterResult(
      { kind: 'diagnostic', diagnostic: { code: 'unavailable' } },
      context,
    );
  }

  const args = input.slice('/param'.length).trim().split(/\s+/).filter(Boolean);
  const currentConfig = parameterPorts.getConfig?.() ?? {};

  if (args.length === 0 || args[0] === 'status' || args[0] === 'list') {
    return projectParameterResult({ kind: 'status', config: currentConfig }, context);
  }

  const subcommand = args[0]?.toLowerCase();
  if (subcommand === 'clear' || subcommand === 'reset') {
    const result = validateLlmParameters({}, parameterPorts);
    if (result.diagnostics?.length) {
      return projectParameterResult(validationDiagnostic(result.diagnostics), context);
    }
    await parameterPorts.apply?.(result);
    return projectParameterResult({ kind: 'reset' }, context);
  }

  if (subcommand !== 'set') {
    return projectParameterResult({ kind: 'diagnostic', diagnostic: { code: 'usage' } }, context);
  }

  const key = args[1];
  const value = args[2];
  if (!key || value === undefined) {
    return projectParameterResult(
      { kind: 'diagnostic', diagnostic: { code: 'set-usage' } },
      context,
    );
  }

  const nextConfigResult = buildUpdatedLlmParameterConfig(currentConfig, key, value);
  if (!nextConfigResult.ok) {
    return projectParameterResult(
      { kind: 'diagnostic', diagnostic: nextConfigResult.diagnostic },
      context,
    );
  }

  const result = validateLlmParameters(nextConfigResult.config, parameterPorts);
  if (result.diagnostics?.length) {
    return projectParameterResult(validationDiagnostic(result.diagnostics), context);
  }

  await parameterPorts.apply?.(result);
  return projectParameterResult(
    {
      kind: 'updated',
      name: key,
      value,
      application: projectParameterApplication(result),
    },
    context,
  );
}

function validationDiagnostic(
  diagnostics: readonly ParameterValidationDiagnostic[],
): ParameterSemanticResult {
  return {
    kind: 'diagnostic',
    diagnostic: { code: 'validation-failed', causes: diagnostics },
  };
}

function validateLlmParameters(
  config: AgentLlmConfig,
  parameterPorts: TuiParameterPorts,
): TuiParameterValidationResult {
  return parameterPorts.validate?.(config) ?? { config };
}

function projectParameterApplication(
  result: TuiParameterValidationResult,
): ParameterApplicationProjection {
  const chatOptions = result.chatOptions ?? {};
  const rows: Array<Readonly<{ name: string; value: string | number }>> = [];
  for (const name of ['temperature', 'topP', 'maxTokens', 'thinkingBudget'] as const) {
    const value = chatOptions[name];
    if (value !== undefined) {
      rows.push({ name, value });
    }
  }
  return {
    rows,
    providerOptionNames: Object.keys(result.providerOptions ?? {}),
  };
}

function buildUpdatedLlmParameterConfig(
  config: AgentLlmConfig,
  key: string,
  value: string,
): { ok: true; config: AgentLlmConfig } | { ok: false; diagnostic: ParameterDiagnostic } {
  if (isTuiParamPresetKey(key)) {
    return updatePresetParameter(config, key, value);
  }

  if (!isTuiParamAdvancedKey(key)) {
    return {
      ok: false,
      diagnostic: { code: 'unsupported', name: key },
    };
  }

  const parsed = parseAdvancedParameterValue(key, value);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    config: {
      ...config,
      advanced: {
        ...(config.advanced ?? {}),
        [key]: parsed.value,
      },
    },
  };
}

function updatePresetParameter(
  config: AgentLlmConfig,
  key: TuiParamPresetKey,
  value: string,
): { ok: true; config: AgentLlmConfig } | { ok: false; diagnostic: ParameterDiagnostic } {
  if (key === 'reasoning') {
    if (!isReasoningPreset(value)) {
      return { ok: false, diagnostic: { code: 'invalid-reasoning' } };
    }
    return { ok: true, config: { ...config, reasoningPreset: value } };
  }
  if (key === 'verbosity') {
    if (!isVerbosityPreset(value)) {
      return { ok: false, diagnostic: { code: 'invalid-verbosity-preset' } };
    }
    return { ok: true, config: { ...config, verbosityPreset: value } };
  }
  if (!isCreativityPreset(value)) {
    return { ok: false, diagnostic: { code: 'invalid-creativity' } };
  }
  return { ok: true, config: { ...config, creativityPreset: value } };
}

function parseAdvancedParameterValue(
  key: keyof AgentLlmAdvancedParams,
  rawValue: string,
): { ok: true; value: string | number } | { ok: false; diagnostic: ParameterDiagnostic } {
  switch (key) {
    case 'temperature':
    case 'topP': {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0 || value > 2) {
        return { ok: false, diagnostic: { code: 'number-range', name: key } };
      }
      return { ok: true, value };
    }
    case 'maxOutputTokens':
    case 'thinkingBudget': {
      const value = Number(rawValue);
      if (!Number.isInteger(value) || value <= 0) {
        return { ok: false, diagnostic: { code: 'positive-integer', name: key } };
      }
      return { ok: true, value };
    }
    case 'reasoningEffort':
      if (!isReasoningEffort(rawValue)) {
        return {
          ok: false,
          diagnostic: { code: 'invalid-reasoning-effort' },
        };
      }
      return { ok: true, value: rawValue };
    case 'verbosity':
      if (!isTextVerbosity(rawValue)) {
        return { ok: false, diagnostic: { code: 'invalid-text-verbosity' } };
      }
      return { ok: true, value: rawValue };
    case 'serviceTier':
      if (!isServiceTier(rawValue)) {
        return {
          ok: false,
          diagnostic: { code: 'invalid-service-tier' },
        };
      }
      return { ok: true, value: rawValue };
  }
}

function isTuiParamPresetKey(value: string): value is TuiParamPresetKey {
  return TUI_PARAM_PRESET_KEYS.includes(value as TuiParamPresetKey);
}

function isTuiParamAdvancedKey(value: string): value is keyof AgentLlmAdvancedParams {
  return TERMINAL_ADVANCED_PARAMETER_KEYS.includes(value as keyof AgentLlmAdvancedParams);
}

function isReasoningPreset(value: string): value is NonNullable<AgentLlmConfig['reasoningPreset']> {
  return value === 'fast' || value === 'balanced' || value === 'deep';
}

function isVerbosityPreset(value: string): value is NonNullable<AgentLlmConfig['verbosityPreset']> {
  return value === 'brief' || value === 'standard' || value === 'detailed';
}

function isCreativityPreset(
  value: string,
): value is NonNullable<AgentLlmConfig['creativityPreset']> {
  return value === 'stable' || value === 'creative' || value === 'wild';
}

function isReasoningEffort(
  value: string,
): value is NonNullable<AgentLlmAdvancedParams['reasoningEffort']> {
  return (
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  );
}

function isTextVerbosity(value: string): value is NonNullable<AgentLlmAdvancedParams['verbosity']> {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isServiceTier(value: string): value is NonNullable<AgentLlmAdvancedParams['serviceTier']> {
  return (
    value === 'auto' ||
    value === 'default' ||
    value === 'fast' ||
    value === 'flex' ||
    value === 'priority'
  );
}

async function handleSkill(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const skillArg = input.slice('/skill'.length).trim();
  const skillPorts = context.ports.skill;

  if (!skillPorts) {
    return projectSkillResult({ kind: 'catalog-unavailable' }, context);
  }

  const skills = skillPorts.listEnabled?.() ?? [];
  if (skills.length === 0) {
    return projectSkillResult({ kind: 'catalog-empty' }, context);
  }

  if (skillArg) {
    const [skillName = '', ...argParts] = skillArg.split(/\s+/);
    const args = argParts.join(' ').trim();
    const ok = (await skillPorts.execute?.(skillName, args || undefined)) ?? false;
    return projectSkillResult(
      ok ? { kind: 'invoked', skillName } : { kind: 'not-found', skillName },
      context,
    );
  }

  const menu = presentSkillMenu(context.presentation);
  const selectedId = await skillPorts.selectSkillFromMenu?.({
    title: menu.title,
    items: skills.map((skill) => ({
      id: skill.name,
      label: skill.name,
      description: skill.description,
    })),
  });
  if (!selectedId) return handled();

  const ok = (await skillPorts.execute?.(selectedId)) ?? false;
  return ok ? projectSkillResult({ kind: 'invoked', skillName: selectedId }, context) : handled();
}

function handleQueue(input: string, context: TuiCommandRouterContext): TuiCommandRouterResult {
  const queuePorts = context.ports.queue;
  if (!queuePorts) {
    return projectQueueResult({ kind: 'diagnostic', code: 'unavailable' }, context);
  }

  const args = input.slice('/queue'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'list';

  try {
    if (subcommand === 'list' || subcommand === 'status') {
      const snapshot = queuePorts.getSnapshot();
      return snapshot === null
        ? projectQueueResult({ kind: 'diagnostic', code: 'unavailable' }, context)
        : projectQueueResult({ kind: 'status', snapshot }, context);
    }

    const queueItemId = args[1];
    if (!queueItemId) {
      return projectQueueResult({ kind: 'diagnostic', code: 'usage' }, context);
    }

    if (subcommand === 'send-now') {
      return projectQueueResult({ kind: 'diagnostic', code: 'send-now-unsupported' }, context);
    }

    if (subcommand === 'promote' || subcommand === 'send-next') {
      if (!queuePorts.promote) {
        return projectQueueResult(
          { kind: 'diagnostic', code: 'operation-unavailable', operation: 'promote' },
          context,
        );
      }
      const item = queuePorts.promote(queueItemId);
      const target =
        item.source === 'user' || item.source === 'composer' ? 'user-message' : 'continuation';
      return projectQueueResult({ kind: 'promoted', item, target }, context);
    }

    if (subcommand === 'cancel') {
      if (!queuePorts.cancel) {
        return projectQueueResult(
          { kind: 'diagnostic', code: 'operation-unavailable', operation: 'cancel' },
          context,
        );
      }
      const item = queuePorts.cancel(queueItemId);
      return projectQueueResult({ kind: 'cancelled', itemId: item.id }, context);
    }

    if (subcommand === 'discard') {
      if (!queuePorts.discardContinuation) {
        return projectQueueResult({ kind: 'diagnostic', code: 'discard-unavailable' }, context);
      }
      const item = queuePorts.discardContinuation(queueItemId);
      return projectQueueResult({ kind: 'discarded', itemId: item.id }, context);
    }

    if (subcommand === 'edit') {
      const content = input
        .slice('/queue'.length)
        .trim()
        .replace(/^edit\s+\S+\s*/i, '')
        .trim();
      if (!content) {
        return projectQueueResult({ kind: 'diagnostic', code: 'edit-usage' }, context);
      }
      if (!queuePorts.edit) {
        return projectQueueResult(
          { kind: 'diagnostic', code: 'operation-unavailable', operation: 'edit' },
          context,
        );
      }
      const item = queuePorts.edit(queueItemId, content);
      return projectQueueResult({ kind: 'edited', itemId: item.id }, context);
    }
  } catch (error) {
    return projectQueueResult(toQueueOperationDiagnostic(error), context);
  }

  return projectQueueResult(
    { kind: 'diagnostic', code: 'unknown-command', command: subcommand },
    context,
  );
}

async function handleTasks(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const taskPorts = context.ports.task;
  if (!taskPorts) {
    return projectTaskResult({ kind: 'diagnostic', code: 'unavailable' }, context);
  }

  const args = input.trim().split(/\s+/).slice(1);
  const subcommand = args[0]?.toLowerCase();
  const statusArg =
    subcommand === 'list' || subcommand === 'status' ? args[1]?.toLowerCase() : subcommand;

  if (statusArg && statusArg !== 'all' && !isTuiTaskStatus(statusArg)) {
    return projectTaskResult({ kind: 'diagnostic', code: 'usage' }, context);
  }

  const status = isTuiTaskStatus(statusArg) ? statusArg : undefined;
  const tasks = await taskPorts.list(status);
  return projectTaskResult(
    {
      kind: 'list',
      status,
      rows: tasks.map(toTaskCommandRow),
    },
    context,
  );
}

function isTuiTaskStatus(value: string | undefined): value is TaskStatus {
  return TUI_TASK_STATUSES.includes(value as TaskStatus);
}

function toTaskCommandRow(task: Task): TaskCommandRow {
  const progress = Number.isFinite(task.progress) ? Math.round(task.progress) : 0;
  return {
    id: task.id,
    status: task.status,
    progress,
    runMode: task.lifecycle?.runMode ?? task.input.lifecycle?.runMode ?? 'foreground',
    title: readTaskTitle(task),
    error: task.error ?? task.output?.error,
    updatedAt: task.updatedAt,
  };
}

function readTaskTitle(task: Task): string {
  const payload = task.input.payload;
  for (const key of ['prompt', 'title', 'name', 'description', 'content'] as const) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return trimTaskTitle(value.trim());
    }
  }
  return task.type;
}

function trimTaskTitle(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

async function handleMcp(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const mcpPorts = context.ports.mcp;
  if (!mcpPorts) {
    return projectMcpResult({ kind: 'diagnostic', code: 'unavailable' }, context);
  }

  const args = input.slice('/mcp'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'status';

  if (subcommand === 'status' || subcommand === 'list') {
    return projectMcpResult({ kind: 'servers', servers: mcpPorts.listServers() }, context);
  }

  if (subcommand === 'tools') {
    const serverId = args[1];
    if (serverId && !findMcpServer(mcpPorts.listServers(), serverId)) {
      return projectMcpResult({ kind: 'diagnostic', code: 'unknown-server', serverId }, context);
    }
    const listTools = mcpPorts.listTools;
    if (!listTools) {
      return projectMcpResult({ kind: 'diagnostic', code: 'tools-unavailable' }, context);
    }
    return projectMcpResult({ kind: 'tools', serverId, tools: await listTools(serverId) }, context);
  }

  const serverId = args[1];
  if (!serverId) {
    return projectMcpResult({ kind: 'diagnostic', code: 'usage' }, context);
  }

  const server = findMcpServer(mcpPorts.listServers(), serverId);
  if (!server) {
    return projectMcpResult({ kind: 'diagnostic', code: 'unknown-server', serverId }, context);
  }

  try {
    if (subcommand === 'connect') {
      if (!server.enabled) {
        return projectMcpResult({ kind: 'diagnostic', code: 'server-disabled', serverId }, context);
      }
      if (!mcpPorts.connect) {
        return projectMcpResult({ kind: 'diagnostic', code: 'connect-unavailable' }, context);
      }
      await mcpPorts.connect(serverId);
      return projectMcpResult(
        { kind: 'operation-complete', operation: 'connected', serverId },
        context,
      );
    }

    if (subcommand === 'disconnect') {
      if (!mcpPorts.disconnect) {
        return projectMcpResult({ kind: 'diagnostic', code: 'disconnect-unavailable' }, context);
      }
      await mcpPorts.disconnect(serverId);
      return projectMcpResult(
        { kind: 'operation-complete', operation: 'disconnected', serverId },
        context,
      );
    }

    if (subcommand === 'reconnect') {
      if (!server.enabled) {
        return projectMcpResult({ kind: 'diagnostic', code: 'server-disabled', serverId }, context);
      }
      if (mcpPorts.reconnect) {
        await mcpPorts.reconnect(serverId);
      } else {
        if (!mcpPorts.disconnect || !mcpPorts.connect) {
          return projectMcpResult({ kind: 'diagnostic', code: 'reconnect-unavailable' }, context);
        }
        await mcpPorts.disconnect(serverId);
        await mcpPorts.connect(serverId);
      }
      return projectMcpResult(
        { kind: 'operation-complete', operation: 'reconnected', serverId },
        context,
      );
    }
  } catch (error) {
    return projectMcpResult(
      {
        kind: 'diagnostic',
        code: 'operation-failed',
        detail: error instanceof Error ? error.message : String(error),
      },
      context,
    );
  }

  return projectMcpResult(
    { kind: 'diagnostic', code: 'unknown-command', command: subcommand },
    context,
  );
}

function findMcpServer(
  servers: readonly TuiMcpServerSnapshot[],
  serverId: string,
): TuiMcpServerSnapshot | undefined {
  return servers.find((server) => server.id === serverId);
}

function handleCapability(input: string, context: TuiCommandRouterContext): TuiCommandRouterResult {
  const capabilityPorts = context.ports.capability;
  if (!capabilityPorts) {
    return projectCapabilityResult({ kind: 'diagnostic', code: 'unavailable' }, context);
  }

  const args = input.slice('/capability'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'list';

  if (subcommand === 'list' || subcommand === 'status') {
    return projectCapabilityResult(
      {
        kind: 'providers',
        providers: capabilityPorts.getProviderSummaries(),
        diagnostics: capabilityPorts.getDiagnostics(),
      },
      context,
    );
  }

  if (subcommand === 'show') {
    const providerId = args[1];
    if (!providerId) {
      return projectCapabilityResult({ kind: 'diagnostic', code: 'show-usage' }, context);
    }
    const provider = capabilityPorts
      .getProviderSummaries()
      .find((candidate) => candidate.providerId === providerId);
    if (!provider) {
      return projectCapabilityResult(
        { kind: 'diagnostic', code: 'unknown-provider', providerId },
        context,
      );
    }
    return projectCapabilityResult({ kind: 'provider', provider }, context);
  }

  if (subcommand === 'tools') {
    const providerId = args[1];
    if (providerId && !hasCapabilityProvider(capabilityPorts.getProviderSummaries(), providerId)) {
      return projectCapabilityResult(
        { kind: 'diagnostic', code: 'unknown-provider', providerId },
        context,
      );
    }
    return projectCapabilityResult(
      { kind: 'tools', providerId, tools: capabilityPorts.listTools(providerId) },
      context,
    );
  }

  return projectCapabilityResult(
    { kind: 'diagnostic', code: 'unknown-command', command: subcommand },
    context,
  );
}

function hasCapabilityProvider(
  providers: readonly AgentCapabilityProviderAvailabilitySummary[],
  providerId: string,
): boolean {
  return providers.some((provider) => provider.providerId === providerId);
}

async function handleArtifact(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const artifactPorts = context.ports.artifact;
  if (!artifactPorts)
    return projectArtifactResult({ kind: 'diagnostic', code: 'unavailable' }, context);

  const args = input.slice('/artifact'.length).trim().split(/\s+/).filter(Boolean);
  const subcommand = args[0]?.toLowerCase() ?? 'list';
  if (subcommand === 'list') {
    if (!artifactPorts.list)
      return projectArtifactResult({ kind: 'diagnostic', code: 'list-unavailable' }, context);
    return projectArtifactResult({ kind: 'list', references: artifactPorts.list() }, context);
  }
  if (subcommand === 'show') {
    const artifactId = args[1];
    if (!artifactId)
      return projectArtifactResult({ kind: 'diagnostic', code: 'show-usage' }, context);
    if (!artifactPorts.show)
      return projectArtifactResult({ kind: 'diagnostic', code: 'show-unavailable' }, context);
    const reference = artifactPorts.show(artifactId);
    return reference
      ? projectArtifactResult({ kind: 'reference', reference }, context)
      : projectArtifactResult(
          { kind: 'diagnostic', code: 'unknown-reference', artifactId },
          context,
        );
  }
  if (subcommand === 'open') {
    const artifactId = args[1];
    if (!artifactId)
      return projectArtifactResult({ kind: 'diagnostic', code: 'open-usage' }, context);
    if (!artifactPorts.open)
      return projectArtifactResult({ kind: 'diagnostic', code: 'open-unavailable' }, context);
    await artifactPorts.open(artifactId);
    return projectArtifactResult({ kind: 'opened', artifactId }, context);
  }
  if (subcommand === 'send') {
    const target = args[1];
    const artifactId = args[2];
    if (!target || !artifactId)
      return projectArtifactResult({ kind: 'diagnostic', code: 'send-usage' }, context);
    if (!artifactPorts.send)
      return projectArtifactResult({ kind: 'diagnostic', code: 'send-unavailable' }, context);
    await artifactPorts.send(target, artifactId);
    return projectArtifactResult({ kind: 'sent', artifactId, target }, context);
  }
  return projectArtifactResult(
    { kind: 'diagnostic', code: 'unknown-command', command: subcommand },
    context,
  );
}

function handleStatus(context: TuiCommandRouterContext): TuiCommandRouterResult {
  const statusPorts = context.ports.status;
  if (statusPorts === undefined) {
    throw new Error('TUI status snapshot provider is required by the canonical status path.');
  }
  return handled({
    output: presentTuiStatus(statusPorts.getSnapshot(), context.presentation),
  });
}

async function handleSessionMode(
  input: string,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const modeArg = input.slice('/mode'.length).trim().toLowerCase();
  const modePorts = context.ports.mode;

  if (!modeArg) {
    return projectSessionControlResult(
      {
        kind: 'session-mode-status',
        current: modePorts?.getSessionMode?.() ?? 'agent',
        available: TUI_SESSION_MODES,
      },
      context,
    );
  }

  if (!isTuiSessionMode(modeArg)) {
    return projectSessionControlResult(
      {
        kind: 'diagnostic',
        code: 'session-mode-unsupported',
        value: modeArg,
        available: TUI_SESSION_MODES,
      },
      context,
    );
  }

  const setSessionMode = modePorts?.setSessionMode;
  if (!setSessionMode) {
    return projectSessionControlResult(
      { kind: 'diagnostic', code: 'session-mode-unavailable' },
      context,
    );
  }

  await setSessionMode(modeArg);
  return projectSessionControlResult({ kind: 'session-mode-selected', mode: modeArg }, context);
}

function isTuiSessionMode(value: string): value is TuiSessionMode {
  return TUI_SESSION_MODES.includes(value as TuiSessionMode);
}

async function handleCompact(context: TuiCommandRouterContext): Promise<TuiCommandRouterResult> {
  const compact = context.ports.context?.compact;
  if (!compact) {
    return projectSessionControlResult(
      { kind: 'diagnostic', code: 'context-compaction-unavailable' },
      context,
    );
  }

  const result = await compact();
  return projectSessionControlResult({ kind: 'context-compacted', ...result }, context);
}

async function setMode(
  mode: TuiExecutionMode,
  context: TuiCommandRouterContext,
): Promise<TuiCommandRouterResult> {
  const setExecutionMode = context.ports.mode?.setExecutionMode;
  if (!setExecutionMode) {
    return projectSessionControlResult(
      { kind: 'diagnostic', code: 'execution-mode-unavailable' },
      context,
    );
  }
  await setExecutionMode(mode);
  return projectSessionControlResult({ kind: 'execution-mode-selected', mode }, context);
}

function assertResetState(
  family: 'media' | 'perception',
  state: Readonly<Partial<Record<TuiMediaCategory, string>>>,
): void {
  if (Object.keys(state).length > 0) {
    throw new Error(
      `TUI ${family} reset port returned a non-empty canonical post-operation state.`,
    );
  }
}

function toResourceCommandContext(context: TuiCommandRouterContext): CommandContext {
  const skills = context.ports.skill?.listEnabled().map((skill) => ({
    name: skill.name,
    description: skill.description,
    enabled: true,
  }));
  return {
    ...toCommandContext(context.slash),
    ...(skills === undefined ? {} : { skills }),
  };
}
