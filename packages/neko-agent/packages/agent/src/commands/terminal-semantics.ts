import {
  coerceSlashCommandSkills,
  listSlashCommandCatalog,
  type SlashCommandCatalogEntry,
} from './command-catalog';
import type { CommandContext } from './types';

export interface AgentTerminalSkillRow {
  readonly name: string;
  readonly description?: string;
  readonly enabled: boolean;
}

export interface AgentTerminalToolRow {
  readonly name: string;
  readonly description?: string;
}

export type AgentTerminalHelpSemanticResult = {
  readonly kind: 'help';
  readonly commands: readonly SlashCommandCatalogEntry[];
};

export type AgentTerminalSkillsSemanticResult =
  | { readonly kind: 'diagnostic'; readonly code: 'catalog-unavailable' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'list'; readonly skills: readonly AgentTerminalSkillRow[] }
  | { readonly kind: 'diagnostic'; readonly code: 'info-usage' }
  | { readonly kind: 'info'; readonly skillName: string }
  | {
      readonly kind: 'diagnostic';
      readonly code: 'unknown-subcommand';
      readonly subcommand: string;
    };

export type AgentTerminalCommandsSemanticResult =
  | { readonly kind: 'diagnostic'; readonly code: 'usage' }
  | { readonly kind: 'commands'; readonly commands: readonly SlashCommandCatalogEntry[] };

export type AgentTerminalToolsSemanticResult =
  | { readonly kind: 'diagnostic'; readonly code: 'registry-unavailable' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'list'; readonly tools: readonly AgentTerminalToolRow[] }
  | { readonly kind: 'diagnostic'; readonly code: 'info-usage' }
  | { readonly kind: 'diagnostic'; readonly code: 'not-found'; readonly toolName: string }
  | { readonly kind: 'info'; readonly tool: AgentTerminalToolRow }
  | { readonly kind: 'diagnostic'; readonly code: 'search-usage' }
  | { readonly kind: 'search-empty'; readonly query: string }
  | {
      readonly kind: 'search-results';
      readonly query: string;
      readonly tools: readonly AgentTerminalToolRow[];
    }
  | {
      readonly kind: 'diagnostic';
      readonly code: 'unknown-subcommand';
      readonly subcommand: string;
    };

export type AgentTerminalResourceCommandSemanticResult =
  | AgentTerminalHelpSemanticResult
  | AgentTerminalSkillsSemanticResult
  | AgentTerminalCommandsSemanticResult
  | AgentTerminalToolsSemanticResult;

export function buildAgentTerminalHelpSemantic(
  context: CommandContext,
): AgentTerminalHelpSemanticResult {
  return {
    kind: 'help',
    commands: listSlashCommandCatalog({
      surface: 'tui',
      skills: listContextSlashCommandSkills(context),
    }),
  };
}

export function executeAgentTerminalSkillsSemantic(
  args: readonly string[],
  context: CommandContext,
): AgentTerminalSkillsSemanticResult {
  if (!context.skills) {
    return { kind: 'diagnostic', code: 'catalog-unavailable' };
  }

  if (args.length === 0) {
    const skills = context.skills.flatMap((value) => {
      const skill = readSkillRow(value);
      return skill ? [skill] : [];
    });
    return skills.length > 0 ? { kind: 'list', skills } : { kind: 'empty' };
  }

  const subcommand = args[0]?.toLowerCase() ?? '';
  switch (subcommand) {
    case 'info': {
      const skillName = args[1];
      return skillName ? { kind: 'info', skillName } : { kind: 'diagnostic', code: 'info-usage' };
    }
    default:
      return { kind: 'diagnostic', code: 'unknown-subcommand', subcommand };
  }
}

export function executeAgentTerminalCommandsSemantic(
  args: readonly string[],
  context: CommandContext,
): AgentTerminalCommandsSemanticResult {
  if (args.length > 0) {
    return { kind: 'diagnostic', code: 'usage' };
  }
  return {
    kind: 'commands',
    commands: listSlashCommandCatalog({
      surface: 'tui',
      skills: listContextSlashCommandSkills(context),
    }),
  };
}

export function executeAgentTerminalToolsSemantic(
  args: readonly string[],
  context: CommandContext,
): AgentTerminalToolsSemanticResult {
  const { toolRegistry } = context;
  if (!toolRegistry) {
    return { kind: 'diagnostic', code: 'registry-unavailable' };
  }

  if (args.length === 0) {
    const tools = toolRegistry.list().flatMap((value) => {
      const tool = readToolRow(value);
      return tool ? [tool] : [];
    });
    return tools.length > 0 ? { kind: 'list', tools } : { kind: 'empty' };
  }

  const subcommand = args[0]?.toLowerCase() ?? '';
  switch (subcommand) {
    case 'info': {
      const toolName = args[1];
      if (!toolName) {
        return { kind: 'diagnostic', code: 'info-usage' };
      }
      const tool = readToolRow(toolRegistry.get(toolName));
      return tool ? { kind: 'info', tool } : { kind: 'diagnostic', code: 'not-found', toolName };
    }
    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) {
        return { kind: 'diagnostic', code: 'search-usage' };
      }
      const tools = toolRegistry.search(query).flatMap((value) => {
        const tool = readToolRow(value);
        return tool ? [tool] : [];
      });
      return tools.length > 0
        ? { kind: 'search-results', query, tools }
        : { kind: 'search-empty', query };
    }
    default:
      return { kind: 'diagnostic', code: 'unknown-subcommand', subcommand };
  }
}

function listContextSlashCommandSkills(context: CommandContext) {
  return coerceSlashCommandSkills(context.skills ?? []);
}

function readSkillRow(value: unknown): AgentTerminalSkillRow | undefined {
  if (!isRecord(value) || typeof value['name'] !== 'string') {
    return undefined;
  }
  const description = typeof value['description'] === 'string' ? value['description'] : undefined;
  return {
    name: value['name'],
    enabled: value['enabled'] !== false,
    ...(description !== undefined ? { description } : {}),
  };
}

function readToolRow(value: unknown): AgentTerminalToolRow | undefined {
  if (!isRecord(value) || typeof value['name'] !== 'string') {
    return undefined;
  }
  const description = typeof value['description'] === 'string' ? value['description'] : undefined;
  return {
    name: value['name'],
    ...(description !== undefined ? { description } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export type AgentCommandSessionSemanticResult =
  | { readonly kind: 'new-created' }
  | { readonly kind: 'compact-started' }
  | { readonly kind: 'plan-changed'; readonly enabled: boolean };

export interface AgentCommandConfigSnapshot {
  readonly provider?: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly verbose: boolean;
  readonly outputFormat: string;
}

export type AgentCommandConfigSemanticResult =
  | { readonly kind: 'snapshot'; readonly config: AgentCommandConfigSnapshot }
  | { readonly kind: 'diagnostic'; readonly code: 'set-usage' }
  | {
      readonly kind: 'diagnostic';
      readonly code: 'invalid-key';
      readonly key: string;
      readonly validKeys: readonly string[];
    }
  | { readonly kind: 'updated'; readonly key: string; readonly value: string }
  | { readonly kind: 'providers'; readonly providers: readonly string[] }
  | { readonly kind: 'models'; readonly provider?: string }
  | {
      readonly kind: 'diagnostic';
      readonly code: 'unknown-subcommand';
      readonly subcommand: string;
    };

export type AgentCommandCoreSemanticResult =
  { readonly kind: 'history-cleared' } | { readonly kind: 'exit' } | { readonly kind: 'host-only' };

export type AgentCommandShellSemanticResult =
  | {
      readonly kind: 'diagnostic';
      readonly code: 'unknown-command';
      readonly command: string;
    }
  | {
      readonly kind: 'diagnostic';
      readonly code: 'command-failed';
      readonly command: string;
      readonly detail: string;
    };

export type AgentCommandSemanticResult =
  | { readonly family: 'session'; readonly result: AgentCommandSessionSemanticResult }
  | { readonly family: 'config'; readonly result: AgentCommandConfigSemanticResult }
  | { readonly family: 'core'; readonly result: AgentCommandCoreSemanticResult }
  | { readonly family: 'help'; readonly result: AgentTerminalHelpSemanticResult }
  | { readonly family: 'skills'; readonly result: AgentTerminalSkillsSemanticResult }
  | { readonly family: 'commands'; readonly result: AgentTerminalCommandsSemanticResult }
  | { readonly family: 'tools'; readonly result: AgentTerminalToolsSemanticResult }
  | { readonly family: 'shell'; readonly result: AgentCommandShellSemanticResult };

export function isAgentCommandSemanticFailure(semantic: AgentCommandSemanticResult): boolean {
  return semantic.result.kind === 'diagnostic';
}
