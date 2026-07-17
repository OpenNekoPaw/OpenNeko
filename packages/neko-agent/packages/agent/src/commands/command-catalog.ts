import type { BuiltinCommand, BuiltinCommandName } from './types';
import { getBuiltinCommand, getCliCommands, getExtensionCommands } from './builtin-commands';

export type SlashCommandSurface = 'tui' | 'extension';

export interface SlashCommandSkillLike {
  readonly name?: string;
  readonly description?: string;
  readonly entryPointKind?: 'skill' | 'command-artifact';
  readonly command?: string;
  readonly enabled?: boolean;
  readonly supportsArguments?: boolean;
  readonly argumentHint?: string;
}

export type SlashCommandCatalogEntry<TSkill extends SlashCommandSkillLike = SlashCommandSkillLike> =
  | {
      readonly source: 'builtin';
      readonly name: BuiltinCommandName;
      readonly description: string;
      readonly aliases: readonly string[];
      readonly usage?: string;
      readonly category: BuiltinCommand['category'];
      readonly builtin: BuiltinCommand;
    }
  | {
      readonly source: 'command-artifact';
      readonly name: string;
      readonly description?: string;
      readonly aliases: readonly string[];
      readonly category: 'command-artifact';
      readonly supportsArguments: boolean;
      readonly argumentHint?: string;
      readonly skill: TSkill;
    };

export function listSlashCommandCatalog<TSkill extends SlashCommandSkillLike>(options: {
  readonly surface: SlashCommandSurface;
  readonly skills?: readonly TSkill[];
}): SlashCommandCatalogEntry<TSkill>[] {
  const entries = new Map<string, SlashCommandCatalogEntry<TSkill>>();

  for (const builtin of getBuiltinCommandsForSurface(options.surface)) {
    entries.set(builtin.name, {
      source: 'builtin',
      name: builtin.name,
      description: builtin.description,
      aliases: builtin.aliases ?? [],
      ...(builtin.usage ? { usage: builtin.usage } : {}),
      category: builtin.category,
      builtin,
    });
  }

  for (const skill of options.skills ?? []) {
    const commandName = normalizeSkillCommand(skill.command);
    if (
      !commandName ||
      !isSlashCommandArtifact(skill) ||
      skill.enabled === false ||
      entries.has(commandName)
    ) {
      continue;
    }

    const description = readNonEmptyDescription(skill.description);
    entries.set(commandName, {
      source: 'command-artifact',
      name: commandName,
      ...(description ? { description } : {}),
      aliases: [],
      category: 'command-artifact',
      supportsArguments: skill.supportsArguments ?? false,
      ...(skill.argumentHint ? { argumentHint: skill.argumentHint } : {}),
      skill,
    });
  }

  return Array.from(entries.values());
}

export function resolveSlashCommandCatalogEntry<TSkill extends SlashCommandSkillLike>(
  name: string,
  options: {
    readonly surface: SlashCommandSurface;
    readonly skills?: readonly TSkill[];
  },
): SlashCommandCatalogEntry<TSkill> | undefined {
  const normalized = normalizeCommandName(name);
  if (!normalized) {
    return undefined;
  }

  const builtin = getBuiltinCommand(normalized);
  if (builtin && isBuiltinAvailableOnSurface(builtin, options.surface)) {
    return {
      source: 'builtin',
      name: builtin.name,
      description: builtin.description,
      aliases: builtin.aliases ?? [],
      ...(builtin.usage ? { usage: builtin.usage } : {}),
      category: builtin.category,
      builtin,
    };
  }

  for (const skill of options.skills ?? []) {
    const commandName = normalizeSkillCommand(skill.command);
    if (!commandName || !isSlashCommandArtifact(skill) || skill.enabled === false) {
      continue;
    }
    if (commandName !== normalized) {
      continue;
    }

    const description = readNonEmptyDescription(skill.description);
    return {
      source: 'command-artifact',
      name: commandName,
      ...(description ? { description } : {}),
      aliases: [],
      category: 'command-artifact',
      supportsArguments: skill.supportsArguments ?? false,
      ...(skill.argumentHint ? { argumentHint: skill.argumentHint } : {}),
      skill,
    };
  }

  return undefined;
}

function readNonEmptyDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  return trimmed && trimmed.length > 0 ? description : undefined;
}

export function coerceSlashCommandSkills(
  skills: readonly unknown[] | undefined,
): SlashCommandSkillLike[] {
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills.filter(isSlashCommandSkillLike);
}

function getBuiltinCommandsForSurface(surface: SlashCommandSurface): readonly BuiltinCommand[] {
  return surface === 'tui' ? getCliCommands() : getExtensionCommands();
}

function isBuiltinAvailableOnSurface(
  builtin: BuiltinCommand,
  surface: SlashCommandSurface,
): boolean {
  return surface === 'tui' ? builtin.availableInCli : builtin.availableInExtension;
}

function normalizeCommandName(name: string): string {
  return name.trim().replace(/^\//, '').toLowerCase();
}

function normalizeSkillCommand(command?: string): string | null {
  if (!command) {
    return null;
  }

  const normalized = normalizeCommandName(command);
  return normalized.length > 0 ? normalized : null;
}

function isSlashCommandArtifact(skill: SlashCommandSkillLike): boolean {
  return skill.entryPointKind === 'command-artifact';
}

function isSlashCommandSkillLike(value: unknown): value is SlashCommandSkillLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate['entryPointKind'] === undefined ||
      candidate['entryPointKind'] === 'skill' ||
      candidate['entryPointKind'] === 'command-artifact') &&
    (candidate['command'] === undefined || typeof candidate['command'] === 'string') &&
    (candidate['description'] === undefined || typeof candidate['description'] === 'string') &&
    (candidate['enabled'] === undefined || typeof candidate['enabled'] === 'boolean')
  );
}
