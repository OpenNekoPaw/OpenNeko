import type {
  AgentTerminalCommandsSemanticResult,
  AgentTerminalHelpSemanticResult,
  AgentTerminalSkillsSemanticResult,
  AgentTerminalToolsSemanticResult,
  SlashCommandCatalogEntry,
} from '@neko/agent';
import {
  getBuiltinCommandDescriptionKey,
  getCommandCategoryMessageKey,
  type AgentCommandMessageKey,
} from '@neko/agent/commands/terminal-messages';
import type { AgentTerminalPresentationContext } from './context';

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

type Context = AgentTerminalPresentationContext<AgentCommandMessageKey>;

export type AgentResourceCommandProjection =
  | { readonly kind: 'output'; readonly output: string }
  | { readonly kind: 'error'; readonly error: string; readonly diagnosticCode: string };

export function presentHelpCommand(
  result: AgentTerminalHelpSemanticResult,
  context: Context,
): AgentResourceCommandProjection {
  const { builtin, artifacts } = partitionCommands(result.commands);
  const lines = ['', context.t('agent.command.help.header'), SEPARATOR, ''];
  const categories = new Map<(typeof builtin)[number]['category'], typeof builtin>();
  for (const command of builtin) {
    const commands = categories.get(command.category);
    if (commands) {
      commands.push(command);
    } else {
      categories.set(command.category, [command]);
    }
  }

  for (const [category, commands] of categories) {
    lines.push(`${context.t(getCommandCategoryMessageKey(category))}:`);
    appendCommandRows(lines, commands, context);
    lines.push('');
  }

  if (artifacts.length > 0) {
    lines.push(context.t('agent.command.help.commandArtifacts'));
    appendCommandRows(lines, artifacts, context);
    lines.push('');
  }

  return { kind: 'output', output: lines.join('\n') };
}

export function presentSkillsCommand(
  result: AgentTerminalSkillsSemanticResult,
  context: Context,
): AgentResourceCommandProjection {
  switch (result.kind) {
    case 'diagnostic':
      switch (result.code) {
        case 'catalog-unavailable':
          return diagnostic(
            context.t('agent.command.diagnostic.skills.service-unavailable'),
            'skills.service-unavailable',
          );
        case 'info-usage':
          return diagnostic(
            context.t('agent.command.diagnostic.skills.info-usage'),
            'skills.info-usage',
          );
        case 'unknown-subcommand':
          return diagnostic(
            context.t('agent.command.diagnostic.skills.unknown-subcommand', {
              subcommand: result.subcommand,
            }),
            'skills.unknown-subcommand',
          );
      }
      return assertNever(result);
    case 'empty':
      return output(context.t('agent.command.skills.empty'));
    case 'list': {
      const lines = [
        '',
        context.t('agent.command.skills.header'),
        SEPARATOR,
        context.t('agent.command.skills.activationHint'),
        '',
      ];
      for (const skill of result.skills) {
        const rowKey = skill.enabled
          ? 'agent.command.skills.row'
          : 'agent.command.skills.rowDisabled';
        lines.push(
          context.t(rowKey, {
            name: skill.name,
          }),
        );
        if (skill.description !== undefined) {
          lines.push(
            context.t('agent.command.skills.descriptionRow', { description: skill.description }),
          );
        }
      }
      lines.push('');
      return output(lines.join('\n'));
    }
    case 'info':
      return output(context.t('agent.command.skills.info', { skillName: result.skillName }));
  }
}

export function presentCommandsCommand(
  result: AgentTerminalCommandsSemanticResult,
  context: Context,
): AgentResourceCommandProjection {
  if (result.kind === 'diagnostic') {
    return diagnostic(context.t('agent.command.diagnostic.commands.usage'), 'commands.usage');
  }

  const { builtin, artifacts } = partitionCommands(result.commands);
  const lines = [
    '',
    context.t('agent.command.commands.header'),
    SEPARATOR,
    '',
    context.t(
      builtin.length === 1
        ? 'agent.command.commands.builtin.one'
        : 'agent.command.commands.builtin.many',
      builtin.length === 1 ? undefined : { count: builtin.length },
    ),
  ];
  appendCommandRows(lines, builtin, context);
  if (artifacts.length > 0) {
    lines.push('');
    lines.push(
      context.t(
        artifacts.length === 1
          ? 'agent.command.commands.artifact.one'
          : 'agent.command.commands.artifact.many',
        artifacts.length === 1 ? undefined : { count: artifacts.length },
      ),
    );
    appendCommandRows(lines, artifacts, context);
  }
  lines.push('');
  return output(lines.join('\n'));
}

export function presentToolsCommand(
  result: AgentTerminalToolsSemanticResult,
  context: Context,
): AgentResourceCommandProjection {
  switch (result.kind) {
    case 'diagnostic':
      switch (result.code) {
        case 'registry-unavailable':
          return diagnostic(
            context.t('agent.command.diagnostic.tools.registry-unavailable'),
            'tools.registry-unavailable',
          );
        case 'info-usage':
          return diagnostic(
            context.t('agent.command.diagnostic.tools.info-usage'),
            'tools.info-usage',
          );
        case 'not-found':
          return diagnostic(
            context.t('agent.command.diagnostic.tools.not-found', {
              toolName: result.toolName,
            }),
            'tools.not-found',
          );
        case 'search-usage':
          return diagnostic(
            context.t('agent.command.diagnostic.tools.search-usage'),
            'tools.search-usage',
          );
        case 'unknown-subcommand':
          return diagnostic(
            context.t('agent.command.diagnostic.tools.unknown-subcommand', {
              subcommand: result.subcommand,
            }),
            'tools.unknown-subcommand',
          );
      }
      return assertNever(result);
    case 'empty':
      return output(context.t('agent.command.tools.empty'));
    case 'list': {
      const lines = [
        '',
        context.t(
          result.tools.length === 1
            ? 'agent.command.tools.header.one'
            : 'agent.command.tools.header.many',
          result.tools.length === 1 ? undefined : { count: result.tools.length },
        ),
        SEPARATOR,
        '',
      ];
      appendToolRows(lines, result.tools, context, true);
      lines.push('');
      return output(lines.join('\n'));
    }
    case 'info':
      return output(
        [
          context.t('agent.command.tools.info', { name: result.tool.name }),
          result.tool.description ?? context.t('agent.command.tools.noDescription'),
        ].join('\n'),
      );
    case 'search-empty':
      return output(context.t('agent.command.tools.searchEmpty', { query: result.query }));
    case 'search-results': {
      const lines = [
        context.t(
          result.tools.length === 1
            ? 'agent.command.tools.searchFound.one'
            : 'agent.command.tools.searchFound.many',
          result.tools.length === 1
            ? { query: result.query }
            : { count: result.tools.length, query: result.query },
        ),
        '',
      ];
      appendToolRows(lines, result.tools, context, false);
      return output(lines.join('\n'));
    }
  }
}

function appendCommandRows(
  lines: string[],
  commands: readonly SlashCommandCatalogEntry[],
  context: Context,
): void {
  for (const command of commands) {
    lines.push(
      context.t('agent.command.help.commandRow', {
        command: formatCommandInvocation(command),
      }),
    );
    lines.push(
      context.t('agent.command.help.descriptionRow', {
        description: describeCommand(command, context),
      }),
    );
  }
}

function appendToolRows(
  lines: string[],
  tools: readonly { readonly name: string; readonly description?: string }[],
  context: Context,
  includeDescription: boolean,
): void {
  for (const tool of tools) {
    lines.push(context.t('agent.command.tools.row', { name: tool.name }));
    if (includeDescription && tool.description !== undefined) {
      const description =
        tool.description.length > 60 ? `${tool.description.slice(0, 57)}...` : tool.description;
      lines.push(context.t('agent.command.tools.descriptionRow', { description }));
    }
  }
}

function partitionCommands(commands: readonly SlashCommandCatalogEntry[]) {
  return {
    builtin: commands.filter(
      (entry): entry is Extract<SlashCommandCatalogEntry, { source: 'builtin' }> =>
        entry.source === 'builtin',
    ),
    artifacts: commands.filter(
      (entry): entry is Extract<SlashCommandCatalogEntry, { source: 'command-artifact' }> =>
        entry.source === 'command-artifact',
    ),
  };
}

function describeCommand(command: SlashCommandCatalogEntry, context: Context): string {
  return command.source === 'builtin'
    ? context.t(getBuiltinCommandDescriptionKey(command.name))
    : (command.description ??
        context.t('agent.command.catalog.commandArtifact.defaultDescription', {
          commandName: command.name,
        }));
}

function formatCommandInvocation(command: SlashCommandCatalogEntry): string {
  if (command.source === 'builtin') {
    const aliases =
      command.aliases.length > 0
        ? `, ${command.aliases.map((alias) => `/${alias}`).join(', ')}`
        : '';
    return `/${command.name}${aliases}${command.usage ? ` ${command.usage}` : ''}`;
  }
  if (!command.supportsArguments) {
    return `/${command.name}`;
  }
  return `/${command.name}${command.argumentHint ? ` ${command.argumentHint}` : ' <args>'}`;
}

function output(value: string): AgentResourceCommandProjection {
  return { kind: 'output', output: value };
}

function diagnostic(error: string, diagnosticCode: string): AgentResourceCommandProjection {
  return { kind: 'error', error, diagnosticCode };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled terminal command semantic variant: ${String(value)}`);
}
