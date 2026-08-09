import {
  isAgentInputCatalogEntryExecutable,
  normalizeSlashCommandName,
  type AgentBindingKind,
  type AgentInputCatalogEntry,
  type AgentInputInvocationIntent,
  type AgentInteractionPhase,
  type ParsedAgentInputTrigger,
} from '@neko/agent-contracts';
import type { SkillSummary } from './types';

export type SlashCommandSource = 'builtin' | 'command-artifact' | 'plugin';
export type SlashCommandDescriptionKind = 'i18n' | 'literal';
export type SkillInvocationSource = SkillSummary['source'];

export interface SlashCommandCatalogItem {
  id: string;
  commandId?: string;
  name: string;
  descriptionKey: string;
  icon: string;
  source: SlashCommandSource;
  skillId?: string;
  pluginId?: string;
  descriptionKind: SlashCommandDescriptionKind;
}

export interface SkillInvocationCatalogItem {
  id: string;
  skillName: string;
  name: string;
  descriptionKey: string;
  icon: string;
  source: SkillInvocationSource;
  enabled: boolean;
  descriptionKind: SlashCommandDescriptionKind;
}

export interface AgentComposerInputCatalog {
  readonly commands: readonly SlashCommandCatalogItem[];
  readonly skills: readonly SkillInvocationCatalogItem[];
}

export function resolveAgentInputInvocationIntent(input: {
  readonly trigger: ParsedAgentInputTrigger & { readonly trigger: 'command' | 'skill' };
  readonly entries: readonly AgentInputCatalogEntry[];
  readonly phase: AgentInteractionPhase;
  readonly bindingKind: AgentBindingKind;
}): AgentInputInvocationIntent {
  const entry = input.entries.find(
    (candidate) =>
      candidate.trigger === input.trigger.trigger &&
      candidate.name.toLowerCase() === input.trigger.name,
  );
  if (!entry) {
    throw new Error(
      `Agent input '${input.trigger.prefix}${input.trigger.name}' is unknown or stale.`,
    );
  }
  if (entry.availability.status === 'unavailable') {
    const diagnostic = entry.availability.diagnostic;
    throw new Error(`[${diagnostic.owner}/${diagnostic.code}] ${diagnostic.message}`);
  }
  if (
    !isAgentInputCatalogEntryExecutable({
      entry,
      phase: input.phase,
      bindingKind: input.bindingKind,
    })
  ) {
    throw new Error(
      `Agent input '${input.trigger.prefix}${input.trigger.name}' is unavailable for this ${input.phase} binding.`,
    );
  }
  if (entry.trigger === 'command') {
    return {
      kind: 'command',
      catalogEntryId: entry.id,
      commandId: entry.executable.commandId,
      handlerId: entry.executable.handlerId,
      ...(input.trigger.args === undefined ? {} : { args: input.trigger.args }),
    };
  }
  if (entry.trigger !== 'skill') {
    throw new Error(
      `Agent input '${input.trigger.prefix}${input.trigger.name}' is not executable.`,
    );
  }
  return {
    kind: 'skill',
    catalogEntryId: entry.id,
    skillName: entry.executable.skillName,
    activationId: entry.executable.activationId,
    ...(input.trigger.args === undefined ? {} : { args: input.trigger.args }),
  };
}

export type SlashCommandTranslateFn = (key: string) => string;

const SLASH_COMMAND_SOURCE_LABELS: Record<SlashCommandSource, string | null> = {
  builtin: null,
  'command-artifact': 'command',
  plugin: 'plugin',
};

export function projectAgentComposerInputCatalog(input: {
  readonly entries: readonly AgentInputCatalogEntry[];
  readonly phase: AgentInteractionPhase;
  readonly bindingKind: AgentBindingKind;
}): AgentComposerInputCatalog {
  const executable = input.entries.filter((entry) =>
    isAgentInputCatalogEntryExecutable({
      entry,
      phase: input.phase,
      bindingKind: input.bindingKind,
    }),
  );
  return {
    commands: executable.flatMap((entry): readonly SlashCommandCatalogItem[] => {
      if (entry.trigger !== 'command') return [];
      return [
        {
          id: entry.id,
          commandId: entry.executable.commandId,
          name: `/${entry.name}`,
          descriptionKey: entry.description,
          icon: entry.icon ?? '⌨️',
          source: projectCommandSource(entry),
          ...(entry.source.kind === 'plugin' ? { pluginId: entry.source.pluginId } : {}),
          descriptionKind: 'literal',
        },
      ];
    }),
    skills: executable.flatMap((entry): readonly SkillInvocationCatalogItem[] => {
      if (entry.trigger !== 'skill') return [];
      return [
        {
          id: entry.id,
          skillName: entry.executable.skillName,
          name: `$${entry.name}`,
          descriptionKey: entry.description,
          icon: entry.icon ?? '🔧',
          source: projectSkillSource(entry),
          enabled: true,
          descriptionKind: 'literal',
        },
      ];
    }),
  };
}

export function resolveSlashCommandDescription(
  command: Pick<SlashCommandCatalogItem, 'descriptionKey' | 'descriptionKind'>,
  translate: SlashCommandTranslateFn,
): string {
  return command.descriptionKind === 'i18n'
    ? translate(command.descriptionKey)
    : command.descriptionKey;
}

export function resolveSlashCommandSourceLabel(
  command: Pick<SlashCommandCatalogItem, 'source'>,
): string | null {
  return SLASH_COMMAND_SOURCE_LABELS[command.source];
}

export function resolveSkillInvocationSourceLabel(
  command: Pick<SkillInvocationCatalogItem, 'source'>,
): string | null {
  return command.source;
}

export function filterSlashCommands(
  commands: readonly SlashCommandCatalogItem[],
  filter: string,
  translate: SlashCommandTranslateFn,
): SlashCommandCatalogItem[] {
  const normalizedFilter = normalizeSlashCommandName(filter);
  if (!normalizedFilter) {
    return [...commands];
  }

  return commands.filter((command) => {
    const nameMatch = normalizeSlashCommandName(command.name).includes(normalizedFilter);
    const description = resolveSlashCommandDescription(command, translate).toLowerCase();
    return nameMatch || description.includes(normalizedFilter);
  });
}

export function filterSkillInvocations(
  commands: readonly SkillInvocationCatalogItem[],
  filter: string,
  translate: SlashCommandTranslateFn,
): SkillInvocationCatalogItem[] {
  const normalizedFilter = normalizeSlashCommandName(filter);
  if (!normalizedFilter) {
    return [...commands];
  }

  return commands.filter((command) => {
    const nameMatch = normalizeSlashCommandName(command.name).includes(normalizedFilter);
    const skillNameMatch = normalizeSlashCommandName(command.skillName).includes(normalizedFilter);
    const description = resolveSlashCommandDescription(command, translate).toLowerCase();
    return nameMatch || skillNameMatch || description.includes(normalizedFilter);
  });
}

export function extractSlashCommandArgs(
  inputValue: string,
  command: Pick<SlashCommandCatalogItem, 'name' | 'commandId' | 'id'>,
): string | undefined {
  const trimmed = inputValue.trim();
  if (!trimmed.startsWith('/')) {
    return undefined;
  }

  const withoutPrefix = trimmed.slice(1);
  const separatorIndex = withoutPrefix.search(/\s/);
  const typedCommand =
    separatorIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, Math.max(separatorIndex, 0));
  const normalizedTypedCommand = normalizeSlashCommandName(typedCommand);
  const acceptedCommands = new Set([
    normalizeSlashCommandName(command.name),
    normalizeSlashCommandName(command.commandId ?? command.id),
  ]);

  if (!acceptedCommands.has(normalizedTypedCommand)) {
    return undefined;
  }

  if (separatorIndex === -1) {
    return undefined;
  }

  const args = withoutPrefix.slice(separatorIndex + 1).trim();
  return args.length > 0 ? args : undefined;
}

function projectCommandSource(
  entry: Extract<AgentInputCatalogEntry, { readonly trigger: 'command' }>,
): SlashCommandSource {
  if (entry.source.kind === 'builtin' || entry.source.kind === 'plugin') {
    return entry.source.kind;
  }
  return 'command-artifact';
}

function projectSkillSource(
  entry: Extract<AgentInputCatalogEntry, { readonly trigger: 'skill' }>,
): SkillInvocationSource {
  switch (entry.source.kind) {
    case 'builtin':
      return 'builtin';
    case 'personal':
      return 'user';
    case 'project':
    case 'command-artifact':
      return 'project';
    case 'plugin':
      return 'community';
  }
}
