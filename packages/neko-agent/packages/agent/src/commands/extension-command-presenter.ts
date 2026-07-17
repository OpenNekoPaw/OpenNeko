import { createStrictTranslator, type SupportedLocale } from '@neko/shared/i18n';
import type { SlashCommandCatalogEntry } from './command-catalog';
import {
  AGENT_COMMAND_MESSAGE_SOURCE,
  getBuiltinCommandDescriptionKey,
  type AgentCommandMessageKey,
} from './terminal-messages';
import {
  isAgentCommandSemanticFailure,
  type AgentCommandConfigSemanticResult,
  type AgentCommandSemanticResult,
  type AgentTerminalCommandsSemanticResult,
  type AgentTerminalHelpSemanticResult,
  type AgentTerminalSkillsSemanticResult,
  type AgentTerminalToolsSemanticResult,
} from './terminal-semantics';
import type { CommandResult } from './types';
export { normalizeSlashCommandName } from '@neko-agent/types';

export interface ExtensionCommandConversationSummary {
  id: string;
  title: string;
  messageCount: number;
}

export interface ExtensionCommandConversationSummarySource {
  id: string;
  title: string;
  messages?: readonly unknown[];
}

export interface ExtensionCommandResultPayload {
  type: 'slashCommandResult';
  conversationId: string;
  command: string;
  success: boolean;
  action?: string;
  data?: Record<string, unknown>;
  message?: string;
  error?: string;
}

export interface BuildExtensionCommandResultPayloadInput {
  conversationId: string;
  command: string;
  result: CommandResult;
  locale: SupportedLocale;
  resumeConversations?: readonly ExtensionCommandConversationSummary[];
}

export type ExtensionCommandHostEffect =
  | { type: 'clearAgentHistory'; conversationId: string }
  | { type: 'postHistoryCleared'; conversationId: string }
  | { type: 'refreshConversationList' }
  | { type: 'refreshActiveConversation' }
  | { type: 'sendTasks'; conversationId: string };

export interface ExtensionCommandHostEffectPlan {
  beforeResult: ExtensionCommandHostEffect[];
  afterResult: ExtensionCommandHostEffect[];
}

export interface BuildExtensionCommandHostEffectPlanInput {
  result: CommandResult;
  activeConversationId?: string;
}

const OUTPUT_SUPPRESSED_ACTIONS = new Set([
  'showHelp',
  'showStatus',
  'showModelSelector',
  'showSettings',
  'showPermissions',
  'showTasks',
  'showMCPServers',
  'resumeConversation',
  'initProject',
]);

export function parseBuiltinCommandArgs(rawArgs?: string): string[] {
  if (!rawArgs) return [];

  return rawArgs
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

export function buildExtensionCommandResultPayload(
  input: BuildExtensionCommandResultPayloadInput,
): ExtensionCommandResultPayload {
  const data = getExtensionCommandData(input.result, input.resumeConversations);
  const projection = input.result.semantic
    ? presentAgentCommandSemantic(input.result.semantic, input.locale)
    : undefined;
  const suppressMessage =
    input.result.action !== undefined && OUTPUT_SUPPRESSED_ACTIONS.has(input.result.action);

  return {
    type: 'slashCommandResult',
    conversationId: input.conversationId,
    command: input.command,
    success: input.result.semantic ? !isAgentCommandSemanticFailure(input.result.semantic) : true,
    ...(input.result.action ? { action: input.result.action } : {}),
    ...(data ? { data } : {}),
    ...(!suppressMessage && projection?.message ? { message: projection.message } : {}),
    ...(projection?.error ? { error: projection.error } : {}),
  };
}

export function buildExtensionCommandConversationSummaries(
  conversations: readonly ExtensionCommandConversationSummarySource[],
  options: {
    getMessageCount?: (conversationId: string) => number | undefined;
  } = {},
): ExtensionCommandConversationSummary[] {
  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    messageCount: options.getMessageCount?.(conversation.id) ?? conversation.messages?.length ?? 0,
  }));
}

export function buildExtensionCommandHostEffectPlan(
  input: BuildExtensionCommandHostEffectPlanInput,
): ExtensionCommandHostEffectPlan {
  const beforeResult: ExtensionCommandHostEffect[] = [];
  const afterResult: ExtensionCommandHostEffect[] = [];

  if (input.result.action === 'clearHistory') {
    if (input.activeConversationId) {
      beforeResult.push({
        type: 'clearAgentHistory',
        conversationId: input.activeConversationId,
      });
      beforeResult.push({
        type: 'postHistoryCleared',
        conversationId: input.activeConversationId,
      });
    }
  }

  if (input.result.action === 'newConversation') {
    beforeResult.push({ type: 'refreshConversationList' }, { type: 'refreshActiveConversation' });
  }

  if (input.result.action === 'showTasks' && input.activeConversationId) {
    beforeResult.push({
      type: 'sendTasks',
      conversationId: input.activeConversationId,
    });
  }

  return { beforeResult, afterResult };
}

function getExtensionCommandData(
  result: CommandResult,
  resumeConversations: readonly ExtensionCommandConversationSummary[] | undefined,
): Record<string, unknown> | undefined {
  if (result.action === 'resumeConversation') {
    return { conversations: resumeConversations ?? [] };
  }

  return result.data;
}

type AgentCommandProjection =
  | { readonly message: string; readonly error?: never }
  | { readonly error: string; readonly message?: never };

type AgentCommandTranslator = {
  t(key: AgentCommandMessageKey, params?: Readonly<Record<string, string | number>>): string;
};

function presentAgentCommandSemantic(
  semantic: AgentCommandSemanticResult,
  locale: SupportedLocale,
): AgentCommandProjection {
  const translator = createStrictTranslator(locale, [AGENT_COMMAND_MESSAGE_SOURCE] as const);

  switch (semantic.family) {
    case 'session':
      switch (semantic.result.kind) {
        case 'new-created':
          return message(translator.t('agent.command.session.new.created'));
        case 'compact-started':
          return message(translator.t('agent.command.session.compact.started'));
        case 'plan-changed':
          return message(
            translator.t(
              semantic.result.enabled
                ? 'agent.command.session.plan.enabled'
                : 'agent.command.session.plan.disabled',
            ),
          );
      }
      return assertNever(semantic.result);
    case 'config':
      return presentConfigSemantic(semantic.result, translator);
    case 'core':
      switch (semantic.result.kind) {
        case 'history-cleared':
          return message(translator.t('agent.command.core.historyCleared'));
        case 'exit':
          return message(translator.t('agent.command.core.exit'));
        case 'host-only':
          return message(translator.t('agent.command.core.hostOnly'));
      }
      return assertNever(semantic.result);
    case 'help':
      return presentHelpSemantic(semantic.result, translator);
    case 'skills':
      return presentSkillsSemantic(semantic.result, translator);
    case 'commands':
      return presentCommandsSemantic(semantic.result, translator);
    case 'tools':
      return presentToolsSemantic(semantic.result, translator);
    case 'shell': {
      const result = semantic.result;
      switch (result.code) {
        case 'unknown-command':
          return diagnostic(
            translator.t('agent.command.diagnostic.shell.unknown-command', {
              command: result.command,
            }),
          );
        case 'command-failed':
          return diagnostic(
            translator.t('agent.command.diagnostic.shell.command-failed', {
              command: result.command,
              detail: result.detail,
            }),
          );
      }
      return assertNever(result);
    }
  }
  return assertNever(semantic);
}

function presentConfigSemantic(
  result: AgentCommandConfigSemanticResult,
  translator: AgentCommandTranslator,
): AgentCommandProjection {
  switch (result.kind) {
    case 'snapshot': {
      const notSet = translator.t('agent.command.config.notSet');
      const defaultValue = translator.t('agent.command.config.default');
      return message(
        [
          '',
          translator.t('agent.command.config.header'),
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '',
          translator.t('agent.command.config.providerRow', {
            value: result.config.provider ?? notSet,
          }),
          translator.t('agent.command.config.modelRow', {
            value: result.config.model ?? notSet,
          }),
          translator.t('agent.command.config.maxTokensRow', {
            value: result.config.maxTokens ?? defaultValue,
          }),
          translator.t('agent.command.config.temperatureRow', {
            value: result.config.temperature ?? defaultValue,
          }),
          translator.t('agent.command.config.verboseRow', {
            value: String(result.config.verbose),
          }),
          translator.t('agent.command.config.outputFormatRow', {
            value: result.config.outputFormat,
          }),
          '',
          translator.t('agent.command.config.hint.set'),
          translator.t('agent.command.config.hint.providers'),
          translator.t('agent.command.config.hint.models'),
          '',
        ].join('\n'),
      );
    }
    case 'updated':
      return message(
        translator.t('agent.command.config.updated', { key: result.key, value: result.value }),
      );
    case 'providers':
      return message(
        translator.t('agent.command.config.providers', {
          providers: result.providers.join(', '),
        }),
      );
    case 'models':
      return message(
        translator.t('agent.command.config.models', {
          provider: result.provider ?? translator.t('agent.command.config.currentProvider'),
        }),
      );
    case 'diagnostic':
      switch (result.code) {
        case 'set-usage':
          return diagnostic(translator.t('agent.command.diagnostic.config.set-usage'));
        case 'invalid-key':
          return diagnostic(
            translator.t('agent.command.diagnostic.config.invalid-key', {
              key: result.key,
              validKeys: result.validKeys.join(', '),
            }),
          );
        case 'unknown-subcommand':
          return diagnostic(
            translator.t('agent.command.diagnostic.config.unknown-subcommand', {
              subcommand: result.subcommand,
            }),
          );
      }
  }
}

function presentHelpSemantic(
  result: AgentTerminalHelpSemanticResult,
  translator: AgentCommandTranslator,
): AgentCommandProjection {
  return message(formatCommandList(result.commands, translator, 'help'));
}

function presentSkillsSemantic(
  result: AgentTerminalSkillsSemanticResult,
  translator: AgentCommandTranslator,
): AgentCommandProjection {
  switch (result.kind) {
    case 'diagnostic':
      switch (result.code) {
        case 'catalog-unavailable':
          return diagnostic(translator.t('agent.command.diagnostic.skills.service-unavailable'));
        case 'info-usage':
          return diagnostic(translator.t('agent.command.diagnostic.skills.info-usage'));
        case 'unknown-subcommand':
          return diagnostic(
            translator.t('agent.command.diagnostic.skills.unknown-subcommand', {
              subcommand: result.subcommand,
            }),
          );
      }
      return assertNever(result);
    case 'empty':
      return message(translator.t('agent.command.skills.empty'));
    case 'list': {
      const lines = ['', translator.t('agent.command.skills.header')];
      for (const skill of result.skills) {
        const rowKey = skill.enabled
          ? 'agent.command.skills.row'
          : 'agent.command.skills.rowDisabled';
        lines.push(
          translator.t(rowKey, {
            name: skill.name,
          }),
        );
        if (skill.description !== undefined) {
          lines.push(
            translator.t('agent.command.skills.descriptionRow', {
              description: skill.description,
            }),
          );
        }
      }
      return message(lines.join('\n'));
    }
    case 'info':
      return message(translator.t('agent.command.skills.info', { skillName: result.skillName }));
  }
}

function presentCommandsSemantic(
  result: AgentTerminalCommandsSemanticResult,
  translator: AgentCommandTranslator,
): AgentCommandProjection {
  return result.kind === 'diagnostic'
    ? diagnostic(translator.t('agent.command.diagnostic.commands.usage'))
    : message(formatCommandList(result.commands, translator, 'commands'));
}

function presentToolsSemantic(
  result: AgentTerminalToolsSemanticResult,
  translator: AgentCommandTranslator,
): AgentCommandProjection {
  switch (result.kind) {
    case 'diagnostic':
      switch (result.code) {
        case 'registry-unavailable':
          return diagnostic(translator.t('agent.command.diagnostic.tools.registry-unavailable'));
        case 'info-usage':
          return diagnostic(translator.t('agent.command.diagnostic.tools.info-usage'));
        case 'not-found':
          return diagnostic(
            translator.t('agent.command.diagnostic.tools.not-found', {
              toolName: result.toolName,
            }),
          );
        case 'search-usage':
          return diagnostic(translator.t('agent.command.diagnostic.tools.search-usage'));
        case 'unknown-subcommand':
          return diagnostic(
            translator.t('agent.command.diagnostic.tools.unknown-subcommand', {
              subcommand: result.subcommand,
            }),
          );
      }
      return assertNever(result);
    case 'empty':
      return message(translator.t('agent.command.tools.empty'));
    case 'list':
      return message(formatToolList(result.tools, translator));
    case 'info':
      return message(
        [
          translator.t('agent.command.tools.info', { name: result.tool.name }),
          result.tool.description ?? translator.t('agent.command.tools.noDescription'),
        ].join('\n'),
      );
    case 'search-empty':
      return message(translator.t('agent.command.tools.searchEmpty', { query: result.query }));
    case 'search-results':
      return message(
        [
          translator.t(
            result.tools.length === 1
              ? 'agent.command.tools.searchFound.one'
              : 'agent.command.tools.searchFound.many',
            result.tools.length === 1
              ? { query: result.query }
              : { query: result.query, count: result.tools.length },
          ),
          ...result.tools.map((tool) =>
            translator.t('agent.command.tools.row', { name: tool.name }),
          ),
        ].join('\n'),
      );
  }
}

function formatCommandList(
  commands: readonly SlashCommandCatalogEntry[],
  translator: AgentCommandTranslator,
  mode: 'help' | 'commands',
): string {
  const builtin = commands.filter(
    (entry): entry is Extract<SlashCommandCatalogEntry, { source: 'builtin' }> =>
      entry.source === 'builtin',
  );
  const artifacts = commands.filter(
    (entry): entry is Extract<SlashCommandCatalogEntry, { source: 'command-artifact' }> =>
      entry.source === 'command-artifact',
  );
  const lines = [
    '',
    translator.t(mode === 'help' ? 'agent.command.help.header' : 'agent.command.commands.header'),
  ];
  if (mode === 'commands') {
    lines.push(
      translator.t(
        builtin.length === 1
          ? 'agent.command.commands.builtin.one'
          : 'agent.command.commands.builtin.many',
        builtin.length === 1 ? undefined : { count: builtin.length },
      ),
    );
  }
  appendCommandRows(lines, builtin, translator);
  if (artifacts.length > 0) {
    lines.push(
      mode === 'help'
        ? translator.t('agent.command.help.commandArtifacts')
        : translator.t(
            artifacts.length === 1
              ? 'agent.command.commands.artifact.one'
              : 'agent.command.commands.artifact.many',
            artifacts.length === 1 ? undefined : { count: artifacts.length },
          ),
    );
    appendCommandRows(lines, artifacts, translator);
  }
  return lines.join('\n');
}

function appendCommandRows(
  lines: string[],
  commands: readonly SlashCommandCatalogEntry[],
  translator: AgentCommandTranslator,
): void {
  for (const command of commands) {
    lines.push(
      translator.t('agent.command.help.commandRow', {
        command: formatCommandInvocation(command),
      }),
    );
    lines.push(
      translator.t('agent.command.help.descriptionRow', {
        description:
          command.source === 'builtin'
            ? translator.t(getBuiltinCommandDescriptionKey(command.name))
            : (command.description ??
              translator.t('agent.command.catalog.commandArtifact.defaultDescription', {
                commandName: command.name,
              })),
      }),
    );
  }
}

function formatCommandInvocation(command: SlashCommandCatalogEntry): string {
  if (command.source === 'builtin') {
    const aliases =
      command.aliases.length > 0
        ? `, ${command.aliases.map((alias) => `/${alias}`).join(', ')}`
        : '';
    return `/${command.name}${aliases}${command.usage ? ` ${command.usage}` : ''}`;
  }
  return `/${command.name}${
    command.supportsArguments ? (command.argumentHint ? ` ${command.argumentHint}` : ' <args>') : ''
  }`;
}

function formatToolList(
  tools: readonly { readonly name: string; readonly description?: string }[],
  translator: AgentCommandTranslator,
): string {
  const lines = [
    '',
    translator.t(
      tools.length === 1 ? 'agent.command.tools.header.one' : 'agent.command.tools.header.many',
      tools.length === 1 ? undefined : { count: tools.length },
    ),
  ];
  for (const tool of tools) {
    lines.push(translator.t('agent.command.tools.row', { name: tool.name }));
    if (tool.description !== undefined) {
      lines.push(
        translator.t('agent.command.tools.descriptionRow', { description: tool.description }),
      );
    }
  }
  return lines.join('\n');
}

function message(value: string): AgentCommandProjection {
  return { message: value };
}

function diagnostic(value: string): AgentCommandProjection {
  return { error: value };
}

function assertNever(value: never): never {
  throw new Error(`Unreachable Agent command presentation state: ${JSON.stringify(value)}`);
}
