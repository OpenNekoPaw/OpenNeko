import { listSlashCommandCatalog, type SlashCommandCatalogEntry } from '@neko/agent';
import { getBuiltinCommandDescriptionKey } from '@neko/agent/commands/terminal-messages';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type {
  AgentTerminalMessageKey,
  CliTerminalMessageKey,
} from '../presentation/terminal-messages';

export interface TuiSlashCommandOption {
  readonly name: string;
  readonly description: string;
}

export interface TuiSkillInvocationOption {
  readonly name: string;
  readonly description: string;
}

type TuiLocalCommandName =
  | 'mode'
  | 'model'
  | 'media'
  | 'param'
  | 'queue'
  | 'mcp'
  | 'capability'
  | 'artifact'
  | 'compact'
  | 'status'
  | 'auto'
  | 'ask'
  | 'skill';

export interface TuiLocalCommandEffect {
  readonly name: TuiLocalCommandName;
  readonly surface: 'tui';
  readonly descriptionKey: Extract<
    CliTerminalMessageKey,
    `agent.terminal.suggestion.command.${string}`
  >;
}

const TUI_LOCAL_COMMANDS: readonly TuiLocalCommandEffect[] = [
  localCommand('mode'),
  localCommand('model'),
  localCommand('media'),
  localCommand('param'),
  localCommand('queue'),
  localCommand('mcp'),
  localCommand('capability'),
  localCommand('artifact'),
  localCommand('compact'),
  localCommand('status'),
  localCommand('auto'),
  localCommand('ask'),
  localCommand('skill'),
];

export function listTuiLocalCommandEffects(
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): readonly (TuiSlashCommandOption & { readonly surface: 'tui' })[] {
  return TUI_LOCAL_COMMANDS.map((command) => ({
    name: command.name,
    description: context.t(command.descriptionKey),
    surface: command.surface,
  }));
}

export function createTuiSlashCommandCatalog(
  skills:
    | ReadonlyArray<{
        entryPointKind?: 'skill' | 'command-artifact';
        command?: string;
        description?: string;
        enabled?: boolean;
        supportsArguments?: boolean;
        argumentHint?: string;
      }>
    | undefined,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): TuiSlashCommandOption[] {
  const commands = listSlashCommandCatalog({
    surface: 'tui',
    skills,
  }).map((command) => ({
    name: command.name,
    description: describeSlashCommand(command, context),
  }));
  const names = new Set(commands.map((command) => command.name));
  for (const command of listTuiLocalCommandEffects(context)) {
    if (!names.has(command.name)) {
      commands.push({
        name: command.name,
        description: command.description,
      });
    }
  }
  return commands;
}

export function createTuiSkillInvocationCatalog(
  skills:
    | ReadonlyArray<{
        name: string;
        description?: string;
        enabled?: boolean;
      }>
    | undefined,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): TuiSkillInvocationOption[] {
  return (skills ?? [])
    .filter((skill) => skill.enabled !== false)
    .map((skill) => ({
      name: `$${skill.name}`,
      description:
        readNonEmptyDescription(skill.description) ??
        context.t('agent.command.catalog.skill.defaultDescription', { skillName: skill.name }),
    }));
}

function describeSlashCommand(
  command: SlashCommandCatalogEntry,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  if (command.source === 'builtin') {
    return context.t(getBuiltinCommandDescriptionKey(command.name));
  }
  return (
    command.description ??
    context.t('agent.command.catalog.commandArtifact.defaultDescription', {
      commandName: command.name,
    })
  );
}

function localCommand(name: TuiLocalCommandName): TuiLocalCommandEffect {
  const descriptionKey: TuiLocalCommandEffect['descriptionKey'] = `agent.terminal.suggestion.command.${name}`;
  return { name, surface: 'tui', descriptionKey };
}

function readNonEmptyDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  return trimmed && trimmed.length > 0 ? description : undefined;
}
